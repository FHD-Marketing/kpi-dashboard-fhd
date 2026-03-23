/**
 * FHD KPI Dashboard – Tab Navigation
 * 
 * Steuert das Wechseln zwischen den Dashboard-Tabs.
 * Wendet CSS-Klassen an, um Tabs ein-/auszublenden.
 * 
 * @module tab-navigation
 */

/**
 * Initialisiert die Tab-Navigation.
 * Registriert Click-Events auf allen Tab-Buttons.
 */
export function initTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // Alle Tabs deaktivieren
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Ziel-Tab aktivieren
      btn.classList.add('active');
      const target = document.getElementById(`tab-${targetTab}`);
      if (target) {
        target.classList.add('active');
      }

      // Custom Event auslösen (für Charts-Neuinitialisierung)
      document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: targetTab } }));
    });
  });
}
