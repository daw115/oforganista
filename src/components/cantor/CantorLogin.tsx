import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, UserPlus } from 'lucide-react';

interface Props {
  onLogin: (name: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  onRegister: (name: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
}

export function CantorLogin({ onLogin, onRegister }: Props) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) return;
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const res = await onLogin(name.trim(), pin.trim());
      if (!res.ok) {
        if (res.error === 'not_found') {
          setMode('register');
          setError('Nie znaleziono kantora o tym imieniu. Utwórz nowe konto poniżej.');
        } else {
          setError(res.error ?? 'Błąd logowania');
        }
      }
    } else {
      if (pin !== confirmPin) {
        setError('PINy nie są takie same');
        setLoading(false);
        return;
      }
      if (pin.length < 4) {
        setError('PIN musi mieć minimum 4 znaki');
        setLoading(false);
        return;
      }
      const res = await onRegister(name.trim(), pin.trim());
      if (!res.ok) setError(res.error ?? 'Błąd rejestracji');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🎤</div>
          <CardTitle className="text-lg">
            {mode === 'login' ? 'Logowanie kantora' : 'Nowe konto kantora'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                placeholder="Imię i nazwisko"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={mode === 'register'}
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="PIN"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
            </div>
            {mode === 'register' && (
              <div>
                <Input
                  type="password"
                  placeholder="Potwierdź PIN"
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {mode === 'login' ? (
                <><LogIn className="w-4 h-4 mr-2" /> Zaloguj</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" /> Utwórz konto</>
              )}
            </Button>
            {mode === 'register' && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setMode('login'); setError(''); setConfirmPin(''); }}
              >
                Wróć do logowania
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
