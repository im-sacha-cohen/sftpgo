import { useRef, type ReactNode } from 'react';
import { Braces, Plus, X } from 'lucide-react';
import { Button, IconButton, Input, Menu, Textarea, type InputProps, type MenuItem, type TextareaProps } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { dict } from './i18n';
import { splitVariables, variableLabel, VARIABLES } from './vars';
import type { KeyValue } from '@/api/types';
import './actions.css';

/** Read-only text where `{{.X}}` placeholders render as chips ("nom du fichier"). */
export function VarText({ text, className }: { text: string | undefined; className?: string }) {
  const { lang } = useLang();
  if (!text) return null;
  return (
    <span className={className ? `act-vartext ${className}` : 'act-vartext'}>
      {splitVariables(text).map((p, i) =>
        p.token ? (
          <span key={i} className="act-varchip" data-token={p.text}>
            {variableLabel(p.text, lang) ?? p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

/** "Insérer une variable" menu. */
export function InsertVarMenu({ onInsert, disabled }: { onInsert: (token: string) => void; disabled?: boolean }) {
  const t = useT(dict);
  const { lang } = useLang();
  const groups = ['file', 'user', 'event', 'object', 'date'] as const;
  const items: MenuItem[] = [];
  groups.forEach((g, gi) => {
    if (gi > 0) items.push('separator');
    VARIABLES.filter((v) => v.group === g).forEach((v) =>
      items.push({
        label: (
          <span className="act-varitem">
            <span>{lang === 'en' ? v.en : v.fr}</span>
            <code className="mono">{v.token.slice(3, -2)}</code>
          </span>
        ),
        textValue: lang === 'en' ? v.en : v.fr,
        onSelect: () => onInsert(v.token),
      }),
    );
  });
  return (
    <Menu
      aria-label={t('insertVar')}
      placement="bottom-end"
      minWidth={300}
      className="act-varmenu"
      items={items}
      trigger={<IconButton icon={Braces} label={t('insertVar')} size="sm" disabled={disabled} />}
    />
  );
}

function insertAt(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, token: string) {
  if (!el) return { next: value + token, caret: value.length + token.length };
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  return { next: value.slice(0, start) + token + value.slice(end), caret: start + token.length };
}

type VarInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  value: string | undefined;
  onChange: (v: string) => void;
  /** Show a read-only rendering with variable chips under the field. */
  preview?: boolean;
};

const hasVar = (v: string) => /\{\{\s*\.[A-Za-z0-9_]+\s*\}\}/.test(v);

/** Text input with an "insert variable" menu that inserts at the caret. */
export function VarInput({ value, onChange, labelAside, preview, hint, ...rest }: VarInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const v = value ?? '';
  const insert = (token: string) => {
    const { next, caret } = insertAt(ref.current, v, token);
    onChange(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  };
  return (
    <Input
      ref={ref}
      {...rest}
      value={v}
      onChange={(e) => onChange(e.target.value)}
      suffix={<InsertVarMenu onInsert={insert} disabled={rest.disabled} />}
      labelAside={labelAside}
      hint={preview && hasVar(v) ? <VarText className="act-preview" text={v} /> : hint}
    />
  );
}

type VarTextareaProps = Omit<TextareaProps, 'value' | 'onChange'> & {
  value: string | undefined;
  onChange: (v: string) => void;
  preview?: boolean;
};

export function VarTextarea({ value, onChange, labelAside, preview, hint, ...rest }: VarTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const v = value ?? '';
  const insert = (token: string) => {
    const { next, caret } = insertAt(ref.current, v, token);
    onChange(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  };
  return (
    <Textarea
      ref={ref}
      {...rest}
      value={v}
      onChange={(e) => onChange(e.target.value)}
      hint={preview && hasVar(v) ? <VarText className="act-preview act-preview--block" text={v} /> : hint}
      labelAside={
        <span className="act-aside">
          {labelAside}
          <InsertVarMenu onInsert={insert} disabled={rest.disabled} />
        </span>
      }
    />
  );
}

/** Editable list of key/value rows (headers, query params, env vars, copy pairs…). */
export function PairRows({
  label,
  rows,
  onChange,
  keyLabel,
  valueLabel,
  keyPh,
  valuePh,
  vars = true,
  monoKey = true,
  monoValue = false,
  arrow = false,
  addLabel,
  extra,
  hint,
}: {
  label: ReactNode;
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyLabel: string;
  valueLabel: string;
  keyPh?: string;
  valuePh?: string;
  vars?: boolean;
  monoKey?: boolean;
  monoValue?: boolean;
  /** Render "→" between key and value (source → target). */
  arrow?: boolean;
  addLabel?: string;
  /** Extra control rendered at the end of each row. */
  extra?: (index: number) => ReactNode;
  hint?: ReactNode;
}) {
  const t = useT(dict);
  const set = (i: number, patch: Partial<KeyValue>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="act-rows">
      <div className="act-rows__head">
        <span className="act-rows__label">{label}</span>
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...rows, { key: '', value: '' }])}>
          {addLabel ?? t('addRow')}
        </Button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className={arrow ? 'act-row act-row--arrow' : 'act-row'}>
          {vars && arrow ? (
            <VarInput aria-label={keyLabel} placeholder={keyPh ?? keyLabel} mono={monoKey} size="sm" value={r.key} onChange={(v) => set(i, { key: v })} />
          ) : (
            <Input
              aria-label={keyLabel}
              placeholder={keyPh ?? keyLabel}
              mono={monoKey}
              size="sm"
              value={r.key ?? ''}
              onChange={(e) => set(i, { key: e.target.value })}
            />
          )}
          {arrow && <span className="act-row__arrow" aria-hidden="true">→</span>}
          {vars ? (
            <VarInput aria-label={valueLabel} placeholder={valuePh ?? valueLabel} mono={monoValue} size="sm" value={r.value} onChange={(v) => set(i, { value: v })} />
          ) : (
            <Input
              aria-label={valueLabel}
              placeholder={valuePh ?? valueLabel}
              mono={monoValue}
              size="sm"
              value={r.value ?? ''}
              onChange={(e) => set(i, { value: e.target.value })}
            />
          )}
          {extra?.(i)}
          <IconButton icon={X} label={t('removeRow')} size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      {hint && <p className="act-hint">{hint}</p>}
    </div>
  );
}
