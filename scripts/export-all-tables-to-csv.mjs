/**
 * TiDB / Railway MySQL から全テーブルをCSVにエクスポートする
 *
 * Week 2 後半での「差分同期（本番稼働中のTiDB→Railwayへの最新データコピー）」や、
 * 運用開始後の定期バックアップに使用する。
 *
 * 使用方法:
 *   DATABASE_URL="mysql://user:pass@host:port/dbname" \
 *   OUTPUT_DIR="./db-export/csv" \
 *   node scripts/export-all-tables-to-csv.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
const OUTPUT_DIR = process.env.OUTPUT_DIR || './db-export/csv';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL が設定されていません');
  process.exit(1);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * CSV 1フィールドの形式に整える（ダブルクオート・改行・カンマを安全に）
 */
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  let s;
  if (val instanceof Date) {
    s = val.toISOString();
  } else if (typeof val === 'object') {
    s = JSON.stringify(val);
  } else {
    s = String(val);
  }
  // ダブルクオート・カンマ・改行を含む場合はクォートする
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsvLine(columns, row) {
  return columns.map(col => csvEscape(row[col])).join(',');
}

async function exportAll() {
  console.log(`🔌 データベースに接続中...`);
  const connection = await mysql.createConnection(DATABASE_URL);
  console.log(`✓ 接続成功\n`);

  // 全テーブル一覧を取得
  const [tablesResult] = await connection.query('SHOW TABLES');
  const tables = tablesResult.map(t => Object.values(t)[0]).sort();
  console.log(`📋 ${tables.length} テーブルを検出\n`);

  let totalRows = 0;
  for (const table of tables) {
    try {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      if (rows.length === 0) {
        // 空でもヘッダーを書き出す（列名取得のため）
        const [cols] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
        const columnNames = cols.map(c => c.Field);
        fs.writeFileSync(
          path.join(OUTPUT_DIR, `${table}.csv`),
          columnNames.join(',') + '\n',
          'utf-8'
        );
        console.log(`⏭  ${table.padEnd(30)}: 0 件（空CSV作成）`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const lines = [columns.join(',')];
      for (const row of rows) {
        lines.push(rowToCsvLine(columns, row));
      }
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${table}.csv`),
        lines.join('\n') + '\n',
        'utf-8'
      );
      console.log(`✓  ${table.padEnd(30)}: ${rows.length.toString().padStart(5)} 件`);
      totalRows += rows.length;
    } catch (err) {
      console.warn(`❌ ${table.padEnd(30)}: ${err.message}`);
    }
  }

  await connection.end();
  console.log(`\n📊 エクスポート完了`);
  console.log(`   合計件数: ${totalRows.toLocaleString()}`);
  console.log(`   出力先: ${OUTPUT_DIR}`);
}

exportAll().catch(err => {
  console.error('❌ エクスポート失敗:', err);
  process.exit(1);
});
