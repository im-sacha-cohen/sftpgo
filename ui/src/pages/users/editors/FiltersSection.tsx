import type { BaseUserFilters, SupportedProtocols } from '@/api/types';
import { Card } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict } from '../i18n';
import { NetworkEditor, PatternsEditor, ProtocolsEditor } from './FiltersEditors';

interface Props {
  value: BaseUserFilters;
  onChange: (f: BaseUserFilters) => void;
  disabled?: boolean;
}

export function ProtocolsCard({ deniedByGroup, ...p }: Props & { deniedByGroup?: Map<SupportedProtocols, string> }) {
  const t = useT(dict);
  return (
    <Card title={t('protocolsTitle')}>
      <ProtocolsEditor {...p} deniedByGroup={deniedByGroup} />
    </Card>
  );
}

export function NetworkCard({ withMfa, ...p }: Props & { withMfa?: boolean }) {
  const t = useT(dict);
  return (
    <Card title={t('networkTitle')}>
      <NetworkEditor {...p} withMfa={withMfa} />
    </Card>
  );
}

export function PatternsCard(p: Props) {
  const t = useT(dict);
  return (
    <Card title={t('patternsTitle')}>
      <PatternsEditor {...p} />
    </Card>
  );
}
