import { Plus, Trash2 } from 'lucide-react';
import type { BaseUserFilters, LoginMethods, MFAProtocols, PatternsFilter, SupportedProtocols } from '@/api/types';
import { Button, IconButton, Input, MultiSelect, Switch, TagInput } from '@/components/ui';
import { useCommon, useT } from '@/lib/i18n';
import { dict, type UsersKey } from '../i18n';
import { cleanVirtualPath, isIpOrCidr, LOGIN_METHODS, PROTOCOLS, toCidr } from '../model';
import { SizeInput } from './SizeInput';

type Filters = BaseUserFilters;

interface FiltersProps {
  value: Filters;
  onChange: (f: Filters) => void;
  disabled?: boolean;
}

/** Protocol switches (stored as filters.denied_protocols). */
export function ProtocolsEditor({
  value,
  onChange,
  disabled,
  deniedByGroup,
}: FiltersProps & { deniedByGroup?: Map<SupportedProtocols, string> }) {
  const t = useT(dict);
  const denied = new Set(value.denied_protocols ?? []);
  return (
    <div className="users-switches">
      {PROTOCOLS.map((p) => {
        const group = deniedByGroup?.get(p);
        return (
          <Switch
            key={p}
            labelPosition="end"
            checked={!denied.has(p) && !group}
            disabled={disabled || !!group}
            label={t(`proto_${p}` as UsersKey)}
            description={group ? t('protoDeniedByGroup', { group }) : t(`protoDesc_${p}` as UsersKey)}
            onChange={(on) => {
              const next = new Set(denied);
              if (on) next.delete(p);
              else next.add(p);
              onChange({ ...value, denied_protocols: PROTOCOLS.filter((x) => next.has(x)) });
            }}
          />
        );
      })}
    </div>
  );
}

/** Allowed/denied IPs, denied login methods, 2FA protocols, start directory, max upload size. */
export function NetworkEditor({ value, onChange, disabled, withMfa = true }: FiltersProps & { withMfa?: boolean }) {
  const t = useT(dict);
  const c = useCommon();
  const ipValidate = (v: string) => (isIpOrCidr(v) ? null : t('ipInvalid'));
  return (
    <div className="users-grid">
      <TagInput
        label={t('allowedIp')}
        hint={t('allowedIpHint')}
        mono
        values={value.allowed_ip ?? []}
        transform={(v) => toCidr(v)}
        validate={ipValidate}
        placeholder={t('ipPlaceholder')}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, allowed_ip: v })}
      />
      <TagInput
        label={t('deniedIp')}
        hint={t('deniedIpHint')}
        mono
        values={value.denied_ip ?? []}
        transform={(v) => toCidr(v)}
        validate={ipValidate}
        placeholder={t('ipPlaceholder')}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, denied_ip: v })}
      />
      <MultiSelect<LoginMethods>
        label={t('loginMethods')}
        hint={t('loginMethodsHint')}
        values={value.denied_login_methods ?? []}
        options={LOGIN_METHODS.map((m) => ({ value: m, label: t(`lm_${m}` as UsersKey) }))}
        placeholder={c('none')}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, denied_login_methods: v })}
      />
      {withMfa && (
        <MultiSelect<MFAProtocols>
          label={t('twoFactorProtocols')}
          values={value.two_factor_protocols ?? []}
          options={(['SSH', 'FTP', 'HTTP'] as MFAProtocols[]).map((p) => ({ value: p, label: t(`proto_${p}` as UsersKey) }))}
          placeholder="—"
          disabled={disabled}
          onChange={(v) => onChange({ ...value, two_factor_protocols: v })}
        />
      )}
      <Input
        label={t('startDirectory')}
        hint={t('startDirectoryHint')}
        mono
        placeholder="/"
        value={value.start_directory ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, start_directory: e.target.value })}
      />
      <SizeInput
        label={t('maxUploadFile')}
        value={value.max_upload_file_size}
        disabled={disabled}
        onChange={(b) => onChange({ ...value, max_upload_file_size: b })}
      />
    </div>
  );
}

/** Allowed/denied shell patterns per path (filters.file_patterns). */
export function PatternsEditor({ value, onChange, disabled }: FiltersProps) {
  const t = useT(dict);
  const c = useCommon();
  const rows = value.file_patterns ?? [];
  const set = (i: number, p: Partial<PatternsFilter>) =>
    onChange({ ...value, file_patterns: rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)) });
  const remove = (i: number) => onChange({ ...value, file_patterns: rows.filter((_, idx) => idx !== i) });
  const add = () => {
    const used = new Set(rows.map((r) => r.path));
    onChange({ ...value, file_patterns: [...rows, { path: used.has('/') ? '' : '/', allowed_patterns: [], denied_patterns: [] }] });
  };

  return (
    <div className="users-stack">
      <p className="muted users-small">{t('patternsHint')}</p>
      {rows.length === 0 && <p className="muted users-small">{t('patternsEmpty')}</p>}
      {rows.map((r, i) => (
        <div key={i} className="users-pattern">
          <div className="users-pattern__head">
            <Input
              size="sm"
              mono
              value={r.path ?? ''}
              placeholder="/"
              aria-label={t('colPath')}
              disabled={disabled}
              onChange={(e) => set(i, { path: e.target.value })}
              onBlur={(e) => e.target.value && set(i, { path: cleanVirtualPath(e.target.value) })}
            />
            <Switch
              size="sm"
              checked={r.deny_policy === 1}
              disabled={disabled}
              label={t('denyPolicy')}
              onChange={(v) => set(i, { deny_policy: v ? 1 : 0 })}
            />
            <span className="users-grow" />
            {!disabled && <IconButton size="sm" icon={Trash2} label={c('remove')} onClick={() => remove(i)} />}
          </div>
          <div className="users-grid">
            <TagInput
              size="sm"
              mono
              label={t('allowedPatterns')}
              values={r.allowed_patterns ?? []}
              placeholder="*.pdf"
              disabled={disabled}
              onChange={(v) => set(i, { allowed_patterns: v })}
            />
            <TagInput
              size="sm"
              mono
              label={t('deniedPatterns')}
              values={r.denied_patterns ?? []}
              placeholder={t('patternPlaceholder')}
              disabled={disabled}
              onChange={(v) => set(i, { denied_patterns: v })}
            />
          </div>
        </div>
      ))}
      {!disabled && (
        <div>
          <Button size="sm" icon={Plus} onClick={add}>
            {t('patternsAdd')}
          </Button>
        </div>
      )}
    </div>
  );
}
