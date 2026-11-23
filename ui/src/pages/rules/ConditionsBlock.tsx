import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, IconButton, Input, MultiSelect, NumberInput, Select, Switch } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict, type RulesKey } from './i18n';
import { fieldsForTrigger, rowId, type CondField, type CondOp, type CondRow, type RuleDraft } from './model';

interface Props {
  draft: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
}

const SINGLE: CondField[] = ['status', 'min_size', 'max_size'];

export function ConditionsBlock({ draft, onChange }: Props) {
  const t = useT(dict);
  const fields = fieldsForTrigger(draft.trigger);
  const rows = draft.conditions.filter((r) => fields.includes(r.field));
  const used = new Set(rows.map((r) => r.field));

  const setRows = (next: CondRow[]) => {
    // keep rows of fields hidden by the current trigger, so switching back restores them
    const hidden = draft.conditions.filter((r) => !fields.includes(r.field));
    onChange({ conditions: [...next, ...hidden] });
  };
  const update = (id: string, patch: Partial<CondRow>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const add = () => {
    const field = fields.find((f) => !SINGLE.includes(f) || !used.has(f)) ?? fields[0];
    setRows([...rows, newRow(field)]);
  };

  if (!fields.length) return <p className="rules-text rules-text--muted">{t('noConditionTrigger')}</p>;

  const fieldLabel = (f: CondField) => {
    if (f === 'min_size') return `${t('f_min_size')} ${t('op_gte')}`;
    if (f === 'max_size') return `${t('f_max_size')} ${t('op_lte')}`;
    return t(`f_${f}` as RulesKey);
  };

  return (
    <div className="rules-conds">
      {rows.length === 0 && <p className="rules-text rules-text--muted">{t('noCondition')}</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="rules-cond">
          <span className="rules-cond__kw">{i === 0 ? t('condIf') : t('condAnd')}</span>
          <Select
            aria-label={t('addCondition')}
            size="sm"
            className="rules-cond__field"
            value={r.field}
            onChange={(f) => update(r.id, { ...newRow(f), id: r.id })}
            options={fields.map((f) => ({
              value: f,
              label: fieldLabel(f),
              disabled: f !== r.field && SINGLE.includes(f) && used.has(f),
            }))}
          />
          <CondValue row={r} onChange={(p) => update(r.id, p)} />
          <IconButton icon={X} size="sm" label={t('removeCondition')} onClick={() => setRows(rows.filter((x) => x.id !== r.id))} />
        </div>
      ))}
      <div className="rules-conds__foot">
        <Button size="sm" variant="ghost" icon={Plus} onClick={add}>
          {t('addCondition')}
        </Button>
        {rows.some((r) => ['name', 'group', 'role', 'path'].includes(r.field)) && <span className="rules-hint">{t('patternHint')}</span>}
      </div>
      {draft.trigger !== 6 && (
        <Switch
          size="sm"
          checked={draft.concurrent_execution}
          onChange={(c) => onChange({ concurrent_execution: c })}
          label={t('concurrent')}
          description={t('concurrentHint')}
        />
      )}
    </div>
  );
}

function newRow(field: CondField): CondRow {
  if (field === 'status') return { id: rowId(), field, op: 'match', value: '', statuses: [2] };
  if (field === 'min_size' || field === 'max_size') return { id: rowId(), field, op: 'match', value: String(1024 * 1024) };
  return { id: rowId(), field, op: 'match', value: '' };
}

function CondValue({ row, onChange }: { row: CondRow; onChange: (p: Partial<CondRow>) => void }) {
  const t = useT(dict);
  if (row.field === 'status') {
    return (
      <>
        <span className="rules-cond__op">{t('op_in')}</span>
        <MultiSelect
          aria-label={t('f_status')}
          size="sm"
          className="rules-cond__value"
          values={(row.statuses ?? []).map(String)}
          onChange={(v) => onChange({ statuses: v.map(Number) })}
          options={[1, 2, 3].map((s) => ({ value: String(s), label: t(`st_${s}` as RulesKey) }))}
        />
      </>
    );
  }
  if (row.field === 'min_size' || row.field === 'max_size') {
    return <SizeInput bytes={Number(row.value) || 0} onChange={(b) => onChange({ value: String(b) })} />;
  }
  const placeholders: Record<string, string> = {
    path: '/in/factures/**',
    name: 'partenaire-*',
    group: 'comptabilite',
    role: 'support',
  };
  return (
    <>
      <Select
        aria-label={t('op_match')}
        size="sm"
        className="rules-cond__opsel"
        value={row.op}
        onChange={(op) => onChange({ op: op as CondOp })}
        options={[
          { value: 'match', label: t('op_match') },
          { value: 'notMatch', label: t('op_notMatch') },
        ]}
      />
      <Input
        aria-label={t(`f_${row.field}` as RulesKey)}
        size="sm"
        mono
        wrapperClassName="rules-cond__value"
        placeholder={placeholders[row.field]}
        value={row.value}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </>
  );
}

const UNITS = [
  { key: 'unitG', mul: 1024 ** 3 },
  { key: 'unitM', mul: 1024 ** 2 },
  { key: 'unitK', mul: 1024 },
  { key: 'unitB', mul: 1 },
] as const;

function SizeInput({ bytes, onChange }: { bytes: number; onChange: (b: number) => void }) {
  const t = useT(dict);
  const initial = UNITS.find((u) => bytes >= u.mul && bytes % u.mul === 0) ?? UNITS[3];
  const [mul, setMul] = useState<number>(initial.mul);
  const value = bytes ? bytes / mul : null;
  return (
    <div className="rules-size rules-cond__value">
      <NumberInput
        aria-label={t('f_min_size')}
        size="sm"
        min={0}
        value={value}
        precision={mul === 1 ? 0 : 2}
        onChange={(v) => onChange(Math.round((v ?? 0) * mul))}
      />
      <Select
        aria-label={t('f_min_size')}
        size="sm"
        value={String(mul)}
        onChange={(m) => {
          const nm = Number(m);
          setMul(nm);
          if (value !== null) onChange(Math.round(value * nm));
        }}
        options={UNITS.map((u) => ({ value: String(u.mul), label: t(u.key) }))}
      />
    </div>
  );
}
