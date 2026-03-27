import { getMonthData, getPreviousMonthKey, getAvailableMonths, hasDataForTab, fetchOverview, fetchChannel, clearMonthChannels, getAvailableChannelsForMonth, isChannelCached } from './data.js';
import { showOverview } from './tab-navigation.js';
import { renderInfomaterialTab } from './infomaterial.js';
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

    if (index <= currentMonthIndex) {
      btn.classList.remove('disabled');

      const data = getMonthData(month);
      const spendEl = btn.querySelector('.month-spend');
      if (spendEl) {
        spendEl.textContent = (data && data.totalSpend) ? data.totalSpend : '';
      }

      if (available.includes(month)) {
        btn.classList.add('has-data');
      } else {
        btn.classList.remove('has-data');
      }

      btn.style.setProperty('--pop-delay', (popIndex * 80) + 'ms');
      void btn.offsetWidth;
      btn.classList.add('month-pop-in');
      popIndex++;
    } else {
      btn.classList.add('disabled');
      btn.classList.remove('has-data');
    }
  });
}

export function activateLatestMonth() {
  const monthOrder = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const currentMonthIdx = new Date().getMonth();
  const currentMonthKey = monthOrder[currentMonthIdx];
  selectMonth(currentMonthKey);
}

function resetTabContents() {
  destroyAllCharts();

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

  ['google-spend-bars', 'google-campaign-cards', 'meta-campaign-sections'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  document.querySelectorAll('.data-table tbody').forEach(tbody => {
    tbody.innerHTML = '';
  });

  document.querySelectorAll('[data-budget]').forEach(card => {
    const planEl = card.querySelector('.budget-plan span');
    const actualEl = card.querySelector('.budget-actual span');
    const barFill = card.querySelector('.budget-bar-fill');
    const diffEl = card.querySelector('.budget-diff');
    if (planEl) planEl.textContent = '—';
    if (actualEl) actualEl.textContent = '—';
    if (barFill) { barFill.style.width = '0%'; barFill.className = 'budget-bar-fill'; }
    if (diffEl) { diffEl.textContent = ''; diffEl.className = 'budget-diff'; }
  });

  document.querySelectorAll('.kpi-card, .chart-card, .budget-card, .campaign-section, .google-campaign-card, .infomaterial-faculty-card, .infomaterial-chart-card').forEach(card => {
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
  const toFetch = channels.filter(ch => !isChannelCached(ch, month));

  for (const channel of toFetch) {
    if (myGen !== loadGeneration) return;
    try {
      await fetchChannel(channel, month);
    } catch (err) {
      console.warn(`[Prefetch] ${channel}/${month} failed:`, err);
    }
  }

  if (!isChannelCached('infomaterial', month)) {
    try {
      await fetchChannel('infomaterial', month);
    } catch (_) {
    }
  }

  if (myGen !== loadGeneration) return;

  updateTabAvailability(month);
  updateDashboardData(month);

  const animatableSelector = '.kpi-card, .chart-card, .budget-card, .campaign-section, .google-campaign-card, .infomaterial-faculty-card, .infomaterial-chart-card';
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

    // Overview and manual tabs are always available for all unlocked months
    if (tab === 'uebersicht' || tab === 'infomaterial' || tab === 'studycheck' || tab === 'vertrag') {
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

  // Overview is always the default tab
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

  // Month names for frontend display (German)
  const monthNames = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };
  const displayName = monthNames[month] || month;
  const titleSuffix = ` — ${displayName} 2026`;

  const titleIds = ['overview-title', 'google-title', 'meta-title', 'instagram-title', 'youtube-title', 'tiktok-title', 'linkedin-title', 'mailchimp-title', 'studycheck-title', 'infomaterial-title', 'vertrag-title'];
  titleIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const icon = el.querySelector('.title-icon');
      const iconHtml = icon ? icon.outerHTML + ' ' : '';
      if (icon) icon.remove();
      const base = el.textContent.split('—')[0].trim();
      el.innerHTML = iconHtml + base + titleSuffix;
    }
  });

  updateKpiSection('overview', data.overview, !!prevData);
  if (data.overview) updateBudgetCards(data.overview.budgetPlan);
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
  renderInfomaterialTab(month);
}

