import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const SPREADSHEET_ID = "1ddCCxHq78TlrqCAoU8k_w91m2HeC6vivzXqI8nhxqLE";
const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1ddCCxHq78TlrqCAoU8k_w91m2HeC6vivzXqI8nhxqLE/edit?gid=0#gid=0";
const LABEL = "業務改善意見箱";

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    // 既存レコード確認
    const [rows] = await connection.execute("SELECT id FROM improvement_spreadsheets LIMIT 1");
    if (rows.length > 0) {
      // 更新
      await connection.execute(
        "UPDATE improvement_spreadsheets SET spreadsheetId=?, spreadsheetUrl=?, label=?, updatedAt=NOW() WHERE id=?",
        [SPREADSHEET_ID, SPREADSHEET_URL, LABEL, rows[0].id]
      );
      console.log("✅ 更新完了 (id=" + rows[0].id + ")");
    } else {
      // 新規挿入
      await connection.execute(
        "INSERT INTO improvement_spreadsheets (spreadsheetId, spreadsheetUrl, label, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())",
        [SPREADSHEET_ID, SPREADSHEET_URL, LABEL]
      );
      console.log("✅ 新規登録完了");
    }
    // 確認
    const [check] = await connection.execute("SELECT * FROM improvement_spreadsheets LIMIT 1");
    console.log("登録内容:", check[0]);
  } finally {
    await connection.end();
  }
}

main().catch(e => { console.error("❌ エラー:", e.message); process.exit(1); });
