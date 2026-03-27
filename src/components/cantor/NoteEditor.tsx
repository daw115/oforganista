import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plus, Trash2, Check, X, ArrowUp, ArrowDown, Save,
  Music, Undo2, ChevronLeft, ChevronRight, Pause as RestIcon,
} from 'lucide-react';
import {
  parseToEditable, editableToMusicXml, createEmptyNote, createRest,
  noteToStaffPosition, staffPositionToNote,
  DURATIONS, DURATION_DISPLAY, STEPS,
  type EditableNote,
} from '@/lib/noteEditor';

interface Props {
  /** MusicXML string to edit */
  musicxml: string;
  /** Called with the edited MusicXML when user saves */
  onSave: (musicxml: string, title: string) => void;
  onCancel: () => void;
}

const ALTER_LABELS: Record<number, string> = { [-1]: '♭', 0: '♮', 1: '♯' };

// Staff rendering constants
const STAFF_LINE_GAP = 10;
const NOTE_WIDTH = 48;
const STAFF_TOP = 60;
const TOTAL_HEIGHT = 160;

function noteColor(note: EditableNote, selected: boolean): string {
  if (selected) return 'hsl(var(--primary))';
  if (note.type === 'rest') return 'hsl(var(--muted-foreground))';
  return 'hsl(var(--foreground))';
}

