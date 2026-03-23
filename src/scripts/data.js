/**
 * FHD KPI Dashboard – Zentrale Demodaten
 * 
 * Alle KPI-Werte werden hier als statische Objekte gepflegt.
 * Struktur: dashboardData[monat] enthält alle Kanäle.
 * 
 * Kann später gegen eine API / Datenbank ausgetauscht werden,
 * indem diese Datei durch einen fetch()-Aufruf ersetzt wird.
 * 
 * @module data
 */

export const dashboardData = {
  /* ──────────────────────────────────────────
     JANUAR 2026
     ────────────────────────────────────────── */
  jan: {
    label: 'Jan 2026',
    totalSpend: '€6.142',

    /* ── Übersicht ──────────────────────────── */
    overview: {
      adSpend:       { value: '€6.141,97', trend: null, detail: 'Plan: €7.000' },
      klicks:        { value: '6.317',     trend: null, detail: 'Google 4.482 · Meta 1.835' },
      conversions:   { value: '87',        trend: null, detail: 'Google 47 Conv. · Meta 40 Leads' },
      impressionen:  { value: '358.012',   trend: null, detail: 'Google 63.320 · Meta 294.692' },
      reichweite:    { value: '72.418',    trend: null, detail: 'Nur Meta' },
      cpc:           { value: '€0,97',     trend: null, detail: 'Google €0,68 · Meta €1,52' },
      ctr:           { value: '5.12%',     trend: null, detail: 'Google 7.08% · Meta 0.62%' },
      budgetSplit: {
        google: { value: 3046.82, pct: '50%' },
        meta:   { value: 3095.15, pct: '50%' }
      },
      budgetPlan: {
        gesamt: { plan: '€7.000', ist: '€6.142', pct: 88, diff: '-€858', status: 'on-track' },
        google: { plan: '€5.000', ist: '€3.047', pct: 61, diff: '-€1.953', status: 'on-track' },
        meta:   { plan: '€2.000', ist: '€3.095', pct: 155, diff: '+€1.095', status: 'over' }
      },
      dailySpend: {
        labels: ['01.','03.','05.','07.','09.','11.','13.','15.','17.','19.','21.','23.','25.','27.','29.','31.'],
        google: [95,110,88,102,130,75,98,115,105,92,88,120,95,108,100,85],
        meta:   [85,92,105,78,95,110,88,102,98,85,92,78,105,95,88,92]
      }
    },

    /* ── Google Ads ─────────────────────────── */
    googleAds: {
      spend:       { value: '€3.046,82', trend: null },
      klicks:      { value: '4.482',     trend: null },
      conversions: { value: '47',        trend: null },
      impressionen:{ value: '63.320',    trend: null },
      spendByKampagne: [
        { name: 'PGM Bachelor',       spend: 817.52, pct: 100 },
        { name: 'SPM Bachelor',       spend: 541.12, pct: 66 },
        { name: 'Allgemein',          spend: 462.07, pct: 57 },
        { name: 'Grafikdesign Bachelor', spend: 378.40, pct: 46 },
        { name: 'BA Bachelor',        spend: 301.20, pct: 37 },
        { name: 'DigitalMediaDesign', spend: 268.90, pct: 33 },
        { name: 'RPC Master',         spend: 155.50, pct: 19 },
        { name: 'CD Master',          spend: 122.11, pct: 15 }
      ],
      kampagnen: [
        {
          name: 'PGM Bachelor', badges: ['Winner'], status: 'LAUFEND', statusType: 'active',
          spend: '€817,52', leads: '15', cpl: '€54,50', klicks: '1.204', cpc: '€0,68', ctr: '7.85%',
          reichweite: null, impressionen: '15.342', frequenz: null
        },
        {
          name: 'SPM Bachelor', badges: ['Top'], status: 'LAUFEND', statusType: 'active',
          spend: '€541,12', leads: '9', cpl: '€60,12', klicks: '812', cpc: '€0,67', ctr: '6.20%',
          reichweite: null, impressionen: '13.097', frequenz: null
        },
        {
          name: 'Allgemein', badges: ['Breit'], status: 'LAUFEND', statusType: 'active',
          spend: '€462,07', leads: '5', cpl: '€92,41', klicks: '721', cpc: '€0,64', ctr: '4.15%',
          reichweite: null, impressionen: '17.373', frequenz: null
        },
        {
          name: 'Grafikdesign Bachelor', badges: [], status: 'LAUFEND', statusType: 'active',
          spend: '€378,40', leads: '0', cpl: '—', klicks: '498', cpc: '€0,76', ctr: '5.90%',
          reichweite: null, impressionen: '8.441', frequenz: null
        },
        {
          name: 'BA Bachelor', badges: ['Kritisch'], status: 'LAUFEND', statusType: 'active',
          spend: '€301,20', leads: '1', cpl: '€301,20', klicks: '389', cpc: '€0,77', ctr: '5.12%',
          reichweite: null, impressionen: '7.598', frequenz: null
        },
        {
          name: 'DigitalMediaDesign', badges: [], status: 'LAUFEND', statusType: 'active',
          spend: '€268,90', leads: '3', cpl: '€89,63', klicks: '358', cpc: '€0,75', ctr: '4.80%',
          reichweite: null, impressionen: '7.458', frequenz: null
        }
      ]
    },

    /* ── Meta Ads ───────────────────────────── */
    metaAds: {
      spend:     { value: '€3.095,15', trend: null },
      linkKlicks:{ value: '1.835',     trend: null },
      leads:     { value: '40',        trend: null },
      reichweite:{ value: '72.418',    trend: null },
      kampagnen: [
        {
          name: 'REMARKETING', badge: 'WINNER', groups: '2 Anzeigengruppen', status: 'AKTIV',
          spend: '€695,10', leads: '12', cpl: '€57,93', klicks: '422', cpc: '€1,65', ctr: '0.52%',
          reichweite: '11.800', impressionen: '81.000', frequenz: '6.86',
          progressPct: 75
        },
        {
          name: 'PROSPECTING', badge: 'LOSER', groups: '7 Anzeigengruppen', status: 'AKTIV',
          spend: '€2.400,05', leads: '28', cpl: '€85,72', klicks: '1.413', cpc: '€1,70', ctr: '0.66%',
          reichweite: '60.618', impressionen: '213.692', frequenz: '3.52',
          progressPct: 45
        }
      ]
    },

    /* ── Instagram ──────────────────────────── */
    instagram: {
      follower:       { value: '2.847',  trend: null },
      engagementRate: { value: '4.2%',   trend: null },
      reichweite:     { value: '18.432', trend: null },
      impressionen:   { value: '42.105', trend: null },
      topPosts: [
        { name: 'Campustour Reel',          reach: 4200, engagement: '6.8%' },
        { name: 'Studiengang-Vorstellung',  reach: 3100, engagement: '5.2%' },
        { name: 'Alumni-Interview',         reach: 2800, engagement: '4.5%' },
        { name: 'Workshop-Highlight',       reach: 2400, engagement: '3.9%' },
        { name: 'Behind the Scenes',        reach: 1950, engagement: '3.4%' }
      ],
      followerGrowth: { labels: ['W1','W2','W3','W4'], values: [2780,2800,2825,2847] }
    },

    /* ── YouTube ────────────────────────────── */
    youtube: {
      views:       { value: '12.450',    trend: null },
      subscribers: { value: '1.234',     trend: null },
      watchTime:   { value: '845 Std.',  trend: null },
      ctr:         { value: '5.8%',      trend: null },
      topVideos: [
        { name: 'Campusführung 2026',     views: 3200, watchTime: '2:45' },
        { name: 'Studiengang PGM',        views: 2100, watchTime: '4:12' },
        { name: 'Tag der offenen Tür',    views: 1850, watchTime: '3:28' },
        { name: 'Prof. Interview Design', views: 1400, watchTime: '6:02' },
        { name: 'Absolventenfeier 2025',  views: 1200, watchTime: '2:58' }
      ],
      viewsOverTime: { labels: ['W1','W2','W3','W4'], values: [2800,3200,3100,3350] }
    },

    /* ── TikTok ─────────────────────────────── */
    tiktok: {
      views:          { value: '45.200',  trend: null },
      follower:       { value: '892',     trend: null },
      engagementRate: { value: '8.4%',    trend: null },
      likes:          { value: '3.842',   trend: null },
      topVideos: [
        { name: 'Day in the Life Student',  views: 12400, likes: 1250 },
        { name: 'Campus Secrets',           views: 8900,  likes: 780 },
        { name: 'Studiengang in 60s',       views: 7200,  likes: 620 },
        { name: 'Prof vs. Student Quiz',    views: 6100,  likes: 540 },
        { name: 'Mensa Review',             views: 5200,  likes: 412 }
      ],
      growth: { labels: ['W1','W2','W3','W4'], values: [820,845,870,892] }
    },

    /* ── LinkedIn ───────────────────────────── */
    linkedin: {
      impressionen: { value: '8.920',  trend: null },
      follower:     { value: '3.456',  trend: null },
      engagement:   { value: '3.1%',   trend: null },
      klicks:       { value: '412',    trend: null },
      topPosts: [
        { name: 'Neuer Studiengang Announcement', impressions: 2400, engagement: '4.2%' },
        { name: 'Forschungsprojekt Update',       impressions: 1800, engagement: '3.5%' },
        { name: 'Alumni-Erfolgsgeschichte',        impressions: 1500, engagement: '3.8%' }
      ],
      followerGrowth: { labels: ['W1','W2','W3','W4'], values: [3410,3425,3440,3456] }
    },

    /* ── Mailchimp ──────────────────────────── */
    mailchimp: {
      openRate:    { value: '24.5%',  trend: null },
      clickRate:   { value: '3.8%',   trend: null },
      subscribers: { value: '5.234',  trend: null },
      campaigns:   { value: '4',      trend: null },
      campaignList: [
        { name: 'Januar Newsletter',      sent: 5100, openRate: '26.2%', clickRate: '4.1%', date: '15.01.2026' },
        { name: 'Studienstart Reminder',  sent: 3200, openRate: '31.5%', clickRate: '5.8%', date: '08.01.2026' },
        { name: 'Event-Einladung',        sent: 4800, openRate: '22.1%', clickRate: '3.2%', date: '20.01.2026' },
        { name: 'Bewerbungsphase Info',   sent: 5100, openRate: '18.2%', clickRate: '2.1%', date: '28.01.2026' }
      ],
      trend: { labels: ['Okt','Nov','Dez','Jan'], openRates: [22.1,23.8,25.2,24.5], clickRates: [3.2,3.5,4.0,3.8] }
    },

    /* ── StudyCheck ─────────────────────────── */
    studycheck: {
      bewertungen:     { value: '142',   trend: null },
      avgScore:        { value: '4.2',   trend: null },
      profilaufrufe:   { value: '8.450', trend: null },
      weiterempfehlung:{ value: '89%',   trend: null },
      studiengaenge: [
        { name: 'PGM Bachelor',            score: 4.5, reviews: 28, views: 1850 },
        { name: 'Grafikdesign Bachelor',    score: 4.3, reviews: 22, views: 1620 },
        { name: 'SPM Bachelor',             score: 4.1, reviews: 18, views: 1200 },
        { name: 'DigitalMediaDesign',       score: 4.4, reviews: 15, views: 980 },
        { name: 'BA Bachelor',              score: 3.9, reviews: 12, views: 850 },
        { name: 'CD Master',                score: 4.6, reviews: 8,  views: 620 }
      ],
      scoreHistory: { labels: ['Okt','Nov','Dez','Jan'], values: [4.1,4.1,4.2,4.2] }
    }
  },

  /* ──────────────────────────────────────────
     FEBRUAR 2026
     ────────────────────────────────────────── */
  feb: {
    label: 'Feb 2026',
    totalSpend: '€6.830',

    /* ── Übersicht ──────────────────────────── */
    overview: {
      adSpend:       { value: '€6.830,14', trend: '+11,2%', trendDir: 'up',       detail: 'Plan: €6.000 · 114% ausgeschöpft' },
      klicks:        { value: '4.919',     trend: '-22,1%', trendDir: 'down-bad',  detail: 'Google 3.283 · Meta 1.636' },
      conversions:   { value: '70',        trend: '-19,5%', trendDir: 'down-bad',  detail: 'Google 40 Conv. · Meta 30 Leads' },
      impressionen:  { value: '416.001',   trend: '+16,1%', trendDir: 'up-good',   detail: 'Google 69.680 · Meta 346.321' },
      reichweite:    { value: '83.215',    trend: '+11,6%', trendDir: 'up-good',   detail: 'Nur Meta' },
      cpc:           { value: '€1,39',     trend: '+42,8%', trendDir: 'up',        detail: 'Google €1,03 · Meta €2,11' },
      ctr:           { value: '4.71%',     trend: null,     detail: 'Google 4.71% · Meta 0.47%' },
      budgetSplit: {
        google: { value: 3375.71, pct: '49%' },
        meta:   { value: 3454.43, pct: '51%' }
      },
      budgetPlan: {
        gesamt: { plan: '€6.000', ist: '€6.830', pct: 114, diff: '+€830', status: 'over' },
        google: { plan: '€5.000', ist: '€3.376', pct: 68,  diff: '-€1.624', status: 'on-track' },
        meta:   { plan: '€1.000', ist: '€3.454', pct: 345, diff: '+€2.454', status: 'over' }
      },
      dailySpend: {
        labels: ['01.','03.','05.','07.','09.','11.','13.','15.','17.','19.','21.','23.','25.','27.'],
        google: [120,135,95,145,118,160,125,140,135,110,128,105,142,130],
        meta:   [95,88,110,125,105,130,115,98,120,108,95,118,102,110]
      }
    },

    /* ── Google Ads ─────────────────────────── */
    googleAds: {
      spend:       { value: '€3.375,71', trend: '+9,6%',  trendDir: 'up' },
      klicks:      { value: '3.283',     trend: '-26,8%', trendDir: 'down' },
      conversions: { value: '40',        trend: '-14,9%', trendDir: 'down' },
      impressionen:{ value: '69.680',    trend: '+10,0%', trendDir: 'up' },
      spendByKampagne: [
        { name: 'PGM Bachelor',       spend: 975.18, pct: 100 },
        { name: 'SPM Bachelor',       spend: 614.34, pct: 63 },
        { name: 'Grafikdesign Bachelor', spend: 487.50, pct: 50 },
        { name: 'Allgemein',          spend: 421.97, pct: 43 },
        { name: 'DigitalMediaDesign', spend: 351.24, pct: 36 },
        { name: 'BA Bachelor',        spend: 280.50, pct: 29 },
        { name: 'RPC Master',         spend: 142.88, pct: 15 },
        { name: 'CD Master',          spend: 102.10, pct: 10 }
      ],
      kampagnen: [
        {
          name: 'PGM Bachelor', badges: ['Winner', 'Aktiv'], status: 'LAUFEND', statusType: 'active',
          spend: '€975,18', leads: '4', cpl: '€15,68', klicks: '751', cpc: '€0,76', ctr: '5.18%',
          reichweite: null, impressionen: '14.502', frequenz: null,
          details: {
            spend: '€975,18', leads: '4', cpl: '€15,68', klicks: '751', cpc: '€0,76', ctr: '5.18%',
            trendSpend: '+19,3%', trendLeads: '▼ 73,3%', trendCpl: '▼ 71,2%', trendKlicks: '▼ 37,6%'
          }
        },
        {
          name: 'SPM Bachelor', badges: ['Aktiv'], status: 'LAUFEND', statusType: 'active',
          spend: '€614,34', leads: '2', cpl: '€7,21', klicks: '0', cpc: '€1,35', ctr: '5.04%',
          reichweite: null, impressionen: '12.188', frequenz: null
        },
        {
          name: 'Allgemein', badges: ['Breit'], status: 'LAUFEND', statusType: 'active',
          spend: '€421,97', leads: '5', cpl: '€281,31', klicks: '5', cpc: '€1,48', ctr: '4.42%',
          reichweite: null, impressionen: '14.221', frequenz: null
        },
        {
          name: 'Grafikdesign Bachelor', badges: ['Neuer Star'], status: 'LAUFEND', statusType: 'active',
          spend: '€487,50', leads: '6', cpl: '€74,17', klicks: '709', cpc: '€1,17', ctr: '5.96%',
          reichweite: null, impressionen: '11.900', frequenz: null
        },
        {
          name: 'DigitalMediaDesign', badges: [], status: 'LAUFEND', statusType: 'active',
          spend: '€351,24', leads: '7', cpl: '€74,77', klicks: '467', cpc: '€0,97', ctr: '4.85%',
          reichweite: null, impressionen: '9.629', frequenz: null
        },
        {
          name: 'BA Bachelor', badges: ['Kritisch'], status: 'LAUFEND', statusType: 'active',
          spend: '€280,50', leads: '1', cpl: '€489,00', klicks: '298', cpc: '€1,18', ctr: '3.78%',
          reichweite: null, impressionen: '7.882', frequenz: null
        },
        {
          name: 'RPC Master', badges: ['Nische'], status: 'LAUFEND', statusType: 'active',
          spend: '€142,88', leads: '1', cpl: '—', klicks: '84', cpc: '€1,70', ctr: '3.96%',
          reichweite: null, impressionen: '2.121', frequenz: null
        },
        {
          name: 'CD Master', badges: ['Nische', 'Gering'], status: 'LAUFEND', statusType: 'active',
          spend: '€102,10', leads: '0', cpl: '—', klicks: '61', cpc: '€1,67', ctr: '4.21%',
          reichweite: null, impressionen: '1.449', frequenz: null
        }
      ]
    },

    /* ── Meta Ads ───────────────────────────── */
    metaAds: {
      spend:     { value: '€3.454,43', trend: '+58,6%', trendDir: 'up' },
      linkKlicks:{ value: '1.636',     trend: '-10,8%', trendDir: 'down' },
      leads:     { value: '30',        trend: '-16,7%', trendDir: 'down' },
      reichweite:{ value: '83.215',    trend: '+11,6%', trendDir: 'up' },
      kampagnen: [
        {
          name: 'REMARKETING', badge: 'WINNER', groups: '2 Anzeigengruppen', status: 'AKTIV',
          spend: '€828,20', leads: '8', cpl: '€103,53', klicks: '378', cpc: '€2,19', ctr: '0.41%',
          reichweite: '13.412', impressionen: '92.924', frequenz: '6.93',
          progressPct: 65
        },
        {
          name: 'PROSPECTING', badge: 'LOSER', groups: '7 Anzeigengruppen', status: 'AKTIV',
          spend: '€2.626,23', leads: '22', cpl: '€119,37', klicks: '1.258', cpc: '€2,09', ctr: '0.50%',
          reichweite: '69.803', impressionen: '253.397', frequenz: '3.63',
          progressPct: 35
        }
      ]
    },

    /* ── Instagram ──────────────────────────── */
    instagram: {
      follower:       { value: '3.012',  trend: '+5,8%',  trendDir: 'up-good' },
      engagementRate: { value: '4.8%',   trend: '+14,3%', trendDir: 'up-good' },
      reichweite:     { value: '22.150', trend: '+20,2%', trendDir: 'up-good' },
      impressionen:   { value: '51.800', trend: '+23,0%', trendDir: 'up-good' },
      topPosts: [
        { name: 'Bewerbungsphase Reel',     reach: 5800, engagement: '7.2%' },
        { name: 'Student Takeover',         reach: 4200, engagement: '6.1%' },
        { name: 'Studiengang-Carousel',     reach: 3600, engagement: '5.5%' },
        { name: 'Campus Winter',            reach: 3100, engagement: '4.8%' },
        { name: 'Alumni Success Story',     reach: 2700, engagement: '4.2%' }
      ],
      followerGrowth: { labels: ['W1','W2','W3','W4'], values: [2870,2920,2965,3012] }
    },

    /* ── YouTube ────────────────────────────── */
    youtube: {
      views:       { value: '15.230',     trend: '+22,3%', trendDir: 'up-good' },
      subscribers: { value: '1.312',      trend: '+6,3%',  trendDir: 'up-good' },
      watchTime:   { value: '1.024 Std.', trend: '+21,2%', trendDir: 'up-good' },
      ctr:         { value: '6.2%',       trend: '+6,9%',  trendDir: 'up-good' },
      topVideos: [
        { name: 'Studiengang PGM Deep Dive',  views: 4100, watchTime: '5:32' },
        { name: 'Campusrundgang Winter',       views: 3200, watchTime: '3:45' },
        { name: 'Student Vlog #12',            views: 2400, watchTime: '4:18' },
        { name: 'Workshop Highlights',         views: 1800, watchTime: '2:55' },
        { name: 'Prof. Talk: Zukunft Design',  views: 1500, watchTime: '7:12' }
      ],
      viewsOverTime: { labels: ['W1','W2','W3','W4'], values: [3400,3800,3950,4080] }
    },

    /* ── TikTok ─────────────────────────────── */
    tiktok: {
      views:          { value: '62.400',  trend: '+38,1%', trendDir: 'up-good' },
      follower:       { value: '1.048',   trend: '+17,5%', trendDir: 'up-good' },
      engagementRate: { value: '9.1%',    trend: '+8,3%',  trendDir: 'up-good' },
      likes:          { value: '5.210',   trend: '+35,6%', trendDir: 'up-good' },
      topVideos: [
        { name: 'POV: Ersti an der FHD',     views: 18500, likes: 1820 },
        { name: 'Studiengang Tier List',      views: 12200, likes: 1050 },
        { name: 'Mensa Ranking',              views: 9400,  likes: 780 },
        { name: 'Campus vs. Erwartung',       views: 7800,  likes: 650 },
        { name: 'Design Challenge',           views: 6300,  likes: 520 }
      ],
      growth: { labels: ['W1','W2','W3','W4'], values: [910,960,1005,1048] }
    },

    /* ── LinkedIn ───────────────────────────── */
    linkedin: {
      impressionen: { value: '11.250',  trend: '+26,1%', trendDir: 'up-good' },
      follower:     { value: '3.580',   trend: '+3,6%',  trendDir: 'up-good' },
      engagement:   { value: '3.5%',    trend: '+12,9%', trendDir: 'up-good' },
      klicks:       { value: '528',     trend: '+28,2%', trendDir: 'up-good' },
      topPosts: [
        { name: 'Forschungskooperation',           impressions: 3200, engagement: '4.8%' },
        { name: 'Neue Professur Design',           impressions: 2600, engagement: '4.1%' },
        { name: 'Absolvent*innen Karriereweg',     impressions: 2100, engagement: '3.7%' }
      ],
      followerGrowth: { labels: ['W1','W2','W3','W4'], values: [3470,3510,3545,3580] }
    },

    /* ── Mailchimp ──────────────────────────── */
    mailchimp: {
      openRate:    { value: '26.8%',  trend: '+9,4%',  trendDir: 'up-good' },
      clickRate:   { value: '4.2%',   trend: '+10,5%', trendDir: 'up-good' },
      subscribers: { value: '5.412',  trend: '+3,4%',  trendDir: 'up-good' },
      campaigns:   { value: '3',      trend: null },
      campaignList: [
        { name: 'Februar Newsletter',         sent: 5300, openRate: '28.4%', clickRate: '4.5%', date: '12.02.2026' },
        { name: 'Bewerbungsaufruf',           sent: 5100, openRate: '32.1%', clickRate: '6.2%', date: '03.02.2026' },
        { name: 'Veranstaltungshinweis',      sent: 4900, openRate: '19.8%', clickRate: '1.8%', date: '20.02.2026' }
      ],
      trend: { labels: ['Nov','Dez','Jan','Feb'], openRates: [23.8,25.2,24.5,26.8], clickRates: [3.5,4.0,3.8,4.2] }
    },

    /* ── StudyCheck ─────────────────────────── */
    studycheck: {
      bewertungen:     { value: '156',    trend: '+9,9%',  trendDir: 'up-good' },
      avgScore:        { value: '4.3',    trend: '+0,1',   trendDir: 'up-good' },
      profilaufrufe:   { value: '10.820', trend: '+28,0%', trendDir: 'up-good' },
      weiterempfehlung:{ value: '91%',    trend: '+2pp',   trendDir: 'up-good' },
      studiengaenge: [
        { name: 'PGM Bachelor',            score: 4.6, reviews: 32, views: 2250 },
        { name: 'Grafikdesign Bachelor',    score: 4.4, reviews: 25, views: 1980 },
        { name: 'SPM Bachelor',             score: 4.2, reviews: 20, views: 1450 },
        { name: 'DigitalMediaDesign',       score: 4.5, reviews: 18, views: 1180 },
        { name: 'BA Bachelor',              score: 4.0, reviews: 14, views: 1020 },
        { name: 'CD Master',                score: 4.7, reviews: 10, views: 780 }
      ],
      scoreHistory: { labels: ['Nov','Dez','Jan','Feb'], values: [4.1,4.2,4.2,4.3] }
    },

    /* ── YTD-Trends ─────────────────────────── */
    ytdTrends: {
      monatlicheAusgaben: {
        labels: ['Jan', 'Feb'],
        googleIst: [3046.82, 3375.71],
        metaIst: [3095.15, 3454.43],
        planGesamt: [7000, 6000]
      },
      conversions: {
        labels: ['Jan', 'Feb'],
        google: [47, 40],
        meta: [40, 30]
      },
      cpc: {
        labels: ['Jan', 'Feb'],
        google: [0.68, 1.03],
        meta: [1.52, 2.11]
      },
      impressionen: {
        labels: ['Jan', 'Feb'],
        google: [63320, 69680],
        meta: [294692, 346321]
      },
      monatsvergleich: [
        { monat: 'Jan 2026', plan: '€7.000', ist: '€6.141,97', diffBudget: '-€858 (88%)', diffClass: 'val-negative', klicks: '6.317', conv: '87', cpc: '€0,97' },
        { monat: 'Feb 2026', plan: '€6.000', ist: '€6.830,14', diffBudget: '+€830 (114%)', diffClass: 'val-negative',
          klicks: '4.919', klicksTrend: '▼ 22,1%', klicksTrendClass: 'val-negative',
          conv: '70', convTrend: '▼ 19,5%', convTrendClass: 'val-negative',
          cpc: '€1,39', cpcTrend: '▲ 42,8%', cpcTrendClass: 'val-negative'
        }
      ]
    },

    /* ── Empfehlungen ───────────────────────── */
    empfehlungen: [
      {
        icon: '🚨', title: 'Meta CPL-Explosion stoppen',
        description: 'Prospecting-CPL von €60→€119 (+97%), Remarketing von €54→€104 (+92%). Sofort neue Creatives — Ad Fatigue offensichtlich.',
        priority: 'high'
      },
      {
        icon: '🔥', title: 'Grafikdesign Bachelor — neuer Google-Star',
        description: 'Von 0 Conv. (Jan) auf 5 Conv. bei €74 CPA (Feb). Starker Aufwärtstrend — Budget und Keywords ausbauen.',
        priority: 'high'
      },
      {
        icon: '💡', title: 'Meta: Blog-Anzeigengruppe als Hidden Winner',
        description: 'Nur €25,73 für 1 Lead — bester CPL aller Meta-Anzeigengruppen im Feb. Reaktivierung mit höherem Budget testen.',
        priority: 'high'
      },
      {
        icon: '⏸️', title: 'Meta: MasterCreativeDirection pausieren',
        description: 'CPL €225,84 bei nur 2 Leads — schlechtester CPL aller Anzeigengruppen. Budget zu Grafikdesign und DigitalMediaDesign verschieben.',
        priority: 'high'
      },
      {
        icon: '⚡', title: 'PGM & SPM Bachelor weiter Top-Performer',
        description: 'PGM: 4 Conv. bei €15,68 CPA (bester). SPM: 2 Conv. bei €17,21 CPA. Budget aggressiv skalieren.',
        priority: 'high'
      },
      {
        icon: '📊', title: 'BA Bachelor & TEM Bachelor weiter kritisch',
        description: 'BA: €489 für 1 Conv., TEM: €434 für 1 Conv. Bid-Strategien ändern oder Budget umverteilen.',
        priority: 'high'
      },
      {
        icon: '🟦', title: 'Google PMax stabil — Volumen zurückgewinnen',
        description: 'Allgemein & Studiengänge liefern ~€90 CPA, aber Conv. sank (31→20). Zielgruppen-Signale überprüfen.',
        priority: 'medium'
      },
      {
        icon: '🖌️', title: 'Meta: DigitalMediaDesign skalieren',
        description: '7 Leads bei €74,77 CPL — zweitbester CPL bei hohem Volumen. Budget erhöhen und Creative-Varianten testen.',
        priority: 'medium'
      }
    ],
    zusammenfassung: {
      gesamtbudget: '€6.830,14 von €6.000 Plan (114%)',
      budgetSplit: 'Google €3.375,71 / €5.000 Plan (68%) · Meta €3.454,43 / €1.000 Plan (345%)',
      ergebnisse: '70 Conversions/Leads (40 Google + 30 Meta)',
      costPerResult: '€97,57',
      vsVormonat: 'Spend ↑ 11,2% · Conv. ↓ 19,5%',
      googleWinner: 'PGM Bachelor (CPA €15,68)',
      metaWinner: 'REMARKETING (CPL €103,53)'
    }
  }
};

/**
 * Gibt die Daten für einen bestimmten Monat zurück.
 * @param {string} month - Monatskürzel, z.B. 'jan', 'feb'
 * @returns {Object} Monatsdaten
 */
export function getMonthData(month) {
  return dashboardData[month] || null;
}

/**
 * Gibt alle verfügbaren Monate als Array zurück.
 * @returns {string[]} z.B. ['jan', 'feb']
 */
export function getAvailableMonths() {
  return Object.keys(dashboardData);
}
