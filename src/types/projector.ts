export interface ProjectorSlide {
  slideNo: number;
  lines: string[];
  text: string;
  lineCount: number;
}

export interface ProjectorSectionData {
  fitsSingleSlide: boolean;
  slideCount: number;
  slides: ProjectorSlide[];
}

export interface Verse {
  type: 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'other';
  label: string;
  text: string;
  ref?: string;
  /** Sequential section number within the song (1-based) */
  sectionNumber?: number;
  /** Normalized text for search (lowercase, no diacritics) */
  normalizedText?: string;
  projector?: ProjectorSectionData;
}

/** A flattened, pre-computed slide for direct projector access */
export interface DisplaySlide {
  /** Stable global ID: songId:sectionRef:slideNo */
  globalSlideId: string;
  songId: string;
  songNumber: number;
  sectionRef: string;
  sectionNumber: number;
  sectionType: Verse['type'];
  /** Slide number within this section (1-based) */
  localSlideNo: number;
  /** Slide number within the entire song (1-based) */
  songSlideNo: number;
  text: string;
  lines: string[];
  lineCount: number;
  /** Normalized text for slide-level search */
  searchText: string;
}

export interface Song {
  id: string;
  /** Stable sequential number in the database (assigned once, never changes) */
  songNumber?: number;
  /** Per-song font color override (hex, e.g. '#FFE040') */
  fontColor?: string;
  /** URL-friendly slug: normalized-title-songNumber */
  slug?: string;
  /** Sort key for consistent ordering (normalized title) */
  sortKey?: string;
  title: string;
  /** Normalized title: lowercase, no diacritics, no punctuation */
  normalizedTitle?: string;
  /** Prefix array for fast autocomplete */
  titlePrefixes?: string[];
  /** Search tokens from title, author, source, siedlecki, first lines, variants */
  searchTokens?: string[];
  author?: string;
  source?: string;
  siedleckiNumber?: string;
  variants?: any;
  /** Family ID for linking song variants together */
  familyId?: string;
  verses: Verse[];
  displayOrder?: string[];
  /** Pre-computed flat slide array for instant projector access */
  projectorDisplaySlides?: DisplaySlide[];
  projectorPresetName?: string;
  projectorPreparedAt?: string;
  projectorVersion?: number;
  searchText: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlaylistItem {
  id: string;
  songId: string;
  title: string;
  isPsalm?: boolean;
  litDate?: string;
}

export interface ProjectorState {
  currentItemIndex: number;
  currentVerseIndex: number;
  currentSlideIndex?: number;
  isLive: boolean;
  playlist: PlaylistItem[];
}

export interface ProjectorMessage {
  type: 'STATE_UPDATE';
  state: {
    text: string;
    isLive: boolean;
  };
}
