/**
 * 次回訪問日時スプレッドシートの状態を診断する（Google SA 認証のみ）
 *
 * 使い方:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... node scripts/check-next-visit-sheet.mjs
 */
import { google } from "googleapis";

const SPREADSHEET_ID = "1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo";
const TEAM_TABS = ["身体", "天理", "郡山北部", "郡山南部", "その他", "シート1"];

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
if (!email || !privateKey) {
  console.error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が必要です");
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
const existingTabs = meta.data.sheets?.map(s => s.properties?.title).filter(Boolean) ?? [];
console.log("存在するタブ:", existingTabs.join(" / "));

function parseJstDate(str) {
  if (!str) return null;
  const s = String(str).replace(/（時間未定）/g, "").trim();
  const m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}:00+09:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

for (const tab of TEAM_TABS) {
  if (!existingTabs.includes(tab)) {
    console.log(`\n=== ${tab} === (タブなし)`);
    continue;
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:I`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = res.data.values ?? [];
  const dataRows = rows.slice(1).filter(r => r.some(c => String(c ?? "").trim()));
  console.log(`\n=== ${tab} === データ行: ${dataRows.length} 件`);

  if (dataRows.length === 0) continue;

  const last5 = dataRows.slice(-5);
  console.log("末尾5行:");
  for (const r of last5) {
    console.log(`  転送=${r[0] ?? ""} | 担当=${r[1] ?? ""} | 次回=${r[4] ?? ""} | 利用者=${r[3] ?? ""}`);
  }

  const transferDates = dataRows.map(r => parseJstDate(r[0])).filter(Boolean);
  const nextVisitDates = dataRows.map(r => parseJstDate(r[4])).filter(Boolean);
  if (transferDates.length) {
    const maxTransfer = new Date(Math.max(...transferDates.map(d => d.getTime())));
    console.log(`  最新転送日時: ${maxTransfer.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);
  }
  if (nextVisitDates.length) {
    const future = nextVisitDates.filter(d => d >= new Date("2026-07-06T00:00:00+09:00"));
    console.log(`  7/6以降の次回訪問: ${future.length} 件`);
    for (const d of future.slice(0, 5)) {
      console.log(`    - ${d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);
    }
  }

  // 列ずれ検出: A列が転送日時でない行
  const misaligned = dataRows.filter(r => r[0] && !String(r[0]).match(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/));
  if (misaligned.length) {
    console.log(`  ⚠ A列が日時でない行: ${misaligned.length} 件（列ずれの可能性）`);
    for (const r of misaligned.slice(0, 3)) {
      console.log(`    A=${JSON.stringify(r[0])} B=${JSON.stringify(r[1])}`);
    }
  }
}
