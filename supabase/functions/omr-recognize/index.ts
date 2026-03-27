import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `You are an expert music transcription assistant specializing in Optical Music Recognition (OMR).

Your task: Analyze the provided image of sheet music and produce a valid, well-formed MusicXML document that accurately represents the MELODY ONLY (no lyrics).

Requirements:
1. Output ONLY the MusicXML content — no markdown, no explanations, no code fences.
2. Start with <?xml version="1.0" encoding="UTF-8"?> and use score-partwise format.
3. Accurately capture:
   - Key signature (fifths)
   - Time signature (beats, beat-type)
   - Clef (treble/bass)
   - All notes with correct pitch (step, alter, octave), duration, and type
   - Rests with correct duration and type
   - Tied notes, dots, accidentals
   - Chord symbols if present (as <harmony> elements)
   - Dynamics and articulations if clearly visible
4. DO NOT include <lyric> elements — capture melody/notes only.
5. Use divisions=2 for eighth-note resolution or divisions=4 for sixteenth-note resolution.
6. Include a <work-title> element with the title if visible in the image.
7. If the image is unclear, make your best musical judgment.
8. Ensure the output is valid XML that can be parsed by any MusicXML reader.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { image_base64, image_url, mime_type } = await req.json();

    if (!image_base64 && !image_url) {
      return new Response(
        JSON.stringify({ error: 'Provide image_base64 or image_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the image content part
    const imageContent = image_base64
      ? {
          type: "image_url" as const,
          image_url: {
            url: `data:${mime_type || 'image/jpeg'};base64,${image_base64}`,
          },
        }
      : {
          type: "image_url" as const,
          image_url: { url: image_url },
        };

    console.log("Calling Gemini 2.5 Pro for OMR analysis...");

    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              imageContent,
              {
                type: 'text',
                text: 'Please transcribe this sheet music into MusicXML format. Include all notes, rhythms, key/time signatures, lyrics, and chord symbols visible in the image.',
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`AI Gateway error [${response.status}]:`, errorBody);
      throw new Error(`AI Gateway returned ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    let musicxml = data.choices?.[0]?.message?.content ?? '';

    // Clean up: strip markdown fences if present
    musicxml = musicxml
      .replace(/^```(?:xml|musicxml)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();

    // Validate it starts with XML declaration
    if (!musicxml.startsWith('<?xml')) {
      // Try to find XML content within the response
      const xmlStart = musicxml.indexOf('<?xml');
      if (xmlStart >= 0) {
        musicxml = musicxml.substring(xmlStart);
      } else {
        throw new Error('AI did not return valid MusicXML');
      }
    }

    // Extract title from MusicXML
    const titleMatch = musicxml.match(/<work-title>(.*?)<\/work-title>/);
    const title = titleMatch?.[1] ?? 'Rozpoznana melodia';

    console.log(`OMR success: "${title}", ${musicxml.length} chars`);

    return new Response(
      JSON.stringify({ musicxml, title }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('OMR error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
