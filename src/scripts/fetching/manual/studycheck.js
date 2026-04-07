import { getMonthData, setMonthData, uploadStudycheckTable, reportLastUpdated } from '../../data.js';
import { getCurrentMonth } from '../../month-selector.js';

const chartInstances = {};

const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const COLOR_CURRENT = '#00b67a';
const COLOR_PREV = '#334155';
const COLOR_CURRENT_BG = 'rgba(0,182,122,0.85)';
const COLOR_PREV_BG = 'rgba(51,65,85,0.6)';

export function initStudycheck() {
  setupUploadHandlers();
}

export function destroyStudycheckCharts() {
  Object.keys(chartInstances).forEach(key => {
    try { chartInstances[key].destroy(); } catch (_) {}
    delete chartInstances[key];
  });
}

export function renderStudycheckTab(monthKey) {
  const data = getMonthData(monthKey);
  if (!data || !data.studycheck) {
    toggleSections(false);
    return;
  }

  const sc = data.studycheck;

  if (!sc.profile || sc.profile.length === 0) {
    toggleSections(false);
    return;
  }

  toggleSections(true);
  updateKpis(sc);
  renderProfileTable(sc);
  renderProfileCharts(sc, monthKey);
}

function toggleSections(visible) {
  ['studycheck-section-table', 'studycheck-section-charts'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  });
}

function setupUploadHandlers() {
  const uploadArea = document.getElementById('studycheck-upload-area');
  const fileInput = document.getElementById('studycheck-file-input');

  if (!uploadArea || !fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processCSVFile(file);
  });
}

async function processCSVFile(file) {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (ext !== '.csv') {
    showFeedback('error', 'Bitte eine CSV-Datei (.csv) hochladen.');
    return;
  }

  showFeedback('loading', 'Datei wird verarbeitet…');

  try {
    const text = await readFileAsText(file);
    const parsed = parseStudycheckCSV(text);

    if (!parsed) {
      showFeedback('error', 'Die CSV-Datei konnte nicht verarbeitet werden. Bitte prüfe das Format.');
      return;
    }

    if (parsed.months.length === 0) {
      showFeedback('error', 'Kein gültiger Auswertungszeitraum in der CSV gefunden.');
      return;
    }

    const payload = buildTablePayload(parsed);

    showFeedback('loading', 'Daten werden an API gesendet…');
    let uploadOk = false;
    try {
      await uploadStudycheckTable(payload);
      uploadOk = true;
    } catch (apiErr) {
      console.warn('API upload failed (data still applied locally):', apiErr.message);
    }

    injectParsedData(parsed);

    const currentMonth = getCurrentMonth();
    if (currentMonth) {
      renderStudycheckTab(currentMonth);
      const tabBtn = document.querySelector('.tab-btn[data-tab="studycheck"]');
      if (tabBtn) tabBtn.classList.remove('disabled');
    }

    if (uploadOk) updateLastUpdated();

    const monthLabels = parsed.months.map(m => MONTH_NAMES_DE[MONTH_KEYS.indexOf(m)]).filter(Boolean).join(', ');
    showFeedback('success', `✓ ${file.name} erfolgreich hochgeladen – ${parsed.profiles.length} Profile erkannt (${monthLabels})`);
  } catch (err) {
    console.error('CSV parsing error:', err);
    showFeedback('error', 'Fehler beim Lesen der Datei: ' + err.message);
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

function parseStudycheckCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 5) return null;

  let sep = ',';
  if (lines[0].trim().startsWith('sep=')) {
    sep = lines[0].trim().replace('sep=', '').trim() || ',';
  }

  let months = [];
  let dateRangeStr = '';
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    if (line.includes('Auswertungszeitraum')) {
      dateRangeStr = line.replace(/"/g, '').trim();
      months = extractMonthsFromRange(dateRangeStr);
      break;
    }
  }

  if (months.length === 0) {
    const now = new Date();
    const mk = MONTH_KEYS[now.getMonth() > 0 ? now.getMonth() - 1 : 11];
    months = [mk];
  }

  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    if (lines[i].includes('Profilbezeichnung')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headerCells = parseCSVRow(lines[headerIdx], sep);

  let subHeaderCells = null;
  if (headerIdx + 1 < lines.length) {
    const nextLine = lines[headerIdx + 1];
    if (nextLine.includes('Anzahl Klicks') || nextLine.includes('Klickrate') || nextLine.includes('Einmalige Besucher')) {
      subHeaderCells = parseCSVRow(nextLine, sep);
    }
  }

  const colMap = buildColumnMapping(headerCells, subHeaderCells);
  if (colMap.profilbezeichnung === -1) return null;

  const dataStartIdx = subHeaderCells ? headerIdx + 2 : headerIdx + 1;
  const profiles = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseCSVRow(line, sep);
    const name = (cells[colMap.profilbezeichnung] || '').trim();
    if (!name) continue;

    const profile = {
      name,
      link: colMap.profilLink >= 0 ? (cells[colMap.profilLink] || '').trim() : '',
      profiltyp: colMap.profiltyp >= 0 ? (cells[colMap.profiltyp] || '').trim() : '',
      seitenaufrufe: parseNum(cells[colMap.seitenaufrufe]),
      klicksExtern: parseNum(cells[colMap.klicksExtern]),
      klickrate: parseRate(cells[colMap.klickrate]),
      besucherEinmalig: parseNum(cells[colMap.besucherEinmalig]),
      besucherWiederkehrend: parseNum(cells[colMap.besucherWiederkehrend]),
      einblendungen: parseNum(cells[colMap.einblendungen]),
      einblendungenKlicks: parseNum(cells[colMap.einblendungenKlicks]),
      leads: parseNum(cells[colMap.leads]),
    };

    profile.besucherGesamt = profile.besucherEinmalig + profile.besucherWiederkehrend;

    profiles.push(profile);
  }

  if (profiles.length === 0) return null;

  return { profiles, months, dateRange: dateRangeStr };
}

