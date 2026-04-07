let animationId = 0;

function countUp(el, duration = 800) {
  const target = el.dataset.target || el.textContent.trim();
  if (!target || target === '—' || target === '-') return;

  const prefixMatch = target.match(/^([€$£+\-]?\s*)/);
  const prefix = prefixMatch ? prefixMatch[1] : '';

  const suffixMatch = target.match(/((?:%|\s*[A-Za-zÄÖÜäöüß]+\.?)\s*)$/);
  const suffix = suffixMatch ? suffixMatch[1] : '';

  const numPart = target.slice(prefix.length, target.length - (suffix.length || 0)).trim();
  if (!numPart) { el.textContent = target; return; }

  const numStr = numPart.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(numStr);
  if (isNaN(num) || num === 0) {
    el.textContent = target;
    return;
  }

  const hasComma = numPart.includes(',');
  const decimals = hasComma ? (numPart.split(',')[1]?.replace(/[^\d]/g, '').length || 0) : 0;
  const hasThousandsSep = numPart.includes('.');

  const myId = ++animationId;
  el._animId = myId;
  const startTime = performance.now();

  function update(currentTime) {
    if (el._animId !== myId) return;

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = num * easedProgress;

    if (progress < 1) {
      el.textContent = prefix + formatNumber(currentVal, decimals, hasThousandsSep || num >= 1000) + suffix;
      requestAnimationFrame(update);
    } else {
      el.textContent = prefix + formatNumber(num, decimals, hasThousandsSep || num >= 1000) + suffix;
    }
  }

  requestAnimationFrame(update);
}

function formatNumber(val, decimals, useThousandsSep) {
  if (decimals > 0) {
    return val.toLocaleString('de-DE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  const rounded = Math.round(val);
  if (useThousandsSep) {
    return rounded.toLocaleString('de-DE');
  }
  return String(rounded);
}

export function initKpiAnimations() {
  document.addEventListener('dataReady', () => {
    setTimeout(() => animateVisibleCards(), 50);
  });

  document.addEventListener('tabChanged', () => {
    setTimeout(() => {
      const activeTab = document.querySelector('.tab-content.active');
      if (!activeTab) return;
      const hasSpinners = activeTab.querySelector('.kpi-card-loading, .chart-card-loading');
      if (!hasSpinners) {
        animateVisibleCards();
      }
    }, 50);
  });
}

function animateVisibleCards() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;

  const cards = Array.from(activeTab.querySelectorAll('.kpi-card, .chart-card, .campaign-section, .google-campaign-card, .infomaterial-faculty-card, .infomaterial-chart-card'));
  if (cards.length === 0) return;

  const totalWindow = 500;
  const step = cards.length > 1 ? totalWindow / (cards.length - 1) : 0;

  cards.forEach((card, i) => {
    card.classList.remove('kpi-pop');
    void card.offsetWidth;
    const delay = Math.round(i * step);
    card.style.setProperty('--kpi-delay', delay + 'ms');
    card.classList.remove('kpi-hidden');
    card.classList.add('kpi-pop');

    const kpiValue = card.querySelector('.kpi-value');
    if (kpiValue) {
      setTimeout(() => countUp(kpiValue, 700), delay + 50);
    }
  });
}

