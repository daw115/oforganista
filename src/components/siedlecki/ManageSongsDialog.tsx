import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Pencil, Trash2 } from 'lucide-react';
import type { SongbookSong } from '@/hooks/useSongbook';

interface Props {
  songs: SongbookSong[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, updates: { title?: string }) => Promise<void>;
}

export function ManageSongsDialog({ songs, onDelete, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const startEdit = (song: SongbookSong) => {
    setEditingId(song.id);
    setEditTitle(song.title);
  };

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    await onUpdate(editingId, { title: editTitle.trim() });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await onDelete(id);
    setDeleting(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Zarządzaj pieśniami"
          onClick={(e) => e.stopPropagation()}
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Zarządzaj dodanymi pieśniami</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          {songs.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-6">Brak dodanych pieśni</p>
          )}
          {songs.map(song => (
            <div key={song.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-border">
              {editingId === song.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    className="flex-1 py-1.5 px-2.5 rounded-lg border border-input bg-muted text-foreground text-sm outline-none focus:ring-1 focus:ring-ring"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                    autoFocus
                  />
                  <button
                    className="py-1.5 px-2.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    onClick={saveEdit}
                  >✓</button>
                  <button
                    className="py-1.5 px-2.5 rounded-lg text-xs bg-muted text-foreground hover:bg-accent transition-colors"
                    onClick={() => setEditingId(null)}
                  >✕</button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-foreground text-sm truncate">{song.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{song.pages.length} str.</span>
                  <button
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                    onClick={() => startEdit(song)}
                    title="Zmień tytuł"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-destructive"
                    onClick={() => handleDelete(song.id)}
                    disabled={deleting === song.id}
                    title="Usuń pieśń"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