function extractMonthsFromRange(str) {
  const match = str.match(/:\s*(.+?)\s*-\s*(.+)/);
  if (!match) return [];

  const startParts = match[1].trim().split(/\s+/);
  const endParts = match[2].trim().split(/\s+/);

  const startMonth = MONTH_NAMES_DE.indexOf(startParts[0]);
  const endMonth = MONTH_NAMES_DE.indexOf(endParts[0]);

  if (startMonth === -1 || endMonth === -1) return [];

  const months = [];
  for (let m = startMonth; m <= endMonth; m++) {
    months.push(MONTH_KEYS[m]);
  }

  return months.length > 0 ? months : [MONTH_KEYS[endMonth]];
}

function buildColumnMapping(headerCells, subHeaderCells) {
  const map = {
    profilbezeichnung: -1,
    profilLink: -1,
    profiltyp: -1,
    seitenaufrufe: -1,
    klicksExtern: -1,
    klickrate: -1,
    besucherEinmalig: -1,
    besucherWiederkehrend: -1,
    einblendungen: -1,
    einblendungenKlicks: -1,
    leads: -1,
  };

  for (let i = 0; i < headerCells.length; i++) {
    const h = (headerCells[i] || '').trim().toLowerCase();
    const s = subHeaderCells ? (subHeaderCells[i] || '').trim().toLowerCase() : '';

    if (h.includes('profilbezeichnung')) { map.profilbezeichnung = i; continue; }
    if (h.includes('profil-link')) { map.profilLink = i; continue; }
    if (h.includes('profiltyp')) { map.profiltyp = i; continue; }
    if (h.includes('seitenaufrufe')) { map.seitenaufrufe = i; continue; }
    if (h === 'leads' || h.includes('leads')) { map.leads = i; continue; }

    if (h.includes('klicks auf externe')) {
      map.klicksExtern = i;
      if (i + 1 < headerCells.length) {
        const nextH = (headerCells[i + 1] || '').trim();
        if (!nextH) map.klickrate = i + 1;
      }
      continue;
    }

    if (h.includes('besucher auf dem profil') || h.includes('besucher')) {
      map.besucherEinmalig = i;
      if (i + 1 < headerCells.length) {
        const nextH = (headerCells[i + 1] || '').trim();
        if (!nextH) map.besucherWiederkehrend = i + 1;
      }
      continue;
    }

    if (h.includes('prominente verlinkungen') || h.includes('prominente')) {
      map.einblendungen = i;
      if (i + 1 < headerCells.length) {
        const nextH = (headerCells[i + 1] || '').trim();
        if (!nextH) map.einblendungenKlicks = i + 1;
      }
      continue;
    }

    if (!h && s) {
      if (s.includes('klickrate') && map.klickrate === -1) map.klickrate = i;
      else if (s.includes('einmalige besucher')) map.besucherEinmalig = i;
      else if (s.includes('wiederkehrende besucher')) map.besucherWiederkehrend = i;
      else if (s.includes('anzahl einblendungen')) map.einblendungen = i;
      else if (s.includes('anzahl klicks') && map.einblendungenKlicks === -1) map.einblendungenKlicks = i;
    }
  }

  if (map.profilbezeichnung === -1 && headerCells.length > 0) map.profilbezeichnung = 0;

  return map;
}

