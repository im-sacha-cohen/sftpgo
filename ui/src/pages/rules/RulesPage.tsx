import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, Workflow, Zap } from 'lucide-react';
import { Button, EmptyState, Input, Skeleton, StatusDot, useConfirm } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { useAuth } from '@/lib/auth';
import { useCommon, useT } from '@/lib/i18n';
import type { EventRule } from '@/api/types';
import { useEventActions, useEventRules } from '@/pages/actions/api';
import { describeTrigger } from './describe';
import { dict } from './i18n';
import { triggerInfo } from './model';
import { RuleEditor } from './RuleEditor';
import './rules.css';

export default function RulesPage() {
  const { name } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT(dict);
  const tc = useCommon();
  const confirm = useConfirm();
  const { can } = useAuth();
  const allowed = can('manage_event_rules');
  const rules = useEventRules(allowed);
  const actions = useEventActions(allowed);
  const [q, setQ] = useState('');
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  const go = useCallback(
    async (to: string) => {
      if (dirtyRef.current) {
        const ok = await confirm({ title: t('discardTitle'), message: t('discardMsg'), confirmLabel: t('discard'), danger: true });
        if (!ok) return;
        dirtyRef.current = false;
      }
      navigate(to);
    },
    [confirm, navigate, t],
  );

  useCommands(
    allowed ? [{ id: 'rules:new', label: t('newRuleCmd'), group: t('title'), icon: Plus, run: () => go('/rules/new') }] : [],
  );

  const list = useMemo(
    () => [...(rules.data ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [rules.data],
  );
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return list;
    return list.filter(
      (r) =>
        (r.name ?? '').toLowerCase().includes(n) ||
        (r.description ?? '').toLowerCase().includes(n) ||
        describeTrigger(r, t).toLowerCase().includes(n),
    );
  }, [list, q, t]);

  // On wide screens, open the first rule when none is selected.
  useEffect(() => {
    if (name || !list.length) return;
    if (window.matchMedia('(min-width: 960px)').matches) navigate(`/rules/${encodeURIComponent(list[0].name ?? '')}`, { replace: true });
  }, [name, list, navigate]);

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('automation') }]} />
        <EmptyState icon={Workflow} title={tc('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }

  const isNew = name === 'new';
  const selected: EventRule | undefined = name && !isNew ? list.find((r) => r.name === name) : undefined;
  const copyName = (location.state as { copyOf?: string } | null)?.copyOf;
  const copyOf = isNew && copyName ? list.find((r) => r.name === copyName) : undefined;
  const active = list.filter((r) => r.status === 1).length;
  const subtitle = rules.data
    ? list.length === 1
      ? t('subtitleOne', { active })
      : t('subtitle', { n: list.length, active })
    : undefined;

  const loading = rules.isLoading || actions.isLoading;

  let editor: JSX.Element;
  if (loading) editor = <Skeleton height={520} />;
  else if (rules.error)
    editor = (
      <EmptyState
        icon={Workflow}
        title={t('loadError')}
        description={(rules.error as Error).message}
        action={<Button onClick={() => rules.refetch()}>{tc('retry')}</Button>}
      />
    );
  else if (isNew)
    editor = (
      <RuleEditor key={`new:${copyName ?? ''}`} copyOf={copyOf} actions={actions.data ?? []} onDirtyChange={onDirtyChange} />
    );
  else if (name && !selected)
    editor = (
      <EmptyState
        icon={Workflow}
        title={tc('notFound')}
        description={t('notFound', { name })}
        action={<Button onClick={() => navigate('/rules')}>{t('backToList')}</Button>}
      />
    );
  else if (selected)
    editor = <RuleEditor key={selected.name} rule={selected} actions={actions.data ?? []} onDirtyChange={onDirtyChange} />;
  else
    editor = list.length ? (
      <EmptyState icon={Zap} title={t('selectRule')} description={t('selectRuleHint')} />
    ) : (
      <EmptyState
        icon={Zap}
        title={t('noRules')}
        description={t('noRulesHint')}
        action={
          <Button variant="primary" icon={Plus} onClick={() => go('/rules/new')}>
            {t('newRule')}
          </Button>
        }
      />
    );

  return (
    <Page wide>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('automation') }]}
        subtitle={subtitle}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => go('/rules/new')}>
            {t('newRule')}
          </Button>
        }
      />
      <div className={['rules-split', name ? 'has-selection' : '', !loading && !list.length ? 'is-empty' : ''].join(' ')}>
        <aside className="rules-list" aria-label={t('title')}>
          {list.length > 4 && (
            <Input
              aria-label={tc('search')}
              size="sm"
              placeholder={t('searchRules')}
              prefix={<Search size={14} aria-hidden="true" />}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          {loading ? (
            <>
              <Skeleton height={68} />
              <Skeleton height={68} />
              <Skeleton height={68} />
            </>
          ) : filtered.length === 0 && list.length > 0 ? (
            <p className="rules-text rules-text--muted">{t('noMatch')}</p>
          ) : (
            <ul className="rules-cards">
              {isNew && (
                <li>
                  <div className="rules-card is-selected is-draft">
                    <span className="rules-card__name">{t('untitled')}</span>
                  </div>
                </li>
              )}
              {filtered.map((r) => {
                const Icon = triggerInfo(r.trigger).icon;
                const sel = r.name === name;
                return (
                  <li key={r.name}>
                    <button
                      type="button"
                      className={sel ? 'rules-card is-selected' : 'rules-card'}
                      aria-current={sel ? 'true' : undefined}
                      onClick={() => !sel && go(`/rules/${encodeURIComponent(r.name ?? '')}`)}
                    >
                      <span className="rules-card__top">
                        <StatusDot tone={r.status === 1 ? 'ok' : 'neutral'} label={r.status === 1 ? t('active') : t('inactive')} hideLabel />
                        <span className="rules-card__name">{r.name}</span>
                      </span>
                      <span className="rules-card__trigger">
                        <Icon size={13} aria-hidden="true" />
                        <span>{describeTrigger(r, t)}</span>
                      </span>
                      {r.description && <span className="rules-card__desc">{r.description}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
        <div className="rules-main">{editor}</div>
      </div>
    </Page>
  );
}
