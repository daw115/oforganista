import { toYMD } from './dateUtils';
import { Tab } from '@/types/schedule';

export function songsUrl(d: Date): string {
  return `https://musicamsacram.pl/propozycje-spiewow/dzien/${toYMD(d)}`;
}

export function readingsUrl(d: Date): string {
  return `https://niezbednik.niedziela.pl/liturgia/${toYMD(d)}`;
}

export function calendarUrl(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `https://brewiarz.pl/show.php3?day=${dd}${mm}${yy}`;
}

export function mszalUrl(d: Date): string {
  return `https://mszal.net/dato/${toYMD(d)}`;
}

export function liturgiaUrl(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `https://liturgia.wiara.pl/doc/${yyyy}${mm}${dd}`;
}

export function getTabUrl(tab: Tab, date: Date): string {
  switch (tab) {
    case 'songs': return songsUrl(date);
    case 'readings': return readingsUrl(date);
    case 'calendar': return calendarUrl(date);
  }
}
