import { uploadVertragTable, reportLastUpdated, getMonthData } from './data.js';
import { getCurrentMonth } from './month-selector.js';

const COLUMNS = [
  { key: 'bewerbungen', label: 'Bewerbungen' },
  { key: 'anrechnung', label: 'Anrechnungs\u00ADverfahren' },
  { key: 'inBearbeitung', label: 'Verträge in Bearbeitung' },
  { key: 'beimBewerber', label: 'Verträge beim Bewerber*in' },
  { key: 'zusage', label: 'Zusage' },
  { key: 'absage', label: 'Absage' }
];

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

const FACULTY_COLORS = {
  'Fakultät ASW': '#06b6d4',
  'Fakultät BW': '#f59e0b',
  'Fakultät Design': '#a855f7'
};

let cachedData = null;
let cachedDataMonth = null;

export function initContractOverview() {
  setupUploadHandlers();
}

export function renderContractOverviewTab(monthKey) {
  const container = document.getElementById('vertrag-table-container');
  if (!container) return;

  const mk = monthKey || getCurrentMonth();
  const monthData = mk ? getMonthData(mk) : null;

  let renderData = null;

  if (monthData && monthData.vertrag) {
    renderData = transformApiData(monthData.vertrag);
  } else if (cachedData && cachedDataMonth === mk) {
    renderData = cachedData;
  }

  const hasData = !!(renderData && renderData.programs && renderData.programs.length > 0);
  toggleVertragSections(hasData);

  renderFacultyCards(renderData);
  renderStudiengangChart(renderData);
  renderTable(renderData);
  renderKpis(renderData);
}

function toggleVertragSections(visible) {
  ['vertrag-section-faculty', 'vertrag-section-chart', 'vertrag-section-table'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  });
}

function transformApiData(apiVertrag) {
  if (!apiVertrag || !apiVertrag.rows) return null;

  const DB_TO_KEY = {
    bewerbungen: 'bewerbungen',
    anrechnung: 'anrechnung',
    in_bearbeitung: 'inBearbeitung',
    beim_bewerber: 'beimBewerber',
    zusage: 'zusage',
    absage: 'absage',
  };

  const programs = [];
  const faculties = [];
  const facultyMap = {};
  let total = null;

  apiVertrag.rows.forEach(r => {
    const entry = { name: r.studiengang, fakultaet: r.fakultaet || null };
    Object.entries(DB_TO_KEY).forEach(([dbCol, key]) => {
      entry[key] = r[dbCol] || 0;
    });

    if (r.row_type === 'gesamt') {
      total = entry;
    } else if (r.row_type === 'fakultaet') {
      return;
    } else {
      programs.push(entry);
      if (entry.fakultaet) {
        if (!facultyMap[entry.fakultaet]) {
          facultyMap[entry.fakultaet] = { name: entry.fakultaet, bewerbungen: 0, anrechnung: 0, inBearbeitung: 0, beimBewerber: 0, zusage: 0, absage: 0 };
        }
        COLUMNS.forEach(col => {
          facultyMap[entry.fakultaet][col.key] += (entry[col.key] || 0);
        });
      }
    }
  });

  Object.values(facultyMap).forEach(f => faculties.push(f));

  if (!total) {
    total = { name: 'GESAMT', bewerbungen: 0, anrechnung: 0, inBearbeitung: 0, beimBewerber: 0, zusage: 0, absage: 0 };
    programs.forEach(pg => {
      COLUMNS.forEach(col => {
        total[col.key] += (pg[col.key] || 0);
      });
    });
  }

  return { programs, faculties, total };
}

function setupUploadHandlers() {
  const fileInput = document.getElementById('vertrag-file-input');

  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processExcelFile(file);
  });
}

