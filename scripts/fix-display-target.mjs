import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const conn = await createConnection(process.env.DATABASE_URL);

// fee_* は team、それ以外は common に設定
await conn.execute(
  `UPDATE spreadsheet_links SET displayTarget = 'team' WHERE linkKey IN ('fee_seishin_koriyama', 'fee_shintai', 'fee_tenri') AND (displayTarget IS NULL OR displayTarget != 'team')`
);

await conn.execute(
  `UPDATE spreadsheet_links SET displayTarget = 'common' WHERE linkKey NOT IN ('fee_seishin_koriyama', 'fee_shintai', 'fee_tenri') AND (displayTarget IS NULL OR displayTarget != 'common')`
);

const [rows] = await conn.execute(`SELECT linkKey, displayTarget, yearMonth FROM spreadsheet_links ORDER BY yearMonth DESC, linkKey`);
console.log("Updated records:");
console.table(rows);

await conn.end();
console.log("Done.");
