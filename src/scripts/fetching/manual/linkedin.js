import { getMonthData, setMonthData, uploadLinkedinTable, reportLastUpdated } from '../../data.js';
import { getCurrentMonth } from '../../month-selector.js';

const chartInstances = {};

const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const COLOR_CURRENT = '#0a66c2';
const COLOR_PREV = '#334155';
const COLOR_CURRENT_BG = 'rgba(10,102,194,0.85)';

export function initLinkedin() {
  setupUploadHandlers();
}

export function destroyLinkedinCharts() {
  Object.keys(chartInstances).forEach(key => {
    try { chartInstances[key].destroy(); } catch (_) {}
    delete chartInstances[key];
  });
}

export function renderLinkedinTab(monthKey) {
  normalizeLinkedinData(monthKey);
  const data = getMonthData(monthKey);
  if (!data || !data.linkedin || !Array.isArray(data.linkedin.posts) || data.linkedin.posts.length === 0) {
    toggleSections(false);
    return;
  }
  toggleSections(true);
  renderPostsTable(data.linkedin);
  renderPostCharts(data.linkedin, monthKey);
}

function toggleSections(visible) {
  ['linkedin-section-table', 'linkedin-section-charts'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  });
}

function setupUploadHandlers() {
  const fileInput = document.getElementById('linkedin-file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processExcelFile(file);
  });
}

async function processExcelFile(file) {
  const validExt = ['.xls', '.xlsx'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExt.includes(ext)) {
    showFeedback('error', 'Bitte eine LinkedIn Excel-Datei (.xls/.xlsx) hochladen.');
    return;
  }

  showFeedback('loading', 'Datei wird verarbeitet…');

  try {
    const buf = await readFileAsArrayBuffer(file);
    if (typeof XLSX === 'undefined') {
      showFeedback('error', 'XLSX-Bibliothek nicht geladen.');
      return;
    }
    const wb = XLSX.read(buf, { type: 'array' });

    const parsed = parseLinkedinWorkbook(wb);
    if (!parsed) {
      showFeedback('error', 'Die Datei konnte nicht verarbeitet werden. Erwartet werden die Sheets „Kennzahlen" und „Alle Beiträge".');
      return;
    }
    if (parsed.months.length === 0) {
      showFeedback('error', 'Kein gültiger Auswertungszeitraum erkannt.');
      return;
    }

    showFeedback('loading', 'Daten werden an API gesendet…');
    let uploadOk = false;
    try {
      await uploadLinkedinTable(buildTablePayload(parsed));
      uploadOk = true;
    } catch (apiErr) {
      console.warn('API upload failed (data still applied locally):', apiErr.message);
    }

    injectParsedData(parsed);

    const currentMonth = getCurrentMonth();
    if (currentMonth) {
      // Re-render KPI cards via month-selector logic by dispatching change of data
      const data = getMonthData(currentMonth);
      if (data && data.linkedin) updateKpis(data.linkedin);
      renderLinkedinTab(currentMonth);
      const tabBtn = document.querySelector('.tab-btn[data-tab="linkedin"]');
      if (tabBtn) tabBtn.classList.remove('disabled');
    }

    if (uploadOk) updateLastUpdated();

    const monthLabels = parsed.months.map(m => MONTH_NAMES_DE[MONTH_KEYS.indexOf(m)]).filter(Boolean).join(', ');
    showFeedback('success', `✓ ${file.name} erfolgreich hochgeladen – ${parsed.posts.length} Beiträge erkannt (${monthLabels})`);
  } catch (err) {
    console.error('LinkedIn parsing error:', err);
    showFeedback('error', 'Fehler beim Lesen der Datei: ' + err.message);
  }
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(new Uint8Array(e.target.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function parseLinkedinWorkbook(wb) {
  const sheetNames = wb.SheetNames || [];
  const kennzahlenName = sheetNames.find(n => /kennzahl/i.test(n)) || sheetNames[0];
  const beitraegeName = sheetNames.find(n => /beitr/i.test(n));

  const kennzahlenRows = kennzahlenName
    ? XLSX.utils.sheet_to_json(wb.Sheets[kennzahlenName], { header: 1, defval: null, raw: true })
    : [];
  const beitraegeRows = beitraegeName
    ? XLSX.utils.sheet_to_json(wb.Sheets[beitraegeName], { header: 1, defval: null, raw: true })
    : [];

  const daily = parseKennzahlen(kennzahlenRows);
  const posts = parseBeitraege(beitraegeRows);

  if (daily.length === 0 && posts.length === 0) return null;

  // Determine months covered by union of daily-dates + post-dates
  const monthSet = new Set();
  daily.forEach(d => { if (d.monthKey) monthSet.add(d.monthKey); });
  posts.forEach(p => { if (p.monthKey) monthSet.add(p.monthKey); });
  const months = [...monthSet].sort((a, b) => MONTH_KEYS.indexOf(a) - MONTH_KEYS.indexOf(b));

  return { daily, posts, months };
}

function findHeaderIndex(rows, requiredKey) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i] || [];
    if (r.some(c => c != null && String(c).trim().toLowerCase() === requiredKey.toLowerCase())) {
      return i;
    }
  }
  return -1;
}

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((c, i) => {
    if (c == null) return;
    const key = String(c).trim();
    if (key) map[key] = i;
  });
  return map;
}

