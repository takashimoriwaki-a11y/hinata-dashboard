import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS schedule_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    screenshotId INT NOT NULL,
    content TEXT NOT NULL,
    updatedBy INT NOT NULL,
    updatedByName VARCHAR(100) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP
  )
`);

console.log("schedule_notes table created (or already exists)");
await conn.end();
