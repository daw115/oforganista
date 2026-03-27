/**
 * Utility: Parse MusicXML into an editable note array,
 * and serialize edited notes back to MusicXML.
 */

export interface EditableNote {
  id: string;
  type: 'note' | 'rest';
  step: string;       // C D E F G A B
  octave: number;
  alter: number;       // -1 flat, 0 natural, 1 sharp
  duration: string;    // 'whole' | 'half' | 'quarter' | 'eighth' | '16th'
  dotted: boolean;
  lyric?: string;
}

const DURATION_MAP: Record<string, number> = {
  'whole': 16, 'half': 8, 'quarter': 4, 'eighth': 2, '16th': 1,
};

const DURATION_LABELS: Record<string, string> = {
  'whole': '𝅝', 'half': '𝅗𝅥', 'quarter': '♩', 'eighth': '♪', '16th': '𝅘𝅥𝅯',
};

export const DURATIONS = ['whole', 'half', 'quarter', 'eighth', '16th'] as const;
export const DURATION_DISPLAY = DURATION_LABELS;

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export { STEPS };

/** Note height on staff (0 = middle C4, positive = up) */
export function noteToStaffPosition(step: string, octave: number): number {
  const stepIndex = STEPS.indexOf(step as any);
  return (octave - 4) * 7 + stepIndex;
}

/** Inverse: staff position to step + octave */
export function staffPositionToNote(pos: number): { step: string; octave: number } {
  let octave = 4 + Math.floor(pos / 7);
  let stepIdx = ((pos % 7) + 7) % 7;
  if (pos < 0 && pos % 7 !== 0) {
    octave = 4 + Math.floor(pos / 7);
    stepIdx = ((pos % 7) + 7) % 7;
  }
  return { step: STEPS[stepIdx], octave };
}

let _idCounter = 0;
function genId() { return `note_${++_idCounter}_${Date.now()}`; }

/**
 * Parse MusicXML XML string into editable notes.
 */
export function parseToEditable(xml: string): { notes: EditableNote[]; title: string; keyFifths: number; timeBeats: number; timeBeatType: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const titleEl = doc.querySelector('work-title') || doc.querySelector('movement-title');
  const title = titleEl?.textContent ?? 'Bez tytułu';

  const keyEl = doc.querySelector('key > fifths');
  const keyFifths = keyEl ? parseInt(keyEl.textContent || '0', 10) : 0;

  const beatsEl = doc.querySelector('time > beats');
  const beatTypeEl = doc.querySelector('time > beat-type');
  const timeBeats = beatsEl ? parseInt(beatsEl.textContent || '4', 10) : 4;
  const timeBeatType = beatTypeEl ? parseInt(beatTypeEl.textContent || '4', 10) : 4;

  const divisionsEl = doc.querySelector('attributes > divisions');
  const divisions = divisionsEl ? parseInt(divisionsEl.textContent || '4', 10) : 4;

  const notes: EditableNote[] = [];
  const noteEls = doc.querySelectorAll('note');

  for (const noteEl of noteEls) {
    const restEl = noteEl.querySelector('rest');
    const pitchEl = noteEl.querySelector('pitch');
    const typeEl = noteEl.querySelector('type');
    const dotEl = noteEl.querySelector('dot');
    const lyricEl = noteEl.querySelector('lyric > text');

    const durType = typeEl?.textContent || 'quarter';
    const dotted = !!dotEl;

    if (restEl) {
      notes.push({
        id: genId(),
        type: 'rest',
        step: 'C',
        octave: 4,
        alter: 0,
        duration: durType,
        dotted,
      });
    } else if (pitchEl) {
      const step = pitchEl.querySelector('step')?.textContent || 'C';
      const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4', 10);
      const alter = parseInt(pitchEl.querySelector('alter')?.textContent || '0', 10);

      notes.push({
        id: genId(),
        type: 'note',
        step,
        octave,
        alter,
        duration: durType,
        dotted,
        lyric: lyricEl?.textContent || undefined,
      });
    }
  }

  return { notes, title, keyFifths, timeBeats, timeBeatType };
}

/**
 * Serialize editable notes back to MusicXML.
 */
export function editableToMusicXml(
  notes: EditableNote[],
  title: string,
  keyFifths: number = 0,
  timeBeats: number = 4,
  timeBeatType: number = 4,
): string {
  const divisions = 4; // sixteenth = 1

  function durationTicks(dur: string, dotted: boolean): number {
    const base = DURATION_MAP[dur] ?? 4;
    return dotted ? Math.floor(base * 1.5) : base;
  }

  let measuresXml = '';
  let ticksInMeasure = 0;
  const ticksPerMeasure = (timeBeats / timeBeatType) * 4 * divisions; // e.g. 4/4 → 16
  let measureNum = 1;
  let firstMeasure = true;
  let currentMeasureNotes = '';

  function flushMeasure() {
    const attrs = firstMeasure
      ? `      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${keyFifths}</fifths></key>
        <time><beats>${timeBeats}</beats><beat-type>${timeBeatType}</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>\n`
      : '';
    measuresXml += `    <measure number="${measureNum}">\n${attrs}${currentMeasureNotes}    </measure>\n`;
    measureNum++;
    firstMeasure = false;
    currentMeasureNotes = '';
    ticksInMeasure = 0;
  }

  for (const note of notes) {
    const ticks = durationTicks(note.duration, note.dotted);

    // Start new measure if full
    if (ticksInMeasure > 0 && ticksInMeasure + ticks > ticksPerMeasure) {
      // Fill remaining with rest
      const remaining = ticksPerMeasure - ticksInMeasure;
      if (remaining > 0) {
        currentMeasureNotes += `      <note><rest/><duration>${remaining}</duration><type>quarter</type></note>\n`;
      }
      flushMeasure();
    }

    if (note.type === 'rest') {
      currentMeasureNotes += `      <note><rest/><duration>${ticks}</duration><type>${note.duration}</type>${note.dotted ? '<dot/>' : ''}</note>\n`;
    } else {
      let pitchXml = `<pitch><step>${note.step}</step>`;
      if (note.alter !== 0) pitchXml += `<alter>${note.alter}</alter>`;
      pitchXml += `<octave>${note.octave}</octave></pitch>`;

      let lyricXml = '';
      if (note.lyric) {
        lyricXml = `<lyric><text>${escapeXml(note.lyric)}</text></lyric>`;
      }

      currentMeasureNotes += `      <note>${pitchXml}<duration>${ticks}</duration><type>${note.duration}</type>${note.dotted ? '<dot/>' : ''}${lyricXml}</note>\n`;
    }

    ticksInMeasure += ticks;

    if (ticksInMeasure >= ticksPerMeasure) {
      flushMeasure();
    }
  }

  // Flush remaining
  if (currentMeasureNotes) {
    flushMeasure();
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Melodia</part-name></score-part>
  </part-list>
  <part id="P1">
${measuresXml}  </part>
</score-partwise>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function createEmptyNote(): EditableNote {
  return { id: genId(), type: 'note', step: 'C', octave: 4, alter: 0, duration: 'quarter', dotted: false };
}

export function createRest(): EditableNote {
  return { id: genId(), type: 'rest', step: 'C', octave: 4, alter: 0, duration: 'quarter', dotted: false };
}
