// Runtime configuration injected by the Go handler as <meta> tags (see
// internal/httpd/console.go). In `vite dev` the tags are absent and the
// defaults below are used, with /api proxied to a local SFTPGo.

function meta(name: string): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
}

export const config = {
  /** Router basename, e.g. "/web/console". */
  consoleBase: meta('sftpgo-console-base') ?? '/',
  /** REST API prefix. */
  apiBase: meta('sftpgo-api-base') ?? '/api/v2',
  /** Static files prefix (branding, legacy assets). */
  staticBase: meta('sftpgo-static-base') ?? '/static',
  webAdmin: (meta('sftpgo-webadmin') ?? 'true') === 'true',
  webClient: (meta('sftpgo-webclient') ?? 'true') === 'true',
};
