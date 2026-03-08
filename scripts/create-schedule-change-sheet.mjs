/**
 * スケジュール変更連絡専用スプレッドシートを新規作成するスクリプト
 * 実行: node scripts/create-schedule-change-sheet.mjs
 */
import { GoogleAuth } from "google-auth-library";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";

// .envファイルを読み込む
try {
  dotenv.config();
} catch {}

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!email || !rawKey) {
  console.error("GOOGLE_SERVICE_ACCOUNT_EMAIL または GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が設定されていません");
  process.exit(1);
}

const privateKey = rawKey.replace(/\\n/g, "\n");

const auth = new GoogleAuth({
  credentials: {
    client_email: email,
    private_key: privateKey,
  },
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

async function main() {
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  if (!token) {
    console.error("アクセストークンの取得に失敗しました");
    process.exit(1);
  }

  // スプレッドシートを新規作成
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: "ひなた_スケジュール変更連絡",
        locale: "ja_JP",
        timeZone: "Asia/Tokyo",
      },
      sheets: [
        {
          properties: {
            title: "スケジュール変更連絡",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    console.error("スプレッドシート作成失敗:", text);
    process.exit(1);
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const spreadsheetUrl = created.spreadsheetUrl;
  const sheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;

  console.log("✅ スプレッドシート作成成功");
  console.log("   ID:", spreadsheetId);
  console.log("   URL:", spreadsheetUrl);

  // ヘッダー行を追加
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

  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("スケジュール変更連絡!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [headerRow] }),
    }
  );

  if (!appendRes.ok) {
    const text = await appendRes.text();
    console.error("ヘッダー行追加失敗:", text);
    process.exit(1);
  }

  // ヘッダー行を太字・背景色で装飾
  const formatRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 12,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.98,
                    green: 0.73,
                    blue: 0.42,
                  },
                  textFormat: {
                    bold: true,
                    fontSize: 10,
                  },
                  horizontalAlignment: "CENTER",
                  verticalAlignment: "MIDDLE",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            },
          },
          // 列幅の調整
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: 1,
              },
              properties: { pixelSize: 140 },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 1,
                endIndex: 2,
              },
              properties: { pixelSize: 100 },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 2,
                endIndex: 3,
              },
              properties: { pixelSize: 120 },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 3,
                endIndex: 5,
              },
              properties: { pixelSize: 100 },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 5,
                endIndex: 7,
              },
              properties: { pixelSize: 140 },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 7,
                endIndex: 11,
              },
              properties: { pixelSize: 150 },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 11,
                endIndex: 12,
              },
              properties: { pixelSize: 200 },
              fields: "pixelSize",
            },
          },
        ],
      }),
    }
  );

  if (!formatRes.ok) {
    const text = await formatRes.text();
    console.warn("書式設定に失敗しました（スプレッドシートは作成済み）:", text);
  } else {
    console.log("✅ ヘッダー行の書式設定完了");
  }

  console.log("\n📋 以下のIDをrouters.tsに設定してください:");
  console.log(`   SCHEDULE_CHANGE_SHEET_ID = "${spreadsheetId}"`);
  console.log(`\n🔗 スプレッドシートURL: ${spreadsheetUrl}`);
}

main().catch((e) => {
  console.error("エラー:", e);
  process.exit(1);
});
