/**
 * FHD KPI Dashboard – Infomaterialanfragen Modul
 * 
 * Client-seitiges Excel-Parsing, Chart-Rendering und Upload-Handling
 * für den Infomaterialanfragen-Tab.
 * 
 * @module infomaterial
 */

import { dashboardData, getMonthData, setMonthData, getMonthOrder } from './data.js';
import { getCurrentMonth } from './month-selector.js';

/** Chart-Instanzen für Cleanup */
const chartInstances = {};

/** Monatsnamen für Header-Mapping */
const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Farben */
const COLOR_CURRENT = '#6366f1';
const COLOR_PREV = '#334155';
const COLOR_CURRENT_BG = 'rgba(99,102,241,0.85)';
const COLOR_PREV_BG = 'rgba(51,65,85,0.6)';

/** Fakultäts-Zuordnung */
const FAKULTAET_MAP = {
  'Fakultät Design': ['Grafikdesign Screen- & Printmedia (B.A.)', 'Digital Media Design (B.A.)', 'Creative Direction (M.A.)', 'Creative Direction (M.A.) berufsbegleitend', 'Games & XR Management (M.A.)', 'Games & XR Management (M.A.) berufsbegleitend'],
  'Fakultät ASW': ['Sozialpädagogik & -management (B.A.)', 'Sozialpädagogik & -management (B.A.) berufsbegleitend', 'Sozialpädagogik & -management (B.A.) berufsbegleitend - Lernzentrum Annaberg-Buchholz', 'Pflege- & Gesundheitsmanagement (B.A.)', 'Pflege- & Gesundheitsmanagement (B.A.) berufsbegleitend', 'Pflege- & Gesundheitsmanagement (B.A.) berufsbegleitend - Lernzentrum Annaberg-Buchholz', 'Pflege- & Gesundheitsmanagement (B.A.) berufsbegleitend - Lernzentrum Neustadt in Sachsen', 'Berufspädagogik für Pflege- & Gesundheitsberufe (M.A.) berufsbegleitend', 'Soziale Arbeit & Management (M.A.)', 'Soziale Arbeit & Management (M.A.) berufsbegleitend', 'Berufspädagogik für Pflege- & Gesundheitsberufe (B.A.) berufsbegleitend'],
  'Fakultät BW': ['Business Administration (B.A.)', 'Business Administration (B.A.) berufsbegleitend', 'Business Administration (B.A.) berufsbegleitend - Lernzentrum Annaberg-Buchholz', 'Tourismus & Event Management (B.A.)', 'Tourismus & Event Management (B.A.) berufsbegleitend', 'Leadership, Entrepreneurship & Innovation (M.A.)', 'Leadership, Entrepreneurship & Innovation (M.A.) berufsbegleitend']
};

/** Farben pro Fakultät */
const FAKULTAET_COLORS = {
  'Fakultät Design': '#a855f7',
  'Fakultät ASW': '#06b6d4',
  'Fakultät BW': '#f59e0b'
};

/**
 * Initialisiert den Infomaterial-Tab: Upload-Handler, Drag-and-Drop.
 */
export function initInfomaterial() {
  setupUploadHandlers();
}

/**
 * Rendert den kompletten Infomaterial-Tab mit Daten.
 * Wird bei Monats-/Tab-Wechsel aufgerufen.
 */
export function renderInfomaterialTab(monthKey) {
  const data = getMonthData(monthKey);
  if (!data || !data.infomaterial) return;

  const info = data.infomaterial;

  // KPI Cards aktualisieren
  updateInfoKpis(info, monthKey);

  // Fakultäts-Summary
  renderFakultaetSummary(info, monthKey);

  // Individuelle Studiengang-Charts
  renderStudiengangCharts(info, monthKey);
}

/* ── Upload Handling ────────────────────────────────────────── */

function setupUploadHandlers() {
  const uploadArea = document.getElementById('infomaterial-upload-area');
  const fileInput = document.getElementById('infomaterial-file-input');
  const uploadBtn = document.getElementById('infomaterial-upload-btn');

  if (!uploadArea || !fileInput) return;

  // Button click → öffne File Dialog
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => fileInput.click());
  }
  uploadArea.addEventListener('click', (e) => {
    if (e.target === uploadArea || e.target.closest('.upload-content')) {
      fileInput.click();
    }
  });

  // File selected
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processExcelFile(file);
  });

  // Drag and Drop
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

/**
 * Verarbeitet eine hochgeladene Excel-Datei.
 */
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

    const parsed = parseInfomaterialSheet(json);
    if (!parsed) {
      showUploadFeedback('error', 'Die Datei konnte nicht verarbeitet werden. Bitte prüfe das Format.');
      return;
    }

    // Daten in alle Monate einspeisen
    injectParsedData(parsed);

    // Aktuellen Tab rendern
    const currentMonth = getCurrentMonth();
    if (currentMonth) {
      renderInfomaterialTab(currentMonth);
      // Tab-Button aktivieren
      const tabBtn = document.querySelector('.tab-btn[data-tab="infomaterial"]');
      if (tabBtn) tabBtn.classList.remove('disabled');
    }

    showUploadFeedback('success', `✓ ${file.name} erfolgreich geladen – ${parsed.studiengaenge.length} Studiengänge erkannt`);
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

