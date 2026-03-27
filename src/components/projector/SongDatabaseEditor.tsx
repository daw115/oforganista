import { useState, useRef, useMemo, useCallback } from 'react';
import {
  Search, Database, Trash2, Pencil, CheckSquare, Square, Save, Upload,
  Download, ArrowUpDown, Filter, X, ChevronLeft, ChevronRight, Shield,
  MoreVertical, PlusCircle, FileText, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { SongEditDialog } from './SongEditDialog';
import { toast } from 'sonner';
import type { Song } from '@/types/projector';
import type { useProjector } from '@/hooks/useProjector';

type ProjectorHook = ReturnType<typeof useProjector>;

const PAGE_SIZE = 50;

type SortField = 'title' | 'author' | 'verses' | 'songNumber';
type SortDir = 'asc' | 'desc';

export function SongDatabaseEditor({ projector }: { projector: ProjectorHook }) {
  const {
    songs, loading, searchQuery, setSearchQuery, filteredSongs,
    updateSong, deleteSong, importJsonSongs, createBackup,
  } = projector;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('songNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<'author' | 'source'>('author');
  const [bulkEditValue, setBulkEditValue] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');
  const [inlineAuthor, setInlineAuthor] = useState('');
  const jsonFileRef = useRef<HTMLInputElement>(null);

  // Auto-backup before destructive ops
  const backupBefore = useCallback(async (label: string) => {
    const count = await createBackup();
    console.log(`[Backup] Created before "${label}": ${count} songs`);
    toast.success(`Kopia zapasowa: ${count} pieśni`);
    return count;
  }, [createBackup]);

  // Sorting & filtering
  const baseSongs = searchQuery ? filteredSongs : songs;

  const processedSongs = useMemo(() => {
    let list = [...baseSongs];

    // Filter by author
    if (filterAuthor) {
      const fa = filterAuthor.toLowerCase();
      list = list.filter(s => (s.author || '').toLowerCase().includes(fa));
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = a.title.localeCompare(b.title, 'pl'); break;
        case 'author': cmp = (a.author || '').localeCompare(b.author || '', 'pl'); break;
        case 'verses': cmp = a.verses.length - b.verses.length; break;
        case 'songNumber': cmp = (a.songNumber || 0) - (b.songNumber || 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [baseSongs, filterAuthor, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processedSongs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageSongs = processedSongs.slice(pageStart, pageStart + PAGE_SIZE);

  // Unique authors for filter
  const uniqueAuthors = useMemo(() => {
    const set = new Set<string>();
    songs.forEach(s => { if (s.author) set.add(s.author); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [songs]);

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllPage = () => {
    const allSelected = pageSongs.every(s => selectedIds.has(s.id));
    if (allSelected) {
      const next = new Set(selectedIds);
      pageSongs.forEach(s => next.delete(s.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      pageSongs.forEach(s => next.add(s.id));
      setSelectedIds(next);
    }
  };

  const selectAll = () => {
    if (selectedIds.size === processedSongs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedSongs.map(s => s.id)));
    }
  };

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIcon = (field: SortField) => (
    sortField === field
      ? <ArrowUpDown className={`w-3 h-3 ml-0.5 ${sortDir === 'desc' ? 'rotate-180' : ''}`} />
      : <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-30" />
  );

  // Inline edit
  const startInlineEdit = (song: Song) => {
    setInlineEditId(song.id);
    setInlineTitle(song.title);
    setInlineAuthor(song.author || '');
  };

  const saveInlineEdit = () => {
    if (!inlineEditId) return;
    const song = songs.find(s => s.id === inlineEditId);
    if (!song) return;
    updateSong({
      ...song,
      title: inlineTitle.trim() || song.title,
      author: inlineAuthor.trim() || undefined,
      searchText: `${inlineTitle} ${inlineAuthor}`.toLowerCase(),
    });
    setInlineEditId(null);
    toast.success('Zapisano zmiany');
  };

  const cancelInlineEdit = () => setInlineEditId(null);

  // Bulk delete
  const handleBulkDelete = async () => {
    await backupBefore('bulk delete');
    selectedIds.forEach(id => deleteSong(id));
    toast.success(`Usunięto ${selectedIds.size} pieśni`);
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  };

  // Bulk edit field
  const handleBulkEdit = async () => {
    if (!bulkEditValue.trim()) return;
    await backupBefore(`bulk edit ${bulkEditField}`);
    const ids = Array.from(selectedIds);
    let count = 0;
    for (const id of ids) {
      const song = songs.find(s => s.id === id);
      if (!song) continue;
      const patch: Partial<Song> = {};
      if (bulkEditField === 'author') patch.author = bulkEditValue.trim();
      if (bulkEditField === 'source') patch.source = bulkEditValue.trim();
      updateSong({ ...song, ...patch, searchText: `${song.title} ${patch.author || song.author || ''}`.toLowerCase() });
      count++;
    }
    toast.success(`Zaktualizowano ${count} pieśni`);
    setBulkEditOpen(false);
    setBulkEditValue('');
    setSelectedIds(new Set());
  };

  // Import JSON
  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Plik nie zawiera tablicy');
      await backupBefore('json import');
      const result = importJsonSongs(data, 'skip');
      toast.success(`Import: ${result.added} nowych, ${result.updated} zaktualizowanych`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Błąd importu');
    }
    if (jsonFileRef.current) jsonFileRef.current.value = '';
  };

  // Export JSON
  const handleExport = () => {
    const toExport = selectedIds.size > 0
      ? songs.filter(s => selectedIds.has(s.id))
      : songs;
    const data = toExport.map(({ searchText, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piesni-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Wyeksportowano ${toExport.length} pieśni`);
  };

  const allPageSelected = pageSongs.length > 0 && pageSongs.every(s => selectedIds.has(s.id));
  const somePageSelected = pageSongs.some(s => selectedIds.has(s.id));

  return (
    <div className="animate-fade-in space-y-3">
      <input ref={jsonFileRef} type="file" accept=".json" onChange={handleJsonImport} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-foreground">Edytor Bazy Pieśni</h2>
            <p className="text-xs text-muted-foreground">
              {songs.length} pieśni · {selectedIds.size > 0 && <span className="text-primary font-medium">{selectedIds.size} zaznaczonych</span>}
              {processedSongs.length !== songs.length && ` · ${processedSongs.length} widocznych`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)} className="gap-1.5">
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Nowa</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem onClick={() => jsonFileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-2" />Import JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-3.5 h-3.5 mr-2" />
                {selectedIds.size > 0 ? `Eksport zaznaczonych (${selectedIds.size})` : 'Eksport całej bazy'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { await backupBefore('manual'); }}>
                <Shield className="w-3.5 h-3.5 mr-2" />Utwórz kopię zapasową
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="Szukaj pieśni..."
            className="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-8 text-sm focus:ring-2 focus:ring-primary/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative min-w-[160px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={filterAuthor}
            onChange={e => { setFilterAuthor(e.target.value); setPage(0); }}
            className="h-9 rounded-lg border border-input bg-background pl-8 pr-3 text-xs w-full appearance-none cursor-pointer"
          >
            <option value="">Wszyscy autorzy</option>
            {uniqueAuthors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-xs font-medium text-primary">{selectedIds.size} zaznaczonych</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setBulkEditField('author'); setBulkEditValue(''); setBulkEditOpen(true); }}>
            <Pencil className="w-3 h-3" />Zmień autora
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setBulkEditField('source'); setBulkEditValue(''); setBulkEditOpen(true); }}>
            <FileText className="w-3 h-3" />Zmień źródło
          </Button>
          <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => setBulkDeleteConfirm(true)}>
            <Trash2 className="w-3 h-3" />Usuń ({selectedIds.size})
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="w-10 px-2 py-2 text-center">
                  <button onClick={selectAllPage} className="text-muted-foreground hover:text-foreground">
                    {allPageSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : somePageSelected ? <CheckSquare className="w-4 h-4 text-muted-foreground opacity-50" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="w-14 px-2 py-2 text-left">
                  <button onClick={() => toggleSort('songNumber')} className="flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
                    # {sortIcon('songNumber')}
                  </button>
                </th>
                <th className="px-3 py-2 text-left">
                  <button onClick={() => toggleSort('title')} className="flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
                    Tytuł {sortIcon('title')}
                  </button>
                </th>
                <th className="px-3 py-2 text-left hidden md:table-cell">
                  <button onClick={() => toggleSort('author')} className="flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
                    Autor {sortIcon('author')}
                  </button>
                </th>
                <th className="w-20 px-3 py-2 text-center hidden sm:table-cell">
                  <button onClick={() => toggleSort('verses')} className="flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
                    Zwrotki {sortIcon('verses')}
                  </button>
                </th>
                <th className="w-24 px-2 py-2 text-center">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {pageSongs.map((song, i) => (
                <tr
                  key={song.id}
                  className={`border-b border-border/50 transition-colors ${
                    selectedIds.has(song.id) ? 'bg-primary/5' : i % 2 === 0 ? '' : 'bg-muted/20'
                  } hover:bg-muted/40`}
                >
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => toggleSelect(song.id)} className="text-muted-foreground hover:text-foreground">
                      {selectedIds.has(song.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground font-mono">
                    {song.songNumber || '–'}
                  </td>
                  <td className="px-3 py-1.5">
                    {inlineEditId === song.id ? (
                      <Input
                        value={inlineTitle}
                        onChange={e => setInlineTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }}
                        className="h-7 text-sm"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => startInlineEdit(song)}
                        className="text-left text-foreground font-medium hover:text-primary transition-colors truncate max-w-[300px] block"
                        title="Kliknij aby edytować inline"
                      >
                        {song.title}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-1.5 hidden md:table-cell">
                    {inlineEditId === song.id ? (
                      <Input
                        value={inlineAuthor}
                        onChange={e => setInlineAuthor(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }}
                        className="h-7 text-sm"
                        placeholder="(brak)"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{song.author || '–'}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">{song.verses.length}</span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {inlineEditId === song.id ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-primary" onClick={saveInlineEdit} title="Zapisz">
                            <Save className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={cancelInlineEdit} title="Anuluj">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary" onClick={() => setEditingSong(song)} title="Pełna edycja">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              await backupBefore('delete single');
                              deleteSong(song.id);
                              toast.success(`Usunięto: ${song.title}`);
                            }}
                            title="Usuń"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {pageSongs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    {loading ? 'Ładowanie...' : 'Brak pieśni spełniających kryteria'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, processedSongs.length)} z {processedSongs.length}</span>
          {selectedIds.size > 0 && (
            <button onClick={selectAll} className="text-primary hover:underline">
              {selectedIds.size === processedSongs.length ? 'Odznacz wszystkie' : `Zaznacz wszystkie (${processedSongs.length})`}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-2 font-medium">{safePage + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Dialogs */}

      {/* Full song edit dialog */}
      <SongEditDialog
        song={editingSong}
        open={!!editingSong}
        onOpenChange={open => { if (!open) setEditingSong(null); }}
        onSave={song => { updateSong(song); toast.success('Zapisano pieśń'); }}
      />

      {/* New song dialog */}
      <SongEditDialog
        song={null}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSave={song => { updateSong(song); toast.success('Utworzono pieśń'); }}
      />

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Usunąć {selectedIds.size} pieśni?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Przed usunięciem zostanie automatycznie utworzona kopia zapasowa. Tej operacji nie można cofnąć inaczej niż przez przywrócenie kopii.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Usuń {selectedIds.size} pieśni
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk edit dialog */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Zmień {bulkEditField === 'author' ? 'autora' : 'źródło'} dla {selectedIds.size} pieśni
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <Input
              value={bulkEditValue}
              onChange={e => setBulkEditValue(e.target.value)}
              placeholder={bulkEditField === 'author' ? 'Nowy autor...' : 'Nowe źródło...'}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleBulkEdit(); }}
            />
            <p className="text-[11px] text-muted-foreground mt-2">
              Przed zmianą zostanie utworzona kopia zapasowa.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>Anuluj</Button>
            <Button onClick={handleBulkEdit} disabled={!bulkEditValue.trim()}>
              Zapisz dla {selectedIds.size} pieśni
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
