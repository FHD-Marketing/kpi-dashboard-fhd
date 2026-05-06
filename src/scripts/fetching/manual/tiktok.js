import { getMonthData, setMonthData, uploadTiktokTable, reportLastUpdated } from '../../data.js';
import { getCurrentMonth, refreshMonthButtons } from '../../month-selector.js';

const chartInstances = {};

const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const COLOR_CURRENT = '#00f2ea';
const COLOR_PREV = '#334155';
const COLOR_CURRENT_BG = 'rgba(0,242,234,0.85)';

export function initTiktok() {
  setupUploadHandlers();
}

export function destroyTiktokCharts() {
  Object.keys(chartInstances).forEach(key => {
    try { chartInstances[key].destroy(); } catch (_) {}
    delete chartInstances[key];
  });
}

export function renderTiktokTab(monthKey) {
  normalizeTiktokData(monthKey);
  const data = getMonthData(monthKey);
  if (!data || !data.tiktok || !Array.isArray(data.tiktok.videos) || data.tiktok.videos.length === 0) {
    toggleSections(false);
    return;
  }
  toggleSections(true);
  renderVideosTable(data.tiktok);
  renderVideoCharts(data.tiktok, monthKey);
}

function toggleSections(visible) {
  ['tiktok-section-table', 'tiktok-section-charts'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  });
}

function setupUploadHandlers() {
  const fileInput = document.getElementById('tiktok-file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
    e.target.value = '';
  });
}

async function processFiles(files) {
  const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (csvFiles.length === 0) {
    showFeedback('error', 'Bitte CSV-Dateien (.csv) hochladen.');
    return;
  }

  showFeedback('loading', `${csvFiles.length} Datei(en) werden verarbeitet…`);

  try {
    const texts = await Promise.all(csvFiles.map(f => readFileAsText(f)));
    const classified = { uebersicht: null, publikum: null, video: null };

    csvFiles.forEach((f, i) => {
      const kind = classifyCSV(f.name, texts[i]);
      if (kind && !classified[kind]) classified[kind] = { name: f.name, text: texts[i] };
    });

    if (!classified.uebersicht && !classified.publikum && !classified.video) {
      showFeedback('error', 'Keine bekannten TikTok-CSVs erkannt (Übersicht, Publikum, Video).');
      return;
    }

    const parsed = parseTiktokExports(classified);
    if (parsed.months.length === 0) {
      showFeedback('error', 'Kein gültiger Auswertungszeitraum erkannt.');
      return;
    }

    showFeedback('loading', 'Daten werden an API gesendet…');
    let uploadOk = false;
    try {
      await uploadTiktokTable(buildTablePayload(parsed));
      uploadOk = true;
    } catch (apiErr) {
      console.warn('API upload failed (data still applied locally):', apiErr.message);
    }

    injectParsedData(parsed);

    const currentMonth = getCurrentMonth();
    const tabBtn = document.querySelector('.tab-btn[data-tab="tiktok"]');
    if (tabBtn) tabBtn.classList.remove('disabled');

    refreshMonthButtons();

    const targetMonth = parsed.months[parsed.months.length - 1];
    if (targetMonth && targetMonth !== currentMonth) {
      const monthBtn = document.querySelector(`.month-btn[data-month="${targetMonth}"]`);
      if (monthBtn && !monthBtn.classList.contains('disabled')) {
        monthBtn.click();
      } else if (currentMonth) {
        const data = getMonthData(currentMonth);
        if (data && data.tiktok) updateKpis(data.tiktok);
        renderTiktokTab(currentMonth);
      }
    } else if (currentMonth) {
      const data = getMonthData(currentMonth);
      if (data && data.tiktok) updateKpis(data.tiktok);
      renderTiktokTab(currentMonth);
    }

    if (uploadOk) updateLastUpdated();

    const monthLabels = parsed.months.map(m => MONTH_NAMES_DE[MONTH_KEYS.indexOf(m)]).filter(Boolean).join(', ');
    const detected = Object.entries(classified).filter(([_, v]) => v).map(([k]) => k).join(', ');
    showFeedback('success', `✓ Hochgeladen: ${detected} – ${parsed.videos.length} Videos, ${parsed.daily.length} Tage (${monthLabels})`);
  } catch (err) {
    console.error('TikTok parsing error:', err);
    showFeedback('error', 'Fehler beim Lesen der Dateien: ' + err.message);
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

function classifyCSV(name, text) {
  const lower = name.toLowerCase();
  const head = text.split(/\r?\n/)[0] || '';
  if (lower.includes('video') || /Videotitel/i.test(head)) return 'video';
  if (lower.includes('publikum') || /Follower insgesamt/i.test(head)) return 'publikum';
  if (lower.includes('übersicht') || lower.includes('uebersicht') || /Profilaufrufe/i.test(head)) return 'uebersicht';
  if (/Videoaufrufe/i.test(head) && /Likes/i.test(head)) return 'uebersicht';
  return null;
}

function parseTiktokExports(classified) {
  const daily = classified.uebersicht ? parseUebersicht(classified.uebersicht.text) : [];
  const audience = classified.publikum ? parsePublikum(classified.publikum.text) : [];
  const videos = classified.video ? parseVideos(classified.video.text) : [];

  const monthSet = new Set();
  daily.forEach(d => { if (d.monthKey) monthSet.add(d.monthKey); });
  audience.forEach(d => { if (d.monthKey) monthSet.add(d.monthKey); });
  videos.forEach(v => { if (v.monthKey) monthSet.add(v.monthKey); });
  const months = [...monthSet].sort((a, b) => MONTH_KEYS.indexOf(a) - MONTH_KEYS.indexOf(b));

  return { daily, audience, videos, months };
}

function parseUebersicht(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => String(h || '').trim());
  const idx = (n) => header.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const cDate = idx('Datum');
  const cViews = idx('Videoaufrufe');
  const cReach = idx('Erreichtes Publikum');
  const cProf = idx('Profilaufrufe');
  const cLikes = idx('Likes');
  const cShares = idx('Freigaben');
  const cComm = idx('Kommentare');
  const cNet = idx('Nettowachstum');
  const cNew = idx('Neue Follower');
  const cLost = idx('Verlorene Follower');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const d = parseDate(r[cDate]);
    if (!d) continue;
    out.push({
      date: d,
      monthKey: MONTH_KEYS[d.getMonth()],
      views: toNum(r[cViews]),
      reach: toNum(r[cReach]),
      profileViews: toNum(r[cProf]),
      likes: toNum(r[cLikes]),
      shares: toNum(r[cShares]),
      comments: toNum(r[cComm]),
      netGrowth: toNum(r[cNet]),
      newFollowers: toNum(r[cNew]),
      lostFollowers: toNum(r[cLost]),
    });
  }
  return out;
}

