import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { CantorLogin } from './CantorLogin';
import { CantorProfile } from './CantorProfile';
import { CantorMassSelection } from './CantorMassSelection';
import { CantorHistory } from './CantorHistory';
import type { useCantors } from '@/hooks/useCantors';

interface Props {
  cantors: ReturnType<typeof useCantors>;
}

/** Find the nearest upcoming Sunday (or today if Sunday) */
function getNextSunday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilSunday);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function CantorPanel({ cantors }: Props) {
  const {
    currentCantor, melodies, allMelodies, assignments, cantorHistory,
    loginCantor, registerCantor, logoutCantor,
    assignMelody, updateAssignment, removeAssignment,
    submitSelection,
  } = cantors;

  const nextSunday = useMemo(() => getNextSunday(), []);
  const sundayStr = nextSunday.toISOString().slice(0, 10);

  if (!currentCantor) {
    return <CantorLogin onLogin={loginCantor} onRegister={registerCantor} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">🎤 {currentCantor.name}</h2>
          <p className="text-xs text-muted-foreground">Panel kantora</p>
        </div>
        <Button size="sm" variant="outline" onClick={logoutCantor}>
          <LogOut className="w-4 h-4 mr-1" /> Wyloguj
        </Button>
      </div>

      <CantorMassSelection
        cantorId={currentCantor.id}
        melodies={melodies}
        initialDate={sundayStr}
        onSubmit={submitSelection}
      />

      <CantorHistory history={cantorHistory} />

      <CantorProfile
        cantorId={currentCantor.id}
        allMelodies={allMelodies}
        assignments={assignments}
        onAssign={assignMelody}
        onUpdateAssignment={updateAssignment}
        onRemoveAssignment={removeAssignment}
      />
    </div>
  );
}
