import 'dotenv/config';
import mysql from 'mysql2/promise';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'public', 'api');
const OUT_FILE = join(OUT_DIR, 'dashboard-data.json');

const MONTH_KEYS_2026 = [];
for (let m = 1; m <= 12; m++) {
  MONTH_KEYS_2026.push(`2026-${String(m).padStart(2, '0')}`);
}

const MONTH_SHORT = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

async function connectDB() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 30000,
  });
}

function tbl(prefix, mk) {
  return `${prefix}_${mk.replace('-', '_')}`;
}

async function tableExists(db, table) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`, [table]
  );
  return rows[0].c > 0;
}

async function latestRow(db, table, cols, orderBy = 'date') {
  const [rows] = await db.query(`SELECT ${cols} FROM \`${table}\` ORDER BY \`${orderBy}\` DESC LIMIT 1`);
  return rows.length > 0 ? rows[0] : null;
}

async function firstRow(db, table, cols, orderBy = 'date') {
  const [rows] = await db.query(`SELECT ${cols} FROM \`${table}\` ORDER BY \`${orderBy}\` ASC LIMIT 1`);
  return rows.length > 0 ? rows[0] : null;
}

async function allRows(db, table, cols, orderBy = null) {
  const q = orderBy ? `SELECT ${cols} FROM \`${table}\` ORDER BY ${orderBy}` : `SELECT ${cols} FROM \`${table}\``;
  const [rows] = await db.query(q);
  return rows;
}

async function fetchRows(db, table, cols) {
  const [rows] = await db.query(`SELECT ${cols} FROM \`${table}\``);
  return rows;
}

function pct(cur, prev) {
  if (!prev || prev === 0) return null;
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  const arrow = p >= 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(p).toFixed(1).replace('.', ',')}%`;
}

function trendDirection(cur, prev, higherIsBetter = true) {
  if (!prev || prev === 0) return null;
  const d = cur - prev;
  if (d === 0) return null;
  return higherIsBetter ? (d > 0 ? 'up-good' : 'down-bad') : (d > 0 ? 'up' : 'down');
}

function fmt(n) {
  return n.toLocaleString('de-DE');
}

function fmtDelta(n) {
  const prefix = n >= 0 ? '+' : '';
  return prefix + n.toLocaleString('de-DE');
}

function fmtEur(n) {
  return '€' + n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function readGoogle(db, mk, prevMk) {
  const st = tbl('google_summary', mk);
  const ct = tbl('google_campaigns', mk);
  if (!(await tableExists(db, st))) return null;

  const rows = await fetchRows(db, st, 'date, spend, clicks, conversions, impressions, cpc, ctr');
  if (rows.length === 0) return null;

  let spend = 0, clicks = 0, conv = 0, impr = 0;
  rows.forEach(r => { spend += parseFloat(r.spend); clicks += r.clicks; conv += parseFloat(r.conversions); impr += r.impressions; });

  let prevSpend = null, prevClicks = null, prevConv = null, prevImpr = null;
  if (prevMk) {
    const pst = tbl('google_summary', prevMk);
    if (await tableExists(db, pst)) {
      const pr = await fetchRows(db, pst, 'spend, clicks, conversions, impressions');
      if (pr.length > 0) {
        prevSpend = 0; prevClicks = 0; prevConv = 0; prevImpr = 0;
        pr.forEach(r => { prevSpend += parseFloat(r.spend); prevClicks += r.clicks; prevConv += parseFloat(r.conversions); prevImpr += r.impressions; });
      }
    }
  }

  let kampagnen = [];
  let spendByKampagne = [];
  if (await tableExists(db, ct)) {
    const [cRows] = await db.query(
      `SELECT campaign_name, SUM(spend) as spend, SUM(leads) as leads, SUM(clicks) as clicks, SUM(impressions) as impressions, status
       FROM \`${ct}\` GROUP BY campaign_id, campaign_name, status ORDER BY spend DESC`
    );
    const maxSpend = cRows.length > 0 ? parseFloat(cRows[0].spend) : 1;
    spendByKampagne = cRows.map(r => ({
      name: r.campaign_name,
      spend: parseFloat(r.spend),
      pct: Math.round((parseFloat(r.spend) / maxSpend) * 100)
    }));
    kampagnen = cRows.map(r => {
      const s = parseFloat(r.spend);
      const l = parseFloat(r.leads);
      const cl = r.clicks;
      const im = r.impressions;
      return {
        name: r.campaign_name, badges: [], status: r.status === 'ENABLED' ? 'LAUFEND' : r.status, statusType: r.status === 'ENABLED' ? 'active' : 'paused',
        spend: fmtEur(s), leads: String(Math.round(l)), cpl: l > 0 ? fmtEur(s / l) : '—',
        klicks: fmt(cl), cpc: cl > 0 ? fmtEur(s / cl) : '—', ctr: im > 0 ? ((cl / im) * 100).toFixed(2) + '%' : '—',
      };
    });
  }

  return {
    spend: { value: fmtEur(spend), trend: pct(spend, prevSpend), trendDir: trendDirection(spend, prevSpend, false) },
    klicks: { value: fmt(clicks), trend: pct(clicks, prevClicks), trendDir: trendDirection(clicks, prevClicks, true) },
    conversions: { value: fmt(Math.round(conv)), trend: pct(conv, prevConv), trendDir: trendDirection(conv, prevConv, true) },
    impressionen: { value: fmt(impr), trend: pct(impr, prevImpr), trendDir: trendDirection(impr, prevImpr, true) },
    spendByKampagne,
    kampagnen
  };
}

