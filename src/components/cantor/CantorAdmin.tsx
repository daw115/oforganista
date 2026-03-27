import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, KeyRound, Users, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Cantor } from '@/hooks/useCantors';

interface Props {
  allCantors: Cantor[];
  onLoad: () => void;
  onAdd: (name: string, pin: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onResetPin: (id: string, newPin: string) => Promise<boolean>;
}

export function CantorAdmin({ allCantors, onLoad, onAdd, onDelete, onResetPin }: Props) {
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState('');
  const [showPins, setShowPins] = useState<Set<string>>(new Set());

  useEffect(() => { onLoad(); }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    const pin = newPin.trim();
    if (!name) { toast({ title: 'Podaj imię kantora', variant: 'destructive' }); return; }
    if (pin.length < 4) { toast({ title: 'PIN musi mieć min. 4 znaki', variant: 'destructive' }); return; }
    const ok = await onAdd(name, pin);
    if (ok) {
      toast({ title: `✅ Dodano kantora: ${name}` });
      setNewName('');
      setNewPin('');
    } else {
      toast({ title: 'Błąd dodawania', variant: 'destructive' });
    }
  };

  const handleResetPin = async (id: string) => {
    const pin = resetPin.trim();
    if (pin.length < 4) { toast({ title: 'PIN musi mieć min. 4 znaki', variant: 'destructive' }); return; }
    const ok = await onResetPin(id, pin);
    if (ok) {
      toast({ title: '✅ PIN zresetowany' });
      setResetId(null);
      setResetPin('');
    }
  };

  const handleDelete = async (cantor: Cantor) => {
    if (!confirm(`Usunąć kantora "${cantor.name}"? Wszystkie jego melodie i wybory zostaną usunięte.`)) return;
    const ok = await onDelete(cantor.id);
    if (ok) toast({ title: `Usunięto: ${cantor.name}` });
  };

  const togglePin = (id: string) => {
    setShowPins(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4" /> Zarządzanie kantorami
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new cantor */}
        <div className="flex gap-2">
          <Input
            placeholder="Imię i nazwisko"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="flex-1"
            maxLength={100}
          />
          <Input
            type="password"
            placeholder="PIN (min. 4)"
            value={newPin}
            onChange={e => setNewPin(e.target.value)}
            className="w-32"
            maxLength={20}
          />
          <Button size="sm" onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-1" /> Dodaj
          </Button>
        </div>

        {/* List */}
        {allCantors.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Brak kantorów</p>
        )}

        {allCantors.map(c => (
          <div key={c.id} className="flex items-center gap-3 p-3 border border-border rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{c.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                PIN: {showPins.has(c.id) ? c.pin : '••••'}
                <button onClick={() => togglePin(c.id)} className="hover:text-foreground transition-colors">
                  {showPins.has(c.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {resetId === c.id ? (
              <div className="flex gap-1.5 items-center">
                <Input
                  type="password"
                  placeholder="Nowy PIN"
                  value={resetPin}
                  onChange={e => setResetPin(e.target.value)}
                  className="w-28 h-8 text-sm"
                  maxLength={20}
                />
                <Button size="sm" variant="default" className="h-8" onClick={() => handleResetPin(c.id)}>OK</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setResetId(null); setResetPin(''); }}>✕</Button>
              </div>
            ) : (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Resetuj PIN" onClick={() => { setResetId(c.id); setResetPin(''); }}>
                  <KeyRound className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Usuń" onClick={() => handleDelete(c)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
