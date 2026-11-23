import { Link } from 'react-router-dom';
import { Trash2, UsersRound } from 'lucide-react';
import type { Group, GroupMapping } from '@/api/types';
import { IconButton, MultiSelect, SegmentedControl } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict } from '../i18n';

interface Props {
  value: GroupMapping[];
  onChange: (v: GroupMapping[]) => void;
  groups: Group[] | undefined;
  canList: boolean;
  disabled?: boolean;
}

type GT = '1' | '2' | '3';

/** Group memberships of a user, each with its type (primary / secondary / membership). */
export function GroupsEditor({ value, onChange, groups, canList, disabled }: Props) {
  const t = useT(dict);
  const names = value.map((g) => g.name ?? '');
  const options = [
    ...(groups ?? []).map((g) => ({ value: g.name ?? '', label: g.name ?? '', description: g.description || undefined, icon: UsersRound })),
    ...names.filter((n) => !(groups ?? []).some((g) => g.name === n)).map((n) => ({ value: n, label: n, icon: UsersRound })),
  ];

  const setType = (name: string, type: 1 | 2 | 3) =>
    onChange(
      value.map((g) => {
        if (g.name === name) return { ...g, type };
        // only one primary group: demote the previous one
        if (type === 1 && g.type === 1) return { ...g, type: 2 as const };
        return g;
      }),
    );

  return (
    <div className="users-stack">
      <p className="muted users-small">{t('groupsHint')}</p>
      {!canList && <p className="muted users-small">{t('groupsNoAccess')}</p>}
      <MultiSelect
        aria-label={t('groupsTitle')}
        values={names}
        options={options}
        placeholder={t('groupsAdd')}
        disabled={disabled || !canList}
        onChange={(next) =>
          onChange(
            next.map((n) => value.find((g) => g.name === n) ?? { name: n, type: value.some((g) => g.type === 1) ? 2 : 1 }),
          )
        }
      />
      {value.length > 0 && (
        <ul className="users-groups">
          {value.map((g) => (
            <li key={g.name} className="users-groups__item">
              <UsersRound size={14} aria-hidden="true" className="muted" />
              <Link className="mono" to={`/groups/${encodeURIComponent(g.name ?? '')}`}>
                {g.name}
              </Link>
              <span className="users-grow" />
              <SegmentedControl<GT>
                size="sm"
                value={String(g.type ?? 2) as GT}
                disabled={disabled}
                options={[
                  { value: '1', label: t('gtPrimary') },
                  { value: '2', label: t('gtSecondary') },
                  { value: '3', label: t('gtMembership') },
                ]}
                onChange={(v) => setType(g.name ?? '', Number(v) as 1 | 2 | 3)}
              />
              {!disabled && (
                <IconButton
                  size="sm"
                  icon={Trash2}
                  label={t('removeGroup', { name: g.name ?? '' })}
                  onClick={() => onChange(value.filter((x) => x.name !== g.name))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
