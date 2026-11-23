import { useEffect, type ReactNode } from 'react';
import { useBreadcrumbs, type Crumb } from './layout-context';
import './page.css';

interface PageHeaderProps {
  title: ReactNode;
  /** Plain-text title for the browser tab when `title` is not a string. */
  docTitle?: string;
  subtitle?: ReactNode;
  /** Breadcrumbs shown in the top bar; the current page is appended automatically. */
  crumbs?: Crumb[];
  actions?: ReactNode;
  /** Rendered left of the title (avatar, icon…). */
  leading?: ReactNode;
  /** Rendered under the header (tabs, filters…). */
  children?: ReactNode;
}

/**
 * Standard page header: sets breadcrumbs + document title, renders the title row.
 * Use inside <Page>.
 */
export function PageHeader({ title, docTitle, subtitle, crumbs = [], actions, leading, children }: PageHeaderProps) {
  const text = docTitle ?? (typeof title === 'string' ? title : '');
  useBreadcrumbs([...crumbs, { label: text }]);
  useEffect(() => {
    document.title = text ? `${text} · SFTPGo` : 'SFTPGo';
  }, [text]);
  return (
    <div className="page-header">
      <div className="page-header__row">
        {leading}
        <div className="page-header__titles">
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Page body wrapper with the standard padding and vertical rhythm. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? 'page page--wide' : 'page'}>{children}</div>;
}

/** Two-column layout: main content + side column that wraps under on small screens. */
export function Columns({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="page-columns">
      <div className="page-columns__main">{main}</div>
      <div className="page-columns__side">{side}</div>
    </div>
  );
}
