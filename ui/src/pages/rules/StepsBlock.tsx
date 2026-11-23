import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, Plus, TriangleAlert, X } from 'lucide-react';
import { Badge, Button, Checkbox, Drawer, IconButton, Menu, Tooltip, useToast, type MenuItem } from '@/components/ui';
import { api } from '@/api/client';
import type { BaseEventAction } from '@/api/types';
import { useCommon, useT } from '@/lib/i18n';
import { ActionEditor } from '@/pages/actions/ActionEditor';
import { dict as actionsDict, type ActionsKey } from '@/pages/actions/i18n';
import { actionFromDraft, actionTarget, actionTypeInfo, emptyActionDraft, NOT_FOR_IP_CERT, type ActionDraft } from '@/pages/actions/model';
import { VarText } from '@/pages/actions/VarField';
import { dict } from './i18n';
import { SYNC_ALLOWED_EVENTS, SYNC_REQUIRED_EVENTS, type RuleDraft, type StepDraft } from './model';

interface Props {
  draft: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
  actions: BaseEventAction[];
  /** Rule name being edited: used to compute "shared with N rules" without counting itself twice. */
  ruleName: string;
  error?: string;
}

export function StepsBlock({ draft, onChange, actions, ruleName, error }: Props) {
  const t = useT(dict);
  const ta = useT(actionsDict);
  const tc = useCommon();
  const toast = useToast();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState(false);
  const [newAction, setNewAction] = useState<ActionDraft>(() => emptyActionDraft(3));
  const [newNameError, setNewNameError] = useState<string>();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const byName = useMemo(() => new Map(actions.map((a) => [a.name ?? '', a])), [actions]);
  const steps = draft.steps;
  const setSteps = (s: StepDraft[]) => onChange({ steps: s });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setSteps(next);
  };

  const syncPossible =
    draft.trigger === 7 || (draft.trigger === 1 && draft.fs_events.length > 0 && draft.fs_events.every((e) => SYNC_ALLOWED_EVENTS.includes(e)));
  const needsSync = draft.trigger === 1 && draft.fs_events.some((e) => SYNC_REQUIRED_EVENTS.includes(e));
  const hasSync = steps.some((s) => s.options.execute_sync);

  const addStep = (name: string) =>
    setSteps([...steps, { name, options: { is_failure_action: false, stop_on_failure: false, execute_sync: false } }]);

  const available = actions.filter((a) => !steps.some((s) => s.name === a.name));
  const menuItems: MenuItem[] = [
    ...available.map((a) => {
      const info = actionTypeInfo(a.type);
      return {
        label: (
          <span className="rules-addmenu__item">
            <span className="mono">{a.name}</span>
            <span className="rules-addmenu__type">{ta(`t_${info.key}` as ActionsKey)}</span>
          </span>
        ),
        textValue: a.name,
        icon: info.icon,
        onSelect: () => addStep(a.name ?? ''),
      };
    }),
    ...(available.length ? (['separator'] as MenuItem[]) : []),
    {
      label: t('createAction'),
      icon: Plus,
      onSelect: () => {
        setNewAction(emptyActionDraft(3));
        setNewNameError(undefined);
        setDrawer(true);
      },
    },
  ];

  const create = useMutation({
    mutationFn: () => api.post<BaseEventAction>('/eventactions', actionFromDraft(newAction)),
    onSuccess: async () => {
      const n = newAction.name.trim();
      await qc.invalidateQueries({ queryKey: ['eventactions'] });
      addStep(n);
      setDrawer(false);
      toast({ title: t('actionCreated', { name: n }), tone: 'ok' });
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const onDragStart = (i: number) => (e: DragEvent) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  };
  const onDragOver = (i: number) => (e: DragEvent) => {
    if (dragIndex === null) return;
    e.preventDefault();
    setOverIndex(i);
  };
  const onDrop = (i: number) => (e: DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null) move(dragIndex, i);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="rules-steps">
      {steps.length === 0 && <p className={error ? 'rules-text rules-text--bad' : 'rules-text rules-text--muted'}>{error ?? t('noSteps')}</p>}
      <ol className="rules-steps__list">
        {steps.map((s, i) => {
          const a = byName.get(s.name);
          const info = actionTypeInfo(a?.type);
          const Icon = info.icon;
          const otherRules = (a?.rules ?? []).filter((r) => r !== ruleName).length;
          const sharedCount = otherRules + 1;
          const incompatible = (draft.trigger === 4 || draft.trigger === 5) && a && NOT_FOR_IP_CERT.includes(a.type ?? 0);
          const setOpt = (patch: Partial<StepDraft['options']>) =>
            setSteps(steps.map((x, j) => (j === i ? { ...x, options: { ...x.options, ...patch } } : x)));
          return (
            <li
              key={s.name}
              className={[
                'rules-step',
                dragIndex === i ? 'is-dragging' : '',
                overIndex === i && dragIndex !== i ? 'is-over' : '',
                s.options.is_failure_action ? 'is-failure' : '',
              ].join(' ')}
              onDragOver={onDragOver(i)}
              onDrop={onDrop(i)}
              onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
            >
              <Tooltip content={t('dragHint')}>
                <span
                  className="rules-step__grip"
                  draggable
                  onDragStart={onDragStart(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  aria-hidden="true"
                >
                  <GripVertical size={15} />
                </span>
              </Tooltip>
              <span className="rules-step__num mono">{i + 1}</span>
              <span className="rules-step__icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <div className="rules-step__main">
                <div className="rules-step__title">
                  {a ? (
                    <Link to={`/actions/${encodeURIComponent(s.name)}`} className="rules-step__name">
                      {s.name}
                    </Link>
                  ) : (
                    <span className="rules-step__name">{s.name}</span>
                  )}
                  <span className="rules-step__type">{a ? ta(`t_${info.key}` as ActionsKey) : t('missingAction')}</span>
                  {sharedCount > 1 && <Badge tone="accent">{t('sharedAction', { n: sharedCount })}</Badge>}
                  {incompatible && (
                    <Badge tone="bad" icon={TriangleAlert}>
                      {t('notForTrigger')}
                    </Badge>
                  )}
                </div>
                {a && actionTarget(a) && <VarText className="rules-step__target" text={actionTarget(a)} />}
                <div className="rules-step__opts">
                  <Tooltip content={t('failureActionHint')}>
                    <span>
                      <Checkbox
                        checked={s.options.is_failure_action}
                        onChange={(c) => setOpt({ is_failure_action: c, ...(c ? { execute_sync: false } : {}) })}
                        label={t('failureAction')}
                      />
                    </span>
                  </Tooltip>
                  <Tooltip content={t('stopOnFailureHint')}>
                    <span>
                      <Checkbox checked={s.options.stop_on_failure} onChange={(c) => setOpt({ stop_on_failure: c })} label={t('stopOnFailure')} />
                    </span>
                  </Tooltip>
                  {(syncPossible || s.options.execute_sync) && (
                    <Tooltip content={t('executeSyncHint')}>
                      <span>
                        <Checkbox
                          checked={s.options.execute_sync}
                          disabled={s.options.is_failure_action}
                          onChange={(c) => setOpt({ execute_sync: c })}
                          label={t('executeSync')}
                        />
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className="rules-step__tools">
                <IconButton icon={ArrowUp} size="sm" label={t('moveUp')} disabled={i === 0} onClick={() => move(i, i - 1)} />
                <IconButton icon={ArrowDown} size="sm" label={t('moveDown')} disabled={i === steps.length - 1} onClick={() => move(i, i + 1)} />
                <IconButton icon={X} size="sm" label={t('removeStep')} onClick={() => setSteps(steps.filter((_, j) => j !== i))} />
              </div>
            </li>
          );
        })}
      </ol>
      {needsSync && !hasSync && (
        <p className="rules-text rules-text--warn">
          <TriangleAlert size={14} aria-hidden="true" /> {t('syncRequired')}
        </p>
      )}
      <div>
        <Menu
          aria-label={t('addAction')}
          minWidth={280}
          className="rules-addmenu"
          items={menuItems}
          trigger={
            <Button size="sm" variant="ghost" icon={Plus}>
              {t('addAction')}
            </Button>
          }
        />
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title={t('newActionTitle')}
        size="lg"
        closeLabel={tc('close')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawer(false)}>
              {tc('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={create.isPending}
              onClick={() => {
                if (!newAction.name.trim()) {
                  setNewNameError(ta('nameRequired'));
                  return;
                }
                create.mutate();
              }}
            >
              {t('createAndAdd')}
            </Button>
          </>
        }
      >
        <ActionEditor draft={newAction} onChange={setNewAction} isNew nameError={newNameError} compact />
      </Drawer>
    </div>
  );
}
