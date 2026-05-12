const BASE = '/api';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

export async function login(password) {
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) return { ok: false };
  const data = await res.json();
  return data;
}

export async function fetchMonths() {
  return get('/months');
}

export async function fetchOverview(month) {
  return get(`/overview/${month}`);
}

export async function fetchChannel(channel, month) {
  return get(`/channel/${channel}/${month}`);
}

export async function fetchLastUpdated() {
  return get('/last-updated');
}

export async function reportLastUpdated(source) {
  return post('/last-updated', { source });
}

export async function uploadTable(tableIndex, body) {
  const suffix = tableIndex === 0 ? '' : String(tableIndex);
  return post(`/table${suffix}`, body);
}

