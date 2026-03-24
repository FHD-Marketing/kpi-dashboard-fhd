import 'dotenv/config';
import { google } from 'googleapis';
import mysql from 'mysql2/promise';

const oauth2Client = new google.auth.OAuth2(
    process.env.YT_CLIENT_ID,
    process.env.YT_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });

const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
const youtubeData = google.youtube({ version: 'v3', auth: oauth2Client });

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

async function ensureTablesExist(db, monthKey) {
  const statsTable = monthTable('stats', monthKey);
  const videosTable = monthTable('top_videos', monthKey);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${statsTable}\` (
      date DATE PRIMARY KEY,
      views INT DEFAULT 0,
      likes INT DEFAULT 0,
      subscribers_gained INT DEFAULT 0,
      watch_time_minutes INT DEFAULT 0,
      total_views BIGINT DEFAULT 0,
      total_subscribers INT DEFAULT 0,
      total_video_count INT DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${videosTable}\` (
      video_id VARCHAR(20) PRIMARY KEY,
      title VARCHAR(255),
      views INT DEFAULT 0,
      rank_position TINYINT DEFAULT 0
    )
  `);

  console.log(`Tables ${statsTable} and ${videosTable} verified/created.`);
}

async function fetchChannelTotals() {
  const response = await youtubeData.channels.list({
    part: 'statistics',
    mine: true,
  });

  const stats = response.data.items[0].statistics;
  return {
    totalViews: parseInt(stats.viewCount, 10),
    totalSubscribers: parseInt(stats.subscriberCount, 10),
    totalVideoCount: parseInt(stats.videoCount, 10),
  };
}

async function fetchChannelStats(startDate, endDate) {
  const response = await youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,likes,subscribersGained,estimatedMinutesWatched',
    dimensions: 'day',
  });

  if (!response.data.rows) return [];

  return response.data.rows.map(row => ({
    date: row[0],
    views: row[1],
    likes: row[2],
    subscribers_gained: row[3],
    watch_time_minutes: row[4],
  }));
}

async function fetchTopVideos(startDate, endDate) {
  const analyticsResponse = await youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views',
    dimensions: 'video',
    sort: '-views',
    maxResults: 5,
  });

  if (!analyticsResponse.data.rows) return [];

  const videoStats = analyticsResponse.data.rows;
  const videoIds = videoStats.map(row => row[0]);

  const dataResponse = await youtubeData.videos.list({
    id: videoIds.join(','),
    part: 'snippet',
  });

  const titles = {};
  dataResponse.data.items.forEach(item => {
    titles[item.id] = item.snippet.title;
  });

  return videoStats.map((row, index) => ({
    id: row[0],
    title: titles[row[0]] || 'Unknown Video',
    views: row[1],
    rank: index + 1,
  }));
}

async function saveToMySQL(channelData, monthKey, channelTotals, monthlyTopVideos) {
  const db = await connectDB();
  const statsTable = monthTable('stats', monthKey);
  const videosTable = monthTable('top_videos', monthKey);

  try {
    await ensureTablesExist(db, monthKey);

    if (channelData.length > 0) {
      const channelQuery = `
        INSERT INTO \`${statsTable}\` (date, views, likes, subscribers_gained, watch_time_minutes, total_views, total_subscribers, total_video_count)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        views=VALUES(views), likes=VALUES(likes),
        subscribers_gained=VALUES(subscribers_gained),
        watch_time_minutes=VALUES(watch_time_minutes),
        total_views=VALUES(total_views),
        total_subscribers=VALUES(total_subscribers),
        total_video_count=VALUES(total_video_count)
      `;
      const channelValues = channelData.map(d => [
        d.date, d.views, d.likes, d.subscribers_gained, d.watch_time_minutes,
        channelTotals.totalViews, channelTotals.totalSubscribers, channelTotals.totalVideoCount,
      ]);
      await db.query(channelQuery, [channelValues]);
      console.log(`${channelData.length} days saved to ${statsTable}.`);
    }

    if (monthlyTopVideos.length > 0) {
      const videoQuery = `
        INSERT INTO \`${videosTable}\` (video_id, title, views, rank_position)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        title=VALUES(title), views=VALUES(views), rank_position=VALUES(rank_position)
      `;
      const videoValues = monthlyTopVideos.map(v => [v.id, v.title, v.views, v.rank]);
      await db.query(videoQuery, [videoValues]);
      console.log(`${monthlyTopVideos.length} top videos saved to ${videosTable}.`);
    }
  } finally {
    await db.end();
  }
}

async function run() {
  try {
    console.log('Starting analytics fetch...');

    const now = new Date();
    const year = now.getFullYear();
    const monthNum = now.getMonth();
    const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;

    const startOfMonth = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().split('T')[0];

    console.log(`Fetching data for month ${monthKey} (${startOfMonth} to ${today})...`);

    const channelTotals = await fetchChannelTotals();
    console.log(`Channel totals: ${channelTotals.totalViews} views, ${channelTotals.totalSubscribers} subs, ${channelTotals.totalVideoCount} videos`);

    const channelData = await fetchChannelStats(startOfMonth, today);
    console.log(`Fetched ${channelData.length} daily records for ${monthKey}.`);

    const monthlyTopVideos = await fetchTopVideos(startOfMonth, today);
    console.log(`Fetched ${monthlyTopVideos.length} top videos for ${monthKey}.`);

    await saveToMySQL(channelData, monthKey, channelTotals, monthlyTopVideos);

    console.log('Done.');
  } catch (error) {
    console.error('Error during execution:', error.message);
    if (error.code) console.error('   Error code:', error.code);
    if (error.errno) console.error('   Errno:', error.errno);
    if (error.sqlState) console.error('   SQL State:', error.sqlState);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

run();