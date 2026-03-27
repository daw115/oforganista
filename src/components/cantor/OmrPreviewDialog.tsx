import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X, PenLine } from 'lucide-react';
import { SheetMusicViewer } from './SheetMusicViewer';

interface Props {
  open: boolean;
  musicxml: string;
  title: string;
  onConfirm: (musicxml: string, title: string) => void;
  onEdit: (musicxml: string, title: string) => void;
  onCancel: () => void;
}

export function OmrPreviewDialog({ open, musicxml, title: initialTitle, onConfirm, onEdit, onCancel }: Props) {
  const [title, setTitle] = useState(initialTitle);

  // Create a blob URL for SheetMusicViewer
  const blobUrl = URL.createObjectURL(new Blob([musicxml], { type: 'application/xml' }));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Podgląd rozpoznanych nut</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Tytuł melodii</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nazwa melodii" />
          </div>

          <div className="border border-border rounded-lg overflow-hidden bg-white p-2">
            <SheetMusicViewer musicxmlUrl={blobUrl} compact={false} />
          </div>

          <div className="flex gap-2 justify-end flex-wrap">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="w-4 h-4 mr-1" /> Odrzuć
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(musicxml, title)}>
              <PenLine className="w-4 h-4 mr-1" /> Edytuj nuty
            </Button>
            <Button size="sm" onClick={() => onConfirm(musicxml, title)} disabled={!title.trim()}>
              <Check className="w-4 h-4 mr-1" /> Zapisz do biblioteki
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
