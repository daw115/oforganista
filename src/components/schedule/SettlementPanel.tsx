import { useState, useMemo, useCallback } from 'react';
import { ScheduleEntry } from '@/types/schedule';
import { buildSettlement, parseAmountsFromCSV, SettlementRow } from '@/lib/settlementParser';
import { generateSettlementPdf } from '@/lib/settlementPdf';
import { getOrganistColor } from '@/lib/colors';
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileDown, Lock, History } from 'lucide-react';
import { SettlementHistory } from './SettlementHistory';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SETTLEMENT_PASSWORD = 'ofiarowanie1234';
const MONTH_NAMES_PL = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

interface SettlementPanelProps {
  sched: ScheduleEntry[];
  organists: string[];
  rawCsv: string;
  csvHolidays?: Set<string>;
}

export function SettlementPanel({ sched, organists, rawCsv, csvHolidays }: SettlementPanelProps) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem('settlementUnlocked') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [activeTab, setActiveTab] = useState<'rozliczenie' | 'historia'>('rozliczenie');
  const [holidays, setHolidays] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('settlementHolidays');
      const manual = saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
      if (csvHolidays) {
        for (const h of csvHolidays) manual.add(h);
      }
      return manual;
    } catch { return csvHolidays ?? new Set(); }
  });
  const [expanded, setExpanded] = useState(true);

  const csvAmounts = useMemo(() => parseAmountsFromCSV(rawCsv, organists), [rawCsv, organists]);
  const rows = useMemo(() => buildSettlement(sched, organists, csvAmounts, holidays), [sched, organists, csvAmounts, holidays]);

  const toggleHoliday = (date: string) => {
    setHolidays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      localStorage.setItem('settlementHolidays', JSON.stringify([...next]));
      return next;
    });
  };

  const totals = useMemo(() => {
    const t: Record<string, { masses: number; calculated: number; csv: number; calculatedForCsvDays: number; uncoveredDays: number; uncoveredAmount: number }> = {};
    for (const org of organists) {
      t[org] = { masses: 0, calculated: 0, csv: 0, calculatedForCsvDays: 0, uncoveredDays: 0, uncoveredAmount: 0 };
    }
    for (const row of rows) {
      for (const org of organists) {
        const d = row.organistData[org];
        if (d) {
          t[org].masses += d.masses;
          t[org].calculated += d.calculatedAmount;
          const csvVal = d.csvAmount ?? 0;
          t[org].csv += csvVal;
          t[org].calculatedForCsvDays += d.calculatedAmount;
          if (d.csvAmount === null && d.masses > 0) {
            t[org].uncoveredDays += 1;
            t[org].uncoveredAmount += d.calculatedAmount;
          }
        }
      }
    }
    return t;
  }, [rows, organists]);

  const grandTotal = useMemo(() => {
    let masses = 0, calculated = 0, csv = 0;
    for (const org of organists) {
      masses += totals[org].masses;
      calculated += totals[org].calculated;
      csv += totals[org].csv;
    }
    return { masses, calculated, csv };
  }, [totals, organists]);

  const hasAnyCsvAmounts = Object.keys(csvAmounts).length > 0;

  const handleUnlock = () => {
    if (passwordInput === SETTLEMENT_PASSWORD) {
      setUnlocked(true);
      localStorage.setItem('settlementUnlocked', 'true');
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const saveToHistory = useCallback(async () => {
    if (rows.length === 0) return;
    const firstDate = new Date(rows[0].date + 'T12:00:00');
    const month = firstDate.getMonth();
    const year = firstDate.getFullYear();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLabel = MONTH_NAMES_PL[month];

    const organistSummary: Record<string, { masses: number; amount: number }> = {};
    for (const org of organists) {
      organistSummary[org] = { masses: totals[org].masses, amount: totals[org].calculated };
    }

    const { error } = await supabase.from('settlement_history').upsert({
      month_key: monthKey,
      month_label: monthLabel,
      year,
      total_masses: grandTotal.masses,
      total_amount: grandTotal.calculated,
      organist_data: organistSummary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'month_key' });

    if (error) {
      toast.error('Błąd zapisu historii');
      console.error(error);
    } else {
      toast.success(`Zapisano rozliczenie: ${monthLabel} ${year}`);
    }
  }, [rows, organists, totals, grandTotal]);

  const handleGeneratePdf = async () => {
    generateSettlementPdf(rows, organists);
    await saveToHistory();
  };

  // Password gate
  if (!unlocked) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4">
          <span className="font-extrabold flex items-center gap-2">💰 Rozliczenie</span>
        </div>
        <div className="px-5 pb-6 flex flex-col items-center gap-3">
          <Lock className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Wprowadź hasło aby otworzyć rozliczenie</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              className={`px-3 py-2 rounded-lg border text-sm bg-background ${passwordError ? 'border-destructive' : 'border-border'}`}
              placeholder="Hasło..."
            />
            <button onClick={handleUnlock} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Odblokuj
            </button>
          </div>
          {passwordError && <p className="text-xs text-destructive">Nieprawidłowe hasło</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <span className="font-extrabold flex items-center gap-2">💰 Rozliczenie</span>
        <div className="flex items-center gap-2">
          {expanded && (
            <button
              onClick={(e) => { e.stopPropagation(); handleGeneratePdf(); }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title="Pobierz PDF"
            >
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
          )}
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-border/50 px-4">
            <button
              onClick={() => setActiveTab('rozliczenie')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'rozliczenie' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              📊 Rozliczenie
            </button>
            <button
              onClick={() => setActiveTab('historia')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${activeTab === 'historia' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <History className="w-3.5 h-3.5" /> Historia
            </button>
          </div>

          {activeTab === 'historia' ? (
            <SettlementHistory />
          ) : (
            <div className="overflow-x-auto">
              {/* Summary cards */}
              <div className="flex flex-wrap gap-3 px-4 py-3">
                {organists.map(org => {
                  const c = getOrganistColor(org);
                  const t = totals[org];
                  const mismatch = hasAnyCsvAmounts && t.csv > 0 && t.csv !== t.calculatedForCsvDays;
                  return (
                    <div key={org} className="rounded-xl px-4 py-3 min-w-[160px]" style={{ background: c.chip }}>
                      <div className="font-bold text-sm" style={{ color: c.text }}>{org}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t.masses} mszy · <span className="font-bold text-foreground">{t.calculated} zł</span>
                      </div>
                      {hasAnyCsvAmounts && t.csv > 0 && (
                        <div className={`text-xs mt-0.5 flex items-center gap-1 ${mismatch ? 'text-destructive font-bold' : 'text-emerald'}`}>
                          {mismatch ? <AlertTriangle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                          Tabela: {t.csv} zł vs wyliczone: {t.calculatedForCsvDays} zł
                          {mismatch && ` (różnica: ${t.calculatedForCsvDays - t.csv} zł)`}
                        </div>
                      )}
                      {t.uncoveredDays > 0 && (
                        <div className="text-xs mt-0.5 text-muted-foreground">
                          📌 {t.uncoveredDays} dni bez kwoty w tabeli ({t.uncoveredAmount} zł)
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* RAZEM card */}
                <div className="rounded-xl px-4 py-3 min-w-[160px] bg-muted/50 border border-border">
                  <div className="font-bold text-sm">Razem</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {grandTotal.masses} mszy · <span className="font-bold text-foreground">{grandTotal.calculated} zł</span>
                  </div>
                  {hasAnyCsvAmounts && grandTotal.csv > 0 && (
                    <div className="text-xs mt-0.5 text-muted-foreground">
                      Tabela: {grandTotal.csv} zł
                    </div>
                  )}
                </div>
              </div>

              {/* Legend */}
              <div className="px-4 pb-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span>📋 Powszednie: 50 zł/msza</span>
                <span>⛪ Sob 18-19 + niedziele: 60 zł/msza</span>
                <span>🎉 Kliknij dzień aby oznaczyć święto (60 zł)</span>
              </div>

              {/* Table */}
              <table className="w-full text-xs border-t border-border/50">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold">Dzień</th>
                    <th className="px-3 py-2 text-left font-semibold">Data</th>
                    {organists.map(org => (
                      <th key={`${org}-m`} className="px-2 py-2 text-center font-semibold">Msze {org}</th>
                    ))}
                    {organists.map(org => (
                      <th key={`${org}-k`} className="px-2 py-2 text-center font-semibold">Kwota {org}</th>
                    ))}
                    {hasAnyCsvAmounts && <th className="px-2 py-2 text-center font-semibold">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rows.map(row => {
                    const isSun = row.dayOfWeek === 0;
                    const isSat = row.dayOfWeek === 6;
                    const isHol = holidays.has(row.date);
                    const d = new Date(row.date + 'T12:00:00');
                    const dateFormatted = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

                    let hasError = false;
                    for (const org of organists) {
                      const od = row.organistData[org];
                      if (od && od.masses > 0) {
                        const csvVal = od.csvAmount ?? 0;
                        if (csvVal !== od.calculatedAmount) hasError = true;
                      }
                    }

                    let rowBg = '';
                    if (hasError) rowBg = 'bg-destructive/10';
                    else if (isSun) rowBg = 'bg-destructive/5';
                    else if (isHol) rowBg = 'bg-amber/10';
                    else if (isSat) rowBg = 'bg-muted/20';

                    return (
                      <tr key={row.date} className={`${rowBg} hover:bg-muted/30 transition-colors`}>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <button
                            onClick={() => toggleHoliday(row.date)}
                            className={`text-left font-medium ${isSun ? 'text-destructive font-bold' : ''} ${isHol ? 'text-amber font-bold' : ''}`}
                            title={isHol ? 'Kliknij aby odznaczyć święto' : 'Kliknij aby oznaczyć jako święto (60 zł)'}
                          >
                            {isHol && '🎉 '}{row.dayName}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">{dateFormatted}</td>
                        {organists.map(org => {
                          const od = row.organistData[org];
                          return (
                            <td key={`${org}-m`} className="px-2 py-1.5 text-center">
                              {od && od.masses > 0 ? (
                                <span title={od.times.join(', ')}>
                                  {od.masses}
                                  <span className="text-muted-foreground ml-1">({od.times.join(', ')})</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                        {organists.map(org => {
                          const od = row.organistData[org];
                          if (!od || od.masses === 0) {
                            return <td key={`${org}-k`} className="px-2 py-1.5 text-center text-muted-foreground/40">—</td>;
                          }
                          const csvVal = od.csvAmount ?? 0;
                          const mismatch = csvVal !== od.calculatedAmount;
                          return (
                            <td key={`${org}-k`} className={`px-2 py-1.5 text-center font-bold ${mismatch ? 'text-destructive' : ''}`}>
                              {od.calculatedAmount} zł
                              {mismatch && (
                                <span className="block text-[9px] text-destructive font-normal">tabela: {csvVal} zł</span>
                              )}
                            </td>
                          );
                        })}
                        {hasAnyCsvAmounts && (
                          <td className="px-2 py-1.5 text-center">
                            {hasError ? <AlertTriangle className="w-3.5 h-3.5 text-destructive inline" /> : <Check className="w-3.5 h-3.5 text-emerald inline" />}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-bold border-t border-border">
                    <td className="px-3 py-2" colSpan={2}>RAZEM</td>
                    {organists.map(org => (
                      <td key={`${org}-tm`} className="px-2 py-2 text-center">{totals[org].masses}</td>
                    ))}
                    {organists.map(org => {
                      const t = totals[org];
                      const mismatch = hasAnyCsvAmounts && t.csv > 0 && t.csv !== t.calculatedForCsvDays;
                      return (
                        <td key={`${org}-tk`} className={`px-2 py-2 text-center ${mismatch ? 'text-destructive' : ''}`}>
                          {t.calculated} zł
                          {hasAnyCsvAmounts && t.csv > 0 && (
                            <span className={`block text-[9px] font-normal ${mismatch ? 'text-destructive' : 'text-muted-foreground'}`}>
                              tabela: {t.csv} zł {mismatch ? `(Δ ${t.calculatedForCsvDays - t.csv} zł)` : '✓'}
                            </span>
                          )}
                          {t.uncoveredDays > 0 && (
                            <span className="block text-[9px] font-normal text-muted-foreground">+{t.uncoveredAmount} zł bez kwoty</span>
                          )}
                        </td>
                      );
                    })}
                    {hasAnyCsvAmounts && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
