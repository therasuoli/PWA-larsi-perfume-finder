// Larsi Perfume Finder — Edge Function: identify-perfume (v7.8)
//
// AI-powered perfume identification from a photo.
// The image is received as base64, processed by a vision model, and DISCARDED.
// The image is NEVER stored in Supabase Storage or the database.
//
// DEPLOY:
//   supabase functions deploy identify-perfume --no-verify-jwt
//
// ENVIRONMENT (set in Supabase Dashboard → Edge Functions → Secrets):
//   VISION_API_KEY   — API key for the vision model (e.g. OpenAI, Google, HuggingFace)
//   VISION_PROVIDER   — "openai" | "google" | "huggingface" | "custom" (default: "openai")
//   VISION_API_URL    — custom vision API URL (if provider="custom")
//
// REQUEST:
//   POST { image: "<base64>", mimeType: "image/jpeg", catalogue: [{brand, name}, ...] }
//
// RESPONSE:
//   200 { ok: true, brand: "Dior", name: "Sauvage", notes: [...], confidence: 85 }
//   200 { ok: true, brand: null, name: null, description: "Could not identify" }
//   500 { error: "..." }

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store', // Important: never cache image responses
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

// ─── Vision API providers ──────────────────────────────────────────────────

/**
 * Calls OpenAI GPT-4 Vision API to identify the perfume in the image.
 * Requires VISION_API_KEY to be set.
 */
async function callOpenAI(base64Image, mimeType, catalogueHints) {
  const apiKey = Deno.env.get('VISION_API_KEY');
  if (!apiKey) throw new Error('VISION_API_KEY not configured');

  const prompt = `You are a perfume expert. Look at this image of a perfume bottle and identify it.
Return your answer as JSON with these fields:
- brand: the brand name (e.g. "Dior", "Creed", "Chanel")
- name: the perfume name (e.g. "Sauvage", "Aventus", "Bleu de Chanel")
- notes: an array of fragrance notes you can identify (top/heart/base)
- accords: an array of main accords (e.g. "woody", "fresh", "citrus")
- confidence: a number 0-100 indicating how confident you are
- description: a brief description of what you see

${catalogueHints && catalogueHints.length > 0
    ? `Here are some perfumes from our database that might match. Try to match against these if possible:\n${catalogueHints.slice(0, 100).map(p => `- ${p.brand} ${p.name}`).join('\n')}`
    : ''
}

Respond ONLY with valid JSON, no markdown.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Try to parse JSON from the response
  try {
    // Remove markdown code fences if present
    const clean = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(clean);
  } catch {
    // If JSON parsing fails, return what we can
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

/**
 * Calls Google Cloud Vision API (Object Localization + Logo Recognition).
 * Requires VISION_API_KEY (Google API key).
 */
async function callGoogle(base64Image, mimeType) {
  const apiKey = Deno.env.get('VISION_API_KEY');
  if (!apiKey) throw new Error('VISION_API_KEY not configured');

  // Use Google Vision API for logo detection + label detection
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [
            { type: 'LOGO_DETECTION', maxResults: 5 },
            { type: 'LABEL_DETECTION', maxResults: 10 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
          ],
        }],
      }),
    }
  );

  if (!res.ok) throw new Error(`Google Vision API error ${res.status}`);

  const data = await res.json();
  const annotations = data.responses?.[0] || {};

  // Extract brand from logo detection
  const logos = annotations.logoAnnotations || [];
  const labels = annotations.labelAnnotations || [];
  const texts = annotations.textAnnotations || [];

  // Try to identify brand from logos
  const brand = logos[0]?.description || null;

  // Try to extract perfume name from text
  let name = null;
  if (texts.length > 1) {
    // The first text annotation is the full text; subsequent ones are individual words
    const fullText = texts[0]?.description || '';
    // Try to find a perfume name in the text (heuristic: usually after the brand name)
    const lines = fullText.split('\n').filter(l => l.trim());
    if (lines.length > 1 && brand) {
      // Find a line that's NOT the brand name
      name = lines.find(l => !l.toLowerCase().includes(brand.toLowerCase()) && l.length > 2) || null;
    } else if (lines.length > 0) {
      name = lines[0];
    }
  }

  // Map Google labels to fragrance accords
  const accordMap = {
    'perfume': 'floral', 'fragrance': 'floral', 'bottle': 'floral',
    'citrus': 'citrus', 'fruit': 'fruity', 'flower': 'floral',
    'wood': 'woody', 'spice': 'spicy', 'leather': 'leather',
  };
  const accords = labels
    .map(l => accordMap[l.description?.toLowerCase()] || null)
    .filter(Boolean)
    .slice(0, 5);

  return {
    brand,
    name,
    notes: [],
    accords,
    confidence: logos.length > 0 ? 80 : 40,
    description: `Logos: ${logos.map(l => l.description).join(', ')}. Labels: ${labels.slice(0, 5).map(l => l.description).join(', ')}.`,
  };
}

/**
 * Calls Hugging Face Inference API for image classification.
 * Uses a free model (no API key required for basic usage, but rate-limited).
 * Set VISION_API_KEY to your HF token for higher rate limits.
 */
async function callHuggingFace(base64Image, mimeType) {
  const apiKey = Deno.env.get('VISION_API_KEY') || ''; // Optional for free tier
  const model = 'google/vit-base-patch16-224'; // Free image classification model

  const headers = { 'Content-Type': mimeType || 'image/jpeg' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: 'POST',
      headers,
      body: base64ToBytes(base64Image),
    }
  );

  if (!res.ok) throw new Error(`HuggingFace API error ${res.status}`);
  const data = await res.json();

  // HuggingFace returns an array of {label, score}
  const labels = Array.isArray(data) ? data : [data];
  return {
    brand: null,
    name: null,
    notes: [],
    accords: labels.slice(0, 5).map(l => l.label?.toLowerCase() || ''),
    confidence: Math.round((labels[0]?.score || 0.3) * 100),
    description: `Top labels: ${labels.slice(0, 5).map(l => `${l.label} (${Math.round(l.score * 100)}%)`).join(', ')}`,
  };
}

/** Decodes a base64 string to Uint8Array. */
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  try {
    const body = await req.json();
    const { image, mimeType, catalogue } = body;

    if (!image) return json({ error: 'no-image' }, 400);
    if (image.length > 8 * 1024 * 1024) return json({ error: 'image-too-large' }, 413);

    const provider = Deno.env.get('VISION_PROVIDER') || 'openai';
    const catalogueHints = Array.isArray(catalogue) ? catalogue : [];

    let result;
    switch (provider) {
      case 'google':
        result = await callGoogle(image, mimeType);
        break;
      case 'huggingface':
        result = await callHuggingFace(image, mimeType);
        break;
      case 'openai':
      default:
        result = await callOpenAI(image, mimeType, catalogueHints);
        break;
    }

    // Return the result. The image is NOT stored anywhere.
    return json({ ok: true, ...result });
  } catch (e) {
    console.error('identify-perfume error:', e.message);
    return json({ error: e.message || 'unknown-error' }, 500);
  }
});
