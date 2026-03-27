import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Edit2, Check, X, Upload, Music, Camera, Loader2, PenLine, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SheetMusicViewer } from './SheetMusicViewer';
import { NoteEditor } from './NoteEditor';
import { PdfPageSelector } from './PdfPageSelector';
import { OmrPreviewDialog } from './OmrPreviewDialog';
import type { Melody } from '@/hooks/useCantors';

interface Props {
  allMelodies: Melody[];
  onAdd: (melody: { melody_name: string; psalm_title?: string | null; musicxml_path?: string | null; notes?: string | null }) => Promise<string | null>;
  onUpdate: (id: string, updates: Partial<Melody>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function MelodyLibraryManager({ allMelodies, onAdd, onUpdate, onDelete }: Props) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ psalm_title: '', melody_name: '', notes: '' });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [omrProcessing, setOmrProcessing] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [omrPreview, setOmrPreview] = useState<{ musicxml: string; title: string } | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ melodyId: string; musicxml: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const omrInputRef = useRef<HTMLInputElement>(null);

  const filtered = allMelodies.filter(m =>
    search === '' ||
    m.melody_name.toLowerCase().includes(search.toLowerCase()) ||
    (m.psalm_title ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm({ psalm_title: '', melody_name: '', notes: '' });
    setShowForm(false);
    setEditId(null);
    setPendingFile(null);
  };

  const uploadMusicXml = async (file: File, melodyId: string): Promise<string | null> => {
    const path = `library/${melodyId}.musicxml`;
    const { error } = await supabase.storage.from('musicxml').upload(path, file, { upsert: true });
    if (error) { console.error('Upload error:', error); return null; }
    return path;
  };

  const getMusicXmlUrl = (path: string): string => {
    const { data } = supabase.storage.from('musicxml').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleAdd = async () => {
    if (!form.melody_name.trim()) return;
    const tempId = crypto.randomUUID();
    let musicxmlPath: string | null = null;

    if (pendingFile) {
      setUploading(true);
      musicxmlPath = await uploadMusicXml(pendingFile, tempId);
      setUploading(false);
    }

    await onAdd({
      melody_name: form.melody_name,
      psalm_title: form.psalm_title || null,
      musicxml_path: musicxmlPath,
      notes: form.notes || null,
    });
    resetForm();
    toast({ title: '✅ Melodia dodana do biblioteki' });
  };

  const handleUpdate = async () => {
    if (!editId || !form.melody_name.trim()) return;
    let musicxmlPath: string | undefined;

    if (pendingFile) {
      setUploading(true);
      const path = await uploadMusicXml(pendingFile, editId);
      if (path) musicxmlPath = path;
      setUploading(false);
    }

    await onUpdate(editId, {
      melody_name: form.melody_name,
      psalm_title: form.psalm_title || null,
      notes: form.notes || null,
      ...(musicxmlPath !== undefined && { musicxml_path: musicxmlPath }),
    });
    resetForm();
    toast({ title: '✅ Melodia zaktualizowana' });
  };

  const startEdit = (m: Melody) => {
    setEditId(m.id);
    setShowForm(true);
    setPendingFile(null);
    setForm({
      psalm_title: m.psalm_title ?? '',
      melody_name: m.melody_name,
      notes: m.notes ?? '',
    });
  };

  // ── OMR ──
  const handleOmrUpload = async (file: File) => {
    const allowed = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!allowed) {
      toast({ title: 'Wybierz zdjęcie (JPG, PNG) lub PDF', variant: 'destructive' });
      return;
    }
    if (file.type === 'application/pdf') {
      setPdfFile(file);
      return;
    }
    const buffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    await processOmrBase64(base64, file.type);
  };

  const handlePdfPageSelect = async (pageBase64: string) => {
    setPdfFile(null);
    await processOmrBase64(pageBase64, 'image/jpeg');
  };

  const processOmrBase64 = async (base64: string, mimeType: string) => {
    setOmrProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('omr-recognize', {
        body: { image_base64: base64, mime_type: mimeType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOmrPreview({ musicxml: data.musicxml, title: data.title });
    } catch (err: any) {
      console.error('OMR error:', err);
      toast({ title: 'Błąd rozpoznawania nut', description: err.message, variant: 'destructive' });
    } finally {
      setOmrProcessing(false);
      if (omrInputRef.current) omrInputRef.current.value = '';
    }
  };

  const saveOmrResult = async (musicxml: string, title: string) => {
    setOmrPreview(null);
    try {
      const tempId = crypto.randomUUID();
      const path = `library/${tempId}.musicxml`;
      const blob = new Blob([musicxml], { type: 'application/xml' });
      const { error: uploadErr } = await supabase.storage.from('musicxml').upload(path, blob, { upsert: true });
      if (uploadErr) throw uploadErr;

      await onAdd({
        melody_name: title,
        musicxml_path: path,
        notes: 'Rozpoznano AI (OMR)',
      });
      toast({ title: '✅ Nuty rozpoznane i dodane!', description: title });
    } catch (err: any) {
      toast({ title: 'Błąd zapisu', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Music className="w-4 h-4" /> Baza melodii psalmów
          </CardTitle>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" disabled={omrProcessing} onClick={() => omrInputRef.current?.click()}>
              {omrProcessing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
              {omrProcessing ? 'Rozpoznaję…' : 'Ze zdjęcia/PDF'}
            </Button>
            <input ref={omrInputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleOmrUpload(f); }} />
            <Button size="sm" variant="outline" onClick={() => { setShowForm(true); setEditId(null); resetForm(); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Nowa melodia
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Szukaj melodii…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9" />
          </div>

          {/* Add/Edit form */}
          {showForm && (
            <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg bg-muted/30">
              <Input placeholder="Tytuł psalmu / refrenu" value={form.psalm_title}
                onChange={e => setForm(f => ({ ...f, psalm_title: e.target.value }))} className="col-span-2" />
              <Input placeholder="Nazwa melodii *" value={form.melody_name}
                onChange={e => setForm(f => ({ ...f, melody_name: e.target.value }))} />
              <Input placeholder="Uwagi" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="col-span-2">
                <input ref={fileInputRef} type="file" accept=".musicxml,.xml,.mxl" className="hidden"
                  onChange={e => { const file = e.target.files?.[0]; if (file) setPendingFile(file); }} />
                <Button size="sm" variant="outline" type="button" onClick={() => fileInputRef.current?.click()} className="w-full">
                  <Upload className="w-4 h-4 mr-1" />
                  {pendingFile ? `📄 ${pendingFile.name}` : 'Dołącz nuty (MusicXML)'}
                </Button>
              </div>
              <div className="col-span-2 flex gap-2">
                <Button size="sm" onClick={editId ? handleUpdate : handleAdd} disabled={uploading}>
                  <Check className="w-4 h-4 mr-1" /> {uploading ? 'Wysyłanie…' : editId ? 'Zapisz' : 'Dodaj'}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm}>
                  <X className="w-4 h-4 mr-1" /> Anuluj
                </Button>
              </div>
            </div>
          )}

          {/* Melody list */}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? 'Brak wyników' : 'Brak melodii w bibliotece. Dodaj pierwszą!'}
            </p>
          )}

          {filtered.map(m => (
            <div key={m.id} className="border border-border rounded-lg hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{m.melody_name}</div>
                  {m.psalm_title && <div className="text-xs text-muted-foreground truncate">{m.psalm_title}</div>}
                  <div className="flex gap-2 mt-1">
                    {m.musicxml_path && (
                      <span className="text-xs bg-accent/50 text-accent-foreground px-2 py-0.5 rounded flex items-center gap-1">
                        <Music className="w-3 h-3" /> Nuty
                      </span>
                    )}
                    {m.notes && <span className="text-xs text-muted-foreground">{m.notes}</span>}
                  </div>
                </div>

                {m.musicxml_path && (
                  <Button size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}>
                    {expandedId === m.id ? <X className="w-3.5 h-3.5" /> : <Music className="w-3.5 h-3.5" />}
                  </Button>
                )}
                {!m.musicxml_path && (
                  <label className="cursor-pointer">
                    <input type="file" accept=".musicxml,.xml,.mxl" className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        const path = await uploadMusicXml(file, m.id);
                        if (path) await onUpdate(m.id, { musicxml_path: path });
                        setUploading(false);
                      }} />
                    <div className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors" title="Dodaj nuty">
                      <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </label>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(m)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                  onClick={() => { if (confirm(`Usunąć melodię "${m.melody_name}"?`)) onDelete(m.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {expandedId === m.id && m.musicxml_path && !editingNotes && (
                <div className="px-3 pb-3 border-t border-border space-y-2">
                  <SheetMusicViewer musicxmlUrl={getMusicXmlUrl(m.musicxml_path)} compact />
                  <Button size="sm" variant="outline" className="gap-1 text-xs"
                    onClick={async () => {
                      try {
                        const resp = await fetch(getMusicXmlUrl(m.musicxml_path!));
                        const xml = await resp.text();
                        setEditingNotes({ melodyId: m.id, musicxml: xml });
                      } catch {
                        toast({ title: 'Nie udało się wczytać nut', variant: 'destructive' });
                      }
                    }}>
                    <PenLine className="w-3 h-3" /> Edytuj nuty
                  </Button>
                </div>
              )}

              {editingNotes?.melodyId === m.id && (
                <div className="px-3 pb-3 border-t border-border">
                  <NoteEditor
                    musicxml={editingNotes.musicxml}
                    onSave={async (newXml, newTitle) => {
                      const blob = new Blob([newXml], { type: 'application/xml' });
                      const path = m.musicxml_path || `library/${m.id}.musicxml`;
                      const { error: upErr } = await supabase.storage.from('musicxml').upload(path, blob, { upsert: true });
                      if (upErr) {
                        toast({ title: 'Błąd zapisu nut', variant: 'destructive' });
                        return;
                      }
                      await onUpdate(m.id, { melody_name: newTitle, musicxml_path: path });
                      setEditingNotes(null);
                      setExpandedId(m.id);
                      toast({ title: '✅ Nuty zapisane!' });
                    }}
                    onCancel={() => setEditingNotes(null)}
                  />
                </div>
              )}
            </div>
          ))}

          {/* PDF Page Selector */}
          {pdfFile && (
            <PdfPageSelector file={pdfFile} open={!!pdfFile}
              onSelect={handlePdfPageSelect}
              onCancel={() => { setPdfFile(null); if (omrInputRef.current) omrInputRef.current.value = ''; }} />
          )}

          {/* OMR Preview */}
          {omrPreview && (
            <OmrPreviewDialog open={!!omrPreview} musicxml={omrPreview.musicxml} title={omrPreview.title}
              onConfirm={saveOmrResult}
              onEdit={(xml, title) => { setOmrPreview(null); saveOmrResult(xml, title); }}
              onCancel={() => setOmrPreview(null)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
