import { useState, useEffect, useCallback } from 'react';
import { Archive, Download, Trash2, Plus, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  listBackups,
  createBackup,
  restoreFromBackup,
  deleteBackup,
  type SongBackup,
} from '@/lib/songsBackup';
import { saveSongsToDb } from '@/lib/songsDb';
import { uploadSongsToServer } from '@/lib/songsSync';

interface BackupManagerProps {
  onRestore: (songs: any[]) => void;
}

export function BackupManager({ onRestore }: BackupManagerProps) {
  const [backups, setBackups] = useState<SongBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listBackups();
    setBackups(list);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const handleCreate = async () => {
    setCreating(true);
    const ok = await createBackup('Ręczny backup');
    if (ok) {
      showMessage('Kopia zapasowa utworzona');
      refresh();
    } else {
      showMessage('Błąd tworzenia kopii');
    }
    setCreating(false);
  };

  const handleRestore = async (backup: SongBackup) => {
    if (!confirm(`Przywrócić bazę z ${backup.created_at.slice(0, 10)}? Obecna baza zostanie nadpisana.`)) return;
    setRestoringId(backup.id);
    try {
      const songs = await restoreFromBackup(backup.id);
      await saveSongsToDb(songs);
      await uploadSongsToServer(songs);
      onRestore(songs);
      showMessage(`Przywrócono ${songs.length} pieśni`);
    } catch {
      showMessage('Błąd przywracania');
    }
    setRestoringId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Usunąć tę kopię zapasową?')) return;
    await deleteBackup(id);
    refresh();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
          <Archive className="w-5 h-5 text-primary" />
          Kopie zapasowe bazy pieśni
        </h2>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="p-5 space-y-3">
        {message && (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald">
            <CheckCircle2 className="w-4 h-4" />
            {message}
          </div>
        )}

        <Button onClick={handleCreate} disabled={creating} className="w-full">
          <Plus className={`w-4 h-4 ${creating ? 'animate-spin' : ''}`} />
          {creating ? 'Tworzenie kopii...' : 'Utwórz kopię zapasową teraz'}
        </Button>

        <p className="text-xs text-muted-foreground">
          Automatyczny backup wykonywany jest co tydzień. Kopie są niezmienne — służą do przywrócenia bazy.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Ładowanie...</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Brak kopii zapasowych</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {backups.map(b => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 bg-muted/20"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{b.label || 'Backup'}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(b.created_at)} · {b.song_count} pieśni
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(b)}
                    disabled={restoringId === b.id}
                    title="Przywróć"
                  >
                    <Download className={`w-4 h-4 ${restoringId === b.id ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(b.id)}
                    title="Usuń"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