async function readMeta(db, mk, prevMk) {
  const st = tbl('meta_summary', mk);
  const ct = tbl('meta_campaigns', mk);
  if (!(await tableExists(db, st))) return null;

  const rows = await fetchRows(db, st, 'spend, link_clicks, leads, reach, impressions, cpc, ctr, frequency');
  if (rows.length === 0) return null;

  let spend = 0, lc = 0, leads = 0, reach = 0, impr = 0;
  rows.forEach(r => { spend += parseFloat(r.spend); lc += r.link_clicks; leads += r.leads; reach += r.reach; impr += r.impressions; });

  let prevSpend = null, prevLc = null, prevLeads = null, prevReach = null;
  if (prevMk) {
    const pst = tbl('meta_summary', prevMk);
    if (await tableExists(db, pst)) {
      const pr = await fetchRows(db, pst, 'spend, link_clicks, leads, reach');
      if (pr.length > 0) {
        prevSpend = 0; prevLc = 0; prevLeads = 0; prevReach = 0;
        pr.forEach(r => { prevSpend += parseFloat(r.spend); prevLc += r.link_clicks; prevLeads += r.leads; prevReach += r.reach; });
      }
    }
  }

  let kampagnen = [];
  if (await tableExists(db, ct)) {
    const [cRows] = await db.query(
      `SELECT campaign_name, SUM(spend) as spend, SUM(leads) as leads, SUM(link_clicks) as link_clicks, SUM(reach) as reach, SUM(impressions) as impressions, AVG(frequency) as frequency, AVG(cpc) as cpc, AVG(ctr) as ctr, MAX(adset_count) as adset_count, status
       FROM \`${ct}\` GROUP BY campaign_id, campaign_name, status ORDER BY spend DESC`
    );
    kampagnen = cRows.map(r => {
      const s = parseFloat(r.spend);
      const l = r.leads;
      return {
        name: r.campaign_name, badge: l > 5 ? 'WINNER' : 'LOSER',
        groups: `${r.adset_count || '?'} Anzeigengruppen`, status: r.status === 'ACTIVE' ? 'AKTIV' : r.status,
        spend: fmtEur(s), leads: String(l), cpl: l > 0 ? fmtEur(s / l) : '—',
        klicks: fmt(r.link_clicks), cpc: fmtEur(parseFloat(r.cpc)), ctr: parseFloat(r.ctr).toFixed(2) + '%',
        reichweite: fmt(r.reach), impressionen: fmt(r.impressions), frequenz: parseFloat(r.frequency).toFixed(2),
        progressPct: Math.min(Math.round((l / Math.max(l, 1)) * 100), 100)
      };
    });
  }

  return {
    spend: { value: fmtEur(spend), trend: pct(spend, prevSpend), trendDir: trendDirection(spend, prevSpend, false) },
    linkKlicks: { value: fmt(lc), trend: pct(lc, prevLc), trendDir: trendDirection(lc, prevLc, true) },
    leads: { value: fmt(leads), trend: pct(leads, prevLeads), trendDir: trendDirection(leads, prevLeads, true) },
    reichweite: { value: fmt(reach), trend: pct(reach, prevReach), trendDir: trendDirection(reach, prevReach, true) },
    kampagnen
  };
}

