import type { ReactNode } from 'react';
import { Info, Plus, X } from 'lucide-react';
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  NumberInput,
  PasswordInput,
  RadioCards,
  SegmentedControl,
  Switch,
  TagInput,
} from '@/components/ui';
import { useCommon, useT } from '@/lib/i18n';
import type { EventActionTypes, FilesystemActionTypes, Secret } from '@/api/types';
import { dict, type ActionsKey } from './i18n';
import { ACTION_TYPES, FS_ACTION_TYPES, HTTP_METHODS, type ActionDraft } from './model';
import { PairRows, VarInput, VarTextarea } from './VarField';
import './actions.css';

type Opts = ActionDraft['options'];

export interface ActionEditorProps {
  draft: ActionDraft;
  onChange: (d: ActionDraft) => void;
  isNew: boolean;
  nameError?: string;
  /** Hide the "general" block (name/description) — used when the caller renders it. */
  hideGeneral?: boolean;
  /** Narrow layout (drawer). */
  compact?: boolean;
}

/** Full editor of an event action: type picker + type-specific configuration. Reused by the rules drawer. */
export function ActionEditor({ draft, onChange, isNew, nameError, hideGeneral, compact }: ActionEditorProps) {
  const t = useT(dict);
  const tc = useCommon();
  const setOpt = <K extends keyof Opts>(k: K, patch: Partial<Opts[K]>) =>
    onChange({ ...draft, options: { ...draft.options, [k]: { ...draft.options[k], ...patch } } });

  return (
    <div className={compact ? 'act-editor act-editor--compact' : 'act-editor'}>
      {!hideGeneral && (
        <section className="act-section">
          <h2 className="act-section__title">{t('general')}</h2>
          <div className="act-grid">
            <Input
              label={t('colName')}
              required
              mono
              value={draft.name}
              placeholder={t('namePh')}
              disabled={!isNew}
              hint={isNew ? t('nameHint') : undefined}
              error={nameError}
              autoFocus={isNew}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
            />
            <Input
              label={tc('description')}
              value={draft.description}
              placeholder={t('descriptionPh')}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
            />
          </div>
        </section>
      )}

      <section className="act-section">
        <h2 className="act-section__title">{t('typeLabel')}</h2>
        <RadioCards<string>
          columns={compact ? 2 : 4}
          value={String(draft.type)}
          onChange={(v) => onChange({ ...draft, type: Number(v) as EventActionTypes })}
          options={ACTION_TYPES.map((a) => ({
            value: String(a.type),
            label: t(`t_${a.key}` as ActionsKey),
            description: t(`td_${a.key}` as ActionsKey),
            icon: a.icon,
          }))}
        />
      </section>

      <section className="act-section">
        <h2 className="act-section__title">{t('configuration')}</h2>
        <TypeForm draft={draft} setOpt={setOpt} compact={compact} />
      </section>
    </div>
  );
}

type SetOpt = <K extends keyof Opts>(k: K, patch: Partial<Opts[K]>) => void;

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="act-note">
      <Info size={14} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Secret input: shows "unchanged" while a stored secret is kept, sends Plain when typed. */
export function SecretField({
  label,
  value,
  onChange,
  keptLabel,
  hint,
}: {
  label: string;
  value: Secret | undefined;
  onChange: (s: Secret | undefined) => void;
  keptLabel: string;
  hint?: ReactNode;
}) {
  const stored = !!value?.status && value.status !== 'Plain';
  return (
    <PasswordInput
      label={label}
      hint={hint}
      autoComplete="new-password"
      placeholder={stored ? keptLabel : ''}
      value={value?.status === 'Plain' ? value.payload ?? '' : ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? { status: 'Plain', payload: v } : stored ? value : undefined);
      }}
    />
  );
}

