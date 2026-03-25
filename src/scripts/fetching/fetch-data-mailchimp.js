import 'dotenv/config';
import mysql from 'mysql2/promise';

const MC_API_KEY = process.env.MAILCHIMP_API_KEY;

if (!MC_API_KEY) {
  console.error('Missing MAILCHIMP_API_KEY env variable.');
  process.exit(1);
}

const DC = MC_API_KEY.split('-').pop();
const MC_BASE = `https://${DC}.api.mailchimp.com/3.0`;

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
    throw new Error(
      'Missing DB environment variables. Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.'
    );
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
        throw new Error(
          `Could not connect to MySQL at ${config.host}:${config.port} after ${retries} attempts. ` +
          `Original error: ${err.message}`
        );
      }
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function monthTable(prefix, monthKey) {
  return `${prefix}_${monthKey.replace('-', '_')}`;
}

async function ensureMailchimpTablesExist(db, monthKey) {
  const summaryTable = monthTable('mailchimp_summary', monthKey);
  const campaignsTable = monthTable('mailchimp_campaigns', monthKey);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${summaryTable}\` (
      date DATE PRIMARY KEY,
      total_subscribers INT DEFAULT 0,
      open_rate DECIMAL(5,2) DEFAULT 0.00,
      click_rate DECIMAL(5,2) DEFAULT 0.00,
      campaign_count INT DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${campaignsTable}\` (
      campaign_id VARCHAR(60) PRIMARY KEY,
      title VARCHAR(255),
      send_time DATETIME,
      emails_sent INT DEFAULT 0,
      open_rate DECIMAL(5,2) DEFAULT 0.00,
      click_rate DECIMAL(5,2) DEFAULT 0.00,
      opens_total INT DEFAULT 0,
      unique_opens INT DEFAULT 0,
      clicks_total INT DEFAULT 0,
      unique_clicks INT DEFAULT 0,
      unsubscribes INT DEFAULT 0,
      bounce_rate DECIMAL(5,2) DEFAULT 0.00
    )
  `);

  console.log(`Tables ${summaryTable}, ${campaignsTable} verified/created.`);
}