function parsePublikum(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => String(h || '').trim());
  const idx = (n) => header.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const cDate = idx('Datum');
  const cNew = idx('Neue Follower');
  const cTotal = idx('Follower insgesamt');
  const cReach = idx('Erreichtes Publikum');
  const cInter = idx('Publikum mit Interaktion');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const d = parseDate(r[cDate]);
    if (!d) continue;
    out.push({
      date: d,
      monthKey: MONTH_KEYS[d.getMonth()],
      newFollowers: toNum(r[cNew]),
      totalFollowers: toNum(r[cTotal]),
      reach: toNum(r[cReach]),
      engagedAudience: toNum(r[cInter]),
    });
  }
  return out;
}

function parseVideos(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => String(h || '').trim());
  const idx = (n) => header.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const cTitle = idx('Videotitel');
  const cLink = idx('Videolink');
  const cPub = idx('Veröffentlichungszeit');
  const cViews = idx('Videoaufrufe');
  const cLikes = idx('Likes');
  const cComm = idx('Kommentare');
  const cShares = idx('Freigaben');
  const cFav = idx('Zu Favoriten hinzufügen');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[cTitle]) continue;
    const d = parseDate(r[cPub]);
    const views = toNum(r[cViews]);
    const likes = toNum(r[cLikes]);
    const comments = toNum(r[cComm]);
    const shares = toNum(r[cShares]);
    const favorites = toNum(r[cFav]);
    const interactions = likes + comments + shares + favorites;
    const engagementRate = views > 0 ? (interactions / views) * 100 : 0;

    out.push({
      title: String(r[cTitle] || '').trim(),
      link: String(r[cLink] || '').trim(),
      publishedAt: d,
      monthKey: d ? MONTH_KEYS[d.getMonth()] : null,
      views,
      likes,
      comments,
      shares,
      favorites,
      engagementRate,
    });
  }
  return out;
}

