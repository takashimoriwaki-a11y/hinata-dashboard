import { google } from "googleapis";
import { getTimesheetSpreadsheets, upsertTimesheetSpreadsheet } from "./db";

/**
 * 指定年月の出退勤管理用スプレッドシートをGoogle Driveに自動作成し、DBに登録する。
 * 既に登録済みの場合は何もしない。
 */
export async function autoCreateTimesheetSpreadsheet(year: number, month: number): Promise<string | null> {
  try {
    // 既に登録済みならスキップ
    const existing = await getTimesheetSpreadsheets(year, month);
    if (existing && existing.length > 0) return existing[0].spreadsheetId;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      },
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    const title = `出退勤記録_${year}年${month}月`;

    // 新規スプレッドシートを作成
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: [{ properties: { title: "概要" } }],
      },
    });
    const spreadsheetId = createRes.data.spreadsheetId!;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 概要シートに説明を記入
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "概要!A1:B4",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          ["出退勤記録", `${year}年${month}月`],
          ["作成日時", new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })],
          ["内容", "職員名タブに各職員の出退勤打刻・残業情報が自動転記されます"],
          ["記載項目", "日付 / 打刻日時 / 区分(出勤・退勤) / 氏名 / ナンバープレート / 位置情報 / 備考 / 運転目的 / アルコール測定値 / 残業開始 / 残業終了 / 残業理由 / 連絡先 / 件数"],
        ],
      },
    });

    // サービスアカウントからオーナーのGoogleアカウントへ編集共有
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { type: "user", role: "writer", emailAddress: ownerEmail },
        sendNotificationEmail: false,
      }).catch((e: unknown) => console.warn("[TimesheetAutoSheet] Share failed:", e));
    }

    // DBに登録
    await upsertTimesheetSpreadsheet({
      year,
      month,
      spreadsheetId,
      label: title,
      spreadsheetUrl,
    });

    console.log(`[TimesheetAutoSheet] Created spreadsheet for ${year}/${month}: ${spreadsheetId}`);
    return spreadsheetId;
  } catch (err) {
    console.error("[TimesheetAutoSheet] Failed to create spreadsheet:", err);
    return null;
  }
}
