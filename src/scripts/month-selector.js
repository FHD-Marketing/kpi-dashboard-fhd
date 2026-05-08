import { getMonthData, getPreviousMonthKey, getAvailableMonths, hasDataForTab, fetchOverview, fetchChannel, clearMonthChannels, getAvailableChannelsForMonth, isChannelCached, getLastUpdatedTimestamps } from './data.js';
import { showOverview } from './tab-navigation.js';
import { renderInfomaterialTab, destroyInfomaterialCharts } from './fetching/manual/infomaterial.js';
import { renderContractOverviewTab } from './fetching/manual/contract-overview.js';
import { renderStudycheckTab, destroyStudycheckCharts } from './fetching/manual/studycheck.js';
import { renderLinkedinTab, destroyLinkedinCharts, normalizeLinkedinData } from './fetching/manual/linkedin.js';
import { renderTiktokTab, destroyTiktokCharts, normalizeTiktokData } from './fetching/manual/tiktok.js';
import { destroyAllCharts } from './charts.js';

let currentMonth = null;
let loadGeneration = 0;

export function getCurrentMonth() {
  return currentMonth;
}

export function refreshMonthButtons() {
  const allMonthBtns = document.querySelectorAll('.month-btn');
  const available = getAvailableMonths();
  const currentMonthIndex = new Date().getMonth();

  let popIndex = 0;
  allMonthBtns.forEach((btn, index) => {
    const month = btn.dataset.month;
    if (!month) return;

    btn.classList.remove('month-pop-in');

    if (index <= currentMonthIndex && available.includes(month)) {
      btn.classList.remove('disabled');
      btn.classList.add('has-data');

      const data = getMonthData(month);
      const spendEl = btn.querySelector('.month-spend');
      if (spendEl) {
        spendEl.textContent = (data && data.totalSpend) ? data.totalSpend : '';
      }

      btn.style.setProperty('--pop-delay', (popIndex * 80) + 'ms');
      void btn.offsetWidth;
      btn.classList.add('month-pop-in');
      popIndex++;
    } else {
      btn.classList.add('disabled');
      btn.classList.remove('has-data');
      const spendEl = btn.querySelector('.month-spend');
      if (spendEl) spendEl.textContent = '';
    }
  });
}

export function activateLatestMonth() {
  const monthOrder = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const available = getAvailableMonths();

  if (available.length === 0) return;

  const currentIdx = new Date().getMonth(); // 0..11
  const currentKey = monthOrder[currentIdx];

  let chosenKey = null;

  if (available.includes(currentKey)) {
    chosenKey = currentKey;
  } else {
    for (const m of available) {
      const idx = monthOrder.indexOf(m);
      if (idx <= currentIdx) {
        if (chosenKey === null || idx > monthOrder.indexOf(chosenKey)) {
          chosenKey = m;
        }
      }
    }
    if (chosenKey === null) {
      chosenKey = available[0];
      for (const m of available) {
        if (monthOrder.indexOf(m) > monthOrder.indexOf(chosenKey)) {
          chosenKey = m;
        }
      }
    }
  }

  selectMonth(chosenKey);
}

