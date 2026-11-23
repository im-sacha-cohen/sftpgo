import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Input, NumberInput, RadioCards, SegmentedControl, Select, Switch, TagInput, Textarea } from '@/components/ui';
import type { FsProviders, Secret } from '@/api/types';
import { useT } from '@/lib/i18n';
import { SecretField } from '@/pages/actions/ActionEditor';
import { dict, type FoldersKey } from './i18n';
import { PROVIDERS, type FsDraft } from './model';

interface Props {
  fs: FsDraft;
  onChange: (fs: FsDraft) => void;
  mappedPath: string;
  onMappedPathChange: (v: string) => void;
  mappedPathError?: string;
}

/** Storage backend editor (FilesystemConfig), shared schema with users/groups. */
export function StorageEditor({ fs, onChange, mappedPath, onMappedPathChange, mappedPathError }: Props) {
  const t = useT(dict);
  const [advanced, setAdvanced] = useState(false);
  const set = <K extends keyof FsDraft>(k: K, patch: Partial<FsDraft[K]>) =>
    onChange({ ...fs, [k]: { ...(fs[k] as object), ...(patch as object) } });
  const secret = (label: string, value: Secret | undefined, apply: (s: Secret | undefined) => void, hint?: string) => (
    <SecretField label={label} value={value} onChange={apply} keptLabel={t('secretKept')} hint={hint} />
  );
  const num = (label: string, value: number | undefined, apply: (v: number) => void, unit?: string, max?: number) => (
    <NumberInput label={label} min={0} max={max} unit={unit} value={value ?? 0} onChange={(v) => apply(v ?? 0)} />
  );
  const advToggle = (
    <Button size="sm" variant="ghost" icon={advanced ? ChevronDown : ChevronRight} onClick={() => setAdvanced((a) => !a)}>
      {t('advanced')}
    </Button>
  );

  const p = fs.provider;
  return (
    <div className="fld-storage">
      <RadioCards<string>
        columns={4}
        value={String(p)}
        onChange={(v) => onChange({ ...fs, provider: Number(v) as FsProviders })}
        options={PROVIDERS.map((x) => ({
          value: String(x.value),
          label: t(`p${x.value}` as FoldersKey),
          description: t(`pd${x.value}` as FoldersKey),
          icon: x.icon,
        }))}
      />

      {(p === 0 || p === 4) && (
        <div className="fld-form">
          <Input
            label={t('mappedPath')}
            required
            mono
            placeholder="/srv/sftpgo/data/partage"
            hint={t('mappedPathHint')}
            error={mappedPathError}
            value={mappedPath}
            onChange={(e) => onMappedPathChange(e.target.value)}
          />
          {p === 4 && secret(t('passphrase'), fs.cryptconfig.passphrase, (s) => set('cryptconfig', { passphrase: s }), t('passphraseHint'))}
          {advToggle}
          {advanced && (
            <div className="fld-grid">
              {p === 0
                ? num(t('readBuffer'), fs.osconfig.read_buffer_size, (v) => set('osconfig', { read_buffer_size: v }), t('mb'), 10)
                : num(t('readBuffer'), fs.cryptconfig.read_buffer_size, (v) => set('cryptconfig', { read_buffer_size: v }), t('mb'), 10)}
              {p === 0
                ? num(t('writeBuffer'), fs.osconfig.write_buffer_size, (v) => set('osconfig', { write_buffer_size: v }), t('mb'), 10)
                : num(t('writeBuffer'), fs.cryptconfig.write_buffer_size, (v) => set('cryptconfig', { write_buffer_size: v }), t('mb'), 10)}
              <p className="fld-hint">{t('bufferHint')}</p>
            </div>
          )}
        </div>
      )}

      {p === 1 && (
        <div className="fld-form">
          <div className="fld-grid">
            <Input label={t('bucket')} required mono value={fs.s3config.bucket ?? ''} onChange={(e) => set('s3config', { bucket: e.target.value })} />
            <Input label={t('region')} required mono placeholder="eu-west-3" value={fs.s3config.region ?? ''} onChange={(e) => set('s3config', { region: e.target.value })} />
            <Input label={t('accessKey')} mono autoComplete="off" value={fs.s3config.access_key ?? ''} onChange={(e) => set('s3config', { access_key: e.target.value })} />
            {secret(t('accessSecret'), fs.s3config.access_secret, (s) => set('s3config', { access_secret: s }))}
            <Input label={t('endpoint')} mono hint={t('endpointHint')} placeholder="https://s3.example.com" value={fs.s3config.endpoint ?? ''} onChange={(e) => set('s3config', { endpoint: e.target.value })} />
            <Input label={t('keyPrefix')} mono hint={t('keyPrefixHint')} value={fs.s3config.key_prefix ?? ''} onChange={(e) => set('s3config', { key_prefix: e.target.value })} />
          </div>
          {advToggle}
          {advanced && (
            <div className="fld-grid">
              <Input label={t('storageClass')} mono value={fs.s3config.storage_class ?? ''} onChange={(e) => set('s3config', { storage_class: e.target.value })} />
              <Input label={t('acl')} mono value={fs.s3config.acl ?? ''} onChange={(e) => set('s3config', { acl: e.target.value })} />
              <Input label={t('roleArn')} mono value={fs.s3config.role_arn ?? ''} onChange={(e) => set('s3config', { role_arn: e.target.value })} />
              <Input label={t('sessionToken')} mono value={fs.s3config.session_token ?? ''} onChange={(e) => set('s3config', { session_token: e.target.value })} />
              {secret(t('sseKey'), fs.s3config.sse_customer_key, (s) => set('s3config', { sse_customer_key: s }))}
              {num(t('uploadPartSize'), fs.s3config.upload_part_size, (v) => set('s3config', { upload_part_size: v }), t('mb'))}
              {num(t('uploadConcurrency'), fs.s3config.upload_concurrency, (v) => set('s3config', { upload_concurrency: v }))}
              {num(t('uploadPartMaxTime'), fs.s3config.upload_part_max_time, (v) => set('s3config', { upload_part_max_time: v }), t('seconds'))}
              {num(t('downloadPartSize'), fs.s3config.download_part_size, (v) => set('s3config', { download_part_size: v }), t('mb'))}
              {num(t('downloadConcurrency'), fs.s3config.download_concurrency, (v) => set('s3config', { download_concurrency: v }))}
              {num(t('downloadPartMaxTime'), fs.s3config.download_part_max_time, (v) => set('s3config', { download_part_max_time: v }), t('seconds'))}
              <div className="fld-switch">
                <Switch checked={!!fs.s3config.force_path_style} onChange={(c) => set('s3config', { force_path_style: c })} label={t('forcePathStyle')} />
              </div>
            </div>
          )}
        </div>
      )}

      {p === 2 && (
        <div className="fld-form">
          <div className="fld-grid">
            <Input label={t('bucket')} required mono value={fs.gcsconfig.bucket ?? ''} onChange={(e) => set('gcsconfig', { bucket: e.target.value })} />
            <Input label={t('keyPrefix')} mono hint={t('keyPrefixHint')} value={fs.gcsconfig.key_prefix ?? ''} onChange={(e) => set('gcsconfig', { key_prefix: e.target.value })} />
          </div>
          <Switch
            checked={fs.gcsconfig.automatic_credentials === 1}
            onChange={(c) => set('gcsconfig', { automatic_credentials: c ? 1 : 0 })}
            label={t('autoCredentials')}
          />
          {fs.gcsconfig.automatic_credentials !== 1 && (
            <Textarea
              label={t('credentials')}
              mono
              rows={5}
              hint={t('credentialsHint')}
              placeholder={fs.gcsconfig.credentials?.status && fs.gcsconfig.credentials.status !== 'Plain' ? t('secretKept') : '{ "type": "service_account", … }'}
              value={fs.gcsconfig.credentials?.status === 'Plain' ? fs.gcsconfig.credentials.payload ?? '' : ''}
              onChange={(e) => {
                const v = e.target.value;
                const prev = fs.gcsconfig.credentials;
                const stored = prev?.status && prev.status !== 'Plain' ? prev : undefined;
                set('gcsconfig', { credentials: v ? { status: 'Plain', payload: v } : stored });
              }}
            />
          )}
          {advToggle}
          {advanced && (
            <div className="fld-grid">
              <Input label={t('storageClass')} mono value={fs.gcsconfig.storage_class ?? ''} onChange={(e) => set('gcsconfig', { storage_class: e.target.value })} />
              <Input label={t('acl')} mono value={fs.gcsconfig.acl ?? ''} onChange={(e) => set('gcsconfig', { acl: e.target.value })} />
              {num(t('uploadPartSize'), fs.gcsconfig.upload_part_size, (v) => set('gcsconfig', { upload_part_size: v }), t('mb'))}
              {num(t('uploadPartMaxTime'), fs.gcsconfig.upload_part_max_time, (v) => set('gcsconfig', { upload_part_max_time: v }), t('seconds'))}
            </div>
          )}
        </div>
      )}

      {p === 3 && (
        <div className="fld-form">
          <div className="fld-grid">
            <Input label={t('container')} required mono value={fs.azblobconfig.container ?? ''} onChange={(e) => set('azblobconfig', { container: e.target.value })} />
            <Input label={t('accountName')} mono value={fs.azblobconfig.account_name ?? ''} onChange={(e) => set('azblobconfig', { account_name: e.target.value })} />
            {secret(t('accountKey'), fs.azblobconfig.account_key, (s) => set('azblobconfig', { account_key: s }))}
            {secret(t('sasUrl'), fs.azblobconfig.sas_url, (s) => set('azblobconfig', { sas_url: s }), t('sasUrlHint'))}
            <Input label={t('endpoint')} mono placeholder="blob.core.windows.net" value={fs.azblobconfig.endpoint ?? ''} onChange={(e) => set('azblobconfig', { endpoint: e.target.value })} />
            <Input label={t('keyPrefix')} mono hint={t('keyPrefixHint')} value={fs.azblobconfig.key_prefix ?? ''} onChange={(e) => set('azblobconfig', { key_prefix: e.target.value })} />
          </div>
          {advToggle}
          {advanced && (
            <div className="fld-grid">
              <Select
                label={t('accessTier')}
                value={fs.azblobconfig.access_tier ?? ''}
                onChange={(v) => set('azblobconfig', { access_tier: v as '' | 'Archive' | 'Hot' | 'Cool' })}
                options={[
                  { value: '', label: t('tierDefault') },
                  { value: 'Hot', label: 'Hot' },
                  { value: 'Cool', label: 'Cool' },
                  { value: 'Archive', label: 'Archive' },
                ]}
              />
              {num(t('uploadPartSize'), fs.azblobconfig.upload_part_size, (v) => set('azblobconfig', { upload_part_size: v }), t('mb'))}
              {num(t('uploadConcurrency'), fs.azblobconfig.upload_concurrency, (v) => set('azblobconfig', { upload_concurrency: v }))}
              {num(t('downloadPartSize'), fs.azblobconfig.download_part_size, (v) => set('azblobconfig', { download_part_size: v }), t('mb'))}
              {num(t('downloadConcurrency'), fs.azblobconfig.download_concurrency, (v) => set('azblobconfig', { download_concurrency: v }))}
              <div className="fld-switch">
                <Switch checked={!!fs.azblobconfig.use_emulator} onChange={(c) => set('azblobconfig', { use_emulator: c })} label={t('useEmulator')} />
              </div>
            </div>
          )}
        </div>
      )}

      {p === 5 && (
        <div className="fld-form">
          <div className="fld-grid">
            <Input label={t('sftpEndpoint')} required mono placeholder="sftp.example.com:22" value={fs.sftpconfig.endpoint ?? ''} onChange={(e) => set('sftpconfig', { endpoint: e.target.value })} />
            <Input label={t('username')} required mono autoComplete="off" value={fs.sftpconfig.username ?? ''} onChange={(e) => set('sftpconfig', { username: e.target.value })} />
            {secret(t('password'), fs.sftpconfig.password, (s) => set('sftpconfig', { password: s }))}
            {secret(t('keyPassphrase'), fs.sftpconfig.key_passphrase, (s) => set('sftpconfig', { key_passphrase: s }))}
          </div>
          <Textarea
            label={t('privateKey')}
            mono
            rows={4}
            placeholder={fs.sftpconfig.private_key?.status && fs.sftpconfig.private_key.status !== 'Plain' ? t('secretKept') : '-----BEGIN OPENSSH PRIVATE KEY-----'}
            value={fs.sftpconfig.private_key?.status === 'Plain' ? fs.sftpconfig.private_key.payload ?? '' : ''}
            onChange={(e) => {
              const v = e.target.value;
              const prev = fs.sftpconfig.private_key;
              const stored = prev?.status && prev.status !== 'Plain' ? prev : undefined;
              set('sftpconfig', { private_key: v ? { status: 'Plain', payload: v } : stored });
            }}
          />
          <TagInput
            label={t('fingerprints')}
            hint={t('fingerprintsHint')}
            mono
            values={fs.sftpconfig.fingerprints ?? []}
            onChange={(v) => set('sftpconfig', { fingerprints: v })}
            placeholder="SHA256:…"
          />
          <Input label={t('prefix')} mono hint={t('prefixHint')} value={fs.sftpconfig.prefix ?? ''} onChange={(e) => set('sftpconfig', { prefix: e.target.value })} />
          {advToggle}
          {advanced && (
            <div className="fld-grid">
              {num(t('bufferSize'), fs.sftpconfig.buffer_size, (v) => set('sftpconfig', { buffer_size: v }), t('mb'), 16)}
              <div className="fld-field">
                <span className="fld-label">{t('equalityCheck')}</span>
                <SegmentedControl
                  size="sm"
                  value={String(fs.sftpconfig.equality_check_mode ?? 0)}
                  onChange={(v) => set('sftpconfig', { equality_check_mode: Number(v) as 0 | 1 })}
                  options={[
                    { value: '0', label: t('eq0') },
                    { value: '1', label: t('eq1') },
                  ]}
                />
              </div>
              <div className="fld-switch">
                <Switch
                  checked={!!fs.sftpconfig.disable_concurrent_reads}
                  onChange={(c) => set('sftpconfig', { disable_concurrent_reads: c })}
                  label={t('disableConcurrentReads')}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {p === 6 && (
        <div className="fld-form">
          <Input label={t('httpEndpoint')} required mono placeholder="https://storage.example.com/api/v1" value={fs.httpconfig.endpoint ?? ''} onChange={(e) => set('httpconfig', { endpoint: e.target.value })} />
          <div className="fld-grid">
            <Input label={t('username')} mono autoComplete="off" value={fs.httpconfig.username ?? ''} onChange={(e) => set('httpconfig', { username: e.target.value })} />
            {secret(t('password'), fs.httpconfig.password, (s) => set('httpconfig', { password: s }))}
            {secret(t('apiKey'), fs.httpconfig.api_key, (s) => set('httpconfig', { api_key: s }))}
          </div>
          {advToggle}
          {advanced && (
            <div className="fld-grid">
              <div className="fld-field">
                <span className="fld-label">{t('equalityCheck')}</span>
                <SegmentedControl
                  size="sm"
                  value={String(fs.httpconfig.equality_check_mode ?? 0)}
                  onChange={(v) => set('httpconfig', { equality_check_mode: Number(v) as 0 | 1 })}
                  options={[
                    { value: '0', label: t('eq0') },
                    { value: '1', label: t('eq1') },
                  ]}
                />
              </div>
              <div className="fld-switch">
                <Switch checked={!!fs.httpconfig.skip_tls_verify} onChange={(c) => set('httpconfig', { skip_tls_verify: c })} label={t('skipTls')} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