function parseCSV(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

function parseDate(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const rest = s.substring(m[0].length).trim();
    const t = rest.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
      t ? parseInt(t[1], 10) : 0, t ? parseInt(t[2], 10) : 0, t && t[3] ? parseInt(t[3], 10) : 0);
  }
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  const fb = new Date(s);
  return isNaN(fb.getTime()) ? null : fb;
}

function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).replace(/"/g, '').trim();
  if (s === '' || /^nan$/i.test(s)) return 0;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.').replace('%', ''));
  return isFinite(n) ? n : 0;
}

function injectParsedData(parsed) {
  const { daily, audience, videos, months } = parsed;

  months.forEach((mk) => {
    const idx = MONTH_KEYS.indexOf(mk);
    if (idx === -1) return;

    let existing = getMonthData(mk);
    if (!existing) {
      const year = new Date().getFullYear();
      existing = { label: `${MONTH_NAMES_DE[idx]} ${year}` };
    }

    const monthDaily = daily.filter(d => d.monthKey === mk);
    const monthAudience = audience.filter(a => a.monthKey === mk);
    const monthVideos = videos.filter(v => v.monthKey === mk);

    existing.tiktok = buildTiktokSection(mk, monthDaily, monthAudience, monthVideos, parsed);
    setMonthData(mk, existing);
  });
}

function buildTiktokSection(mk, monthDaily, monthAudience, monthVideos, raw) {
  const idx = MONTH_KEYS.indexOf(mk);
  const sumViews = monthDaily.reduce((a, d) => a + (d.views || 0), 0);
  const sumLikes = monthDaily.reduce((a, d) => a + (d.likes || 0), 0);
  const sumComments = monthDaily.reduce((a, d) => a + (d.comments || 0), 0);
  const sumShares = monthDaily.reduce((a, d) => a + (d.shares || 0), 0);
  const interactions = sumLikes + sumComments + sumShares;
  const engRate = sumViews > 0 ? (interactions / sumViews) * 100 : 0;

  let follower = 0;
  if (monthAudience.length > 0) {
    const last = [...monthAudience].sort((a, b) => (b.date || 0) - (a.date || 0))[0];
    follower = last.totalFollowers || 0;
  }

  let prevMk = null;
  for (let i = idx - 1; i >= 0; i--) {
    const prev = getMonthData(MONTH_KEYS[i]);
    if (prev && prev.tiktok && prev.tiktok.views && prev.tiktok.views.value) { prevMk = MONTH_KEYS[i]; break; }
  }
  const prev = prevMk ? (getMonthData(prevMk) || {}).tiktok : null;
  const prevViews = prev ? parseNum(prev.views?.value) : 0;
  const prevFoll = prev ? parseNum(prev.follower?.value) : 0;
  const prevLikes = prev ? parseNum(prev.likes?.value) : 0;
  const prevEng = prev ? parseFloat(String(prev.engagementRate?.value || '0').replace('%', '').replace(',', '.')) : 0;

  return {
    views: {
      value: fmt(sumViews),
      trend: prev ? pctTrend(sumViews, prevViews) : null,
      trendDir: prev ? trendDir(sumViews, prevViews) : null,
    },
    follower: {
      value: fmt(follower),
      trend: prev ? pctTrend(follower, prevFoll) : null,
      trendDir: prev ? trendDir(follower, prevFoll) : null,
    },
    engagementRate: {
      value: engRate.toFixed(2).replace('.', ',') + '%',
      trend: prev && prevEng ? pctTrend(engRate, prevEng) : null,
      trendDir: prev && prevEng ? trendDir(engRate, prevEng) : null,
    },
    likes: {
      value: fmt(sumLikes),
      trend: prev ? pctTrend(sumLikes, prevLikes) : null,
      trendDir: prev ? trendDir(sumLikes, prevLikes) : null,
    },
    videos: monthVideos,
    daily: monthDaily,
    audience: monthAudience,
    _prevMonthKey: prevMk,
    _raw: raw,
  };
}