async function readInstagram(db, mk) {
  const st = tbl('instagram_stats', mk);
  const tt = tbl('instagram_totals', mk);
  const pt = tbl('instagram_top_posts', mk);

  const hasStats = await tableExists(db, st);
  const hasTotals = await tableExists(db, tt);
  const hasPosts = await tableExists(db, pt);

  if (!hasStats && !hasTotals && !hasPosts) return null;

  const latest = hasStats ? await latestRow(db, st, 'follower_count, engagement_rate, impressions, reach') : null;
  const totals = hasTotals ? await latestRow(db, tt, 'total_followers') : null;

  if (!latest && !totals) return null;

  const followerNow = totals ? totals.total_followers : (latest ? latest.follower_count : 0);

  let followerStart = followerNow;
  if (hasStats) {
    const first = await firstRow(db, st, 'follower_count');
    if (first) followerStart = first.follower_count;
  }
  const followerDelta = followerNow - followerStart;

  let totalReach = 0, totalImpr = 0;
  if (hasStats) {
    const [sumRows] = await db.query(`SELECT SUM(reach) as totalReach, SUM(impressions) as totalImpr FROM \`${st}\``);
    if (sumRows.length > 0) {
      totalReach = sumRows[0].totalReach || 0;
      totalImpr = sumRows[0].totalImpr || 0;
    }
  }

  const engRate = latest ? parseFloat(latest.engagement_rate) : 0;

  let topPosts = [];
  if (hasPosts) {
    const posts = await allRows(db, pt, 'caption, reach, impressions, likes, comments', 'reach DESC');
    topPosts = posts.slice(0, 5).map(p => ({ name: (p.caption || '').substring(0, 40), reach: p.reach, engagement: '—' }));
  }

  let growth = { labels: [], values: [] };
  if (hasStats) {
    const statsRows = await allRows(db, st, 'date, follower_count', '`date` ASC');
    growth = { labels: statsRows.map(r => r.date.toISOString().split('T')[0].substring(5)), values: statsRows.map(r => r.follower_count) };
  }

  return {
    follower: { value: fmtDelta(followerDelta), detail: fmt(followerNow) + ' gesamt', deltaMode: true, positive: followerDelta >= 0 },
    engagementRate: { value: engRate.toFixed(1) + '%' },
    reichweite: { value: fmt(totalReach) },
    impressionen: { value: fmt(totalImpr) },
    topPosts,
    followerGrowth: growth
  };
}

async function readYouTube(db, mk) {
  const st = tbl('youtube_stats', mk);
  const tt = tbl('youtube_totals', mk);
  const vt = tbl('youtube_top_videos', mk);
  if (!(await tableExists(db, st))) return null;

  const rows = await fetchRows(db, st, 'SUM(views) as views, SUM(subscribers_gained) as subs, SUM(watch_time_minutes) as wt, AVG(ctr) as ctr');
  if (rows.length === 0 || !rows[0].views) return null;
  const r = rows[0];
  const totals = await tableExists(db, tt) ? await latestRow(db, tt, 'total_subscribers, total_views') : null;

  const totalViews = r.views;
  const totalViewsChannel = totals ? totals.total_views : null;

  const subsNow = totals ? totals.total_subscribers : r.subs;
  const subsDelta = r.subs || 0;

  let topVideos = [];
  if (await tableExists(db, vt)) {
    const vids = await allRows(db, vt, 'title, views, likes', 'views DESC');
    topVideos = vids.slice(0, 5).map(v => ({ name: v.title, views: v.views, watchTime: '—' }));
  }

  const statsRows = await allRows(db, st, 'date, views', '`date` ASC');
  const viewsOT = { labels: statsRows.map(r2 => r2.date.toISOString().split('T')[0].substring(5)), values: statsRows.map(r2 => r2.views) };

  return {
    views: { value: fmtDelta(totalViews), detail: totalViewsChannel ? fmt(totalViewsChannel) + ' gesamt' : fmt(totalViews) + ' im Monat', deltaMode: true, positive: totalViews >= 0 },
    subscribers: { value: fmtDelta(subsDelta), detail: fmt(subsNow) + ' gesamt', deltaMode: true, positive: subsDelta >= 0 },
    watchTime: { value: fmt(Math.round(r.wt / 60)) + ' Std.' },
    ctr: { value: parseFloat(r.ctr).toFixed(1) + '%' },
    topVideos,
    viewsOverTime: viewsOT
  };
}

