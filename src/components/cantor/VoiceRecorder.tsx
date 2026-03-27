import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Mic, Square, Save, RotateCcw, Music } from 'lucide-react';
import { createPitchDetector, type DetectedNote, type PitchDetector } from '@/lib/pitchDetection';
import { notesToMusicXml } from '@/lib/notesToMusicXml';
import { SheetMusicViewer } from './SheetMusicViewer';

interface Props {
  onSave: (musicxml: string, title: string) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onSave, onCancel }: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [currentNote, setCurrentNote] = useState<DetectedNote | null>(null);
  const [detectedNotes, setDetectedNotes] = useState<DetectedNote[]>([]);
  const [title, setTitle] = useState('');
  const [bpm, setBpm] = useState(80);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [noteHistory, setNoteHistory] = useState<string[]>([]);
  const detectorRef = useRef<PitchDetector | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const detector = createPitchDetector();
      detectorRef.current = detector;

      detector.onPitch((note) => {
        setCurrentNote(note);
        if (note) {
          setNoteHistory(prev => {
            const next = [...prev, note.noteName];
            return next.slice(-20); // keep last 20
          });
        }
      });

      await detector.start();
      setPhase('recording');
      setNoteHistory([]);
    } catch (err) {
      console.error('Mic access error:', err);
      alert('Nie udało się uzyskać dostępu do mikrofonu. Sprawdź uprawnienia przeglądarki.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!detectorRef.current) return;
    const notes = detectorRef.current.stop();
    setDetectedNotes(notes);
    setCurrentNote(null);
    setPhase('preview');

    // Generate preview
    const xml = notesToMusicXml(notes, title || 'Rozpoznana melodia', bpm);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
  }, [title, bpm]);

  const resetRecording = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhase('idle');
    setDetectedNotes([]);
    setCurrentNote(null);
    setPreviewUrl(null);
    setNoteHistory([]);
  }, [previewUrl]);

  const handleSave = useCallback(() => {
    const xml = notesToMusicXml(detectedNotes, title || 'Rozpoznana melodia', bpm);
    onSave(xml, title || 'Rozpoznana melodia');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [detectedNotes, title, bpm, onSave, previewUrl]);

  const regeneratePreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const xml = notesToMusicXml(detectedNotes, title || 'Rozpoznana melodia', bpm);
    const blob = new Blob([xml], { type: 'application/xml' });
    setPreviewUrl(URL.createObjectURL(blob));
  }, [detectedNotes, title, bpm, previewUrl]);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          Rozpoznawanie melodii z głosu
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Title & BPM */}
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Tytuł melodii"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">BPM: {bpm}</span>
            <Slider
              value={[bpm]}
              onValueChange={([v]) => setBpm(v)}
              min={40}
              max={160}
              step={5}
              className="flex-1"
            />
          </div>
        </div>

        {/* Recording state */}
        {phase === 'idle' && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Kliknij przycisk i zaśpiewaj melodię psalmu. Aplikacja rozpozna nuty i zapisze je.
            </p>
            <Button onClick={startRecording} className="gap-2">
              <Mic className="w-4 h-4" /> Rozpocznij nagrywanie
            </Button>
          </div>
        )}

        {phase === 'recording' && (
          <div className="space-y-3">
            {/* Live pitch display */}
            <div className="flex items-center justify-center gap-4 py-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-destructive/20 border-2 border-destructive flex items-center justify-center animate-pulse">
                  <Mic className="w-8 h-8 text-destructive" />
                </div>
              </div>
              <div className="text-center min-w-[100px]">
                {currentNote ? (
                  <>
                    <div className="text-3xl font-bold text-primary">{currentNote.noteName}</div>
                    <div className="text-xs text-muted-foreground">
                      {currentNote.frequency.toFixed(1)} Hz
                      {currentNote.cents !== 0 && (
                        <span className={currentNote.cents > 0 ? 'text-orange-400' : 'text-blue-400'}>
                          {' '}({currentNote.cents > 0 ? '+' : ''}{currentNote.cents}¢)
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Czekam na dźwięk…</div>
                )}
              </div>
            </div>

            {/* Note trail */}
            {noteHistory.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center">
                {noteHistory.map((n, i) => (
                  <span
                    key={i}
                    className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                    style={{ opacity: 0.4 + (i / noteHistory.length) * 0.6 }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-center">
              <Button onClick={stopRecording} variant="destructive" className="gap-2">
                <Square className="w-4 h-4" /> Zatrzymaj
              </Button>
            </div>
          </div>
        )}

        {phase === 'preview' && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Rozpoznano <strong>{detectedNotes.length}</strong> nut.
              {detectedNotes.length === 0 && ' Spróbuj nagrać ponownie – śpiewaj wyraźnie i blisko mikrofonu.'}
            </div>

            {/* Sheet music preview */}
            {previewUrl && detectedNotes.length > 0 && (
              <div className="border border-border rounded-lg p-2 bg-background">
                <SheetMusicViewer musicxmlUrl={previewUrl} compact />
              </div>
            )}

            {/* BPM adjust & regenerate */}
            {detectedNotes.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Tempo: {bpm} BPM</span>
                <Slider
                  value={[bpm]}
                  onValueChange={([v]) => setBpm(v)}
                  min={40}
                  max={160}
                  step={5}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={regeneratePreview}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Przelicz
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              {detectedNotes.length > 0 && (
                <Button size="sm" onClick={handleSave} className="gap-1">
                  <Save className="w-4 h-4" /> Zapisz melodię
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={resetRecording} className="gap-1">
                <Mic className="w-4 h-4" /> Nagraj ponownie
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Anuluj
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