function normalizeServerDaily(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(d => {
    const date = d.date instanceof Date ? d.date : (d.date ? new Date(d.date) : null);
    return {
      date,
      monthKey: date ? MONTH_KEYS[date.getMonth()] : (d.month_key || d.monthKey || null),
      views: numFromServer(d.views),
      reach: numFromServer(d.reach),
      profileViews: numFromServer(d.profile_views ?? d.profileViews),
      likes: numFromServer(d.likes),
      shares: numFromServer(d.shares),
      comments: numFromServer(d.comments),
      netGrowth: numFromServer(d.net_growth ?? d.netGrowth),
      newFollowers: numFromServer(d.new_followers ?? d.newFollowers),
      lostFollowers: numFromServer(d.lost_followers ?? d.lostFollowers),
    };
  });
}

function normalizeServerAudience(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(a => {
    const date = a.date instanceof Date ? a.date : (a.date ? new Date(a.date) : null);
    return {
      date,
      monthKey: date ? MONTH_KEYS[date.getMonth()] : (a.month_key || a.monthKey || null),
      newFollowers: numFromServer(a.new_followers ?? a.newFollowers),
      totalFollowers: numFromServer(a.total_followers ?? a.totalFollowers),
      reach: numFromServer(a.reach),
      engagedAudience: numFromServer(a.engaged_audience ?? a.engagedAudience),
    };
  });
}

function normalizeServerVideos(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(v => {
    const pub = v.published_at ?? v.publishedAt;
    const date = pub instanceof Date ? pub : (pub ? new Date(pub) : null);
    const views = numFromServer(v.views);
    const likes = numFromServer(v.likes);
    const comments = numFromServer(v.comments);
    const shares = numFromServer(v.shares);
    const favorites = numFromServer(v.favorites);
    let engagementRate = v.engagement_rate ?? v.engagementRate;
    if (engagementRate == null) {
      engagementRate = views > 0 ? ((likes + comments + shares + favorites) / views) * 100 : 0;
    } else {
      engagementRate = numFromServer(engagementRate);
    }
    return {
      title: String(v.title || '').trim(),
      link: String(v.link || '').trim(),
      publishedAt: date,
      monthKey: date ? MONTH_KEYS[date.getMonth()] : (v.month_key || v.monthKey || null),
      views, likes, comments, shares, favorites, engagementRate,
    };
  });
}

