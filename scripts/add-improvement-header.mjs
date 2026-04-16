import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const SPREADSHEET_ID = "1ddCCxHq78TlrqCAoU8k_w91m2HeC6vivzXqI8nhxqLE";
const SHEET_NAME = "シート1";
const HEADERS = ["投稿日時", "投稿者", "カテゴリ", "内容", "対応状況"];

async function main() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    console.error("GOOGLE_SERVICE_ACCOUNT_EMAIL または GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が未設定");
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    console.error("アクセストークンの取得に失敗しました");
    process.exit(1);
  }

  const sheetName = encodeURIComponent(SHEET_NAME);

  // 1行目を取得
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}!A1:E1`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${token.token}` },
  });
  const getJson = await getRes.json();
  const firstRow = getJson.values?.[0] ?? [];

  if (firstRow.length > 0 && firstRow[0] === HEADERS[0]) {
    console.log("ヘッダー行は既に設定されています:", firstRow);
    return;
  }

  // ヘッダー行を書き込む
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}!A1:E1?valueInputOption=USER_ENTERED`;
  const updateRes = await fetch(updateUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [HEADERS] }),
  });
  const updateJson = await updateRes.json();

  if (updateRes.ok) {
    console.log("ヘッダー行を追加しました:", HEADERS);
    console.log("レスポンス:", JSON.stringify(updateJson, null, 2));
  } else {
    console.error("エラー:", JSON.stringify(updateJson, null, 2));
    process.exit(1);
  }
}

main().catch(console.error);
