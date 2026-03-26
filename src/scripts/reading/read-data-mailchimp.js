import 'dotenv/config';
import mysql from 'mysql2/promise';

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
      const connection = await mysql.createConnection(config);
      return connection;
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Could not connect to MySQL after ${retries} attempts. ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function monthTable(prefix, monthKey) {
  return `${prefix}_${monthKey.replace('-', '_')}`;
}

function getPreviousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

async function tableExists(db, tableName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return rows[0].cnt > 0;
}

function calcTrend(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1).replace('.', ',')}%`;
}

function calcTrendDir(current, previous, higherIsGood = true) {
  if (previous === null || previous === undefined || previous === 0) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  if (higherIsGood) {
    return diff > 0 ? 'up-good' : 'down-bad';
  }
  return diff > 0 ? 'up-bad' : 'down-good';
}

async function readSummary(db, monthKey) {
  const table = monthTable('mailchimp_summary', monthKey);
  if (!(await tableExists(db, table))) return null;

  const [rows] = await db.query(
    `SELECT total_subscribers, open_rate, click_rate, campaign_count FROM \`${table}\` ORDER BY date DESC LIMIT 1`
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    totalSubscribers: row.total_subscribers,
    openRate: parseFloat(row.open_rate),
    clickRate: parseFloat(row.click_rate),
    campaignCount: row.campaign_count,
  };
}

async function readCampaigns(db, monthKey) {
  const table = monthTable('mailchimp_campaigns', monthKey);
  if (!(await tableExists(db, table))) return [];

  const [rows] = await db.query(
    `SELECT campaign_id, title, send_time, emails_sent, open_rate, click_rate, opens_total, unique_opens, clicks_total, unique_clicks, unsubscribes, bounce_rate FROM \`${table}\` ORDER BY send_time DESC`
  );

  return rows.map(r => ({
    campaignId: r.campaign_id,
    title: r.title,
    sendTime: r.send_time,
    emailsSent: r.emails_sent,
    openRate: parseFloat(r.open_rate),
    clickRate: parseFloat(r.click_rate),
    opensTotal: r.opens_total,
    uniqueOpens: r.unique_opens,
    clicksTotal: r.clicks_total,
    uniqueClicks: r.unique_clicks,
    unsubscribes: r.unsubscribes,
    bounceRate: parseFloat(r.bounce_rate),
  }));
}

export async function readMailchimpData(monthKey) {
  const db = await connectDB();

  try {
    const summary = await readSummary(db, monthKey);
    const campaigns = await readCampaigns(db, monthKey);

    if (!summary) return null;

    const prevKey = getPreviousMonthKey(monthKey);
    const prevSummary = await readSummary(db, prevKey);

    const openRateTrend = prevSummary ? calcTrend(summary.openRate, prevSummary.openRate) : null;
    const clickRateTrend = prevSummary ? calcTrend(summary.clickRate, prevSummary.clickRate) : null;
    const subscribersTrend = prevSummary ? calcTrend(summary.totalSubscribers, prevSummary.totalSubscribers) : null;

    const openRateTrendDir = prevSummary ? calcTrendDir(summary.openRate, prevSummary.openRate, true) : null;
    const clickRateTrendDir = prevSummary ? calcTrendDir(summary.clickRate, prevSummary.clickRate, true) : null;
    const subscribersTrendDir = prevSummary ? calcTrendDir(summary.totalSubscribers, prevSummary.totalSubscribers, true) : null;

    const campaignList = campaigns.map(c => {
      const d = c.sendTime ? new Date(c.sendTime) : null;
      const dateStr = d
        ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
        : '—';
      return {
        name: c.title || 'Untitled',
        sent: c.emailsSent,
        openRate: `${c.openRate}%`,
        clickRate: `${c.clickRate}%`,
        date: dateStr,
      };
    });

    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const collected = [];
    let lookbackKey = monthKey;

    for (let i = 0; i < 4; i++) {
      const s = await readSummary(db, lookbackKey);
      if (s) {
        const [, m] = lookbackKey.split('-').map(Number);
        collected.unshift({ label: monthNames[m - 1], openRate: s.openRate, clickRate: s.clickRate });
      }
      lookbackKey = getPreviousMonthKey(lookbackKey);
    }

    return {
      openRate: { value: `${summary.openRate}%`, trend: openRateTrend, trendDir: openRateTrendDir },
      clickRate: { value: `${summary.clickRate}%`, trend: clickRateTrend, trendDir: clickRateTrendDir },
      subscribers: { value: summary.totalSubscribers.toLocaleString('de-DE'), trend: subscribersTrend, trendDir: subscribersTrendDir },
      campaigns: { value: String(summary.campaignCount), trend: null },
      campaignList,
      trend: {
        labels: collected.map(c => c.label),
        openRates: collected.map(c => c.openRate),
        clickRates: collected.map(c => c.clickRate),
      },
    };
  } finally {
    await db.end();
  }
}

const isDirectRun = process.argv[1] && process.argv[1].includes('read-data-mailchimp');

if (isDirectRun) {
  (async () => {
    try {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const data = await readMailchimpData(monthKey);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log('Keine Daten gefunden.');
      }
    } catch (err) {
      console.error('Fehler:', err.message);
      process.exit(1);
    }
  })();
}

