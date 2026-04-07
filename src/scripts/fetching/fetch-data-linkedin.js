import 'dotenv/config';
import mysql from 'mysql2/promise';

const LINKEDIN_CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_ACCESS_TOKEN  = process.env.LINKEDIN_ACCESS_TOKEN;
const LINKEDIN_ORG_ID        = process.env.LINKEDIN_ORG_ID;

const requiredVars = ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_ORG_ID'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required env variables: ${missing.join(', ')}`);
  process.exit(1);
}

const LI_API_BASE    = 'https://api.linkedin.com/rest';
const LI_API_VERSION = '202401';
let ACCESS_TOKEN     = LINKEDIN_ACCESS_TOKEN;

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

async function ensureLinkedInTablesExist(db, monthKey) {
  const statsTable  = monthTable('linkedin_stats', monthKey);
  const totalsTable = monthTable('linkedin_totals', monthKey);
  const postsTable  = monthTable('linkedin_top_posts', monthKey);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${statsTable}\` (
      date DATE PRIMARY KEY,
      impressions INT DEFAULT 0,
      clicks INT DEFAULT 0,
      likes INT DEFAULT 0,
      comments INT DEFAULT 0,
      shares INT DEFAULT 0,
      engagement_rate DECIMAL(5,2) DEFAULT 0.00,
      follower_count INT DEFAULT 0,
      follower_gained INT DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${totalsTable}\` (
      date DATE PRIMARY KEY,
      total_followers INT DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${postsTable}\` (
      post_urn VARCHAR(120) PRIMARY KEY,
      text VARCHAR(500),
      impressions INT DEFAULT 0,
      clicks INT DEFAULT 0,
      likes INT DEFAULT 0,
      comments INT DEFAULT 0,
      rank_position TINYINT DEFAULT 0
    )
  `);

  console.log(`Tables ${statsTable}, ${totalsTable}, ${postsTable} verified/created.`);
}

