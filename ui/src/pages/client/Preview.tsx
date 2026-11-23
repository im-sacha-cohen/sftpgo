import { request } from '@/api/client';
import { FilePreview } from '@/components/preview/FilePreview';
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
}

/** The shared file viewer bound to the logged-in user's files (streams audio/video). */
export function PreviewModal({ path, ...rest }: PreviewProps) {
  return (
    <FilePreview
      path={path}
      fetchFile={(signal, range) =>
        request<Response>('/user/files', { query: { path }, raw: true, signal, headers: range ? { Range: range } : undefined })
      }
      stream={['/user/files', { path }]}
      {...rest}
    />
  );
}
