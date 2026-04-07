import { getMonthData, setMonthData, getMonthOrder, uploadInfomaterialTable, reportLastUpdated } from './data.js';
import { getCurrentMonth } from './month-selector.js';

const chartInstances = {};

const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const COLOR_CURRENT = '#6366f1';
const COLOR_PREV = '#334155';
const COLOR_CURRENT_BG = 'rgba(99,102,241,0.85)';
const COLOR_PREV_BG = 'rgba(51,65,85,0.6)';

const FACULTY_MAP = {
  'Fakultät Design': ['Grafikdesign Screen- & Printmedia (B.A.)', 'Digital Media Design (B.A.)', 'Creative Direction (M.A.)', 'Creative Direction (M.A.) berufsbegleitend', 'Games & XR Management (M.A.)', 'Games & XR Management (M.A.) berufsbegleitend'],
  'Fakultät ASW': ['Sozialpädagogik & -management (B.A.)', 'Sozialpädagogik & -management (B.A.) berufsbegleitend', 'Sozialpädagogik & -management (B.A.) berufsbegleitend - Lernzentrum Annaberg-Buchholz', 'Pflege- & Gesundheitsmanagement (B.A.)', 'Pflege- & Gesundheitsmanagement (B.A.) berufsbegleitend', 'Pflege- & Gesundheitsmanagement (B.A.) berufsbegleitend - Lernzentrum Annaberg-Buchholz', 'Pflege- & Gesundheitsmanagement (B.A.) berufsbegleitend - Lernzentrum Neustadt in Sachsen', 'Berufspädagogik für Pflege- & Gesundheitsberufe (M.A.) berufsbegleitend', 'Soziale Arbeit & Management (M.A.)', 'Soziale Arbeit & Management (M.A.) berufsbegleitend', 'Berufspädagogik für Pflege- & Gesundheitsberufe (B.A.) berufsbegleitend'],
  'Fakultät BW': ['Business Administration (B.A.)', 'Business Administration (B.A.) berufsbegleitend', 'Business Administration (B.A.) berufsbegleitend - Lernzentrum Annaberg-Buchholz', 'Tourismus & Event Management (B.A.)', 'Tourismus & Event Management (B.A.) berufsbegleitend', 'Leadership, Entrepreneurship & Innovation (M.A.)', 'Leadership, Entrepreneurship & Innovation (M.A.) berufsbegleitend']
};

const FACULTY_COLORS = {
  'Fakultät Design': '#a855f7',
  'Fakultät ASW': '#06b6d4',
  'Fakultät BW': '#f59e0b'
};

export function initInfomaterial() {
  setupUploadHandlers();
}

export function destroyInfomaterialCharts() {
  Object.keys(chartInstances).forEach(key => {
    try { chartInstances[key].destroy(); } catch (_) {}
    delete chartInstances[key];
  });
}

export function renderInfomaterialTab(monthKey) {
  const data = getMonthData(monthKey);
  if (!data || !data.infomaterial) {
    toggleInfomaterialSections(false);
    return;
  }

  const info = data.infomaterial;

  const rawGesamt = info.gesamt && info.gesamt.value;
  const gesamtNum = typeof rawGesamt === 'number'
    ? rawGesamt
    : parseInt(String(rawGesamt || '0').replace(/\./g, '').replace(',', '.'), 10);
  if (!gesamtNum || gesamtNum <= 0) {
    toggleInfomaterialSections(false);
    return;
  }

  toggleInfomaterialSections(true);
  updateInfoKpis(info, monthKey);
  renderFacultySummary(info, monthKey);
  renderProgramCharts(info, monthKey);
}

function toggleInfomaterialSections(visible) {
  ['infomaterial-section-faculty', 'infomaterial-section-charts'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  });
}

function setupUploadHandlers() {
  const uploadArea = document.getElementById('infomaterial-upload-area');
  const fileInput = document.getElementById('infomaterial-file-input');
  const uploadBtn = document.getElementById('infomaterial-upload-btn');

  if (!uploadArea || !fileInput) return;

  let pickerOpen = false;
  const openFilePicker = () => {
    if (pickerOpen) return;
    pickerOpen = true;
    fileInput.value = '';
    fileInput.click();
    setTimeout(() => { pickerOpen = false; }, 500);
  };

  if (uploadBtn) {
    uploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openFilePicker();
    });
  }
  uploadArea.addEventListener('click', (e) => {
    if (e.target === fileInput || e.target.closest('.upload-btn')) return;
    openFilePicker();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processExcelFile(file);
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processExcelFile(file);
  });
}

