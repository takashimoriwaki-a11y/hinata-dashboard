/**
 * 既存スプレッドシートに「スケジュール変更連絡」シートを初期設定するスクリプト
 * 実行: node scripts/init-schedule-change-sheet.mjs
 */
import { GoogleAuth } from "google-auth-library";
import * as dotenv from "dotenv";
dotenv.config();

const SPREADSHEET_ID = "1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";
const SHEET_NAME = "スケジュール変更連絡";

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!email || !rawKey) {
  console.error("GOOGLE_SERVICE_ACCOUNT_EMAIL または GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が設定されていません");
  process.exit(1);
}

const privateKey = rawKey.replace(/\\n/g, "\n");

const auth = new GoogleAuth({
  credentials: { client_email: email, private_key: privateKey },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function main() {
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  if (!token) {
    console.error("アクセストークンの取得に失敗しました");
    process.exit(1);
  }

  // スプレッドシートのシート一覧を取得
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!metaRes.ok) {
    const text = await metaRes.text();
    console.error("スプレッドシートへのアクセスに失敗:", text);
    console.error("サービスアカウントに編集者権限が付与されているか確認してください");
    console.error("サービスアカウント:", email);
    process.exit(1);
  }

  const meta = await metaRes.json();
  const sheets = meta.sheets ?? [];
  const sheetExists = sheets.some(s => s.properties.title === SHEET_NAME);

  let sheetId;

  if (sheetExists) {
    sheetId = sheets.find(s => s.properties.title === SHEET_NAME)?.properties?.sheetId ?? 0;
    console.log(`✅ シート「${SHEET_NAME}」は既に存在します (sheetId: ${sheetId})`);
  } else {
    // シートを新規作成
    const addSheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: SHEET_NAME, gridProperties: { frozenRowCount: 1 } } } }],
        }),
      }
    );
    if (!addSheetRes.ok) {
      const text = await addSheetRes.text();
      console.error("シート作成失敗:", text);
      process.exit(1);
    }
    const addSheetData = await addSheetRes.json();
    sheetId = addSheetData.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    console.log(`✅ シート「${SHEET_NAME}」を作成しました (sheetId: ${sheetId})`);
  }

  // ヘッダー行を設定
  const headerRow = [
    "入力日時",
    "入力者",
    "変更種別",
    "チーム",
    "利用者名",
    "変更前日時",
    "変更後日時",
    "変更前担当スタッフ",
    "変更後担当スタッフ",
    "会議名",
    "会議参加スタッフ",
    "変更理由・備考",
  ];

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1:L1")}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headerRow] }),
    }
  );

  if (!updateRes.ok) {
    const text = await updateRes.text();
    console.error("ヘッダー行の設定失敗:", text);
    process.exit(1);
  }
  console.log("✅ ヘッダー行を設定しました");

  // 書式設定（ヘッダー行を太字・背景色）
  const formatRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.98, green: 0.73, blue: 0.42 },
                  textFormat: { bold: true, fontSize: 10 },
                  horizontalAlignment: "CENTER",
                  verticalAlignment: "MIDDLE",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            },
          },
          // 列幅調整
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 5 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 7 }, properties: { pixelSize: 150 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 11 }, properties: { pixelSize: 150 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 220 }, fields: "pixelSize" } },
          // 行の高さ（ヘッダー）
          { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 32 }, fields: "pixelSize" } },
        ],
      }),
    }
  );

  if (!formatRes.ok) {
    const text = await formatRes.text();
    console.warn("書式設定に失敗しました（ヘッダーは設定済み）:", text);
  } else {
    console.log("✅ 書式設定完了");
  }

  console.log(`\n🎉 初期設定完了！`);
  console.log(`🔗 スプレッドシート: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
}

main().catch((e) => {
  console.error("エラー:", e);
  process.exit(1);
});