async function mcGet(path) {
  const url = `${MC_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `apikey ${MC_API_KEY}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailchimp API ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchListStats() {
  const data = await mcGet('/lists?count=100');

  if (!data.lists || data.lists.length === 0) {
    console.log('No audiences found.');
    return { totalSubscribers: 0, listId: null };
  }

  let totalSubscribers = 0;
  let primaryList = data.lists[0];

  for (const list of data.lists) {
    totalSubscribers += list.stats.member_count || 0;
    if (list.stats.member_count > primaryList.stats.member_count) {
      primaryList = list;
    }
  }

  console.log(`Found ${data.lists.length} audience(s), total subscribers: ${totalSubscribers}`);
  return { totalSubscribers, listId: primaryList.id };
}

async function fetchCampaigns(startDate, endDate) {
  const sinceDate = new Date(startDate + 'T00:00:00Z').toISOString();
  const campaigns = [];
  let offset = 0;
  const count = 100;

  while (true) {
    const data = await mcGet(
      `/campaigns?status=sent&since_send_time=${sinceDate}&count=${count}&offset=${offset}&sort_field=send_time&sort_dir=DESC`
    );

    if (!data.campaigns || data.campaigns.length === 0) break;

    for (const c of data.campaigns) {
      const sendDate = c.send_time ? c.send_time.split('T')[0] : null;
      if (!sendDate) continue;
      if (sendDate < startDate || sendDate > endDate) continue;

      campaigns.push(c);
    }

    if (data.campaigns.length < count) break;
    offset += count;
  }

  console.log(`Fetched ${campaigns.length} sent campaigns in date range.`);
  return campaigns;
}

async function fetchCampaignReports(campaignIds) {
  const reports = [];

  for (const id of campaignIds) {
    try {
      const data = await mcGet(`/reports/${id}`);
      reports.push({
        campaignId: data.id,
        title: data.campaign_title || 'Untitled',
        sendTime: data.send_time,
        emailsSent: data.emails_sent || 0,
        openRate: Math.round((data.opens?.open_rate || 0) * 10000) / 100,
        clickRate: Math.round((data.clicks?.click_rate || 0) * 10000) / 100,
        opensTotal: data.opens?.opens_total || 0,
        uniqueOpens: data.opens?.unique_opens || 0,
        clicksTotal: data.clicks?.clicks_total || 0,
        uniqueClicks: data.clicks?.unique_subscriber_clicks || 0,
        unsubscribes: data.unsubscribed || 0,
        bounceRate: Math.round(((data.bounces?.hard_bounces || 0) + (data.bounces?.soft_bounces || 0)) /
          Math.max(data.emails_sent || 1, 1) * 10000) / 100,
      });
    } catch (err) {
      console.log(`Could not fetch report for campaign ${id}: ${err.message}`);
    }
  }

  return reports;
}

async function saveToMySQL(summary, campaignReports, monthKey, today) {
  const db = await connectDB();
  const summaryTable = monthTable('mailchimp_summary', monthKey);
  const campaignsTable = monthTable('mailchimp_campaigns', monthKey);

  try {
    await ensureMailchimpTablesExist(db, monthKey);

    await db.query(`
      INSERT INTO \`${summaryTable}\` (date, total_subscribers, open_rate, click_rate, campaign_count)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_subscribers=VALUES(total_subscribers),
        open_rate=VALUES(open_rate),
        click_rate=VALUES(click_rate),
        campaign_count=VALUES(campaign_count)
    `, [today, summary.totalSubscribers, summary.avgOpenRate, summary.avgClickRate, summary.campaignCount]);
    console.log(`Summary saved to ${summaryTable} for ${today}.`);

    if (campaignReports.length > 0) {
      const query = `
        INSERT INTO \`${campaignsTable}\`
          (campaign_id, title, send_time, emails_sent, open_rate, click_rate,
           opens_total, unique_opens, clicks_total, unique_clicks, unsubscribes, bounce_rate)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          title=VALUES(title),
          send_time=VALUES(send_time),
          emails_sent=VALUES(emails_sent),
          open_rate=VALUES(open_rate),
          click_rate=VALUES(click_rate),
          opens_total=VALUES(opens_total),
          unique_opens=VALUES(unique_opens),
          clicks_total=VALUES(clicks_total),
          unique_clicks=VALUES(unique_clicks),
          unsubscribes=VALUES(unsubscribes),
          bounce_rate=VALUES(bounce_rate)
      `;
      const values = campaignReports.map(r => [
        r.campaignId, r.title, r.sendTime, r.emailsSent, r.openRate, r.clickRate,
        r.opensTotal, r.uniqueOpens, r.clicksTotal, r.uniqueClicks, r.unsubscribes, r.bounceRate,
      ]);
      await db.query(query, [values]);
      console.log(`${campaignReports.length} campaign reports saved to ${campaignsTable}.`);
    }
  } finally {
    await db.end();
  }
}

async function run() {
  try {
    console.log('Starting Mailchimp fetch...');

    const now = new Date();
    const year = now.getFullYear();
    const monthNum = now.getMonth();
    const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
    const startOfMonth = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().split('T')[0];

    console.log(`Fetching Mailchimp data for ${monthKey} (${startOfMonth} to ${today})...`);

    const { totalSubscribers } = await fetchListStats();
    const campaigns = await fetchCampaigns(startOfMonth, today);
    const campaignIds = campaigns.map(c => c.id);
    const campaignReports = await fetchCampaignReports(campaignIds);

    let avgOpenRate = 0;
    let avgClickRate = 0;
    if (campaignReports.length > 0) {
      avgOpenRate = Math.round(
        campaignReports.reduce((s, r) => s + r.openRate, 0) / campaignReports.length * 100
      ) / 100;
      avgClickRate = Math.round(
        campaignReports.reduce((s, r) => s + r.clickRate, 0) / campaignReports.length * 100
      ) / 100;
    }

    const summary = {
      totalSubscribers,
      avgOpenRate,
      avgClickRate,
      campaignCount: campaignReports.length,
    };

    console.log(`Subscribers: ${totalSubscribers}, Campaigns: ${summary.campaignCount}, Avg Open Rate: ${avgOpenRate}%, Avg Click Rate: ${avgClickRate}%`);

    for (const r of campaignReports) {
      console.log(`  ${r.title}: ${r.emailsSent} sent, ${r.openRate}% open, ${r.clickRate}% click`);
    }

    await saveToMySQL(summary, campaignReports, monthKey, today);
    console.log('Mailchimp fetch done.');
  } catch (error) {
    console.error('Error during Mailchimp fetch:', error.message);
    if (error.code) console.error('   Error code:', error.code);
    process.exit(1);
  }
}

run();