async function processExcelFile(file) {
  const validExt = ['.xlsx', '.xls'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExt.includes(ext)) {
    showUploadFeedback('error', 'Bitte eine Excel-Datei (.xlsx/.xls) hochladen.');
    return;
  }

  showUploadFeedback('loading', 'Datei wird verarbeitet…');

  try {
    const data = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });

    const validationError = validateExcelFormat(json);
    if (validationError) {
      showUploadFeedback('error', validationError);
      return;
    }

    const parsed = parseInfomaterialSheet(json);
    if (!parsed) {
      showUploadFeedback('error', 'Die Datei konnte nicht verarbeitet werden. Bitte prüfe das Format.');
      return;
    }

    const tablePayload = buildTablePayload(json);

    showUploadFeedback('loading', 'Daten werden an API gesendet…');
    let uploadOk = false;
    try {
      await uploadInfomaterialTable(tablePayload);
      uploadOk = true;
    } catch (apiErr) {
      console.warn('API upload failed (data still applied locally):', apiErr.message);
    }

    injectParsedData(parsed);

    const currentMonth = getCurrentMonth();
    if (currentMonth) {
      renderInfomaterialTab(currentMonth);
      const tabBtn = document.querySelector('.tab-btn[data-tab="infomaterial"]');
      if (tabBtn) tabBtn.classList.remove('disabled');
    }

    if (uploadOk) updateLastUpdated();
    showUploadFeedback('success', `✓ ${file.name} erfolgreich hochgeladen – ${parsed.programs.length} Studiengänge erkannt`);
  } catch (err) {
    console.error('Excel parsing error:', err);
    showUploadFeedback('error', 'Fehler beim Lesen der Datei: ' + err.message);
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

function validateExcelFormat(rows) {
  if (!rows || rows.length < 5) {
    return 'Die Datei enthält zu wenige Zeilen. Erwartetes Format: Zählung + Monatsspalten.';
  }

  let headerRow = null;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => String(cell).trim() === 'Zählung')) {
      headerRow = row;
      break;
    }
  }

  if (!headerRow) {
    return 'Ungültiges Format: Spalte „Zählung" nicht gefunden. Die erste Spalte muss „Zählung" heißen.';
  }

  const headerCells = headerRow.map(c => String(c).trim());
  const requiredMonths = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const missingMonths = requiredMonths.filter(m => !headerCells.includes(m));

  if (missingMonths.length > 0) {
    return `Ungültiges Format: Monatsspalten fehlen: ${missingMonths.join(', ')}`;
  }

  const firstCells = rows.map(r => (r && r[0]) ? String(r[0]).trim() : '');
  const hasTotal = firstCells.some(c => c.startsWith('Gesamt '));
  const hasChange = firstCells.includes('Veränderung');

  if (!hasTotal) {
    return 'Ungültiges Format: Zeile „Gesamt 20XX" nicht gefunden.';
  }
  if (!hasChange) {
    return 'Ungültiges Format: Zeile „Veränderung" nicht gefunden.';
  }

  return null;
}

function buildTablePayload(rows) {
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i] && rows[i].some(cell => String(cell).trim() === 'Zählung')) {
      headerRowIdx = i;
      break;
    }
  }

  const header = rows[headerRowIdx];
  const columns = header.map(c => String(c).trim());

  const dataRows = [];
  let emptyCount = 0;
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !String(row[0] || '').trim()) {
      emptyCount++;
      if (emptyCount >= 3) break;
      continue;
    }
    emptyCount = 0;

    const name = String(row[0] || '').trim();
    if (name === 'Fakultät') continue;

    const rowObj = {};
    columns.forEach((col, idx) => {
      if (col === 'Zählung') {
        rowObj[col] = name;
      } else {
        rowObj[col] = idx < row.length ? (row[idx] ?? 0) : 0;
      }
    });
    dataRows.push(rowObj);
  }

  return { columns, rows: dataRows };
}

