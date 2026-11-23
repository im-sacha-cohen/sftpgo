import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Workflow } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, Input, Select, type Column } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { useAuth } from '@/lib/auth';
import { useCommon, useT } from '@/lib/i18n';
import type { BaseEventAction } from '@/api/types';
import { useEventActions } from './api';
import { dict, type ActionsKey } from './i18n';
import { ACTION_TYPES, actionTarget, actionTypeInfo } from './model';
import { VarText } from './VarField';
import './actions.css';

export default function ActionsPage() {
  const t = useT(dict);
  const tc = useCommon();
  const navigate = useNavigate();
  const { can } = useAuth();
  const allowed = can('manage_event_rules');
  const { data, isLoading, error, refetch } = useEventActions(allowed);
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>('all');

  useCommands(
    allowed
      ? [{ id: 'actions:new', label: t('newActionCmd'), group: t('title'), icon: Plus, run: () => navigate('/actions/new') }]
      : [],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? [])
      .filter((a) => type === 'all' || String(a.type) === type)
      .filter(
        (a) =>
          !needle ||
          (a.name ?? '').toLowerCase().includes(needle) ||
          (a.description ?? '').toLowerCase().includes(needle) ||
          actionTarget(a).toLowerCase().includes(needle),
      )
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [data, q, type]);

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('automation') }]} />
        <EmptyState icon={Workflow} title={tc('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }

  const unused = (data ?? []).filter((a) => !(a.rules ?? []).length).length;
  const typesPresent = ACTION_TYPES.filter((x) => (data ?? []).some((a) => a.type === x.type));

  const columns: Column<BaseEventAction>[] = [
    {
      id: 'type',
      header: t('colType'),
      width: 170,
      cell: (a) => {
        const info = actionTypeInfo(a.type);
        const Icon = info.icon;
        return (
          <span className="act-type">
            <Icon size={15} aria-hidden="true" />
            {t(`t_${info.key}` as ActionsKey)}
          </span>
        );
      },
    },
    {
      id: 'name',
      header: t('colName'),
      cell: (a) => (
        <div>
          <Link className="act-name" to={`/actions/${encodeURIComponent(a.name ?? '')}`} onClick={(e) => e.stopPropagation()}>
            {a.name}
          </Link>
          {a.description && <div className="act-desc">{a.description}</div>}
        </div>
      ),
    },
    {
      id: 'target',
      header: t('colTarget'),
      cell: (a) => <VarText className="act-target" text={actionTarget(a)} />,
    },
    {
      id: 'used',
      header: t('colUsedBy'),
      width: 220,
      cell: (a) =>
        (a.rules ?? []).length ? (
          <span className="act-usedby">
            {(a.rules ?? []).slice(0, 2).map((r) => (
              <Badge key={r} mono>
                {r}
              </Badge>
            ))}
            {(a.rules ?? []).length > 2 && <Badge>+{(a.rules ?? []).length - 2}</Badge>}
          </span>
        ) : (
          <span className="act-muted">{t('unused')}</span>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('automation') }]}
        subtitle={data ? t('subtitle', { n: data.length, unused }) : undefined}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => navigate('/actions/new')}>
            {t('newAction')}
          </Button>
        }
      />
      {error ? (
        <EmptyState
          icon={Workflow}
          title={t('loadError')}
          description={(error as Error).message}
          action={<Button onClick={() => refetch()}>{tc('retry')}</Button>}
        />
      ) : !isLoading && !(data ?? []).length ? (
        <EmptyState
          icon={Workflow}
          title={t('noActions')}
          description={t('noActionsHint')}
          action={
            <Button variant="primary" icon={Plus} onClick={() => navigate('/actions/new')}>
              {t('newAction')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="act-toolbar">
            <Input
              aria-label={tc('search')}
              placeholder={t('search')}
              prefix={<Search size={15} aria-hidden="true" />}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Select
              aria-label={t('colType')}
              value={type}
              onChange={setType}
              options={[
                { value: 'all', label: t('allTypes') },
                ...typesPresent.map((x) => ({ value: String(x.type), label: t(`t_${x.key}` as ActionsKey), icon: x.icon })),
              ]}
            />
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(a) => a.name ?? ''}
            loading={isLoading}
            onRowClick={(a) => navigate(`/actions/${encodeURIComponent(a.name ?? '')}`)}
            empty={<EmptyState icon={Search} title={t('noMatch')} />}
          />
        </>
      )}
    </Page>
  );
}
