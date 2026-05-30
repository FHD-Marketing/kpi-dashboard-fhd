import { getApiUrl } from '../../lib/endpoint-config.js';

const j = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST = async ({ request }) => {
  const apiKey = import.meta.env.KPI_API_KEY;
  const password = import.meta.env.KPI_PASSWORD;

  let body;
  try { body = await request.json(); } catch { return j({ error: 'Invalid JSON' }, 400); }

  if (password && body.password === password) return j({ ok: true });

  const apiUrl = getApiUrl();
  try {
    const r = await fetch(`${apiUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
    });
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return j({ ok: false }, 401);
  }
};