function parseInfomaterialSheet(rows) {
  if (!rows || rows.length < 3) return null;

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => {
      const s = String(cell).trim();
      return s === 'Zählung' || s === 'Januar' || s.toLowerCase().includes('zählung');
    })) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return null;

  const header = rows[headerRowIdx];

  const monthColIdx = {};
  for (let c = 0; c < header.length; c++) {
    const cell = String(header[c]).trim();
    for (let m = 0; m < MONTH_NAMES_DE.length; m++) {
      if (cell === MONTH_NAMES_DE[m]) {
        monthColIdx[MONTH_KEYS[m]] = c;
        break;
      }
    }
  }

  const programs = [];
  const totalRows = {};
  let facultyBlock = [];
  let inFacultyBlock = false;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const name = String(row[0] || '').trim();
    if (!name) continue;

    if (name === 'Fakultät' || name.startsWith('Fakultät ')) {
      inFacultyBlock = true;
    }

    if (inFacultyBlock) {
      if (name.startsWith('Fakultät ')) {
        const facultyData = { name };
        MONTH_KEYS.forEach(mk => {
          const ci = monthColIdx[mk];
          facultyData[mk] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
        });
        facultyBlock.push(facultyData);
      }
      continue;
    }

    if (name.startsWith('Gesamt ')) {
      const year = name.replace('Gesamt ', '');
      totalRows[year] = {};
      MONTH_KEYS.forEach(mk => {
        const ci = monthColIdx[mk];
        totalRows[year][mk] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
      });
      continue;
    }

    if (name === 'Veränderung') {
      const changeRow = {};
      MONTH_KEYS.forEach(mk => {
        const ci = monthColIdx[mk];
        if (ci !== undefined) {
          const raw = row[ci];
          if (typeof raw === 'number') {
            changeRow[mk] = raw * 100;
          } else {
            const s = String(raw).replace('%', '').replace(',', '.').trim();
            changeRow[mk] = parseFloat(s) || 0;
          }
        } else {
          changeRow[mk] = 0;
        }
      });
      totalRows['_change'] = changeRow;
      continue;
    }

    const programData = { name };
    MONTH_KEYS.forEach(mk => {
      const ci = monthColIdx[mk];
      programData[mk] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
    });
    programs.push(programData);
  }

  return { programs, totalRows, faculties: facultyBlock };
}

function injectParsedData(parsed) {
  const monthOrder = getMonthOrder();
  const changeRow = parsed.totalRows['_change'] || {};
  const total2026 = parsed.totalRows['2026'] || {};
  const total2025 = parsed.totalRows['2025'] || {};

  const monthTotals = {};
  monthOrder.forEach(mk => {
    let t = total2026[mk] || 0;
    if (t === 0) {
      parsed.programs.forEach(pg => { t += (pg[mk] || 0); });
    }
    monthTotals[mk] = t;
  });

  monthOrder.forEach((mk, idx) => {
    const total = monthTotals[mk];

    let bachelorTotal = 0;
    let masterTotal = 0;
    parsed.programs.forEach(pg => {
      const val = pg[mk] || 0;
      if (pg.name.includes('(B.A.)')) bachelorTotal += val;
      if (pg.name.includes('(M.A.)')) masterTotal += val;
    });

    const changePct = changeRow[mk] || null;
    const prevYearTotal = total2025[mk] || 0;

    let prevMk = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (monthTotals[monthOrder[i]] > 0) {
        prevMk = monthOrder[i];
        break;
      }
    }

    const faculties = {};
    if (parsed.faculties && parsed.faculties.length > 0) {
      parsed.faculties.forEach(f => {
        faculties[f.name] = f[mk] || 0;
      });
    } else {
      Object.entries(FACULTY_MAP).forEach(([facultyName, programNames]) => {
        let sum = 0;
        programNames.forEach(pgName => {
          const pg = parsed.programs.find(s => s.name === pgName);
          if (pg) sum += (pg[mk] || 0);
        });
        faculties[facultyName] = sum;
      });
    }

    const facultiesPrev = {};
    if (prevMk) {
      if (parsed.faculties && parsed.faculties.length > 0) {
        parsed.faculties.forEach(f => {
          facultiesPrev[f.name] = f[prevMk] || 0;
        });
      } else {
        Object.entries(FACULTY_MAP).forEach(([facultyName, programNames]) => {
          let sum = 0;
          programNames.forEach(pgName => {
            const pg = parsed.programs.find(s => s.name === pgName);
            if (pg) sum += (pg[prevMk] || 0);
          });
          facultiesPrev[facultyName] = sum;
        });
      }
    }

    const programsData = parsed.programs.map(pg => {
      const prev = prevMk ? (pg[prevMk] || 0) : 0;
      return {
        name: pg.name,
        current: pg[mk] || 0,
        previous: prev
      };
    });

    if (total === 0 && bachelorTotal === 0 && masterTotal === 0) return;

    let existing = getMonthData(mk);
    if (!existing) {
      existing = { label: `${MONTH_NAMES_DE[idx]} 2026` };
    }

    let changeValue = '—';
    let changeTrendDir = null;
    let changeTrend = null;

    if (changePct !== null && changePct !== 0) {
      const v = changePct;
      changeValue = `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%`;
      changeTrendDir = v >= 0 ? 'up-good' : 'down-bad';
      changeTrend = `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(2).replace('.', ',')}%`;
    } else if (total > 0 && prevYearTotal === 0) {
      changeValue = 'neu';
      changeTrendDir = 'up-good';
      changeTrend = null;
    }

    existing.infomaterial = {
      gesamt: { value: total.toLocaleString('de-DE'), detail: prevYearTotal > 0 ? `Vorjahr: ${prevYearTotal.toLocaleString('de-DE')}` : '' },
      bachelor: { value: bachelorTotal.toLocaleString('de-DE') },
      master: { value: masterTotal.toLocaleString('de-DE') },
      veraenderung: {
        value: changeValue,
        trendDir: changeTrendDir,
        trend: changeTrend,
        deltaMode: true,
        positive: changePct !== null ? changePct >= 0 : true
      },
      fakultaeten: faculties,
      fakultaetenPrev: facultiesPrev,
      studiengaenge: programsData,
      _prevMonthKey: prevMk,
      _raw: parsed
    };

    setMonthData(mk, existing);
  });
}