function parseKennzahlen(rows) {
  if (!rows || rows.length === 0) return [];
  const hIdx = findHeaderIndex(rows, 'Datum');
  if (hIdx === -1) return [];
  const map = buildHeaderMap(rows[hIdx]);

  const colDate = map['Datum'];
  const colImpr = map['Impressions (insgesamt)'] ?? map['Impressions (organische Updates)'];
  const colKlicks = map['Klicks (insgesamt)'] ?? map['Klicks (organische Updates)'];
  const colReakt = map['Reaktionen (insgesamt)'] ?? map['Reaktionen (organisch)'];
  const colKomm = map['Kommentare (insgesamt)'] ?? map['Kommentare (organische Updates)'];
  const colShare = map['Direkt geteilte Beiträge (insgesamt)'] ?? map['Direkt geteilte Beiträge (organisch)'];
  const colEng = map['Engagement Rate (insgesamt)'] ?? map['Engagement Rate (organische Updates)'];

  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const rawDate = r[colDate];
    if (rawDate == null || rawDate === '') continue;
    const d = parseDate(rawDate);
    if (!d) continue;
    out.push({
      date: d,
      monthKey: MONTH_KEYS[d.getMonth()],
      impressions: toNum(r[colImpr]),
      klicks: toNum(r[colKlicks]),
      reaktionen: toNum(r[colReakt]),
      kommentare: toNum(r[colKomm]),
      shares: toNum(r[colShare]),
      engagementRate: toNum(r[colEng]),
    });
  }
  return out;
}

function parseBeitraege(rows) {
  if (!rows || rows.length === 0) return [];
  const hIdx = findHeaderIndex(rows, 'Titel des Beitrags');
  if (hIdx === -1) return [];
  const map = buildHeaderMap(rows[hIdx]);

  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[map['Titel des Beitrags']]) continue;
    const rawDate = r[map['Erstellt am']];
    const d = rawDate ? parseDate(rawDate) : null;
    const title = String(r[map['Titel des Beitrags']] || '').trim();
    out.push({
      title,
      link: String(r[map['Link veröffentlichen']] || '').trim(),
      type: String(r[map['Art des Beitrags']] || '').trim(),
      author: String(r[map['Veröffentlicht von']] || '').trim(),
      createdAt: d,
      monthKey: d ? MONTH_KEYS[d.getMonth()] : null,
      audience: String(r[map['Zielgruppe']] || '').trim(),
      impressions: toNum(r[map['Impressions']]),
      aufrufe: toNum(r[map['Aufrufe']]),
      klicks: toNum(r[map['Klicks']]),
      ctr: toNum(r[map['Klickrate (CTR)']]),
      likes: toNum(r[map['Likes']]),
      kommentare: toNum(r[map['Kommentare']]),
      shares: toNum(r[map['Direkt geteilte Beiträge']]),
      engagementRate: toNum(r[map['Engagement Rate']]),
    });
  }
  return out;
}

