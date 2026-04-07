const API_BASE = import.meta.env.PUBLIC_API_BASE;
const API_KEY = import.meta.env.PUBLIC_API_KEY;

const cache = {};
let monthsMeta = null;

export const dashboardData = {};

const monthOrder = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const tabToDataKey = {
  uebersicht: 'overview',
  google: 'googleAds',
  meta: 'metaAds',
  instagram: 'instagram',
  youtube: 'youtube',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  mailchimp: 'mailchimp',
  studycheck: 'studycheck',
  infomaterial: 'infomaterial',
  vertrag: 'vertrag'
};

const dataKeyToChannel = {
  googleAds: 'googleAds',
  metaAds: 'metaAds',
  instagram: 'instagram',
  youtube: 'youtube',
  linkedin: 'linkedin',
  mailchimp: 'mailchimp',
  infomaterial: 'infomaterial',
  vertrag: 'vertrag',
};

async function apiFetch(path) {
  const cacheKey = path;
  if (cache[cacheKey]) return cache[cacheKey];

  const url = `${API_BASE}${path}?_t=${Date.now()}`;

  if (!API_BASE) {
    console.error('[KPI] PUBLIC_API_BASE is not set');
    return null;
  }

  let res;
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': API_KEY },
    });
  } catch (err) {
    console.error(`[KPI] Network error for ${url}:`, err.message);
    return null;
  }

  if (!res.ok) {
    if (res.status === 404) return null;
    console.error(`[KPI] API ${path} → HTTP ${res.status}`);
    throw new Error(`API ${path} returned HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data && typeof data === 'object' && 'error' in data) {
    console.error(`[KPI] API ${path} returned error:`, data.error || '(empty)');
    return null;
  }

  cache[cacheKey] = data;
  return data;
}

export async function fetchMonths() {
  const data = await apiFetch('/api/months');
  monthsMeta = data || {};

  Object.entries(monthsMeta).forEach(([key, meta]) => {
    if (!dashboardData[key]) dashboardData[key] = {};
    dashboardData[key].label = meta.label;
    dashboardData[key].totalSpend = meta.totalSpend;
    dashboardData[key]._availableChannels = meta.availableChannels || [];
  });

  return Object.keys(monthsMeta);
}

export async function fetchOverview(monthShort) {
  const data = await apiFetch(`/api/overview/${monthShort}`);
  if (!data) return null;

  if (!dashboardData[monthShort]) dashboardData[monthShort] = {};
  if (data.overview) dashboardData[monthShort].overview = data.overview;
  if (data.googleAds) dashboardData[monthShort].googleAds = data.googleAds;
  if (data.metaAds) dashboardData[monthShort].metaAds = data.metaAds;

  return data;
}

export async function fetchChannel(channel, monthShort) {
  const data = await apiFetch(`/api/channel/${channel}/${monthShort}`);
  if (!data) return null;

  if (!dashboardData[monthShort]) dashboardData[monthShort] = {};

  const existing = dashboardData[monthShort][channel];
  if (existing && typeof existing === 'object' && typeof data === 'object') {
    dashboardData[monthShort][channel] = { ...existing, ...data };
  } else {
    dashboardData[monthShort][channel] = data;
  }

  return data;
}

export function isChannelCached(channel, monthShort) {
  return !!(dashboardData[monthShort] && dashboardData[monthShort][channel]);
}

export function getChannelForTab(tabId) {
  const dataKey = tabToDataKey[tabId];
  return dataKeyToChannel[dataKey] || null;
}

export function clearMonthChannels(monthShort) {
  const keep = ['label', 'totalSpend', '_availableChannels'];
  const data = dashboardData[monthShort];
  if (!data) return;
  Object.keys(data).forEach(k => {
    if (!keep.includes(k)) delete data[k];
  });
  Object.keys(cache).forEach(k => {
    if (k.includes('/' + monthShort)) delete cache[k];
  });
}

export function getAvailableChannelsForMonth(monthShort) {
  const data = dashboardData[monthShort];
  if (!data || !data._availableChannels) return [];
  return data._availableChannels;
}

export function getMonthData(month) {
  return dashboardData[month] || null;
}

export function setMonthData(month, data) {
  dashboardData[month] = data;
}

export function getAvailableMonths() {
  return monthOrder.filter(m => dashboardData[m]);
}

export function getPreviousMonthKey(monthKey) {
  const idx = monthOrder.indexOf(monthKey);
  if (idx <= 0) return null;
  const prevKey = monthOrder[idx - 1];
  return dashboardData[prevKey] ? prevKey : null;
}

export function hasDataForTab(monthKey, tabId) {
  const data = dashboardData[monthKey];
  if (!data) return false;

  const key = tabToDataKey[tabId];
  if (!key) return false;

  const section = data[key];
  if (section && typeof section === 'object') {
    if (Array.isArray(section.rows) && section.rows.length > 0) return true;
    const vals = Object.values(section);
    if (vals.length === 0) return false;
    for (const v of vals) {
      if (v && typeof v === 'object' && v.value !== undefined && v.value !== '—' && v.value !== null) {
        return true;
      }
    }
    return false;
  }

  const channelName = dataKeyToChannel[key];
  if (channelName && data._availableChannels) {
    return data._availableChannels.includes(channelName);
  }

  return false;
}

export function getMonthOrder() {
  return monthOrder;
}

export async function uploadInfomaterialTable(tableData) {
  const url = `${API_BASE}/api/table`;

  if (!API_BASE) {
    console.error('[KPI] PUBLIC_API_BASE is not set');
    throw new Error('API base not configured');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(tableData),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API /api/table → HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

export async function uploadVertragTable(tableData) {
  const url = `${API_BASE}/api/table1`;

  if (!API_BASE) {
    console.error('[KPI] PUBLIC_API_BASE is not set');
    throw new Error('API base not configured');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(tableData),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API /api/table1 → HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

let lastUpdatedTimestamps = {};

export async function fetchLastUpdated() {
  const data = await apiFetch('/api/last-updated');
  lastUpdatedTimestamps = data || {};
  return lastUpdatedTimestamps;
}

export function getLastUpdatedTimestamps() {
  return lastUpdatedTimestamps;
}

export async function reportLastUpdated(source) {
  const url = `${API_BASE}/api/last-updated`;

  if (!API_BASE) return;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ source }),
  });

  if (!res.ok) {
    console.warn(`[KPI] POST /api/last-updated failed: HTTP ${res.status}`);
  }

  delete cache['/api/last-updated'];
}

