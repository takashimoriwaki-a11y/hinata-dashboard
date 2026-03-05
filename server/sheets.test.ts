import { describe, expect, it } from "vitest";
import { GoogleAuth } from "google-auth-library";

const SPREADSHEET_ID = "1rS_ZMccLCy-XcRxbxlhTfNwhaCesdX7DBSZggjQUH58";

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error("サービスアカウントの環境変数が設定されていません");
  }

  const auth = new GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("アクセストークンの取得に失敗しました");
  return token.token;
}

describe("Google Sheets API (サービスアカウント認証)", () => {
  it("サービスアカウントでスプレッドシートにアクセスできる", async () => {
    const token = await getAccessToken();
    expect(token).toBeTruthy();

    const range = encodeURIComponent("2026.3!A1:B5");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status, `Sheets API エラー: ${response.status}`).toBe(200);

    const data = await response.json() as { values?: string[][] };
    expect(data).toHaveProperty("values");
    expect(data.values!.length).toBeGreaterThan(0);
  }, 15000);
});
