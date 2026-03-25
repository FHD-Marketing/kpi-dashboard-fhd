import 'dotenv/config';
import mysql from 'mysql2/promise';

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

if (!ACCESS_TOKEN) {
  console.error('Missing META_ACCESS_TOKEN env variable.');
  process.exit(1);
}

let IG_BUSINESS_ID = null;

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
      console.log(`DB connection attempt ${attempt}/${retries} to ${config.host}...`);
      const connection = await mysql.createConnection(config);
      console.log('DB connection established.');
      return connection;
    } catch (err) {
      console.error(`Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      console.log(`Retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

function monthTable(prefix, monthKey) {
  return `${prefix}_${monthKey.replace('-', '_')}`;
}

async function ensureInstaTablesExist(db, monthKey) {
  const statsTable = monthTable('insta_stats', monthKey);
  const totalsTable = monthTable('insta_totals', monthKey);
  const postsTable = monthTable('insta_top_posts', monthKey);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${statsTable}\` (
      date DATE PRIMARY KEY,
      impressions INT DEFAULT 0,
      reach INT DEFAULT 0,
      follower_count INT DEFAULT 0,
      follower_gained INT DEFAULT 0,
      engagement_rate DECIMAL(5,2) DEFAULT 0.00
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${totalsTable}\` (
      date DATE PRIMARY KEY,
      total_followers INT DEFAULT 0,
      total_posts INT DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${postsTable}\` (
      post_id VARCHAR(60) PRIMARY KEY,
      caption VARCHAR(500),
      reach INT DEFAULT 0,
      impressions INT DEFAULT 0,
      likes INT DEFAULT 0,
      comments INT DEFAULT 0,
      rank_position TINYINT DEFAULT 0
    )
  `);
  console.log(`Tables ensured for month: ${monthKey}`);
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

async function resolveInstagramBusinessId() {
  console.log('Resolving Instagram Business Account ID...');

  if (process.env.IG_USER_ID) {
    console.log(`Using IG_USER_ID from env: ${process.env.IG_USER_ID}`);
    return process.env.IG_USER_ID;
  }

  try {
    const pages = await graphGet('/me/accounts', { fields: 'id,name,instagram_business_account', limit: 10 });
    if (pages.data && pages.data.length > 0) {
      for (const page of pages.data) {
        if (page.instagram_business_account?.id) {
          console.log(`Found IG Business Account ${page.instagram_business_account.id} on Page "${page.name}".`);
          return page.instagram_business_account.id;
        }
      }
    }
  } catch (err) {
    console.error(`Failed to fetch pages via /me/accounts: ${err.message}`);
  }

  throw new Error('Could not resolve Instagram Business Account ID. Add IG_USER_ID to your Secrets.');
}

async function fetchAccountInfo() {
  const data = await graphGet(`/${IG_BUSINESS_ID}`, {
    fields: 'followers_count,media_count,username',
  });
  return {
    totalFollowers: data.followers_count || 0,
    totalPosts: data.media_count || 0,
    username: data.username || 'Unknown',
  };
}

async function fetchDailyInsights(startDate, endDate) {
  const since = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
  const until = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000);

  let data;
  try {
    data = await graphGet(`/${IG_BUSINESS_ID}/insights`, {
      metric: 'impressions,reach,follower_count',
      period: 'day',
      since,
      until,
    });
  } catch (err) {
    console.log(`Daily insights fetch failed: ${err.message}`);
    return [];
  }

  if (!data.data || data.data.length === 0) {
    console.log('No daily insights returned for this period.');
    return [];
  }

  const metricsMap = {};
  for (const entry of data.data) {
    metricsMap[entry.name] = {};
    for (const point of entry.values) {
      const dateStr = point.end_time.split('T')[0];
      metricsMap[entry.name][dateStr] = point.value;
    }
  }

  const result = [];
  const currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    const dStr = currentDate.toISOString().split('T')[0];
    result.push({
      date: dStr,
      impressions: metricsMap.impressions?.[dStr] || 0,
      reach: metricsMap.reach?.[dStr] || 0,
      follower_gained: metricsMap.follower_count?.[dStr] || 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return result;
}

async function fetchMonthlyEngagementAndPosts(startDate, endDate) {
  console.log(`Fetching posts between ${startDate} and ${endDate}...`);
  let allMedia = [];
  let urlPath = `/${IG_BUSINESS_ID}/media`;
  let params = { fields: 'id,caption,timestamp,like_count,comments_count,media_type', limit: 50 };

  while (urlPath) {
    const data = await graphGet(urlPath, params);
    if (!data.data) break;
    allMedia.push(...data.data);

    if (data.data.length > 0) {
      const oldest = data.data[data.data.length - 1].timestamp.split('T')[0];
      if (oldest < startDate) break;
    }

    if (data.paging?.next) {
      const nextUrl = new URL(data.paging.next);
      urlPath = nextUrl.pathname.replace('/v21.0', '');
      params = Object.fromEntries(nextUrl.searchParams.entries());
      delete params.access_token;
    } else {
      break;
    }
  }

  const monthMedia = allMedia.filter(m => {
    const d = m.timestamp.split('T')[0];
    return d >= startDate && d <= endDate;
  });

  console.log(`Processing insights for ${monthMedia.length} posts...`);
  const postsWithInsights = [];

  for (const media of monthMedia) {
    let reach = 0, impressions = 0;
    try {
      const insights = await graphGet(`/${media.id}/insights`, { metric: 'reach,impressions' });
      for (const entry of insights.data) {
        if (entry.name === 'reach') reach = entry.values[0]?.value || 0;
        if (entry.name === 'impressions') impressions = entry.values[0]?.value || 0;
      }
    } catch {
      console.log(`Could not fetch insights for media ${media.id}.`);
    }

    postsWithInsights.push({
      id: media.id,
      caption: (media.caption || '').substring(0, 500),
      reach,
      impressions,
      likes: media.like_count || 0,
      comments: media.comments_count || 0,
    });
    await sleep(200);
  }

  postsWithInsights.sort((a, b) => b.reach - a.reach);
  const topPosts = postsWithInsights.slice(0, 5).map((p, i) => ({ ...p, rank: i + 1 }));

  const totalLikes = postsWithInsights.reduce((s, p) => s + p.likes, 0);
  const totalComments = postsWithInsights.reduce((s, p) => s + p.comments, 0);
  const totalReach = postsWithInsights.reduce((s, p) => s + p.reach, 0);

  const engagementRate = totalReach > 0
    ? Math.round(((totalLikes + totalComments) / totalReach) * 10000) / 100
    : 0;

  return { topPosts, engagementRate };
}

async function saveToMySQL(dailyData, monthKey, accountInfo, topPosts, engagementRate) {
  const db = await connectDB();
  const statsTable = monthTable('insta_stats', monthKey);
  const totalsTable = monthTable('insta_totals', monthKey);
  const postsTable = monthTable('insta_top_posts', monthKey);
  const today = new Date().toISOString().split('T')[0];

  try {
    await ensureInstaTablesExist(db, monthKey);

    if (dailyData.length > 0) {
      const query = `
        INSERT INTO \`${statsTable}\` (date, impressions, reach, follower_count, follower_gained, engagement_rate)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          impressions=VALUES(impressions), reach=VALUES(reach),
          follower_count=VALUES(follower_count), follower_gained=VALUES(follower_gained),
          engagement_rate=VALUES(engagement_rate)
      `;

      let currentFollowers = accountInfo.totalFollowers;
      const reverseDays = [...dailyData].reverse();

      reverseDays.forEach(d => {
        d.absolute_followers = currentFollowers;
        currentFollowers -= d.follower_gained;
      });

      const values = dailyData.map(d => [
        d.date, d.impressions, d.reach, d.absolute_followers || accountInfo.totalFollowers, d.follower_gained, engagementRate,
      ]);
      await db.query(query, [values]);
    }

    const totalsQuery = `
      INSERT INTO \`${totalsTable}\` (date, total_followers, total_posts)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE total_followers=VALUES(total_followers), total_posts=VALUES(total_posts)
    `;
    await db.query(totalsQuery, [today, accountInfo.totalFollowers, accountInfo.totalPosts]);

    if (topPosts.length > 0) {
      const postsQuery = `
        INSERT INTO \`${postsTable}\` (post_id, caption, reach, impressions, likes, comments, rank_position)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          caption=VALUES(caption), reach=VALUES(reach), impressions=VALUES(impressions),
          likes=VALUES(likes), comments=VALUES(comments), rank_position=VALUES(rank_position)
      `;
      const postValues = topPosts.map(p => [p.id, p.caption, p.reach, p.impressions, p.likes, p.comments, p.rank]);
      await db.query(postsQuery, [postValues]);
    }
    console.log('Data successfully saved to MySQL.');
  } finally {
    await db.end();
  }
}

async function run() {
  try {
    console.log('Starting Instagram fetch...');
    IG_BUSINESS_ID = await resolveInstagramBusinessId();

    const now = new Date();
    const year = now.getFullYear();
    const monthNum = now.getMonth();
    const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
    const startOfMonth = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().split('T')[0];

    const accountInfo = await fetchAccountInfo();
    console.log(`Instagram @${accountInfo.username}: ${accountInfo.totalFollowers} followers, ${accountInfo.totalPosts} posts`);

    const dailyData = await fetchDailyInsights(startOfMonth, today);
    const { topPosts, engagementRate } = await fetchMonthlyEngagementAndPosts(startOfMonth, today);

    console.log(`Engagement rate: ${engagementRate}%`);

    await saveToMySQL(dailyData, monthKey, accountInfo, topPosts, engagementRate);
    console.log('Instagram fetch done.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

run();