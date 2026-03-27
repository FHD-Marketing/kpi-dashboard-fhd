/**
 * FHD KPI Dashboard – Vertragsübersicht Modul
 *
 * Excel-Upload, Parsing, API-Versand (/api/table1) und Tabellen-Rendering
 * für den Vertragsübersicht-Tab.
 *
 * @module vertragsuebersicht
 */

import { uploadVertragTable } from './data.js';
import { getCurrentMonth } from './month-selector.js';

/** Spalten aus der Excel-Tabelle */
const COLUMNS = [
  { key: 'bewerbungen', label: 'Bewerbungen' },
  { key: 'anrechnung', label: 'Anrechnungs\u00ADverfahren' },
  { key: 'inBearbeitung', label: 'Verträge in Bearbeitung' },
  { key: 'beimBewerber', label: 'Verträge beim Bewerber*in' },
  { key: 'zusage', label: 'Zusage' },
  { key: 'absage', label: 'Absage' }
];

/** Header-Mapping: Excel-Spaltennamen (lowercase) → interne Keys */
const HEADER_MAP = {
  'bewerbungen': 'bewerbungen',
  'anrechnungsverfahren': 'anrechnung',
  'studienverträge in bearbeitung': 'inBearbeitung',
  'studienverträge in bearbeitun': 'inBearbeitung',
  'studienverträge beim bewerber*in': 'beimBewerber',
  'studienverträge beim bewerber': 'beimBewerber',
  'zusage': 'zusage',
  'absage': 'absage'
};

/** Fakultäts-Farben */
const FAKULTAET_COLORS = {
  'Fakultät ASW': '#06b6d4',
  'Fakultät BW': '#f59e0b',
  'Fakultät Design': '#a855f7'
};

/* ────────────────────────── Public API ────────────────────── */

export function initVertragsuebersicht() {
  setupUploadHandlers();
}

export function renderVertragsuebersichtTab() {
  const container = document.getElementById('vertrag-table-container');
  if (!container) return;
  // Data is stored directly on the module-level after upload
  if (_lastParsedData) {
    renderTable(_lastParsedData);
    renderKpis(_lastParsedData);
  }
}

/** Cached parsed data (persists across tab switches within a session) */
let _lastParsedData = null;

/* ────────────────────────── Upload ────────────────────────── */

function setupUploadHandlers() {
  const uploadArea = document.getElementById('vertrag-upload-area');
  const fileInput = document.getElementById('vertrag-file-input');
  const uploadBtn = document.getElementById('vertrag-upload-btn');

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

  // Drag & Drop
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
    showFeedback('error', 'Bitte eine Excel-Datei (.xlsx/.xls) hochladen.');
    return;
  }

  showFeedback('loading', 'Datei wird verarbeitet…');

  try {
    const data = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });

    const parsed = parseSheet(json);
    if (!parsed) {
      showFeedback('error', 'Die Datei konnte nicht verarbeitet werden. Bitte prüfe das Format.');
      return;
    }

    // Build JSON payload and send to API
    const tablePayload = buildTablePayload(json);
    showFeedback('loading', 'Daten werden an API gesendet…');
    try {
      await uploadVertragTable(tablePayload);
    } catch (apiErr) {
      console.warn('API upload for Vertrag failed (data still applied locally):', apiErr.message);
    }

    // Cache locally and render
    _lastParsedData = parsed;
    renderTable(parsed);
    renderKpis(parsed);

    // Enable the tab button
    const tabBtn = document.querySelector('.tab-btn[data-tab="vertrag"]');
    if (tabBtn) tabBtn.classList.remove('disabled');

    showFeedback('success', `✓ ${file.name} erfolgreich geladen – ${parsed.studiengaenge.length} Studiengänge erkannt`);
  } catch (err) {
    console.error('Vertrag Excel parsing error:', err);
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

/* ────────────────────── Table Payload (API) ──────────────── */

function buildTablePayload(rows) {
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => {
      const s = String(cell).trim().toLowerCase();
      return s === 'studiengang' || s === 'bewerbungen';
    })) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return { columns: [], rows: [] };

  const header = rows[headerRowIdx];
  const columns = header.map(c => String(c).trim());

  const dataRows = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const name = String(row[0] || '').trim();
    if (!name) continue;

    const rowObj = {};
    columns.forEach((col, idx) => {
      rowObj[col] = idx < row.length ? (row[idx] ?? 0) : 0;
    });
    dataRows.push(rowObj);
  }

  return { columns, rows: dataRows };
}

