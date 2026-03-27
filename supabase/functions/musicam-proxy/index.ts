const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

let sessionCookies: string | null = null;
let sessionExpires = 0;

function extractCookies(headers: Headers): string {
  const cookies: string[] = [];
  const setCookieHeaders = headers.getSetCookie?.() || [];

  for (const header of setCookieHeaders) {
    const nameValue = header.split(';')[0];
    if (nameValue) cookies.push(nameValue.trim());
  }

  if (cookies.length === 0) {
    const raw = headers.get('set-cookie') || '';
    if (raw) {
      const parts = raw.split(/,(?=[^ ])/);
      for (const part of parts) {
        const nameValue = part.split(';')[0];
        if (nameValue) cookies.push(nameValue.trim());
      }
    }
  }

  return cookies.join('; ');
}

function mergeCookies(existing: string, incoming: string): string {
  const map = new Map<string, string>();

  for (const c of existing.split('; ').filter(Boolean)) {
    const [name] = c.split('=');
    if (name) map.set(name, c);
  }

  for (const c of incoming.split('; ').filter(Boolean)) {
    const [name] = c.split('=');
    if (name) map.set(name, c);
  }

  return Array.from(map.values()).join('; ');
}

function getCookieValue(cookieHeader: string, cookieName: string): string {
  for (const pair of cookieHeader.split('; ').filter(Boolean)) {
    const [name, ...rest] = pair.split('=');
    if (name === cookieName) return rest.join('=');
  }
  return '';
}

async function login(): Promise<string> {
  const now = Date.now();
  if (sessionCookies && now < sessionExpires) return sessionCookies;

  const email = Deno.env.get('MUSICAMSACRAM_EMAIL');
  const password = Deno.env.get('MUSICAMSACRAM_PASSWORD');
  if (!email || !password) throw new Error('Missing MUSICAMSACRAM credentials');

  const loginPageRes = await fetch('https://musicamsacram.pl/logowanie', {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pl,en-US;q=0.8,en;q=0.6',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });

  const loginPageHtml = await loginPageRes.text();
  const pageCookies = extractCookies(loginPageRes.headers);

  const csrfMatch =
    loginPageHtml.match(/name="_token"\s+value="([^"]+)"/i) ||
    loginPageHtml.match(/value="([^"]+)"\s+name="_token"/i) ||
    loginPageHtml.match(/name="csrf-token"\s+content="([^"]+)"/i);
  const csrfToken = csrfMatch?.[1] || '';

  const xsrfEncoded = getCookieValue(pageCookies, 'XSRF-TOKEN');
  const xsrfToken = xsrfEncoded ? decodeURIComponent(xsrfEncoded) : '';

  const body = new URLSearchParams({
    email,
    password,
    remember: 'on',
  });
  if (csrfToken) body.set('_token', csrfToken);

  const loginRes = await fetch('https://musicamsacram.pl/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': pageCookies,
      'Referer': 'https://musicamsacram.pl/logowanie',
      'Origin': 'https://musicamsacram.pl',
      ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const loginHtml = await loginRes.text();
  const loginCookies = extractCookies(loginRes.headers);
  const allCookies = mergeCookies(pageCookies, loginCookies);
  const status = loginRes.status;
  const location = loginRes.headers.get('location') || '';

  console.log(`[Login] POST status=${status} location=${location || '-'} cookies=${loginCookies || '-'}`);

  if (status === 200 && /E-mail lub login|Przypomnij hasło|Logowanie/i.test(loginHtml)) {
    throw new Error('Login rejected (still on login form)');
  }

  if ((status === 301 || status === 302) && /\/logowanie/i.test(location)) {
    throw new Error('Login rejected (redirected back to /logowanie)');
  }

  if (status !== 200 && status !== 301 && status !== 302) {
    throw new Error(`Login failed with status ${status}`);
  }

  const redirectUrl = location || 'https://musicamsacram.pl/';
  const finalRes = await fetch(redirectUrl.startsWith('/') ? `https://musicamsacram.pl${redirectUrl}` : redirectUrl, {
    headers: {
      'Cookie': allCookies,
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'manual',
  });
  await finalRes.text();

  const finalCookies = mergeCookies(allCookies, extractCookies(finalRes.headers));
  sessionCookies = finalCookies;
  sessionExpires = now + 15 * 60 * 1000;

  console.log(`[Login] status=${status}, cookies=${finalCookies.split('; ').length}`);
  return finalCookies;
}

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
    if (!url || !url.startsWith('https://musicamsacram.pl/')) {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let cookies = '';
    let loginOk = false;
    try {
      cookies = await login();
      loginOk = Boolean(cookies);
    } catch (e) {
      console.error('[Login] Failed:', e);
    }

    const res = await fetch(url, {
      headers: {
        'Cookie': cookies,
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });

    const html = res.ok ? await res.text() : '';
    const tabCount = (html.match(/class="tab-pane/g) || []).length;
    const gatedCount = (html.match(/Zaloguj się[\s\S]{0,80}móc przeglądać te materiały/gi) || []).length;
    const hasLoginForm = /E-mail lub login|Przypomnij hasło|<form[^>]+action="https:\/\/musicamsacram\.pl\/login"/i.test(html);
    const hasOccasionalHint = /mszach okolicznościowych|msze-okolicznosciowe/i.test(html);

    console.log(`[Fetch] loginOk=${loginOk} status=${res.status} tabs=${tabCount} gated=${gatedCount} form=${hasLoginForm} occasion=${hasOccasionalHint}`);

    return new Response(JSON.stringify({ html, tabCount, gatedCount, loginOk, hasLoginForm, hasOccasionalHint }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
