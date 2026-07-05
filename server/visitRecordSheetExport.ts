import type { VisitRecord } from "../drizzle/schema";

export const VISIT_RECORD_SHEET_ID = "1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo";

const HEADER_ROW = [
  "転送日時",
  "担当者",
  "チーム",
  "利用者名",
  "次回訪問日時",
  "伝達先",
  "伝達先（その他）",
  "伝達方法",
  "伝達方法（その他）",
];

export function getVisitTeamSheetName(team: string | null | undefined): string {
  const validTeams = ["身体", "天理", "郡山北部", "郡山南部"];
  if (team && validTeams.includes(team)) return team;
  return "その他";
}

function formatDate(val: Date | number | null | undefined): string {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, "0")}/${String(jst.getUTCDate()).padStart(2, "0")} ${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

function formatNextVisitDate(val: Date | number | null | undefined): string {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h = jst.getUTCHours();
  const m = jst.getUTCMinutes();
  const datePart = `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, "0")}/${String(jst.getUTCDate()).padStart(2, "0")}`;
  if (h === 0 && m === 0) return `${datePart}（時間未定）`;
  return `${datePart} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function getGoogleSheetsAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) {
    throw new Error("サービスアカウント設定がありません");
  }
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("認証トークン取得失敗");
  return token.token;
}

function buildSheetExportErrorMessage(status: number, errMsg: string): string {
  if (status === 401 || status === 403) {
    return "スプレッドシートへのアクセス権限がありません。管理者にお問い合わせください。";
  }
  if (status === 404) {
    return "スプレッドシートが見つかりません。URLや共有設定を確認してください。";
  }
  if (status === 429 || errMsg.includes("RESOURCE_EXHAUSTED")) {
    return "APIの利用制限に達しました。しばらく待ってから再試行してください。";
  }
  if (errMsg.includes("SERVICE_UNAVAILABLE") || status >= 500) {
    return "Googleのサービスが一時的に利用できません。しばらく待ってから再試行してください。";
  }
  if (errMsg) return `転送エラー: ${errMsg}`;
  return "スプレッドシートへの転送に失敗しました";
}

/** 訪問記録1件を次回訪問日時スプレッドシートへ転記する（書式設定は行わない） */
export async function exportVisitRecordToSheet(record: VisitRecord): Promise<void> {
  const SHEET_NAME = getVisitTeamSheetName(record.team);
  const token = await getGoogleSheetsAccessToken();

  const row = [
    formatDate(record.createdAt),
    record.createdByName ?? "",
    record.team ?? "",
    record.patientName ?? "",
    formatNextVisitDate(record.nextVisitAt),
    record.notifiedTo ?? "",
    record.notifiedToOther ?? "",
    record.notifyMethod ?? "",
    record.notifyMethodOther ?? "",
  ];

  const metaCheckRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (metaCheckRes.ok) {
    const metaCheck = await metaCheckRes.json() as { sheets?: { properties: { title: string } }[] };
    const sheetAlreadyExists = metaCheck.sheets?.some(s => s.properties.title === SHEET_NAME);
    if (!sheetAlreadyExists) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
      });
    }
  }

  const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}?valueRenderOption=UNFORMATTED_VALUE`;
  const checkRes = await fetch(checkUrl, { headers: { Authorization: `Bearer ${token}` } });
  const checkData = checkRes.ok ? await checkRes.json() as { values?: string[][] } : { values: [] };
  const firstCell = checkData.values?.[0]?.[0] ?? "";
  if (firstCell !== "転送日時") {
    const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}?valueInputOption=USER_ENTERED`;
    await fetch(headerUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [HEADER_ROW] }),
    });
  }

  const countUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:A")}?valueRenderOption=UNFORMATTED_VALUE`;
  const countRes = await fetch(countUrl, { headers: { Authorization: `Bearer ${token}` } });
  const countData = countRes.ok ? await countRes.json() as { values?: string[][] } : { values: [] };
  const nextRow = (countData.values?.length ?? 1) + 1;

  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(`${SHEET_NAME}!A${nextRow}`)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(writeUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    const text = await res.text();
    let errMsg = "";
    try {
      const errJson = JSON.parse(text);
      errMsg = errJson?.error?.message ?? "";
    } catch {
      // ignore
    }
    throw new Error(buildSheetExportErrorMessage(res.status, errMsg));
  }
}
