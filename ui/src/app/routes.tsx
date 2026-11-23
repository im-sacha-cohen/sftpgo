import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, type RouteObject } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { Shell } from './Shell';
import { LayoutProvider } from './layout-context';
import { adminNav } from './nav';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';

function page(loader: () => Promise<{ default: ComponentType }>) {
  const C = lazy(loader);
  return (
    <Suspense
      fallback={
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      }
    >
      <C />
    </Suspense>
  );
}

function RequireSession({ kind, children }: { kind?: 'admin' | 'user'; children: ReactNode }) {
  const { session, expired } = useAuth();
  const location = useLocation();
  if (!session) {
    // Keep the page mounted behind the re-auth modal when the token just expired.
    if (expired) return null;
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (kind && session.kind !== kind) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { session, can } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.kind === 'user') return <Navigate to="/files" replace />;
  // Land on the first screen of the menu this admin is allowed to see.
  const first = adminNav.flatMap((g) => g.items).find((i) => !i.perms || i.perms.some((p) => can(p)));
  return <Navigate to={first?.to ?? '/profile'} replace />;
}

const adminRoutes: RouteObject[] = [
  { path: 'overview', element: page(() => import('@/pages/overview/OverviewPage')) },
  { path: 'connections', element: page(() => import('@/pages/connections/ConnectionsPage')) },
  { path: 'events', element: page(() => import('@/pages/events/EventsPage')) },
  { path: 'users', element: page(() => import('@/pages/users/UsersPage')) },
  { path: 'users/:username', element: page(() => import('@/pages/users/UserPage')) },
  { path: 'groups', element: page(() => import('@/pages/groups/GroupsPage')) },
  { path: 'groups/:name', element: page(() => import('@/pages/groups/GroupPage')) },
  { path: 'admins', element: page(() => import('@/pages/admins/AdminsPage')) },
  { path: 'admins/:username', element: page(() => import('@/pages/admins/AdminPage')) },
  { path: 'roles', element: page(() => import('@/pages/roles/RolesPage')) },
  { path: 'apikeys', element: page(() => import('@/pages/apikeys/ApiKeysPage')) },
  { path: 'folders', element: page(() => import('@/pages/folders/FoldersPage')) },
  { path: 'folders/:name', element: page(() => import('@/pages/folders/FolderPage')) },
  { path: 'rules', element: page(() => import('@/pages/rules/RulesPage')) },
  { path: 'rules/:name', element: page(() => import('@/pages/rules/RulesPage')) },
  { path: 'actions', element: page(() => import('@/pages/actions/ActionsPage')) },
  { path: 'actions/:name', element: page(() => import('@/pages/actions/ActionPage')) },
  { path: 'defender', element: page(() => import('@/pages/defender/DefenderPage')) },
  { path: 'iplists', element: page(() => import('@/pages/iplists/IpListsPage')) },
  { path: 'maintenance', element: page(() => import('@/pages/maintenance/MaintenancePage')) },
  { path: 'settings', element: page(() => import('@/pages/settings/ServerSettingsPage')) },
  { path: 'profile', element: page(() => import('@/pages/profile/ProfilePage')) },
];

const userRoutes: RouteObject[] = [
  { path: 'files/*', element: page(() => import('@/pages/client/FilesPage')) },
  { path: 'shares', element: page(() => import('@/pages/client/SharesPage')) },
  { path: 'shares/:id', element: page(() => import('@/pages/client/SharePage')) },
  { path: 'account', element: page(() => import('@/pages/client/AccountPage')) },
];

export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    { path: '/dev/components', element: page(() => import('@/pages/dev/ComponentsDemo')) },
    {
      path: '/',
      element: (
        <RequireSession>
          <LayoutProvider>
            <Shell />
          </LayoutProvider>
        </RequireSession>
      ),
      children: [
        { index: true, element: <HomeRedirect /> },
        { element: <RequireSession kind="admin"><OutletPassthrough /></RequireSession>, children: adminRoutes },
        { element: <RequireSession kind="user"><OutletPassthrough /></RequireSession>, children: userRoutes },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: config.consoleBase },
);

function OutletPassthrough() {
  return <Outlet />;
}
