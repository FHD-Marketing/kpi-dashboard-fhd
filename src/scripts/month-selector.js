/**
 * FHD KPI Dashboard – Month Selector
 * 
 * Steuert die Monatsauswahl in der horizontalen Leiste.
 * Aktualisiert alle KPI-Werte und Charts beim Monatswechsel.
 * 
 * @module month-selector
 */

import { getMonthData, getAvailableMonths } from './data.js';

/** Aktuell ausgewählter Monat */
let currentMonth = 'feb';

/**
 * Gibt den aktuell ausgewählten Monat zurück.
 * @returns {string}
 */
export function getCurrentMonth() {
  return currentMonth;
}

/**
 * Initialisiert die Monatsauswahl.
 * Registriert Click-Events und setzt den Standardmonat.
 */
export function initMonthSelector() {
  const monthButtons = document.querySelectorAll('.month-btn:not(.disabled)');

  monthButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const month = btn.dataset.month;
      if (!month || month === currentMonth) return;

      // Alle deaktivieren
      monthButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentMonth = month;

      // Custom Event auslösen
      document.dispatchEvent(new CustomEvent('monthChanged', { detail: { month } }));
    });
  });
}

/**
 * Aktualisiert alle KPI-Werte im DOM basierend auf dem ausgewählten Monat.
 * @param {string} month - Monatskürzel
 */
export function updateDashboardData(month) {
  const data = getMonthData(month);
  if (!data) return;

  // Übersicht KPIs
  updateKpiSection('overview', data.overview);
  
  // Budget Cards
  updateBudgetCards(data.overview.budgetPlan);

  // Google Ads
  updateKpiSection('google', data.googleAds);

  // Meta Ads
  updateKpiSection('meta', data.metaAds);

  // Social Channels
  updateKpiSection('instagram', data.instagram);
  updateKpiSection('youtube', data.youtube);
  updateKpiSection('tiktok', data.tiktok);
  updateKpiSection('linkedin', data.linkedin);
  updateKpiSection('mailchimp', data.mailchimp);
  updateKpiSection('studycheck', data.studycheck);
}

/**
 * Aktualisiert eine KPI-Section im DOM.
 * @param {string} sectionId - CSS-Prefix der Section
 * @param {Object} sectionData - Datenobjekt
 */
function updateKpiSection(sectionId, sectionData) {
  if (!sectionData) return;

  Object.entries(sectionData).forEach(([key, val]) => {
    if (val && typeof val === 'object' && val.value !== undefined) {
      const el = document.querySelector(`[data-kpi="${sectionId}-${key}"]`);
      if (el) {
        const valueEl = el.querySelector('.kpi-value');
        if (valueEl) valueEl.textContent = val.value;

        const trendEl = el.querySelector('.kpi-trend');
        if (trendEl && val.trend) {
          trendEl.textContent = val.trend;
          trendEl.className = 'kpi-trend';
          if (val.trendDir) {
            if (val.trendDir.includes('good')) trendEl.classList.add('positive');
            else if (val.trendDir.includes('bad')) trendEl.classList.add('negative');
            else if (val.trendDir === 'up') trendEl.classList.add('up');
            else if (val.trendDir === 'down') trendEl.classList.add('down');
          }
        }

        const detailEl = el.querySelector('.kpi-detail');
        if (detailEl && val.detail) detailEl.textContent = val.detail;
      }
    }
  });
}

/**
 * Aktualisiert die Budget-Cards. 
 * @param {Object} budgetData - Budget Plan vs. Ist Daten
 */
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