export function NoteEditor({ musicxml, onSave, onCancel }: Props) {
  const parsed = useRef(parseToEditable(musicxml));
  const [notes, setNotes] = useState<EditableNote[]>(parsed.current.notes);
  const [title, setTitle] = useState(parsed.current.title);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [history, setHistory] = useState<EditableNote[][]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { keyFifths, timeBeats, timeBeatType } = parsed.current;

  const pushHistory = useCallback(() => {
    setHistory(h => [...h.slice(-20), notes.map(n => ({ ...n }))]);
  }, [notes]);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setNotes(prev);
      setSelectedIdx(null);
      return h.slice(0, -1);
    });
  }, []);

  const selected = selectedIdx !== null ? notes[selectedIdx] : null;

  // ── Editing operations ──

  const updateNote = useCallback((idx: number, updates: Partial<EditableNote>) => {
    pushHistory();
    setNotes(prev => prev.map((n, i) => i === idx ? { ...n, ...updates } : n));
  }, [pushHistory]);

  const moveUp = useCallback(() => {
    if (selectedIdx === null || !selected || selected.type === 'rest') return;
    const pos = noteToStaffPosition(selected.step, selected.octave);
    const { step, octave } = staffPositionToNote(pos + 1);
    updateNote(selectedIdx, { step, octave });
  }, [selectedIdx, selected, updateNote]);

  const moveDown = useCallback(() => {
    if (selectedIdx === null || !selected || selected.type === 'rest') return;
    const pos = noteToStaffPosition(selected.step, selected.octave);
    const { step, octave } = staffPositionToNote(pos - 1);
    updateNote(selectedIdx, { step, octave });
  }, [selectedIdx, selected, updateNote]);

  const toggleAlter = useCallback(() => {
    if (selectedIdx === null || !selected || selected.type === 'rest') return;
    const next = selected.alter === 0 ? 1 : selected.alter === 1 ? -1 : 0;
    updateNote(selectedIdx, { alter: next });
  }, [selectedIdx, selected, updateNote]);

  const setDuration = useCallback((dur: string) => {
    if (selectedIdx === null) return;
    updateNote(selectedIdx, { duration: dur });
  }, [selectedIdx, updateNote]);

  const toggleDot = useCallback(() => {
    if (selectedIdx === null) return;
    updateNote(selectedIdx, { dotted: !notes[selectedIdx].dotted });
  }, [selectedIdx, notes, updateNote]);

  const toggleRest = useCallback(() => {
    if (selectedIdx === null) return;
    const n = notes[selectedIdx];
    updateNote(selectedIdx, { type: n.type === 'rest' ? 'note' : 'rest' });
  }, [selectedIdx, notes, updateNote]);

  const addNoteAfter = useCallback(() => {
    pushHistory();
    const idx = selectedIdx !== null ? selectedIdx + 1 : notes.length;
    const newNote = createEmptyNote();
    setNotes(prev => [...prev.slice(0, idx), newNote, ...prev.slice(idx)]);
    setSelectedIdx(idx);
  }, [selectedIdx, notes.length, pushHistory]);

  const addRestAfter = useCallback(() => {
    pushHistory();
    const idx = selectedIdx !== null ? selectedIdx + 1 : notes.length;
    const newRest = createRest();
    setNotes(prev => [...prev.slice(0, idx), newRest, ...prev.slice(idx)]);
    setSelectedIdx(idx);
  }, [selectedIdx, notes.length, pushHistory]);

  const deleteSelected = useCallback(() => {
    if (selectedIdx === null) return;
    pushHistory();
    setNotes(prev => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }, [selectedIdx, pushHistory]);

  const selectPrev = useCallback(() => {
    setSelectedIdx(prev => prev !== null && prev > 0 ? prev - 1 : prev);
  }, []);

  const selectNext = useCallback(() => {
    setSelectedIdx(prev => prev !== null && prev < notes.length - 1 ? prev + 1 : prev);
  }, [notes.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); moveUp(); break;
        case 'ArrowDown': e.preventDefault(); moveDown(); break;
        case 'ArrowLeft': e.preventDefault(); selectPrev(); break;
        case 'ArrowRight': e.preventDefault(); selectNext(); break;
        case 'Delete':
        case 'Backspace': e.preventDefault(); deleteSelected(); break;
        case '#': toggleAlter(); break;
        case '.': toggleDot(); break;
        case 'r': toggleRest(); break;
        case 'n': addNoteAfter(); break;
        case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); undo(); } break;
        case '1': setDuration('whole'); break;
        case '2': setDuration('half'); break;
        case '3': setDuration('quarter'); break;
        case '4': setDuration('eighth'); break;
        case '5': setDuration('16th'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [moveUp, moveDown, selectPrev, selectNext, deleteSelected, toggleAlter, toggleDot, toggleRest, addNoteAfter, undo, setDuration]);

  const handleSave = () => {
    const xml = editableToMusicXml(notes, title, keyFifths, timeBeats, timeBeatType);
    onSave(xml, title);
  };

  // ── Staff visualization ──

  const staffWidth = Math.max(notes.length * NOTE_WIDTH + 80, 400);

  function renderStaff() {
    const lines: JSX.Element[] = [];

    // 5 staff lines
    for (let i = 0; i < 5; i++) {
      const y = STAFF_TOP + i * STAFF_LINE_GAP;
      lines.push(
        <line key={`line-${i}`} x1={0} y1={y} x2={staffWidth} y2={y}
          stroke="hsl(var(--border))" strokeWidth={1} />
      );
    }

    // Notes
    notes.forEach((note, idx) => {
      const x = 40 + idx * NOTE_WIDTH;
      const isSelected = selectedIdx === idx;

      if (note.type === 'rest') {
        // Draw rest symbol
        lines.push(
          <g key={note.id} onClick={() => setSelectedIdx(idx)} className="cursor-pointer">
            <rect x={x - 8} y={STAFF_TOP + 10} width={16} height={20}
              fill={isSelected ? 'hsl(var(--primary) / 0.15)' : 'transparent'}
              rx={3} />
            <text x={x} y={STAFF_TOP + 27} textAnchor="middle"
              fontSize={18} fill={noteColor(note, isSelected)}>𝄾</text>
            {note.lyric && (
              <text x={x} y={STAFF_TOP + 60} textAnchor="middle"
                fontSize={9} fill="hsl(var(--muted-foreground))">{note.lyric}</text>
            )}
          </g>
        );
      } else {
        // Note position on staff: E5=line0, D5=space, C5=space, B4=line3, etc.
        // Staff line positions: F5(top), D5, B4, G4, E4(bottom) for treble clef
        // Position: 0=E4(bottom line), each step up = half STAFF_LINE_GAP
        const pos = noteToStaffPosition(note.step, note.octave);
        // E4 = pos 2 → bottom staff line
        // reference: E4 = bottom line = STAFF_TOP + 4*GAP
        const staffBottom = STAFF_TOP + 4 * STAFF_LINE_GAP;
        const y = staffBottom - (pos - 2) * (STAFF_LINE_GAP / 2);

        const isFilled = note.duration === 'quarter' || note.duration === 'eighth' || note.duration === '16th';
        const hasStem = note.duration !== 'whole';
        const hasFlag = note.duration === 'eighth' || note.duration === '16th';

        // Ledger lines
        const ledgerLines: JSX.Element[] = [];
        if (y > staffBottom + STAFF_LINE_GAP / 2) {
          for (let ly = staffBottom + STAFF_LINE_GAP; ly <= y + 1; ly += STAFF_LINE_GAP) {
            ledgerLines.push(
              <line key={`ledger-${idx}-${ly}`} x1={x - 10} y1={ly} x2={x + 10} y2={ly}
                stroke="hsl(var(--border))" strokeWidth={1} />
            );
          }
        }
        if (y < STAFF_TOP - STAFF_LINE_GAP / 2) {
          for (let ly = STAFF_TOP - STAFF_LINE_GAP; ly >= y - 1; ly -= STAFF_LINE_GAP) {
            ledgerLines.push(
              <line key={`ledger-${idx}-${ly}`} x1={x - 10} y1={ly} x2={x + 10} y2={ly}
                stroke="hsl(var(--border))" strokeWidth={1} />
            );
          }
        }

        lines.push(
          <g key={note.id} onClick={() => setSelectedIdx(idx)} className="cursor-pointer">
            {/* Selection highlight */}
            {isSelected && (
              <rect x={x - 14} y={Math.min(y - 12, STAFF_TOP - 5)} width={28}
                height={Math.max(30, staffBottom - Math.min(y, STAFF_TOP) + 20)}
                fill="hsl(var(--primary) / 0.1)" rx={4} />
            )}

            {ledgerLines}

            {/* Note head */}
            <ellipse cx={x} cy={y} rx={6} ry={4.5}
              fill={isFilled ? noteColor(note, isSelected) : 'none'}
              stroke={noteColor(note, isSelected)} strokeWidth={1.5}
              transform={`rotate(-15, ${x}, ${y})`} />

            {/* Dot */}
            {note.dotted && (
              <circle cx={x + 9} cy={y} r={1.5} fill={noteColor(note, isSelected)} />
            )}

            {/* Stem */}
            {hasStem && (
              <line x1={x + 6} y1={y} x2={x + 6} y2={y - 28}
                stroke={noteColor(note, isSelected)} strokeWidth={1.2} />
            )}

            {/* Flag */}
            {hasFlag && (
              <path d={`M${x + 6},${y - 28} q5,8 0,16`}
                fill="none" stroke={noteColor(note, isSelected)} strokeWidth={1.2} />
            )}
            {note.duration === '16th' && (
              <path d={`M${x + 6},${y - 22} q5,8 0,16`}
                fill="none" stroke={noteColor(note, isSelected)} strokeWidth={1.2} />
            )}

            {/* Accidental */}
            {note.alter !== 0 && (
              <text x={x - 12} y={y + 4} fontSize={12}
                fill={noteColor(note, isSelected)}>
                {note.alter === 1 ? '♯' : '♭'}
              </text>
            )}

            {/* Note name below */}
            <text x={x} y={STAFF_TOP + 5 * STAFF_LINE_GAP + 15} textAnchor="middle"
              fontSize={8} fill="hsl(var(--muted-foreground))">
              {note.step}{note.octave}
            </text>

            {/* Lyric */}
            {note.lyric && (
              <text x={x} y={STAFF_TOP + 5 * STAFF_LINE_GAP + 26} textAnchor="middle"
                fontSize={9} fill="hsl(var(--primary))">
                {note.lyric}
              </text>
            )}
          </g>
        );
      }
    });

    return lines;
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm">Edytor nutowy</CardTitle>
        </div>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Tytuł melodii"
          className="h-8 text-sm mt-1"
        />
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-1">
          {/* Duration buttons */}
          {DURATIONS.map(d => (
            <Button key={d} size="sm" variant={selected?.duration === d ? 'default' : 'outline'}
              className="h-7 w-8 text-base p-0" onClick={() => setDuration(d)}
              title={d} disabled={selectedIdx === null}>
              {DURATION_DISPLAY[d]}
            </Button>
          ))}

          <div className="w-px bg-border mx-1" />

          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
            onClick={toggleDot} disabled={selectedIdx === null}>
            <span className="text-base">•</span> Kropka
          </Button>

          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
            onClick={toggleAlter} disabled={selectedIdx === null || selected?.type === 'rest'}>
            ♯/♭
          </Button>

          <div className="w-px bg-border mx-1" />

          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={moveUp}
            disabled={selectedIdx === null || selected?.type === 'rest'} title="Wyżej (↑)">
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={moveDown}
            disabled={selectedIdx === null || selected?.type === 'rest'} title="Niżej (↓)">
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px bg-border mx-1" />

          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={addNoteAfter} title="Dodaj nutę (n)">
            <Plus className="w-3 h-3" /> Nuta
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={addRestAfter} title="Dodaj pauzę">
            <RestIcon className="w-3 h-3" /> Pauza
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={toggleRest}
            disabled={selectedIdx === null} title="Zamień nutę/pauzę (r)">
            ↔ {selected?.type === 'rest' ? 'Nuta' : 'Pauza'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive" onClick={deleteSelected}
            disabled={selectedIdx === null} title="Usuń (Delete)">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px bg-border mx-1" />

          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={undo}
            disabled={history.length === 0} title="Cofnij (Ctrl+Z)">
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Selected note info */}
        {selected && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
            <span className="font-medium text-foreground">
              {selected.type === 'rest' ? 'Pauza' : `${selected.step}${selected.alter === 1 ? '♯' : selected.alter === -1 ? '♭' : ''}${selected.octave}`}
            </span>
            <span>{DURATION_DISPLAY[selected.duration]} {selected.dotted ? '•' : ''}</span>
            {selected.lyric && <span className="text-primary">„{selected.lyric}"</span>}
            <span className="ml-auto">{selectedIdx! + 1}/{notes.length}</span>
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={selectPrev} disabled={selectedIdx === 0}>
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={selectNext} disabled={selectedIdx === notes.length - 1}>
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Lyric editing for selected note */}
        {selected && selected.type === 'note' && (
          <Input
            placeholder="Sylaba tekstu…"
            value={selected.lyric ?? ''}
            onChange={e => updateNote(selectedIdx!, { lyric: e.target.value || undefined })}
            className="h-7 text-xs"
          />
        )}

        {/* Visual staff */}
        <div ref={scrollRef} className="overflow-x-auto border border-border rounded-lg bg-background p-2">
          <svg width={staffWidth} height={TOTAL_HEIGHT} className="select-none">
            {renderStaff()}
          </svg>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Skróty: ←→ nawigacja • ↑↓ wysokość • 1-5 wartości rytmiczne • n=nuta • r=pauza/nuta • #=♯/♭ • .=kropka • Del=usuń • Ctrl+Z=cofnij
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={handleSave} className="gap-1">
            <Save className="w-4 h-4" /> Zapisz ({notes.length} nut)
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" /> Anuluj
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
