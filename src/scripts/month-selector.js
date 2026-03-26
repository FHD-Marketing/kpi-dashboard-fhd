/**
 * FHD KPI Dashboard – Month Selector
 * @module month-selector
 */

import { getMonthData, getPreviousMonthKey, getAvailableMonths, hasDataForTab } from './data.js';
import { showOverview } from './tab-navigation.js';
import { renderInfomaterialTab } from './infomaterial.js';

let currentMonth = null;

export function getCurrentMonth() {
  return currentMonth;
}

export function refreshMonthButtons() {
  const allMonthBtns = document.querySelectorAll('.month-btn');
  const available = getAvailableMonths();

  allMonthBtns.forEach(btn => {
    const month = btn.dataset.month;
    if (!month) return;

    if (available.includes(month)) {
      btn.classList.remove('disabled');
      const data = getMonthData(month);
      const spendEl = btn.querySelector('.month-spend');
      if (spendEl && data && data.totalSpend) {
        spendEl.textContent = data.totalSpend;
      }
    } else {
      btn.classList.add('disabled');
    }
  });
}

export function activateLatestMonth() {
  const available = getAvailableMonths();
  if (available.length === 0) return;

  const latest = available[available.length - 1];
  selectMonth(latest);
}

function selectMonth(month) {
  const allMonthBtns = document.querySelectorAll('.month-btn');
  allMonthBtns.forEach(b => b.classList.remove('active'));

  const btn = document.querySelector(`.month-btn[data-month="${month}"]`);
  if (btn) btn.classList.add('active');

  currentMonth = month;

  // Empty state ausblenden
  const empty = document.getElementById('tab-empty');
  if (empty) empty.classList.remove('active');

  updateTabAvailability(month);
  updateDashboardData(month);
  activateFirstAvailableTab(month);

  document.dispatchEvent(new CustomEvent('monthChanged', { detail: { month } }));
}

function updateTabAvailability(month) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    // Infomaterial tab is always enabled (data comes from manual upload)
    if (tab === 'infomaterial') {
      btn.classList.remove('disabled');
      return;
    }
    if (hasDataForTab(month, tab)) {
      btn.classList.remove('disabled');
    } else {
      btn.classList.add('disabled');
      btn.classList.remove('active');
    }
  });
}

function activateFirstAvailableTab(month) {
  const tabBtns = document.querySelectorAll('.tab-btn:not(.disabled)');
  const tabContents = document.querySelectorAll('.tab-content');

  tabContents.forEach(c => c.classList.remove('active'));

  if (tabBtns.length > 0) {
    const first = tabBtns[0];
    first.classList.add('active');
    const target = document.getElementById(`tab-${first.dataset.tab}`);
    if (target) target.classList.add('active');
    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: first.dataset.tab } }));
  } else {
    const empty = document.getElementById('tab-empty');
    if (empty) empty.classList.add('active');
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

  const yearButtons = document.querySelectorAll('.year-btn');
  yearButtons.forEach(btn => {
    btn.addEventListener('click', () => {
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
  const mName = monthNames[month] || month;
  const titleSuffix = ` — ${mName} 2026`;

  const titleIds = ['overview-title', 'google-title', 'meta-title', 'instagram-title', 'youtube-title', 'tiktok-title', 'linkedin-title', 'mailchimp-title', 'studycheck-title', 'infomaterial-title'];
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

        // Delta mode: value is "+34" or "-12", detail is "2.015 gesamt"
        if (val.deltaMode) {
          if (valueEl) {
            valueEl.textContent = val.value;
            valueEl.dataset.target = val.value;
            valueEl.classList.remove('delta-positive', 'delta-negative');
            valueEl.classList.add(val.positive !== false ? 'delta-positive' : 'delta-negative');
          }
          // Hide trend badge entirely for delta-mode cards
          const trendEl = el.querySelector('.kpi-trend');
          if (trendEl) {
            trendEl.textContent = '';
            trendEl.style.display = 'none';
          }
          // Show total in detail
          const detailEl = el.querySelector('.kpi-detail');
          if (detailEl && val.detail) detailEl.textContent = val.detail;
          return;
        }

        if (valueEl) {
          valueEl.textContent = val.value;
          valueEl.dataset.target = val.value;
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
    const istEl = card.querySelector('.budget-actual span');
    const barFill = card.querySelector('.budget-bar-fill');
    const diffEl = card.querySelector('.budget-diff');

    if (planEl) planEl.textContent = val.plan;
    if (istEl) istEl.textContent = val.ist;
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

