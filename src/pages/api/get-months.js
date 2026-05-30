import { getApiUrl } from '../../lib/endpoint-config.js';

const j = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

export const GET = async () => {
  const apiKey = import.meta.env.KPI_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured' }, 500);

  const apiUrl = getApiUrl();
  const r = await fetch(`${apiUrl}/months`, { headers: { 'x-api-key': apiKey } });
  if (!r.ok) return j({ error: 'Upstream failed', status: r.status }, r.status);
  return new Response(await r.text(), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

