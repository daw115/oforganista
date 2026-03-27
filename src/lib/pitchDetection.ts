/**
 * Real-time pitch detection using Web Audio API with autocorrelation (YIN-inspired).
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface DetectedNote {
  frequency: number;
  noteName: string;   // e.g. "C4", "A#3"
  midiNumber: number;
  cents: number;      // deviation from perfect pitch (-50 to +50)
  timestamp: number;  // ms from start
  duration: number;   // ms
}

export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToNoteName(midi: number): string {
  const noteIndex = Math.round(midi) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Autocorrelation-based pitch detection (YIN-inspired)
 */
function detectPitchAutocorrelation(buffer: Float32Array, sampleRate: number): number | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  
  // Check if signal has enough energy
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null; // too quiet

  // Autocorrelation
  const correlations = new Float32Array(MAX_SAMPLES);
  for (let lag = 0; lag < MAX_SAMPLES; lag++) {
    let sum = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      sum += buffer[i] * buffer[i + lag];
    }
    correlations[lag] = sum;
  }

  // Find first dip then first peak after it
  let foundDip = false;
  let bestLag = -1;
  let bestCorr = 0;

  // Skip lag 0 (perfect correlation with self)
  // Min frequency ~60 Hz, max ~1500 Hz for vocal range
  const minLag = Math.floor(sampleRate / 1500);
  const maxLag = Math.floor(sampleRate / 60);

  for (let lag = minLag; lag < Math.min(maxLag, MAX_SAMPLES); lag++) {
    if (!foundDip && correlations[lag] < correlations[lag - 1]) {
      foundDip = true;
    }
    if (foundDip && correlations[lag] > bestCorr) {
      bestCorr = correlations[lag];
      bestLag = lag;
    }
    // Once we start going down after finding a peak, we're done
    if (foundDip && bestLag > 0 && correlations[lag] < bestCorr * 0.9) {
      break;
    }
  }

  if (bestLag === -1 || bestCorr < correlations[0] * 0.3) return null;

  // Parabolic interpolation for sub-sample accuracy
  const prev = correlations[bestLag - 1] ?? bestCorr;
  const next = correlations[bestLag + 1] ?? bestCorr;
  const shift = (prev - next) / (2 * (prev - 2 * bestCorr + next));
  const refinedLag = bestLag + (isFinite(shift) ? shift : 0);

  return sampleRate / refinedLag;
}

export interface PitchDetector {
  start: () => Promise<void>;
  stop: () => DetectedNote[];
  isRecording: () => boolean;
  onPitch: (callback: (note: DetectedNote | null) => void) => void;
}

export function createPitchDetector(): PitchDetector {
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let mediaStream: MediaStream | null = null;
  let animationId: number | null = null;
  let recording = false;
  let startTime = 0;
  let pitchCallback: ((note: DetectedNote | null) => void) | null = null;

  // Collected notes with merging of same pitches
  const rawNotes: DetectedNote[] = [];
  let lastMidi: number | null = null;
  let lastNoteStart = 0;
  const MERGE_THRESHOLD_CENTS = 80; // merge if within ~semitone

  function processAudio() {
    if (!analyser || !recording) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const freq = detectPitchAutocorrelation(buffer, audioContext!.sampleRate);
    const now = performance.now() - startTime;

    if (freq && freq > 55 && freq < 1500) {
      const midi = frequencyToMidi(freq);
      const roundedMidi = Math.round(midi);
      const cents = Math.round((midi - roundedMidi) * 100);

      const note: DetectedNote = {
        frequency: freq,
        noteName: midiToNoteName(midi),
        midiNumber: roundedMidi,
        cents,
        timestamp: now,
        duration: 0,
      };

      // Merge with previous if same note
      if (lastMidi !== null && Math.abs(roundedMidi - lastMidi) <= 0.5) {
        // Update duration of last note
        if (rawNotes.length > 0) {
          rawNotes[rawNotes.length - 1].duration = now - lastNoteStart;
        }
      } else {
        // Finalize previous note duration
        if (rawNotes.length > 0 && rawNotes[rawNotes.length - 1].duration === 0) {
          rawNotes[rawNotes.length - 1].duration = now - lastNoteStart;
        }
        rawNotes.push(note);
        lastMidi = roundedMidi;
        lastNoteStart = now;
      }

      pitchCallback?.(note);
    } else {
      // Silence — finalize last note
      if (rawNotes.length > 0 && rawNotes[rawNotes.length - 1].duration === 0) {
        rawNotes[rawNotes.length - 1].duration = now - lastNoteStart;
      }
      lastMidi = null;
      pitchCallback?.(null);
    }

    animationId = requestAnimationFrame(processAudio);
  }

  return {
    async start() {
      audioContext = new AudioContext();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContext.createMediaStreamSource(mediaStream);
      
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);

      rawNotes.length = 0;
      lastMidi = null;
      recording = true;
      startTime = performance.now();
      processAudio();
    },

    stop() {
      recording = false;
      if (animationId) cancelAnimationFrame(animationId);
      mediaStream?.getTracks().forEach(t => t.stop());
      audioContext?.close();
      
      // Finalize last note
      if (rawNotes.length > 0 && rawNotes[rawNotes.length - 1].duration === 0) {
        rawNotes[rawNotes.length - 1].duration = performance.now() - startTime - lastNoteStart;
      }

      // Filter very short notes (< 80ms) as noise
      return rawNotes.filter(n => n.duration >= 80);
    },

    isRecording() {
      return recording;
    },

    onPitch(callback) {
      pitchCallback = callback;
    },
  };
}
