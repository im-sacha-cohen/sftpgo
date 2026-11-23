import { Link } from 'react-router-dom';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import type { BaseVirtualFolder, VirtualFolder } from '@/api/types';
import { Button, IconButton, Input, NumberInput, SegmentedControl, Select } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/format';
import { dict } from '../i18n';
import { cleanVirtualPath } from '../model';
import { SizeInput } from './SizeInput';

interface Props {
  value: VirtualFolder[];
  onChange: (v: VirtualFolder[]) => void;
  folders: BaseVirtualFolder[] | undefined;
  /** False when the admin cannot list folders. */
  canList: boolean;
  disabled?: boolean;
}

type QuotaMode = 'included' | 'unlimited' | 'custom';

function quotaMode(v: VirtualFolder): QuotaMode {
  if ((v.quota_size ?? 0) === -1 && (v.quota_files ?? 0) === -1) return 'included';
  if (!v.quota_size && !v.quota_files) return 'unlimited';
  return 'custom';
}

export function VirtualFoldersEditor({ value, onChange, folders, canList, disabled }: Props) {
  const t = useT(dict);
  const { lang } = useLang();
  const set = (i: number, p: Partial<VirtualFolder>) => onChange(value.map((v, idx) => (idx === i ? { ...v, ...p } : v)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { name: '', virtual_path: '', quota_size: -1, quota_files: -1 }]);

  const options = (folders ?? []).map((f) => ({
    value: f.name ?? '',
    label: f.name ?? '',
    description: f.description || f.mapped_path || undefined,
    icon: FolderTree,
  }));

  return (
    <div className="users-stack">
      <p className="muted users-small">{t('vfHint')}</p>
      {!canList && <p className="muted users-small">{t('vfNoAccess')}</p>}
      {value.length === 0 && <p className="muted users-small">{t('vfEmpty')}</p>}
      {value.map((v, i) => {
        const mode = quotaMode(v);
        const known = folders?.find((f) => f.name === v.name);
        const opts = v.name && !options.some((o) => o.value === v.name) ? [...options, { value: v.name, label: v.name, description: undefined, icon: FolderTree }] : options;
        return (
          <div key={i} className="users-vf">
            <div className="users-vf__row">
              <Select
                label={t('vfFolder')}
                searchable
                mono
                value={v.name || null}
                placeholder={t('vfPick')}
                options={opts}
                disabled={disabled || !canList}
                onChange={(name) => {
                  const patch: Partial<VirtualFolder> = { name };
                  if (!v.virtual_path) patch.virtual_path = `/${name}`;
                  set(i, patch);
                }}
              />
              <Input
                label={t('vfPath')}
                mono
                value={v.virtual_path ?? ''}
                placeholder="/partage"
                disabled={disabled}
                onChange={(e) => set(i, { virtual_path: e.target.value })}
                onBlur={(e) => e.target.value && set(i, { virtual_path: cleanVirtualPath(e.target.value) })}
              />
              {!disabled && (
                <IconButton className="users-vf__remove" icon={Trash2} label={t('vfRemove')} onClick={() => remove(i)} />
              )}
            </div>
            <div className="users-vf__row users-vf__row--quota">
              <SegmentedControl<QuotaMode>
                size="sm"
                value={mode}
                disabled={disabled}
                options={[
                  { value: 'included', label: t('vfQuotaIncluded') },
                  { value: 'unlimited', label: t('vfQuotaUnlimited') },
                  { value: 'custom', label: t('vfQuotaCustom') },
                ]}
                onChange={(m) =>
                  set(
                    i,
                    m === 'included'
                      ? { quota_size: -1, quota_files: -1 }
                      : m === 'unlimited'
                        ? { quota_size: 0, quota_files: 0 }
                        : { quota_size: 1024 ** 3, quota_files: 0 },
                  )
                }
              />
              {known && (
                <span className="muted users-small mono">
                  {known.name && (
                    <Link to={`/folders/${encodeURIComponent(known.name)}`}>{known.mapped_path || known.name}</Link>
                  )}
                  {' · '}
                  {formatBytes(known.used_quota_size ?? 0, lang)}
                </span>
              )}
            </div>
            {mode === 'custom' && (
              <div className="users-grid">
                <SizeInput label={t('quotaSize')} value={v.quota_size} disabled={disabled} onChange={(b) => set(i, { quota_size: b })} />
                <NumberInput
                  label={t('quotaFiles')}
                  min={0}
                  value={v.quota_files ? v.quota_files : null}
                  placeholder={t('unlimited')}
                  disabled={disabled}
                  onChange={(n) => set(i, { quota_files: n ?? 0 })}
                />
              </div>
            )}
          </div>
        );
      })}
      {!disabled && (
        <div>
          <Button size="sm" icon={Plus} onClick={add}>
            {t('vfAdd')}
          </Button>
        </div>
      )}
    </div>
  );
}
