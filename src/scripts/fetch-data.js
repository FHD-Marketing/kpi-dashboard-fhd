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
const youtubeReporting = google.youtubereporting({ version: 'v1', auth: oauth2Client });

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
  const totalsTable = monthTable('totals', monthKey);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${statsTable}\` (
                                                   date DATE PRIMARY KEY,
                                                   views INT DEFAULT 0,
                                                   likes INT DEFAULT 0,
                                                   subscribers_gained INT DEFAULT 0,
                                                   watch_time_minutes INT DEFAULT 0,
                                                   impressions INT DEFAULT 0,
                                                   ctr DECIMAL(5,2) DEFAULT 0.00
      )
  `);

  await db.query(`
    ALTER TABLE \`${statsTable}\`
      ADD COLUMN IF NOT EXISTS impressions INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ctr DECIMAL(5,2) DEFAULT 0.00
  `).catch(() => {});

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${totalsTable}\` (
                                                    date DATE PRIMARY KEY,
                                                    total_views BIGINT DEFAULT 0,
                                                    total_likes BIGINT DEFAULT 0,
                                                    total_subscribers INT DEFAULT 0,
                                                    total_video_count INT DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS \`${videosTable}\` (
                                                    video_id VARCHAR(20) PRIMARY KEY,
      title VARCHAR(255),
      views INT DEFAULT 0,
      likes INT DEFAULT 0,
      rank_position TINYINT DEFAULT 0
      )
  `);

  console.log(`Tables ${statsTable}, ${totalsTable} and ${videosTable} verified/created.`);
}

async function fetchChannelTotals() {
  const response = await youtubeData.channels.list({
    part: 'statistics',
    mine: true,
  });

  const stats = response.data.items[0].statistics;

  const analyticsResponse = await youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate: '2020-01-01',
    endDate: new Date().toISOString().split('T')[0],
    metrics: 'likes',
  });

  const totalLikes = analyticsResponse.data.rows?.[0]?.[0] || 0;

  return {
    totalViews: parseInt(stats.viewCount, 10),
    totalLikes,
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

  const dailyData = response.data.rows.map(row => ({
    date: row[0],
    views: row[1],
    likes: row[2],
    subscribers_gained: row[3],
    watch_time_minutes: row[4],
    impressions: 0,
    ctr: 0,
  }));

  const impressionsData = await fetchImpressionsFromReporting(startDate, endDate);
  if (impressionsData && Object.keys(impressionsData).length > 0) {
    dailyData.forEach(d => {
      if (impressionsData[d.date]) {
        d.impressions = impressionsData[d.date].impressions;
        d.ctr = impressionsData[d.date].ctr;
      }
    });
    console.log(`Impressions/CTR merged for ${Object.keys(impressionsData).length} days from Reporting API.`);
  } else {
    const avgCtr = await fetchAverageCtr(startDate, endDate);
    if (avgCtr !== null) {
      dailyData.forEach(d => { d.ctr = avgCtr; });
      console.log('Applied average CTR ' + avgCtr + '% to all days (Reporting API unavailable).');
    }
  }

  return dailyData;
}

async function fetchAverageCtr(startDate, endDate) {
  const metrics = [
    'cardImpressions,cardClicks',
    'annotationImpressions,annotationClicks',
  ];

  for (const m of metrics) {
    try {
      const response = await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: m,
      });
      if (response.data.rows && response.data.rows[0]) {
        const impressions = response.data.rows[0][0];
        const clicks = response.data.rows[0][1];
        if (impressions > 0) {
          return Math.round((clicks / impressions) * 10000) / 100;
        }
      }
    } catch (err) {
      console.log('CTR fallback with ' + m + ' failed: ' + err.message);
    }
  }

  return null;
}

async function findReportType() {
  const CANDIDATES = [
    'channel_basic_a2',
    'channel_basic_a1',
    'channel_combined_a2',
    'channel_combined_a1',
  ];

  try {
    const typesResponse = await youtubeReporting.reportTypes.list();
    const types = typesResponse.data.reportTypes || [];
    console.log('Available report types: ' + types.map(t => t.id).join(', '));

    for (const candidate of CANDIDATES) {
      if (types.find(t => t.id === candidate)) return candidate;
    }

    const channelType = types.find(t => t.id.startsWith('channel_'));
    if (channelType) return channelType.id;

    return null;
  } catch (err) {
    console.log('Could not list report types: ' + err.message);
    return CANDIDATES[0];
  }
}

