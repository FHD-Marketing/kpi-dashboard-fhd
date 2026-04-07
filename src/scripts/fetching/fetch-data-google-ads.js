import 'dotenv/config';
import mysql from 'mysql2/promise';
import { GoogleAdsApi } from 'google-ads-api';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GADS_REFRESH_TOKEN;
const DEVELOPER_TOKEN = process.env.GADS_DEVELOPER_TOKEN;
const CUSTOMER_ID = process.env.GADS_CUSTOMER_ID;
const MCC_ID = process.env.GADS_MCC_ID;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !DEVELOPER_TOKEN || !CUSTOMER_ID || !MCC_ID) {
  console.error('Missing Google Ads environment variables.');
  process.exit(1);
}

const client = new GoogleAdsApi({
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  developer_token: DEVELOPER_TOKEN,
  login_customer_id: MCC_ID,
});

async function connectDB(retries = 3, delay = 5000) {
  const config = {
    host: process.env.DB_HOST,
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 30000,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await mysql.createConnection(config);
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`DB connection failed: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function monthTable(prefix, monthKey) {
  return `${prefix}_${monthKey.replace('-', '_')}`;
}

async function ensureGadsTablesExist(db, monthKey) {
  const summaryTable = monthTable('google_summary', monthKey);
  const campaignsTable = monthTable('google_campaigns', monthKey);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${summaryTable}\` (
      date DATE PRIMARY KEY,
      spend DECIMAL(10,2) DEFAULT 0.00,
      clicks INT DEFAULT 0,
      conversions DECIMAL(10,2) DEFAULT 0.00,
      impressions INT DEFAULT 0,
      cpc DECIMAL(8,2) DEFAULT 0.00,
      ctr DECIMAL(5,2) DEFAULT 0.00
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${campaignsTable}\` (
      campaign_id VARCHAR(60),
      date DATE,
      campaign_name VARCHAR(255),
      status VARCHAR(30),
      spend DECIMAL(10,2) DEFAULT 0.00,
      leads DECIMAL(10,2) DEFAULT 0.00,
      cpl DECIMAL(10,2) DEFAULT 0.00,
      clicks INT DEFAULT 0,
      cpc DECIMAL(8,2) DEFAULT 0.00,
      ctr DECIMAL(5,2) DEFAULT 0.00,
      impressions INT DEFAULT 0,
      PRIMARY KEY (campaign_id, date)
    )
  `);
}

function formatMicros(micros) {
  if (!micros) return 0.00;
  return parseFloat((Number(micros) / 1000000).toFixed(2));
}

async function fetchGoogleAdsData(startDate, endDate) {
  const customer = client.Customer({
    customer_id: CUSTOMER_ID,
    refresh_token: REFRESH_TOKEN,
  });

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.conversions,
      metrics.impressions,
      metrics.average_cpc,
      metrics.ctr
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    AND campaign.status != 'REMOVED'
  `;

  console.log('Querying Google Ads API...');
  console.log('Customer ID:', CUSTOMER_ID);
  console.log('MCC ID:', MCC_ID);

  const rows = await customer.query(query);

  console.log('Query returned', rows?.length ?? 'undefined', 'rows');

  const campaigns = rows.map(row => {
    const spend = formatMicros(row.metrics.cost_micros);
    const conversions = parseFloat(row.metrics.conversions || 0);
    const cpl = conversions > 0 ? parseFloat((spend / conversions).toFixed(2)) : 0.00;

    return {
      campaignId: row.campaign.id,
      name: row.campaign.name,
      status: row.campaign.status,
      spend: spend,
      leads: conversions,
      cpl: cpl,
      clicks: parseInt(row.metrics.clicks || 0, 10),
      cpc: formatMicros(row.metrics.average_cpc),
      ctr: parseFloat(((row.metrics.ctr || 0) * 100).toFixed(2)),
      impressions: parseInt(row.metrics.impressions || 0, 10),
    };
  });

  const summary = campaigns.reduce((acc, curr) => {
    acc.spend += curr.spend;
    acc.clicks += curr.clicks;
    acc.conversions += curr.leads;
    acc.impressions += curr.impressions;
    return acc;
  }, { spend: 0, clicks: 0, conversions: 0, impressions: 0 });

  if (summary.impressions > 0) {
    summary.ctr = parseFloat(((summary.clicks / summary.impressions) * 100).toFixed(2));
  } else {
    summary.ctr = 0;
  }

  if (summary.clicks > 0) {
    summary.cpc = parseFloat((summary.spend / summary.clicks).toFixed(2));
  } else {
    summary.cpc = 0;
  }

  return { summary, campaigns };
}

async function saveToMySQL(summary, campaigns, monthKey, today) {
  const db = await connectDB();
  const summaryTable = monthTable('google_summary', monthKey);
  const campaignsTable = monthTable('google_campaigns', monthKey);

  try {
    await ensureGadsTablesExist(db, monthKey);

    await db.query(`TRUNCATE TABLE \`${summaryTable}\``);
    await db.query(`TRUNCATE TABLE \`${campaignsTable}\``);
    console.log(`Truncated ${summaryTable} and ${campaignsTable}.`);

    await db.query(`
      INSERT INTO \`${summaryTable}\` (date, spend, clicks, conversions, impressions, cpc, ctr)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [today, summary.spend, summary.clicks, summary.conversions, summary.impressions, summary.cpc, summary.ctr]);

    if (campaigns.length > 0) {
      const query = `
        INSERT INTO \`${campaignsTable}\`
        (campaign_id, date, campaign_name, status, spend, leads, cpl, clicks, cpc, ctr, impressions)
        VALUES ?
      `;
      const values = campaigns.map(c => [
        c.campaignId, today, c.name, c.status, c.spend, c.leads, c.cpl,
        c.clicks, c.cpc, c.ctr, c.impressions
      ]);
      await db.query(query, [values]);
    }
  } finally {
    await db.end();
  }
}

async function run() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const monthNum = now.getMonth();
    const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
    const startOfMonth = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().split('T')[0];

    console.log(`Fetching Google Ads data from ${startOfMonth} to ${today}...`);

    const { summary, campaigns } = await fetchGoogleAdsData(startOfMonth, today);

    console.log(`Fetched ${campaigns.length} campaigns. Summary:`, JSON.stringify(summary));

    const dbDate = startOfMonth;
    await saveToMySQL(summary, campaigns, monthKey, dbDate);

    console.log('Google Ads data saved successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Google Ads fetch failed.');
    console.error('Error type:', typeof error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    if (error?.errors) console.error('API errors:', JSON.stringify(error.errors, null, 2));
    if (error?.response) {
      console.error('Response status:', error.response?.status);
      console.error('Response data:', JSON.stringify(error.response?.data, null, 2));
    }
    try {
      console.error('Full error:', JSON.stringify(error, null, 2));
    } catch {
      console.error('Full error (non-serializable):', error);
    }
    process.exit(1);
  }
}

run();