/**
 * SFTPGo logo — "Dossier épuré" (validated 2026-11-23): flat amber folder with
 * a darker tab, and the network node underneath in ink. The node follows the
 * text colour so the mark works on light and dark backgrounds.
 */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="logo-mark"
    >
      <path d="M6 14a4 4 0 0 1 4-4h13.2a4 4 0 0 1 2.9 1.2L30 15h24a4 4 0 0 1 4 4v3H6z" fill="#D69600" />
      <rect x="6" y="19" width="52" height="31" rx="5" fill="#FFC21A" />
      <path d="M32 50v5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M22 57h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="57" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo__word" style={{ fontSize: Math.round(size * 0.66) }}>
        SFTP<span className="logo__go">Go</span>
      </span>
    </span>
  );
}
