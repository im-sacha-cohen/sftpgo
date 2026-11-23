import type { ReactNode } from 'react';
import type { BaseUserFilters } from '@/api/types';
import { Card, NumberInput } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict } from '../i18n';
import { SizeInput } from './SizeInput';

/** Fields shared by User and GroupUserSettings. */
export interface LimitsValue {
  quota_size?: number;
  quota_files?: number;
  upload_bandwidth?: number;
  download_bandwidth?: number;
  upload_data_transfer?: number;
  download_data_transfer?: number;
  total_data_transfer?: number;
  max_sessions?: number;
  filters?: BaseUserFilters;
}

interface Props {
  value: LimitsValue;
  onChange: (patch: Partial<LimitsValue>) => void;
  disabled?: boolean;
  /** Extra fields in the "Sessions et validité" card (expiration…). */
  validity?: ReactNode;
}

const n = (v: number | undefined) => (v ? v : null);

export function LimitsEditor({ value, onChange, disabled, validity }: Props) {
  const t = useT(dict);
  const f = value.filters ?? {};
  const setF = (p: Partial<BaseUserFilters>) => onChange({ filters: { ...f, ...p } });
  const total = !!value.total_data_transfer;

  return (
    <>
      <Card title={t('quotaTitle')}>
        <div className="users-grid">
          <SizeInput
            label={t('quotaSize')}
            hint={t('quotaSizeHint')}
            value={value.quota_size}
            disabled={disabled}
            onChange={(b) => onChange({ quota_size: b })}
          />
          <NumberInput
            label={t('quotaFiles')}
            hint={t('quotaSizeHint')}
            min={0}
            value={n(value.quota_files)}
            placeholder={t('unlimited')}
            disabled={disabled}
            onChange={(v) => onChange({ quota_files: v ?? 0 })}
          />
        </div>
      </Card>

      <Card title={t('bandwidthTitle')}>
        <div className="users-grid">
          <NumberInput label={t('uploadBw')} hint={t('bwHint')} min={0} value={n(value.upload_bandwidth)} placeholder={t('unlimited')} disabled={disabled}
            onChange={(v) => onChange({ upload_bandwidth: v ?? 0 })} />
          <NumberInput label={t('downloadBw')} hint={t('bwHint')} min={0} value={n(value.download_bandwidth)} placeholder={t('unlimited')} disabled={disabled}
            onChange={(v) => onChange({ download_bandwidth: v ?? 0 })} />
        </div>
      </Card>

      <Card title={t('transferTitle')}>
        <p className="muted users-small users-card-intro">{t('transferHint')}</p>
        <div className="users-grid users-grid--3">
          <NumberInput label={t('totalTransfer')} min={0} value={n(value.total_data_transfer)} placeholder={t('unlimited')} disabled={disabled}
            onChange={(v) => onChange({ total_data_transfer: v ?? 0 })} />
          <NumberInput label={t('uploadTransfer')} min={0} value={total ? null : n(value.upload_data_transfer)} placeholder={t('unlimited')}
            disabled={disabled || total} onChange={(v) => onChange({ upload_data_transfer: v ?? 0 })} />
          <NumberInput label={t('downloadTransfer')} min={0} value={total ? null : n(value.download_data_transfer)} placeholder={t('unlimited')}
            disabled={disabled || total} onChange={(v) => onChange({ download_data_transfer: v ?? 0 })} />
        </div>
      </Card>

      <Card title={t('sessionsTitle')}>
        <div className="users-grid">
          <NumberInput label={t('maxSessions')} hint={t('maxSessionsHint')} min={0} value={n(value.max_sessions)} placeholder={t('unlimited')}
            disabled={disabled} onChange={(v) => onChange({ max_sessions: v ?? 0 })} />
          {validity}
          <NumberInput label={t('pwdExpiration')} min={0} value={n(f.password_expiration)} placeholder="—" disabled={disabled}
            onChange={(v) => setF({ password_expiration: v ?? 0 })} />
          <NumberInput label={t('pwdStrength')} hint={t('pwdStrengthHint')} min={0} max={80} value={n(f.password_strength)} placeholder="0"
            disabled={disabled} onChange={(v) => setF({ password_strength: v ?? 0 })} />
        </div>
      </Card>

      <Card title={t('sharesTitle')}>
        <div className="users-grid">
          <NumberInput label={t('sharesDefault')} min={0} value={n(f.default_shares_expiration)} placeholder="—" disabled={disabled}
            onChange={(v) => setF({ default_shares_expiration: v ?? 0 })} />
          <NumberInput label={t('sharesMax')} min={0} value={n(f.max_shares_expiration)} placeholder="—" disabled={disabled}
            onChange={(v) => setF({ max_shares_expiration: v ?? 0 })} />
        </div>
      </Card>
    </>
  );
}