async function processExcelFile(file) {
  const validExtensions = ['.xlsx', '.xls'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExtensions.includes(ext)) {
    showFeedback('error', 'Bitte eine Excel-Datei (.xlsx/.xls) hochladen.');
    return;
  }

  showFeedback('loading', 'Datei wird verarbeitet…');

  try {
    const buffer = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });

    const parsed = parseSheet(json);
    if (!parsed) {
      showFeedback('error', 'Die Datei konnte nicht verarbeitet werden. Bitte prüfe das Format.');
      return;
    }

    const payload = buildTablePayload(json);
    showFeedback('loading', 'Daten werden an API gesendet…');
    let uploadOk = false;
    try {
      await uploadVertragTable(payload);
      uploadOk = true;
    } catch (apiErr) {
      console.warn('API upload failed (data still applied locally):', apiErr.message);
    }

    cachedData = parsed;
    cachedDataMonth = getCurrentMonth();
    renderFacultyCards(parsed);
    renderStudiengangChart(parsed);
    renderTable(parsed);
    renderKpis(parsed);

    const tabBtn = document.querySelector('.tab-btn[data-tab="vertrag"]');
    if (tabBtn) tabBtn.classList.remove('disabled');

    if (uploadOk) updateLastUpdated();
    showFeedback('success', `✓ ${file.name} erfolgreich geladen – ${parsed.programs.length} Studiengänge erkannt`);
  } catch (err) {
    console.error('Excel parsing error:', err);
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

function buildTablePayload(rows) {
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => {
      const s = String(cell).trim().toLowerCase();
      return s === 'studiengang' || s === 'bewerbungen';
    })) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) return { columns: [], rows: [] };

  const header = rows[headerRowIndex];
  const columns = header.map(c => String(c).trim());

  const dataRows = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
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

function parseSheet(rows) {
  if (!rows || rows.length < 2) return null;

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(cell => {
      const s = String(cell).trim().toLowerCase();
      return s === 'studiengang' || s === 'bewerbungen';
    })) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) return null;

  const header = rows[headerRowIndex];

  const columnIndex = {};
  for (let c = 0; c < header.length; c++) {
    const cell = String(header[c]).trim().toLowerCase();
    for (const [pattern, key] of Object.entries(HEADER_MAP)) {
      if (cell === pattern || cell.includes(pattern)) {
        columnIndex[key] = c;
        break;
      }
    }
  }

  const programs = [];
  const faculties = [];
  let currentFaculty = null;
  let totalRow = null;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const name = String(row[0] || '').trim();
    if (!name) continue;

    if (name.startsWith('Fakultät ') && !hasNumericData(row, columnIndex)) {
      currentFaculty = name;
      continue;
    }

    if (name.toUpperCase() === 'GESAMT' || name.toLowerCase().startsWith('gesamt')) {
      totalRow = extractRowData(row, columnIndex);
      totalRow.name = name;
      continue;
    }

    const entry = extractRowData(row, columnIndex);
    entry.name = name;
    entry.fakultaet = currentFaculty;
    programs.push(entry);
  }

  const facultyMap = {};
  programs.forEach(pg => {
    if (pg.fakultaet) {
      if (!facultyMap[pg.fakultaet]) {
        facultyMap[pg.fakultaet] = { name: pg.fakultaet, bewerbungen: 0, anrechnung: 0, inBearbeitung: 0, beimBewerber: 0, zusage: 0, absage: 0 };
      }
      COLUMNS.forEach(col => {
        facultyMap[pg.fakultaet][col.key] += (pg[col.key] || 0);
      });
    }
  });
  Object.values(facultyMap).forEach(f => faculties.push(f));

  if (!totalRow) {
    totalRow = { name: 'GESAMT', bewerbungen: 0, anrechnung: 0, inBearbeitung: 0, beimBewerber: 0, zusage: 0, absage: 0 };
    programs.forEach(pg => {
      COLUMNS.forEach(col => {
        totalRow[col.key] += (pg[col.key] || 0);
      });
    });
  }

  return { programs, faculties, total: totalRow };
}

function hasNumericData(row, columnIndex) {
  return Object.values(columnIndex).some(ci => {
    const val = parseFloat(row[ci]);
    return !isNaN(val) && val > 0;
  });
}

function extractRowData(row, columnIndex) {
  const data = {};
  COLUMNS.forEach(col => {
    const ci = columnIndex[col.key];
    data[col.key] = ci !== undefined ? (parseFloat(row[ci]) || 0) : 0;
  });
  return data;
}

const FACULTY_ICONS = {
  'Fakultät ASW': '🤝',
  'Fakultät BW': '📊',
  'Fakultät Design': '🎨'
};

