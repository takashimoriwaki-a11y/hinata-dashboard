/**
 * TiDB からエクスポートしたCSVファイル群を Railway MySQL にインポートする
 *
 * 前提:
 *   1. `pnpm db:push` でスキーマが作成済みの Railway MySQL
 *   2. db-export/csv/ フォルダに全39テーブルのCSVが存在
 *
 * 使用方法:
 *   DATABASE_URL="mysql://user:pass@host:port/dbname" \
 *   CSV_DIR="./db-export/csv" \
 *   node scripts/import-csvs-to-mysql.mjs
 *
 * 特徴:
 *   - 外部キー制約を一時無効化してから全テーブルを投入
 *   - テーブルごとにバッチ投入（既定50件/バッチ）
 *   - 既存データは DELETE FROM で初期化してから投入（冪等性確保）
 *   - CSVの型を推測（ISO日時文字列→MySQL datetime、null/空文字判定）
 *   - Base64画像など大きなカラムにも対応（LONGTEXT）
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
const CSV_DIR = process.env.CSV_DIR || './db-export/csv';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL が設定されていません');
  console.error('   例: DATABASE_URL="mysql://..." node scripts/import-csvs-to-mysql.mjs');
  process.exit(1);
}

if (!fs.existsSync(CSV_DIR)) {
  console.error(`❌ CSVフォルダが存在しません: ${CSV_DIR}`);
  console.error('   CSV_DIR 環境変数でCSVフォルダのパスを指定してください');
  process.exit(1);
}

// テーブルのインポート順序（外部キー依存関係を考慮）
// FOREIGN_KEY_CHECKS=0 のため厳密な順序は不要だが、プライマリ→依存の順で可読性を保つ
const IMPORT_ORDER = [
  'users',
  'patients',
  'tasks',
  'personal_tasks',
  'messages',
  'message_reactions',
  'minutes',
  'minutes_checks',
  'monthly_signatures',
  'my_links',
  'quick_access_links',
  'spreadsheet_links',
  'shared_prompts',
  'team_goals',
  'team_tools',
  'tool_audit_logs',
  'schedule_screenshots',
  'schedule_notes',
  'schedule_comments',
  'schedule_comment_reactions',
  'schedule_changes',
  'screenshot_upload_logs',
  'visitSlotOrders',
  'visit_records',
  'voice_feedback',
  'attendance_logs',
  'overtime_approvals',
  'timesheet_spreadsheets',
  'alcohol_checks',
  'alcohol_check_spreadsheets',
  'alcohol_detector_settings',
  'improvement_suggestions',
  'improvement_spreadsheets',
  'accident_links',
  'app_notifications',
  'app_settings',
  'irregular_schedules',
  'push_subscriptions',
  '__drizzle_migrations',
];

/**
 * CSVをパースする（シンプルな実装、ダブルクオート囲み対応）
 */
function parseCSV(content) {
  // UTF-8 BOM (\uFEFF) を除去
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (ch === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (ch === '\r') {
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * CSV の値を型推論してMySQLに投入できる形にする
 */
function normalizeValue(val) {
  if (val === '' || val === null || val === undefined) return null;
  // "NULL"文字列は実際のNULLとして扱う（Pythonのcsv.writer由来）
  if (val === 'NULL') return null;
  // ISO 8601 日時文字列 → MySQLのdatetime形式へ
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    return val.slice(0, 19).replace('T', ' ');
  }
  return val;
}

async function importData() {
  console.log(`🔌 Railway MySQL に接続中...`);
  const connection = await mysql.createConnection(DATABASE_URL + (DATABASE_URL.includes('?') ? '&' : '?') + 'multipleStatements=true');
  console.log(`✓ 接続成功\n`);

  console.log(`📁 CSVフォルダ: ${CSV_DIR}\n`);

  // 外部キー制約を無効化
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  console.log(`🔓 外部キー制約を一時無効化\n`);

  let totalRows = 0;
  let totalErrors = 0;
  const BATCH_SIZE = 50;

  for (const table of IMPORT_ORDER) {
    const csvPath = path.join(CSV_DIR, `${table}.csv`);
    if (!fs.existsSync(csvPath)) {
      console.log(`⏭  ${table.padEnd(30)}: CSVファイルなし`);
      continue;
    }

    try {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const rows = parseCSV(csvContent);
      if (rows.length === 0) {
        console.log(`⏭  ${table.padEnd(30)}: 空のCSV`);
        continue;
      }

      const [header, ...dataRows] = rows;
      // 末尾の空行を除外
      const cleanRows = dataRows.filter(r => r.length > 0 && !(r.length === 1 && r[0] === ''));

      if (cleanRows.length === 0) {
        console.log(`⏭  ${table.padEnd(30)}: データ行なし`);
        continue;
      }

      // 既存データをクリア
      await connection.query(`DELETE FROM \`${table}\``);

      const columnList = header.map(c => `\`${c}\``).join(', ');
      const placeholders = `(${header.map(() => '?').join(', ')})`;

      let insertCount = 0;
      for (let i = 0; i < cleanRows.length; i += BATCH_SIZE) {
        const batch = cleanRows.slice(i, i + BATCH_SIZE);
        const values = batch.flatMap(row => header.map((_, idx) => normalizeValue(row[idx])));
        const sql = `INSERT INTO \`${table}\` (${columnList}) VALUES ${batch.map(() => placeholders).join(', ')}`;

        try {
          await connection.query(sql, values);
          insertCount += batch.length;
        } catch (batchErr) {
          console.warn(`   ⚠  バッチ失敗 (行 ${i}〜${i + batch.length - 1}): ${batchErr.message}`);
          totalErrors++;
        }
      }

      console.log(`✓  ${table.padEnd(30)}: ${insertCount.toString().padStart(5)} 件`);
      totalRows += insertCount;
    } catch (err) {
      console.warn(`❌ ${table.padEnd(30)}: ${err.message}`);
      totalErrors++;
    }
  }

  // 外部キー制約を戻す
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  console.log(`\n🔒 外部キー制約を再有効化`);

  await connection.end();

  console.log(`\n📊 インポート完了`);
  console.log(`   合計件数: ${totalRows.toLocaleString()}`);
  console.log(`   エラー数: ${totalErrors}`);
  if (totalErrors > 0) {
    console.log(`\n⚠  エラーがありました。上記のログを確認してください。`);
    process.exit(1);
  }
}

importData().catch(err => {
  console.error('❌ インポート失敗:', err);
  process.exit(1);
});
