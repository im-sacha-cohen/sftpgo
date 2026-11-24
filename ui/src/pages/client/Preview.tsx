import type { ReactNode } from 'react';
import { FilePreview } from '@/components/preview/FilePreview';
import { fetchFile } from './api';
import { useFilesClient } from './fsclient';
import { previewKind as kindOf, type PreviewKind } from '@/components/preview/kinds';

export type { PreviewKind };

/** Viewer type for a file, or null when it should just be downloaded. Size limits are handled by the viewer. */
export function previewKind(name: string, _size?: number): PreviewKind | null {
  return kindOf(name);
}

interface PreviewProps {
  path: string;
  size: number;
  kind: PreviewKind;
  onClose: () => void;
  onDownload: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: string;
  /** The file is still being written. */
  live?: boolean;
  details?: ReactNode;
}

/** The shared file viewer bound to the files client (the user, or a user an administrator acts as). */
export function PreviewModal({ path, ...rest }: PreviewProps) {
  const fc = useFilesClient();
  return (
    <FilePreview
      path={path}
      fetchFile={(signal, range) => fetchFile(fc, path, signal, range)}
      stream={['/user/files', { path }]}
      actingAs={fc.actingAs}
      {...rest}
    />
  );
}
