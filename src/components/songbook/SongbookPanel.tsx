import { SiedleckiViewer } from '@/components/siedlecki/SiedleckiViewer';
import type { PilotProps } from '@/components/projector/PilotStrip';

interface Props {
  initialPage?: number;
  onClose?: () => void;
  pilot?: PilotProps;
}

export function SongbookPanel({ initialPage, onClose, pilot }: Props) {
  return <SiedleckiViewer initialPage={initialPage} onClose={onClose} pilot={pilot} />;
}
