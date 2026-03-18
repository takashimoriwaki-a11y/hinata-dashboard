/**
 * Manusデータベースのデータをエクスポートするスクリプト
 * Railway移行用
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// テーブル一覧（エクスポート対象）
const TABLES = [
  'users',
  'staff',
  'patients',
  'tasks',
  'messages',
  'message_reactions',
  'schedule_screenshots',
  'screenshot_upload_logs',
  'my_links',
  'spreadsheet_links',
  'minutes',
  'minute_reads',
  'app_notifications',
  'push_subscriptions',
  'team_tools',
];

async function exportData() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  const exportData = {};
  
  for (const table of TABLES) {
    try {
      const [rows] = await connection.execute(`SELECT * FROM \`${table}\``);
      exportData[table] = rows;
      console.log(`✓ ${table}: ${rows.length} rows`);
    } catch (err) {
      console.warn(`⚠ ${table}: ${err.message}`);
      exportData[table] = [];
    }
  }
  
  await connection.end();
  
  const outputPath = path.join(process.cwd(), 'db-export.json');
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`\nExport complete: ${outputPath}`);
  
  // 統計
  const total = Object.values(exportData).reduce((sum, rows) => sum + rows.length, 0);
  console.log(`Total rows: ${total}`);
}

exportData().catch(console.error);
