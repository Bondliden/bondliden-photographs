// Cloudflare Worker — Bondliden chat proxy
// Esconde la API key de Z.ai detrás de un endpoint propio.
// Despliegue: copia este archivo en un Worker nuevo en Cloudflare,
// añade variable secreta Z_AI_KEY con el valor de tu API key.

const ALLOWED_ORIGINS = [
  'https://bondliden.com',
  'https://www.bondliden.com',
  'https://bondliden.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];
const Z_AI_ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: 'origin not allowed' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    if (!env.Z_AI_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured on worker' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    }); }

    // Sanitize: only forward what we expect
    const safe = {
      model: body.model || 'glm-4-flash',
      messages: Array.isArray(body.messages) ? body.messages.slice(-12) : [],
      temperature: typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.6,
      max_tokens: typeof body.max_tokens === 'number' ? Math.min(800, Math.max(32, body.max_tokens)) : 300
    };

    const upstream = await fetch(Z_AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.Z_AI_KEY
      },
      body: JSON.stringify(safe)
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
};
