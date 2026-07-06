// 次回訪問日時：DBとスプレッドシートの状態を診断
import fs from "fs";

const BASE = process.env.HINATA_BASE_URL ?? "https://hinata.kokoronohinata.com";
const ENDPOINT = `${BASE}/api/trpc/importData.diagnoseNextVisitSheet`;

const secret = process.env.IMPORT_API_SECRET;
if (!secret) throw new Error("IMPORT_API_SECRET 未設定");

const sinceArg = process.argv.find(a => a.startsWith("--since="));
const payload = {
  secret,
  ...(sinceArg ? { since: sinceArg.split("=")[1] } : {}),
};

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: payload }),
});

const raw = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}:`, raw.split(secret).join("***"));
  process.exit(1);
}

const out = JSON.parse(raw)?.result?.data?.json ?? JSON.parse(raw)?.result?.data ?? JSON.parse(raw);

console.log("========== DB（7/4以降・次回訪問日時あり） ==========");
console.log("  総件数       :", out.db?.totalWithNextVisit);
console.log("  転送済み     :", out.db?.exportedCount);
console.log("  未転送       :", out.db?.unexportedCount);
console.log("  7/6以降の次回:", out.db?.nextVisitOnOrAfterCutoff);
console.log("  チーム別     :", JSON.stringify(out.db?.byTeam, null, 2));

console.log("\n========== スプレッドシート各タブ ==========");
for (const t of out.sheet?.tabs ?? []) {
  console.log(`\n[${t.tabName}] ${t.exists ? "" : "(なし)"}`);
  if (!t.exists) continue;
  console.log("  データ行     :", t.dataRowCount);
  console.log("  最新転送日時 :", t.lastTransferAt);
  console.log("  7/6以降の次回:", t.nextVisitOnOrAfterCutoff);
  if (t.misalignedRowCount) console.log("  ⚠ 列ずれ疑い  :", t.misalignedRowCount, "行");
  if (t.tailRows?.length) {
    console.log("  末尾3行:");
    for (const r of t.tailRows) console.log(`    転送=${r[0]} | 担当=${r[1]} | 利用者=${r[2]} | 次回=${r[3]}`);
  }
}

console.log("\n========== 所見 ==========");
console.log(out.analysis?.note);
console.log("未転送(DB):", out.analysis?.unexportedInDb);

if (out.db?.recentRecords?.length) {
  console.log("\n--- DB直近15件 ---");
  for (const r of out.db.recentRecords) {
    console.log(`#${r.id} ${r.team} ${r.patientName} | 作成=${r.createdAt} | 次回=${r.nextVisitAt} | 転送=${r.exportedAt ?? "未"}`);
  }
}

fs.writeFileSync("/tmp/diagnose_next_visit.json", JSON.stringify(out, null, 2));
console.log("\n(詳細: /tmp/diagnose_next_visit.json)");
