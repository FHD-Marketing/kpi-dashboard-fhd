import { getApiUrl } from '../../lib/endpoint-config.js';

const j = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

export const GET = async ({ url }) => {
  const apiKey = import.meta.env.KPI_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured' }, 500);

  const month = new URL(url).searchParams.get('month');
  if (!month || !/^[a-z0-9_-]+$/.test(month)) return j({ error: 'Invalid month' }, 400);

  const apiUrl = getApiUrl();
  const r = await fetch(`${apiUrl}/api/overview/${encodeURIComponent(month)}`, {
    headers: { 'x-api-key': apiKey },
  });
  if (!r.ok) return j({ error: 'Upstream failed', status: r.status }, r.status);
  return new Response(await r.text(), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