/* ────────────────────── Excel Parsing ────────────────────── */

function parseSheet(rows) {
  if (!rows || rows.length < 2) return null;

  // Find header row
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => {
      const s = String(cell).trim().toLowerCase();
      return s === 'studiengang' || s === 'bewerbungen';
    })) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return null;

  const header = rows[headerRowIdx];

  // Map column indices
  const colIdx = {};
  for (let c = 0; c < header.length; c++) {
    const cell = String(header[c]).trim().toLowerCase();
    for (const [pattern, key] of Object.entries(HEADER_MAP)) {
      if (cell === pattern || cell.includes(pattern)) {
        colIdx[key] = c;
        break;
      }
    }
  }

  // Parse data rows
  const studiengaenge = [];
  const fakultaeten = [];
  let currentFakultaet = null;
  let gesamtRow = null;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const name = String(row[0] || '').trim();
    if (!name) continue;

    // Detect faculty header (no numeric data)
    if (name.startsWith('Fakultät ') && !hasNumericData(row, colIdx)) {
      currentFakultaet = name;
      continue;
    }

    // GESAMT row
    if (name.toUpperCase() === 'GESAMT' || name.toLowerCase().startsWith('gesamt')) {
      gesamtRow = extractRowData(row, colIdx);
      gesamtRow.name = name;
      continue;
    }

    // Normal study program row
    const sgData = extractRowData(row, colIdx);
    sgData.name = name;
    sgData.fakultaet = currentFakultaet;
    studiengaenge.push(sgData);
  }

  // Calculate faculty summaries
  const fakMap = {};
  studiengaenge.forEach(sg => {
    if (sg.fakultaet) {
      if (!fakMap[sg.fakultaet]) {
        fakMap[sg.fakultaet] = { name: sg.fakultaet, bewerbungen: 0, anrechnung: 0, inBearbeitung: 0, beimBewerber: 0, zusage: 0, absage: 0 };
      }
      COLUMNS.forEach(col => {
        fakMap[sg.fakultaet][col.key] += (sg[col.key] || 0);
      });
    }
  });
  Object.values(fakMap).forEach(f => fakultaeten.push(f));

  // Calculate GESAMT if not found
  if (!gesamtRow) {
    gesamtRow = { name: 'GESAMT', bewerbungen: 0, anrechnung: 0, inBearbeitung: 0, beimBewerber: 0, zusage: 0, absage: 0 };
    studiengaenge.forEach(sg => {
      COLUMNS.forEach(col => {
        gesamtRow[col.key] += (sg[col.key] || 0);
      });
    });
  }

  return { studiengaenge, fakultaeten, gesamt: gesamtRow };
}

function hasNumericData(row, colIdx) {
  return Object.values(colIdx).some(ci => {
    const val = parseFloat(row[ci]);
    return !isNaN(val) && val > 0;
  });
}

function extractRowData(row, colIdx) {
  const data = {};
  COLUMNS.forEach(col => {
    const ci = colIdx[col.key];
    data[col.key] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
  });
  return data;
}

/* ──────────────────────── KPI Cards ─────────────────────── */

function renderKpis(data) {
  if (!data || !data.gesamt) return;

  const kpis = {
    'vertrag-bewerbungen': data.gesamt.bewerbungen,
    'vertrag-zusagen': data.gesamt.zusage,
    'vertrag-absagen': data.gesamt.absage,
    'vertrag-inBearbeitung': (data.gesamt.inBearbeitung || 0) + (data.gesamt.beimBewerber || 0)
  };

  Object.entries(kpis).forEach(([id, val]) => {
    const el = document.querySelector(`[data-kpi="${id}"]`);
    if (!el) return;
    const valueEl = el.querySelector('.kpi-value');
    if (valueEl) valueEl.textContent = val.toLocaleString('de-DE');
  });
}

/* ──────────────────── Table Rendering ────────────────────── */