function numFromServer(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).replace(/"/g, '').trim();
  if (s === '' || /^nan$/i.test(s)) return 0;
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export function normalizeTiktokData(monthKey) {
  const data = getMonthData(monthKey);
  if (!data || !data.tiktok) return;
  const tt = data.tiktok;

  const hasComputedKpis = tt.views && typeof tt.views === 'object' && tt.views.value !== undefined
    && tt.follower && typeof tt.follower === 'object' && tt.follower.value !== undefined;

  const rawDailyLen = Array.isArray(tt.daily) ? tt.daily.length : 0;
  const rawAudLen = Array.isArray(tt.audience) ? tt.audience.length : 0;
  const rawVidLen = Array.isArray(tt.videos) ? tt.videos.length : 0;
  const hasAnyRaw = rawDailyLen + rawAudLen + rawVidLen > 0;

  if (hasComputedKpis && !hasAnyRaw) return;

  const videosAlreadyNormalized = rawVidLen > 0 && tt.videos[0] && tt.videos[0].engagementRate !== undefined && (tt.videos[0].publishedAt instanceof Date);
  const dailyAlreadyNormalized = rawDailyLen > 0 && tt.daily[0] && tt.daily[0].monthKey !== undefined;
  if (hasComputedKpis && videosAlreadyNormalized && dailyAlreadyNormalized) return;

  if (!hasAnyRaw) return;

  const daily = normalizeServerDaily(tt.daily);
  const audience = normalizeServerAudience(tt.audience);
  const videos = normalizeServerVideos(tt.videos);

  const monthDaily = daily.filter(d => d.monthKey === monthKey);
  const monthAudience = audience.filter(a => a.monthKey === monthKey);
  const monthVideos = videos.filter(v => v.monthKey === monthKey);

  const monthHasContent = monthDaily.length + monthAudience.length + monthVideos.length > 0;
  if (!monthHasContent && hasComputedKpis) return;

  const sectionsEmpty = !monthHasContent;
  const useDaily = sectionsEmpty ? daily : monthDaily;
  const useAudience = sectionsEmpty ? audience : monthAudience;
  const useVideos = sectionsEmpty ? videos : monthVideos;

  data.tiktok = buildTiktokSection(monthKey, useDaily, useAudience, useVideos, { daily, audience, videos });
  setMonthData(monthKey, data);
}

function fmt(n) { return Math.round(n).toLocaleString('de-DE'); }

function parseNum(val) {
  if (val == null || val === '') return 0;
  const s = String(val).replace(/\./g, '').replace(',', '.').replace('%', '').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function pctTrend(cur, prev) {
  if (!prev || prev === 0) return null;
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  const arrow = p >= 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(p).toFixed(1).replace('.', ',')}%`;
}

function trendDir(cur, prev) {
  if (!prev || prev === 0) return null;
  return cur >= prev ? 'up-good' : 'down-bad';
}

function updateKpis(tt) {
  const kpis = {
    'tiktok-views': tt.views,
    'tiktok-follower': tt.follower,
    'tiktok-engagementRate': tt.engagementRate,
    'tiktok-likes': tt.likes,
  };
  Object.entries(kpis).forEach(([id, val]) => {
    if (!val) return;
    const el = document.querySelector(`[data-kpi="${id}"]`);
    if (!el) return;
    const valueEl = el.querySelector('.kpi-value');
    if (valueEl) valueEl.textContent = val.value;

    const trendEl = el.querySelector('.kpi-trend');
    if (trendEl) {
      if (val.trend) {
        trendEl.textContent = val.trend;
        trendEl.style.display = '';
        trendEl.className = 'kpi-trend';
        if (val.trendDir) {
          if (val.trendDir.includes('good')) trendEl.classList.add('positive');
          else if (val.trendDir.includes('bad')) trendEl.classList.add('negative');
        }
      } else {
        trendEl.textContent = '';
        trendEl.style.display = 'none';
      }
    }
  });
}

function renderVideosTable(tt) {
  const table = document.getElementById('tiktok-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  const sorted = [...tt.videos].sort((a, b) => b.views - a.views);

  sorted.forEach(v => {
    const titleShort = v.title.length > 90 ? v.title.substring(0, 87) + '…' : v.title;
    const titleHtml = v.link
      ? `<a href="${escapeAttr(v.link)}" target="_blank" rel="noopener" class="studycheck-profile-link" title="${escapeAttr(v.title)}">${escapeHtml(titleShort)}</a>`
      : `<span title="${escapeAttr(v.title)}">${escapeHtml(titleShort)}</span>`;
    const dateStr = v.publishedAt ? formatDate(v.publishedAt) : '–';
    const eng = v.engagementRate.toFixed(2).replace('.', ',') + '%';

    tbody.innerHTML += `
      <tr>
        <td>${titleHtml}</td>
        <td>${dateStr}</td>
        <td>${fmt(v.views)}</td>
        <td>${fmt(v.likes)}</td>
        <td>${fmt(v.comments)}</td>
        <td>${fmt(v.shares)}</td>
        <td>${fmt(v.favorites)}</td>
        <td>${eng}</td>
      </tr>`;
  });
}

function renderVideoCharts(tt, monthKey) {
  const container = document.getElementById('tiktok-charts-container');
  if (!container) return;

  Object.keys(chartInstances).forEach(key => {
    if (key.startsWith('tiktok-vid-')) {
      try { chartInstances[key].destroy(); } catch (_) {}
      delete chartInstances[key];
    }
  });

  container.innerHTML = '';

  const videos = (tt.videos || []).filter(v => v.views > 0);
  if (videos.length === 0) return;

  const sorted = [...videos].sort((a, b) => b.views - a.views);

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const currentMonthName = monthNames[monthKey] || monthKey;

  sorted.forEach((v, idx) => {
    const canvasId = `tiktok-vid-${idx}`;
    const shortTitle = v.title.length > 70 ? v.title.substring(0, 67) + '…' : v.title;
    const dateStr = v.publishedAt ? formatDate(v.publishedAt) : '';
    const eng = v.engagementRate.toFixed(2).replace('.', ',') + '%';

    container.innerHTML += `
      <div class="infomaterial-chart-card">
        <div class="infomaterial-chart-header">
          <span class="infomaterial-chart-title" title="${escapeAttr(v.title)}">${escapeHtml(shortTitle)}</span>
          <span class="sg-change">${eng}</span>
        </div>
        <div class="infomaterial-chart-values">
          <span class="sg-current"><span class="sg-dot" style="background:${COLOR_CURRENT}"></span>${dateStr ? dateStr + ' · ' : ''}${currentMonthName}</span>
          <span class="sg-prev"><span class="sg-dot" style="background:${COLOR_PREV}"></span>${fmt(v.views)} Aufrufe</span>
        </div>
        <div class="infomaterial-chart-wrapper"><canvas id="${canvasId}"></canvas></div>
      </div>
    `;
  });

  requestAnimationFrame(() => {
    sorted.forEach((v, idx) => {
      createVideoChart(`tiktok-vid-${idx}`, v);
    });
  });
}

function createVideoChart(canvasId, video) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const metrics = ['Aufrufe', 'Likes', 'Kommentare', 'Geteilt', 'Favoriten'];
  const data = [video.views, video.likes, video.comments, video.shares, video.favorites];

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: metrics,
      datasets: [{
        label: 'Wert',
        data,
        backgroundColor: COLOR_CURRENT_BG,
        borderColor: COLOR_CURRENT,
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${c.parsed.y}` } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: '#1e293b', lineWidth: 0.5 },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function buildTablePayload(parsed) {
  return {
    months: parsed.months,
    daily: parsed.daily.map(d => ({
      date: d.date ? d.date.toISOString().substring(0, 10) : null,
      views: d.views,
      reach: d.reach,
      profile_views: d.profileViews,
      likes: d.likes,
      shares: d.shares,
      comments: d.comments,
      net_growth: d.netGrowth,
      new_followers: d.newFollowers,
      lost_followers: d.lostFollowers,
    })),
    audience: parsed.audience.map(a => ({
      date: a.date ? a.date.toISOString().substring(0, 10) : null,
      new_followers: a.newFollowers,
      total_followers: a.totalFollowers,
      reach: a.reach,
      engaged_audience: a.engagedAudience,
    })),
    videos: parsed.videos.map(v => ({
      title: v.title,
      link: v.link,
      published_at: v.publishedAt ? v.publishedAt.toISOString() : null,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      favorites: v.favorites,
      engagement_rate: v.engagementRate,
    })),
  };
}

