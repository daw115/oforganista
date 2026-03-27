import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SongbookLink {
  label: string;
  page: number;
}

export interface Devotion {
  id: string;
  name: string;
  start_time: string | null;
  description: string | null;
  recurrence_type: 'weekly' | 'nth_weekday' | 'monthly_day' | 'liturgical_period';
  day_of_week: number | null; // 0=Nd, 1=Pn, ..., 6=So
  day_of_month: number | null;
  nth_occurrence: number | null;
  liturgical_periods: string[];
  is_active: boolean;
  songbook_links: SongbookLink[];
  created_at: string;
}

export type DevotionInsert = Omit<Devotion, 'id' | 'created_at'>;

const LITURGICAL_PERIODS = [
  'Adwent', 'Okres Bożego Narodzenia', 'Okres zwykły', 'Wielki Post',
  'Triduum Paschalne', 'Okres Wielkanocny',
] as const;

const DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'] as const;

export { LITURGICAL_PERIODS, DAY_NAMES };

/** Check if a devotion is scheduled for a given date */
export function isDevotionOnDate(d: Devotion, date: Date, currentLiturgicalPeriod?: string): boolean {
  if (!d.is_active) return false;
  const dow = date.getDay(); // 0=Sun
  const dom = date.getDate();

  switch (d.recurrence_type) {
    case 'weekly':
      return d.day_of_week === dow;

    case 'monthly_day':
      return d.day_of_month === dom;

    case 'nth_weekday': {
      if (d.day_of_week !== dow) return false;
      // Calculate which occurrence of this weekday in the month
      const nth = Math.ceil(dom / 7);
      return d.nth_occurrence === nth;
    }

    case 'liturgical_period':
      if (d.day_of_week !== dow) return false;
      if (!currentLiturgicalPeriod) return false;
      return d.liturgical_periods.includes(currentLiturgicalPeriod);

    default:
      return false;
  }
}

/** Human-readable schedule description */
export function describeSchedule(d: Devotion): string {
  const dayName = d.day_of_week != null ? DAY_NAMES[d.day_of_week].toLowerCase() : '';

  switch (d.recurrence_type) {
    case 'weekly':
      return `co tydzień: ${dayName}`;
    case 'monthly_day':
      return `co miesiąc: ${d.day_of_month}. dzień`;
    case 'nth_weekday':
      return `${d.nth_occurrence}. ${dayName} miesiąca`;
    case 'liturgical_period':
      return `${dayName} w okresie: ${d.liturgical_periods.join(', ')}`;
    default:
      return '';
  }
}

/** Estimate current liturgical period from date (approximate) */
export function estimateLiturgicalPeriod(date: Date): string {
  const year = date.getFullYear();
  
  // Easter calculation (Anonymous Gregorian algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  
  const diffDays = Math.floor((date.getTime() - easter.getTime()) / (1000 * 60 * 60 * 24));
  
  // Ash Wednesday = Easter - 46 days
  // Pentecost = Easter + 49 days
  
  // Advent: starts 4th Sunday before Dec 25
  const dec25 = new Date(year, 11, 25);
  const dec25dow = dec25.getDay();
  const advent1 = new Date(year, 11, 25 - dec25dow - 21 - (dec25dow === 0 ? 7 : 0));
  // Simplify: Advent starts ~Nov 27-Dec 3
  const adventStart = new Date(year, 10, 27 + ((7 - new Date(year, 10, 27).getDay()) % 7));
  
  if (diffDays >= -3 && diffDays <= 0) return 'Triduum Paschalne';
  if (diffDays >= -46 && diffDays < -3) return 'Wielki Post';
  if (diffDays >= 1 && diffDays <= 49) return 'Okres Wielkanocny';
  
  // Christmas: Dec 25 to Baptism of the Lord (~Jan 6-13 next year)
  const prevYearDec25 = new Date(year - 1, 11, 25);
  const jan13 = new Date(year, 0, 13);
  if (date >= prevYearDec25 && date <= jan13) return 'Okres Bożego Narodzenia';
  if (date.getMonth() === 11 && date.getDate() >= 25) return 'Okres Bożego Narodzenia';
  
  // Advent
  if (date >= adventStart && date.getMonth() === 11 && date.getDate() < 25) return 'Adwent';
  if (date.getMonth() === 10 && date.getDate() >= 27 && date >= adventStart) return 'Adwent';
  
  return 'Okres zwykły';
}

export function useDevotions() {
  const [devotions, setDevotions] = useState<Devotion[]>(() => {
    try {
      const cached = localStorage.getItem('organista_devotions');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('devotions')
      .select('*')
      .order('name');
    if (!error && data) {
      const mapped = data.map(row => ({
        ...row,
        recurrence_type: row.recurrence_type as Devotion['recurrence_type'],
        liturgical_periods: (row.liturgical_periods as string[]) ?? [],
        songbook_links: (Array.isArray((row as any).songbook_links) ? (row as any).songbook_links : []) as SongbookLink[],
      }));
      setDevotions(mapped);
      try { localStorage.setItem('organista_devotions', JSON.stringify(mapped)); } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (devotion: DevotionInsert) => {
    const { error } = await supabase.from('devotions').insert({
      name: devotion.name,
      start_time: devotion.start_time,
      description: devotion.description,
      recurrence_type: devotion.recurrence_type,
      day_of_week: devotion.day_of_week,
      day_of_month: devotion.day_of_month,
      nth_occurrence: devotion.nth_occurrence,
      liturgical_periods: devotion.liturgical_periods,
      is_active: devotion.is_active,
      songbook_links: devotion.songbook_links,
    } as any);
    if (!error) await load();
    return error;
  }, [load]);

  const update = useCallback(async (id: string, updates: Partial<DevotionInsert>) => {
    const { error } = await supabase.from('devotions').update(updates as any).eq('id', id);
    if (!error) await load();
    return error;
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('devotions').delete().eq('id', id);
    if (!error) await load();
    return error;
  }, [load]);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    return update(id, { is_active: isActive });
  }, [update]);

  return { devotions, loading, load, add, update, remove, toggleActive };
}
