import { useState, useRef } from 'react';
import { GripVertical, Trash2, Scissors, Bold, Italic, Underline, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { splitSectionToSlides } from '@/lib/projectorLayout';
import { wrapSelectionWithTag, wrapSelectionWithColor } from '@/lib/textFormatting';
import type { Verse } from '@/types/projector';

interface SongVerseEditorProps {
  verse: Verse;
  index: number;
  versesLength: number;
  verseTypes: Verse['type'][];
  verseTypeLabels: Record<Verse['type'], string>;
  onUpdate: (index: number, patch: Partial<Verse>) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onSplitAtCursor: (index: number) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
}

export function SongVerseEditor({
  verse,
  index,
  versesLength,
  verseTypes,
  verseTypeLabels,
  onUpdate,
  onRemove,
  onMove,
  onSplitAtCursor,
  textareaRef,
}: SongVerseEditorProps) {
  let textareaEl: HTMLTextAreaElement | null = null;
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [customColor, setCustomColor] = useState('#FF0000');

  const INLINE_COLORS = [
    { hex: '#FF0000', label: 'Czerwony' },
    { hex: '#FFE040', label: 'Żółty' },
    { hex: '#00FF00', label: 'Zielony' },
    { hex: '#00BFFF', label: 'Niebieski' },
    { hex: '#FF69B4', label: 'Różowy' },
    { hex: '#FFA500', label: 'Pomarańczowy' },
    { hex: '#FFFFFF', label: 'Biały' },
  ];

  const applyFormat = (tag: 'b' | 'i' | 'u') => {
    if (!textareaEl) return;
    const { selectionStart, selectionEnd } = textareaEl;
    const result = wrapSelectionWithTag(verse.text, selectionStart, selectionEnd, tag);
    onUpdate(index, { text: result.text });
    requestAnimationFrame(() => {
      if (textareaEl) {
        textareaEl.selectionStart = result.cursorPos;
        textareaEl.selectionEnd = result.cursorPos;
        textareaEl.focus();
      }
    });
  };

  const applyColor = (color: string) => {
    if (!textareaEl) return;
    const { selectionStart, selectionEnd } = textareaEl;
    if (selectionStart === selectionEnd) return; // nothing selected
    const result = wrapSelectionWithColor(verse.text, selectionStart, selectionEnd, color);
    onUpdate(index, { text: result.text });
    setColorPickerOpen(false);
    requestAnimationFrame(() => {
      if (textareaEl) {
        textareaEl.selectionStart = result.cursorPos;
        textareaEl.selectionEnd = result.cursorPos;
        textareaEl.focus();
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-panel p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
            title="Przesuń w górę"
          >
            <GripVertical className="w-3 h-3 rotate-180" />
          </button>
          <button
            onClick={() => onMove(index, index + 1)}
            disabled={index === versesLength - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
            title="Przesuń w dół"
          >
            <GripVertical className="w-3 h-3" />
          </button>
        </div>

        <select
          value={verse.type}
          onChange={e => onUpdate(index, {
            type: e.target.value as Verse['type'],
            label: verseTypeLabels[e.target.value as Verse['type']] + (e.target.value === 'verse' ? ` ${index + 1}` : ''),
          })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {verseTypes.map(t => (
            <option key={t} value={t}>{verseTypeLabels[t]}</option>
          ))}
        </select>

        <Input
          value={verse.label}
          onChange={e => onUpdate(index, { label: e.target.value })}
          className="h-8 text-xs flex-1"
          placeholder="Etykieta"
        />

        {verse.text.trim() && (() => {
          const proj = splitSectionToSlides(verse.text);
          return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${proj.fitsSingleSlide ? 'bg-muted text-muted-foreground' : 'bg-yellow-500/20 text-yellow-600'}`}>
              {proj.slideCount} slajd{proj.slideCount > 1 ? 'y' : ''}
            </span>
          );
        })()}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSplitAtCursor(index)}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Wstaw podział w miejscu kursora"
        >
          <Scissors className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          title="Usuń"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Formatting toolbar */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => applyFormat('b')}
          className="h-7 w-7 p-0"
          title="Pogrubienie"
        >
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => applyFormat('i')}
          className="h-7 w-7 p-0"
          title="Pochylenie"
        >
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => applyFormat('u')}
          className="h-7 w-7 p-0"
          title="Podkreślenie"
        >
          <Underline className="w-3.5 h-3.5" />
        </Button>

        <div className="w-px h-5 bg-border mx-0.5" />

        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 relative"
              title="Kolor zaznaczonego tekstu"
            >
              <Palette className="w-3.5 h-3.5" />
              <div
                className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded-full"
                style={{ background: customColor }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <p className="text-[11px] text-muted-foreground mb-1.5">Zaznacz tekst, potem wybierz kolor:</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {INLINE_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => { setCustomColor(c.hex); applyColor(c.hex); }}
                  className="w-6 h-6 rounded-md border border-border hover:scale-110 transition-transform"
                  style={{ background: c.hex }}
                  title={c.label}
                />
              ))}
              <input
                type="color"
                value={customColor}
                onChange={e => setCustomColor(e.target.value)}
                className="w-6 h-6 rounded-md border border-border cursor-pointer p-0"
                title="Własny kolor"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => applyColor(customColor)}
              >
                Zastosuj
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Textarea
        ref={(el) => {
          textareaEl = el;
          textareaRef(el);
        }}
        value={verse.text}
        onChange={e => onUpdate(index, { text: e.target.value })}
        rows={4}
        className="text-sm leading-relaxed font-mono"
        placeholder="Tekst zwrotki..."
      />
    </div>
  );
}
