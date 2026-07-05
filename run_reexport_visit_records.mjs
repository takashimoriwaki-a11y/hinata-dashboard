// 未転送の次回訪問日時を本番API経由で一括再転記
// secret は process.env.IMPORT_API_SECRET から実行時に読むのみ。出力・保存しない。
//
// 使い方:
//   IMPORT_API_SECRET=... node run_reexport_visit_records.mjs --dry-run
//   IMPORT_API_SECRET=... node run_reexport_visit_records.mjs
import fs from "fs";

const BASE = process.env.HINATA_BASE_URL ?? "https://hinata.kokoronohinata.com";
const ENDPOINT = `${BASE}/api/trpc/importData.reExportVisitRecords`;

const dryRun = process.argv.includes("--dry-run");
const sinceArg = process.argv.find(a => a.startsWith("--since="));
const since = sinceArg?.split("=")[1];

const secret = process.env.IMPORT_API_SECRET;
if (!secret) {
  throw new Error("IMPORT_API_SECRET 未設定");
}

const payload = { secret, dryRun, ...(since ? { since } : {}) };
console.log(`endpoint: ${ENDPOINT}`);
console.log(`dryRun: ${dryRun}${since ? ` / since: ${since}` : ""}`);

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: payload }),
});

const raw = await res.text();
if (!res.ok) {
  const safe = raw.split(secret).join("***REDACTED***");
  console.error(`HTTP ${res.status}: ${safe}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error("レスポンスをJSONとして解釈できませんでした:", raw.slice(0, 500));
  process.exit(1);
}

const out = parsed?.result?.data?.json ?? parsed?.result?.data ?? parsed;
console.log("================ 再転記 結果 ================");
console.log("dryRun       :", out.dryRun);
console.log("since        :", out.since);
console.log("total        :", out.total);
console.log("successCount :", out.successCount ?? 0);
console.log("failCount    :", out.failCount ?? 0);

if (out.dryRun && Array.isArray(out.records)) {
  console.log("\n--- 対象一覧 ---");
  for (const r of out.records) {
    console.log(`#${r.id} ${r.team} ${r.patientName} / next=${r.nextVisitAt}`);
  }
}

const failed = (out.results ?? []).filter(r => r.status === "failed");
if (failed.length > 0) {
  console.log(`\n--- failed (${failed.length}件) ---`);
  for (const r of failed) console.log(`  #${r.id} ${r.team} ${r.patientName}: ${r.error}`);
}

fs.writeFileSync("/tmp/reexport_visit_records_result.json", JSON.stringify(out, null, 2));
console.log("\n(詳細結果を /tmp/reexport_visit_records_result.json に保存)");

if ((out.failCount ?? 0) > 0) process.exit(1);
