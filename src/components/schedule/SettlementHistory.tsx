import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface HistoryEntry {
  id: string;
  month_key: string;
  month_label: string;
  year: number;
  total_masses: number;
  total_amount: number;
  organist_data: Record<string, { masses: number; amount: number }>;
  updated_at: string;
}

export function SettlementHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('settlement_history')
      .select('*')
      .order('month_key', { ascending: false });

    if (error) {
      console.error(error);
      toast.error('Błąd pobierania historii');
    } else {
      setEntries((data || []) as unknown as HistoryEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchHistory(); }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('settlement_history').delete().eq('id', id);
    if (error) {
      toast.error('Błąd usuwania');
    } else {
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success('Usunięto');
    }
  };

  if (loading) {
    return <div className="px-4 py-8 text-center text-muted-foreground text-sm">Ładowanie...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground text-sm">
        Brak historii rozliczeń. Wygeneruj PDF aby zapisać rozliczenie.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Miesiąc</th>
            <th className="px-3 py-2 text-center font-semibold">Msze</th>
            <th className="px-3 py-2 text-center font-semibold">Kwota</th>
            <th className="px-3 py-2 text-center font-semibold">Szczegóły</th>
            <th className="px-3 py-2 text-center font-semibold">Zapisano</th>
            <th className="px-3 py-2 text-center font-semibold"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {entries.map(entry => {
            const orgData = (typeof entry.organist_data === 'object' && entry.organist_data) || {};
            return (
              <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-medium">{entry.month_label} {entry.year}</td>
                <td className="px-3 py-2 text-center">{entry.total_masses}</td>
                <td className="px-3 py-2 text-center font-bold">{entry.total_amount} zł</td>
                <td className="px-3 py-2 text-center text-muted-foreground">
                  {Object.entries(orgData).map(([name, d]) => (
                    <span key={name} className="inline-block mr-2">
                      {name}: {d.masses} mszy / {d.amount} zł
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">
                  {new Date(entry.updated_at).toLocaleDateString('pl-PL')}
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => handleDelete(entry.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Usuń">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
