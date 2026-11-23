import { useParams } from 'react-router-dom';
import { FolderLock } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useAuth } from '@/lib/auth';
import { FsBrowser } from '../userfiles/FsBrowser';

// Read-only explorer over a virtual folder's content
// (GET /folders/{name}/fs/dirs|files, needs manage_folders + view_user_files).

const fsBase = (name: string) => `/folders/${encodeURIComponent(name)}/fs`;
const route = (name: string, dir: string) =>
  `/folders/${encodeURIComponent(name)}/files${dir === '/' ? '' : dir.split('/').map(encodeURIComponent).join('/')}`;

export default function FolderFilesPage() {
  const { can } = useAuth();
  const params = useParams();
  const name = params.name ?? '';
  const dir = '/' + (params['*'] ?? '').split('/').filter(Boolean).join('/');
  const crumbs = [
    { label: 'Folders', to: '/folders' },
    { label: name, to: `/folders/${encodeURIComponent(name)}` },
  ];
  if (!can('view_user_files') || !can('manage_folders')) {
    return (
      <Page>
        <PageHeader title={name} crumbs={crumbs} />
        <EmptyState
          icon={FolderLock}
          title="You can’t open this folder’s files"
          description="This needs the “manage_folders” and “view_user_files” permissions on your administrator account."
        />
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader
        title={<span className="mono">{name}</span>}
        docTitle={`Files of folder ${name}`}
        subtitle="Read-only view of everything stored in this virtual folder, whoever uploaded it."
        crumbs={crumbs}
      />
      <FsBrowser base={fsBase(name)} cacheKey={['folder-files', name]} dir={dir} route={(d) => route(name, d)} rootLabel={name} />
    </Page>
  );
}
