import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Trash2, Workflow } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Menu,
  SaveBar,
  Skeleton,
  StatusDot,
  useConfirm,
  useToast,
} from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { api, ApiError } from '@/api/client';
import type { BaseEventAction } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { useCommon, useT } from '@/lib/i18n';
import { dict as rulesDict } from '@/pages/rules/i18n';
import { describeTrigger } from '@/pages/rules/describe';
import { useEventRules, enc } from './api';
import { ActionEditor } from './ActionEditor';
import { dict, type ActionsKey } from './i18n';
import { actionFromDraft, actionTypeInfo, countActionChanges, emptyActionDraft, toActionDraft, type ActionDraft } from './model';
import './actions.css';

export default function ActionPage() {
  const { name = 'new' } = useParams();
  const isNew = name === 'new';
  const t = useT(dict);
  const tr = useT(rulesDict);
  const tc = useCommon();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const allowed = can('manage_event_rules');

  const query = useQuery({
    queryKey: ['eventactions', name],
    queryFn: ({ signal }) => api.get<BaseEventAction>(`/eventactions/${enc(name)}`, undefined, signal),
    enabled: allowed && !isNew,
  });
  const rulesQuery = useEventRules(allowed && !isNew);

  const [initial, setInitial] = useState<ActionDraft>(() => emptyActionDraft());
  const [draft, setDraft] = useState<ActionDraft>(() => emptyActionDraft());
  const [nameError, setNameError] = useState<string>();

  useEffect(() => {
    if (isNew) {
      const d = emptyActionDraft();
      setInitial(d);
      setDraft(d);
    } else if (query.data) {
      const d = toActionDraft(query.data);
      setInitial(d);
      setDraft(d);
    }
  }, [isNew, query.data]);

  const changes = useMemo(() => (isNew ? 0 : countActionChanges(initial, draft)), [initial, draft, isNew]);
  const dirty = isNew ? draft.name.trim() !== '' : changes > 0;

  const save = useMutation({
    mutationFn: async () => {
      const body = actionFromDraft(draft);
      if (isNew) return api.post<BaseEventAction>('/eventactions', body);
      return api.put(`/eventactions/${enc(name)}`, body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['eventactions'] });
      await qc.invalidateQueries({ queryKey: ['eventrules'] });
      toast({ title: isNew ? t('created') : tc('saved'), tone: 'ok' });
      if (isNew) navigate(`/actions/${enc(draft.name.trim())}`, { replace: true });
      else setInitial(draft);
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/eventactions/${enc(name)}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['eventactions'] });
      toast({ title: tc('deleted'), tone: 'ok' });
      navigate('/actions');
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const usedBy = query.data?.rules ?? [];

  const onSave = () => {
    if (!draft.name.trim()) {
      setNameError(t('nameRequired'));
      return;
    }
    setNameError(undefined);
    save.mutate();
  };

  const onDelete = async () => {
    if (usedBy.length) {
      toast({ title: t('deleteAction'), description: t('deleteInUse', { n: usedBy.length }), tone: 'warn' });
      return;
    }
    if (await confirm({ title: tc('confirmDelete', { name }), message: tc('confirmDeleteMsg'), confirmLabel: tc('delete'), danger: true }))
      remove.mutate();
  };

  useCommands(
    allowed && !isNew ? [{ id: 'action:delete', label: t('deleteAction'), group: name, icon: Trash2, run: onDelete }] : [],
  );

  const info = actionTypeInfo(draft.type);
  const TypeIcon = info.icon;
  const crumbs = [{ label: t('automation') }, { label: t('title'), to: '/actions' }];

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={crumbs} />
        <EmptyState icon={Workflow} title={tc('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }

  if (!isNew && query.error) {
    const nf = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page>
        <PageHeader title={name} crumbs={crumbs} />
        <EmptyState
          icon={Workflow}
          title={nf ? tc('notFound') : t('loadError')}
          description={nf ? t('notFound', { name }) : (query.error as Error).message}
          action={<Button onClick={() => navigate('/actions')}>{tc('back')}</Button>}
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title={isNew ? t('newAction') : name}
        docTitle={isNew ? t('newAction') : name}
        crumbs={crumbs}
        leading={
          <span className="act-type" aria-hidden="true">
            <TypeIcon size={22} />
          </span>
        }
        subtitle={
          isNew ? undefined : (
            <>
              {t(`t_${info.key}` as ActionsKey)}
              {draft.description ? ` · ${draft.description}` : ''}
            </>
          )
        }
        actions={
          <>
            {!isNew && (
              <Menu
                aria-label={tc('more')}
                placement="bottom-end"
                items={[{ label: t('deleteAction'), icon: Trash2, danger: true, onSelect: onDelete }]}
                trigger={<IconButton icon={MoreHorizontal} label={tc('more')} variant="secondary" />}
              />
            )}
          </>
        }
      />
      {!isNew && query.isLoading ? (
        <Skeleton height={420} />
      ) : (
        <div className="act-page-body">
          <ActionEditor draft={draft} onChange={setDraft} isNew={isNew} nameError={nameError} />
          {!isNew && (
            <Card title={t('rulesUsing')} actions={usedBy.length ? <Badge>{usedBy.length}</Badge> : undefined}>
              {usedBy.length ? (
                <div className="act-rules">
                  {usedBy.map((r) => {
                    const rule = rulesQuery.data?.find((x) => x.name === r);
                    return (
                      <Link key={r} to={`/rules/${enc(r)}`}>
                        <StatusDot
                          tone={rule?.status === 0 ? 'neutral' : 'ok'}
                          label={rule?.status === 0 ? tr('inactive') : tr('active')}
                          hideLabel
                        />
                        <span className="act-name">{r}</span>
                        {rule && <span className="act-rules__trigger">{describeTrigger(rule, tr)}</span>}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="act-muted">{t('noRulesUsing')}</p>
              )}
            </Card>
          )}
        </div>
      )}
      <SaveBar
        dirtyCount={isNew ? (dirty ? 1 : 0) : changes}
        message={isNew ? t('unsavedNew') : t('unsaved', { n: changes })}
        cancelLabel={tc('cancel')}
        saveLabel={isNew ? tc('create') : tc('save')}
        onCancel={() => (isNew ? navigate('/actions') : setDraft(initial))}
        onSave={onSave}
        saving={save.isPending}
      />
    </Page>
  );
}