function resetTabContents() {
  destroyAllCharts();
  destroyInfomaterialCharts();
  destroyStudycheckCharts();
  destroyLinkedinCharts();
  destroyTiktokCharts();

  document.querySelectorAll('.kpi-value').forEach(el => {
    el.textContent = '—';
    el.classList.remove('delta-positive', 'delta-negative');
    delete el.dataset.target;
  });
  document.querySelectorAll('.kpi-trend').forEach(el => {
    el.textContent = '';
    el.className = 'kpi-trend';
    el.style.display = '';
  });
  document.querySelectorAll('.kpi-detail').forEach(el => {
    el.textContent = '';
  });

  ['google-spend-bars', 'google-campaign-cards', 'meta-campaign-sections', 'infomaterial-faculty-cards', 'infomaterial-charts-container', 'studycheck-charts-container', 'tiktok-charts-container'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  document.querySelectorAll('.data-table tbody').forEach(tbody => {
    tbody.innerHTML = '';
  });

  document.querySelectorAll('.kpi-card, .chart-card, .campaign-section, .google-campaign-card, .infomaterial-faculty-card, .infomaterial-chart-card').forEach(card => {
    card.classList.remove('kpi-pop');
    card.classList.add('kpi-hidden');
  });
}

function showGlobalLoading() {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const loading = document.getElementById('loading-state');
  if (loading) loading.classList.add('active');
}

function hideGlobalLoading() {
  const loading = document.getElementById('loading-state');
  if (loading) loading.classList.remove('active');
}

async function selectMonth(month) {
  const myGen = ++loadGeneration;

  const allMonthBtns = document.querySelectorAll('.month-btn');
  allMonthBtns.forEach(b => b.classList.remove('active'));

  const btn = document.querySelector(`.month-btn[data-month="${month}"]`);
  if (btn) btn.classList.add('active');

  if (currentMonth && currentMonth !== month) {
    clearMonthChannels(currentMonth);
  }

  currentMonth = month;

  resetTabContents();
  showGlobalLoading();

  try {
    await fetchOverview(month);
  } catch (err) {
    console.error(`Failed to fetch overview for ${month}:`, err);
  }

  if (myGen !== loadGeneration) return;

  const channels = getAvailableChannelsForMonth(month);
  const hasAvailabilityList = Array.isArray(channels) && channels.length > 0;
  const toFetch = channels.filter(ch => !isChannelCached(ch, month));

  for (const channel of toFetch) {
    if (myGen !== loadGeneration) return;
    try {
      await fetchChannel(channel, month);
    } catch (err) {
      console.warn(`[Prefetch] ${channel}/${month} failed:`, err);
    }
  }

  const manualChannels = ['infomaterial', 'studycheck', 'vertrag', 'linkedin', 'tiktok'];
  for (const ch of manualChannels) {
    if (myGen !== loadGeneration) return;
    if (isChannelCached(ch, month)) continue;
    if (hasAvailabilityList && !channels.includes(ch)) continue;
    try {
      await fetchChannel(ch, month);
    } catch (_) {
    }
  }

  if (myGen !== loadGeneration) return;

  updateTabAvailability(month);
  updateDashboardData(month);

  const animatableSelector = '.kpi-card, .chart-card, .campaign-section, .google-campaign-card, .infomaterial-faculty-card, .infomaterial-chart-card';
  document.querySelectorAll(animatableSelector).forEach(card => {
    card.classList.remove('kpi-pop');
    card.classList.add('kpi-hidden');
  });

  hideGlobalLoading();
  activateFirstAvailableTab();

  document.dispatchEvent(new CustomEvent('monthChanged', { detail: { month } }));
  document.dispatchEvent(new CustomEvent('dataReady'));
}

function updateTabAvailability(month) {
  const data = getMonthData(month);
  const hasApiData = data && data._availableChannels;

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    const tab = btn.dataset.tab;
    if (!tab) return;

    if (tab === 'uebersicht' || tab === 'infomaterial' || tab === 'studycheck' || tab === 'vertrag' || tab === 'linkedin' || tab === 'tiktok') {
      btn.classList.remove('disabled');
      return;
    }

    if (!hasApiData) {
      btn.classList.add('disabled');
      btn.classList.remove('active');
      return;
    }

    if (hasDataForTab(month, tab)) {
      btn.classList.remove('disabled');
    } else {
      const channels = getAvailableChannelsForMonth(month);
      const channelMap = { google: 'googleAds', meta: 'metaAds', instagram: 'instagram', youtube: 'youtube', tiktok: 'tiktok', linkedin: 'linkedin', mailchimp: 'mailchimp' };
      if (channelMap[tab] && channels.includes(channelMap[tab])) {
        btn.classList.remove('disabled');
      } else {
        btn.classList.add('disabled');
        btn.classList.remove('active');
      }
    }
  });
}

