import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Copy, MoreHorizontal, Play, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, Menu, SaveBar, Switch, useConfirm, useHotkey, useToast } from '@/components/ui';
import { useCommands } from '@/app/layout-context';
import { api } from '@/api/client';
import type { BaseEventAction, EventRule } from '@/api/types';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { formatRelative } from '@/lib/format';
import { ConditionsBlock } from './ConditionsBlock';
import { dict } from './i18n';
import { countRuleChanges, emptyRuleDraft, ruleFromDraft, toRuleDraft, triggerInfo, type RuleDraft } from './model';
import { StepsBlock } from './StepsBlock';
import { TriggerBlock } from './TriggerBlock';

interface Props {
  /** Existing rule, or undefined for a new one. */
  rule?: EventRule;
  /** Rule to copy when creating (duplicate). */
  copyOf?: EventRule;
  actions: BaseEventAction[];
  onDirtyChange: (dirty: boolean) => void;
}

const enc = encodeURIComponent;

export function RuleEditor({ rule, copyOf, actions, onDirtyChange }: Props) {
  const isNew = !rule;
  const t = useT(dict);
  const tc = useCommon();
  const { lang } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const makeInitial = (): RuleDraft => {
    if (rule) return toRuleDraft(rule);
    if (copyOf) return { ...toRuleDraft(copyOf), name: `${copyOf.name}${t('copySuffix')}` };
    return emptyRuleDraft();
  };
  const [initial, setInitial] = useState<RuleDraft>(makeInitial);
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [errors, setErrors] = useState<{ name?: string; events?: string; steps?: string }>({});

  // Refresh from the server when the stored rule changes and there is no local edit.
  const ruleKey = rule ? `${rule.name}:${rule.updated_at}` : '';
  useEffect(() => {
    if (!rule) return;
    const fresh = toRuleDraft(rule);
    setInitial(fresh);
    setDraft((d) => (countRuleChanges(initial, d) === 0 ? fresh : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleKey]);

  const changes = useMemo(() => (isNew ? 0 : countRuleChanges(initial, draft)), [initial, draft, isNew]);
  const dirty = isNew ? true : changes > 0;
  useEffect(() => onDirtyChange(isNew ? draft.name.trim() !== '' || draft.steps.length > 0 : changes > 0), [isNew, draft, changes, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const patch = (p: Partial<RuleDraft>) => setDraft((d) => ({ ...d, ...p }));

  const save = useMutation({
    mutationFn: async () => {
      const body = ruleFromDraft(draft);
      if (isNew) return api.post<EventRule>('/eventrules', body);
      return api.put(`/eventrules/${enc(rule!.name ?? '')}`, body);
    },
    onSuccess: async () => {
      setInitial(draft);
      onDirtyChange(false);
      await qc.invalidateQueries({ queryKey: ['eventrules'] });
      await qc.invalidateQueries({ queryKey: ['eventactions'] });
      toast({ title: isNew ? t('created') : tc('saved'), tone: 'ok' });
      if (isNew) navigate(`/rules/${enc(draft.name.trim())}`, { replace: true });
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const run = useMutation({
    mutationFn: () => api.post(`/eventrules/run/${enc(rule!.name ?? '')}`),
    onSuccess: () => toast({ title: t('runStarted'), description: rule?.name, tone: 'ok' }),
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/eventrules/${enc(rule!.name ?? '')}`),
    onSuccess: async () => {
      onDirtyChange(false);
      await qc.invalidateQueries({ queryKey: ['eventrules'] });
      await qc.invalidateQueries({ queryKey: ['eventactions'] });
      toast({ title: tc('deleted'), tone: 'ok' });
      navigate('/rules', { replace: true });
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('nameRequired');
    if (draft.trigger === 1 && !draft.fs_events.length) e.events = t('fsEventRequired');
    if (draft.trigger === 2 && !draft.provider_events.length) e.events = t('providerEventRequired');
    if (!draft.steps.length) e.steps = t('actionsRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const onSave = () => {
    if (validate()) save.mutate();
  };
  const onRun = () => {
    if (changes > 0) {
      toast({ title: t('runDirty'), tone: 'warn' });
      return;
    }
    run.mutate();
  };
  const onDelete = async () => {
    if (!rule) return;
    if (await confirm({ title: tc('confirmDelete', { name: rule.name ?? '' }), message: tc('confirmDeleteMsg'), confirmLabel: tc('delete'), danger: true }))
      remove.mutate();
  };
  const onDuplicate = () => rule && navigate('/rules/new', { state: { copyOf: rule.name } });

  useHotkey('mod+s', () => !save.isPending && onSave(), { allowInInputs: true, enabled: isNew });

  const isOnDemand = draft.trigger === 6 && !isNew && initial.trigger === 6;

  useCommands(
    rule
      ? [
          ...(isOnDemand ? [{ id: 'rule:run', label: `${t('runNow')} · ${rule.name}`, group: t('title'), icon: Play, run: onRun }] : []),
          { id: 'rule:duplicate', label: `${t('duplicate')} · ${rule.name}`, group: t('title'), icon: Copy, run: onDuplicate },
          { id: 'rule:delete', label: `${t('deleteRule')} · ${rule.name}`, group: t('title'), icon: Trash2, run: onDelete },
        ]
      : [],
  );

  const TrigIcon = triggerInfo(draft.trigger).icon;

  return (
    <div className="rules-editor">
      <div className="rules-editor__head">
        <IconButton icon={ChevronLeft} label={t('backToList')} className="rules-editor__back" onClick={() => navigate('/rules')} />
        <span className="rules-editor__trig" aria-hidden="true">
          <TrigIcon size={18} />
        </span>
        <Input
          aria-label={tc('name')}
          wrapperClassName="rules-editor__name"
          mono
          required
          value={draft.name}
          placeholder={t('namePh')}
          disabled={!isNew}
          error={errors.name}
          autoFocus={isNew}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <Switch
          checked={draft.status === 1}
          onChange={(c) => patch({ status: c ? 1 : 0 })}
          label={draft.status === 1 ? t('active') : t('inactive')}
        />
        {rule && (
          <Menu
            aria-label={tc('more')}
            placement="bottom-end"
            items={[
              { label: t('duplicate'), icon: Copy, onSelect: onDuplicate },
              'separator',
              { label: t('deleteRule'), icon: Trash2, danger: true, onSelect: onDelete },
            ]}
            trigger={<IconButton icon={MoreHorizontal} label={tc('more')} />}
          />
        )}
      </div>
      <Input
        aria-label={tc('description')}
        wrapperClassName="rules-editor__desc"
        value={draft.description}
        placeholder={t('descriptionPh')}
        onChange={(e) => patch({ description: e.target.value })}
      />
      {rule?.updated_at ? <p className="rules-editor__meta">{t('lastUpdate', { when: formatRelative(rule.updated_at, lang) })}</p> : null}

      <section className="rules-block rules-block--when" aria-label={t('when')}>
        <h3 className="rules-block__label">{t('when')}</h3>
        <TriggerBlock draft={draft} onChange={patch} errors={errors} />
      </section>

      <section className="rules-block rules-block--if" aria-label={t('if')}>
        <h3 className="rules-block__label">{t('if')}</h3>
        <ConditionsBlock draft={draft} onChange={patch} />
      </section>

      <section className="rules-block rules-block--then" aria-label={t('then')}>
        <h3 className="rules-block__label">{t('then')}</h3>
        <StepsBlock draft={draft} onChange={patch} actions={actions} ruleName={rule?.name ?? ''} error={errors.steps} />
      </section>

      <div className="rules-editor__foot">
        {isOnDemand && (
          <Button icon={Play} onClick={onRun} loading={run.isPending}>
            {t('runNow')}
          </Button>
        )}
        <span className="rules-editor__spacer" />
        {isNew && (
          <Button variant="ghost" onClick={() => navigate('/rules')}>
            {tc('cancel')}
          </Button>
        )}
        <Button variant="primary" onClick={onSave} loading={save.isPending} disabled={!dirty} kbd="mod+s">
          {isNew ? tc('create') : tc('save')}
        </Button>
      </div>

      {!isNew && (
        <SaveBar
          dirtyCount={changes}
          message={t('unsaved', { n: changes })}
          cancelLabel={tc('cancel')}
          saveLabel={tc('save')}
          onCancel={() => setDraft(initial)}
          onSave={onSave}
          saving={save.isPending && changes > 0}
        />
      )}
    </div>
  );
}
