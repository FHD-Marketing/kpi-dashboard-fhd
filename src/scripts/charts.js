import { getMonthData } from './data.js';
import { getCurrentMonth } from './month-selector.js';

const chartInstances = {};

function setChartDefaults() {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = '#1e293b';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1e293b';
  Chart.defaults.plugins.tooltip.titleColor = '#f1f5f9';
  Chart.defaults.plugins.tooltip.bodyColor = '#94a3b8';
  Chart.defaults.plugins.tooltip.borderColor = '#334155';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.elements.line.tension = 0.3;
  Chart.defaults.scale.grid = { color: '#1e293b', lineWidth: 0.5 };
}

export function initCharts() {
  setChartDefaults();
  const month = getCurrentMonth();
  renderAllCharts(month);

  document.addEventListener('tabChanged', () => {
    setTimeout(() => renderAllCharts(getCurrentMonth()), 100);
  });

  document.addEventListener('monthChanged', (e) => {
    setTimeout(() => renderAllCharts(e.detail.month), 150);
  });
}

function renderAllCharts(month) {
  const data = getMonthData(month);
  if (!data) return;

  if (data.overview) {
    renderDailySpendChart(data.overview);
    renderBudgetSplitChart(data.overview);
  }

  if (data.instagram) {
    renderLineChart('instagram-follower-chart', data.instagram.followerGrowth, 'Follower', '#e1306c');
    renderBarChartFromPosts('instagram-top-posts-chart', data.instagram.topPosts, 'reach', 'Reichweite', '#e1306c');
  }

  if (data.youtube) {
    renderLineChart('youtube-views-chart', data.youtube.viewsOverTime, 'Views', '#ff0000');
    renderBarChartFromVideos('youtube-top-videos-chart', data.youtube.topVideos, 'views', 'Views', '#ff0000');
  }

  if (data.tiktok) {
    renderBarChartFromVideos('tiktok-performance-chart', data.tiktok.topVideos, 'views', 'Views', '#00f2ea');
    renderLineChart('tiktok-growth-chart', data.tiktok.growth, 'Follower', '#00f2ea');
  }

  if (data.linkedin) {
    renderBarChartFromPosts('linkedin-impressions-chart', data.linkedin.topPosts, 'impressions', 'Impressionen', '#0a66c2');
    renderLineChart('linkedin-follower-chart', data.linkedin.followerGrowth, 'Follower', '#0a66c2');
  }

  if (data.mailchimp) {
    renderMailchimpTrendChart(data.mailchimp.trend);
  }

  if (data.studycheck) {
    renderLineChart('studycheck-score-chart', data.studycheck.scoreHistory, 'Ø Score', '#00b67a');
  }

  if (data.ytdTrends) {
    renderYtdSpendChart(data.ytdTrends);
    renderYtdConversionsChart(data.ytdTrends);
    renderYtdCpcChart(data.ytdTrends);
    renderYtdImpressionsChart(data.ytdTrends);
  }
}

function renderDailySpendChart(overview) {
  const ctx = getCtx('daily-spend-chart');
  if (!ctx) return;

  destroyChart('daily-spend-chart');

  chartInstances['daily-spend-chart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: overview.dailySpend.labels,
      datasets: [
        {
          label: 'Google',
          data: overview.dailySpend.google,
          borderColor: '#4285f4',
          backgroundColor: 'rgba(66,133,244,.1)',
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        },
        {
          label: 'Meta',
          data: overview.dailySpend.meta,
          borderColor: '#0668e1',
          backgroundColor: 'rgba(6,104,225,.05)',
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          borderDash: [4, 2]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => '€' + v }
        }
      }
    }
  });
}