function activateFirstAvailableTab() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));

  const overviewBtn = document.querySelector('.tab-btn[data-tab="uebersicht"]');
  const overview = document.getElementById('tab-uebersicht');
  if (overviewBtn && !overviewBtn.classList.contains('disabled')) {
    overviewBtn.classList.add('active');
    if (overview) overview.classList.add('active');
    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: 'uebersicht' } }));
    return;
  }

  const availableBtns = document.querySelectorAll('.tab-btn:not(.disabled)');
  if (availableBtns.length > 0) {
    const first = availableBtns[0];
    first.classList.add('active');
    const target = document.getElementById(`tab-${first.dataset.tab}`);
    if (target) target.classList.add('active');
    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: first.dataset.tab } }));
  } else {
    const emptyEl = document.getElementById('tab-empty');
    if (emptyEl) emptyEl.classList.add('active');
  }
}

export function initMonthSelector() {
  const container = document.querySelector('.month-selector');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.month-btn');
    if (!btn || btn.classList.contains('disabled')) return;

    const month = btn.dataset.month;
    if (!month) return;

    if (month === currentMonth) {
      showOverview();
      return;
    }

    selectMonth(month);
  });

  initYearSelector();
}

function initYearSelector() {
  const currentYear = new Date().getFullYear();
  const yearButtons = document.querySelectorAll('.year-btn');

  yearButtons.forEach(btn => {
    const year = parseInt(btn.dataset.year, 10);
    if (year > currentYear) {
      btn.classList.add('disabled');
      btn.setAttribute('disabled', 'true');
    }

    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      yearButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

export function updateDashboardData(month) {
  const data = getMonthData(month);
  if (!data) return;

  const prevMonthKey = getPreviousMonthKey(month);
  const prevData = prevMonthKey ? getMonthData(prevMonthKey) : null;

  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const displayName = monthNames[month] || month;
  const titleSuffix = ` — ${displayName} 2026`;

  const titleIds = ['overview-title', 'google-title', 'meta-title', 'instagram-title', 'youtube-title', 'tiktok-title', 'linkedin-title', 'mailchimp-title', 'studycheck-title', 'infomaterial-title', 'vertrag-title'];
  titleIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      let textEl = el.querySelector('.title-text');
      if (!textEl) {
        const icon = el.querySelector('.title-icon');
        const badge = el.querySelector('.last-updated-badge');
        const inlineUpload = el.querySelector('.inline-upload');
        const iconHtml = icon ? icon.outerHTML : '';
        el.innerHTML = iconHtml + '<span class="title-text"></span>';
        textEl = el.querySelector('.title-text');
        if (badge) el.appendChild(badge);
        if (inlineUpload) el.appendChild(inlineUpload);
      }
      const base = textEl.textContent.split('—')[0].trim();
      textEl.textContent = base + titleSuffix;
    }
  });

  const manualTabs = {
    'studycheck-title': { source: 'studycheck', tab: 'studycheck' },
    'infomaterial-title': { source: 'infomaterial', tab: 'infomaterial' },
    'vertrag-title': { source: 'vertrag', tab: 'vertrag' },
    'linkedin-title': { source: 'linkedin', tab: 'linkedin' },
    'tiktok-title': { source: 'tiktok', tab: 'tiktok' },
  };
  const timestamps = getLastUpdatedTimestamps();
  Object.entries(manualTabs).forEach(([titleId, { source, tab }]) => {
    const el = document.getElementById(titleId);
    if (!el) return;
    const ts = timestamps[source];
    let badge = el.querySelector('.last-updated-badge');
    if (ts) {
      const d = new Date(ts);
      const formatted = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'last-updated-badge';
        const inlineUpload = el.querySelector('.inline-upload');
        if (inlineUpload) {
          el.insertBefore(badge, inlineUpload);
        } else {
          el.appendChild(badge);
        }
      }
      badge.textContent = `Zuletzt aktualisiert: ${formatted}`;
      badge.style.display = '';
    } else if (badge) {
      badge.style.display = 'none';
    }
  });

  normalizeTiktokData(month);
  normalizeLinkedinData(month);

  enrichOverviewWithAllChannels(data);

  updateKpiSection('overview', data.overview, !!prevData);
  updateKpiSection('google', data.googleAds, !!prevData);
  updateKpiSection('meta', data.metaAds, !!prevData);
  updateKpiSection('instagram', data.instagram, !!prevData);
  updateKpiSection('youtube', data.youtube, !!prevData);
  updateKpiSection('tiktok', data.tiktok, !!prevData);
  updateKpiSection('linkedin', data.linkedin, !!prevData);
  updateKpiSection('mailchimp', data.mailchimp, !!prevData);
  updateKpiSection('studycheck', data.studycheck, !!prevData);
  updateKpiSection('infomaterial', data.infomaterial, !!prevData);

  renderGoogleCampaigns(data.googleAds);
  renderMetaCampaigns(data.metaAds);
  renderMailchimpTable(data.mailchimp);
  renderStudycheckTable(data.studycheck);
  renderStudycheckTab(month);
  renderInfomaterialTab(month);
  renderContractOverviewTab(month);
  renderLinkedinTab(month);
  renderTiktokTab(month);
}

