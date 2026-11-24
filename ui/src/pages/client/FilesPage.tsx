import { useLocation } from 'react-router-dom';
import { Folder, Link2 } from 'lucide-react';
import { Page } from '@/app/PageHeader';
import { useT } from '@/lib/i18n';
import { dirFromPathname, filesRoute, useClientPerms } from './api';
import { DriveLayout, FolderTree, NewButton, SideLink } from './Drive';
import { Explorer } from './Explorer';
import { filesDict } from './i18n';
import './client.css';

/** The user's own files: Drive-like sidebar and the explorer. */
export default function FilesPage() {
  const t = useT(filesDict);
  const perms = useClientPerms();
  const location = useLocation();
  const dir = dirFromPathname(location.pathname);
  return (
    <Page>
      <DriveLayout
        label={t('title')}
        sidebar={
          <>
            <NewButton />
            <FolderTree rootLabel={t('root')} rootIcon={Folder} current={dir} route={filesRoute} />
            {perms.shares && (
              <>
                <div className="drive-side-sep" />
                <SideLink to="/shares" icon={Link2}>
                  {t('sharedLinks')}
                </SideLink>
              </>
            )}
          </>
        }
      >
        <Explorer dir={dir} route={filesRoute} actionsInSidebar />
      </DriveLayout>
    </Page>
  );
}
