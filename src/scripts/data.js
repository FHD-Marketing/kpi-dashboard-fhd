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
  ytd: 'ytdTrends'
};

const dataKeyToChannel = {
  googleAds: 'googleAds',
  metaAds: 'metaAds',
  instagram: 'instagram',
  youtube: 'youtube',
  linkedin: 'linkedin',
  mailchimp: 'mailchimp',
};

// ── Fetch helper with API key ──
async function apiFetch(path) {
  const cacheKey = path;
  if (cache[cacheKey]) return cache[cacheKey];

  const url = `${API_BASE}${path}`;

  if (!API_BASE) {
    console.error('[KPI] PUBLIC_API_BASE ist nicht gesetzt – .env prüfen und neu bauen');
    return null;
  }

  let res;
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': API_KEY },
    });
  } catch (err) {
    console.error(`[KPI] Netzwerkfehler bei ${url}:`, err.message);
    return null;
  }

  if (!res.ok) {
    if (res.status === 404) return null;
    console.error(`[KPI] API ${path} → HTTP ${res.status}`);
    throw new Error(`API ${path} returned HTTP ${res.status}`);
  }

  const data = await res.json();

  // Treat API-level error responses as failures
  if (data && typeof data === 'object' && 'error' in data) {
    console.error(`[KPI] API ${path} returned error:`, data.error || '(empty)');
    return null;
  }

  cache[cacheKey] = data;
  return data;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch available months from the API.
 * Returns array of short month keys that have data (e.g. ['jan', 'mar']).
 */
export async function fetchMonths() {
  const data = await apiFetch('/api/months');
  monthsMeta = data || {};

  // Populate dashboardData with month metadata
  Object.entries(monthsMeta).forEach(([key, meta]) => {
    if (!dashboardData[key]) dashboardData[key] = {};
    dashboardData[key].label = meta.label;
    dashboardData[key].totalSpend = meta.totalSpend;
    dashboardData[key]._availableChannels = meta.availableChannels || [];
  });

  return Object.keys(monthsMeta);
}

/**
 * Fetch overview data (overview + googleAds + metaAds) for a month.
 */
export async function fetchOverview(monthShort) {
  const data = await apiFetch(`/api/overview/${monthShort}`);
  if (!data) return null;

  // Merge into dashboardData
  if (!dashboardData[monthShort]) dashboardData[monthShort] = {};
  if (data.overview) dashboardData[monthShort].overview = data.overview;
  if (data.googleAds) dashboardData[monthShort].googleAds = data.googleAds;
  if (data.metaAds) dashboardData[monthShort].metaAds = data.metaAds;

  return data;
}

/**
 * Fetch data for a specific channel in a month.
 * channel: 'googleAds' | 'metaAds' | 'instagram' | 'youtube' | 'linkedin' | 'mailchimp'
 */
export async function fetchChannel(channel, monthShort) {
  const data = await apiFetch(`/api/channel/${channel}/${monthShort}`);
  if (!data) return null;

  // Merge into dashboardData
  if (!dashboardData[monthShort]) dashboardData[monthShort] = {};
  dashboardData[monthShort][channel] = data;

  return data;
}

/**
 * Check if channel data is already cached locally.
 */
export function isChannelCached(channel, monthShort) {
  return !!(dashboardData[monthShort] && dashboardData[monthShort][channel]);
}

/**
 * Get the channel API name for a tab id.
 */
export function getChannelForTab(tabId) {
  const dataKey = tabToDataKey[tabId];
  return dataKeyToChannel[dataKey] || null;
}

// ── Clear / Reset ──

/**
 * Clears cached channel data for a month (keeps label/totalSpend metadata).
 */
export function clearMonthChannels(monthShort) {
  const keep = ['label', 'totalSpend', '_availableChannels'];
  const data = dashboardData[monthShort];
  if (!data) return;
  Object.keys(data).forEach(k => {
    if (!keep.includes(k)) delete data[k];
  });
  // Also purge fetch cache for that month
  Object.keys(cache).forEach(k => {
    if (k.includes('/' + monthShort)) delete cache[k];
  });
}

/**
 * Returns array of channel API names available for a month.
 */
export function getAvailableChannelsForMonth(monthShort) {
  const data = dashboardData[monthShort];
  if (!data || !data._availableChannels) return [];
  return data._availableChannels;
}

// ── Legacy-compatible exports ──

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

  // Check if we have it cached already
  const section = data[key];
  if (section && typeof section === 'object') {
    const vals = Object.values(section);
    if (vals.length === 0) return false;
    for (const v of vals) {
      if (v && typeof v === 'object' && v.value !== undefined && v.value !== '—' && v.value !== null) {
        return true;
      }
    }
    return false;
  }

  // Otherwise check availableChannels from /api/months metadata
  const channelName = dataKeyToChannel[key];
  if (channelName && data._availableChannels) {
    return data._availableChannels.includes(channelName);
  }

  return false;
}

export function getMonthOrder() {
  return monthOrder;
}
