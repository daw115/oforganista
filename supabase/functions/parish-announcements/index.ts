import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SOURCE_URL = "http://ofiarowaniepanskie.pl/ogloszenia-parafialne";

// Day markers must be followed by colon/dash or end-of-string, NOT a date (digit)
const SECTION_PATTERNS = [
  { key: "today", regex: /^dzisiaj\s*[:\-–—]\s*/i },
  { key: "mon", regex: /^w\s+poniedzia[łl]ek\s*[:\-–—]\s*/i },
  { key: "tue", regex: /^we?\s+wtorek\s*[:\-–—]\s*/i },
  { key: "wed", regex: /^we?\s+[śs]rod[ęea]\s*[:\-–—]\s*/i },
  { key: "thu", regex: /^we?\s+czwartek\s*[:\-–—]\s*/i },
  { key: "fri", regex: /^w\s+pi[aą]tek\s*[:\-–—]\s*/i },
  { key: "sat", regex: /^w\s+sobot[ęea]\s*[:\-–—]\s*/i },
  { key: "nextsun", regex: /^w\s+przysz[łl][aą]\s+niedziel[ęea]\s*[:\-–—]\s*/i },
];

// Check if line is a day section header (not a date-specific mention like "W środę 18 marca")
function isDaySectionMarker(line: string): { key: string; regex: RegExp } | undefined {
  const marker = SECTION_PATTERNS.find((p) => p.regex.test(line));
  if (!marker) return undefined;
  // Reject if the text after the day name starts with a digit (date reference)
  const afterDay = line.replace(marker.regex, "").trim();
  if (/^\d/.test(afterDay)) return undefined;
  return marker;
}

function decodeHtmlEntities(text: string): string {
  return (text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&bdquo;/gi, "„")
    .replace(/&rdquo;/gi, "\u201D")
    .replace(/&ldquo;/gi, "\u201C")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&rsquo;/gi, "\u2019")
    .replace(/&lsquo;/gi, "\u2018")
    .replace(/&oacute;/gi, "ó")
    .replace(/&eacute;/gi, "é")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

function htmlToLines(html: string): string[] {
  // Remove script and style tags entirely
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const withBreaks = cleaned
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
    .replace(/<strong>/gi, "")
    .replace(/<\/strong>/gi, "");
  const plain = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "));
  return plain
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeLink(href: string): string {
  try {
    return new URL(href, SOURCE_URL).toString();
  } catch {
    return "";
  }
}

interface Post {
  url: string;
  title: string;
  date: Date | null;
}

function pickAnnouncementUrl(listHtml: string): Post[] {
  const posts: Post[] = [];
  const re = /<a[^>]*href=["']([^"']+)["'][^>]*>\s*<h2[^>]*class=["'][^"']*tytul[^"']*["'][^>]*>([\s\S]*?)<\/h2>\s*<\/a>/gi;
  for (const m of listHtml.matchAll(re)) {
    const url = normalizeLink(m[1]);
    const title = decodeHtmlEntities((m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const dm = title.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    const date = dm
      ? new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]), 12, 0, 0)
      : null;
    if (url) posts.push({ url, title, date });
  }
  return posts;
}

function pickPostForDate(posts: Post[], targetDate?: string): Post {
  const fallback = { url: SOURCE_URL, title: "Ogłoszenia parafialne", date: null };
  if (!posts || posts.length === 0) return fallback;
  if (!targetDate) return posts[0];
  const target = new Date(targetDate);
  target.setHours(12, 0, 0, 0);
  const dated = posts.filter((p) => p.date instanceof Date && !Number.isNaN(p.date.getTime()));
  if (dated.length === 0) return posts[0];
  dated.sort((a, b) => b.date!.getTime() - a.date!.getTime());
  const exactOrPast = dated.find((p) => p.date!.getTime() <= target.getTime());
  return exactOrPast || dated[dated.length - 1];
}

function extractMainHtml(html: string): string {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0];
  if (article) return article;
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0];
  if (main) return main;
  const content = html.match(/<div[^>]*class=["'][^"']*(entry-content|post-content|content)[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0];
  if (content) return content;
  return html;
}

function extractTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) return decodeHtmlEntities(h1.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (t) return decodeHtmlEntities(t.replace(/\s+/g, " ").trim());
  return "Ogłoszenia parafialne";
}

