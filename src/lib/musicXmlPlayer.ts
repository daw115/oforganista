/**
 * MusicXML player using Web Audio API synthesis.
 * Parses MusicXML, extracts notes, plays them with a simple sine/triangle oscillator.
 */

export interface PlayableNote {
  frequency: number;
  startTime: number; // seconds from beginning
  duration: number;  // seconds
}

const STEP_TO_SEMITONE: Record<string, number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function pitchToMidi(step: string, octave: number, alter: number): number {
  const semitone = STEP_TO_SEMITONE[step] ?? 0;
  return (octave + 1) * 12 + semitone + alter;
}

/**
 * Parse MusicXML string into playable notes with timing.
 */
export function parseMusicXml(xml: string): { notes: PlayableNote[]; totalDuration: number; bpm: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  // Get divisions (ticks per quarter note)
  const divisionsEl = doc.querySelector('attributes > divisions');
  const divisions = divisionsEl ? parseInt(divisionsEl.textContent || '4', 10) : 4;

  // Get BPM from metronome marking
  const perMinuteEl = doc.querySelector('metronome > per-minute');
  const bpm = perMinuteEl ? parseInt(perMinuteEl.textContent || '80', 10) : 80;

  const secondsPerDivision = 60 / (bpm * divisions);

  const notes: PlayableNote[] = [];
  let currentTick = 0;

  const noteEls = doc.querySelectorAll('note');
  for (const noteEl of noteEls) {
    const pitchEl = noteEl.querySelector('pitch');
    const durationEl = noteEl.querySelector('duration');
    const restEl = noteEl.querySelector('rest');
    const chordEl = noteEl.querySelector('chord');

    const durationTicks = durationEl ? parseInt(durationEl.textContent || '4', 10) : divisions;

    // If chord, don't advance time
    if (!chordEl && notes.length > 0) {
      // currentTick already advanced below
    }

    if (restEl) {
      currentTick += durationTicks;
      continue;
    }

    if (pitchEl) {
      const step = pitchEl.querySelector('step')?.textContent || 'C';
      const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4', 10);
      const alter = parseInt(pitchEl.querySelector('alter')?.textContent || '0', 10);

      const midi = pitchToMidi(step, octave, alter);
      const freq = midiToFreq(midi);

      const startTime = currentTick * secondsPerDivision;
      const duration = durationTicks * secondsPerDivision;

      notes.push({ frequency: freq, startTime, duration: duration * 0.9 }); // slight gap
    }

    if (!chordEl) {
      currentTick += durationTicks;
    }
  }

  const totalDuration = currentTick * secondsPerDivision;
  return { notes, totalDuration, bpm };
}

export interface MusicPlayer {
  play: () => void;
  stop: () => void;
  isPlaying: () => boolean;
  onEnd: (cb: () => void) => void;
  onProgress: (cb: (time: number, total: number) => void) => void;
}

/**
 * Create a Web Audio player for parsed MusicXML notes.
 */
export function createMusicPlayer(notes: PlayableNote[], totalDuration: number): MusicPlayer {
  let audioCtx: AudioContext | null = null;
  let playing = false;
  let endCallback: (() => void) | null = null;
  let progressCallback: ((time: number, total: number) => void) | null = null;
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  let scheduledNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  return {
    play() {
      if (playing) return;
      audioCtx = new AudioContext();
      playing = true;
      startedAt = audioCtx.currentTime;

      const masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(audioCtx.destination);

      scheduledNodes = [];

      for (const note of notes) {
        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.value = note.frequency;

        // ADSR-like envelope
        const attackTime = 0.02;
        const releaseTime = Math.min(0.08, note.duration * 0.2);
        const t0 = startedAt + note.startTime;

        noteGain.gain.setValueAtTime(0, t0);
        noteGain.gain.linearRampToValueAtTime(1, t0 + attackTime);
        noteGain.gain.setValueAtTime(1, t0 + note.duration - releaseTime);
        noteGain.gain.linearRampToValueAtTime(0, t0 + note.duration);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(t0);
        osc.stop(t0 + note.duration + 0.01);

        scheduledNodes.push({ osc, gain: noteGain });
      }

      // Progress tracking
      if (progressCallback) {
        progressInterval = setInterval(() => {
          if (!audioCtx || !playing) return;
          const elapsed = audioCtx.currentTime - startedAt;
          progressCallback?.(Math.min(elapsed, totalDuration), totalDuration);
        }, 50);
      }

      // End detection
      const endTime = (startedAt + totalDuration + 0.2) * 1000 - audioCtx.currentTime * 1000;
      setTimeout(() => {
        if (playing) {
          this.stop();
          endCallback?.();
        }
      }, Math.max(0, endTime));
    },

    stop() {
      playing = false;
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      for (const { osc } of scheduledNodes) {
        try { osc.stop(); } catch {}
      }
      scheduledNodes = [];
      audioCtx?.close();
      audioCtx = null;
    },

    isPlaying() {
      return playing;
    },

    onEnd(cb) {
      endCallback = cb;
    },

    onProgress(cb) {
      progressCallback = cb;
    },
  };
}

/**
 * Fetch MusicXML from URL, parse, and create a player.
 */
export async function createPlayerFromUrl(url: string): Promise<{ player: MusicPlayer; totalDuration: number; bpm: number; noteCount: number }> {
  const resp = await fetch(url);
  const xml = await resp.text();
  const { notes, totalDuration, bpm } = parseMusicXml(xml);
  const player = createMusicPlayer(notes, totalDuration);
  return { player, totalDuration, bpm, noteCount: notes.length };
}
