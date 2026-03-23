import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const oauth2Client = new google.auth.OAuth2(
  process.env.YT_CLIENT_ID,
  process.env.YT_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });

const youtubeAnalytics = google.youtubeAnalytics({
  version: 'v2',
  auth: oauth2Client,
});

async function fetchYouTubeAnalytics() {
  try {
    const timespanDays = 365;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - timespanDays * 86400000).toISOString().split('T')[0];

    const response = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,likes,subscribersGained',
      dimensions: 'day',
    });

    if (response.data.rows && response.data.rows.length > 0) {
      return response.data.rows.map(row => ({
        date: row[0],
        views: row[1],
        likes: row[2],
        subscribers_gained: row[3],
      }));
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch YouTube data:', error.message);
    throw error;
  }
}

async function saveToSupabase(rows) {
  const dates = rows.map(r => r.date);

  const { error: deleteError } = await supabase
    .from('youtube_stats')
    .delete()
    .in('date', dates);

  if (deleteError) {
    console.error('Failed to delete existing rows:', deleteError.message);
    return;
  }

  const { error: insertError } = await supabase
    .from('youtube_stats')
    .insert(rows);

  if (insertError) {
    console.error('Failed to save to Supabase:', insertError.message);
    return;
  }
  console.log(`Saved ${rows.length} row(s) to Supabase.`);
}

async function run() {
  console.log('Starting analytics fetch...');
  const analyticsData = await fetchYouTubeAnalytics();

  if (analyticsData) {
    console.log(`Found ${analyticsData.length} day(s) of data.`);
    await saveToSupabase(analyticsData);
  } else {
    console.log('No data found for this period.');
  }
}

run();

