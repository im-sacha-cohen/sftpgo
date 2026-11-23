import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Search } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, Input, type Column, type SortState } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import type { BaseVirtualFolder } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatNumber } from '@/lib/format';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { useFolders, useGroupsByFolder } from './api';
import { dict, type FoldersKey } from './i18n';
import { providerIcon, storageSummary } from './model';
import './folders.css';

export default function FoldersPage() {
  const t = useT(dict);
  const tc = useCommon();
  const { lang } = useLang();
  const navigate = useNavigate();
  const { can } = useAuth();
  const allowed = can('manage_folders');
  const folders = useFolders(allowed);
  const groups = useGroupsByFolder(allowed && can('manage_groups'));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>({ id: 'name', dir: 'asc' });

  useCommands(
    allowed ? [{ id: 'folders:new', label: t('newFolderCmd'), group: t('title'), icon: Plus, run: () => navigate('/folders/new') }] : [],
  );

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = (folders.data ?? []).filter(
      (f) =>
        !n ||
        (f.name ?? '').toLowerCase().includes(n) ||
        (f.description ?? '').toLowerCase().includes(n) ||
        storageSummary(f).toLowerCase().includes(n) ||
        (f.users ?? []).some((u) => u.toLowerCase().includes(n)),
    );
    const dir = sort?.dir === 'desc' ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sort?.id === 'usage') return ((a.used_quota_size ?? 0) - (b.used_quota_size ?? 0)) * dir;
      if (sort?.id === 'used') return ((a.users ?? []).length - (b.users ?? []).length) * dir;
      return (a.name ?? '').localeCompare(b.name ?? '') * dir;
    });
  }, [folders.data, q, sort]);

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('accounts') }]} />
        <EmptyState icon={FolderOpen} title={tc('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }

  const totalSize = (folders.data ?? []).reduce((s, f) => s + (f.used_quota_size ?? 0), 0);

  const columns: Column<BaseVirtualFolder>[] = [
    {
      id: 'name',
      header: t('colName'),
      sortable: true,
      cell: (f) => (
        <div className="fld-namecell">
          <Link className="fld-name" to={`/folders/${encodeURIComponent(f.name ?? '')}`} onClick={(e) => e.stopPropagation()}>
            {f.name}
          </Link>
          {f.description && <span className="fld-desc">{f.description}</span>}
        </div>
      ),
    },
    {
      id: 'storage',
      header: t('colStorage'),
      cell: (f) => {
        const Icon = providerIcon(f.filesystem?.provider);
        return (
          <span className="fld-storagecell">
            <Badge icon={Icon}>{t(`p${f.filesystem?.provider ?? 0}` as FoldersKey)}</Badge>
            <span className="fld-path">{storageSummary(f)}</span>
          </span>
        );
      },
    },
    {
      id: 'usage',
      header: t('colUsage'),
      sortable: true,
      align: 'right',
      width: 150,
      cell: (f) => (
        <span className="fld-usage">
          <span className="mono">{formatBytes(f.used_quota_size ?? 0, lang)}</span>
          <span className="fld-muted">{t('files', { n: formatNumber(f.used_quota_files ?? 0, lang) })}</span>
        </span>
      ),
    },
    {
      id: 'used',
      header: t('colUsedBy'),
      sortable: true,
      width: 260,
      cell: (f) => {
        const users = f.users ?? [];
        const grps = groups.data?.get(f.name ?? '') ?? [];
        if (!users.length && !grps.length) return <span className="fld-muted">{t('notUsed')}</span>;
        return (
          <span className="fld-chips">
            {users.slice(0, 2).map((u) => (
              <Badge key={`u-${u}`} mono>
                {u}
              </Badge>
            ))}
            {users.length > 2 && <Badge>+{users.length - 2}</Badge>}
            {grps.slice(0, 2).map((g) => (
              <Badge key={`g-${g}`} tone="accent" mono>
                {g}
              </Badge>
            ))}
            {grps.length > 2 && <Badge tone="accent">+{grps.length - 2}</Badge>}
          </span>
        );
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('accounts') }]}
        subtitle={folders.data ? t('subtitle', { n: folders.data.length, size: formatBytes(totalSize, lang) }) : undefined}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => navigate('/folders/new')}>
            {t('newFolder')}
          </Button>
        }
      />
      {folders.error ? (
        <EmptyState
          icon={FolderOpen}
          title={t('loadError')}
          description={(folders.error as Error).message}
          action={<Button onClick={() => folders.refetch()}>{tc('retry')}</Button>}
        />
      ) : !folders.isLoading && !(folders.data ?? []).length ? (
        <EmptyState
          icon={FolderOpen}
          title={t('noFolders')}
          description={t('noFoldersHint')}
          action={
            <Button variant="primary" icon={Plus} onClick={() => navigate('/folders/new')}>
              {t('newFolder')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="fld-toolbar">
            <Input
              aria-label={tc('search')}
              placeholder={t('search')}
              prefix={<Search size={15} aria-hidden="true" />}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(f) => f.name ?? ''}
            loading={folders.isLoading}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(f) => navigate(`/folders/${encodeURIComponent(f.name ?? '')}`)}
            empty={<EmptyState compact icon={Search} title={t('noMatch')} />}
          />
        </>
      )}
    </Page>
  );
}
