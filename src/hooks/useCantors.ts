import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Cantor {
  id: string;
  name: string;
  pin: string;
  created_at: string;
}

/** A shared melody in the global library */
export interface Melody {
  id: string;
  melody_name: string;
  psalm_title: string | null;
  musicxml_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** A cantor's personal assignment (melody + preferred key + liturgical period) */
export interface CantorMelodyAssignment {
  id: string;
  cantor_id: string;
  melody_id: string;
  key: string | null;
  notes: string | null;
  liturgical_period: string | null;
  created_at: string;
  // joined
  melody?: Melody;
}

/** Legacy alias for compatibility */
export interface CantorMelody {
  id: string;
  cantor_id: string;
  psalm_title: string | null;
  melody_name: string;
  key: string | null;
  notes: string | null;
  musicxml_path: string | null;
  created_at: string;
}

export interface CantorSelection {
  id: string;
  cantor_id: string;
  melody_id: string | null;
  mass_date: string;
  mass_time: string | null;
  custom_melody: string | null;
  custom_key: string | null;
  psalm_title: string | null;
  status: string;
  created_at: string;
  // joined
  cantor_name?: string;
  melody_name?: string;
  melody_key?: string;
}

const CANTOR_SESSION_KEY = 'cantor_session';

export function useCantors() {
  const [currentCantor, setCurrentCantor] = useState<Cantor | null>(null);
  const [allMelodies, setAllMelodies] = useState<Melody[]>([]);
  const [assignments, setAssignments] = useState<CantorMelodyAssignment[]>([]);
  const [selections, setSelections] = useState<CantorSelection[]>([]);
  const [cantorHistory, setCantorHistory] = useState<CantorSelection[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem(CANTOR_SESSION_KEY);
    if (saved) {
      try { setCurrentCantor(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // Load shared melodies library
  const loadAllMelodies = useCallback(async () => {
    const { data } = await supabase
      .from('melodies')
      .select('*')
      .order('melody_name');
    setAllMelodies((data as unknown as Melody[]) ?? []);
  }, []);

  // Load cantor's assignments
  const loadAssignments = useCallback(async (cantorId: string) => {
    const { data } = await supabase
      .from('cantor_melody_assignments')
      .select('*')
      .eq('cantor_id', cantorId);

    if (!data || data.length === 0) {
      setAssignments([]);
      return;
    }

    // Join melody data
    const melodyIds = (data as any[]).map(a => a.melody_id);
    const { data: melodiesData } = await supabase
      .from('melodies')
      .select('*')
      .in('id', melodyIds);

    const melodyMap = Object.fromEntries((melodiesData ?? []).map((m: any) => [m.id, m]));

    const enriched: CantorMelodyAssignment[] = (data as any[]).map(a => ({
      ...a,
      melody: melodyMap[a.melody_id] as Melody | undefined,
    }));

    setAssignments(enriched);
  }, []);

  // Build flat "melodies" list for backward compat (CantorMassSelection)
  const melodies: CantorMelody[] = assignments
    .filter(a => a.melody)
    .map(a => ({
      id: a.melody_id,
      cantor_id: a.cantor_id,
      psalm_title: a.melody?.psalm_title ?? null,
      melody_name: a.melody?.melody_name ?? '',
      key: a.key,
      notes: a.notes ?? a.melody?.notes ?? null,
      musicxml_path: a.melody?.musicxml_path ?? null,
      created_at: a.melody?.created_at ?? a.created_at,
    }));

  useEffect(() => {
    loadAllMelodies();
  }, [loadAllMelodies]);

  useEffect(() => {
    if (currentCantor) loadAssignments(currentCantor.id);
  }, [currentCantor?.id, loadAssignments]);

  // Load pending selections count
  const loadPendingCount = useCallback(async () => {
    const { count } = await supabase
      .from('cantor_selections')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'confirmed']);
    setPendingCount(count ?? 0);
  }, []);

  useEffect(() => { loadPendingCount(); }, [loadPendingCount]);

  async function loginCantor(name: string, pin: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('cantor-auth', {
      body: { action: 'login', name, pin },
    });

    if (error) return { ok: false, error: 'Błąd połączenia' };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'Błąd logowania' };

    const cantor: Cantor = { ...data.cantor, pin: '***' };
    setCurrentCantor(cantor);
    localStorage.setItem(CANTOR_SESSION_KEY, JSON.stringify(cantor));
    return { ok: true };
  }

  async function registerCantor(name: string, pin: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('cantor-auth', {
      body: { action: 'register', name, pin },
    });

    if (error) return { ok: false, error: 'Błąd połączenia' };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'Błąd rejestracji' };

    const cantor: Cantor = { ...data.cantor, pin: '***' };
    setCurrentCantor(cantor);
    localStorage.setItem(CANTOR_SESSION_KEY, JSON.stringify(cantor));
    return { ok: true };
  }

  function logoutCantor() {
    setCurrentCantor(null);
    setAssignments([]);
    localStorage.removeItem(CANTOR_SESSION_KEY);
  }

  // ── Shared melody library ──

  async function addMelodyToLibrary(melody: { melody_name: string; psalm_title?: string | null; musicxml_path?: string | null; notes?: string | null; created_by?: string | null }): Promise<string | null> {
    const { data, error } = await supabase
      .from('melodies')
      .insert({
        melody_name: melody.melody_name,
        psalm_title: melody.psalm_title ?? null,
        musicxml_path: melody.musicxml_path ?? null,
        notes: melody.notes ?? null,
        created_by: melody.created_by ?? null,
      })
      .select('id')
      .single();

    if (error || !data) return null;
    await loadAllMelodies();
    return (data as any).id;
  }

  async function updateMelodyInLibrary(id: string, updates: Partial<Melody>) {
    const { error } = await supabase.from('melodies').update(updates).eq('id', id);
    if (!error) await loadAllMelodies();
    return !error;
  }

  async function deleteMelodyFromLibrary(id: string) {
    const { error } = await supabase.from('melodies').delete().eq('id', id);
    if (!error) await loadAllMelodies();
    return !error;
  }

  // ── Cantor assignments ──

  async function assignMelody(cantorId: string, melodyId: string, key?: string | null, notes?: string | null, liturgicalPeriod?: string | null) {
    const { error } = await supabase
      .from('cantor_melody_assignments')
      .upsert({
        cantor_id: cantorId,
        melody_id: melodyId,
        key: key ?? null,
        notes: notes ?? null,
        liturgical_period: liturgicalPeriod ?? null,
      } as any, { onConflict: 'cantor_id,melody_id' });
    if (!error) await loadAssignments(cantorId);
    return !error;
  }

  async function updateAssignment(id: string, updates: { key?: string | null; notes?: string | null; liturgical_period?: string | null }) {
    const { error } = await supabase.from('cantor_melody_assignments').update(updates as any).eq('id', id);
    if (!error && currentCantor) await loadAssignments(currentCantor.id);
    return !error;
  }

  async function removeAssignment(id: string) {
    const { error } = await supabase.from('cantor_melody_assignments').delete().eq('id', id);
    if (!error && currentCantor) await loadAssignments(currentCantor.id);
    return !error;
  }

  // ── Legacy compat: addMelody creates a shared melody + assigns to cantor ──
  async function addMelody(melody: Omit<CantorMelody, 'id' | 'created_at'>) {
    const melodyId = await addMelodyToLibrary({
      melody_name: melody.melody_name,
      psalm_title: melody.psalm_title,
      musicxml_path: melody.musicxml_path,
      notes: melody.notes,
      created_by: melody.cantor_id,
    });
    if (!melodyId) return false;
    return assignMelody(melody.cantor_id, melodyId, melody.key);
  }

  async function updateMelody(id: string, updates: Partial<CantorMelody>) {
    // Update melody in library
    const melodyUpdates: Partial<Melody> = {};
    if (updates.melody_name !== undefined) melodyUpdates.melody_name = updates.melody_name;
    if (updates.psalm_title !== undefined) melodyUpdates.psalm_title = updates.psalm_title;
    if (updates.musicxml_path !== undefined) melodyUpdates.musicxml_path = updates.musicxml_path;
    if (updates.notes !== undefined) melodyUpdates.notes = updates.notes;

    if (Object.keys(melodyUpdates).length > 0) {
      await updateMelodyInLibrary(id, melodyUpdates);
    }

    // Update key in assignment
    if (updates.key !== undefined && currentCantor) {
      const assignment = assignments.find(a => a.melody_id === id);
      if (assignment) {
        await updateAssignment(assignment.id, { key: updates.key });
      }
    }

    if (currentCantor) await loadAssignments(currentCantor.id);
    return true;
  }

  async function deleteMelody(id: string) {
    // Remove assignment first, then delete from library
    if (currentCantor) {
      const assignment = assignments.find(a => a.melody_id === id);
      if (assignment) {
        await removeAssignment(assignment.id);
      }
    }
    // Only delete from library if no other assignments exist
    const { count } = await supabase
      .from('cantor_melody_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('melody_id', id);

    if (count === 0) {
      await deleteMelodyFromLibrary(id);
    }
    return true;
  }

  // ── Selections ──

  async function submitSelection(sel: {
    cantor_id: string;
    melody_id?: string | null;
    mass_date: string;
    mass_time?: string;
    custom_melody?: string;
    custom_key?: string;
    psalm_title?: string;
  }) {
    const { error } = await supabase.from('cantor_selections').insert({
      cantor_id: sel.cantor_id,
      melody_id: sel.melody_id ?? null,
      mass_date: sel.mass_date,
      mass_time: sel.mass_time ?? null,
      custom_melody: sel.custom_melody ?? null,
      custom_key: sel.custom_key ?? null,
      psalm_title: sel.psalm_title ?? null,
      status: 'pending',
    });
    if (!error) {
      await loadPendingCount();
      if (currentCantor) await loadCantorHistory(currentCantor.id);
    }
    return !error;
  }

  async function loadSelections() {
    const { data } = await supabase
      .from('cantor_selections')
      .select('*')
      .order('mass_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!data) { setSelections([]); return; }

    const cantorIds = [...new Set((data as any[]).map(d => d.cantor_id))];
    const melodyIds = [...new Set((data as any[]).filter(d => d.melody_id).map(d => d.melody_id))];

    const [cantorsRes, melodiesRes] = await Promise.all([
      supabase.from('cantors').select('id, name').in('id', cantorIds),
      melodyIds.length > 0
        ? supabase.from('melodies').select('id, melody_name').in('id', melodyIds)
        : Promise.resolve({ data: [] }),
    ]);

    const cantorMap = Object.fromEntries((cantorsRes.data ?? []).map((c: any) => [c.id, c.name]));
    const melodyMap = Object.fromEntries((melodiesRes.data ?? []).map((m: any) => [m.id, m]));

    const enriched: CantorSelection[] = (data as any[]).map(s => ({
      ...s,
      cantor_name: cantorMap[s.cantor_id] ?? '?',
      melody_name: s.melody_id ? melodyMap[s.melody_id]?.melody_name : s.custom_melody,
      melody_key: s.custom_key ?? null,
    }));

    setSelections(enriched);
  }

  async function markSeen(id: string) {
    await supabase.from('cantor_selections').update({ status: 'seen' }).eq('id', id);
    await Promise.all([loadSelections(), loadPendingCount()]);
  }

  async function markAllSeen() {
    await supabase.from('cantor_selections').update({ status: 'seen' }).in('status', ['pending', 'confirmed']);
    await Promise.all([loadSelections(), loadPendingCount()]);
  }

  // ── Cantor history ──

  const loadCantorHistory = useCallback(async (cantorId: string) => {
    const { data } = await supabase
      .from('cantor_selections')
      .select('*')
      .eq('cantor_id', cantorId)
      .order('mass_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!data) { setCantorHistory([]); return; }

    const melodyIds = [...new Set((data as any[]).filter(d => d.melody_id).map(d => d.melody_id))];
    const melodiesRes = melodyIds.length > 0
      ? await supabase.from('melodies').select('id, melody_name').in('id', melodyIds)
      : { data: [] };

    const melodyMap = Object.fromEntries((melodiesRes.data ?? []).map((m: any) => [m.id, m]));

    const enriched: CantorSelection[] = (data as any[]).map(s => ({
      ...s,
      melody_name: s.melody_id ? melodyMap[s.melody_id]?.melody_name : s.custom_melody,
      melody_key: s.custom_key ?? null,
    }));

    setCantorHistory(enriched);
  }, []);

  useEffect(() => {
    if (currentCantor) loadCantorHistory(currentCantor.id);
  }, [currentCantor?.id, loadCantorHistory]);

  // ── Admin functions ──

  const [allCantors, setAllCantors] = useState<Cantor[]>([]);

  async function loadAllCantors() {
    const { data } = await supabase.from('cantors').select('id, name, created_at').order('name');
    setAllCantors((data as unknown as Cantor[]) ?? []);
  }

  async function addCantorAdmin(name: string, pin: string) {
    const { data, error } = await supabase.functions.invoke('cantor-auth', {
      body: { action: 'register', name, pin },
    });
    if (!data?.ok) return false;
    await loadAllCantors();
    return true;
  }

  async function deleteCantorAdmin(id: string) {
    const { error } = await supabase.from('cantors').delete().eq('id', id);
    if (!error) await loadAllCantors();
    return !error;
  }

  async function resetPinAdmin(id: string, newPin: string) {
    const { data, error } = await supabase.functions.invoke('cantor-auth', {
      body: { action: 'reset_pin', cantor_id: id, new_pin: newPin },
    });
    if (!data?.ok) return false;
    await loadAllCantors();
    return true;
  }

  return {
    currentCantor,
    melodies,
    allMelodies,
    assignments,
    selections,
    cantorHistory,
    pendingCount,
    allCantors,
    loginCantor,
    registerCantor,
    logoutCantor,
    addMelody,
    updateMelody,
    deleteMelody,
    addMelodyToLibrary,
    updateMelodyInLibrary,
    deleteMelodyFromLibrary,
    assignMelody,
    updateAssignment,
    removeAssignment,
    submitSelection,
    loadSelections,
    markSeen,
    markAllSeen,
    loadPendingCount,
    loadCantorHistory,
    loadAllCantors,
    addCantorAdmin,
    deleteCantorAdmin,
    resetPinAdmin,
  };
}