function parseDate(val) {
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + val * 86400000);
  }
  const s = String(val).trim();
  // Format MM/DD/YYYY (LinkedIn export)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
  // Format DD.MM.YYYY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  // ISO
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).replace(/"/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace('%', '').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function injectParsedData(parsed) {
  const { daily, posts, months } = parsed;

  months.forEach((mk) => {
    const idx = MONTH_KEYS.indexOf(mk);
    if (idx === -1) return;

    let existing = getMonthData(mk);
    if (!existing) {
      const year = new Date().getFullYear();
      existing = { label: `${MONTH_NAMES_DE[idx]} ${year}` };
    }

    const monthDaily = daily.filter(d => d.monthKey === mk);
    const monthPosts = posts.filter(p => p.monthKey === mk);

    existing.linkedin = buildLinkedinSection(mk, monthDaily, monthPosts, parsed);
    setMonthData(mk, existing);
  });
}

function buildLinkedinSection(mk, monthDaily, monthPosts, raw) {
  const idx = MONTH_KEYS.indexOf(mk);
  const sumImpr = monthDaily.reduce((a, d) => a + (d.impressions || 0), 0);
  const sumKlicks = monthDaily.reduce((a, d) => a + (d.klicks || 0), 0);
  const sumReakt = monthDaily.reduce((a, d) => a + (d.reaktionen || 0), 0);
  const sumKomm = monthDaily.reduce((a, d) => a + (d.kommentare || 0), 0);
  const sumShare = monthDaily.reduce((a, d) => a + (d.shares || 0), 0);
  const totalEngagement = sumReakt + sumKomm + sumShare;
  const engRate = sumImpr > 0 ? (totalEngagement / sumImpr) * 100 : 0;

  let prevMk = null;
  for (let i = idx - 1; i >= 0; i--) {
    const prev = getMonthData(MONTH_KEYS[i]);
    if (prev && prev.linkedin && prev.linkedin.impressionen && prev.linkedin.impressionen.value) { prevMk = MONTH_KEYS[i]; break; }
  }
  const prev = prevMk ? (getMonthData(prevMk) || {}).linkedin : null;
  const prevImpr = prev ? parseNum(prev.impressionen?.value) : 0;
  const prevKl = prev ? parseNum(prev.klicks?.value) : 0;
  const prevEng = prev ? parseNum(prev.engagement?.value) : 0;
  const prevEngRate = prev ? parseFloat(String(prev.engagementRate?.value || '0').replace('%', '').replace(',', '.')) : 0;

  return {
    impressionen: {
      value: fmt(sumImpr),
      trend: prev ? pctTrend(sumImpr, prevImpr) : null,
      trendDir: prev ? trendDir(sumImpr, prevImpr) : null,
    },
    klicks: {
      value: fmt(sumKlicks),
      trend: prev ? pctTrend(sumKlicks, prevKl) : null,
      trendDir: prev ? trendDir(sumKlicks, prevKl) : null,
    },
    engagement: {
      value: fmt(totalEngagement),
      trend: prev ? pctTrend(totalEngagement, prevEng) : null,
      trendDir: prev ? trendDir(totalEngagement, prevEng) : null,
    },
    engagementRate: {
      value: engRate.toFixed(2).replace('.', ',') + '%',
      trend: prev && prevEngRate ? pctTrend(engRate, prevEngRate) : null,
      trendDir: prev && prevEngRate ? trendDir(engRate, prevEngRate) : null,
    },
    posts: monthPosts,
    daily: monthDaily,
    _prevMonthKey: prevMk,
    _raw: raw,
  };
}

function normalizeServerLinkedinDaily(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(d => {
    const date = d.date instanceof Date ? d.date : (d.date ? new Date(d.date) : null);
    return {
      date,
      monthKey: date ? MONTH_KEYS[date.getMonth()] : (d.month_key || d.monthKey || null),
      impressions: numFromServer(d.impressions),
      klicks: numFromServer(d.klicks),
      reaktionen: numFromServer(d.reaktionen),
      kommentare: numFromServer(d.kommentare),
      shares: numFromServer(d.shares),
      engagementRate: numFromServer(d.engagement_rate ?? d.engagementRate),
    };
  });
}

