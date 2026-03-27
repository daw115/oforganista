/**
 * Convert detected notes to MusicXML format.
 */

import type { DetectedNote } from './pitchDetection';

const STEP_MAP: Record<string, { step: string; alter?: number }> = {
  'C': { step: 'C' },
  'C#': { step: 'C', alter: 1 },
  'D': { step: 'D' },
  'D#': { step: 'D', alter: 1 },
  'E': { step: 'E' },
  'F': { step: 'F' },
  'F#': { step: 'F', alter: 1 },
  'G': { step: 'G' },
  'G#': { step: 'G', alter: 1 },
  'A': { step: 'A' },
  'A#': { step: 'A', alter: 1 },
  'B': { step: 'B' },
};

interface QuantizedNote {
  step: string;
  alter?: number;
  octave: number;
  type: string;    // quarter, half, whole, eighth, 16th
  dots: number;
  duration: number; // in divisions
}

function quantizeDuration(durationMs: number, bpm: number, divisions: number): { type: string; dots: number; duration: number } {
  const beatMs = 60000 / bpm;
  const beats = durationMs / beatMs;
  
  // Duration types in beats
  const types: [string, number][] = [
    ['whole', 4],
    ['half', 2],
    ['quarter', 1],
    ['eighth', 0.5],
    ['16th', 0.25],
  ];

  // Find closest match including dotted variants
  let bestType = 'quarter';
  let bestDots = 0;
  let bestDiff = Infinity;
  let bestDuration = divisions;

  for (const [typeName, typeBeats] of types) {
    // Without dot
    const diff0 = Math.abs(beats - typeBeats);
    if (diff0 < bestDiff) {
      bestDiff = diff0;
      bestType = typeName;
      bestDots = 0;
      bestDuration = Math.round(typeBeats * divisions);
    }
    // With dot (1.5x)
    const dottedBeats = typeBeats * 1.5;
    const diff1 = Math.abs(beats - dottedBeats);
    if (diff1 < bestDiff) {
      bestDiff = diff1;
      bestType = typeName;
      bestDots = 1;
      bestDuration = Math.round(dottedBeats * divisions);
    }
  }

  return { type: bestType, dots: bestDots, duration: Math.max(1, bestDuration) };
}

function parseNoteName(noteName: string): { noteLetter: string; octave: number } {
  const match = noteName.match(/^([A-G]#?)(\d+)$/);
  if (!match) return { noteLetter: 'C', octave: 4 };
  return { noteLetter: match[1], octave: parseInt(match[2], 10) };
}

export function notesToMusicXml(notes: DetectedNote[], title = 'Rozpoznana melodia', bpm = 80): string {
  if (notes.length === 0) {
    return createEmptyMusicXml(title);
  }

  const divisions = 4; // divisions per quarter note
  
  // Quantize notes
  const quantized: QuantizedNote[] = notes.map(n => {
    const { noteLetter, octave } = parseNoteName(n.noteName);
    const mapping = STEP_MAP[noteLetter] || { step: 'C' };
    const q = quantizeDuration(n.duration, bpm, divisions);
    
    return {
      step: mapping.step,
      alter: mapping.alter,
      octave,
      type: q.type,
      dots: q.dots,
      duration: q.duration,
    };
  });

  // Build measures (4/4 time, each measure = 4 * divisions = 16 divisions)
  const measureCapacity = 4 * divisions;
  const measures: QuantizedNote[][] = [];
  let currentMeasure: QuantizedNote[] = [];
  let currentFill = 0;

  for (const note of quantized) {
    if (currentFill + note.duration > measureCapacity) {
      // Fill remaining with rest if needed
      if (currentFill < measureCapacity) {
        // Just close measure, remaining time is implicit
      }
      measures.push(currentMeasure);
      currentMeasure = [];
      currentFill = 0;
    }
    currentMeasure.push(note);
    currentFill += note.duration;
  }
  if (currentMeasure.length > 0) {
    measures.push(currentMeasure);
  }

  // Generate XML
  const measureXmls = measures.map((measure, idx) => {
    const attrs = idx === 0 ? `
        <attributes>
          <divisions>${divisions}</divisions>
          <key><fifths>0</fifths></key>
          <time><beats>4</beats><beat-type>4</beat-type></time>
          <clef><sign>G</sign><line>2</line></clef>
        </attributes>
        <direction placement="above">
          <direction-type>
            <metronome>
              <beat-unit>quarter</beat-unit>
              <per-minute>${bpm}</per-minute>
            </metronome>
          </direction-type>
        </direction>` : '';

    const noteXmls = measure.map(n => {
      const alterXml = n.alter ? `\n            <alter>${n.alter}</alter>` : '';
      const dotsXml = Array(n.dots).fill('\n          <dot/>').join('');
      return `
        <note>
          <pitch>
            <step>${n.step}</step>${alterXml}
            <octave>${n.octave}</octave>
          </pitch>
          <duration>${n.duration}</duration>
          <type>${n.type}</type>${dotsXml}
        </note>`;
    }).join('');

    return `
      <measure number="${idx + 1}">${attrs}${noteXmls}
      </measure>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${escapeXml(title)}</work-title>
  </work>
  <identification>
    <creator type="composer">Rozpoznanie z głosu</creator>
    <encoding>
      <software>Organista - Pitch Detection</software>
      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Głos</part-name>
    </score-part>
  </part-list>
  <part id="P1">${measureXmls}
  </part>
</score-partwise>`;
}

function createEmptyMusicXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <part-list><score-part id="P1"><part-name>Głos</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
    </measure>
  </part>
</score-partwise>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
