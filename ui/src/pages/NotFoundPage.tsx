import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useT } from '@/lib/i18n';

const dict = {
  fr: { title: 'Page introuvable', text: 'Cette adresse ne correspond à aucune page de la console.', home: 'Retour à l’accueil' },
  en: { title: 'Page not found', text: 'This address does not match any page of the console.', home: 'Back to home' },
};

export default function NotFoundPage() {
  const t = useT(dict);
  return (
    <Page>
      <PageHeader title={t('title')} />
      <EmptyState icon={Compass} title={t('title')} description={t('text')} action={<Link to="/">{t('home')}</Link>} />
    </Page>
  );
}
