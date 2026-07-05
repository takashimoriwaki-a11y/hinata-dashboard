/**
 * 未転送の次回訪問日時をDBから探してスプレッドシートへ再転記する。
 *
 * 使い方（本番DB + Google認証情報が必要）:
 *   npx tsx scripts/reexport-visit-records.mts --dry-run
 *   npx tsx scripts/reexport-visit-records.mts
 *
 * オプション:
 *   --since=2026-07-04   対象開始日（JST、省略時 2026-07-04）
 *   --dry-run            対象件数のみ表示して終了
 */
import "dotenv/config";
import {
  getUnexportedVisitRecordsForSheetExport,
  markVisitRecordExported,
} from "../server/db.js";
import { exportVisitRecordToSheet } from "../server/visitRecordSheetExport.js";

function parseArgs() {
  const dryRun = process.argv.includes("--dry-run");
  const sinceArg = process.argv.find(a => a.startsWith("--since="));
  const sinceDateStr = sinceArg?.split("=")[1] ?? "2026-07-04";
  const since = new Date(`${sinceDateStr}T00:00:00+09:00`);
  return { dryRun, since, sinceDateStr };
}

async function main() {
  const { dryRun, since, sinceDateStr } = parseArgs();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL が未設定です");
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error("Google サービスアカウント設定が未設定です");
  }

  const records = await getUnexportedVisitRecordsForSheetExport(since);
  console.log(`対象: ${sinceDateStr} 00:00 JST 以降 / 未転送かつ次回訪問日時あり = ${records.length} 件`);

  if (records.length === 0) {
    console.log("再転記対象はありません。");
    return;
  }

  const teamCount: Record<string, number> = {};
  for (const r of records) {
    teamCount[r.team] = (teamCount[r.team] ?? 0) + 1;
  }
  console.log("チーム別:", teamCount);

  if (dryRun) {
    console.log("\n--- dry-run: 対象一覧 ---");
    for (const r of records) {
      console.log(
        `#${r.id} ${r.team} ${r.patientName} / 転送日時=${r.createdAt?.toISOString()} / 次回=${r.nextVisitAt?.toISOString()} / ${r.createdByName}`,
      );
    }
    return;
  }

  let success = 0;
  let failed = 0;
  for (const record of records) {
    try {
      await exportVisitRecordToSheet(record);
      await markVisitRecordExported(record.id);
      success += 1;
      console.log(`OK #${record.id} ${record.team} ${record.patientName}`);
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`NG #${record.id} ${record.team} ${record.patientName}: ${msg}`);
    }
  }

  console.log(`\n完了: 成功 ${success} 件 / 失敗 ${failed} 件`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
