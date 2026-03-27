import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, Music, Search, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SheetMusicViewer } from './SheetMusicViewer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Melody, CantorMelodyAssignment } from '@/hooks/useCantors';

const LITURGICAL_PERIODS = [
  'Adwent', 'Boże Narodzenie', 'Zwykły I', 'Wielki Post',
  'Triduum Paschalne', 'Wielkanoc', 'Zwykły II',
] as const;

interface Props {
  cantorId: string;
  allMelodies: Melody[];
  assignments: CantorMelodyAssignment[];
  onAssign: (cantorId: string, melodyId: string, key?: string | null, notes?: string | null, liturgicalPeriod?: string | null) => Promise<boolean>;
  onUpdateAssignment: (id: string, updates: { key?: string | null; liturgical_period?: string | null }) => Promise<boolean>;
  onRemoveAssignment: (id: string) => Promise<boolean>;
}

export function CantorProfile({
  cantorId, allMelodies, assignments,
  onAssign, onUpdateAssignment, onRemoveAssignment,
}: Props) {
  const [search, setSearch] = useState('');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignKey, setAssignKey] = useState('');
  const [assignPeriod, setAssignPeriod] = useState<string>('');

  const assignedMelodyIds = new Set(assignments.map(a => a.melody_id));

  const getMusicXmlUrl = (path: string): string => {
    const { data } = supabase.storage.from('musicxml').getPublicUrl(path);
    return data.publicUrl;
  };

  // Filter unassigned melodies
  const unassigned = allMelodies.filter(m =>
    !assignedMelodyIds.has(m.id) &&
    (search === '' ||
      m.melody_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.psalm_title ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  // Filter assigned by period
  const filteredAssignments = assignments.filter(a => {
    if (!a.melody) return false;
    if (filterPeriod === 'all') return true;
    if (filterPeriod === 'none') return !a.liturgical_period;
    return a.liturgical_period === filterPeriod;
  });

  const handleAssign = async (melodyId: string) => {
    const ok = await onAssign(cantorId, melodyId, assignKey || null, null, assignPeriod || null);
    if (ok) {
      toast({ title: '✅ Melodia przypisana' });
      setAssigningId(null);
      setAssignKey('');
      setAssignPeriod('');
    }
  };

  return (
    <div className="space-y-4">
      {/* My assigned melodies */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Music className="w-4 h-4" /> Moje melodie
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue placeholder="Okres liturgiczny" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie okresy</SelectItem>
                <SelectItem value="none">Bez okresu</SelectItem>
                {LITURGICAL_PERIODS.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Brak przypisanych melodii{filterPeriod !== 'all' ? ' w tym okresie' : ''}.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAssignments.map(a => {
                const m = a.melody!;
                const isExpanded = expandedId === a.id;
                return (
                  <div key={a.id}
                    className="border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-colors">
                    {/* Preview thumbnail */}
                    {m.musicxml_path && (
                      <div className="bg-white p-1 border-b border-border h-24 overflow-hidden cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                        <SheetMusicViewer musicxmlUrl={getMusicXmlUrl(m.musicxml_path)} compact />
                      </div>
                    )}
                    {!m.musicxml_path && (
                      <div className="bg-muted/30 h-24 flex items-center justify-center border-b border-border">
                        <Music className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}

                    <div className="p-2.5 space-y-1.5">
                      <div className="font-medium text-sm truncate">{m.melody_name}</div>
                      {m.psalm_title && <div className="text-xs text-muted-foreground truncate">{m.psalm_title}</div>}
                      <div className="flex flex-wrap gap-1.5">
                        {a.key && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                            {a.key}
                          </span>
                        )}
                        {a.liturgical_period && (
                          <span className="text-[10px] bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded">
                            {a.liturgical_period}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 pt-1">
                        {/* Period selector */}
                        <Select
                          value={a.liturgical_period ?? 'none'}
                          onValueChange={v => onUpdateAssignment(a.id, { liturgical_period: v === 'none' ? null : v })}
                        >
                          <SelectTrigger className="h-7 text-[10px] flex-1">
                            <SelectValue placeholder="Okres…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— brak —</SelectItem>
                            {LITURGICAL_PERIODS.map(p => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                          onClick={() => { if (confirm('Usunąć przypisanie?')) onRemoveAssignment(a.id); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded full view */}
                    {isExpanded && m.musicxml_path && (
                      <div className="px-2 pb-2 border-t border-border bg-white">
                        <SheetMusicViewer musicxmlUrl={getMusicXmlUrl(m.musicxml_path)} compact={false} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Browse & assign from library */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Wybierz z biblioteki</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Szukaj melodii…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9" />
          </div>

          {unassigned.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              {search ? 'Brak wyników' : 'Wszystkie melodie są już przypisane'}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto">
            {unassigned.map(m => (
              <div key={m.id} className="border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-colors">
                {/* Mini note preview */}
                {m.musicxml_path ? (
                  <div className="bg-white p-1 border-b border-border h-20 overflow-hidden">
                    <SheetMusicViewer musicxmlUrl={getMusicXmlUrl(m.musicxml_path)} compact />
                  </div>
                ) : (
                  <div className="bg-muted/30 h-20 flex items-center justify-center border-b border-border">
                    <Music className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                )}

                <div className="p-2.5">
                  <div className="font-medium text-sm truncate">{m.melody_name}</div>
                  {m.psalm_title && <div className="text-xs text-muted-foreground truncate">{m.psalm_title}</div>}

                  {assigningId === m.id ? (
                    <div className="mt-2 space-y-1.5">
                      <Input placeholder="Tonacja (np. C-dur)" value={assignKey}
                        onChange={e => setAssignKey(e.target.value)} className="h-7 text-xs" />
                      <Select value={assignPeriod || 'none'} onValueChange={v => setAssignPeriod(v === 'none' ? '' : v)}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Okres liturgiczny…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— brak —</SelectItem>
                          {LITURGICAL_PERIODS.map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 text-xs flex-1" onClick={() => handleAssign(m.id)}>
                          <Check className="w-3 h-3 mr-1" /> Przypisz
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAssigningId(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-2 h-7 text-xs w-full"
                      onClick={() => { setAssigningId(m.id); setAssignKey(''); setAssignPeriod(''); }}>
                      Wybierz
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
