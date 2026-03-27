/** Types for LAN bridge — remote control of OpenLP through cloud rooms */

import type { LANState } from '@/hooks/useProjectorLAN';

export type LANCommandType =
  | 'next'
  | 'prev'
  | 'nextItem'
  | 'prevItem'
  | 'goToSlide'
  | 'goToItem'
  | 'toggleBlank'
  | 'refresh'
  | 'addSong'
  | 'removeItem';

export interface LANCommand {
  type: LANCommandType;
  index?: number; // for goToSlide / goToItem
  title?: string; // for addSong
  msgId: string;
}

/** State broadcast from bridge to remote controllers */
export interface LANBridgeState {
  connected: boolean;
  serviceItems: Array<{ id: string; title: string; plugin: string; selected: boolean }>;
  slides: Array<{ tag: string; text: string; selected: boolean }>;
  currentSlideIndex: number;
  currentServiceIndex: number;
  displayMode: 'show' | 'blank' | 'theme' | 'desktop';
  currentTitle: string;
  bridgeId: string; // identifies the bridge device
  timestamp: number;
}

export function lanStateTobridge(state: LANState, bridgeId: string): LANBridgeState {
  return {
    connected: state.connected,
    serviceItems: state.serviceItems.map(i => ({
      id: i.id, title: i.title, plugin: i.plugin, selected: i.selected,
    })),
    slides: state.slides.map(s => ({
      tag: s.tag, text: s.text, selected: s.selected,
    })),
    currentSlideIndex: state.currentSlideIndex,
    currentServiceIndex: state.currentServiceIndex,
    displayMode: state.displayMode,
    currentTitle: state.currentTitle,
    bridgeId,
    timestamp: Date.now(),
  };
}