async function fetchImpressionsFromReporting(startDate, endDate) {
  try {
    const reportType = await findReportType();
    if (!reportType) {
      console.log('No suitable report type found in Reporting API.');
      return null;
    }
    console.log('Using report type: ' + reportType);

    const jobsResponse = await youtubeReporting.jobs.list();
    const jobs = jobsResponse.data.jobs || [];
    console.log('Existing jobs: ' + jobs.map(j => j.reportTypeId + ' (' + j.id + ')').join(', '));
    let job = jobs.find(j => j.reportTypeId === reportType);

    if (!job) {
      console.log('Creating Reporting API job for ' + reportType + '...');
      try {
        const createResponse = await youtubeReporting.jobs.create({
          requestBody: {
            reportTypeId: reportType,
            name: 'KPI Dashboard',
          },
        });
        job = createResponse.data;
        console.log('Job created: ' + job.id + '. Reports will be available in 1-2 days.');
      } catch (createErr) {
        console.log('Job creation failed: ' + createErr.message);
        if (createErr.response?.data) console.log('Response: ' + JSON.stringify(createErr.response.data));
        if (createErr.errors) console.log('Details: ' + JSON.stringify(createErr.errors));
      }
      return null;
    }

    const reportsResponse = await youtubeReporting.jobs.reports.list({
      jobId: job.id,
    });
    const reports = reportsResponse.data.reports || [];
    console.log('Reports available: ' + reports.length);

    if (reports.length === 0) {
      console.log('No reports available yet. Reports are generated with 1-2 days delay.');
      return null;
    }

    const sortedReports = reports.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    console.log('Latest report: ' + sortedReports[0].startTime + ' to ' + sortedReports[0].endTime);

    const relevantReports = sortedReports.filter(r => {
      const rStart = r.startTime.split('T')[0];
      const rEnd = r.endTime.split('T')[0];
      return rStart >= startDate || rEnd >= startDate;
    });

    if (relevantReports.length === 0) {
      console.log('No reports overlap with date range ' + startDate + ' to ' + endDate);
      return null;
    }

    const impressionsMap = {};

    for (const report of relevantReports) {
      const csvData = await downloadReport(report.downloadUrl);
      if (!csvData) continue;

      const lines = csvData.split('\n');
      if (lines.length < 2) continue;

      const headers = lines[0].split(',').map(h => h.trim());
      console.log('Report CSV columns: ' + headers.join(', '));

      const dateIdx = headers.indexOf('date');
      let impIdx = headers.indexOf('impressions');
      if (impIdx === -1) impIdx = headers.indexOf('thumbnail_impressions');
      let ctrIdx = headers.indexOf('impressions_click_through_rate');
      if (ctrIdx === -1) ctrIdx = headers.indexOf('click_through_rate');
      const viewsIdx = headers.indexOf('views');

      if (dateIdx === -1) {
        console.log('Report CSV has no date column.');
        continue;
      }

      if (impIdx === -1) {
        console.log('Report CSV has no impressions column. Skipping CTR.');
        continue;
      }

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length <= dateIdx) continue;

        const date = cols[dateIdx];
        if (!date || date < startDate || date > endDate) continue;
        if (impressionsMap[date]) continue;

        const imp = parseInt(cols[impIdx], 10) || 0;
        let ctr = 0;
        if (ctrIdx !== -1) {
          ctr = Math.round(parseFloat(cols[ctrIdx]) * 10000) / 100;
        } else if (imp > 0 && viewsIdx !== -1) {
          const views = parseInt(cols[viewsIdx], 10) || 0;
          ctr = Math.round((views / imp) * 10000) / 100;
        }

        impressionsMap[date] = { impressions: imp, ctr };
      }
    }

    console.log('Impressions data parsed for ' + Object.keys(impressionsMap).length + ' days.');
    return impressionsMap;
  } catch (err) {
    console.log('Reporting API query failed: ' + err.message);
    return null;
  }
}

async function downloadReport(url) {
  try {
    const token = await oauth2Client.getAccessToken();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token.token}` },
    });
    if (!response.ok) {
      console.log('Report download failed: ' + response.status);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.log('Report download error: ' + err.message);
    return null;
  }
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
    part: 'snippet,statistics',
  });

  const videoInfo = {};
  dataResponse.data.items.forEach(item => {
    videoInfo[item.id] = {
      title: item.snippet.title,
      likes: parseInt(item.statistics.likeCount, 10) || 0,
    };
  });

  return videoStats.map((row, index) => ({
    id: row[0],
    title: videoInfo[row[0]]?.title || 'Unknown Video',
    views: row[1],
    likes: videoInfo[row[0]]?.likes || 0,
    rank: index + 1,
  }));
}

async function saveToMySQL(channelData, monthKey, channelTotals, monthlyTopVideos) {
  const db = await connectDB();
  const statsTable = monthTable('stats', monthKey);
  const totalsTable = monthTable('totals', monthKey);
  const videosTable = monthTable('top_videos', monthKey);
  const today = new Date().toISOString().split('T')[0];

  try {
    await ensureTablesExist(db, monthKey);

    if (channelData.length > 0) {
      const channelQuery = `
        INSERT INTO \`${statsTable}\` (date, views, likes, subscribers_gained, watch_time_minutes, impressions, ctr)
        VALUES ?
          ON DUPLICATE KEY UPDATE
                             views=VALUES(views), likes=VALUES(likes),
                             subscribers_gained=VALUES(subscribers_gained),
                             watch_time_minutes=VALUES(watch_time_minutes),
                             impressions=VALUES(impressions),
                             ctr=VALUES(ctr)
      `;
      const channelValues = channelData.map(d => [
        d.date, d.views, d.likes, d.subscribers_gained, d.watch_time_minutes, d.impressions, d.ctr,
      ]);
      await db.query(channelQuery, [channelValues]);
      console.log(`${channelData.length} days saved to ${statsTable}.`);
    }

    const totalsQuery = `
      INSERT INTO \`${totalsTable}\` (date, total_views, total_likes, total_subscribers, total_video_count)
      VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
                           total_views=VALUES(total_views), total_likes=VALUES(total_likes),
                           total_subscribers=VALUES(total_subscribers), total_video_count=VALUES(total_video_count)
    `;
    await db.query(totalsQuery, [
      today, channelTotals.totalViews, channelTotals.totalLikes,
      channelTotals.totalSubscribers, channelTotals.totalVideoCount,
    ]);
    console.log(`Totals saved to ${totalsTable} for ${today}.`);

    if (monthlyTopVideos.length > 0) {
      const videoQuery = `
        INSERT INTO \`${videosTable}\` (video_id, title, views, likes, rank_position)
        VALUES ?
          ON DUPLICATE KEY UPDATE
                             title=VALUES(title), views=VALUES(views), likes=VALUES(likes), rank_position=VALUES(rank_position)
      `;
      const videoValues = monthlyTopVideos.map(v => [v.id, v.title, v.views, v.likes, v.rank]);
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