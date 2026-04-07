import 'dotenv/config';
import mysql from 'mysql2/promise';

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

if (!ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
  console.error('Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID env variables.');
  process.exit(1);
}

async function connectDB(retries = 3, delay = 5000) {
  const config = {
    host: process.env.DB_HOST,
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 30000,
  };

  if (!config.host || !config.user || !config.password || !config.database) {
    throw new Error('Missing DB environment variables. Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`DB connection attempt ${attempt}/${retries} to ${config.host}:${config.port}...`);
      const connection = await mysql.createConnection(config);
      console.log('DB connection established.');
      return connection;
    } catch (err) {
      console.error(`Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) {
        throw new Error(`Could not connect to MySQL at ${config.host}:${config.port} after ${retries} attempts. Original error: ${err.message}`);
      }
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function monthTable(prefix, monthKey) {
  return `${prefix}_${monthKey.replace('-', '_')}`;
}

async function ensureMetaTablesExist(db, monthKey) {
  const summaryTable = monthTable('meta_summary', monthKey);
  const campaignsTable = monthTable('meta_campaigns', monthKey);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${summaryTable}\` (
                                                     date DATE PRIMARY KEY,
                                                     spend DECIMAL(10,2) DEFAULT 0.00,
      link_clicks INT DEFAULT 0,
      leads INT DEFAULT 0,
      reach INT DEFAULT 0,
      impressions INT DEFAULT 0,
      cpc DECIMAL(8,2) DEFAULT 0.00,
      ctr DECIMAL(5,2) DEFAULT 0.00,
      frequency DECIMAL(5,2) DEFAULT 0.00
      )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${campaignsTable}\` (
                                                       campaign_id VARCHAR(60),
      date DATE,
      campaign_name VARCHAR(255),
      status VARCHAR(30),
      spend DECIMAL(10,2) DEFAULT 0.00,
      leads INT DEFAULT 0,
      cpl DECIMAL(10,2) DEFAULT 0.00,
      link_clicks INT DEFAULT 0,
      cpc DECIMAL(8,2) DEFAULT 0.00,
      ctr DECIMAL(5,2) DEFAULT 0.00,
      reach INT DEFAULT 0,
      impressions INT DEFAULT 0,
      frequency DECIMAL(5,2) DEFAULT 0.00,
      adset_count INT DEFAULT 0,
      PRIMARY KEY (campaign_id, date)
      )
  `);

  console.log(`Tables ${summaryTable}, ${campaignsTable} verified/created.`);
}

async function graphGet(path, params = {}) {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${res.status}: ${body}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractActionValue(actions, actionType) {
  if (!actions) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value, 10) : 0;
}

async function fetchAccountInsights(startDate, endDate) {
  const accountId = META_AD_ACCOUNT_ID.startsWith('act_') ? META_AD_ACCOUNT_ID : `act_${META_AD_ACCOUNT_ID}`;

  const data = await graphGet(`/${accountId}/insights`, {
    fields: 'spend,impressions,reach,inline_link_clicks,actions,cost_per_inline_link_click,inline_link_click_ctr,frequency',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: 'account',
  });

  if (!data.data || data.data.length === 0) {
    console.log('No account insights returned for this period.');
    return null;
  }

  const row = data.data[0];
  const leads = extractActionValue(row.actions, 'lead') + extractActionValue(row.actions, 'offsite_conversion.fb_pixel_lead');

  return {
    spend: parseFloat(row.spend || 0),
    impressions: parseInt(row.impressions || 0, 10),
    reach: parseInt(row.reach || 0, 10),
    linkClicks: parseInt(row.inline_link_clicks || 0, 10),
    leads,
    cpc: parseFloat(row.cost_per_inline_link_click || 0),
    ctr: parseFloat(row.inline_link_click_ctr || 0),
    frequency: parseFloat(row.frequency || 0),
  };
}

async function fetchCampaignInsights(startDate, endDate) {
  const accountId = META_AD_ACCOUNT_ID.startsWith('act_') ? META_AD_ACCOUNT_ID : `act_${META_AD_ACCOUNT_ID}`;

  let allCampaigns = [];
  let url = `/${accountId}/insights`;
  let params = {
    fields: 'campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,actions,cost_per_inline_link_click,inline_link_click_ctr,frequency',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: 'campaign',
    limit: 100,
  };

  let page = 0;
  while (url && page < 10) {
    const data = await graphGet(url, params);
    if (data.data) allCampaigns = allCampaigns.concat(data.data);

    if (data.paging && data.paging.next) {
      const nextUrl = new URL(data.paging.next);
      url = nextUrl.pathname.replace('/v21.0', '');
      params = Object.fromEntries(nextUrl.searchParams.entries());
      delete params.access_token;
    } else {
      break;
    }
    page++;
    await sleep(200);
  }

  console.log(`Fetched ${allCampaigns.length} campaigns.`);
  return allCampaigns;
}

async function fetchCampaignStatuses(campaignIds) {
  const statuses = {};
  for (const id of campaignIds) {
    try {
      const data = await graphGet(`/${id}`, { fields: 'effective_status' });
      statuses[id] = data.effective_status || 'UNKNOWN';
    } catch {
      statuses[id] = 'UNKNOWN';
    }
    await sleep(200);
  }
  return statuses;
}

async function fetchAdSetCounts(campaignIds) {
  const counts = {};
  for (const id of campaignIds) {
    try {
      const data = await graphGet(`/${id}/adsets`, { fields: 'id', limit: 200 });
      counts[id] = data.data ? data.data.length : 0;
    } catch {
      counts[id] = 0;
    }
    await sleep(200);
  }
  return counts;
}

async function saveToMySQL(summary, campaigns, monthKey, today) {
  const db = await connectDB();
  const summaryTable = monthTable('meta_summary', monthKey);
  const campaignsTable = monthTable('meta_campaigns', monthKey);

  try {
    await ensureMetaTablesExist(db, monthKey);

    if (summary) {
      await db.query(`
        INSERT INTO \`${summaryTable}\` (date, spend, link_clicks, leads, reach, impressions, cpc, ctr, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
                             spend=VALUES(spend),
                             link_clicks=VALUES(link_clicks),
                             leads=VALUES(leads),
                             reach=VALUES(reach),
                             impressions=VALUES(impressions),
                             cpc=VALUES(cpc),
                             ctr=VALUES(ctr),
                             frequency=VALUES(frequency)
      `, [today, summary.spend, summary.linkClicks, summary.leads, summary.reach, summary.impressions, summary.cpc, summary.ctr, summary.frequency]);
      console.log(`Summary saved to ${summaryTable} for ${today}.`);
    }

    if (campaigns.length > 0) {
      const query = `
        INSERT INTO \`${campaignsTable}\`
        (campaign_id, date, campaign_name, status, spend, leads, cpl, link_clicks, cpc, ctr, reach, impressions, frequency, adset_count)
        VALUES ?
          ON DUPLICATE KEY UPDATE
                             campaign_name=VALUES(campaign_name),
                             status=VALUES(status),
                             spend=VALUES(spend),
                             leads=VALUES(leads),
                             cpl=VALUES(cpl),
                             link_clicks=VALUES(link_clicks),
                             cpc=VALUES(cpc),
                             ctr=VALUES(ctr),
                             reach=VALUES(reach),
                             impressions=VALUES(impressions),
                             frequency=VALUES(frequency),
                             adset_count=VALUES(adset_count)
      `;
      const values = campaigns.map(c => [
        c.campaignId, today, c.name, c.status, c.spend, c.leads, c.cpl,
        c.linkClicks, c.cpc, c.ctr, c.reach, c.impressions, c.frequency, c.adsetCount,
      ]);
      await db.query(query, [values]);
      console.log(`${campaigns.length} campaigns saved to ${campaignsTable}.`);
    }
  } finally {
    await db.end();
  }
}

async function run() {
  try {
    console.log('Starting Meta Ads fetch...');

    const now = new Date();
    const year = now.getFullYear();
    const monthNum = now.getMonth();
    const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
    const startOfMonth = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().split('T')[0];

    console.log(`Fetching Meta Ads data for ${monthKey} (${startOfMonth} to ${today})...`);

    const dbDate = startOfMonth;

    const summary = await fetchAccountInsights(startOfMonth, today);
    if (summary) {
      console.log(`Account summary retrieved. Spend: ${summary.spend}`);
    }

    const rawCampaigns = await fetchCampaignInsights(startOfMonth, today);
    const campaignIds = rawCampaigns.map(c => c.campaign_id);

    const [statuses, adsetCounts] = await Promise.all([
      fetchCampaignStatuses(campaignIds),
      fetchAdSetCounts(campaignIds),
    ]);

    const campaigns = rawCampaigns.map(c => {
      const leads = extractActionValue(c.actions, 'lead') + extractActionValue(c.actions, 'offsite_conversion.fb_pixel_lead');
      const spend = parseFloat(c.spend || 0);
      return {
        campaignId: c.campaign_id,
        name: c.campaign_name,
        status: statuses[c.campaign_id] || 'UNKNOWN',
        spend,
        leads,
        cpl: leads > 0 ? parseFloat((spend / leads).toFixed(2)) : 0,
        linkClicks: parseInt(c.inline_link_clicks || 0, 10),
        cpc: parseFloat(c.cost_per_inline_link_click || 0),
        ctr: parseFloat(c.inline_link_click_ctr || 0),
        reach: parseInt(c.reach || 0, 10),
        impressions: parseInt(c.impressions || 0, 10),
        frequency: parseFloat(c.frequency || 0),
        adsetCount: adsetCounts[c.campaign_id] || 0,
      };
    });

    console.log('Campaign metrics processed successfully.');

    await saveToMySQL(summary, campaigns, monthKey, dbDate);
    console.log('Meta Ads fetch done.');
  } catch (error) {
    console.error('Error during Meta Ads fetch:', error.message);
    if (error.code) console.error('Error code:', error.code);
    if (error.errno) console.error('Errno:', error.errno);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

run();