import { useRouteError } from 'react-router-dom';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { Page } from '@/app/PageHeader';

/** Shown instead of React Router's raw error screen when a page fails to load or crashes. */
export default function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error ?? '');
  const staleBuild = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
  return (
    <Page>
      <EmptyState
        icon={TriangleAlert}
        title={staleBuild ? 'The console was updated' : 'This page couldn’t be displayed'}
        description={
          staleBuild
            ? 'A newer version was installed while this tab was open. Reload to get it.'
            : `Something went wrong while showing this page. ${message}`
        }
        action={
          <Button variant="primary" icon={RefreshCw} onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      />
    </Page>
  );
}