/**
 * Parsed das Excel-Sheet in ein strukturiertes Datenformat.
 * Erwartet: Zeile 1 = Header (Zählung, Januar, Februar, ...),
 * danach Studiengänge, Gesamt-Zeilen, dann Fakultäts-Block.
 */
function parseInfomaterialSheet(rows) {
  if (!rows || rows.length < 3) return null;

  // Header-Zeile finden (enthält "Zählung" oder "Januar")
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

  // Monatsspalten-Indizes ermitteln
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

  // Studiengänge parsen
  const studiengaenge = [];
  const gesamtRows = {};
  let fakultaetBlock = [];
  let inFakultaetBlock = false;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const name = String(row[0] || '').trim();
    if (!name) continue;

    // Fakultäts-Block erkennen
    if (name === 'Fakultät' || name.startsWith('Fakultät ')) {
      inFakultaetBlock = true;
    }

    if (inFakultaetBlock) {
      if (name.startsWith('Fakultät ')) {
        const fakData = { name };
        MONTH_KEYS.forEach(mk => {
          const ci = monthColIdx[mk];
          fakData[mk] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
        });
        fakultaetBlock.push(fakData);
      }
      continue;
    }

    // Gesamt-Zeilen erkennen
    if (name.startsWith('Gesamt ')) {
      const year = name.replace('Gesamt ', '');
      gesamtRows[year] = {};
      MONTH_KEYS.forEach(mk => {
        const ci = monthColIdx[mk];
        gesamtRows[year][mk] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
      });
      continue;
    }

    // Veränderung-Zeile
    if (name === 'Veränderung') continue;

    // Studiengang-Datenzeile
    const sgData = { name };
    MONTH_KEYS.forEach(mk => {
      const ci = monthColIdx[mk];
      sgData[mk] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
    });
    studiengaenge.push(sgData);
  }

  return { studiengaenge, gesamtRows, fakultaeten: fakultaetBlock };
}

/**
 * Injiziert geparste Infomaterial-Daten in das Dashboard-Datenmodell.
 */
function injectParsedData(parsed) {
  const monthOrder = getMonthOrder();

  monthOrder.forEach((mk, idx) => {
    // Prüfe ob es Daten für diesen Monat gibt
    let total = 0;
    let bachelorTotal = 0;
    let masterTotal = 0;
    const sgForMonth = [];

    parsed.studiengaenge.forEach(sg => {
      const val = sg[mk] || 0;
      total += val;
      sgForMonth.push({ name: sg.name, value: val });

      if (sg.name.includes('(B.A.)')) bachelorTotal += val;
      if (sg.name.includes('(M.A.)')) masterTotal += val;
    });

    // Vormonat ermitteln
    const prevMk = idx > 0 ? monthOrder[idx - 1] : null;
    let prevTotal = 0;
    if (prevMk) {
      parsed.studiengaenge.forEach(sg => {
        prevTotal += (sg[prevMk] || 0);
      });
    }

    const veraenderung = prevTotal > 0 ? (((total - prevTotal) / prevTotal) * 100) : null;

    // Fakultäts-Daten
    const fakultaeten = {};
    if (parsed.fakultaeten && parsed.fakultaeten.length > 0) {
      parsed.fakultaeten.forEach(f => {
        fakultaeten[f.name] = f[mk] || 0;
      });
    } else {
      // Aus Studiengängen berechnen
      Object.entries(FAKULTAET_MAP).forEach(([fakName, sgNames]) => {
        let sum = 0;
        sgNames.forEach(sgName => {
          const sg = parsed.studiengaenge.find(s => s.name === sgName);
          if (sg) sum += (sg[mk] || 0);
        });
        fakultaeten[fakName] = sum;
      });
    }

    // Fakultäts-Vormonat
    const fakultaetenPrev = {};
    if (prevMk) {
      if (parsed.fakultaeten && parsed.fakultaeten.length > 0) {
        parsed.fakultaeten.forEach(f => {
          fakultaetenPrev[f.name] = f[prevMk] || 0;
        });
      } else {
        Object.entries(FAKULTAET_MAP).forEach(([fakName, sgNames]) => {
          let sum = 0;
          sgNames.forEach(sgName => {
            const sg = parsed.studiengaenge.find(s => s.name === sgName);
            if (sg) sum += (sg[prevMk] || 0);
          });
          fakultaetenPrev[fakName] = sum;
        });
      }
    }

    // Studiengang-Daten mit Vormonat
    const studiengaengeData = parsed.studiengaenge.map(sg => {
      const prev = prevMk ? (sg[prevMk] || 0) : 0;
      return {
        name: sg.name,
        current: sg[mk] || 0,
        previous: prev
      };
    });

    // Nur Monate mit Daten > 0 aktivieren
    if (total === 0) return;

    // Daten ins Dashboard injizieren
    let existing = getMonthData(mk);
    if (!existing) {
      existing = { label: `${MONTH_NAMES_DE[idx]} 2026` };
    }

    existing.infomaterial = {
      gesamt: { value: total.toLocaleString('de-DE') },
      bachelor: { value: bachelorTotal.toLocaleString('de-DE') },
      master: { value: masterTotal.toLocaleString('de-DE') },
      veraenderung: {
        value: veraenderung !== null ? `${veraenderung >= 0 ? '+' : ''}${veraenderung.toFixed(1).replace('.', ',')}%` : '—',
        trendDir: veraenderung !== null ? (veraenderung >= 0 ? 'up-good' : 'down-bad') : null,
        trend: veraenderung !== null ? `${veraenderung >= 0 ? '▲' : '▼'} ${Math.abs(veraenderung).toFixed(1).replace('.', ',')}%` : null
      },
      fakultaeten,
      fakultaetenPrev,
      studiengaenge: studiengaengeData,
      _raw: parsed
    };

    setMonthData(mk, existing);
  });
}

