export function initCampaignToggle() {
  const campaignHeaders = document.querySelectorAll('.google-campaign-header');
  campaignHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      if (body && body.classList.contains('google-campaign-body')) {
        body.classList.toggle('open');
        const chevron = header.querySelector('.chevron');
        if (chevron) {
          chevron.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    });
  });

  const toggleButtons = document.querySelectorAll('.campaign-toggle-btn');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const details = btn.closest('.campaign-section').querySelector('.campaign-details');
      if (details) {
        details.classList.toggle('open');
        // Frontend text stays in German
        btn.textContent = details.classList.contains('open')
          ? '▲ Details ausblenden'
          : '▶ Klicken für Anzeigengruppen-Details';
      }
    });
  });
}

