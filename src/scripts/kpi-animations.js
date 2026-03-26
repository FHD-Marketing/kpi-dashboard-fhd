let animationId = 0;

function countUp(el, duration = 800) {
  const target = el.dataset.target || el.textContent.trim();
  if (!target || target === '—' || target === '-') return;

  const prefixMatch = target.match(/^([€$£+\-]?)/);
  const suffixMatch = target.match(/([%]?\s*[A-Za-zÄÖÜäöüß.]*)$/);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  const suffix = suffixMatch ? suffixMatch[1] : '';

  const numPart = target.slice(prefix.length, target.length - (suffix.length || 0));
  const numStr = numPart.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(numStr);
  if (isNaN(num) || num === 0) {
    el.textContent = target;
    return;
  }

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
      el.textContent = prefix + formatNumber(currentVal, numPart) + suffix;
      requestAnimationFrame(update);
    } else {
      el.textContent = target;
    }
  }

  requestAnimationFrame(update);
}

function formatNumber(val, template) {
  const hasComma = template.includes(',');
  const hasDot = /\d\.\d{3}/.test(template);

  if (hasComma && hasDot) {
    return val.toLocaleString('de-DE', {
      minimumFractionDigits: template.split(',')[1]?.replace(/[^\d]/g,'').length || 0,
      maximumFractionDigits: 2
    });
  } else if (hasDot && !hasComma) {
    return Math.round(val).toLocaleString('de-DE');
  } else if (hasComma) {
    const decimals = template.split(',')[1]?.replace(/[^\d]/g,'').length || 0;
    return val.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return Math.round(val).toString();
}

export function initKpiAnimations() {
  document.addEventListener('tabChanged', () => {
    setTimeout(animateVisibleKpis, 50);
  });

  document.addEventListener('monthChanged', () => {
    setTimeout(animateVisibleKpis, 100);
  });
}

function animateVisibleKpis() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;

  const kpiValues = activeTab.querySelectorAll('.kpi-value');
  kpiValues.forEach((el, i) => {
    setTimeout(() => countUp(el, 600), i * 80);
  });
}
