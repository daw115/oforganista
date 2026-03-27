import { useState, useRef, useEffect } from 'react';
import { Search, Music, Download, Upload, Trash2, HardDrive, PlusCircle, Pencil, MoreVertical, Sparkles, AlertTriangle, Copy, CheckSquare, Monitor, RefreshCw, Hash, Undo2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SongEditDialog } from './SongEditDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { findDuplicates, findEmptySongs, findShortSongs, findPsalmRefrains, findPsalmDuplicatesInLibrary, findLongVerses, cleanAllFormatting, deduplicateSongs, restructureSongs } from '@/lib/songCleanup';
import type { Song } from '@/types/projector';
import type { useProjector } from '@/hooks/useProjector';

type ProjectorHook = ReturnType<typeof useProjector>;

export function SongLibraryManager({ projector }: { projector: ProjectorHook }) {
  const {
    songs, filteredSongs, loading,
    searchQuery, setSearchQuery,
    loadBundledDatabase, loadLocalDatabase, importDatabase,
    clearSongs, updateSong, deleteSong, importJsonSongs,
    rebuildAllProjectorData, rebuildProjectorForSongs,
    loadSiedleckiDatabase, createBackup, restoreFromBackup,
  } = projector;

  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const [pendingJsonData, setPendingJsonData] = useState<any[] | null>(null);
  const [jsonDuplicateCount, setJsonDuplicateCount] = useState(0);
  const [jsonNewCount, setJsonNewCount] = useState(0);
  const [jsonDuplicateTitles, setJsonDuplicateTitles] = useState<string[]>([]);

  // Cleanup state
  const [cleanupDialog, setCleanupDialog] = useState<'duplicates' | 'empty' | 'format' | 'short' | 'psalms' | 'psalmDupes' | 'longVerses' | 'restructure' | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<Map<string, Song[]>>(new Map());
  const [dupSelectedIds, setDupSelectedIds] = useState<Set<string>>(new Set());
  const [dupExpandedGroup, setDupExpandedGroup] = useState<string | null>(null);
  const [emptySongs, setEmptySongs] = useState<Song[]>([]);
  const [shortSongs, setShortSongs] = useState<Song[]>([]);
  const [psalmRefrains, setPsalmRefrains] = useState<Song[]>([]);
  const [psalmDupes, setPsalmDupes] = useState<Map<string, Song[]>>(new Map());
  const [psalmSelectedIds, setPsalmSelectedIds] = useState<Set<string>>(new Set());
  // Psalm-based duplicate search state
  const [psalmDupeSongs, setPsalmDupeSongs] = useState<{ psalm: Song; matches: Song[] }[]>([]);
  const [psalmDupeSelectedIds, setPsalmDupeSelectedIds] = useState<Set<string>>(new Set());
  const [psalmDupeExpanded, setPsalmDupeExpanded] = useState<string | null>(null);
  const [longVerseResults, setLongVerseResults] = useState<{ song: Song; verseIndex: number; lineCount: number }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [filterPsalm, setFilterPsalm] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [backupTime, setBackupTime] = useState<string | null>(null);

  // Check backup availability on mount
  useEffect(() => {
    import('@/lib/songsDb').then(({ hasBackup, getBackupTime }) => {
      hasBackup().then(setBackupAvailable);
      setBackupTime(getBackupTime());
    });
  }, []);

  // Auto-backup before destructive operations
  const backupBefore = async (label: string) => {
    const count = await createBackup();
    console.log(`[Backup] Created before "${label}": ${count} songs`);
    setBackupAvailable(true);
    import('@/lib/songsDb').then(({ getBackupTime }) => setBackupTime(getBackupTime()));
    return count;
  };

  const handleRestore = async () => {
    if (!confirm('Przywrócić bazę do stanu sprzed ostatniej operacji?')) return;
    try {
      const count = await restoreFromBackup();
      setImportMsg(`Przywrócono ${count} pieśni z kopii zapasowej`);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Błąd przywracania');
    }
  };

  const baseSongs = filterPsalm ? (searchQuery ? filteredSongs : songs).filter(s => s.author === 'Psalm') : (searchQuery ? filteredSongs : songs);
  const displayedSongs = baseSongs.slice(0, 200);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const visible = displayedSongs;
    const allSelected = visible.every(s => selectedIds.has(s.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map(s => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    await backupBefore('bulk delete');
    bulkDelete(Array.from(selectedIds));
    setImportMsg(`Usunięto ${selectedIds.size} pieśni`);
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  };

  // Bulk delete helper
  const bulkDelete = (ids: string[]) => {
    ids.forEach(id => deleteSong(id));
  };

  // Bulk update songs (for formatting cleanup)
  const bulkUpdateSongs = (updatedSongs: Song[]) => {
    updatedSongs.forEach(s => updateSong(s));
  };

  const handleLoadBundled = async () => {
    setImportMsg('');
    try {
      const count = await loadBundledDatabase();
      setImportMsg(`Załadowano ${count} pieśni z wbudowanej bazy`);
    } catch { setImportMsg('Błąd ładowania wbudowanej bazy'); }
  };

  const handleLoadLocal = async () => {
    setImportMsg('');
    try {
      const count = await loadLocalDatabase();
      setImportMsg(`Załadowano ${count} pieśni z lokalnej bazy OpenLP`);
    } catch (e) { setImportMsg(e instanceof Error ? e.message : 'Błąd ładowania lokalnej bazy'); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    try {
      const count = await importDatabase(file);
      setImportMsg(`Zaimportowano ${count} pieśni`);
    } catch { setImportMsg('Błąd importu bazy danych'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExportJson = () => {
    const data = songs.map(({ searchText, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piesni-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Plik JSON nie zawiera tablicy pieśni');
      const existingIds = new Set(songs.map(s => s.id));
      const validItems = data.filter((s: any) => s.id && s.title && Array.isArray(s.verses));
      const dupes = validItems.filter((s: any) => existingIds.has(s.id));
      const newItems = validItems.filter((s: any) => !existingIds.has(s.id));
      if (dupes.length > 0) {
        setPendingJsonData(data);
        setJsonDuplicateCount(dupes.length);
        setJsonNewCount(newItems.length);
        setJsonDuplicateTitles(dupes.map((s: any) => s.title as string));
      } else {
        const result = importJsonSongs(data, 'skip');
        setImportMsg(`Zaimportowano ${result.added} nowych pieśni`);
      }
    } catch (err) { setImportMsg(err instanceof Error ? err.message : 'Błąd importu JSON'); }
    if (jsonFileRef.current) jsonFileRef.current.value = '';
  };

  const handleJsonMerge = (mode: 'skip' | 'overwrite') => {
    if (!pendingJsonData) return;
    const result = importJsonSongs(pendingJsonData, mode);
    const parts: string[] = [];
    if (result.added > 0) parts.push(`${result.added} nowych`);
    if (result.updated > 0) parts.push(`${result.updated} nadpisanych`);
    setImportMsg(parts.length > 0 ? `Zaimportowano: ${parts.join(', ')}` : 'Brak nowych pieśni do importu');
    setPendingJsonData(null);
    setJsonDuplicateCount(0);
    setJsonNewCount(0);
    setJsonDuplicateTitles([]);
  };

  // Cleanup handlers
  const handleShowDuplicates = () => {
    const dupes = findDuplicates(songs);
    setDuplicateGroups(dupes);
    // Pre-select shorter versions (all except the one with most content per group)
    const preSelected = new Set<string>();
    for (const [, arr] of dupes) {
      const sorted = [...arr].sort((a, b) => {
        const ac = a.verses.reduce((s, v) => s + v.text.length, 0);
        const bc = b.verses.reduce((s, v) => s + v.text.length, 0);
        return bc - ac;
      });
      for (let i = 1; i < sorted.length; i++) preSelected.add(sorted[i].id);
    }
    setDupSelectedIds(preSelected);
    setDupExpandedGroup(null);
    setCleanupDialog('duplicates');
  };

  const handleShowEmpty = () => {
    const empty = findEmptySongs(songs);
    setEmptySongs(empty);
    setCleanupDialog('empty');
  };

  const handleCleanFormatting = () => {
    setCleanupDialog('format');
  };

  const handleShowShort = () => {
    const short = findShortSongs(songs, 80);
    setShortSongs(short);
    setCleanupDialog('short');
  };

  const handleShowPsalms = () => {
    const psalms = findPsalmRefrains(songs);
    const dupes = findPsalmDuplicatesInLibrary(psalms, songs);
    setPsalmRefrains(psalms);
    setPsalmDupes(dupes);
    // Pre-select those with duplicates
    setPsalmSelectedIds(new Set([...dupes.keys()]));
    setCleanupDialog('psalms');
  };

  const handleMarkPsalmsAuthor = () => {
    const toMark = psalmRefrains.filter(s => !psalmSelectedIds.has(s.id));
    if (toMark.length === 0) {
      setImportMsg('Brak pieśni do oznaczenia (wszystkie zaznaczone do usunięcia)');
      return;
    }
    const updated = toMark.map(s => ({ ...s, author: 'Psalm', searchText: `${s.title} psalm`.toLowerCase() }));
    bulkUpdateSongs(updated);
    setImportMsg(`Oznaczono ${updated.length} refrenów psalmów autorem "Psalm"`);
  };

  const handleConfirmRemovePsalms = async () => {
    const ids = Array.from(psalmSelectedIds);
    if (ids.length === 0) return;
    await backupBefore('remove psalms');
    bulkDelete(ids);
    setImportMsg(`Usunięto ${ids.length} refrenów psalmów`);
    setCleanupDialog(null);
  };

  const togglePsalmSelect = (id: string) => {
    setPsalmSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllPsalms = () => {
    if (psalmSelectedIds.size === psalmRefrains.length) {
      setPsalmSelectedIds(new Set());
    } else {
      setPsalmSelectedIds(new Set(psalmRefrains.map(s => s.id)));
    }
  };

  const handleConfirmRemoveShort = async () => {
    await backupBefore('remove short');
    const ids = shortSongs.map(s => s.id);
    bulkDelete(ids);
    setImportMsg(`Usunięto ${ids.length} pieśni z bardzo krótkim tekstem`);
    setCleanupDialog(null);
  };

  const handleConfirmDedup = async () => {
    const ids = Array.from(dupSelectedIds);
    if (ids.length === 0) return;
    await backupBefore('dedup');
    bulkDelete(ids);
    setImportMsg(`Usunięto ${ids.length} duplikatów`);
    setCleanupDialog(null);
  };

  const toggleDupSelect = (id: string) => {
    setDupSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirmRemoveEmpty = async () => {
    await backupBefore('remove empty');
    const ids = emptySongs.map(s => s.id);
    bulkDelete(ids);
    setImportMsg(`Usunięto ${ids.length} pustych pieśni`);
    setCleanupDialog(null);
  };

  const handleConfirmFormat = async () => {
    await backupBefore('format cleanup');
    const { cleaned, modifiedCount } = cleanAllFormatting(songs);
    const modified = cleaned.filter((s, i) => s !== songs[i]);
    bulkUpdateSongs(modified);
    setImportMsg(`Poprawiono formatowanie ${modifiedCount} pieśni`);
    setCleanupDialog(null);
  };

  // Psalm-based duplicate search
  const handleShowPsalmDupes = () => {
    const norm = (t: string) =>
      t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

    const psalms = songs.filter(s => s.author === 'Psalm');
    const nonPsalms = songs.filter(s => s.author !== 'Psalm');

    // Build index of non-psalm songs by normalized title
    const titleIndex = new Map<string, Song[]>();
    for (const song of nonPsalms) {
      const key = norm(song.title);
      if (!key) continue;
      const arr = titleIndex.get(key) || [];
      arr.push(song);
      titleIndex.set(key, arr);
    }

    const results: { psalm: Song; matches: Song[] }[] = [];
    const preSelect = new Set<string>();
    for (const psalm of psalms) {
      const key = norm(psalm.title);
      const matches = titleIndex.get(key);
      if (matches && matches.length > 0) {
        results.push({ psalm, matches });
        // Pre-select the psalm (shorter version) for deletion
        preSelect.add(psalm.id);
      }
    }

    setPsalmDupeSongs(results);
    setPsalmDupeSelectedIds(preSelect);
    setPsalmDupeExpanded(null);
    setCleanupDialog('psalmDupes');
  };

  const handleConfirmRemovePsalmDupes = async () => {
    const ids = Array.from(psalmDupeSelectedIds);
    if (ids.length === 0) return;
    await backupBefore('remove psalm dupes');
    bulkDelete(ids);
    setImportMsg(`Usunięto ${ids.length} pieśni`);
    setCleanupDialog(null);
  };

  const togglePsalmDupeSelect = (id: string) => {
    setPsalmDupeSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const psalmAuthorCount = songs.filter(s => s.author === 'Psalm').length;

  const handleShowLongVerses = () => {
    const results = findLongVerses(songs, 6);
    setLongVerseResults(results);
    setCleanupDialog('longVerses');
  };

  const handleRestructure = () => {
    setCleanupDialog('restructure');
  };

  const handleConfirmRestructure = async () => {
    await backupBefore('restructure');
    const { cleaned, modifiedCount, totalSlides } = restructureSongs(songs, 6);
    const modified = cleaned.filter((s, i) => s !== songs[i]);
    bulkUpdateSongs(modified);
    setImportMsg(`Przebudowano ${modifiedCount} pieśni (łącznie ${totalSlides} slajdów)`);
    setCleanupDialog(null);
  };

  // Full rebuild handlers (projector + index + numbering)
  const handleRebuildAllProjector = async () => {
    await backupBefore('rebuild all');
    const result = rebuildAllProjectorData();
    setImportMsg(`Przebudowano ${result.modified} pieśni (${result.totalSlides} slajdów, ${Math.round(result.elapsed)}ms)`);
  };

  // Renumber all verses sequentially as "Zwrotka 1", "Zwrotka 2", etc.
  const handleRenumberAllVerses = async () => {
    await backupBefore('renumber verses');
    let count = 0;
    for (const song of songs) {
      let changed = false;
      const newVerses = song.verses.map((v, i) => {
        const newLabel = `Zwrotka ${i + 1}`;
        const newRef = `v${i + 1}`;
        if (v.label !== newLabel || v.type !== 'verse' || v.ref !== newRef) {
          changed = true;
        }
        return { ...v, type: 'verse' as const, label: newLabel, ref: newRef };
      });
      if (changed) {
        updateSong({ ...song, verses: newVerses, displayOrder: undefined });
        count++;
      }
    }
    if (count > 0) {
      rebuildAllProjectorData();
    }
    setImportMsg(`Przenumerowano zwrotki w ${count} pieśniach`);
  };

  const handleRebuildSelectedProjector = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const count = rebuildProjectorForSongs(ids);
    setImportMsg(`Przeliczono dane dla ${count} pieśni`);
    setSelectedIds(new Set());
  };

  // Stats for cleanup info
  const dupeCount = findDuplicates(songs).size;
  const emptyCount = findEmptySongs(songs).length;
  const shortCount = findShortSongs(songs, 80).length;
  const psalmCount = findPsalmRefrains(songs).length;
  const longVerseCount = findLongVerses(songs, 6).length;

  return (
    <div className="animate-fade-in">
      <input ref={fileRef} type="file" accept=".sqlite,.sqlite3,.db" onChange={handleFileChange} className="hidden" />
      <input ref={jsonFileRef} type="file" accept=".json" onChange={handleJsonFileChange} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Music className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-foreground">Baza Pieśni</h2>
            <p className="text-xs text-muted-foreground">{songs.length} pieśni w bazie</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)} className="gap-1.5">
            <PlusCircle className="w-4 h-4" />
            Nowa pieśń
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={handleLoadBundled} disabled={loading}>
                <Download className="w-3.5 h-3.5 mr-2" />
                Załaduj wbudowaną bazę
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileRef.current?.click()} disabled={loading}>
                <Upload className="w-3.5 h-3.5 mr-2" />
                Import z pliku .sqlite
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => jsonFileRef.current?.click()} disabled={loading}>
                <Upload className="w-3.5 h-3.5 mr-2" />
                Import z pliku .json
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLoadLocal} disabled={loading}>
                <HardDrive className="w-3.5 h-3.5 mr-2" />
                Załaduj z dysku (OpenLP)
              </DropdownMenuItem>
              {songs.length > 0 && (
                <>
                  <DropdownMenuItem onClick={handleExportJson}>
                    <Download className="w-3.5 h-3.5 mr-2" />
                    Eksport bazy (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleShowDuplicates}>
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Usuń duplikaty
                    {dupeCount > 0 && <span className="ml-auto text-xs text-warning">{dupeCount}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowEmpty}>
                    <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                    Usuń puste pieśni
                    {emptyCount > 0 && <span className="ml-auto text-xs text-warning">{emptyCount}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowShort}>
                    <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                    Krótkie pieśni (mało tekstu)
                    {shortCount > 0 && <span className="ml-auto text-xs text-warning">{shortCount}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowPsalms}>
                    <Music className="w-3.5 h-3.5 mr-2" />
                    Refreny psalmów (tytuł = treść)
                    {psalmCount > 0 && <span className="ml-auto text-xs text-warning">{psalmCount}</span>}
                  </DropdownMenuItem>
                  {psalmAuthorCount > 0 && (
                    <DropdownMenuItem onClick={handleShowPsalmDupes}>
                      <Copy className="w-3.5 h-3.5 mr-2" />
                      Duplikaty psalmów w bazie
                      <span className="ml-auto text-xs text-muted-foreground">{psalmAuthorCount} psalmów</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleShowLongVerses}>
                    <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                    Długie zwrotki (&gt;6 linii)
                    {longVerseCount > 0 && <span className="ml-auto text-xs text-warning">{longVerseCount}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRestructure}>
                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                    Przebuduj slajdy (max 6 linii)
                    {longVerseCount > 0 && <span className="ml-auto text-xs text-warning">{longVerseCount}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCleanFormatting}>
                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                    Popraw formatowanie
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleRenumberAllVerses}>
                    <Hash className="w-3.5 h-3.5 mr-2" />
                    Przenumeruj wszystkie zwrotki (1, 2, 3…)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRebuildAllProjector}>
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Przebuduj wszystko (indeks + projektor + numeracja)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      if (confirm('Wyczyścić bazę i wczytać nową bazę Siedleckiego? To zastąpi wszystkie pieśni.')) {
                        await backupBefore('load Siedlecki');
                        clearSongs();
                        const count = await loadSiedleckiDatabase();
                        setImportMsg(`Wczytano ${count} pieśni z bazy Siedleckiego`);
                      }
                    }}
                    className="text-primary focus:text-primary"
                  >
                    <Download className="w-3.5 h-3.5 mr-2" />
                    Wyczyść i wczytaj bazę Siedleckiego
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      if (confirm('Wyczyścić całą bazę pieśni?')) {
                        await backupBefore('clear all');
                        clearSongs();
                      }
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Wyczyść bazę
                  </DropdownMenuItem>
                  {backupAvailable && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleRestore} className="text-accent-foreground">
                        <Undo2 className="w-3.5 h-3.5 mr-2" />
                        Przywróć z kopii zapasowej
                        {backupTime && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {new Date(backupTime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {importMsg && (
        <div className="text-xs font-medium text-success bg-success/10 border border-success/30 rounded-lg px-3 py-1.5 mb-3">
          {importMsg}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Szukaj pieśni..."
            className="w-full rounded-lg border border-input bg-background px-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {songs.some(s => s.author === 'Psalm') && (
          <Button
            variant={filterPsalm ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterPsalm(!filterPsalm)}
            className="shrink-0 gap-1.5"
          >
            ♪ Psalm
            {filterPsalm && <span className="text-xs">({baseSongs.length})</span>}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {songs.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Music className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium mb-1">Brak pieśni w bazie</p>
          <p className="text-sm mb-4">Załaduj pieśni aby rozpocząć</p>
          <Button onClick={handleLoadBundled} disabled={loading} className="bg-primary text-primary-foreground">
            <Download className="w-4 h-4" />
            Załaduj wbudowaną bazę
          </Button>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-muted-foreground">
          Importuję bazę danych...
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
          <span className="text-sm font-medium text-foreground">
            Zaznaczono: <strong>{selectedIds.size}</strong>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={handleRebuildSelectedProjector}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Przebuduj projektor
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setBulkDeleteConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Usuń zaznaczone
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
            Odznacz
          </Button>
        </div>
      )}

      {/* Song list */}
      {songs.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Select all header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30">
            <input
              type="checkbox"
              checked={displayedSongs.length > 0 && displayedSongs.every(s => selectedIds.has(s.id))}
              onChange={selectAll}
              className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
              title="Zaznacz wszystkie"
            />
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size} zaznaczonych` : 'Zaznacz wszystkie'}
            </span>
          </div>
          <div className="divide-y divide-border">
            {displayedSongs.map(song => {
              const slideCount = song.projectorDisplaySlides?.length ||
                song.verses.reduce((sum, v) => sum + (v.projector?.slideCount || 1), 0);
              return (
              <div
                key={song.id}
                className={`group flex items-center gap-3 px-4 py-3 hover:bg-panel-hover transition-colors ${selectedIds.has(song.id) ? 'bg-primary/5' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(song.id)}
                  onChange={() => toggleSelect(song.id)}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer shrink-0"
                />
                {/* Song number badge */}
                {song.songNumber && (
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0 min-w-[2rem] text-center">
                    #{song.songNumber}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {song.author && (
                      <span className="text-xs text-muted-foreground truncate">{song.author}</span>
                    )}
                    {song.siedleckiNumber && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono">SL {song.siedleckiNumber}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/60">
                    {song.verses.length} sekcji • {slideCount} slajdów
                    {song.projectorVersion === 3 && (
                      <span className="ml-1.5 text-emerald-500">• ✓ zindeksowana</span>
                    )}
                    {!song.projectorPreparedAt && (
                      <span className="ml-1.5 text-yellow-500">• brak danych projektora</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setEditingSong(song)}
                  className="p-1.5 rounded-md hover:bg-muted transition-all text-muted-foreground hover:text-foreground shrink-0"
                  title="Edytuj pieśń"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeletingSong(song)}
                  className="p-1.5 rounded-md hover:bg-destructive/10 transition-all text-muted-foreground hover:text-destructive shrink-0"
                  title="Usuń pieśń"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              );
            })}
          </div>
          {baseSongs.length > 200 && (
            <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border">
              Pokazano 200 z {baseSongs.length} — zawęź wyszukiwanie
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <SongEditDialog
        song={editingSong}
        open={!!editingSong}
        onOpenChange={(open) => { if (!open) setEditingSong(null); }}
        onSave={updateSong}
      />
      <SongEditDialog
        song={null}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSave={updateSong}
      />
      <AlertDialog open={!!deletingSong} onOpenChange={(open) => { if (!open) setDeletingSong(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń pieśń</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć „{deletingSong?.title}"? Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletingSong) { deleteSong(deletingSong.id); setDeletingSong(null); } }}
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń zaznaczone pieśni</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć <strong className="text-foreground">{selectedIds.size}</strong> zaznaczonych pieśni? Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Usuń {selectedIds.size} pieśni
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* JSON merge dialog */}
      <AlertDialog open={!!pendingJsonData} onOpenChange={(open) => { if (!open) { setPendingJsonData(null); setJsonDuplicateCount(0); setJsonNewCount(0); setJsonDuplicateTitles([]); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Wykryto duplikaty</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  W importowanym pliku: <strong className="text-foreground">{jsonNewCount}</strong> nowych pieśni
                  i <strong className="text-foreground">{jsonDuplicateCount}</strong> już istniejących.
                </p>
                {jsonDuplicateTitles.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Pieśni do nadpisania:</p>
                    <div className="max-h-40 overflow-auto rounded-md border border-border bg-muted/30 p-2 space-y-0.5">
                      {jsonDuplicateTitles.slice(0, 50).map((title, i) => (
                        <p key={i} className="text-xs text-foreground truncate">{title}</p>
                      ))}
                      {jsonDuplicateTitles.length > 50 && (
                        <p className="text-xs text-muted-foreground">…i {jsonDuplicateTitles.length - 50} więcej</p>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-xs">Co chcesz zrobić z duplikatami?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleJsonMerge('skip')}>
              Pomiń duplikaty
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleJsonMerge('overwrite')}>
              Nadpisz duplikaty
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicates cleanup dialog */}
      <AlertDialog open={cleanupDialog === 'duplicates'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-warning" />
              Duplikaty w bazie
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {duplicateGroups.size === 0 ? (
                  <p>Brak duplikatów — baza jest czysta! ✅</p>
                ) : (
                  <>
                    <p>
                      Znaleziono <strong className="text-foreground">{duplicateGroups.size}</strong> grup duplikatów ({dupSelectedIds.size} zaznaczonych do usunięcia).
                      Kliknij grupę aby zobaczyć pełny tekst.
                    </p>
                    <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/30 divide-y divide-border">
                      {[...duplicateGroups.entries()].map(([key, group]) => {
                        const isExpanded = dupExpandedGroup === key;
                        const sorted = [...group].sort((a, b) => {
                          const ac = a.verses.reduce((s, v) => s + v.text.length, 0);
                          const bc = b.verses.reduce((s, v) => s + v.text.length, 0);
                          return bc - ac;
                        });
                        return (
                          <div key={key}>
                            {/* Group header */}
                            <button
                              onClick={() => setDupExpandedGroup(isExpanded ? null : key)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            >
                              <span className="text-xs text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>
                              <span className="text-sm font-medium text-foreground truncate flex-1">{group[0].title}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{group.length} kopii</span>
                            </button>
                            {/* Expanded: show each song with checkbox and text */}
                            {isExpanded && (
                              <div className="px-3 pb-3 space-y-2">
                                {sorted.map((song, idx) => {
                                  const charCount = song.verses.reduce((s, v) => s + v.text.length, 0);
                                  const isSelected = dupSelectedIds.has(song.id);
                                  return (
                                    <div key={song.id} className={`rounded-md border p-2 ${isSelected ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}>
                                      <label className="flex items-start gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleDupSelect(song.id)}
                                          className="w-4 h-4 rounded border-border accent-primary cursor-pointer mt-0.5 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-medium text-foreground">
                                            {idx === 0 && !isSelected && <span className="text-success mr-1">★</span>}
                                            {song.title}
                                            {song.author && <span className="text-muted-foreground ml-1">— {song.author}</span>}
                                          </p>
                                          <p className="text-xs text-muted-foreground mb-1">
                                            {song.verses.length} zwrotek • {charCount} znaków
                                            {isSelected && ' • do usunięcia'}
                                          </p>
                                          <pre className="text-[10px] leading-tight text-muted-foreground whitespace-pre-wrap max-h-32 overflow-auto bg-muted/30 rounded p-1.5 font-mono">
                                            {song.verses.map(v => `[${v.label}]\n${v.text}`).join('\n\n')}
                                          </pre>
                                        </div>
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zamknij</AlertDialogCancel>
            {dupSelectedIds.size > 0 && (
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmDedup}>
                Usuń {dupSelectedIds.size} zaznaczonych
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty songs cleanup dialog */}
      <AlertDialog open={cleanupDialog === 'empty'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Puste pieśni
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {emptySongs.length === 0 ? (
                  <p>Brak pustych pieśni — baza jest czysta! ✅</p>
                ) : (
                  <>
                    <p>
                      Znaleziono <strong className="text-foreground">{emptySongs.length}</strong> pieśni bez tekstu.
                    </p>
                    <div className="max-h-60 overflow-auto rounded-md border border-border bg-muted/30 p-2 space-y-0.5">
                      {emptySongs.slice(0, 50).map(s => (
                        <p key={s.id} className="text-xs text-foreground truncate">{s.title}</p>
                      ))}
                      {emptySongs.length > 50 && (
                        <p className="text-xs text-muted-foreground">…i {emptySongs.length - 50} więcej</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            {emptySongs.length > 0 && (
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmRemoveEmpty}>
                Usuń {emptySongs.length} pustych
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Format cleanup dialog */}
      <AlertDialog open={cleanupDialog === 'format'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Popraw formatowanie
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja wyczyści formatowanie we wszystkich pieśniach: usunie nadmiarowe puste linie, spacje na końcach wierszy i poprawi odstępy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmFormat}>
              Popraw formatowanie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restructure songs dialog */}
      <AlertDialog open={cleanupDialog === 'restructure'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Przebuduj slajdy
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja połączy wszystkie zwrotki każdej pieśni w ciągły tekst, usunie nadmiarowe entery, a następnie podzieli na slajdy po max 6 linii — dzieląc zgodnie z zasadami języka polskiego (po kropkach, przecinkach, zachowując pary wersów).
              {longVerseCount > 0 && (
                <span className="block mt-2 font-medium text-foreground">
                  Znaleziono {longVerseCount} zwrotek przekraczających 6 linii.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestructure}>
              Przebuduj slajdy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cleanupDialog === 'short'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Pieśni z bardzo krótkim tekstem
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {shortSongs.length === 0 ? (
                  <p>Brak pieśni z bardzo krótkim tekstem — baza jest czysta! ✅</p>
                ) : (
                  <>
                    <p>
                      Znaleziono <strong className="text-foreground">{shortSongs.length}</strong> pieśni z bardzo małą ilością tekstu (≤80 znaków).
                      Mogą to być błędne importy lub niekompletne wpisy.
                    </p>
                    <div className="max-h-60 overflow-auto rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
                      {shortSongs.slice(0, 50).map(s => {
                        const totalChars = s.verses.reduce((sum, v) => sum + v.text.trim().length, 0);
                        const preview = s.verses.map(v => v.text.trim()).filter(Boolean).join(' / ').slice(0, 100);
                        return (
                          <div key={s.id} className="text-xs">
                            <p className="font-medium text-foreground truncate">{s.title}</p>
                            <p className="text-muted-foreground">{totalChars} zn. • {s.verses.length} zwr. • <span className="italic">{preview || '(brak tekstu)'}</span></p>
                          </div>
                        );
                      })}
                      {shortSongs.length > 50 && (
                        <p className="text-xs text-muted-foreground">…i {shortSongs.length - 50} więcej</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            {shortSongs.length > 0 && (
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmRemoveShort}>
                Usuń {shortSongs.length} krótkich
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Psalm refrains cleanup dialog */}
      <AlertDialog open={cleanupDialog === 'psalms'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Music className="w-5 h-5 text-warning" />
              Refreny psalmów
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {psalmRefrains.length === 0 ? (
                  <p>Brak refrenów psalmów — baza jest czysta! ✅</p>
                ) : (
                  <>
                    <p>
                      Znaleziono <strong className="text-foreground">{psalmRefrains.length}</strong> pieśni.
                      {psalmDupes.size > 0 && (
                        <> <strong className="text-warning">{psalmDupes.size}</strong> ma duplikaty w bazie (pre-zaznaczone).</>
                      )}
                      {' '}Zaznacz te, które chcesz usunąć.
                    </p>
                    {/* Select all */}
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border">
                      <input
                        type="checkbox"
                        checked={psalmSelectedIds.size === psalmRefrains.length}
                        ref={el => { if (el) el.indeterminate = psalmSelectedIds.size > 0 && psalmSelectedIds.size < psalmRefrains.length; }}
                        onChange={toggleAllPsalms}
                        className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                      />
                      <span className="text-xs text-muted-foreground">
                        {psalmSelectedIds.size > 0 ? `${psalmSelectedIds.size} z ${psalmRefrains.length} zaznaczonych` : 'Zaznacz wszystkie'}
                      </span>
                    </div>
                    {/* Scrollable list */}
                    <div className="max-h-[45vh] overflow-auto rounded-md border border-border bg-muted/30 divide-y divide-border">
                      {psalmRefrains.map(s => {
                        const dupeMatches = psalmDupes.get(s.id);
                        const isSelected = psalmSelectedIds.has(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${isSelected ? 'bg-destructive/5' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePsalmSelect(s.id)}
                              className="w-4 h-4 rounded border-border accent-primary cursor-pointer mt-0.5 shrink-0"
                            />
                            <div className="min-w-0 flex-1 text-xs">
                              <p className={`font-medium truncate ${dupeMatches ? 'text-warning' : 'text-foreground'}`}>
                                {dupeMatches && '⚠ '}{s.title}
                              </p>
                              <p className="text-muted-foreground">
                                {s.verses.length} zwr. • {s.verses.reduce((sum, v) => sum + v.text.trim().length, 0)} zn.
                                {s.author && ` • autor: ${s.author}`}
                              </p>
                              {dupeMatches && (
                                <p className="text-muted-foreground/70 italic">
                                  duplikat: {dupeMatches.map(d => `"${d.title}" (${d.verses.length} zwr.)`).join(', ')}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Zamknij</AlertDialogCancel>
            {psalmRefrains.length > 0 && (
              <>
                <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={handleMarkPsalmsAuthor}>
                  Oznacz niezaznaczone „Psalm"
                </AlertDialogAction>
                {psalmSelectedIds.size > 0 && (
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmRemovePsalms}>
                    Usuń {psalmSelectedIds.size} zaznaczonych
                  </AlertDialogAction>
                )}
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Psalm-based duplicates dialog */}
      <AlertDialog open={cleanupDialog === 'psalmDupes'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-warning" />
              Duplikaty psalmów w bazie
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {psalmDupeSongs.length === 0 ? (
                  <p>Żadne pieśni z autorem „Psalm" nie mają duplikatów w bazie ✅</p>
                ) : (
                  <>
                    <p>
                      <strong className="text-foreground">{psalmDupeSongs.length}</strong> psalmów ma odpowiedniki wśród innych pieśni.
                      Psalmy (krótsze wersje) są pre-zaznaczone. Kliknij aby rozwinąć i porównać tekst.
                    </p>
                    <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/30 divide-y divide-border">
                      {psalmDupeSongs.map(({ psalm, matches }) => {
                        const isExpanded = psalmDupeExpanded === psalm.id;
                        const allSongs = [psalm, ...matches];
                        return (
                          <div key={psalm.id}>
                            <button
                              onClick={() => setPsalmDupeExpanded(isExpanded ? null : psalm.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            >
                              <span className="text-xs text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>
                              <span className="text-sm font-medium text-foreground truncate flex-1">{psalm.title}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                1 psalm + {matches.length} pieśń
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 space-y-2">
                                {allSongs.map(song => {
                                  const charCount = song.verses.reduce((s, v) => s + v.text.length, 0);
                                  const isSelected = psalmDupeSelectedIds.has(song.id);
                                  const isPsalm = song.author === 'Psalm';
                                  return (
                                    <div key={song.id} className={`rounded-md border p-2 ${isSelected ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'}`}>
                                      <label className="flex items-start gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => togglePsalmDupeSelect(song.id)}
                                          className="w-4 h-4 rounded border-border accent-primary cursor-pointer mt-0.5 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-medium text-foreground">
                                            {isPsalm && <span className="text-warning mr-1">♪ Psalm</span>}
                                            {!isPsalm && <span className="text-success mr-1">★</span>}
                                            {song.title}
                                            {song.author && !isPsalm && <span className="text-muted-foreground ml-1">— {song.author}</span>}
                                          </p>
                                          <p className="text-xs text-muted-foreground mb-1">
                                            {song.verses.length} zwrotek • {charCount} znaków
                                            {isSelected && ' • do usunięcia'}
                                          </p>
                                          <pre className="text-[10px] leading-tight text-muted-foreground whitespace-pre-wrap max-h-32 overflow-auto bg-muted/30 rounded p-1.5 font-mono">
                                            {song.verses.map(v => `[${v.label}]\n${v.text}`).join('\n\n')}
                                          </pre>
                                        </div>
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zamknij</AlertDialogCancel>
            {psalmDupeSelectedIds.size > 0 && (
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmRemovePsalmDupes}>
                Usuń {psalmDupeSelectedIds.size} zaznaczonych
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Long verses dialog */}
      <AlertDialog open={cleanupDialog === 'longVerses'} onOpenChange={(open) => { if (!open) setCleanupDialog(null); }}>
        <AlertDialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Zwrotki dłuższe niż 6 linii
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {longVerseResults.length === 0 ? (
                  <p>Wszystkie zwrotki mieszczą się na jednym slajdzie ✅</p>
                ) : (
                  <>
                    <p>
                      Znaleziono <strong className="text-foreground">{longVerseResults.length}</strong> zwrotek w{' '}
                      <strong className="text-foreground">{new Set(longVerseResults.map(r => r.song.id)).size}</strong> pieśniach,
                      które nie zmieszczą się na jednym slajdzie (maks. 6 linii).
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Rozważ podzielenie długich zwrotek na mniejsze części w edytorze pieśni.
                    </p>
                    <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/30 divide-y divide-border">
                      {longVerseResults.map((r, idx) => (
                        <div key={`${r.song.id}-${r.verseIndex}-${idx}`} className="px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-medium text-foreground truncate flex-1">{r.song.title}</span>
                            <span className="text-xs text-warning font-bold shrink-0">{r.lineCount} linii</span>
                            <button
                              onClick={() => { setEditingSong(r.song); setCleanupDialog(null); }}
                              className="text-xs text-primary hover:underline shrink-0"
                            >
                              Edytuj
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{r.song.verses[r.verseIndex]?.label}</p>
                          <pre className="text-[10px] leading-tight text-muted-foreground whitespace-pre-wrap max-h-24 overflow-auto bg-muted/30 rounded p-1.5 font-mono">
                            {r.song.verses[r.verseIndex]?.text}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zamknij</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
