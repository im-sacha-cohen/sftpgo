#!/usr/bin/env node
// Seeds a local SFTPGo instance with demo data for developing the Console.
// Usage: SFTPGO_URL=http://127.0.0.1:8080 SFTPGO_ADMIN=admin SFTPGO_PASSWORD=... node scripts/seed-dev.mjs
// Existing objects are skipped, so it can be re-run safely.

const base = process.env.SFTPGO_URL ?? 'http://127.0.0.1:8080';
const admin = process.env.SFTPGO_ADMIN ?? 'admin';
const password = process.env.SFTPGO_PASSWORD;
if (!password) {
  console.error('SFTPGO_PASSWORD is required');
  process.exit(1);
}

const tokRes = await fetch(`${base}/api/v2/token`, {
  headers: { Authorization: 'Basic ' + Buffer.from(`${admin}:${password}`).toString('base64') },
});
if (!tokRes.ok) throw new Error(`token: ${tokRes.status} ${await tokRes.text()}`);
const { access_token: token } = await tokRes.json();

async function post(path, body) {
  const r = await fetch(`${base}/api/v2${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (r.ok) return console.log(`✓ ${path} ${body.name ?? body.username ?? body.ipornet ?? ''}`);
  if (r.status === 409 || /already exists|UNIQUE/i.test(text)) return console.log(`· ${path} exists`);
  console.log(`✗ ${path} ${r.status} ${text.slice(0, 200)}`);
}

const GB = 1024 * 1024 * 1024;
const all = { '/': ['*'] };
const readOnly = { '/': ['list', 'download'] };

await post('/roles', { name: 'support', description: 'Équipe support niveau 1' });

await post('/folders', { name: 'modeles-contrats', mapped_path: '/tmp/sftpgo-dev/modeles-contrats', description: 'Modèles partagés' });
await post('/folders', { name: 'archive-factures', mapped_path: '/tmp/sftpgo-dev/archive', description: 'Archive comptable' });

await post('/groups', {
  name: 'partenaires',
  description: 'Partenaires externes',
  user_settings: { permissions: { '/out': ['list', 'download'] }, filters: { denied_protocols: ['FTP'] } },
});
await post('/groups', { name: 'comptabilite', description: 'Cabinet et équipe comptable' });
await post('/groups', { name: 'interne', description: 'Salariés' });

const user = (u) =>
  post('/users', {
    status: 1,
    password: 'Demo-' + Math.random().toString(36).slice(2, 12),
    permissions: all,
    filesystem: { provider: 0 },
    ...u,
  });

await user({
  username: 'partenaire-acme',
  email: 'echanges@acme.example',
  description: 'Échanges ACME',
  quota_size: 50 * GB,
  expiration_date: Date.parse('2026-12-31T23:59:59Z'),
  permissions: { '/': ['list', 'download'], '/in': ['*'] },
  groups: [{ name: 'partenaires', type: 1 }],
  filesystem: {
    provider: 1,
    s3config: { bucket: 'acme-exchange', region: 'eu-west-3', access_key: 'AKIADEMO000000003F7Q', access_secret: { status: 'Plain', payload: 'demo-secret' }, key_prefix: 'in/' },
  },
  filters: { allowed_ip: ['185.42.10.0/24'], file_extensions: [{ path: '/in', denied_extensions: ['.exe', '.bat', '.sh'] }] },
});
await user({ username: 'compta-ext', description: 'Cabinet comptable', quota_size: 10 * GB, groups: [{ name: 'comptabilite', type: 1 }], virtual_folders: [{ name: 'archive-factures', virtual_path: '/archive' }] });
await user({ username: 'backup-nas', description: 'Sauvegarde nocturne', quota_size: 1000 * GB, filters: { denied_protocols: ['FTP', 'HTTP', 'DAV'] } });
await user({
  username: 'marketing',
  description: 'Équipe marketing',
  groups: [{ name: 'interne', type: 1 }],
  filesystem: { provider: 2, gcsconfig: { bucket: 'mkt-assets', automatic_credentials: 1 } },
});
await user({
  username: 'presta-video',
  description: 'Prestataire vidéo',
  quota_size: 200 * GB,
  expiration_date: Date.parse('2026-11-30T23:59:59Z'),
  filesystem: { provider: 3, azblobconfig: { container: 'rushes', account_name: 'demovideo', account_key: { status: 'Plain', payload: 'ZGVtbw==' } } },
});
await user({ username: 'auditeur-2026', description: 'Audit annuel · lecture seule', quota_size: 2 * GB, permissions: readOnly, filesystem: { provider: 4, cryptconfig: { passphrase: { status: 'Plain', payload: crypto.randomUUID() + crypto.randomUUID() } } } });
await user({ username: 'legacy-ftp', description: 'Ancien import ERP', status: 0, quota_size: 5 * GB });

await post('/admins', { username: 'support-1', password: 'Demo-' + Math.random().toString(36).slice(2, 12), status: 1, permissions: ['view_users', 'view_conns', 'close_conns', 'view_status'], role: 'support', email: 'support@example.com' });

await post('/eventactions', {
  name: 'notifier-compta',
  description: 'E-mail à la comptabilité',
  type: 3,
  options: { email_config: { recipients: ['compta@example.com'], subject: 'Nouvelle facture de {{.Name}} : {{.ObjectName}}', body: 'Le fichier {{.VirtualPath}} a été déposé.' } },
});
await post('/eventactions', {
  name: 'copier-archive',
  description: 'Copie vers /archive',
  type: 7,
  options: { fs_config: { type: 5, copy: [{ key: '{{.VirtualPath}}', value: '/archive/{{.Year}}/{{.Month}}/' }] } },
});
await post('/eventactions', {
  name: 'webhook-erp',
  description: 'Notifie l’ERP',
  type: 1,
  options: { http_config: { endpoint: 'https://erp.example.com/hooks/facture', method: 'POST', timeout: 10, body: '{"path":"{{.VirtualPath}}","size":{{.FileSize}}}' } },
});
await post('/eventactions', { name: 'sauvegarde', description: 'Sauvegarde de la configuration', type: 4 });

await post('/eventrules', {
  name: 'notifier-compta-factures',
  description: 'Notifier la compta à chaque facture',
  status: 1,
  trigger: 1,
  conditions: { fs_events: ['upload'], options: { names: [{ pattern: 'partenaire-*' }], fs_paths: [{ pattern: '/in/factures/*' }], protocols: ['SFTP', 'DAV', 'HTTP'] } },
  actions: [
    { name: 'notifier-compta', order: 1 },
    { name: 'copier-archive', order: 2 },
    { name: 'webhook-erp', order: 3, options: { is_failure_action: false } },
  ],
});
await post('/eventrules', {
  name: 'archive-nocturne',
  description: 'Sauvegarde chaque nuit',
  status: 1,
  trigger: 3,
  conditions: { schedules: [{ hour: '2', day_of_week: '*', day_of_month: '*', month: '*' }] },
  actions: [{ name: 'sauvegarde', order: 1 }],
});

await post('/iplists/1', { type: 1, ipornet: '10.0.0.0/8', description: 'Réseau interne', mode: 1, protocols: 0 });
await post('/iplists/2', { type: 2, ipornet: '203.0.113.54/32', description: 'Scanner SSH', mode: 2, protocols: 1 });

console.log('done');