function renderTable(data) {
  const container = document.getElementById('vertrag-table-container');
  if (!container) return;

  if (!data || !data.studiengaenge || data.studiengaenge.length === 0) {
    container.innerHTML = '<div class="vertrag-empty-state"><p>Lade eine Excel-Datei hoch, um die Vertragsübersicht zu sehen.</p></div>';
    return;
  }

  // Group by faculty
  const grouped = {};
  const noFak = [];

  data.studiengaenge.forEach(sg => {
    if (sg.fakultaet) {
      if (!grouped[sg.fakultaet]) grouped[sg.fakultaet] = [];
      grouped[sg.fakultaet].push(sg);
    } else {
      noFak.push(sg);
    }
  });

  let html = '<div class="data-table-wrapper vertrag-table-wrapper"><table class="data-table vertrag-table">';

  // Thead
  html += '<thead><tr><th class="col-studiengang">Studiengang</th>';
  COLUMNS.forEach(col => {
    html += `<th class="col-${col.key}">${col.label}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Render per faculty
  const fakOrder = ['Fakultät ASW', 'Fakultät BW', 'Fakultät Design'];

  fakOrder.forEach(fakName => {
    const entries = grouped[fakName];
    if (!entries || entries.length === 0) return;
    const color = FAKULTAET_COLORS[fakName] || '#6366f1';

    // Faculty header row
    html += `<tr class="vertrag-fakultaet-row" style="--fak-color: ${color}">`;
    html += `<td colspan="${COLUMNS.length + 1}" class="vertrag-fakultaet-header">${fakName}</td>`;
    html += '</tr>';

    // Study program rows
    entries.forEach(sg => {
      html += '<tr class="vertrag-sg-row">';
      html += `<td class="col-studiengang">${sg.name}</td>`;
      COLUMNS.forEach(col => {
        const val = sg[col.key] || 0;
        const cls = val > 0 ? 'has-value' : 'zero-value';
        html += `<td class="col-${col.key} ${cls}">${val > 0 ? val : ''}</td>`;
      });
      html += '</tr>';
    });

    // Faculty subtotal
    const fakTotal = data.fakultaeten.find(f => f.name === fakName);
    if (fakTotal) {
      html += `<tr class="vertrag-subtotal-row" style="--fak-color: ${color}">`;
      html += `<td class="col-studiengang"><strong>Σ ${fakName}</strong></td>`;
      COLUMNS.forEach(col => {
        const val = fakTotal[col.key] || 0;
        html += `<td class="col-${col.key} subtotal-val"><strong>${val > 0 ? val : ''}</strong></td>`;
      });
      html += '</tr>';
    }
  });

  // Ungrouped rows
  if (noFak.length > 0) {
    noFak.forEach(sg => {
      html += '<tr class="vertrag-sg-row">';
      html += `<td class="col-studiengang">${sg.name}</td>`;
      COLUMNS.forEach(col => {
        const val = sg[col.key] || 0;
        const cls = val > 0 ? 'has-value' : 'zero-value';
        html += `<td class="col-${col.key} ${cls}">${val > 0 ? val : ''}</td>`;
      });
      html += '</tr>';
    });
  }

  // GESAMT row
  if (data.gesamt) {
    html += '<tr class="vertrag-gesamt-row">';
    html += `<td class="col-studiengang"><strong>${data.gesamt.name || 'GESAMT'}</strong></td>`;
    COLUMNS.forEach(col => {
      const val = data.gesamt[col.key] || 0;
      html += `<td class="col-${col.key} gesamt-val"><strong>${val > 0 ? val : '0'}</strong></td>`;
    });
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

/* ──────────────────────── Feedback ───────────────────────── */

function showFeedback(type, message) {
  const feedbackEl = document.getElementById('vertrag-upload-feedback');
  if (!feedbackEl) return;

  feedbackEl.className = 'upload-feedback';
  feedbackEl.classList.add(`upload-${type}`);
  feedbackEl.textContent = message;
  feedbackEl.style.display = 'block';

  if (type === 'success') {
    const uploadArea = document.getElementById('vertrag-upload-area');
    if (uploadArea) {
      uploadArea.classList.add('upload-success');
      setTimeout(() => uploadArea.classList.remove('upload-success'), 2000);
    }
  }

  if (type !== 'loading') {
    setTimeout(() => { feedbackEl.style.display = 'none'; }, 6000);
  }
}
