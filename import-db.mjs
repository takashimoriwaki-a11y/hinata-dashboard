/**
 * エクスポートしたデータをRailwayのMySQLにインポートするスクリプト
 * 
 * 使用方法:
 * RAILWAY_DATABASE_URL="mysql://user:pass@host:3306/dbname" node import-db.mjs
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('RAILWAY_DATABASE_URL または DATABASE_URL を設定してください');
  process.exit(1);
}

const exportPath = path.join(process.cwd(), 'db-export.json');
if (!fs.existsSync(exportPath)) {
  console.error('db-export.json が見つかりません。先に export-db.mjs を実行してください');
  process.exit(1);
}

const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

// テーブルのインポート順序（外部キー制約を考慮）
const IMPORT_ORDER = [
  'users',
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

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'number') return val.toString();
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "\\'")}'`;
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function importData() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  console.log('インポート開始...\n');
  
  for (const table of IMPORT_ORDER) {
    const rows = exportData[table];
    if (!rows || rows.length === 0) {
      console.log(`⏭ ${table}: スキップ（データなし）`);
      continue;
    }
    
    try {
      // 既存データをクリア
      await connection.execute(`DELETE FROM \`${table}\``);
      
      // バッチインサート
      const columns = Object.keys(rows[0]);
      const columnList = columns.map(c => `\`${c}\``).join(', ');
      
      let insertCount = 0;
      const BATCH_SIZE = 50;
      
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values = batch.map(row => 
          `(${columns.map(col => escapeValue(row[col])).join(', ')})`
        ).join(',\n');
        
        await connection.execute(`INSERT INTO \`${table}\` (${columnList}) VALUES ${values}`);
        insertCount += batch.length;
      }
      
      console.log(`✓ ${table}: ${insertCount} 件インポート`);
    } catch (err) {
      console.warn(`⚠ ${table}: ${err.message}`);
    }
  }
  
  await connection.end();
  console.log('\nインポート完了！');
}

importData().catch(console.error);
