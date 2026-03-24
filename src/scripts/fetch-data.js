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

async function connectDB() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 30000,
  });
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
    watch_time_minutes: row[4]
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
    maxResults: 5 // Top 5
  });

  if (!analyticsResponse.data.rows) return [];

  const videoStats = analyticsResponse.data.rows;
  const videoIds = videoStats.map(row => row[0]);

  const dataResponse = await youtubeData.videos.list({
    id: videoIds.join(','),
    part: 'snippet'
  });

  const titles = {};
  dataResponse.data.items.forEach(item => {
    titles[item.id] = item.snippet.title;
  });

  return videoStats.map(row => ({
    id: row[0],
    title: titles[row[0]] || 'Unknown Video',
    views: row[1],
    date: endDate
  }));
}

async function saveToMySQL(channelData, topVideosData) {
  const db = await connectDB();

  try {
    if (channelData.length > 0) {
      const channelQuery = `
        INSERT INTO channel_stats (date, views, likes, subscribers_gained, watch_time_minutes) 
        VALUES ? 
        ON DUPLICATE KEY UPDATE 
        views=VALUES(views), likes=VALUES(likes), subscribers_gained=VALUES(subscribers_gained), watch_time_minutes=VALUES(watch_time_minutes)
      `;
      const channelValues = channelData.map(d => [d.date, d.views, d.likes, d.subscribers_gained, d.watch_time_minutes]);
      await db.query(channelQuery, [channelValues]);
      console.log(`✅ ${channelData.length} days saved to channel_stats.`);
    }

    if (topVideosData.length > 0) {
      const videoQuery = `
        INSERT INTO top_videos (id, title, views, last_updated) 
        VALUES ? 
        ON DUPLICATE KEY UPDATE 
        title=VALUES(title), views=VALUES(views), last_updated=VALUES(last_updated)
      `;
      const videoValues = topVideosData.map(v => [v.id, v.title, v.views, v.date]);
      await db.query(videoQuery, [videoValues]);
      console.log(`✅ ${topVideosData.length} top videos saved.`);
    }
  } finally {
    await db.end();
  }
}

async function run() {
  try {
    console.log('Starting analytics fetch...');
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

    const channelData = await fetchChannelStats(startDate, endDate);
    const topVideosData = await fetchTopVideos(startDate, endDate);

    await saveToMySQL(channelData, topVideosData);

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