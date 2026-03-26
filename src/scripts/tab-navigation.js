/**
 * FHD KPI Dashboard – Tab Navigation
 * @module tab-navigation
 */

import { getChannelForTab, isChannelCached, fetchChannel } from './data.js';
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

      // ── Lazy-load channel data if not cached ──
      const channel = getChannelForTab(targetTab);
      const month = getCurrentMonth();
      if (channel && month && !isChannelCached(channel, month)) {
        // Show loading spinners inside each data container
        const spinners = [];
        if (target) {
          target.querySelectorAll('.kpi-card').forEach(card => {
            const overlay = document.createElement('div');
            overlay.className = 'kpi-card-loading';
            overlay.innerHTML = '<div class="card-spinner"></div>';
            card.appendChild(overlay);
            spinners.push(overlay);
          });
          target.querySelectorAll('.chart-card').forEach(card => {
            const overlay = document.createElement('div');
            overlay.className = 'chart-card-loading';
            overlay.innerHTML = '<div class="card-spinner"></div><span class="loading-label">Laden…</span>';
            card.appendChild(overlay);
            spinners.push(overlay);
          });
        }
        try {
          await fetchChannel(channel, month);
          updateDashboardData(month);
        } catch (err) {
          console.error(`Failed to load ${channel} for ${month}:`, err);
        } finally {
          spinners.forEach(el => el.remove());
        }
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

