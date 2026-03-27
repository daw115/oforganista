import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Plus, FileUp, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as pdfjsLib from 'pdfjs-dist';

// Use local worker
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const BUCKET = 'songbook';

interface PagePreview {
  pageNum: number;
  thumbnail: string;
  songTitle: string;
  isNewSong: boolean;
  blob?: Blob;
}

interface Props {
  onAdded: () => void;
}

async function renderPdfPage(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/webp', 0.9));
}

async function fileToBlob(file: File): Promise<Blob> {
  return file;
}

export function AddSongDialog({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<PagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [mode, setMode] = useState<'choose' | 'pdf' | 'image'>('choose');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPages([]);
    setError('');
    setLoading(false);
    setUploading(false);
    setPdfDoc(null);
    setMode('choose');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePdfFile = async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);

      const previews: PagePreview[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const canvas = await renderPdfPage(pdf, i, 0.4);
        previews.push({
          pageNum: i,
          thumbnail: canvas.toDataURL('image/jpeg', 0.6),
          songTitle: i === 1 ? '' : '',
          isNewSong: i === 1,
        });
      }
      setPages(previews);
    } catch (e: any) {
      setError('Nie udało się wczytać PDF: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleImageFiles = async (files: FileList) => {
    setLoading(true);
    setError('');
    try {
      const previews: PagePreview[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const url = URL.createObjectURL(file);
        previews.push({
          pageNum: i + 1,
          thumbnail: url,
          songTitle: i === 0 ? '' : '',
          isNewSong: i === 0,
          blob: file,
        });
      }
      setPages(previews);
    } catch (e: any) {
      setError('Nie udało się wczytać obrazów: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const toggleSongStart = (idx: number) => {
    if (idx === 0) return;
    setPages(prev => prev.map((p, i) =>
      i === idx ? { ...p, isNewSong: !p.isNewSong, songTitle: !p.isNewSong ? '' : p.songTitle } : p
    ));
  };

  const setSongTitle = (idx: number, title: string) => {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, songTitle: title } : p));
  };

  const handleSubmit = async () => {
    const songStarts = pages.filter(p => p.isNewSong);
    if (songStarts.length === 0) { setError('Brak stron do dodania'); return; }
    const missing = songStarts.find(p => !p.songTitle.trim());
    if (missing) { setError(`Podaj tytuł dla pieśni na stronie ${missing.pageNum}`); return; }

    setUploading(true);
    setError('');

    try {
      // Group pages into songs
      const songs: { title: string; pageIndices: number[] }[] = [];
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].isNewSong) {
          songs.push({ title: pages[i].songTitle.trim(), pageIndices: [i] });
        } else {
          songs[songs.length - 1]?.pageIndices.push(i);
        }
      }

      for (const song of songs) {
        // Create song entry
        const { data: songRow, error: songErr } = await supabase
          .from('songbook_songs')
          .insert({ title: song.title, category: 'Własne' })
          .select()
          .single();
        if (songErr || !songRow) throw songErr;

        for (let pi = 0; pi < song.pageIndices.length; pi++) {
          const idx = song.pageIndices[pi];
          const p = pages[idx];
          let blob: Blob;

          if (mode === 'pdf' && pdfDoc) {
            const canvas = await renderPdfPage(pdfDoc, p.pageNum, 2);
            blob = await canvasToBlob(canvas);
          } else {
            blob = p.blob!;
          }

          const ext = mode === 'pdf' ? 'webp' : (p.blob?.type?.includes('png') ? 'png' : 'webp');
          const filePath = `${songRow.id}/${pi + 1}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from(BUCKET)
            .upload(filePath, blob, { contentType: `image/${ext}` });
          if (uploadErr) throw uploadErr;

          const { error: pageErr } = await supabase
            .from('songbook_pages')
            .insert({
              song_id: songRow.id,
              image_path: filePath,
              page_number: pi + 1,
            });
          if (pageErr) throw pageErr;
        }
      }

      onAdded();
      setOpen(false);
      reset();
    } catch (e: any) {
      setError(e.message || 'Wystąpił błąd');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <button
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Dodaj pieśń"
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="w-5 h-5 text-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Dodaj nowe pieśni</DialogTitle>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="grid grid-cols-2 gap-3 py-4">
            <button
              onClick={() => setMode('pdf')}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <FileUp className="w-10 h-10 text-primary" />
              <span className="text-sm font-medium text-foreground">Z pliku PDF</span>
              <span className="text-xs text-muted-foreground text-center">Wczytaj plik PDF i przypisz strony do pieśni</span>
            </button>
            <button
              onClick={() => setMode('image')}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <ImagePlus className="w-10 h-10 text-primary" />
              <span className="text-sm font-medium text-foreground">Z obrazów</span>
              <span className="text-xs text-muted-foreground text-center">Wczytaj zdjęcia lub skany stron pieśni</span>
            </button>
          </div>
        )}

        {mode === 'pdf' && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Plik PDF</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="w-full py-2.5 px-3 rounded-xl border border-input bg-muted text-foreground text-sm file:bg-primary file:text-primary-foreground file:border-0 file:rounded-lg file:py-1.5 file:px-3 file:mr-3 file:cursor-pointer"
                onChange={e => handlePdfFile(e.target.files?.[0]!)}
              />
            </div>
            {loading && <p className="text-muted-foreground text-sm">Wczytywanie stron PDF...</p>}
            <PagePreviews pages={pages} onToggle={toggleSongStart} onTitle={setSongTitle} />
            {error && <p className="text-destructive text-sm">{error}</p>}
            {pages.length > 0 && (
              <button
                className="w-full py-3 px-5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                onClick={handleSubmit}
                disabled={uploading}
              >
                {uploading ? 'Dodawanie...' : `Dodaj ${pages.filter(p => p.isNewSong).length} pieśni (${pages.length} stron)`}
              </button>
            )}
          </div>
        )}

        {mode === 'image' && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label className="text-sm text-muted-foreground">Obrazy (zdjęcia, skany)</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="w-full py-2.5 px-3 rounded-xl border border-input bg-muted text-foreground text-sm file:bg-primary file:text-primary-foreground file:border-0 file:rounded-lg file:py-1.5 file:px-3 file:mr-3 file:cursor-pointer"
                onChange={e => e.target.files && handleImageFiles(e.target.files)}
              />
            </div>
            {loading && <p className="text-muted-foreground text-sm">Wczytywanie obrazów...</p>}
            <PagePreviews pages={pages} onToggle={toggleSongStart} onTitle={setSongTitle} />
            {error && <p className="text-destructive text-sm">{error}</p>}
            {pages.length > 0 && (
              <button
                className="w-full py-3 px-5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                onClick={handleSubmit}
                disabled={uploading}
              >
                {uploading ? 'Dodawanie...' : `Dodaj ${pages.filter(p => p.isNewSong).length} pieśni (${pages.length} stron)`}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PagePreviews({ pages, onToggle, onTitle }: {
  pages: PagePreview[];
  onToggle: (idx: number) => void;
  onTitle: (idx: number, title: string) => void;
}) {
  if (pages.length === 0) return null;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Kliknij miniaturkę, aby zaznaczyć początek nowej pieśni. Podaj tytuł dla każdej.
      </p>
      <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-1">
        {pages.map((p, idx) => (
          <div
            key={p.pageNum}
            className={cn(
              "flex items-start gap-3 p-2 rounded-xl border transition-colors",
              p.isNewSong ? 'border-primary bg-primary/10' : 'border-border'
            )}
          >
            <img
              src={p.thumbnail}
              alt={`Strona ${p.pageNum}`}
              className={cn(
                "w-16 h-auto rounded-lg cursor-pointer border-2 transition-colors flex-shrink-0",
                p.isNewSong ? 'border-primary' : 'border-transparent hover:border-muted-foreground'
              )}
              onClick={() => onToggle(idx)}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground mb-1">Strona {p.pageNum}</div>
              {p.isNewSong ? (
                <input
                  className="w-full py-2 px-3 rounded-lg border border-input bg-muted text-foreground text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Tytuł pieśni..."
                  value={p.songTitle}
                  onChange={e => onTitle(idx, e.target.value)}
                />
              ) : (
                <span className="text-xs text-muted-foreground italic">kontynuacja poprzedniej pieśni</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
