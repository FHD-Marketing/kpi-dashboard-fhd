/**
 * FHD KPI Dashboard – Campaign Toggle
 * 
 * Expand/Collapse-Funktionalität für Kampagnen-Details
 * in Google Ads und Meta Ads Tabs.
 * 
 * @module campaign-toggle
 */

/**
 * Initialisiert alle Kampagnen-Toggle-Buttons.
 * Registriert Click-Events für das Auf-/Zuklappen.
 */
export function initCampaignToggle() {
  // Google Ads Campaign Headers (klickbar)
  const campaignHeaders = document.querySelectorAll('.google-campaign-header');
  campaignHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      if (body && body.classList.contains('google-campaign-body')) {
        body.classList.toggle('open');
        // Chevron-Icon rotieren
        const chevron = header.querySelector('.chevron');
        if (chevron) {
          chevron.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    });
  });

  // Meta Ads "Klicken für Details" Buttons
  const toggleButtons = document.querySelectorAll('.campaign-toggle-btn');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const details = btn.closest('.campaign-section').querySelector('.campaign-details');
      if (details) {
        details.classList.toggle('open');
        btn.textContent = details.classList.contains('open')
          ? '▲ Details ausblenden'
          : '▶ Klicken für Anzeigengruppen-Details';
      }
    });
  });
}