function parseKpiNumber(val) {
  if (val === undefined || val === null || val === '—' || val === '-') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[€$£%\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function getKpiVal(channelData, key) {
  if (!channelData) return 0;
  const kpi = channelData[key];
  if (!kpi || typeof kpi !== 'object') return 0;
  return parseKpiNumber(kpi.value);
}

function fmtNum(n) {
  return Math.round(n).toLocaleString('de-DE');
}

function enrichOverviewWithAllChannels(data) {
  if (!data.overview) data.overview = {};

  const g = data.googleAds;
  const m = data.metaAds;
  const ig = data.instagram;
  const yt = data.youtube;
  const tt = data.tiktok;
  const li = data.linkedin;
  const mc = data.mailchimp;
  const sc = data.studycheck;

  const impGoogle = getKpiVal(g, 'impressionen');
  const impMeta = getKpiVal(m, 'impressionen');
  const impInsta = getKpiVal(ig, 'impressionen');
  const impYouTube = getKpiVal(yt, 'views');
  const impLinkedIn = getKpiVal(li, 'impressionen');
  const impStudycheck = getKpiVal(sc, 'seitenaufrufe');
  const impTotal = impGoogle + impMeta + impInsta + impYouTube + impLinkedIn + impStudycheck;

  const impSources = [];
  if (impGoogle) impSources.push(`Google: ${fmtNum(impGoogle)}`);
  if (impMeta) impSources.push(`Meta: ${fmtNum(impMeta)}`);
  if (impInsta) impSources.push(`Insta: ${fmtNum(impInsta)}`);
  if (impYouTube) impSources.push(`YT: ${fmtNum(impYouTube)}`);
  if (impLinkedIn) impSources.push(`LI: ${fmtNum(impLinkedIn)}`);
  if (impStudycheck) impSources.push(`SC: ${fmtNum(impStudycheck)}`);

  data.overview.impressionen = {
    value: fmtNum(impTotal),
    detail: impSources.join(' · ') || 'Keine Daten',
  };

  const rwMeta = getKpiVal(m, 'reichweite');
  const rwInsta = getKpiVal(ig, 'reichweite');
  const rwStudycheck = getKpiVal(sc, 'besucher');
  const rwTotal = rwMeta + rwInsta + rwStudycheck;

  const rwSources = [];
  if (rwMeta) rwSources.push(`Meta: ${fmtNum(rwMeta)}`);
  if (rwInsta) rwSources.push(`Insta: ${fmtNum(rwInsta)}`);
  if (rwStudycheck) rwSources.push(`SC: ${fmtNum(rwStudycheck)}`);

  data.overview.reichweite = {
    value: fmtNum(rwTotal),
    detail: rwSources.join(' · ') || 'Keine Daten',
  };

  const klGoogle = getKpiVal(g, 'klicks');
  const klMeta = getKpiVal(m, 'linkKlicks');
  const klLinkedIn = getKpiVal(li, 'klicks');
  const klStudycheck = getKpiVal(sc, 'klicks');
  const klTotal = klGoogle + klMeta + klLinkedIn + klStudycheck;

  const klSources = [];
  if (klGoogle) klSources.push(`Google: ${fmtNum(klGoogle)}`);
  if (klMeta) klSources.push(`Meta: ${fmtNum(klMeta)}`);
  if (klLinkedIn) klSources.push(`LI: ${fmtNum(klLinkedIn)}`);
  if (klStudycheck) klSources.push(`SC: ${fmtNum(klStudycheck)}`);

  data.overview.klicks = {
    value: fmtNum(klTotal),
    detail: klSources.join(' · ') || 'Keine Daten',
  };

  const fInsta = getKpiVal(ig, 'follower');
  const fYouTube = getKpiVal(yt, 'subscribers');
  const fLinkedIn = getKpiVal(li, 'follower');
  const fTikTok = getKpiVal(tt, 'follower');
  const fTotal = fInsta + fYouTube + fLinkedIn + fTikTok;

  const fSources = [];
  if (fInsta) fSources.push(`Insta: ${fmtNum(fInsta)}`);
  if (fYouTube) fSources.push(`YT: ${fmtNum(fYouTube)}`);
  if (fLinkedIn) fSources.push(`LI: ${fmtNum(fLinkedIn)}`);
  if (fTikTok) fSources.push(`TT: ${fmtNum(fTikTok)}`);

  data.overview.followerGesamt = {
    value: fmtNum(fTotal),
    detail: fSources.join(' · ') || 'Keine Daten',
  };

  const emailSubs = getKpiVal(mc, 'subscribers');

  data.overview.emailAbonnenten = {
    value: emailSubs ? fmtNum(emailSubs) : '—',
    detail: emailSubs ? 'Mailchimp Newsletter' : 'Keine Daten',
  };

  delete data.overview.cpc;
  delete data.overview.ctr;
}

function updateKpiSection(sectionId, sectionData, hasPrevMonth) {
  if (!sectionData) return;

  Object.entries(sectionData).forEach(([key, val]) => {
    if (val && typeof val === 'object' && val.value !== undefined) {
      const el = document.querySelector(`[data-kpi="${sectionId}-${key}"]`);
      if (el) {
        const valueEl = el.querySelector('.kpi-value');

        let displayValue = val.value;
        if (typeof displayValue === 'string' && displayValue.includes('%') && displayValue.includes('.')) {
          displayValue = displayValue.replace('.', ',');
        }
        if (typeof displayValue === 'number' && Number.isFinite(displayValue)) {
          displayValue = displayValue.toLocaleString('de-DE');
        } else if (typeof displayValue === 'string') {
          const trimmed = displayValue.trim();
          if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed)) {
          } else if (/^\d{4,}$/.test(trimmed)) {
            displayValue = Number(trimmed).toLocaleString('de-DE');
          } else {
            const numInStr = trimmed.match(/^([€$£+\-]?\s*)(\d{4,})([\s,.].*)?$/);
            if (numInStr) {
              const p = numInStr[1] || '';
              const n = Number(numInStr[2]).toLocaleString('de-DE');
              const s = numInStr[3] || '';
              displayValue = p + n + s;
            }
          }
        }

        if (val.deltaMode) {
          if (valueEl) {
            valueEl.textContent = displayValue;
            valueEl.dataset.target = displayValue;
            valueEl.classList.remove('delta-positive', 'delta-negative');
            valueEl.classList.add(val.positive !== false ? 'delta-positive' : 'delta-negative');
          }
          const trendEl = el.querySelector('.kpi-trend');
          if (trendEl) {
            trendEl.textContent = '';
            trendEl.style.display = 'none';
          }
          const detailEl = el.querySelector('.kpi-detail');
          if (detailEl && val.detail) detailEl.textContent = val.detail;
          return;
        }

        if (valueEl) {
          valueEl.textContent = displayValue;
          valueEl.dataset.target = displayValue;
          valueEl.classList.remove('delta-positive', 'delta-negative');
        }

        const trendEl = el.querySelector('.kpi-trend');
        if (trendEl) {
          if (val.trend && hasPrevMonth) {
            trendEl.textContent = val.trend;
            trendEl.style.display = '';
            trendEl.className = 'kpi-trend';
            if (val.trendDir) {
              if (val.trendDir.includes('good')) trendEl.classList.add('positive');
              else if (val.trendDir.includes('bad')) trendEl.classList.add('negative');
              else if (val.trendDir === 'up') trendEl.classList.add('up');
              else if (val.trendDir === 'down') trendEl.classList.add('down');
            }
          } else {
            trendEl.textContent = '';
            trendEl.style.display = 'none';
          }
        }

        const detailEl = el.querySelector('.kpi-detail');
        if (detailEl && val.detail) detailEl.textContent = val.detail;
      }
    }
  });
}


