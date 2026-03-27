import { OrganistColor } from '@/types/schedule';

// Fixed named colors for known organists
const NAMED_COLORS: Record<string, OrganistColor> = {
  'Dawid': { bg: 'hsl(145 70% 42% / 0.15)', text: 'hsl(145 70% 62%)', chip: 'hsl(145 70% 42% / 0.2)', dot: 'hsl(145 70% 42%)' },
  'Michał': { bg: 'hsl(48 96% 50% / 0.15)', text: 'hsl(48 96% 65%)', chip: 'hsl(48 96% 50% / 0.2)', dot: 'hsl(48 96% 50%)' },
};

const FALLBACK_COLORS: OrganistColor[] = [
  { bg: 'hsl(217 91% 60% / 0.15)', text: 'hsl(217 91% 75%)', chip: 'hsl(217 91% 60% / 0.2)', dot: 'hsl(217 91% 60%)' },
  { bg: 'hsl(270 60% 60% / 0.15)', text: 'hsl(270 60% 75%)', chip: 'hsl(270 60% 60% / 0.2)', dot: 'hsl(270 60% 60%)' },
  { bg: 'hsl(330 81% 60% / 0.15)', text: 'hsl(330 81% 75%)', chip: 'hsl(330 81% 60% / 0.2)', dot: 'hsl(330 81% 60%)' },
  { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 92% 70%)', chip: 'hsl(38 92% 50% / 0.2)', dot: 'hsl(38 92% 50%)' },
];

const dynamicMap: Record<string, OrganistColor> = {};
let fallbackIndex = 0;

export function getOrganistColor(name: string): OrganistColor {
  if (NAMED_COLORS[name]) return NAMED_COLORS[name];
  if (!dynamicMap[name]) {
    dynamicMap[name] = FALLBACK_COLORS[fallbackIndex++ % FALLBACK_COLORS.length];
  }
  return dynamicMap[name];
}

export function resetColors() {
  Object.keys(dynamicMap).forEach(k => delete dynamicMap[k]);
  fallbackIndex = 0;
}
