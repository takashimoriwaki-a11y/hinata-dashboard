import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

try {
  // 既存データを確認
  const [rows] = await connection.execute(
    "SELECT * FROM alcohol_detector_settings"
  );
  console.log("Existing detectors:", rows);

  // 既に登録されているか確認
  const existing = rows.find(
    (r) => r.name === "Portable alcohol tester CSY-006"
  );
  if (existing) {
    console.log("Already exists:", existing);
  } else {
    // 挿入
    const [result] = await connection.execute(
      "INSERT INTO alcohol_detector_settings (name, modelNumber, manufacturer, isActive, sortOrder) VALUES (?, ?, ?, ?, ?)",
      ["Portable alcohol tester CSY-006", "CSY-006", null, 1, 0]
    );
    console.log("Inserted:", result);
  }
} finally {
  await connection.end();
}
