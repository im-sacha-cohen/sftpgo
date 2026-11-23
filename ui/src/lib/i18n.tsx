import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Tiny i18n. Each feature owns its dictionary next to its code:
 *
 *   const dict = { fr: { title: 'Utilisateurs', count: '{n} comptes' }, en: { title: 'Users', count: '{n} accounts' } };
 *   const t = useT(dict);  t('count', { n: 48 })
 *
 * French is the reference language; a missing English key falls back to French,
 * then to the key itself. `common` holds strings shared across the app.
 */
export type Lang = 'fr' | 'en';
export type Dict<K extends string = string> = { fr: Record<K, string>; en: Partial<Record<K, string>> };

const STORAGE_KEY = 'sftpgo-console-lang';

// The Console ships in English only: French dictionaries stay in the code but
// are never selected. Set this back to the stored/browser choice to restore it.
function initialLang(): Lang {
  return 'en';
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'fr', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

export function format(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function useT<K extends string>(dict: Dict<K>) {
  const { lang } = useLang();
  return useCallback(
    (key: K, vars?: Record<string, string | number>) => {
      const s = (lang === 'en' ? dict.en[key] : undefined) ?? dict.fr[key] ?? key;
      return format(s, vars);
    },
    [lang, dict],
  );
}

export const common = {
  fr: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    create: 'Créer',
    add: 'Ajouter',
    remove: 'Retirer',
    close: 'Fermer',
    search: 'Rechercher',
    loading: 'Chargement…',
    retry: 'Réessayer',
    yes: 'Oui',
    no: 'Non',
    none: 'Aucun',
    all: 'Tous',
    actions: 'Actions',
    status: 'Statut',
    enabled: 'Activé',
    disabled: 'Désactivé',
    active: 'Actif',
    inactive: 'Inactif',
    name: 'Nom',
    description: 'Description',
    never: 'Jamais',
    unlimited: 'Illimité',
    saved: 'Modifications enregistrées',
    deleted: 'Supprimé',
    error: 'Une erreur est survenue',
    confirmDelete: 'Supprimer « {name} » ?',
    confirmDeleteMsg: 'Cette action est définitive.',
    notFound: 'Introuvable',
    forbidden: 'Vous n’avez pas la permission d’accéder à cette page.',
    back: 'Retour',
    copy: 'Copier',
    copied: 'Copié',
    download: 'Télécharger',
    upload: 'Déposer',
    refresh: 'Actualiser',
    export: 'Exporter',
    import: 'Importer',
    more: 'Plus d’actions',
  },
  en: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    add: 'Add',
    remove: 'Remove',
    close: 'Close',
    search: 'Search',
    loading: 'Loading…',
    retry: 'Retry',
    yes: 'Yes',
    no: 'No',
    none: 'None',
    all: 'All',
    actions: 'Actions',
    status: 'Status',
    enabled: 'Enabled',
    disabled: 'Disabled',
    active: 'Active',
    inactive: 'Inactive',
    name: 'Name',
    description: 'Description',
    never: 'Never',
    unlimited: 'Unlimited',
    saved: 'Changes saved',
    deleted: 'Deleted',
    error: 'Something went wrong',
    confirmDelete: 'Delete “{name}”?',
    confirmDeleteMsg: 'This cannot be undone.',
    notFound: 'Not found',
    forbidden: 'You do not have permission to access this page.',
    back: 'Back',
    copy: 'Copy',
    copied: 'Copied',
    download: 'Download',
    upload: 'Upload',
    refresh: 'Refresh',
    export: 'Export',
    import: 'Import',
    more: 'More actions',
  },
} satisfies Dict;

export function useCommon() {
  return useT(common as Dict<keyof typeof common.fr>);
}