async function liGet(path, params = {}) {
  const url = new URL(`${LI_API_BASE}${path}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'LinkedIn-Version': LI_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${body}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tryRefreshToken() {
  const refreshToken = process.env.LINKEDIN_REFRESH_TOKEN;
  if (!refreshToken || !LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    console.log('No refresh token or client credentials provided – using existing access token.');
    return;
  }

  console.log('Attempting to refresh LinkedIn access token...');
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`Token refresh failed (${res.status}): ${body} – continuing with existing token.`);
    return;
  }

  const data = await res.json();
  ACCESS_TOKEN = data.access_token;
  console.log('Access token refreshed successfully.');

  if (data.refresh_token) {
    console.log('New refresh token received (store it for next run).');
  }
}

async function fetchFollowerCount() {
  console.log('Fetching total follower count...');
  const orgUrn = `urn:li:organization:${LINKEDIN_ORG_ID}`;

  const data = await liGet('/organizationalEntityFollowerStatistics', {
    q: 'organizationalEntity',
    organizationalEntity: orgUrn,
  });

  const elements = data.elements || [];
  if (elements.length === 0) {
    console.log('No follower statistics returned.');
    return 0;
  }

  const stats = elements[0];
  const organicTotal  = stats.followerCountsByAssociationType?.find(a => a.associationType === 'ORGANIC')?.followerCounts?.total || 0;
  const paidTotal     = stats.followerCountsByAssociationType?.find(a => a.associationType === 'PAID')?.followerCounts?.total || 0;

  const total = (organicTotal + paidTotal) || stats.followerCounts?.total || 0;
  console.log(`Total followers: ${total}`);
  return total;
}

async function fetchFollowerGrowth(startMs, endMs) {
  console.log('Fetching follower growth...');
  const orgUrn = `urn:li:organization:${LINKEDIN_ORG_ID}`;

  const data = await liGet('/organizationalEntityFollowerStatistics', {
    q: 'organizationalEntity',
    organizationalEntity: orgUrn,
    'timeIntervals.timeGranularityType': 'DAY',
    'timeIntervals.timeRange.start': startMs,
    'timeIntervals.timeRange.end': endMs,
  });

  const elements = data.elements || [];
  const dailyGrowth = {};

  for (const el of elements) {
    if (el.timeRange?.start) {
      const dateStr = new Date(el.timeRange.start).toISOString().split('T')[0];
      const organic = el.followerGains?.organicFollowerGain || 0;
      const paid    = el.followerGains?.paidFollowerGain || 0;
      dailyGrowth[dateStr] = organic + paid;
    }
  }

  console.log(`Follower growth data for ${Object.keys(dailyGrowth).length} days.`);
  return dailyGrowth;
}

async function fetchShareStats(startMs, endMs) {
  console.log('Fetching share statistics (impressions, clicks, engagement)...');
  const orgUrn = `urn:li:organization:${LINKEDIN_ORG_ID}`;

  const data = await liGet('/organizationalEntityShareStatistics', {
    q: 'organizationalEntity',
    organizationalEntity: orgUrn,
    'timeIntervals.timeGranularityType': 'DAY',
    'timeIntervals.timeRange.start': startMs,
    'timeIntervals.timeRange.end': endMs,
  });

  const elements = data.elements || [];
  const dailyStats = [];

  for (const el of elements) {
    if (!el.timeRange?.start) continue;
    const dateStr = new Date(el.timeRange.start).toISOString().split('T')[0];
    const s = el.totalShareStatistics || {};

    dailyStats.push({
      date: dateStr,
      impressions:  s.impressionCount  || 0,
      clicks:       s.clickCount       || 0,
      likes:        s.likeCount        || 0,
      comments:     s.commentCount     || 0,
      shares:       s.shareCount       || 0,
      engagement:   s.engagement       || 0,
    });
  }

  console.log(`Share statistics for ${dailyStats.length} days.`);
  return dailyStats;
}

async function fetchTopPosts(startDate, endDate) {
  console.log('Fetching organization posts...');
  const orgUrn = `urn:li:organization:${LINKEDIN_ORG_ID}`;

  let posts = [];
  let start = 0;
  const count = 50;

  while (true) {
    let data;
    try {
      data = await liGet('/posts', {
        q: 'author',
        author: orgUrn,
        count,
        start,
        sortBy: 'LAST_MODIFIED',
      });
    } catch (err) {
      console.log(`Posts fetch error: ${err.message}`);
      break;
    }

    const elements = data.elements || [];
    if (elements.length === 0) break;

    for (const post of elements) {
      const created = post.createdAt
        ? new Date(post.createdAt).toISOString().split('T')[0]
        : null;

      if (created && created >= startDate && created <= endDate) {
        posts.push(post);
      }

      if (created && created < startDate) {
        start = Infinity;
        break;
      }
    }

    if (start === Infinity) break;
    start += count;
    if (elements.length < count) break;
    await sleep(300);
  }

  console.log(`Found ${posts.length} posts in date range.`);
  if (posts.length === 0) return [];

  const postsWithStats = [];
  for (const post of posts) {
    const postUrn = post.id || post.urn;
    if (!postUrn) continue;

    try {
      const statsData = await liGet('/organizationalEntityShareStatistics', {
        q: 'organizationalEntity',
        organizationalEntity: orgUrn,
        shares: `List(${postUrn})`,
      });

      const el = statsData.elements?.[0];
      const s = el?.totalShareStatistics || {};

      postsWithStats.push({
        postUrn,
        text: (post.commentary || post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '').substring(0, 500),
        impressions: s.impressionCount || 0,
        clicks:      s.clickCount      || 0,
        likes:       s.likeCount       || 0,
        comments:    s.commentCount    || 0,
      });
    } catch (err) {
      console.log(`Could not fetch stats for post ${postUrn}: ${err.message}`);
    }
    await sleep(300);
  }

  postsWithStats.sort((a, b) => b.impressions - a.impressions);
  return postsWithStats.slice(0, 5).map((p, i) => ({ ...p, rank: i + 1 }));
}

async function saveToMySQL(dailyStats, followerGrowth, totalFollowers, topPosts, monthKey) {
  const db = await connectDB();
  const statsTable  = monthTable('linkedin_stats', monthKey);
  const totalsTable = monthTable('linkedin_totals', monthKey);
  const postsTable  = monthTable('linkedin_top_posts', monthKey);
  const today = new Date().toISOString().split('T')[0];

  try {
    await ensureLinkedInTablesExist(db, monthKey);

    if (dailyStats.length > 0) {
      let currentFollowers = totalFollowers;
      const reverseDays = [...dailyStats].sort((a, b) => b.date.localeCompare(a.date));

      for (const d of reverseDays) {
        d.follower_count = currentFollowers;
        const gained = followerGrowth[d.date] || 0;
        d.follower_gained = gained;
        currentFollowers -= gained;
      }

      const query = `
        INSERT INTO \`${statsTable}\`
          (date, impressions, clicks, likes, comments, shares, engagement_rate, follower_count, follower_gained)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          impressions=VALUES(impressions), clicks=VALUES(clicks),
          likes=VALUES(likes), comments=VALUES(comments), shares=VALUES(shares),
          engagement_rate=VALUES(engagement_rate),
          follower_count=VALUES(follower_count), follower_gained=VALUES(follower_gained)
      `;

      const values = dailyStats
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(d => [
          d.date,
          d.impressions,
          d.clicks,
          d.likes,
          d.comments,
          d.shares,
          Math.round((d.engagement || 0) * 10000) / 100,
          d.follower_count || totalFollowers,
          d.follower_gained || 0,
        ]);

      await db.query(query, [values]);
      console.log(`Saved ${values.length} daily stat rows to ${statsTable}.`);
    }

    await db.query(`TRUNCATE TABLE \`${totalsTable}\``);

    await db.query(`
      INSERT INTO \`${totalsTable}\` (date, total_followers)
      VALUES (?, ?)
    `, [today, totalFollowers]);
    console.log(`Totals saved to ${totalsTable}.`);

    if (topPosts.length > 0) {
      const postsQuery = `
        INSERT INTO \`${postsTable}\`
          (post_urn, text, impressions, clicks, likes, comments, rank_position)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          text=VALUES(text), impressions=VALUES(impressions), clicks=VALUES(clicks),
          likes=VALUES(likes), comments=VALUES(comments), rank_position=VALUES(rank_position)
      `;
      const postValues = topPosts.map(p => [
        p.postUrn, p.text, p.impressions, p.clicks, p.likes, p.comments, p.rank,
      ]);
      await db.query(postsQuery, [postValues]);
      console.log(`Saved ${topPosts.length} top posts to ${postsTable}.`);
    }

    console.log('LinkedIn data successfully saved to MySQL.');
  } finally {
    await db.end();
  }
}

async function run() {
  try {
    console.log('Starting LinkedIn fetch...');

    await tryRefreshToken();

    const now = new Date();
    const year     = now.getFullYear();
    const monthNum = now.getMonth();
    const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;

    const startOfMonth = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const today        = now.toISOString().split('T')[0];

    const startMs = new Date(startOfMonth + 'T00:00:00Z').getTime();
    const endMs   = new Date(today + 'T23:59:59Z').getTime();

    const totalFollowers = await fetchFollowerCount();
    const dailyStats = await fetchShareStats(startMs, endMs);
    const followerGrowth = await fetchFollowerGrowth(startMs, endMs);
    const topPosts = await fetchTopPosts(startOfMonth, today);

    await saveToMySQL(dailyStats, followerGrowth, totalFollowers, topPosts, monthKey);

    console.log('LinkedIn fetch done.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

run();