function renderFacultyCards(data) {
  const container = document.getElementById('vertrag-faculty-cards');
  if (!container) return;
  if (!data || !data.faculties || data.faculties.length === 0) {
    container.innerHTML = '<div class="vertrag-empty-placeholder">—</div>';
    return;
  }

  const totalBew = data.faculties.reduce((s, f) => s + (f.bewerbungen || 0), 0) || 1;

  let html = '';
  const facultyOrder = ['Fakultät ASW', 'Fakultät BW', 'Fakultät Design'];

  facultyOrder.forEach(name => {
    const f = data.faculties.find(fac => fac.name === name);
    if (!f) return;
    const color = FACULTY_COLORS[name] || '#6366f1';
    const icon = FACULTY_ICONS[name] || '🏛️';
    const bew = f.bewerbungen || 0;
    const zusage = f.zusage || 0;
    const absage = f.absage || 0;
    const inBearb = (f.anrechnung || 0) + (f.inBearbeitung || 0) + (f.beimBewerber || 0);
    const bewPct = Math.round((bew / totalBew) * 100);
    const zusagePct = bew > 0 ? Math.round((zusage / bew) * 100) : 0;

    html += `<div class="vertrag-faculty-card" style="--faculty-color: ${color}">
      <div class="vertrag-faculty-header">
        <span class="vertrag-faculty-icon">${icon}</span>
        <span class="vertrag-faculty-name">${name.replace('Fakultät ', '')}</span>
      </div>
      <div class="vertrag-faculty-main-value">${bew}</div>
      <div class="vertrag-faculty-label">Bewerbungen</div>
      <div class="vertrag-faculty-bar"><div class="vertrag-faculty-bar-fill" style="width:${bewPct}%;background:${color}"></div></div>
      <div class="vertrag-faculty-stats">
        <div class="vertrag-faculty-stat"><span class="stat-dot stat-zusage"></span>${zusage} Zusagen</div>
        <div class="vertrag-faculty-stat"><span class="stat-dot stat-bearb"></span>${inBearb} In Bearb.</div>
        <div class="vertrag-faculty-stat"><span class="stat-dot stat-absage"></span>${absage} Absagen</div>
      </div>
      <div class="vertrag-faculty-quote">Zusagequote: <strong>${zusagePct}%</strong></div>
    </div>`;
  });

  container.innerHTML = html;
}

function renderStudiengangChart(data) {
  const container = document.getElementById('vertrag-chart-container');
  if (!container) return;
  if (!data || !data.programs || data.programs.length === 0) {
    container.innerHTML = '<div class="vertrag-empty-placeholder">—</div>';
    return;
  }

  const sorted = [...data.programs].sort((a, b) => (b.bewerbungen || 0) - (a.bewerbungen || 0));
  const maxBew = sorted.length > 0 ? (sorted[0].bewerbungen || 1) : 1;

  let html = '<div class="vertrag-sg-bars">';
  sorted.forEach(pg => {
    const bew = pg.bewerbungen || 0;
    const zusage = pg.zusage || 0;
    const absage = pg.absage || 0;
    const inBearb = (pg.anrechnung || 0) + (pg.inBearbeitung || 0) + (pg.beimBewerber || 0);
    const pct = Math.round((bew / maxBew) * 100);
    const color = pg.fakultaet ? (FACULTY_COLORS[pg.fakultaet] || '#6366f1') : '#6366f1';
    const shortName = pg.name.length > 50 ? pg.name.substring(0, 47) + '…' : pg.name;

    html += `<div class="vertrag-sg-bar-row">
      <div class="vertrag-sg-bar-label" title="${pg.name}">${shortName}</div>
      <div class="vertrag-sg-bar-track">
        <div class="vertrag-sg-bar-fill" style="width:${pct}%;background:${color}"></div>
        <span class="vertrag-sg-bar-value">${bew}</span>
      </div>
      <div class="vertrag-sg-bar-meta">
        <span class="sg-meta-item sg-meta-zusage" title="Zusagen">✅ ${zusage}</span>
        <span class="sg-meta-item sg-meta-bearb" title="In Bearbeitung">⏳ ${inBearb}</span>
        <span class="sg-meta-item sg-meta-absage" title="Absagen">❌ ${absage}</span>
      </div>
    </div>`;
  });
  html += '</div>';

  container.innerHTML = html;
}

