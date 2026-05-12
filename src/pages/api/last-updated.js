import { getApiUrl } from '../../lib/endpoint-config.js';

const j = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

export const GET = async () => {
  const apiKey = import.meta.env.KPI_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured' }, 500);

  const apiUrl = getApiUrl();
  const r = await fetch(`${apiUrl}/api/last-updated`, { headers: { 'x-api-key': apiKey } });
  if (!r.ok) return j({ error: 'Upstream failed', status: r.status }, r.status);
  return new Response(await r.text(), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const POST = async ({ request }) => {
  const apiKey = import.meta.env.KPI_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return j({ error: 'Invalid JSON' }, 400); }

  const apiUrl = getApiUrl();
  const r = await fetch(`${apiUrl}/api/last-updated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  });
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } });
};

