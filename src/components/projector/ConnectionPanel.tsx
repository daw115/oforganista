import { useState, useRef, useEffect } from 'react';
import { Globe, ExternalLink, Copy, Check, RefreshCw, LogIn, Plus, Lock, Trash2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useProjectorRooms, type ProjectorRoom } from '@/hooks/useProjectorRooms';
import { toast } from 'sonner';
import type { useProjectorSync } from '@/hooks/useProjectorSync';

interface ConnectionPanelProps {
  isLive: boolean;
  projectorSync: ReturnType<typeof useProjectorSync>;
  onOpenProjector: () => void;
}

export function ConnectionPanel({ isLive, projectorSync, onOpenProjector }: ConnectionPanelProps) {
  const [copied, setCopied] = useState(false);
  const { rooms, loading, fetchRooms, createRoom, verifyPin, deleteRoom, touchRoom } = useProjectorRooms();

  // Create room dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [creating, setCreating] = useState(false);

  // PIN prompt dialog
  const [pinPrompt, setPinPrompt] = useState<ProjectorRoom | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const isOwner = projectorSync.isRoomOwner;

  const handleCreateRoom = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const room = await createRoom(newName.trim(), newPin.trim() || undefined);
    setCreating(false);
    if (room) {
      // Set owner flag BEFORE changing room so the sync hook picks it up
      localStorage.setItem('organista_projector_room', room.room_code);
      localStorage.setItem('organista_projector_room_owner', 'true');
      projectorSync.changeRoom(room.room_code);
      setShowCreate(false);
      setNewName('');
      setNewPin('');
      toast.success(`Pokój „${room.name}" utworzony`);
    } else {
      toast.error('Nie udało się utworzyć pokoju — sprawdź połączenie');
    }
  };

  const handleJoinRoom = async (room: ProjectorRoom) => {
    if (room.pin_hash) {
      setPinPrompt(room);
      setPinInput('');
      setPinError(false);
      return;
    }
    projectorSync.changeRoom(room.room_code);
    touchRoom(room.room_code);
    toast.success(`Dołączono do pokoju „${room.name}"`);
  };

  const handlePinSubmit = async () => {
    if (!pinPrompt) return;
    const ok = await verifyPin(pinPrompt, pinInput);
    if (ok) {
      projectorSync.changeRoom(pinPrompt.room_code);
      touchRoom(pinPrompt.room_code);
      setPinPrompt(null);
      toast.success(`Dołączono do pokoju „${pinPrompt.name}"`);
    } else {
      setPinError(true);
    }
  };

  const handleDeleteRoom = async (e: React.MouseEvent, room: ProjectorRoom) => {
    e.stopPropagation();
    if (!confirm(`Usunąć pokój „${room.name}"?`)) return;
    await deleteRoom(room.id);
    toast.success('Pokój usunięty');
  };

  const currentRoom = rooms.find(r => r.room_code === projectorSync.roomId);

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      {/* Status bar */}
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-success' : 'bg-muted-foreground'}`} />
        <span className="text-sm font-medium text-foreground">
          {isLive ? 'Ekran aktywny' : 'Ekran wygaszony'}
        </span>
        {isOwner && (
          <button onClick={onOpenProjector} className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <ExternalLink className="h-3.5 w-3.5" />
            Projekcja
          </button>
        )}
      </div>

      {/* Current room info */}
      {projectorSync.roomId && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
          isOwner
            ? 'bg-success/10 text-success border border-success/20'
            : 'bg-amber/10 text-amber border border-amber/20'
        }`}>
          <div className={`w-2 h-2 rounded-full ${isOwner ? 'bg-success' : 'bg-amber'}`} />
          <span className="truncate">
            {currentRoom ? `${currentRoom.name} (${projectorSync.roomId})` : projectorSync.roomId}
            {isOwner ? ' — projekcja' : ' — sterowanie'}
          </span>
          {projectorSync.cloudConnected && <Wifi className="w-3 h-3 ml-auto shrink-0 text-success" />}
          <button onClick={() => {
            const url = `${window.location.origin}/projector-screen?room=${projectorSync.roomId}`;
            navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
          }} className="p-0.5 rounded hover:bg-black/10 transition-colors shrink-0" title="Kopiuj link">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      )}

      {/* Room list */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Pokoje</span>
          <div className="flex items-center gap-1">
            <button onClick={fetchRooms} className="p-1 rounded hover:bg-muted transition-colors" title="Odśwież">
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="w-3 h-3" />
              Nowy
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-2">Ładowanie…</p>
        ) : rooms.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Brak pokoi — utwórz nowy</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {rooms.map(room => {
              const isCurrent = room.room_code === projectorSync.roomId;
              return (
                <button
                  key={room.id}
                  onClick={() => !isCurrent && handleJoinRoom(room)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                    isCurrent
                      ? 'bg-primary/10 border border-primary/30 text-primary'
                      : 'border border-border hover:bg-muted text-foreground'
                  }`}
                >
                  <span className="font-mono font-bold tracking-wider shrink-0">{room.room_code}</span>
                  <span className="truncate flex-1 font-medium">{room.name}</span>
                  {room.pin_hash && <Lock className="w-3 h-3 shrink-0 text-muted-foreground" />}
                  {isCurrent && <Check className="w-3 h-3 shrink-0 text-primary" />}
                  <button
                    onClick={(e) => handleDeleteRoom(e, room)}
                    className="p-0.5 rounded hover:bg-destructive/20 transition-colors shrink-0"
                    title="Usuń pokój"
                  >
                    <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Create room dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nowy pokój</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nazwa pokoju *</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="np. Kościół główny"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">PIN (opcjonalnie)</label>
              <Input
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="np. 1234"
                inputMode="numeric"
                maxLength={6}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Pozostaw puste dla pokoju otwartego</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
            <Button onClick={handleCreateRoom} disabled={!newName.trim() || creating}>
              {creating ? 'Tworzenie…' : 'Utwórz'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIN prompt dialog */}
      <Dialog open={!!pinPrompt} onOpenChange={(open) => !open && setPinPrompt(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Pokój chroniony PINem
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Pokój „{pinPrompt?.name}" wymaga PINu do dołączenia.
            </p>
            <Input
              value={pinInput}
              onChange={e => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(false); }}
              placeholder="Wpisz PIN"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              className={pinError ? 'border-destructive' : ''}
              onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
            />
            {pinError && <p className="text-xs text-destructive">Nieprawidłowy PIN</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinPrompt(null)}>Anuluj</Button>
            <Button onClick={handlePinSubmit} disabled={!pinInput}>Dołącz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
