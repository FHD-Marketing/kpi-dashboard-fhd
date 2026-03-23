import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
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

interface AnalyticsData {
  date: string;
  views: number;
  likes: number;
  subscribers_gained: number;
}

async function fetchYouTubeAnalytics(): Promise<AnalyticsData | null> {
  try {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const response = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,likes,subscribersGained',
      dimensions: 'day',
    });

    if (response.data.rows && response.data.rows.length > 0) {
      const row = response.data.rows[0];
      return {
        date: row[0] as string,
        views: row[1] as number,
        likes: row[2] as number,
        subscribers_gained: row[3] as number,
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch YouTube data:', (error as Error).message);
    throw error;
  }
}

async function saveToSupabase(data: AnalyticsData): Promise<void> {
  const { error } = await supabase
    .from('youtube_stats')
    .insert([data]);

  if (error) {
    console.error('Failed to save to Supabase:', error.message);
    return;
  }
  console.log('Data saved to Supabase successfully.');
}

async function run(): Promise<void> {
  console.log('Starting analytics fetch...');
  const analyticsData = await fetchYouTubeAnalytics();

  if (analyticsData) {
    console.log('Data found:', analyticsData);
    await saveToSupabase(analyticsData);
  } else {
    console.log('No data found for this period.');
  }
}

run();
