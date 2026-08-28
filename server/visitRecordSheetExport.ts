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

type SheetProperties = {
  sheetId: number;
  title: string;
  gridProperties?: { rowCount?: number; columnCount?: number };
};

async function fetchSpreadsheetSheets(token: string): Promise<SheetProperties[]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = await res.json() as { sheets?: { properties: SheetProperties }[] };
  return data.sheets?.map(s => s.properties) ?? [];
}

async function ensureSheetExists(token: string, sheetName: string, sheets: SheetProperties[]): Promise<SheetProperties[]> {
  if (sheets.some(s => s.title === sheetName)) return sheets;
  const createRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
  });
  if (!createRes.ok) return sheets;
  return fetchSpreadsheetSheets(token);
}

/** 書き込み行がシートの行数上限を超える場合、不足分の行を追加する */
async function ensureSheetRowCapacity(
  token: string,
  sheet: SheetProperties,
  requiredRow: number,
): Promise<void> {
  const currentRows = sheet.gridProperties?.rowCount ?? 0;
  if (requiredRow <= currentRows) return;
  const rowsToAdd = requiredRow - currentRows;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        appendDimension: {
          sheetId: sheet.sheetId,
          dimension: "ROWS",
          length: rowsToAdd,
        },
      }],
    }),
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
  let sheets = metaCheckRes.ok
    ? ((await metaCheckRes.json() as { sheets?: { properties: SheetProperties }[] }).sheets?.map(s => s.properties) ?? [])
    : [];
  sheets = await ensureSheetExists(token, SHEET_NAME, sheets);

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

  const targetSheet = sheets.find(s => s.title === SHEET_NAME);
  if (targetSheet) {
    await ensureSheetRowCapacity(token, targetSheet, nextRow);
  }

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

const DIAGNOSE_TABS = ["身体", "天理", "郡山北部", "郡山南部", "その他", "シート1"] as const;

function parseSheetDateTime(str: string | undefined): Date | null {
  if (!str) return null;
  const s = String(str).replace(/（時間未定）/g, "").trim();
  const m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}:00+09:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** 各タブの行数・最新転送日時・7/6以降の次回訪問件数を返す */
export async function diagnoseVisitRecordSheets(nextVisitCutoffJst: string = "2026-07-06") {
  const token = await getGoogleSheetsAccessToken();
  const cutoff = new Date(`${nextVisitCutoffJst}T00:00:00+09:00`);

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaRes.ok) throw new Error(`シートメタ取得失敗: ${await metaRes.text()}`);
  const meta = await metaRes.json() as { sheets?: { properties: { title: string } }[] };
  const existingTabs = new Set(meta.sheets?.map(s => s.properties.title) ?? []);

  const tabs: Array<{
    tabName: string;
    exists: boolean;
    dataRowCount: number;
    lastTransferAt: string | null;
    nextVisitOnOrAfterCutoff: number;
    tailRows: string[][];
    misalignedRowCount: number;
  }> = [];

  for (const tabName of DIAGNOSE_TABS) {
    if (!existingTabs.has(tabName)) {
      tabs.push({
        tabName, exists: false, dataRowCount: 0, lastTransferAt: null,
        nextVisitOnOrAfterCutoff: 0, tailRows: [], misalignedRowCount: 0,
      });
      continue;
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(`${tabName}!A:I`)}?valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = res.ok ? await res.json() as { values?: string[][] } : { values: [] };
    const rows = data.values ?? [];
    const dataRows = rows.slice(1).filter(r => r.some(c => String(c ?? "").trim()));

    const transferDates = dataRows.map(r => parseSheetDateTime(r[0])).filter((d): d is Date => !!d);
    const lastTransfer = transferDates.length
      ? new Date(Math.max(...transferDates.map(d => d.getTime())))
      : null;

    const nextVisitOnOrAfterCutoff = dataRows.filter(r => {
      const d = parseSheetDateTime(r[4]);
      return d && d >= cutoff;
    }).length;

    const misalignedRowCount = dataRows.filter(r => r[0] && !String(r[0]).match(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/)).length;

    tabs.push({
      tabName,
      exists: true,
      dataRowCount: dataRows.length,
      lastTransferAt: lastTransfer ? formatDate(lastTransfer) : null,
      nextVisitOnOrAfterCutoff,
      tailRows: dataRows.slice(-3).map(r => [r[0] ?? "", r[1] ?? "", r[3] ?? "", r[4] ?? ""]),
      misalignedRowCount,
    });
  }

  return { spreadsheetId: VISIT_RECORD_SHEET_ID, nextVisitCutoffJst, tabs };
}
