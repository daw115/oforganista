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
    const body = await req.json();
    const { targetUrl, method, payload } = body;

    if (!targetUrl || typeof targetUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing targetUrl' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow HTTP requests to private/local IPs (LAN)
    const urlObj = new URL(targetUrl);
    if (urlObj.protocol !== 'http:') {
      return new Response(JSON.stringify({ error: 'Only HTTP URLs allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    };

    if (payload && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(payload);
    }

    const res = await fetch(targetUrl, fetchOptions);
    
    let responseBody: string;
    const contentType = res.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const json = await res.json();
      responseBody = JSON.stringify(json);
    } else {
      responseBody = await res.text();
      try {
        JSON.parse(responseBody);
      } catch {
        responseBody = JSON.stringify({ text: responseBody });
      }
    }

    return new Response(responseBody, {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown proxy error';
    console.error('OpenLP proxy error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
