import { Plus, X } from 'lucide-react';
import { Button, IconButton, Input, MultiSelect, SegmentedControl, Select } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { EventTriggerTypes, Schedule } from '@/api/types';
import { dict, type RulesKey } from './i18n';
import {
  FS_EVENTS,
  PROTOCOLS,
  PROVIDER_EVENTS,
  PROVIDER_OBJECTS,
  TRIGGERS,
  presetSchedule,
  schedulePreset,
  type RuleDraft,
  type SchedulePreset,
} from './model';

interface Props {
  draft: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
  errors: { events?: string };
}

const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }));
const DOM = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export function TriggerBlock({ draft, onChange, errors }: Props) {
  const t = useT(dict);
  const days = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: t(`day${d}` as RulesKey) }));

  return (
    <div className="rules-trigger">
      <Select
        label={t('triggerLabel')}
        className="rules-trigger__select"
        value={String(draft.trigger)}
        onChange={(v) => onChange({ trigger: Number(v) as EventTriggerTypes })}
        options={TRIGGERS.map((x) => ({
          value: String(x.type),
          label: t(`trig_${x.key}` as RulesKey),
          description: t(`trigd_${x.key}` as RulesKey),
          icon: x.icon,
        }))}
      />

      {draft.trigger === 1 && (
        <div className="rules-sentence">
          <span className="rules-sentence__word">{t('aFileIs')}</span>
          <MultiSelect
            aria-label={t('trig_fs')}
            className="rules-sentence__ctl rules-sentence__ctl--wide"
            size="sm"
            placeholder={t('chooseEvents')}
            values={draft.fs_events}
            onChange={(v) => onChange({ fs_events: v })}
            error={errors.events}
            options={FS_EVENTS.map((e) => ({ value: e, label: t(`ev_${e}` as RulesKey) }))}
          />
          <span className="rules-sentence__word">{t('via')}</span>
          <MultiSelect
            aria-label={t('via')}
            className="rules-sentence__ctl"
            size="sm"
            placeholder={t('anyProtocol')}
            values={draft.protocols}
            onChange={(v) => onChange({ protocols: v })}
            options={PROTOCOLS.map((p) => ({ value: p, label: t(`proto_${p}` as RulesKey) }))}
          />
        </div>
      )}

      {draft.trigger === 2 && (
        <div className="rules-sentence">
          <span className="rules-sentence__word">{t('anObject')}</span>
          <MultiSelect
            aria-label={t('anObject')}
            className="rules-sentence__ctl"
            size="sm"
            placeholder={t('anyObject')}
            values={draft.provider_objects}
            onChange={(v) => onChange({ provider_objects: v })}
            options={PROVIDER_OBJECTS.map((o) => ({ value: o, label: t(`obj_${o}` as RulesKey) }))}
          />
          <span className="rules-sentence__word">{t('is')}</span>
          <MultiSelect
            aria-label={t('trig_provider')}
            className="rules-sentence__ctl"
            size="sm"
            placeholder={t('chooseEvents')}
            values={draft.provider_events}
            onChange={(v) => onChange({ provider_events: v })}
            error={errors.events}
            options={PROVIDER_EVENTS.map((e) => ({ value: e, label: t(`pev_${e}` as RulesKey) }))}
          />
        </div>
      )}

      {draft.trigger === 3 && (
        <div className="rules-schedules">
          {draft.schedules.map((s, i) => (
            <ScheduleRow
              key={i}
              schedule={s}
              days={days}
              canRemove={draft.schedules.length > 1}
              onChange={(ns) => onChange({ schedules: draft.schedules.map((x, j) => (j === i ? ns : x)) })}
              onRemove={() => onChange({ schedules: draft.schedules.filter((_, j) => j !== i) })}
            />
          ))}
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() =>
                onChange({ schedules: [...draft.schedules, { hour: '8', day_of_week: '1', day_of_month: '*', month: '*' }] })
              }
            >
              {t('addSchedule')}
            </Button>
          </div>
        </div>
      )}

      {draft.trigger === 4 && <p className="rules-text">{t('ipBlockedText')}</p>}
      {draft.trigger === 5 && <p className="rules-text">{t('certificateText')}</p>}
      {draft.trigger === 6 && <p className="rules-text">{t('onDemandText')}</p>}
      {draft.trigger === 7 && (
        <div className="rules-sentence">
          <span className="rules-sentence__word">{t('idpText')}</span>
          <SegmentedControl
            size="sm"
            value={String(draft.idp_login_event)}
            onChange={(v) => onChange({ idp_login_event: Number(v) as 0 | 1 | 2 })}
            options={[0, 1, 2].map((n) => ({ value: String(n), label: t(`idp_${n}` as RulesKey) }))}
          />
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  schedule,
  days,
  canRemove,
  onChange,
  onRemove,
}: {
  schedule: Schedule;
  days: { value: string; label: string }[];
  canRemove: boolean;
  onChange: (s: Schedule) => void;
  onRemove: () => void;
}) {
  const t = useT(dict);
  const preset = schedulePreset(schedule);
  const presets: SchedulePreset[] = ['daily', 'weekly', 'monthly', 'hourly', 'custom'];
  return (
    <div className="rules-schedule">
      <div className="rules-sentence">
        <Select
          aria-label={t('trig_schedule')}
          size="sm"
          className="rules-sentence__ctl"
          value={preset}
          onChange={(p) => onChange(presetSchedule(p, schedule))}
          options={presets.map((p) => ({ value: p, label: t(`preset_${p}` as RulesKey) }))}
        />
        {preset === 'weekly' && (
          <>
            <span className="rules-sentence__word">{t('on')}</span>
            <Select
              aria-label={t('dayOfWeek')}
              size="sm"
              className="rules-sentence__ctl"
              value={schedule.day_of_week ?? '1'}
              onChange={(v) => onChange({ ...schedule, day_of_week: v })}
              options={days}
            />
          </>
        )}
        {preset === 'monthly' && (
          <>
            <span className="rules-sentence__word">{t('onDay')}</span>
            <Select
              aria-label={t('dayOfMonth')}
              size="sm"
              className="rules-sentence__ctl rules-sentence__ctl--xs"
              value={schedule.day_of_month ?? '1'}
              onChange={(v) => onChange({ ...schedule, day_of_month: v })}
              options={DOM}
            />
            <span className="rules-sentence__word">{t('ofMonth')}</span>
          </>
        )}
        {(preset === 'daily' || preset === 'weekly' || preset === 'monthly') && (
          <>
            <span className="rules-sentence__word">{t('at')}</span>
            <Select
              aria-label={t('hour')}
              size="sm"
              mono
              className="rules-sentence__ctl rules-sentence__ctl--xs"
              value={schedule.hour ?? '0'}
              onChange={(v) => onChange({ ...schedule, hour: v })}
              options={HOURS}
            />
          </>
        )}
        {canRemove && <IconButton icon={X} size="sm" label={t('removeSchedule')} onClick={onRemove} className="rules-schedule__remove" />}
      </div>
      {preset === 'custom' && (
        <div className="rules-cron">
          <Input size="sm" mono label={t('hour')} value={schedule.hour ?? ''} onChange={(e) => onChange({ ...schedule, hour: e.target.value })} />
          <Input
            size="sm"
            mono
            label={t('dayOfMonth')}
            value={schedule.day_of_month ?? ''}
            onChange={(e) => onChange({ ...schedule, day_of_month: e.target.value })}
          />
          <Input size="sm" mono label={t('month')} value={schedule.month ?? ''} onChange={(e) => onChange({ ...schedule, month: e.target.value })} />
          <Input
            size="sm"
            mono
            label={t('dayOfWeek')}
            hint={t('dowHint')}
            value={schedule.day_of_week ?? ''}
            onChange={(e) => onChange({ ...schedule, day_of_week: e.target.value })}
          />
          <p className="rules-hint">{t('cronHint')}</p>
        </div>
      )}
    </div>
  );
}