function parseSections(lines: string[]) {
  const sections: Record<string, string[]> = {
    today: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], nextsun: [],
  };
  const extras: string[] = [];
  let current: string | null = null;
  let seenFirstMarker = false;
  let nextSunCaptured = false;
  let pendingLine = "";

  function flushPending() {
    if (pendingLine) {
      extras.push(pendingLine.trim());
      pendingLine = "";
    }
  }

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    const marker = isDaySectionMarker(line);
    if (marker) {
      flushPending();
      seenFirstMarker = true;
      current = marker.key;
      if (current === "nextsun") nextSunCaptured = false;
      const rest = line.replace(marker.regex, "").trim();
      if (rest) {
        if (current === "nextsun") {
          sections.nextsun.push(rest);
          nextSunCaptured = true;
        } else {
          sections[current].push(rest);
        }
      }
      continue;
    }

    if (!seenFirstMarker) continue;

    if (current === "nextsun") {
      flushPending();
      if (!nextSunCaptured) {
        sections.nextsun.push(line);
        nextSunCaptured = true;
      } else {
        extras.push(line);
      }
      continue;
    }

    if (current && sections[current]) {
      sections[current].push(line);
    } else {
      // Join broken lines: if pending line ends without sentence-ending punctuation, append current line
      const endsWithSentenceBreak = /[.!?…]$/.test(pendingLine) || /[.!?…]['"\u201D\u2019]$/.test(pendingLine);
      const startsWithLowercase = /^[a-ząćęłńóśźż]/.test(line);
      
      if (pendingLine && !endsWithSentenceBreak && (startsWithLowercase || pendingLine.length < 50)) {
        pendingLine += " " + line;
      } else {
        if (pendingLine) extras.push(pendingLine.trim());
        pendingLine = line;
      }
    }
  }
  
  flushPending();

  const out: Record<string, string> = {};
  for (const key of Object.keys(sections)) {
    const value = sections[key].join("\n").trim();
    if (value) out[key] = value;
  }
  return {
    sections: out,
    extraAnnouncements: extras.filter((l) => l.length > 2).slice(0, 80),
  };
}

function getSelectedKey(sundayDate: Date | null, targetDate?: string): string | null {
  if (!sundayDate || !targetDate) return null;
  const s = new Date(sundayDate);
  const t = new Date(targetDate);
  s.setHours(12, 0, 0, 0);
  t.setHours(12, 0, 0, 0);
  const diff = Math.round((t.getTime() - s.getTime()) / 86400000);
  if (diff < 0 || diff > 7) return null;
  const map = ["today", "mon", "tue", "wed", "thu", "fri", "sat", "nextsun"];
  return map[diff] || null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const qDate = url.searchParams.get("date") || undefined;

    const listRes = await fetch(SOURCE_URL, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const listHtml = await listRes.text();
    const posts = pickAnnouncementUrl(listHtml);
    const selected = pickPostForDate(posts, qDate);
    const postUrl = selected.url;
    const postRes = await fetch(postUrl, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!postRes.ok) throw new Error(`HTTP ${postRes.status}`);
    const postHtml = await postRes.text();
    const mainHtml = extractMainHtml(postHtml);
    const lines = htmlToLines(mainHtml);
    const parsed = parseSections(lines);
    const sundayDate = selected?.date
      ? new Date(selected.date.getFullYear(), selected.date.getMonth(), selected.date.getDate(), 12, 0, 0)
      : null;
    const selectedKey = getSelectedKey(sundayDate, qDate);
    const selectedAnnouncement = selectedKey ? (parsed.sections[selectedKey] || "") : "";

    return new Response(
      JSON.stringify({
        title: extractTitle(postHtml),
        sourceUrl: postUrl,
        fetchedAt: new Date().toISOString(),
        sundayDate: sundayDate ? sundayDate.toISOString() : null,
        sections: parsed.sections,
        selectedDayKey: selectedKey,
        selectedAnnouncement,
        extraAnnouncements: parsed.extraAnnouncements,
      }),
      {
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Błąd pobierania ogłoszeń",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
      }
    );
  }
});