/* ── KPI Cards ──────────────────────────────────────────────── */

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

/* ── Fakultäts-Summary ──────────────────────────────────────── */

function renderFakultaetSummary(info, monthKey) {
  const container = document.getElementById('infomaterial-faculty-cards');
  if (!container) return;

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const monthName = monthNames[monthKey] || monthKey;

  container.innerHTML = '';

  const fakEntries = Object.entries(info.fakultaeten || {});
  if (fakEntries.length === 0) return;

  fakEntries.forEach(([name, value]) => {
    const prevValue = info.fakultaetenPrev ? (info.fakultaetenPrev[name] || 0) : 0;
    const change = prevValue > 0 ? (((value - prevValue) / prevValue) * 100) : null;
    const color = FAKULTAET_COLORS[name] || '#6366f1';
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
        ${prevValue > 0 ? `<div class="faculty-prev">Vormonat: ${prevValue.toLocaleString('de-DE')}</div>` : ''}
      </div>
    `;
  });
}

/* ── Studiengang Charts ─────────────────────────────────────── */

function renderStudiengangCharts(info, monthKey) {
  const container = document.getElementById('infomaterial-charts-container');
  if (!container) return;

  // Cleanup alte Charts
  Object.keys(chartInstances).forEach(key => {
    if (key.startsWith('infomaterial-sg-')) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  });

  container.innerHTML = '';

  if (!info.studiengaenge || info.studiengaenge.length === 0) return;

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const mName = monthNames[monthKey] || monthKey;
  const mkIdx = MONTH_KEYS.indexOf(monthKey);
  const prevMName = mkIdx > 0 ? monthNames[MONTH_KEYS[mkIdx - 1]] : null;

  // Nur Studiengänge anzeigen, die mindestens in einem der beiden Monate > 0 sind
  const activeSg = info.studiengaenge.filter(sg => sg.current > 0 || sg.previous > 0);

  activeSg.forEach((sg, idx) => {
    const canvasId = `infomaterial-sg-${idx}`;
    const shortName = sg.name.length > 55 ? sg.name.substring(0, 52) + '…' : sg.name;
    const change = sg.previous > 0 ? (((sg.current - sg.previous) / sg.previous) * 100) : null;
    const changeStr = change !== null
      ? `<span class="sg-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')}%</span>`
      : '';

    container.innerHTML += `
      <div class="infomaterial-chart-card">
        <div class="infomaterial-chart-header">
          <span class="infomaterial-chart-title" title="${sg.name}">${shortName}</span>
          ${changeStr}
        </div>
        <div class="infomaterial-chart-values">
          <span class="sg-current"><span class="sg-dot" style="background:${COLOR_CURRENT}"></span>${mName}: <strong>${sg.current}</strong></span>
          ${prevMName ? `<span class="sg-prev"><span class="sg-dot" style="background:${COLOR_PREV}"></span>${prevMName}: <strong>${sg.previous}</strong></span>` : ''}
        </div>
        <div class="infomaterial-chart-wrapper"><canvas id="${canvasId}"></canvas></div>
      </div>
    `;
  });

  // Charts erstellen (nach DOM-Update)
  requestAnimationFrame(() => {
    activeSg.forEach((sg, idx) => {
      const canvasId = `infomaterial-sg-${idx}`;
      createStudiengangChart(canvasId, sg, mName, prevMName);
    });
  });
}

function createStudiengangChart(canvasId, sg, currentLabel, prevLabel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = prevLabel ? [prevLabel, currentLabel] : [currentLabel];
  const data = prevLabel ? [sg.previous, sg.current] : [sg.current];
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

/* ── Upload Feedback ────────────────────────────────────────── */

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