function renderKpis(data) {
  const kpiIds = ['vertrag-bewerbungen', 'vertrag-zusagen', 'vertrag-absagen', 'vertrag-inBearbeitung'];

  if (!data || !data.total) {
    kpiIds.forEach(id => {
      const el = document.querySelector(`[data-kpi="${id}"]`);
      if (!el) return;
      const valueEl = el.querySelector('.kpi-value');
      if (valueEl) valueEl.textContent = '—';
    });
    return;
  }

  const kpis = {
    'vertrag-bewerbungen': data.total.bewerbungen,
    'vertrag-zusagen': data.total.zusage,
    'vertrag-absagen': data.total.absage,
    'vertrag-inBearbeitung': (data.total.anrechnung || 0) + (data.total.inBearbeitung || 0) + (data.total.beimBewerber || 0)
  };

  Object.entries(kpis).forEach(([id, val]) => {
    const el = document.querySelector(`[data-kpi="${id}"]`);
    if (!el) return;
    const valueEl = el.querySelector('.kpi-value');
    if (valueEl) valueEl.textContent = val.toLocaleString('de-DE');
  });
}

function renderTable(data) {
  const container = document.getElementById('vertrag-table-container');
  if (!container) return;

  if (!data || !data.programs || data.programs.length === 0) {
    container.innerHTML = '<div class="vertrag-empty-placeholder">—</div>';
    return;
  }

  const grouped = {};
  const ungrouped = [];

  data.programs.forEach(pg => {
    if (pg.fakultaet) {
      if (!grouped[pg.fakultaet]) grouped[pg.fakultaet] = [];
      grouped[pg.fakultaet].push(pg);
    } else {
      ungrouped.push(pg);
    }
  });

  let html = '<div class="data-table-wrapper vertrag-table-wrapper"><table class="data-table vertrag-table">';

  html += '<thead><tr><th class="col-studiengang">Studiengang</th>';
  COLUMNS.forEach(col => {
    html += `<th class="col-${col.key}">${col.label}</th>`;
  });
  html += '</tr></thead><tbody>';

  const facultyOrder = ['Fakultät ASW', 'Fakultät BW', 'Fakultät Design'];

  facultyOrder.forEach(facultyName => {
    const entries = grouped[facultyName];
    if (!entries || entries.length === 0) return;
    const color = FACULTY_COLORS[facultyName] || '#6366f1';

    html += `<tr class="vertrag-fakultaet-row" style="--fak-color: ${color}">`;
    html += `<td colspan="${COLUMNS.length + 1}" class="vertrag-fakultaet-header">${facultyName}</td>`;
    html += '</tr>';

    entries.forEach(pg => {
      html += '<tr class="vertrag-sg-row">';
      html += `<td class="col-studiengang">${pg.name}</td>`;
      COLUMNS.forEach(col => {
        const val = pg[col.key] || 0;
        const cls = val > 0 ? 'has-value' : 'zero-value';
        html += `<td class="col-${col.key} ${cls}">${val > 0 ? val : ''}</td>`;
      });
      html += '</tr>';
    });

    const facultyTotal = data.faculties.find(f => f.name === facultyName);
    if (facultyTotal) {
      html += `<tr class="vertrag-subtotal-row" style="--fak-color: ${color}">`;
      html += `<td class="col-studiengang"><strong>Σ ${facultyName}</strong></td>`;
      COLUMNS.forEach(col => {
        const val = facultyTotal[col.key] || 0;
        html += `<td class="col-${col.key} subtotal-val"><strong>${val > 0 ? val : ''}</strong></td>`;
      });
      html += '</tr>';
    }
  });

  if (ungrouped.length > 0) {
    ungrouped.forEach(pg => {
      html += '<tr class="vertrag-sg-row">';
      html += `<td class="col-studiengang">${pg.name}</td>`;
      COLUMNS.forEach(col => {
        const val = pg[col.key] || 0;
        const cls = val > 0 ? 'has-value' : 'zero-value';
        html += `<td class="col-${col.key} ${cls}">${val > 0 ? val : ''}</td>`;
      });
      html += '</tr>';
    });
  }

  if (data.total) {
    html += '<tr class="vertrag-gesamt-row">';
    html += `<td class="col-studiengang"><strong>${data.total.name || 'GESAMT'}</strong></td>`;
    COLUMNS.forEach(col => {
      const val = data.total[col.key] || 0;
      html += `<td class="col-${col.key} gesamt-val"><strong>${val > 0 ? val : '0'}</strong></td>`;
    });
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function updateLastUpdated() {
  const now = new Date();
  const timestamp = formatTimestamp(now);
  showTimestampBadge('vertrag-title', timestamp);
  reportLastUpdated('vertrag').catch(() => {});
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