function hasSpend(c) {
  if (!c) return false;
  const n = parseKpiNumber(c.spend);
  return n > 0;
}

function normalizeGoogleStatus(status) {
  if (status === null || status === undefined || status === '') {
    return { label: 'AKTIV', cls: 'active' };
  }
  const s = String(status).trim().toUpperCase();
  const map = {
    '2': { label: 'AKTIV', cls: 'active' },
    'ENABLED': { label: 'AKTIV', cls: 'active' },
    'AKTIV': { label: 'AKTIV', cls: 'active' },
    'ACTIVE': { label: 'AKTIV', cls: 'active' },
    '3': { label: 'PAUSIERT', cls: 'paused' },
    'PAUSED': { label: 'PAUSIERT', cls: 'paused' },
    'PAUSIERT': { label: 'PAUSIERT', cls: 'paused' },
    '4': { label: 'ENTFERNT', cls: 'removed' },
    'REMOVED': { label: 'ENTFERNT', cls: 'removed' },
    '0': { label: 'AKTIV', cls: 'active' },
    '1': { label: 'AKTIV', cls: 'active' },
    'UNKNOWN': { label: 'AKTIV', cls: 'active' },
  };
  return map[s] || { label: s, cls: '' };
}

function renderGoogleCampaigns(googleAds) {
  const container = document.getElementById('google-campaign-sections');
  if (!container) return;
  container.innerHTML = '';

  if (!googleAds || !googleAds.kampagnen) return;

  const kampagnen = googleAds.kampagnen
    .filter(hasSpend)
    .slice()
    .sort((a, b) => parseKpiNumber(b.spend) - parseKpiNumber(a.spend));

  if (kampagnen.length === 0) {
    container.innerHTML = '<p class="section-subtitle">Keine Kampagnen mit Ausgaben in diesem Monat.</p>';
    return;
  }

  kampagnen.forEach(c => {
    const statusInfo = normalizeGoogleStatus(c.status);
    const badges = (c.badges || []).map(b => {
      const lower = b.toLowerCase();
      const cls = lower.includes('winner') || lower.includes('star')
        ? 'winner'
        : lower.includes('kritisch') || lower.includes('loser')
          ? 'loser'
          : 'neutral';
      const icon = cls === 'winner' ? '🏆 ' : cls === 'loser' ? '⚠ ' : '';
      return `<span class="campaign-badge ${cls}">${icon}${b}</span>`;
    }).join('');

    const progressPct = typeof c.progressPct === 'number'
      ? c.progressPct
      : (statusInfo.cls === 'active' ? 100 : 0);

    const impressionen = c.impressionen ?? c.impressions ?? null;

    const metricsRow1 = [
      { label: 'Spend',       value: c.spend },
      { label: 'Conversions', value: c.leads },
      { label: 'CPL',         value: c.cpl },
      { label: 'Klicks',      value: c.klicks },
      { label: 'CPC',         value: c.cpc },
      { label: 'CTR',         value: c.ctr },
    ].map(m => `<div class="metric-item"><span class="metric-label">${m.label}</span><span class="metric-value">${m.value ?? '—'}</span></div>`).join('');

    const impressionenRow = impressionen !== null && impressionen !== undefined
      ? `<div class="campaign-metrics">
          <div class="metric-item"><span class="metric-label">Impressionen</span><span class="metric-value">${impressionen}</span></div>
        </div>`
      : '';

    container.innerHTML += `
      <div class="campaign-section">
        <div class="campaign-header">
          <div class="campaign-header-left">
            <span class="campaign-name">${c.name}</span>
            ${badges}
          </div>
          <span class="campaign-status ${statusInfo.cls}">${statusInfo.label}</span>
        </div>
        <div class="campaign-progress"><div class="campaign-progress-fill" style="width:${progressPct}%"></div></div>
        <div class="campaign-metrics">
          ${metricsRow1}
        </div>
        ${impressionenRow}
      </div>`;
  });
}