function updateKpiSection(sectionId, sectionData, hasPrevMonth) {
  if (!sectionData) return;

  Object.entries(sectionData).forEach(([key, val]) => {
    if (val && typeof val === 'object' && val.value !== undefined) {
      const el = document.querySelector(`[data-kpi="${sectionId}-${key}"]`);
      if (el) {
        const valueEl = el.querySelector('.kpi-value');

        let displayValue = val.value;
        if (typeof displayValue === 'number' && Number.isFinite(displayValue)) {
          displayValue = displayValue.toLocaleString('de-DE');
        } else if (typeof displayValue === 'string' && /^\d{4,}$/.test(displayValue.trim())) {
          displayValue = Number(displayValue).toLocaleString('de-DE');
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

function updateBudgetCards(budgetData) {
  if (!budgetData) return;

  Object.entries(budgetData).forEach(([key, val]) => {
    const card = document.querySelector(`[data-budget="${key}"]`);
    if (!card) return;

    const planEl = card.querySelector('.budget-plan span');
    const actualEl = card.querySelector('.budget-actual span');
    const barFill = card.querySelector('.budget-bar-fill');
    const diffEl = card.querySelector('.budget-diff');

    if (planEl) planEl.textContent = val.plan;
    if (actualEl) actualEl.textContent = val.ist;
    if (barFill) {
      barFill.style.width = `${Math.min(val.pct, 100)}%`;
      barFill.className = `budget-bar-fill ${val.status}`;
    }
    if (diffEl) {
      diffEl.textContent = val.diff;
      diffEl.className = `budget-diff ${val.status}`;
    }
  });
}

function renderGoogleCampaigns(googleAds) {
  const barsContainer = document.getElementById('google-spend-bars');
  const cardsContainer = document.getElementById('google-campaign-cards');
  if (!barsContainer || !cardsContainer) return;

  barsContainer.innerHTML = '';
  cardsContainer.innerHTML = '';

  if (!googleAds || !googleAds.spendByKampagne) return;

  googleAds.spendByKampagne.forEach(k => {
    barsContainer.innerHTML += `<div class="horiz-bar-row"><span class="horiz-bar-label">${k.name}</span><div class="horiz-bar-track"><div class="horiz-bar-fill" style="width:${k.pct}%"></div></div><span class="horiz-bar-value">€${k.spend.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span></div>`;
  });

  if (googleAds.kampagnen) {
    googleAds.kampagnen.forEach(c => {
      const badges = (c.badges || []).map(b => {
        const cls = b.toLowerCase().includes('winner') || b.toLowerCase().includes('star') ? 'winner' : b.toLowerCase().includes('kritisch') ? 'loser' : 'neutral';
        return `<span class="campaign-badge ${cls}">${b}</span>`;
      }).join('');

      cardsContainer.innerHTML += `
        <div class="google-campaign-card">
          <div class="google-campaign-header">
            <span class="google-campaign-name">${badges} ${c.name}</span>
            <span class="google-campaign-status ${c.statusType || ''}">${c.status || ''} ▼</span>
          </div>
          <div class="google-campaign-body">
            <div class="google-metrics-grid">
              <div class="google-metric"><span class="g-label">Spend</span><span class="g-value">${c.spend}</span></div>
              <div class="google-metric"><span class="g-label">Leads</span><span class="g-value">${c.leads}</span></div>
              <div class="google-metric"><span class="g-label">CPL</span><span class="g-value">${c.cpl}</span></div>
              <div class="google-metric"><span class="g-label">Klicks</span><span class="g-value">${c.klicks}</span></div>
              <div class="google-metric"><span class="g-label">CPC</span><span class="g-value">${c.cpc}</span></div>
              <div class="google-metric"><span class="g-label">CTR</span><span class="g-value">${c.ctr}</span></div>
            </div>
          </div>
        </div>`;
    });
  }
}

function renderMetaCampaigns(metaAds) {
  const container = document.getElementById('meta-campaign-sections');
  if (!container) return;
  container.innerHTML = '';

  if (!metaAds || !metaAds.kampagnen) return;

  metaAds.kampagnen.forEach(c => {
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
    tbody.innerHTML += `<tr><td>${c.name}</td><td>${typeof c.sent === 'number' ? c.sent.toLocaleString('de-DE') : c.sent}</td><td>${c.openRate}</td><td>${c.clickRate}</td><td>${c.date}</td></tr>`;
  });
}

function renderStudycheckTable(studycheck) {
  const table = document.getElementById('studycheck-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  if (!studycheck || !studycheck.studiengaenge) return;

  studycheck.studiengaenge.forEach(s => {
    tbody.innerHTML += `<tr><td>${s.name}</td><td>${s.score}</td><td>${s.reviews}</td><td>${typeof s.views === 'number' ? s.views.toLocaleString('de-DE') : s.views}</td></tr>`;
  });
}

