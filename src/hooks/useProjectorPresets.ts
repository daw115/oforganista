import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectorSettings } from '@/lib/projectorSettings';

export interface ProjectorPreset {
  id: string;
  name: string;
  room_code: string | null;
  settings: ProjectorSettings;
  is_default: boolean;
  created_at: string;
}

export function useProjectorPresets(roomCode?: string) {
  const [presets, setPresets] = useState<ProjectorPreset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await Promise.race([
        supabase
          .from('projector_presets')
          .select('*')
          .order('is_default', { ascending: false })
          .order('name'),
        new Promise<{ data: null; error: string }>(resolve =>
          setTimeout(() => resolve({ data: null, error: 'timeout' }), 3000)
        ),
      ]);
      if (result.data) {
        setPresets(result.data.map((d: any) => ({
          ...d,
          settings: d.settings as unknown as ProjectorSettings,
        })));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const savePreset = useCallback(async (name: string, settings: ProjectorSettings, isDefault = false) => {
    // If marking as default, clear other defaults first
    if (isDefault) {
      await supabase
        .from('projector_presets')
        .update({ is_default: false, updated_at: new Date().toISOString() } as any)
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('projector_presets')
      .insert({
        name,
        room_code: roomCode || null,
        settings: settings as any,
        is_default: isDefault,
      })
      .select()
      .single();

    if (!error && data) {
      await fetchPresets();
      return data;
    }
    return null;
  }, [roomCode, fetchPresets]);

  const updatePreset = useCallback(async (id: string, settings: ProjectorSettings) => {
    await supabase
      .from('projector_presets')
      .update({ settings: settings as any, updated_at: new Date().toISOString() } as any)
      .eq('id', id);
    await fetchPresets();
  }, [fetchPresets]);

  const setAsDefault = useCallback(async (id: string) => {
    await supabase
      .from('projector_presets')
      .update({ is_default: false, updated_at: new Date().toISOString() } as any)
      .eq('is_default', true);
    await supabase
      .from('projector_presets')
      .update({ is_default: true, updated_at: new Date().toISOString() } as any)
      .eq('id', id);
    await fetchPresets();
  }, [fetchPresets]);

  const deletePreset = useCallback(async (id: string) => {
    await supabase.from('projector_presets').delete().eq('id', id);
    await fetchPresets();
  }, [fetchPresets]);

  const getDefaultPreset = useCallback(() => {
    return presets.find(p => p.is_default) || null;
  }, [presets]);

  return { presets, loading, fetchPresets, savePreset, updatePreset, setAsDefault, deletePreset, getDefaultPreset };
}
