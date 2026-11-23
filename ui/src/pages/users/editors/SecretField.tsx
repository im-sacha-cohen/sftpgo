import { useRef, useState, type ReactNode } from 'react';
import { KeyRound, Wand2 } from 'lucide-react';
import type { Secret } from '@/api/types';
import { Button, Field, PasswordInput, Textarea } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict } from '../i18n';
import { generatePassword, isStoredSecret, plainSecret } from '../model';

interface Props {
  label: ReactNode;
  hint?: ReactNode;
  value: Secret | undefined;
  onChange: (v: Secret) => void;
  multiline?: boolean;
  /** Offers a "Générer" button (random high-entropy value). */
  generate?: boolean;
  disabled?: boolean;
}

/**
 * Secret stored server side: shows "Enregistré · Remplacer" and keeps the object
 * as received (the API keeps the stored value). Typing sends {status: "Plain"}.
 */
export function SecretField({ label, hint, value, onChange, multiline, generate, disabled }: Props) {
  const t = useT(dict);
  // the stored secret as first received, to restore it on "Conserver"
  const original = useRef<Secret | undefined>(isStoredSecret(value) ? value : undefined);
  if (!original.current && isStoredSecret(value)) original.current = value;
  const stored = original.current;
  const [replacing, setReplacing] = useState(false);
  const plain = value?.status === 'Plain' ? value.payload ?? '' : '';

  if (stored && !replacing && isStoredSecret(value)) {
    return (
      <Field label={label} hint={hint}>
        <div className="users-secret">
          <KeyRound size={14} aria-hidden="true" className="muted" />
          <span className="mono users-secret__dots">••••••••••••</span>
          <span className="muted users-small">{t('secretStored')}</span>
          <span className="users-grow" />
          {!disabled && (
            <>
              <Button size="sm" variant="ghost" onClick={() => onChange({})}>
                {t('secretClear')}
              </Button>
              <Button size="sm" onClick={() => setReplacing(true)}>
                {t('secretReplace')}
              </Button>
            </>
          )}
        </div>
      </Field>
    );
  }

  const set = (s: string) => {
    if (s) onChange(plainSecret(s));
    else onChange(stored && replacing ? stored : {});
  };
  const aside =
    stored && (replacing || !isStoredSecret(value)) ? (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setReplacing(false);
          onChange(stored);
        }}
      >
        {t('secretKeep')}
      </Button>
    ) : generate && !disabled ? (
      <Button size="sm" variant="ghost" icon={Wand2} onClick={() => set(generatePassword(48))}>
        {t('generate')}
      </Button>
    ) : undefined;

  return multiline ? (
    <Textarea
      label={label}
      hint={hint}
      labelAside={aside}
      mono
      rows={4}
      value={plain}
      disabled={disabled}
      placeholder={stored ? t('secretNew') : undefined}
      onChange={(e) => set(e.target.value)}
    />
  ) : (
    <PasswordInput
      label={label}
      hint={hint}
      labelAside={aside}
      mono
      value={plain}
      disabled={disabled}
      autoComplete="new-password"
      placeholder={stored ? t('secretNew') : undefined}
      onChange={(e) => set(e.target.value)}
    />
  );
}