function renderBudgetSplitChart(overview) {
  const ctx = getCtx('budget-split-chart');
  if (!ctx) return;

  destroyChart('budget-split-chart');

  chartInstances['budget-split-chart'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Google Ads', 'Meta Ads'],
      datasets: [{
        data: [overview.budgetSplit.google.value, overview.budgetSplit.meta.value],
        backgroundColor: ['#4285f4', '#0668e1'],
        borderColor: '#111827',
        borderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (tooltipCtx) => {
              const val = tooltipCtx.parsed;
              return `€${val.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`;
            }
          }
        }
      }
    }
  });
}

function renderLineChart(canvasId, chartData, label, color) {
  const ctx = getCtx(canvasId);
  if (!ctx || !chartData) return;

  destroyChart(canvasId);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: label,
        data: chartData.values,
        borderColor: color,
        backgroundColor: color + '15',
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: false }
      }
    }
  });
}

function renderBarChartFromPosts(canvasId, posts, valueKey, label, color) {
  const ctx = getCtx(canvasId);
  if (!ctx || !posts) return;

  destroyChart(canvasId);

  const fullNames = posts.map(p => p.name);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: posts.map(p => p.name.length > 20 ? p.name.substring(0, 20) + '…' : p.name),
      datasets: [{
        label: label,
        data: posts.map(p => p[valueKey]),
        backgroundColor: color + 'cc',
        hoverBackgroundColor: color,
        borderRadius: 4,
        maxBarThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true }
      },
      plugins: {
        tooltip: {
          enabled: false,
          external: function(context) {
            let el = document.getElementById('tooltip-' + canvasId);
            if (!el) {
              el = document.createElement('div');
              el.id = 'tooltip-' + canvasId;
              el.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;background:#1e293b;color:#f1f5f9;border:1px solid #334155;border-radius:8px;padding:8px 12px;font-family:Inter,sans-serif;font-size:12px;line-height:1.5;max-width:420px;white-space:normal;word-break:break-word;transition:opacity .15s ease;box-shadow:0 4px 16px rgba(0,0,0,.4)';
              document.body.appendChild(el);
            }
            const tooltip = context.tooltip;
            if (tooltip.opacity === 0) {
              el.style.opacity = '0';
              return;
            }
            const idx = tooltip.dataPoints && tooltip.dataPoints[0] ? tooltip.dataPoints[0].dataIndex : null;
            const name = idx != null ? fullNames[idx] : '';
            const val = tooltip.dataPoints && tooltip.dataPoints[0] ? tooltip.dataPoints[0].formattedValue : '';
            el.innerHTML = '<div style="font-weight:700;margin-bottom:3px">' + name + '</div><div style="color:#94a3b8"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + color + ';margin-right:6px"></span>' + label + ': ' + val + '</div>';
            el.style.opacity = '1';

            const canvas = context.chart.canvas;
            const rect = canvas.getBoundingClientRect();
            let left = rect.left + tooltip.caretX + 12;
            let top = rect.top + tooltip.caretY - el.offsetHeight / 2;
            if (left + el.offsetWidth > window.innerWidth - 8) {
              left = rect.left + tooltip.caretX - el.offsetWidth - 12;
            }
            top = Math.max(8, Math.min(top, window.innerHeight - el.offsetHeight - 8));
            el.style.left = left + 'px';
            el.style.top = top + 'px';
          }
        }
      }
    }
  });
}

function renderBarChartFromVideos(canvasId, videos, valueKey, label, color) {
  renderBarChartFromPosts(canvasId, videos, valueKey, label, color);
}

function renderMailchimpTrendChart(trend) {
  const ctx = getCtx('mailchimp-trend-chart');
  if (!ctx || !trend) return;

  destroyChart('mailchimp-trend-chart');

  chartInstances['mailchimp-trend-chart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.labels,
      datasets: [
        {
          label: 'Open Rate (%)',
          data: trend.openRates,
          borderColor: '#ffe01b',
          backgroundColor: 'rgba(255,224,27,.1)',
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#ffe01b'
        },
        {
          label: 'Click Rate (%)',
          data: trend.clickRates,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,.05)',
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#f97316'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => v + '%' }
        }
      },
      plugins: {
        legend: { display: true, position: 'bottom' }
      }
    }
  });
}