function updateLastUpdated() {
  const now = new Date();
  const timestamp = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const titleEl = document.getElementById('tiktok-title');
  if (titleEl) {
    let badge = titleEl.querySelector('.last-updated-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'last-updated-badge';
      const inlineUpload = titleEl.querySelector('.inline-upload');
      if (inlineUpload) {
        titleEl.insertBefore(badge, inlineUpload);
      } else {
        titleEl.appendChild(badge);
      }
    }
    badge.textContent = `Zuletzt aktualisiert: ${timestamp}`;
    badge.style.display = '';
  }
  reportLastUpdated('tiktok').catch(() => {});
}

function showFeedback(type, message) {
  const feedbackEl = document.getElementById('tiktok-upload-feedback');
  if (!feedbackEl) return;

  feedbackEl.className = 'upload-feedback';
  feedbackEl.classList.add(`upload-${type}`);
  feedbackEl.textContent = message;
  feedbackEl.style.display = 'block';

  if (type === 'success') {
    const uploadArea = document.getElementById('tiktok-upload-area');
    if (uploadArea) {
      uploadArea.classList.add('upload-success');
      setTimeout(() => uploadArea.classList.remove('upload-success'), 2000);
    }
  }

  if (type !== 'loading') {
    setTimeout(() => { feedbackEl.style.display = 'none'; }, 6000);
  }
}

function formatDate(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