function normalizeServerLinkedinPosts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(p => {
    const created = p.created_at ?? p.createdAt;
    const date = created instanceof Date ? created : (created ? new Date(created) : null);
    return {
      title: String(p.title || '').trim(),
      link: String(p.link || '').trim(),
      type: String(p.type || '').trim(),
      author: String(p.author || '').trim(),
      createdAt: date,
      monthKey: date ? MONTH_KEYS[date.getMonth()] : (p.month_key || p.monthKey || null),
      audience: String(p.audience || '').trim(),
      impressions: numFromServer(p.impressions),
      aufrufe: numFromServer(p.aufrufe),
      klicks: numFromServer(p.klicks),
      ctr: numFromServer(p.ctr),
      likes: numFromServer(p.likes),
      kommentare: numFromServer(p.kommentare),
      shares: numFromServer(p.shares),
      engagementRate: numFromServer(p.engagement_rate ?? p.engagementRate),
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

export function normalizeLinkedinData(monthKey) {
  const data = getMonthData(monthKey);
  if (!data || !data.linkedin) return;
  const li = data.linkedin;

  const hasComputedKpis = li.impressionen && typeof li.impressionen === 'object' && li.impressionen.value !== undefined
    && li.klicks && typeof li.klicks === 'object' && li.klicks.value !== undefined;

  const rawDailyLen = Array.isArray(li.daily) ? li.daily.length : 0;
  const rawPostsLen = Array.isArray(li.posts) ? li.posts.length : 0;
  const hasAnyRaw = rawDailyLen + rawPostsLen > 0;

  if (hasComputedKpis && !hasAnyRaw) return;

  const postsAlreadyNormalized = rawPostsLen > 0 && li.posts[0] && li.posts[0].engagementRate !== undefined && (li.posts[0].createdAt instanceof Date);
  const dailyAlreadyNormalized = rawDailyLen > 0 && li.daily[0] && li.daily[0].monthKey !== undefined;
  if (hasComputedKpis && postsAlreadyNormalized && dailyAlreadyNormalized) return;

  if (!hasAnyRaw) return;

  const daily = normalizeServerLinkedinDaily(li.daily);
  const posts = normalizeServerLinkedinPosts(li.posts);

  const monthDaily = daily.filter(d => d.monthKey === monthKey);
  const monthPosts = posts.filter(p => p.monthKey === monthKey);

  const monthHasContent = monthDaily.length + monthPosts.length > 0;
  if (!monthHasContent && hasComputedKpis) return;

  const sectionsEmpty = !monthHasContent;
  const useDaily = sectionsEmpty ? daily : monthDaily;
  const usePosts = sectionsEmpty ? posts : monthPosts;

  data.linkedin = buildLinkedinSection(monthKey, useDaily, usePosts, { daily, posts });
  setMonthData(monthKey, data);
}

function fmt(n) {
  return Math.round(n).toLocaleString('de-DE');
}

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

function updateKpis(li) {
  const kpis = {
    'linkedin-impressionen': li.impressionen,
    'linkedin-klicks': li.klicks,
    'linkedin-engagement': li.engagement,
    'linkedin-engagementRate': li.engagementRate,
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

function renderPostsTable(li) {
  const table = document.getElementById('linkedin-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  const sorted = [...li.posts].sort((a, b) => b.impressions - a.impressions);

  sorted.forEach(p => {
    const titleShort = p.title.length > 90 ? p.title.substring(0, 87) + '…' : p.title;
    const titleHtml = p.link
      ? `<a href="${escapeAttr(p.link)}" target="_blank" rel="noopener" class="studycheck-profile-link" title="${escapeAttr(p.title)}">${escapeHtml(titleShort)}</a>`
      : `<span title="${escapeAttr(p.title)}">${escapeHtml(titleShort)}</span>`;
    const dateStr = p.createdAt ? formatDate(p.createdAt) : '–';
    const ctr = (p.ctr * 100).toFixed(2).replace('.', ',') + '%';
    const eng = (p.engagementRate * 100).toFixed(2).replace('.', ',') + '%';

    tbody.innerHTML += `
      <tr>
        <td>${titleHtml}</td>
        <td>${dateStr}</td>
        <td>${fmt(p.impressions)}</td>
        <td>${fmt(p.klicks)}</td>
        <td>${ctr}</td>
        <td>${fmt(p.likes)}</td>
        <td>${fmt(p.kommentare)}</td>
        <td>${eng}</td>
      </tr>`;
  });
}

function renderPostCharts(li, monthKey) {
  const container = document.getElementById('linkedin-charts-container');
  if (!container) return;

  Object.keys(chartInstances).forEach(key => {
    if (key.startsWith('linkedin-post-')) {
      try { chartInstances[key].destroy(); } catch (_) {}
      delete chartInstances[key];
    }
  });

  container.innerHTML = '';

  const posts = (li.posts || []).filter(p => p.impressions > 0);
  if (posts.length === 0) return;

  const sorted = [...posts].sort((a, b) => b.impressions - a.impressions);

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const currentMonthName = monthNames[monthKey] || monthKey;

  sorted.forEach((p, idx) => {
    const canvasId = `linkedin-post-${idx}`;
    const shortTitle = p.title.length > 70 ? p.title.substring(0, 67) + '…' : p.title;
    const dateStr = p.createdAt ? formatDate(p.createdAt) : '';
    const eng = (p.engagementRate * 100).toFixed(2).replace('.', ',') + '%';

    container.innerHTML += `
      <div class="infomaterial-chart-card">
        <div class="infomaterial-chart-header">
          <span class="infomaterial-chart-title" title="${escapeAttr(p.title)}">${escapeHtml(shortTitle)}</span>
          <span class="sg-change">${eng}</span>
        </div>
        <div class="infomaterial-chart-values">
          <span class="sg-current"><span class="sg-dot" style="background:${COLOR_CURRENT}"></span>${dateStr ? dateStr + ' · ' : ''}${currentMonthName}</span>
          <span class="sg-prev"><span class="sg-dot" style="background:${COLOR_PREV}"></span>${p.author || ''}</span>
        </div>
        <div class="infomaterial-chart-wrapper"><canvas id="${canvasId}"></canvas></div>
      </div>
    `;
  });

  requestAnimationFrame(() => {
    sorted.forEach((p, idx) => {
      createPostChart(`linkedin-post-${idx}`, p);
    });
  });
}

function createPostChart(canvasId, post) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const metrics = ['Impressionen', 'Klicks', 'Likes', 'Kommentare', 'Geteilt'];
  const data = [post.impressions, post.klicks, post.likes, post.kommentare, post.shares];

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
      impressions: d.impressions,
      klicks: d.klicks,
      reaktionen: d.reaktionen,
      kommentare: d.kommentare,
      shares: d.shares,
      engagement_rate: d.engagementRate,
    })),
    posts: parsed.posts.map(p => ({
      title: p.title,
      link: p.link,
      type: p.type,
      author: p.author,
      created_at: p.createdAt ? p.createdAt.toISOString().substring(0, 10) : null,
      audience: p.audience,
      impressions: p.impressions,
      aufrufe: p.aufrufe,
      klicks: p.klicks,
      ctr: p.ctr,
      likes: p.likes,
      kommentare: p.kommentare,
      shares: p.shares,
      engagement_rate: p.engagementRate,
    })),
  };
}

function updateLastUpdated() {
  const now = new Date();
  const timestamp = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const titleEl = document.getElementById('linkedin-title');
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
  reportLastUpdated('linkedin').catch(() => {});
}

function showFeedback(type, message) {
  const feedbackEl = document.getElementById('linkedin-upload-feedback');
  if (!feedbackEl) return;

  feedbackEl.className = 'upload-feedback';
  feedbackEl.classList.add(`upload-${type}`);
  feedbackEl.textContent = message;
  feedbackEl.style.display = 'block';

  if (type === 'success') {
    const uploadArea = document.getElementById('linkedin-upload-area');
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