function updateInfoKpis(info) {
  const kpis = {
    'infomaterial-gesamt': info.gesamt,
    'infomaterial-bachelor': info.bachelor,
    'infomaterial-master': info.master,
    'infomaterial-veraenderung': info.veraenderung
  };

  Object.entries(kpis).forEach(([id, val]) => {
    if (!val) return;
    const el = document.querySelector(`[data-kpi="${id}"]`);
    if (!el) return;
    const valueEl = el.querySelector('.kpi-value');
    if (valueEl) {
      valueEl.textContent = val.value;
      valueEl.classList.remove('delta-positive', 'delta-negative');
      if (id === 'infomaterial-veraenderung' && val.trendDir) {
        valueEl.classList.add(val.trendDir.includes('good') || val.trendDir === 'up' ? 'delta-positive' : 'delta-negative');
      }
    }
  });
}

function renderFacultySummary(info, monthKey) {
  const container = document.getElementById('infomaterial-faculty-cards');
  if (!container) return;

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const monthName = monthNames[monthKey] || monthKey;
  const prevMk = info._prevMonthKey || null;
  const prevMonthLabel = prevMk ? monthNames[prevMk] : 'Vormonat';

  container.innerHTML = '';

  const facultyEntries = Object.entries(info.fakultaeten || {});
  if (facultyEntries.length === 0) return;

  facultyEntries.forEach(([name, value]) => {
    const prevValue = info.fakultaetenPrev ? (info.fakultaetenPrev[name] || 0) : 0;
    const change = prevValue > 0 ? (((value - prevValue) / prevValue) * 100) : null;
    const color = FACULTY_COLORS[name] || '#6366f1';
    const icon = name.includes('Design') ? '🎨' : name.includes('ASW') ? '🤝' : '📊';

    const changeHtml = change !== null
      ? `<span class="faculty-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1).replace('.', ',')}%</span>`
      : '';

    container.innerHTML += `
      <div class="infomaterial-faculty-card" style="--faculty-color: ${color}">
        <div class="faculty-card-header">
          <span class="faculty-icon">${icon}</span>
          <span class="faculty-name">${name}</span>
        </div>
        <div class="faculty-value">${value.toLocaleString('de-DE')}</div>
        <div class="faculty-footer">
          <span class="faculty-month">${monthName}</span>
          ${changeHtml}
        </div>
        ${prevValue > 0 ? `<div class="faculty-prev">${prevMonthLabel}: ${prevValue.toLocaleString('de-DE')}</div>` : ''}
      </div>
    `;
  });
}

