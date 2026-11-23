import { useState } from 'react';
import { Cloud, Database, Globe, HardDrive, Lock, Server, Box, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  AzureBlobFsConfig,
  FilesystemConfig,
  FsProviders,
  GCSConfig,
  HTTPFsConfig,
  S3Config,
  SFTPFsConfig,
} from '@/api/types';
import { Button, Input, NumberInput, RadioCards, Select, Switch, TagInput } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict, type UsersKey } from '../i18n';
import { PROVIDER_KEY, PROVIDERS } from '../model';
import { SecretField } from './SecretField';

interface Props {
  fs: FilesystemConfig;
  onChange: (fs: FilesystemConfig) => void;
  homeDir?: string;
  onHomeDirChange?: (v: string) => void;
  /** Group settings: everything optional, home dir may contain %username%. */
  context?: 'user' | 'group';
  disabled?: boolean;
  homeDirError?: string | null;
}

const ICONS = { 0: HardDrive, 1: Cloud, 2: Cloud, 3: Database, 4: Lock, 5: Server, 6: Globe } as const;

const num = (v: number | undefined) => (v ? v : null);

export function StorageEditor({ fs, onChange, homeDir, onHomeDirChange, context = 'user', disabled, homeDirError }: Props) {
  const t = useT(dict);
  const [advanced, setAdvanced] = useState(false);
  const provider = (fs.provider ?? 0) as FsProviders;

  const patch = <K extends keyof FilesystemConfig>(key: K, v: Partial<NonNullable<FilesystemConfig[K]>>) =>
    onChange({ ...fs, [key]: { ...(fs[key] as object), ...v } });
  const s3 = (v: Partial<S3Config>) => patch('s3config', v);
  const gcs = (v: Partial<GCSConfig>) => patch('gcsconfig', v);
  const az = (v: Partial<AzureBlobFsConfig>) => patch('azblobconfig', v);
  const sftp = (v: Partial<SFTPFsConfig>) => patch('sftpconfig', v);
  const http = (v: Partial<HTTPFsConfig>) => patch('httpconfig', v);

  const options = PROVIDERS.map((p) => ({
    value: String(p),
    label: t(`be_${PROVIDER_KEY[p]}` as UsersKey),
    description: t(`beDesc_${PROVIDER_KEY[p]}` as UsersKey),
    icon: ICONS[p] ?? Box,
  }));

  const homeField = onHomeDirChange && (provider === 0 || provider === 4) && (
    <Input
      label={t('homeDir')}
      hint={context === 'group' ? t('homeDirGroupHint') : t('homeDirHint')}
      mono
      value={homeDir ?? ''}
      disabled={disabled}
      error={homeDirError}
      placeholder={context === 'group' ? '/srv/sftpgo/%username%' : '/srv/sftpgo/data/username'}
      onChange={(e) => onHomeDirChange(e.target.value)}
    />
  );

  const advToggle = (
    <Button
      size="sm"
      variant="ghost"
      icon={advanced ? ChevronDown : ChevronRight}
      onClick={() => setAdvanced((a) => !a)}
      aria-expanded={advanced}
    >
      {t('advanced')}
    </Button>
  );

  const c = fs;
  return (
    <div className="users-stack">
      <RadioCards
        label={t('backendTitle')}
        options={options}
        value={String(provider)}
        columns={4}
        disabled={disabled}
        onChange={(v) => onChange({ ...fs, provider: Number(v) as FsProviders })}
      />

      {provider === 0 && (
        <div className="users-grid">
          {homeField}
          {advToggle && <div className="users-grid__full">{advToggle}</div>}
          {advanced && (
            <>
              <NumberInput label={t('readBuffer')} min={0} max={10} value={num(c.osconfig?.read_buffer_size)} disabled={disabled}
                onChange={(n) => patch('osconfig', { read_buffer_size: n ?? 0 })} />
              <NumberInput label={t('writeBuffer')} min={0} max={10} value={num(c.osconfig?.write_buffer_size)} disabled={disabled}
                onChange={(n) => patch('osconfig', { write_buffer_size: n ?? 0 })} />
            </>
          )}
        </div>
      )}

      {provider === 1 && (
        <div className="users-grid">
          <Input label={t('bucket')} required={context === 'user'} mono value={c.s3config?.bucket ?? ''} disabled={disabled}
            onChange={(e) => s3({ bucket: e.target.value })} />
          <Input label={t('region')} required={context === 'user'} mono value={c.s3config?.region ?? ''} placeholder="eu-west-3" disabled={disabled}
            onChange={(e) => s3({ region: e.target.value })} />
          <Input label={t('endpoint')} hint={t('endpointHint')} mono value={c.s3config?.endpoint ?? ''} disabled={disabled}
            onChange={(e) => s3({ endpoint: e.target.value })} />
          <Input label={t('keyPrefix')} hint={t('keyPrefixHint')} mono value={c.s3config?.key_prefix ?? ''} placeholder="clients/acme/" disabled={disabled}
            onChange={(e) => s3({ key_prefix: e.target.value })} />
          <Input label={t('accessKey')} mono value={c.s3config?.access_key ?? ''} autoComplete="off" disabled={disabled}
            onChange={(e) => s3({ access_key: e.target.value })} />
          <SecretField label={t('accessSecret')} value={c.s3config?.access_secret} disabled={disabled}
            onChange={(v) => s3({ access_secret: v })} />
          <div className="users-grid__full">
            <Switch checked={!!c.s3config?.force_path_style} disabled={disabled} label={t('forcePathStyle')} description={t('forcePathStyleDesc')}
              onChange={(v) => s3({ force_path_style: v })} />
          </div>
          <div className="users-grid__full">{advToggle}</div>
          {advanced && (
            <>
              <Input label={t('roleArn')} mono value={c.s3config?.role_arn ?? ''} disabled={disabled} onChange={(e) => s3({ role_arn: e.target.value })} />
              <Input label={t('storageClass')} mono value={c.s3config?.storage_class ?? ''} placeholder="STANDARD" disabled={disabled}
                onChange={(e) => s3({ storage_class: e.target.value })} />
              <Input label={t('acl')} mono value={c.s3config?.acl ?? ''} placeholder="private" disabled={disabled} onChange={(e) => s3({ acl: e.target.value })} />
              <SecretField label={t('sseKey')} value={c.s3config?.sse_customer_key} generate disabled={disabled}
                onChange={(v) => s3({ sse_customer_key: v })} />
              <NumberInput label={t('uploadPartSize')} min={0} value={num(c.s3config?.upload_part_size)} disabled={disabled}
                onChange={(n) => s3({ upload_part_size: n ?? 0 })} />
              <NumberInput label={t('uploadConcurrency')} min={0} value={num(c.s3config?.upload_concurrency)} disabled={disabled}
                onChange={(n) => s3({ upload_concurrency: n ?? 0 })} />
              <NumberInput label={t('downloadPartSize')} min={0} value={num(c.s3config?.download_part_size)} disabled={disabled}
                onChange={(n) => s3({ download_part_size: n ?? 0 })} />
              <NumberInput label={t('downloadConcurrency')} min={0} value={num(c.s3config?.download_concurrency)} disabled={disabled}
                onChange={(n) => s3({ download_concurrency: n ?? 0 })} />
            </>
          )}
        </div>
      )}

      {provider === 2 && (
        <div className="users-grid">
          <Input label={t('bucket')} required={context === 'user'} mono value={c.gcsconfig?.bucket ?? ''} disabled={disabled}
            onChange={(e) => gcs({ bucket: e.target.value })} />
          <Input label={t('keyPrefix')} hint={t('keyPrefixHint')} mono value={c.gcsconfig?.key_prefix ?? ''} disabled={disabled}
            onChange={(e) => gcs({ key_prefix: e.target.value })} />
          <div className="users-grid__full">
            <Switch checked={c.gcsconfig?.automatic_credentials === 1} disabled={disabled} label={t('gcsAuto')} description={t('gcsAutoDesc')}
              onChange={(v) => gcs({ automatic_credentials: v ? 1 : 0 })} />
          </div>
          {c.gcsconfig?.automatic_credentials !== 1 && (
            <div className="users-grid__full">
              <SecretField label={t('gcsCredentials')} multiline value={c.gcsconfig?.credentials} disabled={disabled}
                onChange={(v) => gcs({ credentials: v })} />
            </div>
          )}
          <Input label={t('storageClass')} mono value={c.gcsconfig?.storage_class ?? ''} disabled={disabled}
            onChange={(e) => gcs({ storage_class: e.target.value })} />
          <Input label={t('acl')} mono value={c.gcsconfig?.acl ?? ''} disabled={disabled} onChange={(e) => gcs({ acl: e.target.value })} />
        </div>
      )}

      {provider === 3 && (
        <div className="users-grid">
          <Input label={t('container')} required={context === 'user'} mono value={c.azblobconfig?.container ?? ''} disabled={disabled}
            onChange={(e) => az({ container: e.target.value })} />
          <Input label={t('accountName')} mono value={c.azblobconfig?.account_name ?? ''} disabled={disabled}
            onChange={(e) => az({ account_name: e.target.value })} />
          <SecretField label={t('accountKey')} value={c.azblobconfig?.account_key} disabled={disabled} onChange={(v) => az({ account_key: v })} />
          <SecretField label={t('sasUrl')} value={c.azblobconfig?.sas_url} disabled={disabled} onChange={(v) => az({ sas_url: v })} />
          <Input label={t('endpoint')} mono value={c.azblobconfig?.endpoint ?? ''} placeholder="blob.core.windows.net" disabled={disabled}
            onChange={(e) => az({ endpoint: e.target.value })} />
          <Input label={t('keyPrefix')} hint={t('keyPrefixHint')} mono value={c.azblobconfig?.key_prefix ?? ''} disabled={disabled}
            onChange={(e) => az({ key_prefix: e.target.value })} />
          <Select<'' | 'Hot' | 'Cool' | 'Archive'>
            label={t('accessTier')}
            value={c.azblobconfig?.access_tier ?? ''}
            disabled={disabled}
            options={[
              { value: '', label: '—' },
              { value: 'Hot', label: 'Hot' },
              { value: 'Cool', label: 'Cool' },
              { value: 'Archive', label: 'Archive' },
            ]}
            onChange={(v) => az({ access_tier: v })}
          />
          <div className="users-grid__cell-center">
            <Switch checked={!!c.azblobconfig?.use_emulator} disabled={disabled} label={t('useEmulator')}
              onChange={(v) => az({ use_emulator: v })} />
          </div>
          <div className="users-grid__full">{advToggle}</div>
          {advanced && (
            <>
              <NumberInput label={t('uploadPartSize')} min={0} value={num(c.azblobconfig?.upload_part_size)} disabled={disabled}
                onChange={(n) => az({ upload_part_size: n ?? 0 })} />
              <NumberInput label={t('uploadConcurrency')} min={0} value={num(c.azblobconfig?.upload_concurrency)} disabled={disabled}
                onChange={(n) => az({ upload_concurrency: n ?? 0 })} />
              <NumberInput label={t('downloadPartSize')} min={0} value={num(c.azblobconfig?.download_part_size)} disabled={disabled}
                onChange={(n) => az({ download_part_size: n ?? 0 })} />
              <NumberInput label={t('downloadConcurrency')} min={0} value={num(c.azblobconfig?.download_concurrency)} disabled={disabled}
                onChange={(n) => az({ download_concurrency: n ?? 0 })} />
            </>
          )}
        </div>
      )}

      {provider === 4 && (
        <div className="users-grid">
          {homeField}
          <SecretField label={t('passphrase')} hint={t('passphraseHint')} value={c.cryptconfig?.passphrase} generate disabled={disabled}
            onChange={(v) => patch('cryptconfig', { passphrase: v })} />
          <div className="users-grid__full">{advToggle}</div>
          {advanced && (
            <>
              <NumberInput label={t('readBuffer')} min={0} max={10} value={num(c.cryptconfig?.read_buffer_size)} disabled={disabled}
                onChange={(n) => patch('cryptconfig', { read_buffer_size: n ?? 0 })} />
              <NumberInput label={t('writeBuffer')} min={0} max={10} value={num(c.cryptconfig?.write_buffer_size)} disabled={disabled}
                onChange={(n) => patch('cryptconfig', { write_buffer_size: n ?? 0 })} />
            </>
          )}
        </div>
      )}

      {provider === 5 && (
        <div className="users-grid">
          <Input label={t('sftpEndpoint')} required={context === 'user'} mono value={c.sftpconfig?.endpoint ?? ''} placeholder="sftp.example.com:22" disabled={disabled}
            onChange={(e) => sftp({ endpoint: e.target.value })} />
          <Input label={t('sftpUsername')} required={context === 'user'} mono value={c.sftpconfig?.username ?? ''} autoComplete="off" disabled={disabled}
            onChange={(e) => sftp({ username: e.target.value })} />
          <SecretField label={t('sftpPassword')} value={c.sftpconfig?.password} disabled={disabled} onChange={(v) => sftp({ password: v })} />
          <Input label={t('prefix')} mono value={c.sftpconfig?.prefix ?? ''} placeholder="/" disabled={disabled}
            onChange={(e) => sftp({ prefix: e.target.value })} />
          <div className="users-grid__full">
            <SecretField label={t('privateKey')} multiline value={c.sftpconfig?.private_key} disabled={disabled} onChange={(v) => sftp({ private_key: v })} />
          </div>
          <SecretField label={t('keyPassphrase')} value={c.sftpconfig?.key_passphrase} disabled={disabled}
            onChange={(v) => sftp({ key_passphrase: v })} />
          <NumberInput label={t('bufferSize')} min={0} max={16} value={num(c.sftpconfig?.buffer_size)} disabled={disabled}
            onChange={(n) => sftp({ buffer_size: n ?? 0 })} />
          <div className="users-grid__full">
            <TagInput label={t('fingerprints')} hint={t('fingerprintsHint')} mono values={c.sftpconfig?.fingerprints ?? []} disabled={disabled}
              placeholder="SHA256:…" onChange={(v) => sftp({ fingerprints: v })} />
          </div>
          <div className="users-grid__full">
            <Switch checked={!!c.sftpconfig?.disable_concurrent_reads} disabled={disabled} label={t('disableConcurrentReads')}
              onChange={(v) => sftp({ disable_concurrent_reads: v })} />
          </div>
        </div>
      )}

      {provider === 6 && (
        <div className="users-grid">
          <div className="users-grid__full">
            <Input label={t('httpEndpoint')} required={context === 'user'} mono value={c.httpconfig?.endpoint ?? ''} placeholder="https://backend.example.com/api/v1" disabled={disabled}
              onChange={(e) => http({ endpoint: e.target.value })} />
          </div>
          <Input label={t('sftpUsername')} mono value={c.httpconfig?.username ?? ''} autoComplete="off" disabled={disabled}
            onChange={(e) => http({ username: e.target.value })} />
          <SecretField label={t('sftpPassword')} value={c.httpconfig?.password} disabled={disabled} onChange={(v) => http({ password: v })} />
          <SecretField label={t('apiKey')} value={c.httpconfig?.api_key} disabled={disabled} onChange={(v) => http({ api_key: v })} />
          <div className="users-grid__cell-center">
            <Switch checked={!!c.httpconfig?.skip_tls_verify} disabled={disabled} label={t('skipTls')}
              onChange={(v) => http({ skip_tls_verify: v })} />
          </div>
        </div>
      )}
    </div>
  );
}
