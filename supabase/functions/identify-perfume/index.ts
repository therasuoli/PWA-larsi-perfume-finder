// Larsi Perfume Finder — Edge Function: identify-perfume (v7.8.2)
//
// AI-powered perfume identification using Z.ai GLM Vision model.
// The image is received as base64, processed by the AI, and DISCARDED.
// The image is NEVER stored in Supabase Storage or the database.
//
// ENVIRONMENT (set as Supabase secrets):
//   ZAI_API_KEY   — JWT token from Z.ai (https://chat.z.ai)
//   ZAI_BASE_URL  — Z.ai API base URL (default: https://internal-api.z.ai/v1)

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

// ─── Z.ai Vision API ────────────────────────────────────────────────────
// Z.ai SDK uses:  baseUrl + "/chat/completions/vision"
// with headers: Authorization: Bearer <token>, X-Token: <token>
async function callZAI(base64Image, mimeType, catalogueHints) {
  const token = Deno.env.get('ZAI_API_KEY');
  if (!token) throw new Error('ZAI_API_KEY not configured');

  const baseUrl = Deno.env.get('ZAI_BASE_URL') || 'https://internal-api.z.ai/v1';

  const prompt = `You are a perfume expert. Look at this image of a perfume bottle and identify it.
Return your answer as JSON with these fields:
- brand: the brand name (e.g. "Dior", "Creed", "Chanel")
- name: the perfume name (e.g. "Sauvage", "Aventus", "Bleu de Chanel")
- notes: an array of fragrance notes you can identify (top/heart/base)
- accords: an array of main accords (e.g. "woody", "fresh", "citrus")
- confidence: a number 0-100 indicating how confident you are
- description: a brief description of what you see

${catalogueHints && catalogueHints.length > 0
    ? `Here are some perfumes from our database that might match. Try to match against these if possible:\n${catalogueHints.slice(0, 150).map(p => `- ${p.brand} ${p.name}`).join('\n')}`
    : ''
}

Respond ONLY with valid JSON, no markdown.`;

  // The Z.ai SDK uses "/chat/completions/vision" for vision requests
  const url = `${baseUrl}/chat/completions/vision`;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Token': token,
  };

  // The SDK sends: model, messages, max_tokens, temperature
  // For vision, the message content includes image_url
  const body = JSON.stringify({
    model: 'glm-4v',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.1,
  });

  console.log('Calling Z.ai vision API at:', url);

  const res = await fetch(url, { method: 'POST', headers, body });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Z.ai API error:', res.status, errText.slice(0, 500));

    // Retry with a different model name
    if (res.status === 400 || res.status === 404) {
      console.log('Retrying with glm-5.3-flash...');
      const retryBody = JSON.stringify({
        model: 'glm-5.3-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
            ],
          },
        ],
        max_tokens: 800,
        temperature: 0.1,
      });

      const retryRes = await fetch(url, { method: 'POST', headers, body: retryBody });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryContent = retryData.choices?.[0]?.message?.content || '';
        console.log('Retry succeeded, content length:', retryContent.length);
        return parseAIResponse(retryContent);
      }
      const retryErr = await retryRes.text();
      console.error('Retry failed:', retryRes.status, retryErr.slice(0, 200));
    }
    throw new Error(`Z.ai API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  console.log('Z.ai response received, content length:', content.length);
  return parseAIResponse(content);
}

function parseAIResponse(content) {
  try {
    const clean = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(clean);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    return {
      brand: null,
      name: null,
      notes: [],
      accords: [],
      confidence: 30,
      description: content.slice(0, 300),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  try {
    const body = await req.json();
    const { image, mimeType, catalogue } = body;

    if (!image) return json({ error: 'no-image' }, 400);
    if (image.length > 8 * 1024 * 1024) return json({ error: 'image-too-large' }, 413);

    const catalogueHints = Array.isArray(catalogue) ? catalogue : [];
    const result = await callZAI(image, mimeType || 'image/jpeg', catalogueHints);

    return json({ ok: true, ...result });
  } catch (e) {
    console.error('identify-perfume error:', e.message);
    return json({ error: e.message || 'unknown-error' }, 500);
  }
});
