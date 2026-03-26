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

export function getMonthData(month) {
  return dashboardData[month] || null;
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

export function setMonthData(monthKey, data) {
  dashboardData[monthKey] = data;
}

export function hasDataForTab(monthKey, tabId) {
  const data = dashboardData[monthKey];
  if (!data) return false;
  const key = tabToDataKey[tabId];
  if (!key) return false;
  const section = data[key];
  if (!section) return false;
  if (typeof section !== 'object') return false;
  const vals = Object.values(section);
  if (vals.length === 0) return false;
  for (const v of vals) {
    if (v && typeof v === 'object' && v.value !== undefined && v.value !== '—' && v.value !== null) {
      return true;
    }
  }
  return false;
}

export function getMonthOrder() {
  return monthOrder;
}

export async function loadDataFromServer() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const url = `${base}api/dashboard-data.json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  }

  const json = await res.json();
  const keys = Object.keys(json);

  keys.forEach(key => {
    dashboardData[key] = json[key];
  });
  return keys;
}