function renderMetaCampaigns(metaAds) {
  const container = document.getElementById('meta-campaign-sections');
  if (!container) return;
  container.innerHTML = '';

  if (!metaAds || !metaAds.kampagnen) return;

  const kampagnen = metaAds.kampagnen
    .filter(hasSpend)
    .slice()
    .sort((a, b) => parseKpiNumber(b.spend) - parseKpiNumber(a.spend));

  if (kampagnen.length === 0) {
    container.innerHTML = '<p class="section-subtitle">Keine Kampagnen mit Ausgaben in diesem Monat.</p>';
    return;
  }

  kampagnen.forEach(c => {
    const badgeCls = (c.badge || '').toLowerCase().includes('winner') ? 'winner' : 'loser';
    container.innerHTML += `
      <div class="campaign-section">
        <div class="campaign-header">
          <div class="campaign-header-left">
            <span class="campaign-name">${c.name}</span>
            <span class="campaign-badge ${badgeCls}">${c.badge === 'WINNER' ? '🏆' : '⚠'} ${c.badge}</span>
            <span class="campaign-groups">${c.groups}</span>
          </div>
          <span class="campaign-status">${c.status}</span>
        </div>
        <div class="campaign-progress"><div class="campaign-progress-fill" style="width:${c.progressPct || 0}%"></div></div>
        <div class="campaign-metrics">
          <div class="metric-item"><span class="metric-label">Spend</span><span class="metric-value">${c.spend}</span></div>
          <div class="metric-item"><span class="metric-label">Leads</span><span class="metric-value">${c.leads}</span></div>
          <div class="metric-item"><span class="metric-label">CPL</span><span class="metric-value">${c.cpl}</span></div>
          <div class="metric-item"><span class="metric-label">Link-Klicks</span><span class="metric-value">${c.klicks}</span></div>
          <div class="metric-item"><span class="metric-label">CPC</span><span class="metric-value">${c.cpc}</span></div>
          <div class="metric-item"><span class="metric-label">CTR</span><span class="metric-value">${c.ctr}</span></div>
        </div>
        <div class="campaign-metrics">
          <div class="metric-item"><span class="metric-label">Reichweite</span><span class="metric-value">${c.reichweite || '—'}</span></div>
          <div class="metric-item"><span class="metric-label">Impressionen</span><span class="metric-value">${c.impressionen || '—'}</span></div>
          <div class="metric-item"></div>
          <div class="metric-item"><span class="metric-label">Frequenz</span><span class="metric-value">${c.frequenz || '—'}</span></div>
          <div class="metric-item"></div><div class="metric-item"></div>
        </div>
      </div>`;
  });
}

function renderMailchimpTable(mailchimp) {
  const table = document.getElementById('mailchimp-campaign-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  if (!mailchimp || !mailchimp.campaignList) return;

  mailchimp.campaignList.forEach(c => {
    const or = c.openRate ? c.openRate.replace('.', ',') : c.openRate;
    const cr = c.clickRate ? c.clickRate.replace('.', ',') : c.clickRate;
    tbody.innerHTML += `<tr><td>${c.name}</td><td>${typeof c.sent === 'number' ? c.sent.toLocaleString('de-DE') : c.sent}</td><td>${or}</td><td>${cr}</td><td>${c.date}</td></tr>`;
  });
}

function renderStudycheckTable(studycheck) {
}

