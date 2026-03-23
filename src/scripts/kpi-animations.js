/**
 * FHD KPI Dashboard – KPI Animationen
 * 
 * CountUp-Animationen für KPI-Zahlen beim Tab-/Monatswechsel.
 * Nutzt IntersectionObserver für Scroll-getriggerte Animationen.
 * 
 * @module kpi-animations
 */

/**
 * Animiert einen numerischen Wert von 0 zum Zielwert.
 * Erkennt automatisch das Format (€, %, Punkt-Trennung).
 * 
 * @param {HTMLElement} el - Das DOM-Element mit dem Zielwert
 * @param {number} duration - Animationsdauer in ms
 */
function countUp(el, duration = 800) {
  const text = el.textContent.trim();
  const target = el.dataset.target || text;
  
  // Keine Animation für nicht-numerische Werte
  if (target === '—' || target === '-') return;

  // Numerischen Wert extrahieren
  const numStr = target.replace(/[€%\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(numStr);
  if (isNaN(num)) return;

  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-out cubic
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = num * easedProgress;

    // Originalformat wiederherstellen
    el.textContent = formatValue(currentVal, target);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = target;
    }
  }

  requestAnimationFrame(update);
}

/**
 * Formatiert einen Wert im Originalformat.
 * @param {number} val - Numerischer Wert
 * @param {string} template - Originalstring als Formatvorlage
 * @returns {string}
 */
function formatValue(val, template) {
  const hasEuro = template.includes('€');
  const hasPercent = template.includes('%');
  const hasComma = template.includes(',');
  const hasDot = /\d\.\d{3}/.test(template);

  let str;
  if (hasComma && hasDot) {
    // Deutsches Format: 1.234,56
    str = val.toLocaleString('de-DE', { 
      minimumFractionDigits: template.split(',')[1]?.replace(/[^\d]/g,'').length || 0,
      maximumFractionDigits: 2 
    });
  } else if (hasDot && !hasComma) {
    // Tausenderpunkt ohne Dezimal: 1.234
    str = Math.round(val).toLocaleString('de-DE');
  } else if (hasComma) {
    const decimals = template.split(',')[1]?.replace(/[^\d]/g,'').length || 0;
    str = val.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } else {
    str = Math.round(val).toString();
  }

  if (hasEuro) str = '€' + str;
  if (hasPercent) str = str + '%';

  return str;
}

/**
 * Initialisiert KPI-Animationen.
 * Nutzt IntersectionObserver für lazy triggering.
 */
export function initKpiAnimations() {
  // Initiale Animation der sichtbaren KPIs
  animateVisibleKpis();

  // Bei Tab- oder Monatswechsel erneut animieren
  document.addEventListener('tabChanged', () => {
    setTimeout(animateVisibleKpis, 50);
  });

  document.addEventListener('monthChanged', () => {
    setTimeout(animateVisibleKpis, 100);
  });
}

/**
 * Animiert alle sichtbaren KPI-Werte.
 */
function animateVisibleKpis() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;

  const kpiValues = activeTab.querySelectorAll('.kpi-value');
  kpiValues.forEach((el, i) => {
    setTimeout(() => countUp(el, 600), i * 80);
  });
}
