import { useEffect, useState, type ReactNode } from 'react';
import { NumberInput, Select } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict } from '../i18n';
import { splitBytes, UNIT_BYTES, type SizeUnit } from '../model';

interface Props {
  label: ReactNode;
  hint?: ReactNode;
  /** Bytes, 0 = unlimited. */
  value: number | undefined;
  onChange: (bytes: number) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** NumberInput + unit (Mo/Go/To) bound to a value in bytes. */
export function SizeInput({ label, hint, value, onChange, disabled, placeholder }: Props) {
  const t = useT(dict);
  const initial = splitBytes(value);
  const [unit, setUnit] = useState<SizeUnit>(initial.unit);
  const [num, setNum] = useState<number | null>(initial.value);

  // follow external resets (Annuler)
  useEffect(() => {
    const cur = num ? Math.round(num * UNIT_BYTES[unit]) : 0;
    if (cur !== (value ?? 0)) {
      const s = splitBytes(value);
      setNum(s.value);
      setUnit(s.unit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (n: number | null, u: SizeUnit) => onChange(n ? Math.round(n * UNIT_BYTES[u]) : 0);

  return (
    <div className="users-size">
      <NumberInput
        label={label}
        hint={hint}
        value={num}
        min={0}
        precision={2}
        disabled={disabled}
        placeholder={placeholder ?? t('unlimited')}
        onChange={(n) => {
          setNum(n);
          emit(n, unit);
        }}
      />
      <Select<SizeUnit>
        className="users-size__unit"
        aria-label="Unit"
        value={unit}
        disabled={disabled}
        options={[
          { value: 'MB', label: t('unitMB') },
          { value: 'GB', label: t('unitGB') },
          { value: 'TB', label: t('unitTB') },
        ]}
        onChange={(u) => {
          setUnit(u);
          emit(num, u);
        }}
      />
    </div>
  );
}
