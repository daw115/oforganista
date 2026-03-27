export interface ScheduleEntry {
  date: string;    // YYYY-MM-DD
  organist: string;
  time: string;    // HH:MM
}

export type Tab = 'songs' | 'readings' | 'calendar';

export interface TabInfo {
  id: Tab;
  label: string;
  emoji: string;
}

export interface OrganistColor {
  bg: string;
  text: string;
  chip: string;
  dot: string;
}
