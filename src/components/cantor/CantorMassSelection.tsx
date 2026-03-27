import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Music, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getCachedLiturgy, refreshLiturgyCache } from '@/lib/liturgyCache';
import type { CantorMelody } from '@/hooks/useCantors';

interface Props {
  cantorId: string;
  melodies: CantorMelody[];
  initialDate?: string;
  onSubmit: (sel: {
    cantor_id: string;
    melody_id?: string | null;
    mass_date: string;
    mass_time?: string;
    custom_melody?: string;
    custom_key?: string;
    psalm_title?: string;
  }) => Promise<boolean>;
}

/** Extract psalm refrain from readings HTML */
function extractPsalmRefrain(html: string): string | null {
  if (!html) return null;
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || '';
  const match = text.match(/Refren:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

export function CantorMassSelection({ cantorId, melodies, initialDate, onSubmit }: Props) {
  const today = initialDate || new Date().toISOString().slice(0, 10);
  const [massDate, setMassDate] = useState<Date>(new Date(today + 'T00:00:00'));
  const [massTime, setMassTime] = useState('');
  const [selectedMelodyId, setSelectedMelodyId] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);
  const [customMelody, setCustomMelody] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [psalmTitle, setPsalmTitle] = useState('');
  const [sending, setSending] = useState(false);

  const [suggestedPsalm, setSuggestedPsalm] = useState<string | null>(null);
  const [psalmLoading, setPsalmLoading] = useState(false);

  // Fetch psalm refrain whenever the date changes
  const fetchPsalmForDate = useCallback(async (date: Date) => {
    setPsalmLoading(true);
    setSuggestedPsalm(null);
    try {
      const cached = await getCachedLiturgy(date, 'readings');
      let readings = cached.data as any;
      if (!readings) {
        readings = await refreshLiturgyCache(date, 'readings');
      }
      const html = readings?.options?.[0]?.contentHtml || '';
      const refrain = extractPsalmRefrain(html);
      setSuggestedPsalm(refrain);
      if (refrain) {
        setPsalmTitle(refrain);
      }
    } catch {
      // silent
    } finally {
      setPsalmLoading(false);
    }
  }, []);

  // Fetch on mount and date change
  useEffect(() => {
    fetchPsalmForDate(massDate);
  }, [massDate, fetchPsalmForDate]);

  const handleDateChange = (date: Date | undefined) => {
    if (date) setMassDate(date);
  };

  const massDateStr = massDate.toISOString().slice(0, 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useCustom && !selectedMelodyId) {
      toast({ title: 'Wybierz melodię', variant: 'destructive' });
      return;
    }
    if (useCustom && !customMelody.trim()) {
      toast({ title: 'Wpisz nazwę melodii', variant: 'destructive' });
      return;
    }

    setSending(true);
    const ok = await onSubmit({
      cantor_id: cantorId,
      melody_id: useCustom ? null : selectedMelodyId,
      mass_date: massDateStr,
      mass_time: massTime || undefined,
      custom_melody: useCustom ? customMelody : undefined,
      custom_key: useCustom ? customKey : undefined,
      psalm_title: psalmTitle || undefined,
    });
    setSending(false);

    if (ok) {
      toast({ title: '✅ Wybór wysłany do organisty!' });
      setSelectedMelodyId('');
      setCustomMelody('');
      setCustomKey('');
      setMassTime('');
    } else {
      toast({ title: 'Błąd wysyłania', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="w-4 h-4" /> Wybór melodii na mszę
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {psalmLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Ładowanie psalmu na {massDateStr}...
            </div>
          )}

          {suggestedPsalm && !psalmLoading && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm">
              <span className="font-medium">Sugerowany psalm:</span> {suggestedPsalm}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data mszy</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !massDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(massDate, 'PPP', { locale: pl })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={massDate}
                    onSelect={handleDateChange}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    modifiers={{ sunday: (date) => date.getDay() === 0 }}
                    modifiersClassNames={{ sunday: 'bg-primary/20 text-primary font-bold rounded-md' }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Godzina mszy</label>
              <Input type="time" value={massTime} onChange={e => setMassTime(e.target.value)} placeholder="np. 10:00" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Psalm / refren</label>
            <Input value={psalmTitle} onChange={e => setPsalmTitle(e.target.value)} placeholder="Tytuł psalmu" />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={!useCustom ? 'default' : 'outline'}
              onClick={() => setUseCustom(false)}
            >
              <Music className="w-3.5 h-3.5 mr-1" /> Z profilu
            </Button>
            <Button
              type="button"
              size="sm"
              variant={useCustom ? 'default' : 'outline'}
              onClick={() => setUseCustom(true)}
            >
              Własna melodia
            </Button>
          </div>

          {!useCustom ? (
            <Select value={selectedMelodyId} onValueChange={setSelectedMelodyId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz melodię z profilu" />
              </SelectTrigger>
              <SelectContent>
                {melodies.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.melody_name} {m.key ? `(${m.key})` : ''} {m.psalm_title ? `— ${m.psalm_title}` : ''}
                  </SelectItem>
                ))}
                {melodies.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground text-center">Brak melodii w profilu</div>
                )}
              </SelectContent>
            </Select>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Nazwa melodii" value={customMelody} onChange={e => setCustomMelody(e.target.value)} />
              <Input placeholder="Tonacja" value={customKey} onChange={e => setCustomKey(e.target.value)} />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={sending}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? 'Wysyłanie...' : 'Wyślij wybór do organisty'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