function parseCSVRow(line, sep) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  cells.push(current);

  return cells;
}

function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  const s = String(val).replace(/"/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
  return parseInt(s, 10) || 0;
}

function parseRate(val) {
  if (val === undefined || val === null || val === '') return '0%';
  const s = String(val).replace(/"/g, '').trim();
  if (s.includes('%')) return s;
  return s.replace(',', '.') + '%';
}

function injectParsedData(parsed) {
  const { profiles, months } = parsed;

  const hochschulprofil = profiles.find(p => p.name === 'Hochschulprofil');
  const programProfiles = profiles.filter(p => p.name !== 'Hochschulprofil');

  let totalSeitenaufrufe = 0;
  let totalKlicks = 0;
  let totalBesucher = 0;
  let totalEinblendungen = 0;

  profiles.forEach(p => {
    totalSeitenaufrufe += p.seitenaufrufe;
    totalKlicks += p.klicksExtern;
    totalBesucher += p.besucherGesamt;
    totalEinblendungen += p.einblendungen;
  });

  months.forEach((mk) => {
    const idx = MONTH_KEYS.indexOf(mk);
    if (idx === -1) return;

    let existing = getMonthData(mk);
    if (!existing) {
      existing = { label: `${MONTH_NAMES_DE[idx]} 2026` };
    }

    let prevMk = null;
    for (let i = idx - 1; i >= 0; i--) {
      const prevData = getMonthData(MONTH_KEYS[i]);
      if (prevData && prevData.studycheck) {
        prevMk = MONTH_KEYS[i];
        break;
      }
    }

    const prevSc = prevMk ? (getMonthData(prevMk) || {}).studycheck : null;

    existing.studycheck = {
      seitenaufrufe: {
        value: fmt(totalSeitenaufrufe),
        trend: prevSc ? pctTrend(totalSeitenaufrufe, parseNum(prevSc.seitenaufrufe.value)) : null,
        trendDir: prevSc ? trendDir(totalSeitenaufrufe, parseNum(prevSc.seitenaufrufe.value)) : null,
      },
      klicks: {
        value: fmt(totalKlicks),
        trend: prevSc ? pctTrend(totalKlicks, parseNum(prevSc.klicks.value)) : null,
        trendDir: prevSc ? trendDir(totalKlicks, parseNum(prevSc.klicks.value)) : null,
      },
      besucher: {
        value: fmt(totalBesucher),
        trend: prevSc ? pctTrend(totalBesucher, parseNum(prevSc.besucher.value)) : null,
        trendDir: prevSc ? trendDir(totalBesucher, parseNum(prevSc.besucher.value)) : null,
      },
      profile: profiles,
      programProfiles,
      hochschulprofil: hochschulprofil || null,
      _prevMonthKey: prevMk,
      _raw: parsed,
    };

    setMonthData(mk, existing);
  });
}

function fmt(n) {
  return n.toLocaleString('de-DE');
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

function updateKpis(sc) {
  const kpis = {
    'studycheck-seitenaufrufe': sc.seitenaufrufe,
    'studycheck-klicks': sc.klicks,
    'studycheck-besucher': sc.besucher,
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

function renderProfileTable(sc) {
  const table = document.getElementById('studycheck-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  if (!sc.profile || sc.profile.length === 0) return;

  sc.profile.forEach(p => {
    const nameHtml = p.link
      ? `<a href="${p.link}" target="_blank" rel="noopener" class="studycheck-profile-link">${p.name}</a>`
      : p.name;

    tbody.innerHTML += `
      <tr>
        <td>${nameHtml}</td>
        <td>${fmt(p.seitenaufrufe)}</td>
        <td>${fmt(p.klicksExtern)}</td>
        <td>${p.klickrate}</td>
        <td>${fmt(p.besucherGesamt)}</td>
        <td>${fmt(p.einblendungen)}</td>
      </tr>`;
  });
}

function renderProfileCharts(sc, monthKey) {
  const container = document.getElementById('studycheck-charts-container');
  if (!container) return;

  Object.keys(chartInstances).forEach(key => {
    if (key.startsWith('studycheck-pg-')) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  });

  container.innerHTML = '';

  const profiles = (sc.programProfiles || sc.profile || []).filter(p => p.seitenaufrufe > 0);
  if (profiles.length === 0) return;

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const currentMonthName = monthNames[monthKey] || monthKey;

  const prevMk = sc._prevMonthKey || null;
  const prevMonthName = prevMk ? monthNames[prevMk] : null;
  const prevSc = prevMk ? ((getMonthData(prevMk) || {}).studycheck || null) : null;
  const prevProfiles = prevSc ? (prevSc.programProfiles || prevSc.profile || []) : [];

  profiles.forEach((p, idx) => {
    const canvasId = `studycheck-pg-${idx}`;
    const shortName = p.name.length > 55 ? p.name.substring(0, 52) + '…' : p.name;

    const prevP = prevProfiles.find(pp => pp.name === p.name);
    const prevViews = prevP ? prevP.seitenaufrufe : 0;
    const change = prevViews > 0 ? (((p.seitenaufrufe - prevViews) / prevViews) * 100) : null;
    const changeStr = change !== null
      ? `<span class="sg-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')}%</span>`
      : '';

    container.innerHTML += `
      <div class="infomaterial-chart-card">
        <div class="infomaterial-chart-header">
          <span class="infomaterial-chart-title" title="${p.name}">${shortName}</span>
          ${changeStr}
        </div>
        <div class="infomaterial-chart-values">
          <span class="sg-current"><span class="sg-dot" style="background:${COLOR_CURRENT}"></span>${currentMonthName}: <strong>${p.seitenaufrufe}</strong></span>
          ${prevP && prevMonthName ? `<span class="sg-prev"><span class="sg-dot" style="background:${COLOR_PREV}"></span>${prevMonthName}: <strong>${prevViews}</strong></span>` : ''}
        </div>
        <div class="infomaterial-chart-wrapper"><canvas id="${canvasId}"></canvas></div>
      </div>
    `;
  });

  requestAnimationFrame(() => {
    profiles.forEach((p, idx) => {
      const canvasId = `studycheck-pg-${idx}`;
      const prevP = prevProfiles.find(pp => pp.name === p.name);
      createProfileChart(canvasId, p, prevP, currentMonthName, prevMonthName);
    });
  });
}

function createProfileChart(canvasId, profile, prevProfile, currentLabel, prevLabel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const metrics = ['Seitenaufrufe', 'Ext. Klicks', 'Besucher'];
  const currentData = [profile.seitenaufrufe, profile.klicksExtern, profile.besucherGesamt];
  const prevData = prevProfile ? [prevProfile.seitenaufrufe, prevProfile.klicksExtern, prevProfile.besucherGesamt] : null;

  const datasets = [];
  if (prevData && prevLabel) {
    datasets.push({
      label: prevLabel,
      data: prevData,
      backgroundColor: COLOR_PREV_BG,
      borderColor: COLOR_PREV,
      borderWidth: 1,
      borderRadius: 6,
      maxBarThickness: 36,
    });
  }
  datasets.push({
    label: currentLabel,
    data: currentData,
    backgroundColor: COLOR_CURRENT_BG,
    borderColor: COLOR_CURRENT,
    borderWidth: 1,
    borderRadius: 6,
    maxBarThickness: 36,
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels: metrics, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'top', labels: { boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y}` } },
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
  const rows = parsed.profiles.map(p => ({
    name: p.name,
    link: p.link,
    profiltyp: p.profiltyp,
    seitenaufrufe: p.seitenaufrufe,
    klicks_extern: p.klicksExtern,
    klickrate: p.klickrate,
    besucher_einmalig: p.besucherEinmalig,
    besucher_wiederkehrend: p.besucherWiederkehrend,
    einblendungen: p.einblendungen,
    einblendungen_klicks: p.einblendungenKlicks,
    leads: p.leads,
  }));

  return {
    months: parsed.months,
    dateRange: parsed.dateRange,
    rows,
  };
}

function updateLastUpdated() {
  const now = new Date();
  const timestamp = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const titleEl = document.getElementById('studycheck-title');
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
  reportLastUpdated('studycheck').catch(() => {});
}

function showFeedback(type, message) {
  const feedbackEl = document.getElementById('studycheck-upload-feedback');
  if (!feedbackEl) return;

  feedbackEl.className = 'upload-feedback';
  feedbackEl.classList.add(`upload-${type}`);
  feedbackEl.textContent = message;
  feedbackEl.style.display = 'block';

  if (type === 'success') {
    const uploadArea = document.getElementById('studycheck-upload-area');
    if (uploadArea) {
      uploadArea.classList.add('upload-success');
      setTimeout(() => uploadArea.classList.remove('upload-success'), 2000);
    }
  }

  if (type !== 'loading') {
    setTimeout(() => { feedbackEl.style.display = 'none'; }, 6000);
  }
}
