import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify caller has a valid API key / JWT
  const authHeader = req.headers.get('Authorization');
  const apiKey = req.headers.get('apikey');
  if (!authHeader && !apiKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { url } = await req.json();
    if (!url || (!url.startsWith('https://brewiarz.pl/') && !url.startsWith('https://www.brewiarz.pl/'))) {
      return new Response(JSON.stringify({ error: 'Invalid URL — only brewiarz.pl allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl,en-US;q=0.8,en;q=0.6',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Upstream HTTP ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle encoding — brewiarz.pl may serve ISO-8859-2
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || '').toLowerCase();

    const utf8 = new TextDecoder('utf-8').decode(bytes);
    const iso = new TextDecoder('iso-8859-2').decode(bytes);

    const score = (txt: string) => {
      const replacement = (txt.match(/\uFFFD/g) || []).length;
      const mojibake = (txt.match(/[ÃÅÄ]/g) || []).length;
      const polish = (txt.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g) || []).length;
      return replacement * 10 + mojibake * 3 - polish;
    };

    let html: string;
    if (ct.includes('iso-8859-2')) {
      html = iso;
    } else if (ct.includes('utf-8')) {
      html = utf8;
    } else {
      html = score(utf8) <= score(iso) ? utf8 : iso;
    }

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