function renderProgramCharts(info, monthKey) {
  const container = document.getElementById('infomaterial-charts-container');
  if (!container) return;

  Object.keys(chartInstances).forEach(key => {
    if (key.startsWith('infomaterial-pg-')) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  });

  container.innerHTML = '';

  if (!info.studiengaenge || info.studiengaenge.length === 0) return;

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const currentMonthName = monthNames[monthKey] || monthKey;
  const prevMk = info._prevMonthKey || null;
  const prevMonthName = prevMk ? monthNames[prevMk] : null;

  const activePrograms = info.studiengaenge.filter(pg => pg.current > 0 || pg.previous > 0);

  activePrograms.forEach((pg, idx) => {
    const canvasId = `infomaterial-pg-${idx}`;
    const shortName = pg.name.length > 55 ? pg.name.substring(0, 52) + '…' : pg.name;
    const change = pg.previous > 0 ? (((pg.current - pg.previous) / pg.previous) * 100) : null;
    const changeStr = change !== null
      ? `<span class="sg-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')}%</span>`
      : '';

    container.innerHTML += `
      <div class="infomaterial-chart-card">
        <div class="infomaterial-chart-header">
          <span class="infomaterial-chart-title" title="${pg.name}">${shortName}</span>
          ${changeStr}
        </div>
        <div class="infomaterial-chart-values">
          <span class="sg-current"><span class="sg-dot" style="background:${COLOR_CURRENT}"></span>${currentMonthName}: <strong>${pg.current}</strong></span>
          ${prevMonthName ? `<span class="sg-prev"><span class="sg-dot" style="background:${COLOR_PREV}"></span>${prevMonthName}: <strong>${pg.previous}</strong></span>` : ''}
        </div>
        <div class="infomaterial-chart-wrapper"><canvas id="${canvasId}"></canvas></div>
      </div>
    `;
  });

  requestAnimationFrame(() => {
    activePrograms.forEach((pg, idx) => {
      const canvasId = `infomaterial-pg-${idx}`;
      createProgramChart(canvasId, pg, currentMonthName, prevMonthName);
    });
  });
}

function createProgramChart(canvasId, pg, currentLabel, prevLabel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = prevLabel ? [prevLabel, currentLabel] : [currentLabel];
  const data = prevLabel ? [pg.previous, pg.current] : [pg.current];
  const bgColors = prevLabel
    ? [COLOR_PREV_BG, COLOR_CURRENT_BG]
    : [COLOR_CURRENT_BG];
  const borderColors = prevLabel
    ? [COLOR_PREV, COLOR_CURRENT]
    : [COLOR_CURRENT];

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Anfragen',
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} Anfragen`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: Math.max(1, Math.ceil(Math.max(...data) / 5)),
            precision: 0
          },
          grid: { color: '#1e293b', lineWidth: 0.5 }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function updateLastUpdated() {
  const now = new Date();
  const timestamp = formatTimestamp(now);
  showTimestampBadge('infomaterial-title', timestamp);
  reportLastUpdated('infomaterial').catch(() => {});
}


function formatTimestamp(date) {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function showTimestampBadge(titleId, timestamp) {
  const titleEl = document.getElementById(titleId);
  if (!titleEl) return;
  let badge = titleEl.querySelector('.last-updated-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'last-updated-badge';
    titleEl.appendChild(badge);
  }
  badge.textContent = `Zuletzt aktualisiert: ${timestamp}`;
}

function showUploadFeedback(type, message) {
  const feedbackEl = document.getElementById('infomaterial-upload-feedback');
  if (!feedbackEl) return;

  feedbackEl.className = 'upload-feedback';
  feedbackEl.classList.add(`upload-${type}`);
  feedbackEl.textContent = message;
  feedbackEl.style.display = 'block';

  if (type === 'success') {
    const uploadArea = document.getElementById('infomaterial-upload-area');
    if (uploadArea) {
      uploadArea.classList.add('upload-success');
      setTimeout(() => uploadArea.classList.remove('upload-success'), 2000);
    }
  }

  if (type !== 'loading') {
    setTimeout(() => { feedbackEl.style.display = 'none'; }, 6000);
  }
}

