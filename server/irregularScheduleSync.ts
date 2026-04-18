/**
 * イレギュラー予定管理 ↔ Googleスプレッドシート同期モジュール
 * スプレッドシートID: 1aTon2VyzZ7t33rv36khhr3G1QipDRhZp-VKbx573S-0
 * シート名: イレギュラー予定一覧
 */
import { google } from "googleapis";
import { getIrregularSchedule, listIrregularSchedules, markIrregularScheduleSynced } from "./db";
import type { IrregularSchedule } from "../drizzle/schema";

const SPREADSHEET_ID = "1aTon2VyzZ7t33rv36khhr3G1QipDRhZp-VKbx573S-0";
const SHEET_NAME = "イレギュラー予定一覧";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/**
 * DBレコードをスプレッドシートの行配列に変換する
 */
function recordToRow(record: IrregularSchedule): string[] {
  return [
    record.patientName,
    record.team,
    record.scheduleType,
    record.startDate,
    record.endDate ?? "",
    record.startTime ?? "",
    record.endTime ?? "",
    record.facilityName ?? "",
    record.actionRequired ?? "",
    record.postDischargeEndDate ?? "",
    record.notes ?? "",
  ];
}

/**
 * スプレッドシートの現在のデータ行数を取得する
 * @returns 最後のデータ行番号（1-indexed）
 */
async function getSheetLastRow(sheets: ReturnType<typeof google.sheets>): Promise<number> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  });
  const values = res.data.values ?? [];
  return Math.max(values.length, 2); // 最低2行（タイトル+ヘッダー）
}

/**
 * 1件のイレギュラー予定をスプレッドシートに追記（または更新）する
 */
export async function syncIrregularScheduleToSheet(id: number): Promise<void> {
  const record = await getIrregularSchedule(id);
  if (!record || record.deletedAt) return;

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const row = recordToRow(record);

  if (record.syncedToSheet && record.sheetRowIndex && record.sheetRowIndex >= 3) {
    // 既存行を更新
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${record.sheetRowIndex}:K${record.sheetRowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
  } else {
    // 新規行を追記
    const lastRow = await getSheetLastRow(sheets);
    const newRowIndex = lastRow + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${newRowIndex}:K${newRowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    await markIrregularScheduleSynced(id, newRowIndex);
  }
}

/**
 * DBの全件をスプレッドシートに書き出す（管理者用・全件再同期）
 */
export async function syncAllFromSheet(): Promise<{ synced: number; errors: string[] }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const dbRecords = await listIrregularSchedules({});
  const errors: string[] = [];
  let synced = 0;

  if (dbRecords.length > 0) {
    const allRows = dbRecords.map(r => recordToRow(r));
    // 3行目以降をクリアしてから書き直す
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A3:K`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A3:K${2 + allRows.length}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: allRows },
    });

    for (let i = 0; i < dbRecords.length; i++) {
      try {
        await markIrregularScheduleSynced(dbRecords[i].id, i + 3);
        synced++;
      } catch (e) {
        errors.push(`ID ${dbRecords[i].id}: ${String(e)}`);
      }
    }
  }

  return { synced, errors };
}
