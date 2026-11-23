import type { Lang } from '@/lib/i18n';

/** Placeholders supported by event actions (internal/common/eventmanager.go). */
export const VARIABLES: { token: string; fr: string; en: string; group: 'file' | 'user' | 'event' | 'date' | 'object' }[] = [
  { token: '{{.ObjectName}}', fr: 'nom du fichier', en: 'file name', group: 'file' },
  { token: '{{.ObjectBaseName}}', fr: 'nom sans extension', en: 'base name', group: 'file' },
  { token: '{{.Ext}}', fr: 'extension', en: 'extension', group: 'file' },
  { token: '{{.VirtualPath}}', fr: 'chemin', en: 'path', group: 'file' },
  { token: '{{.EscapedVirtualPath}}', fr: 'chemin (URL)', en: 'path (URL-escaped)', group: 'file' },
  { token: '{{.VirtualDirPath}}', fr: 'dossier', en: 'directory', group: 'file' },
  { token: '{{.VirtualTargetPath}}', fr: 'chemin cible', en: 'target path', group: 'file' },
  { token: '{{.VirtualTargetDirPath}}', fr: 'dossier cible', en: 'target directory', group: 'file' },
  { token: '{{.TargetName}}', fr: 'nom cible', en: 'target name', group: 'file' },
  { token: '{{.FsPath}}', fr: 'chemin disque', en: 'filesystem path', group: 'file' },
  { token: '{{.FsTargetPath}}', fr: 'chemin disque cible', en: 'filesystem target path', group: 'file' },
  { token: '{{.FileSize}}', fr: 'taille', en: 'size', group: 'file' },
  { token: '{{.Elapsed}}', fr: 'durée (ms)', en: 'elapsed (ms)', group: 'file' },
  { token: '{{.Metadata}}', fr: 'métadonnées', en: 'metadata', group: 'file' },
  { token: '{{.MetadataString}}', fr: 'métadonnées (texte)', en: 'metadata (string)', group: 'file' },
  { token: '{{.Name}}', fr: 'utilisateur', en: 'username', group: 'user' },
  { token: '{{.Email}}', fr: 'e-mail', en: 'email', group: 'user' },
  { token: '{{.Role}}', fr: 'rôle', en: 'role', group: 'user' },
  { token: '{{.UID}}', fr: 'UID', en: 'UID', group: 'user' },
  { token: '{{.IP}}', fr: 'adresse IP', en: 'IP address', group: 'event' },
  { token: '{{.Protocol}}', fr: 'protocole', en: 'protocol', group: 'event' },
  { token: '{{.Event}}', fr: 'événement', en: 'event', group: 'event' },
  { token: '{{.Status}}', fr: 'statut', en: 'status', group: 'event' },
  { token: '{{.StatusString}}', fr: 'statut (texte)', en: 'status (text)', group: 'event' },
  { token: '{{.ErrorString}}', fr: 'erreur', en: 'error', group: 'event' },
  { token: '{{.ObjectType}}', fr: 'type d’objet', en: 'object type', group: 'object' },
  { token: '{{.ObjectData}}', fr: 'données de l’objet', en: 'object data', group: 'object' },
  { token: '{{.ObjectDataString}}', fr: 'données (texte)', en: 'object data (string)', group: 'object' },
  { token: '{{.Timestamp}}', fr: 'horodatage', en: 'timestamp', group: 'date' },
  { token: '{{.DateTime}}', fr: 'date et heure', en: 'date & time', group: 'date' },
  { token: '{{.Year}}', fr: 'année', en: 'year', group: 'date' },
  { token: '{{.Month}}', fr: 'mois', en: 'month', group: 'date' },
  { token: '{{.Day}}', fr: 'jour', en: 'day', group: 'date' },
  { token: '{{.Hour}}', fr: 'heure', en: 'hour', group: 'date' },
  { token: '{{.Minute}}', fr: 'minute', en: 'minute', group: 'date' },
];

export function variableLabel(token: string, lang: Lang): string | null {
  const v = VARIABLES.find((x) => x.token === token);
  if (v) return lang === 'en' ? v.en : v.fr;
  const idp = /^\{\{\.IDPField([A-Za-z0-9_]+)\}\}$/.exec(token);
  if (idp) return `IDP ${idp[1]}`;
  return null;
}

/** Splits a text into plain parts and `{{.X}}` tokens. */
export function splitVariables(text: string): { text: string; token: boolean }[] {
  const out: { text: string; token: boolean }[] = [];
  const re = /\{\{\s*\.[A-Za-z0-9_]+\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), token: false });
    out.push({ text: m[0].replace(/\s+/g, ''), token: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), token: false });
  return out;
}