async function readLinkedIn(db, mk, prevMk) {
  const st = tbl('linkedin_stats', mk);
  const tt = tbl('linkedin_totals', mk);
  const pt = tbl('linkedin_top_posts', mk);
  if (!(await tableExists(db, st))) return null;

  const latest = await latestRow(db, st, 'impressions, clicks, engagement_rate, follower_count');
  if (!latest) return null;
  const totals = await tableExists(db, tt) ? await latestRow(db, tt, 'total_followers') : null;
  const follower = totals ? totals.total_followers : latest.follower_count;

  let prevImpr = null, prevFollower = null, prevEng = null, prevClicks = null;
  if (prevMk) {
    const pst = tbl('linkedin_stats', prevMk);
    if (await tableExists(db, pst)) {
      const p = await latestRow(db, pst, 'impressions, clicks, engagement_rate, follower_count');
      if (p) { prevImpr = p.impressions; prevClicks = p.clicks; prevEng = parseFloat(p.engagement_rate); prevFollower = p.follower_count; }
    }
  }

  let topPosts = [];
  if (await tableExists(db, pt)) {
    const posts = await allRows(db, pt, 'text, impressions, clicks, likes', 'impressions DESC');
    topPosts = posts.slice(0, 5).map(p => ({ name: (p.text || '').substring(0, 40), impressions: p.impressions, engagement: '—' }));
  }

  const statsRows = await allRows(db, st, 'date, follower_count', '`date` ASC');
  const growth = { labels: statsRows.map(r => r.date.toISOString().split('T')[0].substring(5)), values: statsRows.map(r => r.follower_count) };

  return {
    impressionen: { value: fmt(latest.impressions), trend: pct(latest.impressions, prevImpr), trendDir: trendDirection(latest.impressions, prevImpr, true) },
    follower: { value: fmt(follower), trend: pct(follower, prevFollower), trendDir: trendDirection(follower, prevFollower, true) },
    engagement: { value: parseFloat(latest.engagement_rate).toFixed(1) + '%', trend: pct(parseFloat(latest.engagement_rate), prevEng), trendDir: trendDirection(parseFloat(latest.engagement_rate), prevEng, true) },
    klicks: { value: fmt(latest.clicks), trend: pct(latest.clicks, prevClicks), trendDir: trendDirection(latest.clicks, prevClicks, true) },
    topPosts,
    followerGrowth: growth
  };
}

async function readMailchimp(db, mk, prevMk) {
  const st = tbl('mailchimp_summary', mk);
  const ct = tbl('mailchimp_campaigns', mk);
  if (!(await tableExists(db, st))) return null;

  const latest = await latestRow(db, st, 'total_subscribers, open_rate, click_rate, campaign_count');
  if (!latest) return null;

  let prevOR = null, prevCR = null, prevSubs = null;
  if (prevMk) {
    const pst = tbl('mailchimp_summary', prevMk);
    if (await tableExists(db, pst)) {
      const p = await latestRow(db, pst, 'total_subscribers, open_rate, click_rate');
      if (p) { prevOR = parseFloat(p.open_rate); prevCR = parseFloat(p.click_rate); prevSubs = p.total_subscribers; }
    }
  }

  let campaignList = [];
  if (await tableExists(db, ct)) {
    const camps = await allRows(db, ct, 'title, emails_sent, open_rate, click_rate, send_time', 'send_time DESC');
    campaignList = camps.map(c => {
      const d = c.send_time ? new Date(c.send_time) : null;
      return {
        name: c.title || 'Untitled',
        sent: c.emails_sent,
        openRate: parseFloat(c.open_rate).toFixed(1) + '%',
        clickRate: parseFloat(c.click_rate).toFixed(1) + '%',
        date: d ? `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}` : '—'
      };
    });
  }

  const or = parseFloat(latest.open_rate);
  const cr = parseFloat(latest.click_rate);

  const trendMonths = [];
  for (let i = 3; i >= 0; i--) {
    const [y, m] = mk.split('-').map(Number);
    let tm = m - i;
    let ty = y;
    if (tm <= 0) { tm += 12; ty--; }
    const tmk = `${ty}-${String(tm).padStart(2,'0')}`;
    const tmSt = tbl('mailchimp_summary', tmk);
    if (await tableExists(db, tmSt)) {
      const tr = await latestRow(db, tmSt, 'open_rate, click_rate');
      if (tr) trendMonths.push({ label: MONTH_NAMES[tm-1].substring(0,3), or: parseFloat(tr.open_rate), cr: parseFloat(tr.click_rate) });
    }
  }

  return {
    openRate: { value: or.toFixed(1) + '%', trend: pct(or, prevOR), trendDir: trendDirection(or, prevOR, true) },
    clickRate: { value: cr.toFixed(1) + '%', trend: pct(cr, prevCR), trendDir: trendDirection(cr, prevCR, true) },
    subscribers: { value: fmt(latest.total_subscribers), trend: pct(latest.total_subscribers, prevSubs), trendDir: trendDirection(latest.total_subscribers, prevSubs, true) },
    campaigns: { value: String(latest.campaign_count), trend: null },
    campaignList,
    trend: { labels: trendMonths.map(t => t.label), openRates: trendMonths.map(t => t.or), clickRates: trendMonths.map(t => t.cr) }
  };
}

