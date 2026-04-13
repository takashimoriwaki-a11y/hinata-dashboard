import * as dotenv from "dotenv";
import { createConnection } from "mysql2/promise";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const url = new URL(DATABASE_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1iK46lv6sbEHsV4BgkeX6FEJRE-WRUCeqTgAM_vdqEig/edit?gid=1576215212#gid=1576215212";
const spreadsheetId = "1iK46lv6sbEHsV4BgkeX6FEJRE-WRUCeqTgAM_vdqEig";
const year = 2026;
const month = 4;
const label = "2026年4月 業務日報";

// 既存の登録を確認
const [existing] = await conn.execute(
  "SELECT id FROM timesheet_spreadsheets WHERE year = ? AND month = ?",
  [year, month]
);

if (existing.length > 0) {
  console.log(`2026年4月のスプレッドシートは既に登録されています（ID: ${existing[0].id}）`);
  // 上書き更新
  await conn.execute(
    "UPDATE timesheet_spreadsheets SET label = ?, spreadsheetId = ?, spreadsheetUrl = ? WHERE year = ? AND month = ?",
    [label, spreadsheetId, spreadsheetUrl, year, month]
  );
  console.log("URLを更新しました。");
} else {
  await conn.execute(
    "INSERT INTO timesheet_spreadsheets (year, month, label, spreadsheetId, spreadsheetUrl, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
    [year, month, label, spreadsheetId, spreadsheetUrl]
  );
  console.log("2026年4月の業務日報スプレッドシートを登録しました。");
}

// 登録内容を確認
const [rows] = await conn.execute(
  "SELECT * FROM timesheet_spreadsheets WHERE year = ? AND month = ?",
  [year, month]
);
console.log("登録内容:", JSON.stringify(rows, null, 2));

await conn.end();