function renderYtdSpendChart(ytd) {
  const ctx = getCtx('ytd-ausgaben-chart');
  if (!ctx) return;
  destroyChart('ytd-ausgaben-chart');

  chartInstances['ytd-ausgaben-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ytd.monatlicheAusgaben.labels,
      datasets: [
        {
          label: 'Google Ist',
          data: ytd.monatlicheAusgaben.googleIst,
          backgroundColor: '#4285f4cc',
          borderRadius: 4,
          maxBarThickness: 40
        },
        {
          label: 'Meta Ist',
          data: ytd.monatlicheAusgaben.metaIst,
          backgroundColor: '#0668e1cc',
          borderRadius: 4,
          maxBarThickness: 40
        },
        {
          label: 'Plan Gesamt',
          data: ytd.monatlicheAusgaben.planGesamt,
          type: 'line',
          borderColor: '#f97316',
          borderDash: [6, 3],
          pointRadius: 4,
          pointBackgroundColor: '#f97316',
          borderWidth: 2,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          stacked: true,
          ticks: { callback: v => '€' + (v / 1000).toFixed(0) + 'k' }
        },
        x: { stacked: true }
      },
      plugins: {
        legend: { display: true, position: 'bottom' }
      }
    }
  });
}

function renderYtdConversionsChart(ytd) {
  const ctx = getCtx('ytd-conversions-chart');
  if (!ctx) return;
  destroyChart('ytd-conversions-chart');

  chartInstances['ytd-conversions-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ytd.conversions.labels,
      datasets: [
        { label: 'Google', data: ytd.conversions.google, backgroundColor: '#4285f4cc', maxBarThickness: 40 },
        { label: 'Meta',   data: ytd.conversions.meta,   backgroundColor: '#0668e1cc', maxBarThickness: 40 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: true, position: 'bottom' } }
    }
  });
}

function renderYtdCpcChart(ytd) {
  const ctx = getCtx('ytd-cpc-chart');
  if (!ctx) return;
  destroyChart('ytd-cpc-chart');

  chartInstances['ytd-cpc-chart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ytd.cpc.labels,
      datasets: [
        {
          label: 'Google CPC',
          data: ytd.cpc.google,
          borderColor: '#4285f4',
          pointRadius: 5,
          pointBackgroundColor: '#4285f4',
          borderWidth: 2
        },
        {
          label: 'Meta CPC',
          data: ytd.cpc.meta,
          borderColor: '#0668e1',
          pointRadius: 5,
          pointBackgroundColor: '#0668e1',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => '€' + v.toFixed(2).replace('.', ',') }
        }
      },
      plugins: { legend: { display: true, position: 'bottom' } }
    }
  });
}

function renderYtdImpressionsChart(ytd) {
  const ctx = getCtx('ytd-impressionen-chart');
  if (!ctx) return;
  destroyChart('ytd-impressionen-chart');

  chartInstances['ytd-impressionen-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ytd.impressionen.labels,
      datasets: [
        { label: 'Google', data: ytd.impressionen.google, backgroundColor: '#4285f4cc', maxBarThickness: 40 },
        { label: 'Meta',   data: ytd.impressionen.meta,   backgroundColor: '#0668e1cc', maxBarThickness: 40 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => (v / 1000).toFixed(0) + 'k' }
        }
      },
      plugins: { legend: { display: true, position: 'bottom' } }
    }
  });
}

function getCtx(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  return canvas.getContext('2d');
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

export function destroyAllCharts() {
  Object.keys(chartInstances).forEach(id => {
    try { chartInstances[id].destroy(); } catch (_) {}
    delete chartInstances[id];
  });
  document.querySelectorAll('[id^="tooltip-"]').forEach(el => el.remove());
}

