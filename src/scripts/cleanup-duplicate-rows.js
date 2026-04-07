import 'dotenv/config';
import mysql from 'mysql2/promise';

async function connectDB() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 30000,
  });
}

async function cleanTable(db, table) {
  const [rows] = await db.query(`SELECT COUNT(*) as cnt, COUNT(DISTINCT date) as dates FROM \`${table}\``);
  const { cnt, dates } = rows[0];

  if (dates <= 1) {
    console.log(`  ${table}: ${cnt} row(s), ${dates} date(s) — OK`);
    return 0;
  }

  const [maxDateRows] = await db.query(`SELECT MAX(date) as maxDate FROM \`${table}\``);
  const maxDate = maxDateRows[0].maxDate;

  const [result] = await db.query(`DELETE FROM \`${table}\` WHERE date != ?`, [maxDate]);
  console.log(`  ${table}: deleted ${result.affectedRows} old rows (kept date=${maxDate})`);
  return result.affectedRows;
}

async function run() {
  const db = await connectDB();
  let totalDeleted = 0;

  try {
    const [tables] = await db.query(`SHOW TABLES`);
    const tableNames = tables.map(r => Object.values(r)[0]);

    // All table prefixes that store cumulative snapshots (not daily breakdowns)
    const snapshotPrefixes = [
      'meta_summary_',
      'meta_campaigns_',
      'google_summary_',
      'google_campaigns_',
      'mailchimp_summary_',
      'youtube_totals_',
      'instagram_totals_',
      'linkedin_totals_',
    ];

    for (const prefix of snapshotPrefixes) {
      const matching = tableNames.filter(t => t.startsWith(prefix));
      if (matching.length === 0) continue;

      console.log(`\n${prefix}* (${matching.length} table(s)):`);
      for (const table of matching) {
        totalDeleted += await cleanTable(db, table);
      }
    }

    console.log(`\nCleanup complete. ${totalDeleted} rows deleted total.`);
  } finally {
    await db.end();
  }
}

run().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
