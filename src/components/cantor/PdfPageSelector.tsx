import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface Props {
  file: File;
  open: boolean;
  onSelect: (pageImageBase64: string) => void;
  onCancel: () => void;
}

export function PdfPageSelector({ file, open, onSelect, onCancel }: Props) {
  const [pageCount, setPageCount] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setSelectedPages(new Set());
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);

        // Auto-select first page
        setSelectedPages(new Set([0]));

        const thumbs: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.4 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
          if (cancelled) return;
        }
        setThumbnails(thumbs);
      } catch (err) {
        console.error('PDF parse error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file, open]);

  const togglePage = (idx: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPages(new Set(Array.from({ length: pageCount }, (_, i) => i)));
  };

  const sortedSelected = [...selectedPages].sort((a, b) => a - b);

  const handleConfirm = useCallback(async () => {
    if (!pdfDocRef.current || sortedSelected.length === 0) return;
    setExporting(true);
    try {
      // Render each selected page — use scale 1.5 to keep size manageable
      const RENDER_SCALE = 1.5;
      const renders: { canvas: HTMLCanvasElement; width: number; height: number }[] = [];
      for (const idx of sortedSelected) {
        const page = await pdfDocRef.current.getPage(idx + 1);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        renders.push({ canvas, width: viewport.width, height: viewport.height });
      }

      let finalCanvas: HTMLCanvasElement;

      if (renders.length === 1) {
        finalCanvas = renders[0].canvas;
      } else {
        // Stitch pages vertically into one tall image
        const maxWidth = Math.max(...renders.map(r => r.width));
        const totalHeight = renders.reduce((sum, r) => sum + r.height, 0);
        finalCanvas = document.createElement('canvas');
        finalCanvas.width = maxWidth;
        finalCanvas.height = totalHeight;
        const ctx = finalCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, maxWidth, totalHeight);

        let y = 0;
        for (const r of renders) {
          const x = Math.round((maxWidth - r.width) / 2);
          ctx.drawImage(r.canvas, x, y);
          y += r.height;
        }
      }

      // Use JPEG with quality 0.85 to reduce size (PNG can be 10x larger)
      const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      
      // Check size — warn if very large (>4MB base64 ≈ 3MB binary)
      if (base64.length > 4 * 1024 * 1024) {
        console.warn(`PDF export large: ${(base64.length / 1024 / 1024).toFixed(1)}MB base64`);
      }
      
      onSelect(base64);
    } catch (err) {
      console.error('Page export error', err);
    } finally {
      setExporting(false);
    }
  }, [sortedSelected, onSelect]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wybierz strony z nutami</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Wczytuję PDF…</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Selection info */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Zaznaczono: <strong className="text-foreground">{selectedPages.size}</strong> z {pageCount}
                {selectedPages.size > 1 && ' (zostaną złączone w jeden obraz)'}
              </span>
              {pageCount > 1 && (
                <Button size="sm" variant="ghost" className="text-xs h-7"
                  onClick={selectedPages.size === pageCount ? () => setSelectedPages(new Set()) : selectAll}>
                  {selectedPages.size === pageCount ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                </Button>
              )}
            </div>

            {/* Thumbnail grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {thumbnails.map((thumb, i) => {
                const isSelected = selectedPages.has(i);
                return (
                  <button key={i} onClick={() => togglePage(i)}
                    className={`relative border-2 rounded-lg overflow-hidden transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-muted-foreground/40'
                    }`}>
                    <img src={thumb} alt={`Str. ${i + 1}`} className="w-full h-auto" />
                    <div className="absolute top-1.5 left-1.5">
                      <Checkbox checked={isSelected} className="bg-background/80" />
                    </div>
                    <div className="text-xs text-center py-0.5 bg-muted/50 text-muted-foreground font-medium">
                      {i + 1}
                    </div>
                    {isSelected && selectedPages.size > 1 && (
                      <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {sortedSelected.indexOf(i) + 1}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Confirm */}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={onCancel}>Anuluj</Button>
              <Button size="sm" onClick={handleConfirm} disabled={exporting || selectedPages.size === 0}>
                {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                Rozpoznaj {selectedPages.size === 1 ? 'tę stronę' : `${selectedPages.size} strony`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
