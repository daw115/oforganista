import { Search, Music, Download, Plus, Monitor, X, Trash2, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Song } from '@/types/projector';

interface SongLibraryProps {
  songs: Song[];
  filteredSongs: Song[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onLoadBundled: () => void;
  onAddToPlaylist: (song: Song) => void;
  onShowOnScreen?: (song: Song) => void;
  onDeleteSong?: (songId: string) => void;
  onEditSong?: (song: Song) => void;
  onSearchFocus?: () => void;
  loading: boolean;
  importMsg?: string;
  searchByContent?: boolean;
  onSearchByContentChange?: (v: boolean) => void;
  playlistSongIds?: Set<string>;
}

export function SongLibrary({
  songs, filteredSongs, searchQuery, onSearchChange,
  onLoadBundled, onAddToPlaylist, onShowOnScreen, onDeleteSong, onEditSong, onSearchFocus, loading, importMsg,
  searchByContent, onSearchByContentChange, playlistSongIds,
}: SongLibraryProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">

      {importMsg && (
        <div className="mx-3 mt-2 text-xs font-medium text-success bg-success/10 border border-success/30 rounded-lg px-3 py-1.5">
          {importMsg}
        </div>
      )}

      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
            placeholder="Szukaj pieśni..."
            className="w-full rounded-lg border border-input bg-background px-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {onSearchByContentChange && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!searchByContent}
              onChange={e => onSearchByContentChange(e.target.checked)}
              className="rounded border-input accent-primary w-3.5 h-3.5"
            />
            Szukaj również w treści pieśni
          </label>
        )}
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2">
        {songs.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Music className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Brak pieśni w bazie</p>
            <p className="text-xs mt-1 mb-3">Przejdź do modułu Baza Pieśni aby załadować pieśni</p>
            <Button
              onClick={onLoadBundled}
              size="sm"
              className="bg-primary text-primary-foreground"
              disabled={loading}
            >
              <Download className="w-3 h-3" />
              Załaduj wbudowaną bazę
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Importuję bazę danych...
          </div>
        )}

        {songs.length > 0 && !searchQuery && (
          <p className="text-xs text-muted-foreground px-2 py-1 mb-1">
            Wpisz nazwę pieśni aby wyszukać ({songs.length} pieśni w bazie)
          </p>
        )}

        {(searchQuery ? filteredSongs.slice(0, 100) : []).map(song => {
          const inPlaylist = playlistSongIds?.has(song.id);
          return (
            <div
              key={song.id}
              onClick={() => !inPlaylist && onAddToPlaylist(song)}
              className={cn(
                "group w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                inPlaylist
                  ? "opacity-40 cursor-default"
                  : "hover:bg-panel-hover cursor-pointer"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                {song.author && (
                  <p className="text-xs text-muted-foreground truncate">{song.author}</p>
                )}
              </div>
              {inPlaylist ? (
                <span className="p-1.5 shrink-0 text-success">
                  <Check className="w-4 h-4" />
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddToPlaylist(song); }}
                  className="p-1.5 rounded-md hover:bg-primary/10 transition-all text-primary shrink-0"
                  title="Dodaj do listy"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              {onEditSong && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditSong(song); }}
                  className="p-1.5 rounded-md hover:bg-muted transition-all text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                  title="Edytuj pieśń"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onShowOnScreen && (
                <button
                  onClick={(e) => { e.stopPropagation(); onShowOnScreen(song); }}
                  className="p-1.5 rounded-md hover:bg-success/10 transition-all text-success shrink-0"
                  title="Wyświetl na ekranie"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
              )}
              {onDeleteSong && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Usunąć „${song.title}" z bazy?`)) onDeleteSong(song.id);
                  }}
                  className="p-1.5 rounded-md hover:bg-destructive/10 transition-all text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100"
                  title="Usuń z bazy"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {searchQuery && filteredSongs.length > 100 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Pokazano 100 z {filteredSongs.length} wyników — zawęź wyszukiwanie
          </p>
        )}

        {searchQuery && filteredSongs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Brak wyników dla „{searchQuery}"
          </p>
        )}
      </div>
    </div>
  );
}
