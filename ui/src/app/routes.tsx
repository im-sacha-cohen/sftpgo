import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, type RouteObject } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { withReload } from '@/lib/chunks';
import { Shell } from './Shell';
import { LayoutProvider } from './layout-context';
import { adminNav } from './nav';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import RouteError from '@/pages/RouteError';

function page(loader: () => Promise<{ default: ComponentType }>) {
  const C = lazy(withReload(loader));
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
    // The server refused the token (expired, revoked, server restarted): there is
    // no session left to show the re-auth modal over, so go to the sign-in page
    // and come back here afterwards. (A token reaching its end while the page is
    // open keeps the session and shows the re-auth modal from the Shell.)
    void expired;
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
  { path: 'user-files', element: page(() => import('@/pages/userfiles/UserFilesPage')) },
  { path: 'user-files/:username/*', element: page(() => import('@/pages/userfiles/UserFilesPage')) },
  { path: 'groups', element: page(() => import('@/pages/groups/GroupsPage')) },
  { path: 'groups/:name', element: page(() => import('@/pages/groups/GroupPage')) },
  { path: 'admins', element: page(() => import('@/pages/admins/AdminsPage')) },
  { path: 'admins/:username', element: page(() => import('@/pages/admins/AdminPage')) },
  { path: 'roles', element: page(() => import('@/pages/roles/RolesPage')) },
  { path: 'apikeys', element: page(() => import('@/pages/apikeys/ApiKeysPage')) },
  { path: 'spaces', element: page(() => import('@/pages/spaces/SpacesPage')) },
  { path: 'spaces/:name', element: page(() => import('@/pages/spaces/SpacesPage')) },
  { path: 'folders', element: page(() => import('@/pages/folders/FoldersPage')) },
  { path: 'folders/:name', element: page(() => import('@/pages/folders/FolderPage')) },
  { path: 'folders/:name/files/*', element: page(() => import('@/pages/folders/FolderFilesPage')) },
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
    { path: '/dev/components', element: page(() => import('@/pages/dev/ComponentsDemo')), errorElement: <RouteError /> },
    {
      path: '/',
      errorElement: <RouteError />,
      element: (
        <RequireSession>
          <LayoutProvider>
            <Shell />
          </LayoutProvider>
        </RequireSession>
      ),
      children: [
        { index: true, element: <HomeRedirect /> },
        { element: <RequireSession kind="admin"><OutletPassthrough /></RequireSession>, errorElement: <RouteError />, children: adminRoutes },
        { element: <RequireSession kind="user"><OutletPassthrough /></RequireSession>, errorElement: <RouteError />, children: userRoutes },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: config.consoleBase },
);

function OutletPassthrough() {
  return <Outlet />;
}
