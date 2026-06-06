/**
 * 直帰申請：スプレッドシート未転記分のバックフィル
 *
 * 本番 API（importData.backfillDirectReturnSheet）を呼び出します。
 * secret は process.env.IMPORT_API_SECRET から実行時に読むのみ。出力・保存しない。
 *
 * 使い方:
 *   # 確認のみ（デフォルト）
 *   IMPORT_API_SECRET=xxx node run_direct_return_backfill.mjs --year-month=2026-06
 *
 *   # 本実行
 *   IMPORT_API_SECRET=xxx node run_direct_return_backfill.mjs --year-month=2026-06 --execute
 */
const BASE = "https://hinata.kokoronohinata.com";
const ENDPOINT = `${BASE}/api/trpc/importData.backfillDirectReturnSheet`;

const args = process.argv.slice(2);
const yearMonth = args.find((a) => a.startsWith("--year-month="))?.split("=")[1] ?? "2026-06";
const execute = args.includes("--execute");

if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
  console.error(`--year-month の形式が不正です: ${yearMonth}（例: 2026-06）`);
  process.exit(1);
}

const secret = process.env.IMPORT_API_SECRET;
if (!secret) {
  console.error("IMPORT_API_SECRET が未設定です。中止します。");
  process.exit(1);
}

const payload = { secret, dryRun: !execute, yearMonth };

console.log("================ 直帰申請バックフィル ================");
console.log("yearMonth :", yearMonth);
console.log("mode      :", execute ? "EXECUTE（本実行）" : "DRY-RUN（確認のみ）");
console.log("endpoint  :", ENDPOINT);
console.log("");

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: payload }),
});

const text = await res.text();
if (!res.ok) {
  const safe = text.split(secret).join("***REDACTED***");
  console.error(`HTTP ${res.status}: ${safe}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  console.error("レスポンスをJSONとして解釈できませんでした:", text.slice(0, 500));
  process.exit(1);
}

const out = parsed?.result?.data?.json ?? parsed?.result?.data ?? parsed;

if (parsed?.error) {
  const errMsg = parsed.error?.json?.message ?? parsed.error?.message ?? JSON.stringify(parsed.error);
  console.error("APIエラー:", errMsg);
  process.exit(1);
}

console.log("dryRun        :", out.dryRun);
console.log("targetCount   :", out.targetCount);
console.log("spreadsheetId :", out.spreadsheetId);
if (out.spreadsheetId) {
  console.log("sheet URL     :", `https://docs.google.com/spreadsheets/d/${out.spreadsheetId}/edit`);
}
console.log("");

if (Array.isArray(out.targets) && out.targets.length > 0) {
  console.log("--- 対象申請 ---");
  for (const t of out.targets) {
    console.log(`  [#${t.id}] ${t.applicationDate} ${t.applicantName} / ${t.status} / ${t.reasonCategory}`);
  }
  console.log("");
}

if (execute) {
  console.log("successCount  :", out.successCount);
  console.log("failCount     :", out.failCount);
  if (Array.isArray(out.results) && out.results.length > 0) {
    console.log("--- 結果 ---");
    for (const r of out.results) {
      if (r.status === "success") {
        console.log(`  OK [#${r.id}] 行 ${r.sheetRowNumber}`);
      } else {
        console.log(`  NG [#${r.id}] ${r.error ?? "unknown"}`);
      }
    }
  }
  process.exit(out.failCount > 0 ? 1 : 0);
}

if (out.targetCount > 0) {
  console.log("DRY-RUN 完了。本実行する場合は --execute を付けて再実行してください。");
} else {
  console.log("未転記の申請はありません。");
}
