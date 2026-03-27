import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectorRoom {
  id: string;
  room_code: string;
  name: string;
  pin_hash: string | null;
  created_at: string;
  last_active_at: string;
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function useProjectorRooms() {
  const [rooms, setRooms] = useState<ProjectorRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    try {
      const result = await Promise.race([
        supabase
          .from('projector_rooms')
          .select('*')
          .order('last_active_at', { ascending: false }),
        new Promise<{ data: null }>(resolve =>
          setTimeout(() => resolve({ data: null }), 3000)
        ),
      ]);
      if (result.data) setRooms(result.data as unknown as ProjectorRoom[]);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const createRoom = useCallback(async (name: string, pin?: string): Promise<ProjectorRoom | null> => {
    const room_code = generateRoomCode();
    const pin_hash = pin ? await hashPin(pin) : null;
    try {
      const result = await Promise.race([
        supabase
          .from('projector_rooms')
          .insert({ room_code, name, pin_hash } as any)
          .select()
          .single(),
        new Promise<{ data: null; error: string }>(resolve =>
          setTimeout(() => resolve({ data: null, error: 'timeout' }), 5000)
        ),
      ]);
      if (!result.data) return null;
      const room = result.data as unknown as ProjectorRoom;
      setRooms(prev => [room, ...prev]);
      return room;
    } catch {
      return null;
    }
  }, []);

  const verifyPin = useCallback(async (room: ProjectorRoom, pin: string): Promise<boolean> => {
    if (!room.pin_hash) return true;
    const hash = await hashPin(pin);
    return hash === room.pin_hash;
  }, []);

  const deleteRoom = useCallback(async (id: string) => {
    await supabase.from('projector_rooms').delete().eq('id', id);
    setRooms(prev => prev.filter(r => r.id !== id));
  }, []);

  const touchRoom = useCallback(async (room_code: string) => {
    try {
      await Promise.race([
        supabase
          .from('projector_rooms')
          .update({ last_active_at: new Date().toISOString() } as any)
          .eq('room_code', room_code)
          .select(),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
    } catch {}
  }, []);

  return { rooms, loading, fetchRooms, createRoom, verifyPin, deleteRoom, touchRoom };
}
