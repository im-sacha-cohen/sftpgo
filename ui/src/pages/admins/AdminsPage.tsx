import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserCog } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, StatusDot } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { api } from '@/api/client';
import type { Admin } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import { useLang, useT } from '@/lib/i18n';
import { dict } from './shared';
import './admins.css';

export default function AdminsPage() {
  const t = useT(dict);
  const { lang } = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const allowed = can('*');

  useCommands(allowed ? [{ id: 'admins:new', label: t('add'), group: t('title'), icon: Plus, run: () => navigate('/admins/new') }] : []);

  const admins = useQuery({ queryKey: ['admins'], queryFn: () => api.get<Admin[]>('/admins', { limit: 500 }), enabled: allowed });

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={UserCog} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const list = admins.data ?? [];
  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('crumb') }]}
        subtitle={admins.data ? t('subtitle', { n: list.length }) : undefined}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => navigate('/admins/new')}>
            {t('add')}
          </Button>
        }
      />
      <DataTable<Admin>
        rows={list}
        rowKey={(a) => a.username ?? ''}
        loading={admins.isLoading}
        onRowClick={(a) => navigate(`/admins/${encodeURIComponent(a.username ?? '')}`)}
        empty={<EmptyState icon={UserCog} title={t('emptyTitle')} />}
        columns={[
          {
            id: 'user',
            header: t('username'),
            cell: (a) => (
              <span className="admins-name">
                <span className="mono">{a.username}</span>
                {(a.email || a.description) && <span className="muted">{a.email || a.description}</span>}
              </span>
            ),
          },
          { id: 'role', header: t('role'), cell: (a) => (a.role ? <Badge mono>{a.role}</Badge> : <span className="muted">—</span>) },
          {
            id: 'perms',
            header: t('permissions'),
            cell: (a) =>
              a.permissions?.includes('*') ? (
                <Badge tone="accent">{t('superAdmin')}</Badge>
              ) : (
                <span className="muted">{t('nPerms', { n: a.permissions?.length ?? 0 })}</span>
              ),
          },
          {
            id: '2fa',
            header: t('twofa'),
            cell: (a) => (a.filters?.totp_config?.enabled ? <Badge tone="ok">{t('on')}</Badge> : <span className="muted">{t('off')}</span>),
          },
          { id: 'last', header: t('lastLogin'), cell: (a) => <span className="muted">{formatRelative(a.last_login, lang)}</span> },
          {
            id: 'status',
            header: t('status'),
            cell: (a) => <StatusDot tone={a.status === 1 ? 'ok' : 'bad'} label={a.status === 1 ? t('active') : t('disabled')} />,
          },
        ]}
      />
    </Page>
  );
}
