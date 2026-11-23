import type { EventRule, Schedule } from '@/api/types';
import type { RulesKey } from './i18n';
import { pad2, schedulePreset } from './model';

type T = (key: RulesKey, vars?: Record<string, string | number>) => string;

export function describeSchedule(s: Schedule, t: T): string {
  const h = pad2(s.hour);
  switch (schedulePreset(s)) {
    case 'hourly':
      return t('sumHourly');
    case 'daily':
      return t('sumDaily', { h });
    case 'weekly':
      return t('sumWeekly', { d: t(`day${s.day_of_week}` as RulesKey), h });
    case 'monthly':
      return t('sumMonthly', { n: s.day_of_month ?? '1', h });
    default:
      return t('sumCustom', { c: `0 ${s.hour} ${s.day_of_month} ${s.month} ${s.day_of_week}` });
  }
}

/** Plain-language summary of a rule trigger: "Dépôt · /in/factures/**", "Tous les jours à 02:00"… */
export function describeTrigger(rule: EventRule, t: T): string {
  const c = rule.conditions ?? {};
  const o = c.options ?? {};
  switch (rule.trigger) {
    case 1: {
      const ev = (c.fs_events ?? []).map((e) => t(`evs_${e}` as RulesKey)).join(', ') || t('trig_fs');
      const paths = (o.fs_paths ?? []).map((p) => (p.inverse_match ? `!${p.pattern}` : p.pattern)).join(', ');
      return paths ? t('sumFs', { ev, path: paths }) : t('sumFsAny', { ev });
    }
    case 2: {
      const objs = (o.provider_objects ?? []).map((x) => t(`obj_${x}` as RulesKey)).join(', ');
      const ev = (c.provider_events ?? []).map((e) => t(`pev_${e}` as RulesKey)).join(', ');
      const obj = objs ? objs.charAt(0).toUpperCase() + objs.slice(1) : t('allObjects');
      return t('sumProvider', { obj, ev });
    }
    case 3:
      return (c.schedules ?? []).map((s) => describeSchedule(s, t)).join(' · ') || t('trig_schedule');
    case 4:
      return t('sumIp');
    case 5:
      return t('sumCert');
    case 6:
      return t('sumOnDemand');
    case 7:
      return t('sumIdp', { who: t(`idp_${c.idp_login_event ?? 0}` as RulesKey) });
    default:
      return '';
  }
}
