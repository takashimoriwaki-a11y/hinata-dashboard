import { createConnection } from 'mysql2/promise';

// 環境変数からDATABASE_URLを取得
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

// mysql2用にURLをパース
const url = new URL(dbUrl);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false },
});

// 本日（JST）の範囲を計算
const now = new Date();
const jstOffset = 9 * 60 * 60 * 1000;
const jstNow = new Date(now.getTime() + jstOffset);
const todayStart = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()) - jstOffset);
const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

console.log(`本日の範囲: ${todayStart.toISOString()} 〜 ${todayEnd.toISOString()}`);

// 本日の打刻レコードを確認
const [rows] = await conn.execute(
  'SELECT id, type, userName, clockedAt, createdAt FROM attendance_logs WHERE clockedAt >= ? AND clockedAt < ? ORDER BY clockedAt ASC',
  [todayStart.getTime(), todayEnd.getTime()]
);

console.log('\n本日の打刻レコード:');
for (const r of rows) {
  const jstTime = new Date(Number(r.clockedAt) + jstOffset).toISOString().replace('T', ' ').slice(0, 19);
  console.log(`  id=${r.id}, type=${r.type}, userName=${r.userName}, clockedAt=${jstTime} JST`);
};

if (rows.length === 0) {
  console.log('削除対象のレコードがありません。');
  await conn.end();
  process.exit(0);
}

// 削除実行
const ids = rows.map(r => r.id);
const placeholders = ids.map(() => '?').join(',');
const [result] = await conn.execute(
  `DELETE FROM attendance_logs WHERE id IN (${placeholders})`,
  ids
);

console.log(`\n削除完了: ${result.affectedRows}件のレコードを削除しました。`);
await conn.end();
