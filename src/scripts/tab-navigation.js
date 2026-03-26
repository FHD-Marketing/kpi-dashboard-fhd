/**
 * FHD KPI Dashboard – Tab Navigation
 * @module tab-navigation
 */

import { getCurrentMonth, updateDashboardData } from './month-selector.js';

export function initTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('disabled')) return;

      const targetTab = btn.dataset.tab;

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(`tab-${targetTab}`);
      if (target) {
        target.classList.add('active');
      }

      // All data is already loaded by selectMonth – just re-render
      const month = getCurrentMonth();
      if (month) {
        updateDashboardData(month);
      }

      document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: targetTab } }));
    });
  });

  const sliders = document.querySelectorAll('.tab-navigation');
  sliders.forEach(slider => {
    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
      isDown = true;
      slider.style.cursor = 'grabbing';
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener('mouseleave', () => {
      isDown = false;
      slider.style.cursor = 'grab';
    });

    slider.addEventListener('mouseup', () => {
      isDown = false;
      slider.style.cursor = 'grab';
    });

    slider.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 2;
      slider.scrollLeft = scrollLeft - walk;
    });

    slider.style.cursor = 'grab';
  });
}

export function showOverview() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));

  const overview = document.getElementById('tab-uebersicht');
  if (overview) {
    overview.classList.add('active');
  }

  document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: 'uebersicht' } }));
}

