/**
 * MusicamSacram.pl proxy — uses Lovable Cloud edge function
 * to fetch pages server-side with session cookie.
 */

import { supabase } from '@/integrations/supabase/client';

export async function fetchMusicamSacramAuthenticated(url: string): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('musicam-proxy', {
      body: { url },
    });

    if (error) throw error;
    if (data?.html && data.html.trim().length > 200) {
      const tabCount = (data.html.match(/class="tab-pane/g) || []).length;
      console.log(`[MusicamProxy] Edge function OK, ${tabCount} tab(s) found`);
      return data.html;
    }
  } catch (err) {
    console.warn('[MusicamProxy] Edge function failed, falling back to CORS proxy:', err);
  }

  // Fallback to CORS proxy (unauthenticated)
  return fetchViaCorsProxy(url);
}

async function fetchViaCorsProxy(url: string): Promise<string> {
  const sources = [
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  for (const proxyUrl of sources) {
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trim().length > 200) return text;
    } catch { /* try next */ }
  }
  throw new Error('Nie udało się pobrać danych z musicamsacram.pl');
}