async function buildOverview(googleAds, metaAds) {
  if (!googleAds && !metaAds) return null;

  const gSpend = googleAds ? parseFloat(googleAds.spend.value.replace('€','').replace('.','').replace(',','.')) : 0;
  const mSpend = metaAds ? parseFloat(metaAds.spend.value.replace('€','').replace('.','').replace(',','.')) : 0;
  const totalSpend = gSpend + mSpend;

  const gClicks = googleAds ? parseInt(googleAds.klicks.value.replace('.',''), 10) : 0;
  const mClicks = metaAds ? parseInt(metaAds.linkKlicks.value.replace('.',''), 10) : 0;
  const totalClicks = gClicks + mClicks;

  const gConv = googleAds ? parseInt(googleAds.conversions.value.replace('.',''), 10) : 0;
  const mLeads = metaAds ? parseInt(metaAds.leads.value.replace('.',''), 10) : 0;
  const totalConv = gConv + mLeads;

  const gImpr = googleAds ? parseInt(googleAds.impressionen.value.replace('.',''), 10) : 0;
  const mReach = metaAds ? parseInt(metaAds.reichweite.value.replace('.',''), 10) : 0;

  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  return {
    adSpend: { value: fmtEur(totalSpend), trend: null, detail: `Google ${fmtEur(gSpend)} · Meta ${fmtEur(mSpend)}` },
    klicks: { value: fmt(totalClicks), trend: null, detail: `Google ${fmt(gClicks)} · Meta ${fmt(mClicks)}` },
    conversions: { value: fmt(totalConv), trend: null, detail: `Google ${fmt(gConv)} Conv. · Meta ${fmt(mLeads)} Leads` },
    impressionen: { value: fmt(gImpr + (metaAds ? parseInt(metaAds.reichweite.value.replace('.',''),10) * 4 : 0)), trend: null, detail: '' },
    reichweite: { value: fmt(mReach), trend: null, detail: 'Meta only' },
    cpc: { value: fmtEur(avgCpc), trend: null, detail: '' },
    ctr: { value: totalClicks > 0 && gImpr > 0 ? ((totalClicks / gImpr) * 100).toFixed(2) + '%' : '—', trend: null, detail: '' },
    budgetSplit: {
      google: { value: gSpend, pct: totalSpend > 0 ? Math.round(gSpend/totalSpend*100) + '%' : '50%' },
      meta: { value: mSpend, pct: totalSpend > 0 ? Math.round(mSpend/totalSpend*100) + '%' : '50%' }
    },
    dailySpend: { labels: [], google: [], meta: [] }
  };
}

async function run() {
  console.log('Reading all data from database...');

  const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = requiredEnv.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Check repo secrets!`);
  }

  const db = await connectDB();
  const result = {};

  try {
    for (let i = 0; i < MONTH_KEYS_2026.length; i++) {
      const mk = MONTH_KEYS_2026[i];
      const shortKey = MONTH_SHORT[i];
      const prevMk = i > 0 ? MONTH_KEYS_2026[i - 1] : null;

      console.log(`Checking ${mk}...`);

      const googleAds = await readGoogle(db, mk, prevMk);
      const metaAds = await readMeta(db, mk, prevMk);
      const instagram = await readInstagram(db, mk);
      const youtube = await readYouTube(db, mk);
      const linkedin = await readLinkedIn(db, mk, prevMk);
      const mailchimp = await readMailchimp(db, mk, prevMk);

      const hasAny = googleAds || metaAds || instagram || youtube || linkedin || mailchimp;
      if (!hasAny) {
        console.log(`  ${mk}: no data`);
        continue;
      }

      const overview = await buildOverview(googleAds, metaAds);
      const totalSpend = overview ? overview.adSpend.value : '—';

      result[shortKey] = {
        label: `${MONTH_NAMES[i]} 2026`,
        totalSpend
      };
      if (overview) result[shortKey].overview = overview;
      if (googleAds) result[shortKey].googleAds = googleAds;
      if (metaAds) result[shortKey].metaAds = metaAds;
      if (instagram) result[shortKey].instagram = instagram;
      if (youtube) result[shortKey].youtube = youtube;
      if (linkedin) result[shortKey].linkedin = linkedin;
      if (mailchimp) result[shortKey].mailchimp = mailchimp;

      console.log(`  ${mk}: ✓ (${Object.keys(result[shortKey]).filter(k => !['label','totalSpend'].includes(k)).join(', ')})`);
    }
  } finally {
    await db.end();
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`Months with data: ${Object.keys(result).join(', ') || 'none'}`);
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