function TypeForm({ draft, setOpt, compact }: { draft: ActionDraft; setOpt: SetOpt; compact?: boolean }) {
  const t = useT(dict);
  const o = draft.options;
  switch (draft.type) {
    case 1: {
      const h = o.http_config;
      const hasParts = (h.parts ?? []).length > 0;
      return (
        <div className="act-form">
          <div className="act-grid act-grid--endpoint">
            <div className="act-method">
              <span className="act-label">{t('method')}</span>
              <SegmentedControl
                size="sm"
                value={h.method ?? 'POST'}
                onChange={(m) => setOpt('http_config', { method: m })}
                options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
              />
            </div>
            <VarInput
              label={t('endpoint')}
              preview
              required
              mono
              placeholder="https://example.com/hook"
              value={h.endpoint}
              onChange={(v) => setOpt('http_config', { endpoint: v })}
            />
          </div>
          <div className="act-grid">
            <Input
              label={t('username')}
              autoComplete="off"
              value={h.username ?? ''}
              onChange={(e) => setOpt('http_config', { username: e.target.value })}
            />
            <SecretField
              label={t('password')}
              keptLabel={t('passwordKept')}
              value={h.password}
              onChange={(s) => setOpt('http_config', { password: s })}
            />
          </div>
          <PairRows
            label={t('headers')}
            rows={h.headers ?? []}
            onChange={(rows) => setOpt('http_config', { headers: rows })}
            keyLabel={t('key')}
            valueLabel={t('value')}
            keyPh="X-Header"
          />
          <PairRows
            label={t('queryParams')}
            rows={h.query_parameters ?? []}
            onChange={(rows) => setOpt('http_config', { query_parameters: rows })}
            keyLabel={t('key')}
            valueLabel={t('value')}
          />
          <VarTextarea
            label={t('body')}
            mono
            rows={compact ? 4 : 6}
            disabled={hasParts}
            hint={hasParts ? t('bodyDisabled') : undefined}
            value={h.body}
            onChange={(v) => setOpt('http_config', { body: v })}
          />
          <div className="act-rows">
            <div className="act-rows__head">
              <span className="act-rows__label">{t('multipart')}</span>
              <Button
                size="sm"
                variant="ghost"
                icon={Plus}
                onClick={() => setOpt('http_config', { parts: [...(h.parts ?? []), { name: '', headers: [] }] })}
              >
                {t('addPart')}
              </Button>
            </div>
            {(h.parts ?? []).map((p, i) => {
              const setPart = (patch: Partial<typeof p>) =>
                setOpt('http_config', { parts: (h.parts ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="act-part">
                  <div className="act-part__head">
                    <Input size="sm" mono aria-label={t('partName')} placeholder={t('partName')} value={p.name ?? ''} onChange={(e) => setPart({ name: e.target.value })} />
                    <IconButton
                      icon={X}
                      size="sm"
                      label={t('removePart')}
                      onClick={() => setOpt('http_config', { parts: (h.parts ?? []).filter((_, j) => j !== i) })}
                    />
                  </div>
                  <div className="act-grid">
                    <VarInput size="sm" mono label={t('partFile')} placeholder="{{.VirtualPath}}" value={p.filepath} onChange={(v) => setPart({ filepath: v, body: v ? '' : p.body })} />
                    <VarInput size="sm" label={t('partBody')} value={p.body} disabled={!!p.filepath} onChange={(v) => setPart({ body: v })} />
                  </div>
                  <PairRows
                    label={t('partHeaders')}
                    rows={p.headers ?? []}
                    onChange={(rows) => setPart({ headers: rows })}
                    keyLabel={t('key')}
                    valueLabel={t('value')}
                  />
                </div>
              );
            })}
          </div>
          <div className="act-grid">
            <NumberInput
              label={t('timeout')}
              min={1}
              max={180}
              unit={t('seconds')}
              value={h.timeout ?? null}
              onChange={(v) => setOpt('http_config', { timeout: v ?? undefined })}
            />
            <div className="act-switch-cell">
              <Switch
                checked={!!h.skip_tls_verify}
                onChange={(c) => setOpt('http_config', { skip_tls_verify: c })}
                label={t('skipTls')}
                description={t('skipTlsHint')}
              />
            </div>
          </div>
        </div>
      );
    }
    case 2: {
      const c = o.cmd_config;
      return (
        <div className="act-form">
          <Input
            label={t('cmd')}
            required
            mono
            placeholder="/usr/local/bin/script.sh"
            hint={t('cmdHint')}
            value={c.cmd ?? ''}
            onChange={(e) => setOpt('cmd_config', { cmd: e.target.value })}
          />
          <TagInput
            label={t('args')}
            hint={t('argsHint')}
            mono
            allowDuplicates
            values={c.args ?? []}
            onChange={(v) => setOpt('cmd_config', { args: v })}
            placeholder="{{.VirtualPath}}"
          />
          <PairRows
            label={t('envVars')}
            rows={c.env_vars ?? []}
            onChange={(rows) => setOpt('cmd_config', { env_vars: rows })}
            keyLabel={t('key')}
            valueLabel={t('value')}
            keyPh="NAME"
          />
          <div className="act-grid">
            <NumberInput
              label={t('timeout')}
              min={1}
              max={120}
              unit={t('seconds')}
              value={c.timeout ?? null}
              onChange={(v) => setOpt('cmd_config', { timeout: v ?? undefined })}
            />
          </div>
        </div>
      );
    }
    case 3: {
      const e = o.email_config;
      const validate = (v: string) => (/^[^\s@]+@[^\s@]+$/.test(v) || v.includes('{{') ? null : t('invalidEmail'));
      return (
        <div className="act-form">
          <TagInput
            label={t('recipients')}
            required
            values={e.recipients ?? []}
            onChange={(v) => setOpt('email_config', { recipients: v })}
            validate={validate}
            placeholder={(e.recipients ?? []).length ? undefined : 'compta@example.com'}
          />
          <TagInput label={t('bcc')} values={e.bcc ?? []} onChange={(v) => setOpt('email_config', { bcc: v })} validate={validate} />
          <VarInput label={t('subject')} preview required value={e.subject} onChange={(v) => setOpt('email_config', { subject: v })} />
          <div className="act-method">
            <span className="act-label">{t('contentType')}</span>
            <SegmentedControl
              size="sm"
              value={String(e.content_type ?? 0)}
              onChange={(v) => setOpt('email_config', { content_type: Number(v) as 0 | 1 })}
              options={[
                { value: '0', label: t('plainText') },
                { value: '1', label: t('html') },
              ]}
            />
          </div>
          <VarTextarea
            label={t('body')}
            preview={e.content_type !== 1}
            rows={compact ? 5 : 8}
            mono={e.content_type === 1}
            value={e.body}
            onChange={(v) => setOpt('email_config', { body: v })}
          />
          <TagInput
            label={t('attachments')}
            hint={t('attachmentsHint')}
            mono
            values={e.attachments ?? []}
            onChange={(v) => setOpt('email_config', { attachments: v })}
            placeholder={(e.attachments ?? []).length ? undefined : '{{.VirtualPath}}'}
          />
        </div>
      );
    }
    case 8: {
      const folders = o.retention_config.folders ?? [];
      const set = (i: number, patch: Partial<(typeof folders)[number]>) =>
        setOpt('retention_config', { folders: folders.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
      return (
        <div className="act-form">
          <div className="act-rows">
            <div className="act-rows__head">
              <span className="act-rows__label">{t('retentionFolders')}</span>
              <Button
                size="sm"
                variant="ghost"
                icon={Plus}
                onClick={() => setOpt('retention_config', { folders: [...folders, { path: '/', retention: 24 }] })}
              >
                {t('addFolder')}
              </Button>
            </div>
            {folders.map((f, i) => (
              <div key={i} className="act-row act-row--retention">
                <Input size="sm" mono aria-label={t('retentionPath')} placeholder="/" value={f.path ?? ''} onChange={(e) => set(i, { path: e.target.value })} />
                <NumberInput
                  size="sm"
                  aria-label={t('retentionHours')}
                  min={0}
                  unit={t('hours')}
                  value={f.retention ?? 0}
                  onChange={(v) => set(i, { retention: v ?? 0 })}
                />
                <Checkbox checked={!!f.delete_empty_dirs} onChange={(c) => set(i, { delete_empty_dirs: c })} label={t('deleteEmptyDirs')} />
                <IconButton
                  icon={X}
                  size="sm"
                  label={t('removeRow')}
                  onClick={() => setOpt('retention_config', { folders: folders.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            <p className="act-hint">{t('retentionHint')}</p>
          </div>
        </div>
      );
    }
    case 9:
      return <FsForm draft={draft} setOpt={setOpt} />;
    case 11:
      return (
        <div className="act-form">
          <div className="act-grid">
            <NumberInput
              label={t('threshold')}
              min={1}
              unit={t('days')}
              hint={t('pwdHint')}
              value={o.pwd_expiration_config.threshold ?? null}
              onChange={(v) => setOpt('pwd_expiration_config', { threshold: v ?? undefined })}
            />
          </div>
        </div>
      );
    case 14:
      return (
        <div className="act-form">
          <div className="act-grid">
            <NumberInput
              label={t('disableThreshold')}
              min={0}
              unit={t('days')}
              value={o.user_inactivity_config.disable_threshold ?? 0}
              onChange={(v) => setOpt('user_inactivity_config', { disable_threshold: v ?? 0 })}
            />
            <NumberInput
              label={t('deleteThreshold')}
              min={0}
              unit={t('days')}
              value={o.user_inactivity_config.delete_threshold ?? 0}
              onChange={(v) => setOpt('user_inactivity_config', { delete_threshold: v ?? 0 })}
            />
          </div>
          <p className="act-hint">{t('inactivityHint')}</p>
        </div>
      );
    case 13: {
      const c = o.idp_config;
      const jsonErr = (s: string | undefined) => {
        if (!s?.trim()) return undefined;
        try {
          JSON.parse(s);
          return undefined;
        } catch {
          return t('invalidJson');
        }
      };
      return (
        <div className="act-form">
          <div className="act-method">
            <span className="act-label">{t('idpMode')}</span>
            <SegmentedControl
              size="sm"
              value={String(c.mode ?? 0)}
              onChange={(v) => setOpt('idp_config', { mode: Number(v) as 0 | 1 })}
              options={[
                { value: '0', label: t('idpMode0') },
                { value: '1', label: t('idpMode1') },
              ]}
            />
          </div>
          <VarTextarea
            label={t('templateUser')}
            mono
            rows={6}
            error={jsonErr(c.template_user)}
            placeholder='{"username":"{{.Name}}","permissions":{"/":["*"]}}'
            value={c.template_user}
            onChange={(v) => setOpt('idp_config', { template_user: v })}
          />
          <VarTextarea
            label={t('templateAdmin')}
            mono
            rows={6}
            error={jsonErr(c.template_admin)}
            value={c.template_admin}
            onChange={(v) => setOpt('idp_config', { template_admin: v })}
          />
          <Note>{t('idpHint')}</Note>
        </div>
      );
    }
    case 4:
      return <Note>{t('backupInfo')}</Note>;
    default:
      return <Note>{t('noOptions')}</Note>;
  }
}

function FsForm({ draft, setOpt }: { draft: ActionDraft; setOpt: SetOpt }) {
  const t = useT(dict);
  const f = draft.options.fs_config;
  const type = f.type ?? 1;
  return (
    <div className="act-form">
      <div className="act-method">
        <span className="act-label">{t('fsType')}</span>
        <SegmentedControl
          size="sm"
          value={String(type)}
          onChange={(v) => setOpt('fs_config', { type: Number(v) as FilesystemActionTypes })}
          options={FS_ACTION_TYPES.map((x) => ({ value: String(x.type), label: t(`fs_${x.key}` as ActionsKey) }))}
        />
      </div>
      {type === 1 && (
        <PairRows
          label={t('paths')}
          rows={f.renames ?? []}
          onChange={(rows) => setOpt('fs_config', { renames: rows })}
          keyLabel={t('source')}
          valueLabel={t('target')}
          keyPh="{{.VirtualPath}}"
          valuePh="/archive/{{.Year}}/{{.ObjectName}}"
          monoValue
          arrow
          addLabel={t('addPair')}
          extra={(i) => (
            <Checkbox
              checked={!!f.renames?.[i]?.update_modtime}
              onChange={(c) => setOpt('fs_config', { renames: (f.renames ?? []).map((r, j) => (j === i ? { ...r, update_modtime: c } : r)) })}
              label={t('updateModtime')}
            />
          )}
          hint={t('pathsHint')}
        />
      )}
      {type === 6 && (
        <PairRows
          label={t('paths')}
          rows={f.copy ?? []}
          onChange={(rows) => setOpt('fs_config', { copy: rows })}
          keyLabel={t('source')}
          valueLabel={t('target')}
          keyPh="{{.VirtualPath}}"
          valuePh="/archive/{{.ObjectName}}"
          monoValue
          arrow
          addLabel={t('addPair')}
          hint={t('pathsHint')}
        />
      )}
      {type === 2 && (
        <TagInput label={t('paths')} hint={t('pathsHint')} mono values={f.deletes ?? []} onChange={(v) => setOpt('fs_config', { deletes: v })} placeholder="{{.VirtualPath}}" />
      )}
      {type === 3 && (
        <TagInput label={t('paths')} hint={t('pathsHint')} mono values={f.mkdirs ?? []} onChange={(v) => setOpt('fs_config', { mkdirs: v })} placeholder="/archive/{{.Year}}" />
      )}
      {type === 4 && (
        <TagInput label={t('paths')} hint={t('pathsHint')} mono values={f.exist ?? []} onChange={(v) => setOpt('fs_config', { exist: v })} placeholder="/in" />
      )}
      {type === 5 && (
        <>
          <VarInput
            label={t('archive')}
            hint={t('archiveHint')}
            preview
            mono
            placeholder="/archive/{{.Year}}{{.Month}}{{.Day}}.zip"
            value={f.compress?.name}
            onChange={(v) => setOpt('fs_config', { compress: { ...f.compress, name: v } })}
          />
          <TagInput
            label={t('pathsToCompress')}
            hint={t('pathsHint')}
            mono
            values={f.compress?.paths ?? []}
            onChange={(v) => setOpt('fs_config', { compress: { ...f.compress, paths: v } })}
            placeholder="{{.VirtualPath}}"
          />
        </>
      )}
    </div>
  );
}

