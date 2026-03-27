import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical, Monitor, AlertTriangle, Scissors, Eraser, AlignJustify, Palette } from 'lucide-react';
import { TEXT_COLOR_MAP } from '@/lib/projectorSettings';
import type { Song, Verse } from '@/types/projector';
import { splitSectionToSlides, CHURCH_PRESET } from '@/lib/projectorLayout';
import { SongVerseEditor } from './SongVerseEditor';
import { SongProjectorPreview } from './SongProjectorPreview';

interface SongEditDialogProps {
  song: Song | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (song: Song) => void;
}

const VERSE_TYPES: Verse['type'][] = ['verse', 'chorus', 'bridge', 'intro', 'outro', 'other'];
const VERSE_TYPE_LABELS: Record<Verse['type'], string> = {
  verse: 'Zwrotka',
  chorus: 'Refren',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  other: 'Inne',
};

const EMPTY_VERSE: Verse = { type: 'verse', label: 'Zwrotka 1', text: '' };

export function SongEditDialog({ song, open, onOpenChange, onSave }: SongEditDialogProps) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [fontColor, setFontColor] = useState('');
  const [verses, setVerses] = useState<Verse[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const isNew = song ? !song.id : true;

  useEffect(() => {
    if (!open) return;
    if (song && song.id) {
      setTitle(song.title);
      setAuthor(song.author || '');
      setFontColor(song.fontColor || '');
      setVerses(song.verses.map(v => ({ ...v })));
    } else {
      setTitle('');
      setAuthor('');
      setFontColor('');
      setVerses([{ ...EMPTY_VERSE }]);
    }
    setShowPreview(false);
  }, [song, open]);

  const updateVerse = (index: number, patch: Partial<Verse>) => {
    setVerses(prev => prev.map((v, i) => i === index ? { ...v, ...patch } : v));
  };

  const removeVerse = (index: number) => {
    setVerses(prev => prev.filter((_, i) => i !== index));
  };

  const addVerse = () => {
    const num = verses.filter(v => v.type === 'verse').length + 1;
    setVerses(prev => [...prev, { type: 'verse', label: `Zwrotka ${num}`, text: '' }]);
  };

  const moveVerse = (from: number, to: number) => {
    if (to < 0 || to >= verses.length) return;
    setVerses(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // --- Formatting tools ---
  const reformatToLines = useCallback((n: number) => {
    const allLines = verses
      .map(v => v.text)
      .join('\n')
      .split('\n')
      .filter(line => line.trim());

    const newVerses: Verse[] = [];
    for (let i = 0; i < allLines.length; i += n) {
      const chunk = allLines.slice(i, i + n);
      const num = newVerses.length + 1;
      newVerses.push({
        type: 'verse',
        label: `Zwrotka ${num}`,
        text: chunk.join('\n'),
      });
    }
    setVerses(newVerses.length > 0 ? newVerses : [{ ...EMPTY_VERSE }]);
  }, [verses]);

  const clearFormatting = useCallback(() => {
    const allText = verses
      .map(v => v.text)
      .join('\n')
      .split('\n')
      .filter(line => line.trim())
      .join('\n');
    setVerses([{ type: 'verse', label: 'Zwrotka 1', text: allText }]);
  }, [verses]);

  const splitVerseAtCursor = useCallback((index: number) => {
    const textarea = textareaRefs.current[index];
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const text = verses[index].text;
    const before = text.substring(0, pos).trimEnd();
    const after = text.substring(pos).trimStart();
    if (!after) return;

    setVerses(prev => {
      const next = [...prev];
      next[index] = { ...next[index], text: before };
      const newNum = next.filter((v, vi) => v.type === 'verse' && vi <= index).length + 1;
      next.splice(index + 1, 0, {
        type: 'verse',
        label: `Zwrotka ${newNum}`,
        text: after,
      });
      // Re-number verse labels
      let verseCount = 0;
      return next.map(v => {
        if (v.type === 'verse') {
          verseCount++;
          return { ...v, label: `Zwrotka ${verseCount}` };
        }
        return v;
      });
    });
  }, [verses]);

  // Projector preview data
  const projectorPreview = useMemo(() => {
    let songSlideNo = 0;
    return verses.filter(v => v.text.trim()).map((v, i) => {
      const projector = splitSectionToSlides(v.text);
      const sectionSlides = projector.slides.map(s => ({
        ...s,
        songSlideNo: ++songSlideNo,
      }));
      return {
        label: v.label,
        type: v.type,
        sectionNumber: i + 1,
        projector: { ...projector, slides: sectionSlides },
      };
    });
  }, [verses]);

  const totalSlides = projectorPreview.reduce((sum, v) => sum + v.projector.slideCount, 0);
  const multiSlideWarnings = projectorPreview.filter(v => !v.projector.fitsSingleSlide);

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const filtered = verses.filter(v => v.text.trim());
    const result: Song = {
      ...(song || {}),
      id: song?.id || crypto.randomUUID(),
      title: trimmedTitle,
      author: author.trim() || undefined,
      fontColor: fontColor || undefined,
      verses: filtered,
      searchText: `${trimmedTitle} ${author}`.toLowerCase(),
    };
    onSave(result);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{isNew ? 'Nowa pieśń' : 'Edytuj pieśń'}</span>
            <div className="flex items-center gap-2 text-sm font-normal">
              <span className="text-muted-foreground">{verses.filter(v => v.text.trim()).length} sekcji • {totalSlides} slajdów</span>
              <Button
                variant={showPreview ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="gap-1.5 h-7"
              >
                <Monitor className="w-3.5 h-3.5" />
                Podgląd
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tytuł</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nazwa pieśni" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Autor</label>
              <Input value={author} onChange={e => setAuthor(e.target.value)} placeholder="(opcjonalnie)" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                <Palette className="w-3 h-3 inline mr-1" />Kolor
              </label>
              <div className="flex items-center gap-1.5">
                {[
                  { hex: '', label: 'Domyślny' },
                  ...Object.values(TEXT_COLOR_MAP),
                ].map((c) => (
                  <button
                    key={c.hex || 'default'}
                    onClick={() => setFontColor(c.hex || '')}
                    className={`w-7 h-7 rounded-md border-2 transition-all ${
                      fontColor === (c.hex || '')
                        ? 'border-primary scale-110'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                    style={{ background: c.hex || '#888' }}
                    title={c.label}
                  />
                ))}
                <input
                  type="color"
                  value={fontColor || '#FFFFFF'}
                  onChange={e => setFontColor(e.target.value)}
                  className="w-7 h-7 rounded-md border border-border cursor-pointer p-0"
                  title="Własny kolor"
                />
              </div>
            </div>
          </div>

          {showPreview && (
            <SongProjectorPreview
              projectorPreview={projectorPreview}
              totalSlides={totalSlides}
              multiSlideWarnings={multiSlideWarnings}
            />
          )}

          <div className="space-y-3">
            {/* Formatting toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-medium text-muted-foreground">Zwrotki ({verses.length})</label>

              <div className="flex-1" />

              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1">
                  <AlignJustify className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select onValueChange={(val) => reformatToLines(parseInt(val))}>
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      <SelectValue placeholder="Formatuj do..." />
                    </SelectTrigger>
                    <SelectContent>
                      {[4, 5, 6, 7, 8, 9, 10].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} linii/zwrotkę</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFormatting}
                  className="h-7 text-xs gap-1"
                  title="Usuń formatowanie — połącz wszystko w jedną zwrotkę"
                >
                  <Eraser className="w-3 h-3" />
                  Usuń formatowanie
                </Button>

                <Button variant="outline" size="sm" onClick={addVerse} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" />
                  Dodaj
                </Button>
              </div>
            </div>

            {verses.map((verse, i) => (
              <SongVerseEditor
                key={i}
                verse={verse}
                index={i}
                versesLength={verses.length}
                verseTypes={VERSE_TYPES}
                verseTypeLabels={VERSE_TYPE_LABELS}
                onUpdate={updateVerse}
                onRemove={removeVerse}
                onMove={moveVerse}
                onSplitAtCursor={splitVerseAtCursor}
                textareaRef={(el) => { textareaRefs.current[i] = el; }}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>{isNew ? 'Utwórz pieśń' : 'Zapisz zmiany'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
