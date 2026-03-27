import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Power, BookOpen, X, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  type Devotion, type DevotionInsert, type SongbookLink, DAY_NAMES, LITURGICAL_PERIODS,
  describeSchedule, useDevotions,
} from '@/hooks/useDevotions';
import { supabase } from '@/integrations/supabase/client';

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: 'Każdy dzień tygodnia',
  nth_weekday: 'N-ty dzień tygodnia miesiąca',
  monthly_day: 'Konkretny dzień miesiąca',
  liturgical_period: 'Dzień tygodnia w okresie liturgicznym',
};

const SONGBOOK_URL = 'https://build-your-songbook.lovable.app';

const emptyForm: DevotionInsert = {
  name: '',
  start_time: null,
  description: null,
  recurrence_type: 'weekly',
  day_of_week: 0,
  day_of_month: 1,
  nth_occurrence: 1,
  liturgical_periods: [],
  is_active: true,
  songbook_links: [],
};

interface SongbookSongOption {
  id: string;
  title: string;
  category: string | null;
  sort_order: number | null;
}

function SongSearchInput({ onSelect }: { onSelect: (song: SongbookSongOption) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongbookSongOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('songbook_songs')
        .select('id, title, category, sort_order')
        .ilike('title', `%${query}%`)
        .order('title')
        .limit(20);
      setResults(data ?? []);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Szukaj pieśni w śpiewniku…"
          className="h-8 text-sm pl-8"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map(song => (
            <button
              key={song.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onSelect(song);
                setQuery('');
                setOpen(false);
                setResults([]);
              }}
            >
              <span className="font-medium text-foreground">{song.title}</span>
              {song.category && (
                <span className="ml-2 text-xs text-muted-foreground">{song.category}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground">
          Brak wyników
        </div>
      )}
    </div>
  );
}

function SongbookLinksEditor({ links, onChange }: { links: SongbookLink[]; onChange: (links: SongbookLink[]) => void }) {
  const addLink = () => onChange([...links, { label: '', page: 1 }]);
  const removeLink = (i: number) => onChange(links.filter((_, idx) => idx !== i));
  const updateLink = (i: number, field: keyof SongbookLink, value: string | number) => {
    const updated = [...links];
    updated[i] = { ...updated[i], [field]: value };
    onChange(updated);
  };
  const moveLink = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const updated = [...links];
    [updated[i], updated[j]] = [updated[j], updated[i]];
    onChange(updated);
  };

  const handleSongSelect = (song: SongbookSongOption) => {
    onChange([...links, { label: song.title, page: song.sort_order ?? 1 }]);
  };

  return (
    <div>
      <label className="text-sm font-medium">Odnośniki do Śpiewnika</label>
      
      <div className="mt-2 mb-2">
        <SongSearchInput onSelect={handleSongSelect} />
      </div>

      <div className="space-y-2">
        {links.map((link, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                onClick={() => moveLink(i, -1)}
                disabled={i === 0}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-20 transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveLink(i, 1)}
                disabled={i === links.length - 1}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-20 transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <Input
              value={link.label}
              onChange={e => updateLink(i, 'label', e.target.value)}
              placeholder="np. Pieśń na wejście"
              className="flex-1 h-8 text-sm"
            />
            <Input
              type="number"
              min={1}
              value={link.page}
              onChange={e => updateLink(i, 'page', parseInt(e.target.value) || 1)}
              placeholder="str."
              className="w-20 h-8 text-sm"
            />
            <Button size="sm" variant="ghost" onClick={() => removeLink(i)} className="h-8 w-8 p-0 shrink-0">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={addLink} className="mt-2 h-7 text-xs">
        <Plus className="w-3 h-3 mr-1" /> Dodaj ręcznie
      </Button>
    </div>
  );
}

function SongbookChips({ links }: { links: SongbookLink[] }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {links.map((link, i) => (
        <a
          key={i}
          href={`${SONGBOOK_URL}?page=${link.page}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/50 text-accent-foreground text-[11px] font-bold hover:bg-accent transition-colors"
        >
          <BookOpen className="w-3 h-3" />
          {link.label ? `${link.label} (str. ${link.page})` : `Śpiewnik str. ${link.page}`}
        </a>
      ))}
    </div>
  );
}

export function DevotionsManager() {
  const { devotions, loading, add, update, remove, toggleActive } = useDevotions();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DevotionInsert>(emptyForm);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (d: Devotion) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      start_time: d.start_time,
      description: d.description,
      recurrence_type: d.recurrence_type,
      day_of_week: d.day_of_week,
      day_of_month: d.day_of_month,
      nth_occurrence: d.nth_occurrence,
      liturgical_periods: d.liturgical_periods,
      is_active: d.is_active,
      songbook_links: d.songbook_links,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Podaj nazwę nabożeństwa', variant: 'destructive' });
      return;
    }
    // Filter out empty links
    const cleanedForm = {
      ...form,
      songbook_links: form.songbook_links.filter(l => l.page > 0),
    };
    const err = editingId
      ? await update(editingId, cleanedForm)
      : await add(cleanedForm);
    if (err) {
      toast({ title: 'Błąd zapisu', description: err.message, variant: 'destructive' });
    } else {
      toast({ title: editingId ? '✅ Zaktualizowano' : '✅ Dodano nabożeństwo' });
      setDialogOpen(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Usunąć nabożeństwo „${name}"?`)) return;
    await remove(id);
    toast({ title: 'Usunięto' });
  };

  const togglePeriod = (period: string) => {
    setForm(f => ({
      ...f,
      liturgical_periods: f.liturgical_periods.includes(period)
        ? f.liturgical_periods.filter(p => p !== period)
        : [...f.liturgical_periods, period],
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg md:text-xl font-bold truncate">Nabożeństwa cykliczne</h2>
        <Button onClick={openAdd} size="sm" className="shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Dodaj
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      ) : devotions.length === 0 ? (
        <div className="glass-card border-2 border-dashed border-border p-8 md:p-12 text-center">
          <div className="text-4xl mb-3">⛪</div>
          <p className="text-muted-foreground">Brak nabożeństw. Dodaj pierwsze!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {devotions.map(d => (
            <div
              key={d.id}
              className={`glass-card p-3 md:p-4 border-l-4 transition-opacity ${
                d.is_active ? 'border-l-primary' : 'border-l-muted opacity-60'
              }`}
            >
              <div className="space-y-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-primary uppercase text-sm">
                    {d.name}
                    {d.start_time && <span className="text-foreground"> ({d.start_time})</span>}
                  </h3>
                  {d.description && (
                    <p className="text-sm text-foreground mt-1 whitespace-pre-line">{d.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{describeSchedule(d)}</p>
                  <SongbookChips links={d.songbook_links} />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(d)} className="h-8">
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edytuj
                  </Button>
                  <Button
                    size="sm"
                    variant={d.is_active ? 'default' : 'outline'}
                    onClick={() => toggleActive(d.id, !d.is_active)}
                    className="h-8"
                  >
                    <Power className="w-3.5 h-3.5 mr-1" />
                    {d.is_active ? 'Aktywny' : 'Wyłączony'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(d.id, d.name)}
                    className="h-8"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edytuj nabożeństwo' : 'Dodaj nabożeństwo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nazwa *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="np. Godzinki do NMP"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Godzina rozpoczęcia</label>
              <Input
                value={form.start_time ?? ''}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value || null }))}
                placeholder="np. 6:00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Opis / elementy</label>
              <Textarea
                value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))}
                placeholder="- pieśń na początek&#10;- nabożeństwo&#10;- pieśń na koniec"
                rows={4}
              />
            </div>

            {/* Recurrence type */}
            <div>
              <label className="text-sm font-medium">Częstotliwość</label>
              <Select
                value={form.recurrence_type}
                onValueChange={v => setForm(f => ({ ...f, recurrence_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Day of week */}
            {(form.recurrence_type === 'weekly' || form.recurrence_type === 'nth_weekday' || form.recurrence_type === 'liturgical_period') && (
              <div>
                <label className="text-sm font-medium">Dzień tygodnia</label>
                <Select
                  value={String(form.day_of_week ?? 0)}
                  onValueChange={v => setForm(f => ({ ...f, day_of_week: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Day of month */}
            {form.recurrence_type === 'monthly_day' && (
              <div>
                <label className="text-sm font-medium">Dzień miesiąca</label>
                <Select
                  value={String(form.day_of_month ?? 1)}
                  onValueChange={v => setForm(f => ({ ...f, day_of_month: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Nth occurrence */}
            {form.recurrence_type === 'nth_weekday' && (
              <div>
                <label className="text-sm font-medium">Który z kolei</label>
                <Select
                  value={String(form.nth_occurrence ?? 1)}
                  onValueChange={v => setForm(f => ({ ...f, nth_occurrence: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}.</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Liturgical periods */}
            {form.recurrence_type === 'liturgical_period' && (
              <div>
                <label className="text-sm font-medium">Okresy liturgiczne</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {LITURGICAL_PERIODS.map(period => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => togglePeriod(period)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                        form.liturgical_periods.includes(period)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Songbook links */}
            <SongbookLinksEditor
              links={form.songbook_links}
              onChange={songbook_links => setForm(f => ({ ...f, songbook_links }))}
            />

            <Button onClick={handleSave} className="w-full">
              {editingId ? 'Zapisz zmiany' : 'Dodaj nabożeństwo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
