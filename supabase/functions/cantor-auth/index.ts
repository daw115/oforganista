import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Simple constant-time comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do work to avoid timing leak on length
    let result = 1;
    for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ a.charCodeAt(i);
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + ':' + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { action, name, pin, cantor_id, new_pin } = await req.json();

    if (action === 'login') {
      if (!name || !pin) {
        return new Response(JSON.stringify({ ok: false, error: 'Brak nazwy lub PINu' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: cantor, error } = await supabase
        .from('cantors')
        .select('id, name, pin, created_at')
        .eq('name', name)
        .maybeSingle();

      if (error) throw error;
      if (!cantor) {
        return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const storedPin = cantor.pin;
      let valid = false;

      if (storedPin.includes(':')) {
        // Hashed format: salt:hash
        const [salt, hash] = storedPin.split(':');
        const computedHash = await hashPin(pin, salt);
        valid = timingSafeEqual(computedHash, hash);
      } else {
        // Legacy plaintext - verify and upgrade
        valid = timingSafeEqual(storedPin, pin);
        if (valid) {
          // Upgrade to hashed
          const salt = generateSalt();
          const hash = await hashPin(pin, salt);
          await supabase
            .from('cantors')
            .update({ pin: `${salt}:${hash}` })
            .eq('id', cantor.id);
        }
      }

      if (!valid) {
        return new Response(JSON.stringify({ ok: false, error: 'Nieprawidłowy PIN' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        cantor: { id: cantor.id, name: cantor.name, created_at: cantor.created_at },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'register') {
      if (!name || !pin) {
        return new Response(JSON.stringify({ ok: false, error: 'Brak nazwy lub PINu' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (pin.length < 4) {
        return new Response(JSON.stringify({ ok: false, error: 'PIN musi mieć minimum 4 znaki' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if name exists
      const { data: existing } = await supabase
        .from('cantors')
        .select('id')
        .eq('name', name)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ ok: false, error: 'Kantor o tej nazwie już istnieje' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const salt = generateSalt();
      const hash = await hashPin(pin, salt);

      const { data: cantor, error } = await supabase
        .from('cantors')
        .insert({ name, pin: `${salt}:${hash}` })
        .select('id, name, created_at')
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, cantor }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reset_pin') {
      if (!cantor_id || !new_pin) {
        return new Response(JSON.stringify({ ok: false, error: 'Brak danych' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const salt = generateSalt();
      const hash = await hashPin(new_pin, salt);

      const { error } = await supabase
        .from('cantors')
        .update({ pin: `${salt}:${hash}` })
        .eq('id', cantor_id);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
