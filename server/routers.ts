import { getSessionCookieOptions } from "./_core/cookies";
import { google } from "googleapis";

/**
 * 位置情報の住所文字列から「何県何市何町」（都道府県＋市区町村＋町名）を抽出する
 * Google Maps APIのカンマ区切り形式にも対応
 * 例1: "菊茶天, 国道25号, 小林町西三丁目, 大和郡山市, 奈良県, 639-1023, 日本" → "奈良県大和郡山市小林町西三丁目"
 * 例2: "奈良県大和郡山市柳町1-2-3" → "奈良県大和郡山市柳町"
 */
function extractCityAddress(address: string | null | undefined): string {
  if (!address) return "";

  // カンマ区切り形式（Google Maps API形式: "町名, 市名, 県名, 郵便番号, 日本"）の場合
  if (address.includes(",")) {
    const parts = address.split(",").map(p => p.trim());

    // 都道府県を探す（例: "奈良県"）
    const prefIndex = parts.findIndex(p => /^.+[都道府県]$/.test(p));
    // 市区村を探す（例: "大和郡山市"）—「市」「区」「村」で終わるものを優先
    // 「町」は町名にも使われるため、市区村が見つからない場合のみ「町」で終わるものを探す
    let cityIndex = parts.findIndex(p => /^.+[市区村]$/.test(p));
    if (cityIndex === -1) {
      // 「町」で終わるもの（例: "大和郡山町"のような自治体名）
      cityIndex = parts.findIndex((p, i) => /^.+[町]$/.test(p) && i > 0);
    }

    if (prefIndex !== -1 && cityIndex !== -1) {
      const pref = parts[prefIndex]; // 例: "奈良県"
      const city = parts[cityIndex]; // 例: "大和郡山市"
      // 町名: 市区町村・都道府県より前にある要素で、道路名・郵便番号・国名でないもの
      const beforeBoth = Math.min(prefIndex, cityIndex);
      const townCandidates = parts.slice(0, beforeBoth).filter(p => {
        if (/^\d/.test(p)) return false;       // 数字始まり（郵便番号等）
        if (p === "日本") return false;          // 国名
        if (/国道|県道|府道/.test(p)) return false; // 道路名
        // 町名を含む（丁目・町・大字・字）
        if (/丁目|大字|字/.test(p)) return true;
        if (/町$/.test(p)) return true;
        return false;
      });
      const town = townCandidates.length > 0 ? townCandidates[townCandidates.length - 1] : "";
      return pref + city + town;
    }

    // 都道府県が見つからない場合：市区町村＋町名
    if (cityIndex !== -1) {
      const city = parts[cityIndex];
      const townCandidates = parts.slice(0, cityIndex).filter(p => {
        if (/^\d/.test(p)) return false;
        if (p === "日本") return false;
        if (/国道|県道|府道/.test(p)) return false;
        if (/丁目|大字|字/.test(p)) return true;
        if (/町$/.test(p)) return true;
        return false;
      });
      const town = townCandidates.length > 0 ? townCandidates[townCandidates.length - 1] : "";
      return city + town;
    }
  }

  // 日本語連続形式（例: "奈良県大和郡山市柳町1-2-3"）の場合
  // 都道府県＋市区町村＋町名（丁目まで）を抽出
  const fullMatch = address.match(/^(.+?[都道府県])(.+?[市区町村])(.+?(?:丁目|町|大字|字))?/);
  if (fullMatch) {
    return (fullMatch[1] || "") + (fullMatch[2] || "") + (fullMatch[3] || "");
  }

  // 都道府県なしで市区町村から始まる場合
  const cityMatch = address.match(/^(.+?[市区町村])/);
  if (cityMatch) {
    return cityMatch[1];
  }

  // マッチしない場合はそのまま返す
  return address;
}

/** アルコールチェック記録を月別スプレッドシートの職員タブに転記する（1日2行形式・色付け対応） */
async function appendAlcoholCheckToSheet(record: {
  checkedAt: number;
  type: string;
  userName: string;
  numberPlate: string;
  confirmMethod: string;
  detectorUsed: number;
  alcoholDetected: number;
  confirmerName: string;
  notes: string | null;
  clockInAt?: number | null;
  clockOutAt?: number | null;
  overtimeStartAt?: number | null;
  overtimeEndAt?: number | null;
  overtimeReason?: string | null;
  overtimeContact?: string | null;
  overtimeCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAddress?: string | null;
  alcoholMeasuredValue?: string | null;
  detectorType?: string | null;
  drivingPurpose?: string | null;
  hasPassenger?: boolean | null;
  passengerCount?: number | null;
  physicalCondition?: string | null;
  physicalConditionNote?: string | null;
  isOvernightClockOut?: boolean;
  isMonthCrossClockOut?: boolean;
}, spreadsheetId: string): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const checkedDate = new Date(record.checkedAt);
    // 日付またぎ・月またぎの場合は退勤時刻を「翌日 HH:MM」「翌月 HH:MM」形式で表示
    const timeOnlyStr = checkedDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
    let dateStr: string;
    if (record.isMonthCrossClockOut) {
      dateStr = `翌月 ${timeOnlyStr}`;
    } else if (record.isOvernightClockOut) {
      dateStr = `翌日 ${timeOnlyStr}`;
    } else {
      dateStr = checkedDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    // 日付部分のみ（YYYY/MM/DD形式）を同日検索に使用
    // 日付またぎの場合は出勤日（前日）の日付で検索する
    let dateOnlyStr: string;
    if ((record.isOvernightClockOut || record.isMonthCrossClockOut) && record.clockInAt) {
      const clockInDate = new Date(record.clockInAt);
      dateOnlyStr = clockInDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
    } else {
      dateOnlyStr = checkedDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
    }
    const typeLabel = record.type === "clock_in" ? "出勤" : "退勤";
    const confirmMethodLabel = record.confirmMethod === "online" ? "オンライン画面" : "対面";
    const detectorLabel = record.detectorUsed ? "使用" : "未使用";
    const alcoholLabel = record.alcoholDetected ? "有" : "無";
    const timestampStr = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    // 運転目的ラベル変換
    const drivingPurposeLabel = (() => {
      switch (record.drivingPurpose) {
        case "commute": return "通勤";
        case "visit": return "業務訪問";
        case "transport": return "送迎";
        case "errand": return "物品購入";
        case "other": return "その他";
        default: return record.drivingPurpose ?? "";
      }
    })();
    const hasPassengerLabel = record.hasPassenger == null ? "" : record.hasPassenger ? "有" : "無";
    const physicalConditionLabel = (() => {
      switch (record.physicalCondition) {
        case "good": return "良好";
        case "poor": return "不調";
        default: return record.physicalCondition ?? "";
      }
    })();

    const newRow = [
      dateStr,
      typeLabel,
      record.userName,
      record.numberPlate,
      confirmMethodLabel,
      detectorLabel,
      record.alcoholMeasuredValue ?? "",
      record.detectorType ?? "",
      alcoholLabel,
      record.confirmerName,
      drivingPurposeLabel,
      hasPassengerLabel,
      record.passengerCount != null ? String(record.passengerCount) : "",
      physicalConditionLabel,
      record.physicalConditionNote ?? "",
      (() => { const base = record.notes ?? ""; if (record.isMonthCrossClockOut) return base ? `${base} ※月またぎ退勤` : "※月またぎ退勤"; if (record.isOvernightClockOut) return base ? `${base} ※日付またぎ退勤` : "※日付またぎ退勤"; return base; })(),
      extractCityAddress(record.locationAddress),
      timestampStr,
    ];

    // 職員名でタブを取得、存在しなければ作成
    const tabName = record.userName;
    const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheetMeta.data.sheets ?? [];
    let sheetInfo = existingSheets.find((s) => s.properties?.title === tabName);

    if (!sheetInfo) {
      // 新規タブを作成
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      // 作成後のシート情報を取得
      const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId });
      sheetInfo = (updatedMeta.data.sheets ?? []).find((s) => s.properties?.title === tabName) ?? null;
      const newSheetId = sheetInfo?.properties?.sheetId ?? 0;

      // ヘッダー行を設定
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:R1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["実施日時", "区分", "氏名", "ナンバープレート", "確認方法", "検知器使用", "測定値(mg/L)", "検知器種類・型番", "酒気帯有無", "確認者", "運転目的", "同乗者", "同乗者人数", "体調確認", "体調詳細", "備考", "位置情報", "登録日時"]],
        },
      });

      // ヘッダー行に書式設定（緑系背景・白文字・太字・列幅調整）
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // ヘッダー行の書式設定
            {
              repeatCell: {
                range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 18 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.18, green: 0.49, blue: 0.31 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                    horizontalAlignment: "CENTER",
                    verticalAlignment: "MIDDLE",
                    wrapStrategy: "CLIP",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
              },
            },
            // ヘッダー行の高さを設定
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 30 },
                fields: "pixelSize",
              },
            },
            // 列幅を設定（A列:実施日時を広く）
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 140 },
                fields: "pixelSize",
              },
            },
            // B列:区分
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
                properties: { pixelSize: 60 },
                fields: "pixelSize",
              },
            },
            // C列:氏名
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
                properties: { pixelSize: 80 },
                fields: "pixelSize",
              },
            },
            // D列:ナンバープレート
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 },
                properties: { pixelSize: 110 },
                fields: "pixelSize",
              },
            },
            // E列:確認方法
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 },
                properties: { pixelSize: 110 },
                fields: "pixelSize",
              },
            },
            // F列:検知器使用
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 },
                properties: { pixelSize: 80 },
                fields: "pixelSize",
              },
            },
            // G列:測定値
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 },
                properties: { pixelSize: 90 },
                fields: "pixelSize",
              },
            },
            // H列:検知器種類・型番
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 },
                properties: { pixelSize: 130 },
                fields: "pixelSize",
              },
            },
            // I列:酒気帯有無
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 },
                properties: { pixelSize: 80 },
                fields: "pixelSize",
              },
            },
            // J列:確認者
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 10 },
                properties: { pixelSize: 80 },
                fields: "pixelSize",
              },
            },
            // K列:運転目的
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 10, endIndex: 11 },
                properties: { pixelSize: 90 },
                fields: "pixelSize",
              },
            },
            // L列:同乗者
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 },
                properties: { pixelSize: 60 },
                fields: "pixelSize",
              },
            },
            // M列:同乗者人数
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 12, endIndex: 13 },
                properties: { pixelSize: 80 },
                fields: "pixelSize",
              },
            },
            // N列:体調確認
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 13, endIndex: 14 },
                properties: { pixelSize: 80 },
                fields: "pixelSize",
              },
            },
            // O列:体調詳細
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 14, endIndex: 15 },
                properties: { pixelSize: 120 },
                fields: "pixelSize",
              },
            },
            // P列:備考
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 15, endIndex: 16 },
                properties: { pixelSize: 120 },
                fields: "pixelSize",
              },
            },
            // Q列:位置情報
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 16, endIndex: 17 },
                properties: { pixelSize: 150 },
                fields: "pixelSize",
              },
            },
            // R列:登録日時
            {
              updateDimensionProperties: {
                range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 17, endIndex: 18 },
                properties: { pixelSize: 140 },
                fields: "pixelSize",
              },
            },
            // 先頭行を固定
            {
              updateSheetProperties: {
                properties: {
                  sheetId: newSheetId,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ],
        },
      });
    }

    // シートIDを取得
    const currentMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const currentSheetInfo = (currentMeta.data.sheets ?? []).find((s) => s.properties?.title === tabName);
    const sheetId = currentSheetInfo?.properties?.sheetId ?? 0;

    if (record.type === "clock_out") {
      // 退勤の場合：同日の出勤行を検索し、その直下に行を挿入
      const allValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A:B`,
      });
      const rows = allValues.data.values ?? [];
      // 同日かつ「出勤」の最後の行インデックスを探す（0-indexed、ヘッダーは0行目）
      let clockInRowIndex = -1;
      for (let i = rows.length - 1; i >= 1; i--) {
        const cellDate = (rows[i][0] ?? "") as string;
        const cellType = (rows[i][1] ?? "") as string;
        // 日付部分が一致し、かつ「出勤」の行を探す
        if (cellDate.startsWith(dateOnlyStr) && cellType === "出勤") {
          clockInRowIndex = i;
          break;
        }
      }

      if (clockInRowIndex >= 0) {
        // 出勤行の直下（clockInRowIndex + 1）に新しい行を挿入
        const insertAfterIndex = clockInRowIndex + 1; // 0-indexed
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId,
                    dimension: "ROWS",
                    startIndex: insertAfterIndex,
                    endIndex: insertAfterIndex + 1,
                  },
                  inheritFromBefore: false,
                },
              },
            ],
          },
        });
        // 挿入した行にデータを書き込む（1-indexed: insertAfterIndex + 1）
        const targetRange = `${tabName}!A${insertAfterIndex + 1}:R${insertAfterIndex + 1}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: targetRange,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [newRow] },
        });
        // 退勤行に薄いオレンジ色を適用
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId, startRowIndex: insertAfterIndex, endRowIndex: insertAfterIndex + 1, startColumnIndex: 0, endColumnIndex: 18 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 1.0, green: 0.94, blue: 0.84 },
                    },
                  },
                  fields: "userEnteredFormat.backgroundColor",
                },
              },
            ],
          },
        });
      } else {
        // 同日の出勤行が見つからない場合は末尾に追加
        const appendRes = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${tabName}!A:R`,
          valueInputOption: "USER_ENTERED",
          includeValuesInResponse: true,
          requestBody: { values: [newRow] },
        });
        // 追加した行に退勤色を適用
        const updatedRange = appendRes.data.updates?.updatedRange ?? "";
        const rowMatch = updatedRange.match(/!(\d+):(\d+)$/) ?? updatedRange.match(/!(\d+)$/);
        if (rowMatch) {
          const appendedRowIndex = parseInt(rowMatch[1], 10) - 1; // 0-indexed
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: appendedRowIndex, endRowIndex: appendedRowIndex + 1, startColumnIndex: 0, endColumnIndex: 18 },
                    cell: {
                      userEnteredFormat: {
                        backgroundColor: { red: 1.0, green: 0.94, blue: 0.84 },
                      },
                    },
                    fields: "userEnteredFormat.backgroundColor",
                  },
                },
              ],
            },
          });
        }
      }
    } else {
      // 出勤の場合：末尾に追加
      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tabName}!A:R`,
        valueInputOption: "USER_ENTERED",
        includeValuesInResponse: true,
        requestBody: { values: [newRow] },
      });
      // 追加した行に出勤色（薄い青）を適用
      const updatedRange = appendRes.data.updates?.updatedRange ?? "";
      const rowMatch = updatedRange.match(/!(\d+):(\d+)$/) ?? updatedRange.match(/!(\d+)$/);
      if (rowMatch) {
        const appendedRowIndex = parseInt(rowMatch[1], 10) - 1; // 0-indexed
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId, startRowIndex: appendedRowIndex, endRowIndex: appendedRowIndex + 1, startColumnIndex: 0, endColumnIndex: 18 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.84, green: 0.93, blue: 1.0 },
                    },
                  },
                  fields: "userEnteredFormat.backgroundColor",
                },
              },
            ],
          },
        });
      }
    }
  } catch (err) {
    console.error("[AlcoholCheck] Failed to append to sheet:", err);
    throw err;
  }
}
/**
 * 指定年月のアルコールチェック用スプレッドシートをGoogle Driveに自動作成し、DBに登録する。
 * 既に登録済みの場合は何もしない。
 */
async function autoCreateAlcoholCheckSpreadsheet(year: number, month: number): Promise<string | null> {
  try {
    // 既に登録済みならスキップ
    const existing = await getAlcoholCheckSpreadsheet(year, month);
    if (existing) return existing.spreadsheetId;

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

    const title = `アルコールチェック記録_${year}年${month}月`;
    // 指定のGoogle Driveフォルダ内に直接スプレッドシートを作成
    const ALCOHOL_FOLDER_ID = "1M1po6_l4AAqqygD9xoQU8jQPF9XXX7_4";
    const createRes = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [ALCOHOL_FOLDER_ID],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    const spreadsheetId = createRes.data.id!;
    console.log(`[AutoSheet] Created spreadsheet: ${spreadsheetId}`);
    // フォルダへ明示的に移動（parentsが反映されない場合の保険）
    try {
      const fileInfo = await drive.files.get({
        fileId: spreadsheetId,
        fields: "parents",
        supportsAllDrives: true,
      });
      const currentParents = (fileInfo.data.parents ?? []).join(",");
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: ALCOHOL_FOLDER_ID,
        removeParents: currentParents,
        supportsAllDrives: true,
        fields: "id, parents",
      });
      console.log(`[AutoSheet] Moved spreadsheet to folder: ${ALCOHOL_FOLDER_ID}`);
    } catch (moveErr) {
      console.warn(`[AutoSheet] Failed to move to folder (will continue):`, moveErr);
    }
    // デフォルトシート（Sheet1等）を「概要」にリネーム
    const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
    const defaultSheetId = spreadsheetInfo.data.sheets?.[0]?.properties?.sheetId;
    const defaultSheetName = spreadsheetInfo.data.sheets?.[0]?.properties?.title ?? "Sheet1";
    if (defaultSheetName !== "概要" && defaultSheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: defaultSheetId, title: "概要" },
              fields: "title",
            },
          }],
        },
      });
      console.log(`[AutoSheet] Renamed default sheet "${defaultSheetName}" to "概要"`);
    }
    // 概要シートに説明を記入
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "概要!A1:B4",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          ["アルコールチェック記録", `${year}年${month}月`],
          ["作成日時", new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })],
          ["内容", "職員名タブに各職員のアルコールチェック記録が自動転記されます"],
          ["記載項目", "実施日時 / 区分（出勤・退勤） / 氏名 / ナンバープレート / 確認方法 / 検知器使用 / 測定値(mg/L) / 検知器種類・型番 / 酒気帯有無 / 確認者 / 運転目的 / 同乗者 / 同乗者人数 / 体調確認 / 体調詳細 / 備考 / 位置情報 / 登録日時"],
        ],
      },
    });

    // DBに登録された共有先メールアドレスに自動共有
    const shareEmailsValue = await getSetting("sheet_share_emails", "");
    const shareEmails = shareEmailsValue ? shareEmailsValue.split(",").map((e: string) => e.trim()).filter(Boolean) : [];
    // 特級管理者のメールアドレスを取得して共有リストに追加
    const { getSuperAdminUsers } = await import("./db");
    const superAdmins = await getSuperAdminUsers();
    const superAdminEmails = superAdmins.map((u) => u.email).filter((e): e is string => !!e);
    const allShareEmails = [...new Set([...shareEmails, ...superAdminEmails])];
    for (const email of allShareEmails) {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { type: "user", role: "writer", emailAddress: email },
        sendNotificationEmail: false,
      }).catch((e: unknown) => console.warn(`[AutoSheet] Share to ${email} failed:`, e));
    }
    if (allShareEmails.length > 0) {
      console.log(`[AutoSheet] Shared spreadsheet with: ${allShareEmails.join(", ")} (including ${superAdminEmails.length} super admin(s))`);
    }

    // DBに登録
    await upsertAlcoholCheckSpreadsheet({
      year,
      month,
      spreadsheetId,
      label: title,
    });

    console.log(`[AutoSheet] Created spreadsheet for ${year}/${month}: ${spreadsheetId}`);
    return spreadsheetId;
  } catch (err) {
    console.error("[AutoSheet] Failed to create spreadsheet:", err);
    return null;
  }
}

/**
 * 指定年月の出退勤用スプレッドシートをGoogle Driveに自動作成し、DBに登録する。
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
    // 指定のGoogle Driveフォルダ内に直接スプレッドシートを作成
    const TIMESHEET_FOLDER_ID = "11GxLu7YB23OzV8kxMpkwSWTLOei9j7hk";
    const createRes = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [TIMESHEET_FOLDER_ID],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    const spreadsheetId = createRes.data.id!;
    console.log(`[TimesheetAutoSheet] Created spreadsheet: ${spreadsheetId}`);
    // フォルダへ明示的に移動（parentsが反映されない場合の保険）
    try {
      const fileInfo = await drive.files.get({
        fileId: spreadsheetId,
        fields: "parents",
        supportsAllDrives: true,
      });
      const currentParents = (fileInfo.data.parents ?? []).join(",");
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: TIMESHEET_FOLDER_ID,
        removeParents: currentParents,
        supportsAllDrives: true,
        fields: "id, parents",
      });
      console.log(`[TimesheetAutoSheet] Moved spreadsheet to folder: ${TIMESHEET_FOLDER_ID}`);
    } catch (moveErr) {
      console.warn(`[TimesheetAutoSheet] Failed to move to folder (will continue):`, moveErr);
    }

    // デフォルトシート（Sheet1等）を「概要」にリネーム
    const metaForRename = await sheets.spreadsheets.get({ spreadsheetId });
    const defaultSheetId = metaForRename.data.sheets?.[0]?.properties?.sheetId;
    if (defaultSheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ updateSheetProperties: { properties: { sheetId: defaultSheetId, title: "概要" }, fields: "title" } }],
        },
      });
    }

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
          ["記載項目", "日付 / 出勤打刻時間 / 退勤打刻時間 / 残業開始 / 残業終了 / 残業時間(分) / 残業理由 / 残業詳細（連絡先・件数） / 残業申請承認状況"],
        ],
      },
    });

    // DBに登録された共有先メールアドレスに自動共有
    const shareEmailsValue = await getSetting("sheet_share_emails", "");
    const shareEmails = shareEmailsValue ? shareEmailsValue.split(",").map((e: string) => e.trim()).filter(Boolean) : [];
    // 特級管理者のメールアドレスを取得して共有リストに追加
    const { getSuperAdminUsers: getSuperAdminsForTimesheet } = await import("./db");
    const superAdminsForTimesheet = await getSuperAdminsForTimesheet();
    const superAdminEmailsForTimesheet = superAdminsForTimesheet.map((u) => u.email).filter((e): e is string => !!e);
    const allShareEmailsForTimesheet = [...new Set([...shareEmails, ...superAdminEmailsForTimesheet])];
    for (const email of allShareEmailsForTimesheet) {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { type: "user", role: "writer", emailAddress: email },
        sendNotificationEmail: false,
      }).catch((e: unknown) => console.warn(`[TimesheetAutoSheet] Share to ${email} failed:`, e));
    }
    if (allShareEmailsForTimesheet.length > 0) {
      console.log(`[TimesheetAutoSheet] Shared spreadsheet with: ${allShareEmailsForTimesheet.join(", ")} (including ${superAdminEmailsForTimesheet.length} super admin(s))`);
    }

    // DBに登録
    await upsertTimesheetSpreadsheet({
      year,
      month,
      spreadsheetId,
      label: title,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    });

    console.log(`[TimesheetAutoSheet] Created spreadsheet for ${year}/${month}: ${spreadsheetId}`);
    return spreadsheetId;
  } catch (err) {
    console.error("[TimesheetAutoSheet] Failed to create spreadsheet:", err);
    throw err;
  }
}

/**
 * 出退勤打刻記録を月別スプレッドシートの職員タブに転記する（1日1行形式）
 *
 * 列構成:
 * A: 日付 | B: 出勤打刻時間 | C: 退勤打刻時間
 * D: 残業開始 | E: 残業終了 | F: 残業時間(分) | G: 残業理由
 * H: 残業詳細（連絡先・件数） | I: 残業申請承認状況
 *
 * 出勤打刻時: 新しい行を追加（退勤・残業列は空欄）
 * 退勤打刻時: 同日の行を検索して退勤時間・残業情報を上書き
 */
async function appendTimesheetToSheet(record: {
  clockedAt: number;
  type: string;
  userName: string;
  numberPlate?: string | null;
  locationAddress?: string | null;
  emergencyNote?: string | null;
  drivingPurpose?: string | null;
  alcoholMeasuredValue?: string | null;
  overtimeStartAt?: number | null;
  overtimeEndAt?: number | null;
  overtimeReason?: string | null;
  overtimeContact?: string | null;
  overtimeCount?: number | null;
  totalWorkMinutes?: number | null;
  isOvernightClockOut?: boolean;
  clockInAt?: number | null;
}, spreadsheetId: string): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const toTimeStr = (ms: number) =>
      new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
    const toTimeStrOpt = (ms: number | null | undefined) =>
      ms ? new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }) : "";
    // 日付文字列（例: 2026/04/14）
    // 日付またぎ退勤の場合、スプレッドシートの検索キーは出勤日（前日）の日付を使用する
    const searchDateMs = (record.isOvernightClockOut && record.clockInAt) ? record.clockInAt : record.clockedAt;
    const dateStr = new Date(searchDateMs).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
    // 退勤時刻の表示: 日付またぎの場合は「翌日 HH:MM」と明示する
    const rawClockTimeStr = toTimeStr(record.clockedAt);
    const clockTimeStr = record.isOvernightClockOut ? `翌日 ${rawClockTimeStr}` : rawClockTimeStr;
    const timestampStr = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    // 残業情報
    const overtimeStartStr = toTimeStrOpt(record.overtimeStartAt);
    const overtimeEndStr = toTimeStrOpt(record.overtimeEndAt);
    const overtimeMinutes = (record.overtimeStartAt && record.overtimeEndAt)
      ? Math.round((record.overtimeEndAt - record.overtimeStartAt) / 60000)
      : "";
    const overtimeDetail = [
      record.overtimeContact ? `連絡先: ${record.overtimeContact}` : "",
      record.overtimeCount != null ? `件数: ${record.overtimeCount}件` : "",
      record.isOvernightClockOut ? "※日付またぎ退勤" : "",
    ].filter(Boolean).join(" / ");

    // 職員名タブの確認・作成
    const tabName = record.userName;
    const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheetMeta.data.sheets ?? [];
    const tabExists = existingSheets.some((s) => s.properties?.title === tabName);
    // ヘッダー列定義（12列）
    const HEADERS = ["日付", "出勤打刻時間", "退勤打刻時間", "残業開始", "残業終了", "残業時間(分)", "残業理由", "残業詳細（連絡先・件数）", "残業申請承認状況"];
    const COL_COUNT = HEADERS.length;
    if (!tabExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:I1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [HEADERS] },
      });
      // ヘッダー行を太字・背景色で書式設定
      const newSheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
      const newSheetId = newSheetMeta.data.sheets?.find((s) => s.properties?.title === tabName)?.properties?.sheetId;
      if (newSheetId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.18, green: 0.42, blue: 0.65 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: "CENTER",
                    },
                  },
                  fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
                },
              },
              {
                updateSheetProperties: {
                  properties: { sheetId: newSheetId, gridProperties: { frozenRowCount: 1 } },
                  fields: "gridProperties.frozenRowCount",
                },
              },
            ],
          },
        });
      }
    }

    if (record.type === "clock_in") {
      // ===== 出勤打刻: 新しい行を追加 =====
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tabName}!A:I`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[
            dateStr,        // A: 日付
            clockTimeStr,   // B: 出勤打刻時間
            "",             // C: 退勤打刻時間（空欄）
            "",             // D: 残業開始（空欄）
            "",             // E: 残業終了（空欄）
            "",             // F: 残業時間(分)（空欄）
            "",             // G: 残業理由（空欄）
            "",             // H: 残業詳細（空欄）
            "",             // I: 残業申請承認状況（空欄）
          ]],
        },
      });
    } else {
      // ===== 退勤打刻: 同日の出勤行を検索して退勤打刻時間・残業情報を上書き =====
      const existingData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A:I`,
      });
      const rows = existingData.data.values ?? [];
      // 同日の行を検索（最後に一致した行を使用）
      let targetRowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === dateStr) {
          targetRowIndex = i + 1; // 1-indexed
        }
      }
      if (targetRowIndex > 0) {
        // 既存行の退勤打刻時間・残業列を上書き（A列の日付・B列の出勤時間は保持）
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tabName}!C${targetRowIndex}:I${targetRowIndex}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[
              clockTimeStr,    // C: 退勤打刻時間
              overtimeStartStr, // D: 残業開始
              overtimeEndStr,  // E: 残業終了
              overtimeMinutes, // F: 残業時間(分)
              record.overtimeReason ?? "", // G: 残業理由
              overtimeDetail,  // H: 残業詳細
              "",              // I: 残業申請承認状況（承認処理で更新）
            ]],
          },
        });
        console.log(`[Timesheet] Updated clock_out for ${record.userName} on ${dateStr} at row ${targetRowIndex}`);
      } else {
        // 同日の出勤行が見つからない場合は新規追加
        console.warn(`[Timesheet] No clock_in row found for ${record.userName} on ${dateStr}, appending new row`);
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${tabName}!A:I`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[
              dateStr,
              "",              // B: 出勤打刻時間（不明）
              clockTimeStr,    // C: 退勤打刻時間
              overtimeStartStr,
              overtimeEndStr,
              overtimeMinutes,
              record.overtimeReason ?? "",
              overtimeDetail,
              "",
            ]],
          },
        });
      }
    }
  } catch (err) {
    console.error("[Timesheet] Failed to append to sheet:", err);
    throw err;
  }
}

/**
 * 残業申請の承認状況を出退勤スプレッドシートの職員タブに反映する
 * 対象日・対象者の行のI列（残業申請承認状況）を更新する
 * 承認時は「承認残業時間（HH:MM〜HH:MM）・今日の残業時間：X時間Y分」も転記する
 */
async function updateTimesheetOvertimeApproval(record: {
  applicationDate: string; // "YYYY-MM-DD"
  applicantName: string;
  status: string; // "approved" | "rejected" | "pending"
  approverName?: string | null;
  approverComment?: string | null;
  adjustedStartAt?: number | null;
  adjustedEndAt?: number | null;
  requestedStartAt?: number | null;
  requestedEndAt?: number | null;
  requestedReason?: string | null;
  requestedDetail?: string | null;
}, spreadsheetId: string): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const tabName = record.applicantName;
    // 日付文字列を「YYYY/MM/DD」形式に変換（スプレッドシートのA列と一致させる）
    const [y, m, d] = record.applicationDate.split("-").map(Number);
    const dateStr = `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
    // 承認時：承認残業時間と今日の残業時間を計算してI列に転記
    let statusLabel: string;
    if (record.status === "approved") {
      const startMs = record.adjustedStartAt ?? record.requestedStartAt;
      const endMs = record.adjustedEndAt ?? record.requestedEndAt;
      const toHHMM = (ms: number | null | undefined) =>
        ms ? new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }) : "--:--";
      const startStr = toHHMM(startMs);
      const endStr = toHHMM(endMs);
      let durationStr = "";
      if (startMs && endMs) {
        const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
        const h = Math.floor(minutes / 60);
        const min = minutes % 60;
        durationStr = h > 0 ? `${h}時間${min}分` : `${min}分`;
      }
      const approverPart = record.approverName ? ` (${record.approverName})` : "";
      statusLabel = `承認済み${approverPart}\n承認残業時間：${startStr}〜${endStr}\n今日の残業時間：${durationStr}`;
    } else if (record.status === "rejected") {
      statusLabel = `却下${record.approverComment ? `：${record.approverComment}` : ""}`;
    } else {
      statusLabel = "承認待ち";
    }
    // タブの存在確認
    const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabExists = (spreadsheetMeta.data.sheets ?? []).some((s) => s.properties?.title === tabName);
    if (!tabExists) {
      console.warn(`[Timesheet] Tab not found for ${tabName}, skipping approval update`);
      return;
    }
    // 対象行を検索（同日の最後の行を対象にする）
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:I`,
    });
    const rows = existingData.data.values ?? [];
    let targetRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === dateStr) {
        targetRowIndex = i + 1;
      }
    }
    if (targetRowIndex < 0) {
      console.warn(`[Timesheet] No row found for ${record.applicantName} on ${dateStr}, skipping approval update`);
      return;
    }
    // 承認・却下時：D〜H列（残業情報）も更新する
    if (record.status === "approved" || record.status === "rejected") {
      const toHHMM = (ms: number | null | undefined) =>
        ms ? new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }) : "";
      // 承認時は adjustedStartAt/adjustedEndAt を優先、なければ requestedStartAt/requestedEndAt
      const startMs = record.adjustedStartAt ?? record.requestedStartAt;
      const endMs = record.adjustedEndAt ?? record.requestedEndAt;
      const overtimeStartStr = toHHMM(startMs);
      const overtimeEndStr = toHHMM(endMs);
      let overtimeMinutes = "";
      if (startMs && endMs) {
        const mins = Math.max(0, Math.round((endMs - startMs) / 60000));
        overtimeMinutes = String(mins);
      }
      const overtimeReason = record.requestedReason ?? "";
      const overtimeDetail = record.requestedDetail ?? "";
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!D${targetRowIndex}:H${targetRowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[
            overtimeStartStr,  // D: 残業開始
            overtimeEndStr,    // E: 残業終了
            overtimeMinutes,   // F: 残業時間(分)
            overtimeReason,    // G: 残業理由
            overtimeDetail,    // H: 残業詳細
          ]],
        },
      });
    }
    // I列（9列目）を更新
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!I${targetRowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[statusLabel]] },
    });
    // 承認時：I列のセルを折り返し表示に設定
    if (record.status === "approved") {
      const sheetId = (spreadsheetMeta.data.sheets ?? []).find((s) => s.properties?.title === tabName)?.properties?.sheetId;
      if (sheetId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: targetRowIndex - 1,
                  endRowIndex: targetRowIndex,
                  startColumnIndex: 8, // I列
                  endColumnIndex: 9,
                },
                cell: {
                  userEnteredFormat: {
                    wrapStrategy: "WRAP",
                    backgroundColor: { red: 0.878, green: 0.969, blue: 0.878 }, // 薄い緑（承認済み）
                  },
                },
                fields: "userEnteredFormat(wrapStrategy,backgroundColor)",
              },
            }],
          },
        });
      }
    }
    console.log(`[Timesheet] Updated approval status for ${record.applicantName} on ${dateStr}: ${statusLabel}`);
  } catch (err) {
    console.error("[Timesheet] Failed to update approval status:", err);
    throw err;
  }
}
/** 残業署名を出退勤記録スプレッドシートの月末最終行に転記する */
async function appendSignatureToTimesheetSheet(record: {
  userName: string;
  targetYear: number;
  targetMonth: number;
  signedAt: number;
  comment?: string | null;
}, spreadsheetId: string): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const tabName = record.userName;
    // タブの存在確認
    const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsList = spreadsheetMeta.data.sheets ?? [];
    const sheetInfo = sheetsList.find((s) => s.properties?.title === tabName);
    if (!sheetInfo) {
      console.warn(`[Signature] Tab not found for ${tabName}, skipping signature append`);
      return;
    }
    const sheetId = sheetInfo.properties?.sheetId;
    // 署名日時の文字列（JST）
    const signedDate = new Date(record.signedAt);
    const signedDateStr = signedDate.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    // 対象月（例：2025年3月）の表記
    const targetMonthStr = `${record.targetYear}年${record.targetMonth}月`;
    // コメント部分
    const commentStr = record.comment ? ` / コメント：${record.comment}` : "";
    // 署名行データ（A〜R列、ヘッダーと同じ18列構成に合わせる）
    const signatureRow = [
      `${targetMonthStr}分 署名済み`,  // A: 実施日時列に「YYYY年M月分 署名済み」
      "署名",                           // B: 区分
      record.userName,                  // C: 氏名
      "",                               // D: ナンバープレート
      "",                               // E: 確認方法
      "",                               // F: 検知器使用
      "",                               // G: 測定値
      "",                               // H: 検知器種類・型番
      "",                               // I: 酒気帯有無
      "",                               // J: 確認者
      "",                               // K: 運転目的
      "",                               // L: 同乗者
      "",                               // M: 同乗者人数
      "",                               // N: 体調確認
      "",                               // O: 体調詳細
      `署名日時：${signedDateStr}${commentStr}`, // P: 備考
      "",                               // Q: 位置情報
      new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }), // R: 登録日時
    ];
    // 最終行を取得して次の行に追加
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:A`,
    });
    const lastRow = (existingData.data.values ?? []).length + 1;
    const newRowIndex = lastRow; // 0-indexed: lastRow - 1
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A${lastRow}:R${lastRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [signatureRow] },
    });
    // 署名行に薄い青背景・太字書式を設定
    if (sheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: newRowIndex - 1,
                endRowIndex: newRowIndex,
                startColumnIndex: 0,
                endColumnIndex: 18,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.827, green: 0.906, blue: 0.980 }, // 薄い青
                  textFormat: { bold: true, fontSize: 10 },
                  horizontalAlignment: "LEFT",
                  verticalAlignment: "MIDDLE",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            },
          }],
        },
      });
    }
    console.log(`[Signature] Appended signature row for ${record.userName} (${targetMonthStr}) at row ${lastRow}`);
  } catch (err) {
    console.error("[Signature] Failed to append signature to timesheet:", err);
    throw err;
  }
}

/** 残業申請・承認記録をスプレッドシートに転記する */
async function appendOvertimeToSheet(record: {
  applicationDate: string;
  applicantName: string;
  requestedStartAt: number;
  requestedEndAt: number;
  requestedReason?: string | null;
  status: string;
  approverName?: string | null;
  approvedAt?: number | null;
  adjustedStartAt?: number | null;
  adjustedEndAt?: number | null;
  approverComment?: string | null;
  /** trueの場合、既存行を検索して上書き更新する（承認・却下時） */
  updateExisting?: boolean;
}, spreadsheetId: string): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const toJSTStr = (ms: number | null | undefined) =>
      ms ? new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const statusLabel = record.status === "approved" ? "承認" : record.status === "rejected" ? "却下" : "承認待ち";
    const timestampStr = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    // 月別タブの確認・作成
    const [year, month] = record.applicationDate.split("-").map(Number);
    const tabName = `${year}年${month}月残業`;
    const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = spreadsheetMeta.data.sheets ?? [];
    const tabExists = existingSheets.some((s) => s.properties?.title === tabName);
    if (!tabExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:L1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["申請日", "申請者", "申請開始時刻", "申請終了時刻", "申請理由", "ステータス", "承認者", "承認日時", "承認開始時刻", "承認終了時刻", "承認者コメント", "転記日時"]] },
      });
    }
    const newRow = [record.applicationDate, record.applicantName, toJSTStr(record.requestedStartAt), toJSTStr(record.requestedEndAt), record.requestedReason ?? "", statusLabel, record.approverName ?? "", toJSTStr(record.approvedAt), toJSTStr(record.adjustedStartAt), toJSTStr(record.adjustedEndAt), record.approverComment ?? "", timestampStr];
    if (record.updateExisting) {
      // 既存行を検索して上書き更新する
      const existingData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A:L`,
      });
      const rows = existingData.data.values ?? [];
      // 申請日（A列）と申請者（B列）と申請開始時刻（C列）が一致する行を検索
      const reqStartStr = toJSTStr(record.requestedStartAt);
      let targetRowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] === record.applicationDate && row[1] === record.applicantName && row[2] === reqStartStr) {
          targetRowIndex = i + 1; // 1-indexed
          break;
        }
      }
      if (targetRowIndex > 0) {
        // 既存行を上書き
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tabName}!A${targetRowIndex}:L${targetRowIndex}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [newRow] },
        });
        console.log(`[Overtime] Updated row ${targetRowIndex} in ${tabName}`);
        return;
      }
      // 既存行が見つからない場合は新規追記
      console.warn(`[Overtime] Existing row not found for ${record.applicationDate}/${record.applicantName}, appending new row`);
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });
  } catch (err) {
    console.error("[Overtime] Failed to append to sheet:", err);
    throw err;
  }
}

import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getAllScreenshots,
  getScreenshot,
  upsertScreenshot,
  updateScreenshotUrl,
  deleteScreenshot,
  deleteAllTodayScreenshots,
  moveTomorrowToToday,
  rotateScheduleDays,
  updateUserTeam,
  getDb,
  getMyLinks,
  createMyLink,
  updateMyLink,
  deleteMyLink,
  getSpreadsheetLinks,
  getAllSpreadsheetLinks,
  upsertSpreadsheetLink,
  deleteSpreadsheetLink,
  getMyTasks,
  getAllTasks,
  createTask,
  toggleTask,
  deleteTask as deleteTaskDb,
  softDeleteTask,
  restoreTask,
  getDeletedTasks,
  getTaskById,
  updateTask,
  getActiveMessages,
  getPendingMessages,
  createMessage,
  softDeleteMessage,
  updateMessage,
  getMessageById,
  toggleReaction,
  getReactionsByMessageIds,
  expireMessages,
  getPatients,
  getAllPatientsIncludingInactive,
  searchPatients,
  createPatient,
  updatePatient,
  deactivatePatient,
  createVisitRecord,
  upsertTodayVisitRecord,
  getVisitRecords,
  getVisitRecordById,
  markVisitRecordExported,
  unmarkVisitRecordExported,
  createNotification,
  getUnreadNotifications,
  getAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notificationExists,
  cleanupOldNotifications,
  getAllStaff,
  createStaffAccount,
  resetStaffPassword,
  deleteStaffAccount,
  updateStaffRole,
  updateStaffEmail,
  completeTeamSetup,
  updateUserRole,
  updateStaffInfo,
  batchCreatePatients,
  batchCreateStaff,
  createScreenshotUploadLog,
  getRecentScreenshotUploadLogs,
  getSetting,
  setSetting,
  getScheduleComments,
  addScheduleComment,
  deleteScheduleComment,
  updateScheduleComment,
  getScheduleCommentCounts,
  getScheduleCommentReactions,
  toggleScheduleCommentReaction,
  getCommentsByDate,
  deleteCommentsByDate,
  createScheduleChange,
  getScheduleChanges,
  getScheduleChangeById,
  markScheduleChangeExported,
  getActiveTeamGoals,
  getAllTeamGoals,
  createTeamGoal,
  updateTeamGoal,
  deleteTeamGoal,
  clockAttendance,
  getTodayAttendance,
  getYesterdayAttendance,
  saveAlcoholCheck,
  markAlcoholCheckSynced,
  updateUserNumberPlate,
  getAlcoholChecksByRange,
  getUnsyncedAlcoholChecks,
  getAlcoholCheckSpreadsheet,
  getAllAlcoholCheckSpreadsheets,
  upsertAlcoholCheckSpreadsheet,
  deleteAlcoholCheckSpreadsheet,
  getSharedPrompts,
  createSharedPrompt,
  updateSharedPrompt,
  deleteSharedPrompt,
  reorderSharedPrompts,
  getActiveAlcoholDetectors,
  getAllAlcoholDetectors,
  createAlcoholDetector,
  updateAlcoholDetector,
  deleteAlcoholDetector,
  getTimesheetSpreadsheets,
  upsertTimesheetSpreadsheet,
  getScheduleNote,
  getScheduleNotesByIds,
  upsertScheduleNote,
  deleteScheduleNote,
} from "./db";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { broadcastEvent } from "./_core/sse";
import { sendPushToUser } from "./pushNotification";

// COOKIE_NAME is imported from shared/const via googleAuth.ts; use the shared constant here too
import { COOKIE_NAME } from "../shared/const";

// Google Sheets API設定
const SPREADSHEET_ID = "1rS_ZMccLCy-XcRxbxlhTfNwhaCesdX7DBSZggjQUH58";

// サービスアカウント認証クライアントを作成（シングルトン）
let _auth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (!_auth) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (!email || !privateKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL または GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が設定されていません");
    }

    _auth = new GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }
  return _auth;
}

// シート名を取得（例: 2026.3）
function getSheetName(year: number, month: number): string {
  return `${year}.${month}`;
}

// 今月・前月のシート名を取得
function getMonthSheetNames(): { current: string; prev: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return {
    current: getSheetName(year, month),
    prev: getSheetName(prevYear, prevMonth),
  };
}

// サービスアカウント認証でGoogle Sheets APIからデータを取得
async function fetchSheetData(sheetName: string, range: string): Promise<string[][]> {
  const auth = getAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    throw new Error("アクセストークンの取得に失敗しました");
  }

  const encodedRange = encodeURIComponent(`${sheetName}!${range}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodedRange}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API error: ${response.status} ${text}`);
  }

  const data = await response.json() as { values?: string[][] };
  return data.values ?? [];
}

// 数値パース（空・NaN対策）
function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

interface DailyPoint {
  day: number;          // 日（1〜31）
  label: string;        // 表示ラベル（例: "3/1"）
  target: number;       // 目標累計（P列）
  actual: number | null; // 実績累計（Q列）、未入力はnull
}

interface VisitData {
  currentMonth: string;           // 今月表示（例: "3月"）
  lastUpdatedDate: string;        // 直近の実績更新日（例: "3/3"）
  mainActual: number;             // メイン実績累計
  subActual: number;              // サブ実績累計
  totalActualEquiv: number;       // 合計実績（メイン換算: メイン + サブ/2）
  mainTarget: number;             // メイン月間目標
  subTarget: number;              // サブ月間目標
  mainDailyTargetCumul: number;   // その日のメイン目標累計（C列）
  subDailyTargetCumul: number;    // その日のサブ目標累計（J列）
  totalTargetEquiv: number;       // 合計目標（メイン換算）
  diff: number;                   // 目標差
  dailyTarget: number;            // 1日目標
  dailyPoints: DailyPoint[];      // 日別データ（グラフ用）
  // 前月実績
  prevMonth: string;              // 前月表示（例: "2月"）
  prevTotalTarget: number;        // 前月 P列最終値（目標累計メイン換算）
  prevTotalActual: number;        // 前月 Q列最終値（実績累計メイン換算）
  prevDiff: number;               // 前月 R列最終値（目標差）
}

async function getVisitData(): Promise<VisitData> {
  const { current: currentSheet, prev: prevSheet } = getMonthSheetNames();
  const now = new Date();
  const currentMonth = `${now.getMonth() + 1}月`;
  const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevMonth = `${prevMonthNum}月`;

  // === 今月データ取得 ===
  const currentValues = await fetchSheetData(currentSheet, "A1:R40");

  // スプレッドシートの列構造（0始まりインデックス）:
  // 行1(index=0): ヘッダー行（空, 空, "1日目標"）
  // 行2(index=1): 目標メイン → B列(1)=月間目標, C列(2)=1日目標
  // 行3(index=2): 目標サブ  → B列(1)=月間目標
  // 行8〜(index=7〜): 日別データ
  //   A(0)=日付, B(1)=曜日, C(2)=メイン目標累計, D(3)=メイン訪問実績, E(4)=メイン実績累計, F(5)=メイン目標差
  //   H(7)=日付(サブ), I(8)=曜日(サブ), J(9)=サブ目標累計, K(10)=サブ訪問実績(当日), L(11)=サブ実績累計
  //   P(15)=目標累計(メイン換算), Q(16)=実績累計(メイン換算), R(17)=目標差

  const mainTargetRow = currentValues[1] ?? [];  // 行2(index=1)
  const subTargetRow = currentValues[2] ?? [];   // 行3(index=2)
  const mainTarget = parseNum(mainTargetRow[1]);   // B2: メイン月間目標
  const subTarget = parseNum(subTargetRow[1]);     // B3: サブ月間目標
  const dailyTarget = parseNum(mainTargetRow[2]);  // C2: 1日目標

  let lastUpdatedDate = "";
  let mainActual = 0;
  let subActual = 0;
  let totalActualEquiv = 0;
  let totalTargetEquiv = 0;
  let diff = 0;
  let mainDailyTargetCumul = 0;
  let subDailyTargetCumul = 0;
  const dailyPoints: DailyPoint[] = [];

  // 日別データは行8～（index=7～）
  for (let i = 7; i <= 37; i++) {
    const row = currentValues[i];
    if (!row || row.length < 2) continue;

    const dateLabel = row[0] ?? "";
    if (!dateLabel || dateLabel === "") continue;  // 日付がない行はスキップ

    const mainActualCumul = parseNum(row[4]);   // E列(4): メイン実績累計
    const subActualCumul = parseNum(row[11]);   // L列(11): サブ実績累計

    // Q列の実績累計が0でなければ実績あり
    const qVal = parseNum(row[16]);  // Q列(16): 実績累計（メイン換算）
    const pVal = parseNum(row[15]);  // P列(15): 目標累計（メイン換算）

    // 日別データを追加（P列に目標がある日のみ）
    if (pVal > 0) {
      // 日付ラベルから日番号を抽出（例: "3/1" → 1）
      const dayNum = parseInt(dateLabel.split("/")[1] ?? dateLabel, 10);
      dailyPoints.push({
        day: isNaN(dayNum) ? i - 6 : dayNum,
        label: dateLabel,
        target: Math.round(pVal * 10) / 10,
        actual: qVal > 0 ? Math.round(qVal * 10) / 10 : null,
      });
    }

    // 実績が入力されている行を記録（最後に値がある行が直近更新日）
    if (qVal > 0) {
      lastUpdatedDate = dateLabel;
      mainActual = mainActualCumul;
      subActual = subActualCumul;
      totalActualEquiv = qVal;

      // C列(2): メイン目標累計（その日までの累計目標）
      mainDailyTargetCumul = parseNum(row[2]);
      // J列(9): サブ目標累計（その日までの累計目標）
      subDailyTargetCumul = parseNum(row[9]);

      // P列: 目標累計（メイン換算）
      totalTargetEquiv = pVal;

      // R列: 目標差
      const rVal = parseNum(row[17]);  // R列(17)
      diff = rVal;
    }
  }

  // === 前月データ取得（P列・Q列・R列の一番下の値）===
  let prevTotalTarget = 0;
  let prevTotalActual = 0;
  let prevDiff = 0;

  try {
    const prevValues = await fetchSheetData(prevSheet, "A1:R40");

    // 行9〜39（index 8〜38）のP列・Q列・R列で最後に値がある行を探す
    for (let i = 8; i <= 38; i++) {
      const row = prevValues[i];
      if (!row) break;

      const pVal = parseNum(row[15]);  // P列: 目標累計
      const qVal = parseNum(row[16]);  // Q列: 実績累計
      const rVal = parseNum(row[17]);  // R列: 目標差

      if (pVal > 0 || qVal > 0) {
        prevTotalTarget = pVal;
        prevTotalActual = qVal;
        prevDiff = rVal;
      }
    }
  } catch (e) {
    console.warn("[Visits] Failed to fetch prev month data:", e);
  }

  return {
    currentMonth,
    lastUpdatedDate,
    mainActual,
    subActual,
    totalActualEquiv: Math.round(totalActualEquiv * 10) / 10,
    mainTarget,
    subTarget,
    mainDailyTargetCumul: Math.round(mainDailyTargetCumul * 10) / 10,
    subDailyTargetCumul: Math.round(subDailyTargetCumul * 10) / 10,
    totalTargetEquiv: Math.round(totalTargetEquiv * 10) / 10,
    diff: Math.round(diff * 10) / 10,
    dailyTarget,
    dailyPoints,
    prevMonth,
    prevTotalTarget: Math.round(prevTotalTarget * 10) / 10,
    prevTotalActual: Math.round(prevTotalActual * 10) / 10,
    prevDiff: Math.round(prevDiff * 10) / 10,
  };
}

// ランダムサフィックス生成
function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 10);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // 訪問件数データ取得
  visits: router({
    getCurrent: publicProcedure.query(async () => {
      try {
        return await getVisitData();
      } catch (error) {
        console.error("[Visits] Failed to fetch sheet data:", error);
        return null;
      }
    }),
    // 曜日別件数（見込み件数タブ）を取得
    getDailyByTeam: publicProcedure.query(async () => {
      try {
        const MIKOMIKEN_SHEET_ID = "1cJ8f3gFWu0Fqrl3TxthGVk0-9TF4Hg5YJZFO-mWIvjI";
        const SHEET_TAB = "見込み件数";
        const auth = getAuth();
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new Error("アクセストークンの取得に失敗しました");
        // B46:G53 = チーム列と月火水木金の曜日別件数テーブル（52行目=目標、53行目=合計ー目標）
        const range = encodeURIComponent(`${SHEET_TAB}!B46:G53`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${MIKOMIKEN_SHEET_ID}/values/${range}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token.token}` },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Sheets API error: ${response.status} ${text}`);
        }
        const data = await response.json() as { values?: string[][] };
        const rows = data.values ?? [];
        // rows[0] = ヘッダー行（チーム、月、火、水、木、金）
        // rows[1..4] = 各チーム行（郡山北部、郡山南部、身体、天理）
        // rows[5] = 合計行
        const teams: { name: string; mon: number; tue: number; wed: number; thu: number; fri: number }[] = [];
        for (let i = 1; i <= 4; i++) {
          const row = rows[i];
          if (!row) continue;
          teams.push({
            name: row[0] ?? "",
            mon: parseNum(row[1]),
            tue: parseNum(row[2]),
            wed: parseNum(row[3]),
            thu: parseNum(row[4]),
            fri: parseNum(row[5]),
          });
        }
        const totalRow = rows[5];
        const total = totalRow ? {
          name: "合計",
          mon: parseNum(totalRow[1]),
          tue: parseNum(totalRow[2]),
          wed: parseNum(totalRow[3]),
          thu: parseNum(totalRow[4]),
          fri: parseNum(totalRow[5]),
        } : null;
        // rows[6] = 目標行（52行目）
        const targetRow = rows[6];
        const target = targetRow ? {
          name: "目標",
          mon: parseNum(targetRow[1]),
          tue: parseNum(targetRow[2]),
          wed: parseNum(targetRow[3]),
          thu: parseNum(targetRow[4]),
          fri: parseNum(targetRow[5]),
        } : null;
        // rows[7] = 合計ー目標行（53行目）
        const diffRow = rows[7];
        const diff = diffRow ? {
          name: "合計−目標",
          mon: parseNum(diffRow[1]),
          tue: parseNum(diffRow[2]),
          wed: parseNum(diffRow[3]),
          thu: parseNum(diffRow[4]),
          fri: parseNum(diffRow[5]),
        } : null;
        return { teams, total, target, diff };
      } catch (error) {
        console.error("[Visits] Failed to fetch daily by team:", error);
        return null;
      }
    }),
  }),

  // ユーザー設定
  userSettings: router({
    // 現在のユーザー情報（チーム含む）を取得
    getMyTeam: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { team: "身体" as const };
      const result = await db.select({ team: users.team }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return { team: result[0]?.team ?? "身体" };
    }),
    // チームを更新
    setMyTeam: protectedProcedure
      .input(z.object({ team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]) }))
      .mutation(async ({ ctx, input }) => {
        await updateUserTeam(ctx.user.id, input.team);
        broadcastEvent("users");
        return { success: true };
      }),
    // プロフィール取得（teamSetupDone含む）
    getMyProfile: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { team: null, teamSetupDone: false };
      const result = await db.select({ team: users.team, teamSetupDone: users.teamSetupDone }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return { team: result[0]?.team ?? null, teamSetupDone: (result[0]?.teamSetupDone ?? 0) === 1 };
    }),
    // 初回チーム設定を完了する
    completeTeamSetup: protectedProcedure
      .input(z.object({ team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]) }))
      .mutation(async ({ ctx, input }) => {
        await completeTeamSetup(ctx.user.id, input.team);
        broadcastEvent("users");
        // 管理者へチーム参加通知を送信
        try {
          const { notifyOwner } = await import("./_core/notification");
          const staffName = ctx.user.name ?? ctx.user.email ?? "不明なスタッフ";
          await notifyOwner({
            title: "チーム参加のお知らせ",
            content: `${staffName} さんが「${input.team}」チームに参加しました。`,
          });
        } catch (e) {
          console.error("[TeamSetup] notifyOwner failed:", e);
        }
        return { success: true };
      }),
  }),

  // マイリンク
  myLinks: router({
    // 自分のリンク一覧を取得
    list: protectedProcedure.query(async ({ ctx }) => {
      return getMyLinks(ctx.user.id);
    }),
    // リンクを追加
    create: protectedProcedure
      .input(
        z.object({
          label: z.string().min(1).max(100),
          url: z.string().url({ message: "有効なURLを入力してください" }),
          emoji: z.string().max(10).default("🔗"),
          description: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const links = await getMyLinks(ctx.user.id);
        const sortOrder = links.length;
        const id = await createMyLink({
          userId: ctx.user.id,
          label: input.label,
          url: input.url,
          emoji: input.emoji,
          description: input.description,
          sortOrder,
        });
        broadcastEvent("myLinks");
        return { success: true, id };
      }),
    // リンクを更新
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          label: z.string().min(1).max(100).optional(),
          url: z.string().url({ message: "有効なURLを入力してください" }).optional(),
          emoji: z.string().max(10).optional(),
          description: z.string().max(200).optional(),
          sortOrder: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await updateMyLink(id, ctx.user.id, data);
        broadcastEvent("myLinks");
        return { success: true };
      }),
    // \u30ea\u30f3\u30af\u3092\u524a\u9664
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteMyLink(input.id, ctx.user.id);
        broadcastEvent("myLinks");
        return { success: true };
      }),
    // フォルダ内ファイル一覧取得（共有ドライブ対応）
    listDriveFolder: protectedProcedure
      .input(z.object({
        folderId: z.string().min(1),
        driveId: z.string().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
          const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
          if (!email || !privateKey) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google認証情報が設定されていません" });
          }
          const auth = new GoogleAuth({
            credentials: {
              client_email: email,
              private_key: privateKey.replace(/\\n/g, "\n"),
            },
            scopes: ["https://www.googleapis.com/auth/drive.readonly"],
          });
          const client = await auth.getClient();
          const token = await client.getAccessToken();
          if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "トークン取得失敗" });

          const params = new URLSearchParams({
            q: `'${input.folderId}' in parents and trashed = false`,
            fields: "files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size),nextPageToken",
            pageSize: "100",
            orderBy: "folder,name",
            includeItemsFromAllDrives: "true",
            supportsAllDrives: "true",
          });
          if (input.driveId) {
            params.set("driveId", input.driveId);
            params.set("corpora", "drive");
          }
          const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token.token}` },
          });
          if (!res.ok) {
            const text = await res.text();
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Drive APIエラー: ${res.status} ${text}` });
          }
          const data = await res.json() as {
            files: { id: string; name: string; mimeType: string; webViewLink: string; iconLink?: string; modifiedTime: string; size?: string }[];
            nextPageToken?: string;
          };
          return {
            files: data.files ?? [],
            hasMore: !!data.nextPageToken,
          };
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(e) });
        }
      }),
    // Google Driveファイル検索
    searchDrive: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(200) }))
      .query(async ({ input }) => {
        try {
          const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
          const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
          if (!email || !privateKey) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google認証情報が設定されていません" });
          }
          const auth = new GoogleAuth({
            credentials: {
              client_email: email,
              private_key: privateKey.replace(/\\n/g, "\n"),
            },
            scopes: ["https://www.googleapis.com/auth/drive.readonly"],
          });
          const client = await auth.getClient();
          const token = await client.getAccessToken();
          if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "トークン取得失敗" });
          const q = encodeURIComponent(`name contains '${input.query.replace(/'/g, "\\'")}'`);
          const fields = encodeURIComponent("files(id,name,mimeType,webViewLink,iconLink,modifiedTime)");
          const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=20&orderBy=modifiedTime+desc`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token.token}` },
          });
          if (!res.ok) {
            const text = await res.text();
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Drive APIエラー: ${res.status} ${text}` });
          }
          const data = await res.json() as { files: { id: string; name: string; mimeType: string; webViewLink: string; iconLink?: string; modifiedTime: string }[] };
          return data.files ?? [];
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(e) });
        }
      }),
  }),

  // スプレッドシートURL月次管理
  spreadsheetLinks: router({
    // 当月分のリンク一覧を取得（公開）
    // 当月分がなければ直近登録分を使用（月切替自動対応）
    getCurrent: publicProcedure.query(async () => {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const current = await getSpreadsheetLinks(yearMonth);
      if (current.length > 0) return current;
      // 当月分が未登録の場合、全登録から各linkKeyの最新分を返す
      const all = await getAllSpreadsheetLinks();
      if (all.length === 0) return [];
      // linkKeyごとに最新の登録を抽出
      const latestByKey = new Map<string, typeof all[0]>();
      for (const link of all) {
        const existing = latestByKey.get(link.linkKey);
        if (!existing || link.yearMonth > existing.yearMonth) {
          latestByKey.set(link.linkKey, link);
        }
      }
      return Array.from(latestByKey.values());
    }),
    // 全年月のリンク一覧を取得（管理者用）
    getAll: protectedProcedure.query(async () => {
      return getAllSpreadsheetLinks();
    }),
    // その他タブ用リンク一覧を取得（公開）
    getOther: publicProcedure.query(async () => {
      const all = await getAllSpreadsheetLinks();
      // displayTarget === "other" のものだけを返す（linkKeyごとに最新のもの）
      const otherLinks = all.filter((l) => l.displayTarget === "other");
      const latestByKey = new Map<string, typeof otherLinks[0]>();
      for (const link of otherLinks) {
        const existing = latestByKey.get(link.linkKey);
        if (!existing || link.yearMonth > existing.yearMonth) {
          latestByKey.set(link.linkKey, link);
        }
      }
      return Array.from(latestByKey.values());
    }),
    // リンクを登録または更新（管理者のみ）
    upsert: protectedProcedure
      .input(
        z.object({
          linkKey: z.string().min(1).max(100),
          label: z.string().min(1).max(100),
          yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "年月はYYYY-MM形式で入力してください"),
          url: z.string().url({ message: "有効なURLを入力してください" }),
          color: z.string().max(50).optional(),
          displayTarget: z.enum(["team", "common", "other"]).default("common"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const displayTarget = input.linkKey.startsWith("fee_") ? "team" : input.displayTarget;
        const id = await upsertSpreadsheetLink({
          linkKey: input.linkKey,
          label: input.label,
          yearMonth: input.yearMonth,
          url: input.url,
          color: input.color ?? "text-emerald-600",
          displayTarget,
          createdBy: ctx.user.id,
        });
        broadcastEvent("spreadsheetLinks");
        return { success: true, id };
      }),
    // \u30ea\u30f3\u30af\u3092\u524a\u9664\uff08\u7ba1\u7406\u8005\u306e\u307f\uff09
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSpreadsheetLink(input.id);
        broadcastEvent("spreadsheetLinks");
        return { success: true };
      }),
     // 業務日報の本日の日付タブのgidを取得
     getDailyReportSheetGid: publicProcedure
      .input(z.object({ spreadsheetId: z.string().optional() }).optional())
      .query(async ({ input }) => {
      const DEFAULT_SPREADSHEET_ID = "10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs";
      const targetSpreadsheetId = input?.spreadsheetId || DEFAULT_SPREADSHEET_ID;
      const auth = getAuth();
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "アクセストークンの取得に失敗しました" });

      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token.token}` } }
      );
      if (!metaRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "シート情報の取得に失敗しました" });
      const meta = await metaRes.json() as { sheets: { properties: { sheetId: number; title: string } }[] };

      // 本日の日付に一致するシートを検索（複数パターン対応）
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const candidates = [
        `${month}/${day}`,
        `${month}月${day}日`,
        `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
        `${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`,
      ];
      const sheet = meta.sheets.find((s) => candidates.includes(s.properties.title));
       return { gid: sheet?.properties.sheetId ?? null, title: sheet?.properties.title ?? null, spreadsheetId: targetSpreadsheetId };
    }),
    // 当月の業務日報URL取得（linkKey='daily_report'の当月登録を返す）
    getDailyReportUrl: publicProcedure.query(async () => {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      // まず当月分を検索
      const current = await getSpreadsheetLinks(yearMonth);
      const currentNippo = current.find((l) => l.linkKey === "daily_report");
      if (currentNippo) return { url: currentNippo.url, yearMonth: currentNippo.yearMonth };
      // 当月がなければ全登録から最新の daily_report を返す
      const all = await getAllSpreadsheetLinks();
      const allNippo = all
        .filter((l) => l.linkKey === "daily_report")
        .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
      if (allNippo.length > 0) return { url: allNippo[0].url, yearMonth: allNippo[0].yearMonth };
      return { url: null, yearMonth: null };
    }),
    // 一括登録（管理者のみ）
    batchUpsert: protectedProcedure
      .input(
        z.object({
          yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "年月はYYYY-MM形式で入力してください"),
          links: z.array(
            z.object({
              linkKey: z.string().min(1).max(100),
              label: z.string().min(1).max(100),
              url: z.string().url({ message: "有効なURLを入力してください" }),
              color: z.string().max(50).optional(),
              displayTarget: z.enum(["team", "common"]).default("common"),
            })
          ).min(1).max(20),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const results = await Promise.all(
          input.links.map((link) => {
            const displayTarget = link.linkKey.startsWith("fee_") ? "team" : link.displayTarget;
            return upsertSpreadsheetLink({
              linkKey: link.linkKey,
              label: link.label,
              yearMonth: input.yearMonth,
              url: link.url,
              color: link.color ?? "text-emerald-600",
              displayTarget,
              createdBy: ctx.user.id,
            });
          })
        );
        broadcastEvent("spreadsheetLinks");
        return { success: true, count: results.length };
      }),
  }),

  // スケジュールスクリーンショット
  schedule: router({
    // 全チーム・全日程のスクショ一覧を取得
    getAll: publicProcedure.query(async () => {
      const screenshots = await getAllScreenshots();

      // 今日の日付（日本時間でYYYY-MM-DD形式）
      const todayJST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const todayStr = `${todayJST.getFullYear()}-${String(todayJST.getMonth() + 1).padStart(2, "0")}-${String(todayJST.getDate()).padStart(2, "0")}`;

      // 日付文字列から相対的な日付ラベルを計算する関数
      const dayLabels = ["今日", "明日", "2日後", "3日後", "4日後"] as const;
      function computeRelativeDay(scheduleDate: string | null | undefined, fallbackDay: string): string {
        if (!scheduleDate) return fallbackDay; // scheduleDateがない古いレコードはdayをそのまま使用
        const diffMs = new Date(scheduleDate).getTime() - new Date(todayStr).getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0 || diffDays >= dayLabels.length) return fallbackDay; // 範囲外は元のdayを使用
        return dayLabels[diffDays];
      }

      return screenshots.map((s) => ({
        id: s.id,
        team: s.team,
        day: computeRelativeDay(s.scheduleDate, s.day),
        scheduleDate: s.scheduleDate,
        // imageUrlがdata:URLの場合は専用エンドポイントのURLに変換（Base64データをレスポンスに含めない）
        imageUrl: s.imageUrl?.startsWith("data:") ? `/api/screenshot/${s.id}` : s.imageUrl,
        uploadedByName: s.uploadedByName,
        updatedAt: s.updatedAt,
      }));
    }),

    // スクショをアップロード（S3に保存してDBに記録）
    upload: protectedProcedure
      .input(
        z.object({
          team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
          day: z.enum(["今日", "明日", "2日後", "3日後", "4日後"]),
          // base64エンコードされた画像データ（data:image/xxx;base64,... 形式）
          imageDataUrl: z.string().max(20 * 1024 * 1024), // 最大20MB（base64）
          mimeType: z.string().default("image/png"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // base64デコード
        const base64Data = input.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        if (buffer.length > 10 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ファイルサイズは10MB以下にしてください" });
        }

        // S3は完全廃止、Base64データを常にDBに直接保存
        let imageUrl: string;
        let imageKey: string;
        let imageData: string | undefined;

        imageData = input.imageDataUrl; // data:image/xxx;base64,...形式で保存
        imageKey = `db-${input.team}-${input.day}`;
        // imageUrlは後でDBのIDが確定してから /api/screenshot/:id に設定するため一時的にプレースホルダー
        imageUrl = `__db__`; // upsert後にIDで上書き

        // 実際の日付を計算（日本時間でYYYY-MM-DD形式）
        const todayJST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        const dayOffsets: Record<string, number> = {
          "今日": 0, "明日": 1, "2日後": 2, "3日後": 3, "4日後": 4,
        };
        const offset = dayOffsets[input.day] ?? 0;
        const targetDate = new Date(todayJST);
        targetDate.setDate(targetDate.getDate() + offset);
        const scheduleDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

        // DBにアップサート
        const recordId = await upsertScreenshot({
          team: input.team,
          day: input.day,
          scheduleDate,
          imageUrl,
          imageKey,
          imageData,
          uploadedBy: ctx.user.id,
          uploadedByName: ctx.user.name ?? "不明",
        });

        // DBのIDが確定したので imageUrl を /api/screenshot/:id に更新
        if (recordId) {
          await updateScreenshotUrl(recordId, `/api/screenshot/${recordId}`);
          imageUrl = `/api/screenshot/${recordId}`;
        }

        // アップロード履歴を記録
        await createScreenshotUploadLog({
          team: input.team,
          day: input.day,
          uploadedBy: ctx.user.id,
          uploadedByName: ctx.user.name ?? "不明",
        });

        // スケジュール更新通知を生成
        const notifBody = `${ctx.user.name ?? "不明"}さんが${input.team}チームの${input.day}のスケジュールを更新しました`;
        await createNotification({
          type: "schedule_updated",
          title: `スケジュールが更新されました`,
          body: notifBody,
        });

        // Web Push通知を送信（非同期でエラーを無視）
        try {
          const { sendPushToAll } = await import("./pushNotification");
          await sendPushToAll(
            {
              title: "📷 スケジュールが更新されました",
              body: notifBody,
              url: "/",
            },
            input.team // チームフィルター用に更新チームを渡す
          );
        } catch (e) {
          console.error("[WebPush] failed to send push:", e);
        }

        broadcastEvent("schedules");
        return { success: true, url: imageUrl };
      }),

    // スクショを削除
    delete: protectedProcedure
      .input(
        z.object({
          team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]),
              day: z.enum(["今日", "明日", "2日後", "3日後", "4日後"]),
        })
      )
      .mutation(async ({ input }) => {
        await deleteScreenshot(input.team, input.day);
        broadcastEvent("schedules");
        return { success: true };
      }),

    // 23:59に実行: 今日を削除し、明日→今日・2日後→明日・3日後→2日後・4日後→3日後にシフト
    rotateDailyScreenshots: protectedProcedure.mutation(async () => {
      const result = await rotateScheduleDays();
      broadcastEvent("schedules");
      return { success: true, ...result };
    }),

    // アップロード履歴を取得（最新N件）
    getUploadLogs: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
      .query(async ({ input }) => {
        const logs = await getRecentScreenshotUploadLogs(input?.limit ?? 20);
        return logs.map((l) => ({
          id: l.id,
           team: l.team,
          day: l.day,
          uploadedByName: l.uploadedByName,
          createdAt: l.createdAt,
        }));
      }),

    // ========== コメント・申し送り ==========
    getComments: publicProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        day: z.enum(["今日", "明日", "2日後", "3日後", "4日後"]),
      }))
      .query(async ({ input }) => {
        const comments = await getScheduleComments(input.team, input.day);
        if (comments.length === 0) return [];
        const ids = comments.map((c) => c.id);
        const reactions = await getScheduleCommentReactions(ids);
        return comments.map((c) => ({
          ...c,
          reactions: reactions.filter((r) => r.commentId === c.id),
        }));
      }),

    addComment: protectedProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        day: z.enum(["今日", "明日", "2日後", "3日後", "4日後"]),
        content: z.string().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await addScheduleComment({
          team: input.team,
          day: input.day,
          content: input.content,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "名前未設定",
        });
        // プッシュ通知を送信（非同期・エラーは無視）
        try {
          const { sendPushToAll } = await import("./pushNotification");
          const preview = input.content.length > 40 ? input.content.slice(0, 40) + "…" : input.content;
          await sendPushToAll(
            {
              title: `📋 ${input.team}チーム（${input.day}）に申し送りが届きました`,
              body: `${ctx.user.name ?? "スタッフ"}: ${preview}`,
              url: "/",
            },
            input.team
          );
        } catch (e) {
          console.warn("[Comment Push] 通知送信失敗:", e);
        }
        broadcastEvent("scheduleComments");
        return { id };
      }),

    deleteComment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteScheduleComment(input.id, ctx.user.id);
        broadcastEvent("scheduleComments");
        return { success: true };
      }),
    updateComment: protectedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateScheduleComment(input.id, ctx.user.id, input.content);
        broadcastEvent("scheduleComments");
        return { success: true };
      }),
    toggleReaction: protectedProcedure
      .input(z.object({
        commentId: z.number(),
        emoji: z.string().min(1).max(10),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await toggleScheduleCommentReaction(
          input.commentId,
          ctx.user.id,
          ctx.user.name ?? "名前未設定",
          input.emoji
        );
        broadcastEvent("scheduleComments");
        return result;
      }),

    getCommentCounts: publicProcedure
      .input(z.object({
        day: z.enum(["今日", "明日", "2日後", "3日後", "4日後"]),
      }))
      .query(async ({ input }) => {
        return getScheduleCommentCounts(input.day);
      }),
  }),
  // ========== タスク ==========
  tasks: router({
    // 自分に関係するタスクを取得
    getMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { eq } = await import("drizzle-orm");
      const { users } = await import("../drizzle/schema");
      const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const userTeam = userRows[0]?.team ?? null;
      return getMyTasks(ctx.user.id, userTeam);
    }),

    // タスクを作成する
    create: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(500),
          dueDate: z.date().optional(),
          taskKind: z.enum(["at_time", "by_deadline", "next_visit"]).default("at_time"),
          assignType: z.enum(["all", "team", "personal"]).default("all"),
          assignTeam: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional(),
          assignUserId: z.number().optional(),
          assignUserName: z.string().optional(),
          patientName: z.string().optional(),
          repeatType: z.enum(["none", "weekly", "monthly"]).default("none"),
          repeatDayOfWeek: z.number().min(0).max(6).optional(),
          repeatDayOfMonth: z.number().min(1).max(31).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createTask({
          text: input.text,
          dueDate: input.dueDate,
          taskKind: input.taskKind,
          assignType: input.assignType,
          assignTeam: input.assignTeam,
          assignUserId: input.assignUserId,
          assignUserName: input.assignUserName,
          patientName: input.patientName,
          repeatType: input.repeatType,
          repeatDayOfWeek: input.repeatDayOfWeek,
          repeatDayOfMonth: input.repeatDayOfMonth,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
          done: 0,
        });
        // タスク追加通知を生成
        const assignLabel =
          input.assignType === "all" ? "全スタッフ" :
          input.assignType === "team" ? `${input.assignTeam ?? ""}チーム` :
          input.assignUserName ?? "個人指定";
        await createNotification({
          type: "task_today",
          title: `新しいタスクが追加されました`,
          body: `${ctx.user.name ?? "不明"}さんが「${input.text}」を${assignLabel}に追加しました`,
          resourceId: id,
        });
        broadcastEvent("tasks");
        return { success: true, id };
      }),

    // タスクの完了状態を切り替える
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), done: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await toggleTask(input.id, input.done, ctx.user.id);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // タスクをソフトデリートする（作成者のみ）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
        if (task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者のみ削除できます" });
        }
        await softDeleteTask(input.id, ctx.user.id);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // 削除済みタスクを復元する（作成者のみ）
    restore: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
        if (task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者のみ復元できます" });
        }
        await restoreTask(input.id, ctx.user.id);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // 削除済みタスク一覧を取得する（自分が作成したもの）
    getDeleted: protectedProcedure.query(async ({ ctx }) => {
      return getDeletedTasks(ctx.user.id);
    }),

    // タスクを完全削除する（作成者のみ、削除済みタスクのみ）
    permanentDelete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
        if (task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者のみ完全削除できます" });
        }
        if (!task.deletedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "削除済みタスクのみ完全削除できます" });
        }
        await deleteTaskDb(input.id, ctx.user.id);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // タスクを更新（作成者のみ）
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          text: z.string().min(1).optional(),
          dueDate: z.date().nullable().optional(),
          taskKind: z.enum(["at_time", "by_deadline", "next_visit"]).optional(),
          assignType: z.enum(["all", "team", "personal"]).optional(),
          assignTeam: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).nullable().optional(),
          assignUserId: z.number().nullable().optional(),
          assignUserName: z.string().nullable().optional(),
          patientName: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
        if (task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者のみ編集できます" });
        }
        const { id, ...data } = input;
        await updateTask(id, ctx.user.id, data);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // スタッフ一覧を取得（個人指定用）
    getStaff: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { eq } = await import("drizzle-orm");
      const { users } = await import("../drizzle/schema");
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        team: users.team,
      }).from(users);
      return allUsers;
    }),
    // 音声入力テキストからタスク内容・期日・指定先をAI解析
    parseVoice: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        patientNames: z.array(z.string()).optional(),
        patientNamesWithKana: z.array(z.object({ name: z.string(), kana: z.string() })).optional(),
        staffNames: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        let patientListStr = '';
        if (input.patientNamesWithKana && input.patientNamesWithKana.length > 0) {
          const entries = input.patientNamesWithKana
            .map(p => p.kana ? `${p.name}（${p.kana}）` : p.name)
            .join('、');
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientNameに正式名を返すこと。姓のみ・読み仮名・略称で言及されても正式名を返すこと）:\n${entries}`;
        } else if (input.patientNames && input.patientNames.length > 0) {
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientNameに返すこと）:\n${input.patientNames.join('、')}`;
        }
        const staffListStr = input.staffNames && input.staffNames.length > 0
          ? `\n\n登録済みスタッフリスト（assignPersonNameはこの中から選ぶこと）:\n${input.staffNames.join('、')}`
          : '';
        const today2 = new Date();
        const dayNames2 = ['日', '月', '火', '水', '木', '金', '土'];
        const todayDayName2 = dayNames2[today2.getDay()];
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、タスクの各項目を抽出してJSONで返してください。
今日は${todayStr}（${todayDayName2}曜日）です。

日付解析ルール（必ず遵守）:
1. 相対表現: 「今日」「明日」「明後日」「明々後日」「昨日」「一昨昨日」→ 今日からの相対日数で正確に計算
2. 曜日指定: 「次の火曜日」「今週の金曜日」「次の月曜日」→ 今日から最も近いその曜日（今日がその曜日なら翻週の同曜日）
3. 週表現: 「来週」→ 来週の月曜日、「再来週」→ 2週間後の月曜日、「今週」→ 今週の月曜日
4. 日付のみ: 「4月。7日」「4/7」→ 年は今年または来年の近い方を選択
5. 月末・月初: 「今月末」→ 今月最終日、「来月初」→ 来月、1日

重要：音声入力では言い間違いを訂正する場合があります。以下のような訂正・言い直しを示す表現がある場合は、その後に続く内容（最後に言及された内容）を正しい値として採用してください。
訂正表現の例：「じゃなくて」「ではなく」「違います」「違う」「あ、違う」「間違えました」「間違い」「取り消して」「やっぱり」「やっぱ」「えーと」「あ、えーと」「そうじゃなくて」「ちがう」「いや」「いや、違う」「ごめん」「ごめんなさい」「訂正します」「訂正して」「修正して」「変えて」「なくて」「じゃなく」「ではなくて」「でなく」「でなくて」「ちょっと待って」「待って」「ちょっと待ってください」「もう一度」「もう一回」「やり直し」「やり直して」「最初から」「リセット」「キャンセル」「なしで」「なしにして」「消して」「削除して」「戻して」「前に戻って」「そうではなくて」「そうじゃない」「そうじゃないです」「そうではない」「そうではありません」「別の」「別にして」「他の」「他にして」「違う人」「違う名前」「違う日」「違う時間」「違う日時」「ではなかった」「じゃなかった」「ではありません」「じゃありません」「ではないです」「じゃないです」「ちゃう」「ちゃうちゃう」「あかん」「あかんあかん」「ちゃうんちゃう」「ちゃうわ」「ちゃいます」「ちゃいますよ」「ちゃうで」「ちゃうやん」「ちゃうやろ」「ちゃうんや」「ちゃうんです」「ちゃうかな」「ちゃうかも」「あれちゃう」「それちゃう」「ちゃうかった」「ちゃうかったわ」「ちゃうかったです」「違うわ」「違うやん」「違うやろ」「違うんや」「違うんちゃう」「違うかな」「違うかも」「違うかった」「あ、ちゃう」「あ、ちゃうちゃう」「ちゃうちゃう、」「あかんわ」「あかんやん」「あかんやろ」「それあかん」「それはあかん」「それちゃうわ」「それちゃうやん」「それちゃうやろ」「それちゃうんや」「それちゃうんちゃう」「それちゃうかな」「それちゃうかも」「それちゃうかった」
抽出項目:
- text: タスク内容・やることの説明（必須）。利用者名は含めず、行為・作業内容のみを記載すること（例：「中尾さんの自立支援の受給者証の写真を撮る」→「自立支援の受給者証の写真を撮る」）
- dueDateStr: 期日日付（YYYY-MM-DD形式）。不明な場合はnull
- assignType: 指定先の種別。「全員」「全スタッフ」「全体」など→all、「身体チーム」「身体」「天理チーム」「天理」「郡山北部チーム」「北部」「郡山南部チーム」「南部」などチームを指す表現→team、登録済みスタッフリストに含まれるスタッフ名が明示された場合→personal。重要：利用者（患者）の名前は利用者リストに登録されており、assignタイプには影響しない。利用者名だけでチーム名がない場合はall。不明な場合はall
- assignTeam: assignTypeがteamの場合のチーム名。「身体」「身体チーム」→身体、「天理」「天理チーム」→天理、「郡山北部」「北部」「北部チーム」→郡山北部、「郡山南部」「南部」「南部チーム」→郡山南部。不明な場合はnull
- assignPersonName: assignTypeがpersonalの場合の担当者名（姓のみで可）。必ず登録済みスタッフリストに含まれる名前のみ設定すること。利用者名は設定しないこと。不明な場合はnull
- patientName: 利用者（患者）の名前。「○○さん」「○○の」など利用者を指す表現から抽出。利用者リストがある場合はリストから最も近い名前を完全な形で返す（姓のみ・読み仮名・略称で言及されても正式名を返す）。ただし、同じ姓の利用者が複数登録されている場合や、姓のみで言及された場合は姓のみを返すこと（例：登録利用者に「森本孝枝」「森本太郎」がいる場合に「森本さん」→「森本」と返す）。担当スタッフ名と混同しないこと。不明な場合はnull
不明な項目はnullを返してください。必ず有効なJSONのみを返してください。${patientListStr}${staffListStr}`;
        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "task_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  dueDateStr: { type: ["string", "null"] },
                  assignType: { type: "string", enum: ["all", "team", "personal"] },
                  assignTeam: { type: ["string", "null"] },
                  assignPersonName: { type: ["string", "null"] },
                  patientName: { type: ["string", "null"] },
                },
                required: ["text", "dueDateStr", "assignType", "assignTeam", "assignPersonName", "patientName"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });
        try {
          const parsed = JSON.parse(content);
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),

    // 利用者名でタスクを取得する（訪問チェック項目用）
    getByPatientName: protectedProcedure
      .input(z.object({ patientName: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { isNull, eq, and } = await import("drizzle-orm");
        const { tasks } = await import("../drizzle/schema");
        return db.select().from(tasks).where(
          and(
            isNull(tasks.deletedAt),
            eq(tasks.patientName, input.patientName)
          )
        ).orderBy(tasks.createdAt);
      }),
  }),
  // ========== メッセージ ===========
  messages: router({
    // 現在表示すべきメッセージ一覧（リアクション付き）
    getActive: protectedProcedure.query(async () => {
      // 期限切れを先に自動削除
      await expireMessages();
      const msgs = await getActiveMessages();
      if (msgs.length === 0) return [];
      const ids = msgs.map((m) => m.id);
      const reactions = await getReactionsByMessageIds(ids);
      return msgs.map((m) => ({
        ...m,
        reactions: reactions.filter((r) => r.messageId === m.id),
      }));
    }),

    // 予約送信待ちメッセージ一覧（まだ送信されていないもの）
    // 管理者は全件、一般ユーザーは自分が登録したものだけ返す
    getPending: protectedProcedure.query(async ({ ctx }) => {
      const msgs = await getPendingMessages();
      if (ctx.user.role === "admin") return msgs;
      return msgs.filter((m) => m.createdBy === ctx.user.id);
    }),

    // メッセージを作成する
    create: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(1000),
          displayFrom: z.date().optional(),
          displayUntil: z.date().optional(),
          scheduledAt: z.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createMessage({
          text: input.text,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
          displayFrom: input.displayFrom,
          displayUntil: input.displayUntil,
          scheduledAt: input.scheduledAt,
        });
        // 新着メッセージ通知を生成
        const preview = input.text.length > 40 ? input.text.slice(0, 40) + "…" : input.text;
        await createNotification({
          type: "new_message",
          title: `新しいメッセージが追加されました`,
          body: `${ctx.user.name ?? "不明"}さん：「${preview}」`,
          resourceId: id,
        });
        broadcastEvent("messages");
        return { success: true, id };
      }),

    // メッセージを手動削除する（作成者または管理者）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const msg = await getMessageById(input.id);
        if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "メッセージが見つかりません" });
        // 管理者は全員分削除可能、それ以外は作成者のみ
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin" && msg.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者または管理者のみ削除できます" });
        }
        await softDeleteMessage(input.id, ctx.user.id);
        broadcastEvent("messages");
        return { success: true };
      }),

    // メッセージを編集する（作成者または管理者）
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          text: z.string().min(1).max(1000),
          displayFrom: z.date().optional().nullable(),
          displayUntil: z.date().optional().nullable(),
          scheduledAt: z.date().optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const msg = await getMessageById(input.id);
        if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "メッセージが見つかりません" });
        // 管理者は全員分編集可能、それ以外は作成者のみ
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin" && msg.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者または管理者のみ編集できます" });
        }
        await updateMessage(input.id, ctx.user.id, {
          text: input.text,
          displayFrom: input.displayFrom ?? null,
          displayUntil: input.displayUntil ?? null,
          scheduledAt: input.scheduledAt ?? null,
        });
        broadcastEvent("messages");
        return { success: true };
      }),

    // リアクションをトグルする
    toggleReaction: protectedProcedure
      .input(z.object({ messageId: z.number(), emoji: z.string().max(10) }))
      .mutation(async ({ ctx, input }) => {
        broadcastEvent("messages");
        const result = await toggleReaction(
          input.messageId,
          ctx.user.id,
          ctx.user.name ?? "不明",
          input.emoji
        );
        return result;
      }),
    // 音声テキストからメッセージ各項目を抽出する
    parseVoice: protectedProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        const today3 = new Date();
        const dayNames3 = ['日', '月', '火', '水', '木', '金', '土'];
        const todayDayName3 = dayNames3[today3.getDay()];
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、申し送りメッセージの各項目を抽出してJSONで返してください。
今日は${todayStr}（${todayDayName3}曜日）です。

日時解析ルール（必ず遵守）:
1. 相対表現: 「今日」「明日」「明後日」「明々後日」「昨日」→ 今日からの相対日数で正確に計算
2. 曜日指定: 「次の火曜日」「今週の金曜日」→ 今日から最も近いその曜日（今日がその曜日なら翻週の同曜日）
3. 週表現: 「来週」→ 来週の月曜日、「再来週」→ 2週間後の月曜日、「今週」→ 今週の月曜日
4. 時刻解析: 「14時」→ 14:00、「午前9時」→ 09:00、「午後2時」→ 14:00、「午後2時半」→ 14:30、「午後」のみ→ 12:00、「午前」のみ→ 09:00
5. 時間帯: 「朝」「午前中」→ 09:00、「昂」「昂山時」→ 11:00、「昇後」「昇後中」→ 13:00、「午後中」→ 14:00、「夕方」→ 17:00、「夜」→ 19:00
6. 日付のみ: 「4月。7日」「4/7」→ 年は今年または来年の近い方を選択

抽出項目:
- text: メッセージ本文（必須）。音声から読み取れる内容を自然な文章にまとめてください
- displayFromDate: 表示開始日（YYYY-MM-DD形式）。「〜から表示」「〜以降」などが含まれる場合に抽出。不明な場合はnull
- displayFromTime: 表示開始時刻（HH:mm形式）。不明な場合はnull
- displayUntilDate: 表示終了日（YYYY-MM-DD形式）。「〜まで」「〜以降は削除」などが含まれる場合に抽出。不明な場合はnull
- displayUntilTime: 表示終了時刻（HH:mm形式）。不明な場合はnull
- scheduledAtDate: 予約送信日（YYYY-MM-DD形式）。「〜に送信」「〜に投稿」などが含まれる場合に抽出。不明な場合はnull
- scheduledAtTime: 予約送信時刻（HH:mm形式）。不明な場合はnull
不明な項目はnullを返してください。必ず有効なJSONのみを返してください。`;
        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "message_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  displayFromDate: { type: ["string", "null"] },
                  displayFromTime: { type: ["string", "null"] },
                  displayUntilDate: { type: ["string", "null"] },
                  displayUntilTime: { type: ["string", "null"] },
                  scheduledAtDate: { type: ["string", "null"] },
                  scheduledAtTime: { type: ["string", "null"] },
                },
                required: ["text", "displayFromDate", "displayFromTime", "displayUntilDate", "displayUntilTime", "scheduledAtDate", "scheduledAtTime"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });
        try {
          const parsed = JSON.parse(content);
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),
  }),  // ========== Web Push通知 ==========
  push: router({
    // VAPID公開鍵を返す
    getVapidPublicKey: publicProcedure.query(async () => {
      const { ENV } = await import("./_core/env");
      return { publicKey: ENV.vapidPublicKey ?? "" };
    }),
    // サブスクリプションを登録
    subscribe: protectedProcedure
      .input(z.object({
        endpoint: z.string().url(),
        p256dh: z.string(),
        auth: z.string(),
        /** null = 全チーム、文字列 = 指定チームのみ */
        teamFilter: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { saveSubscription } = await import("./pushNotification");
        await saveSubscription({
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userId: ctx.user.id,
          userName: ctx.user.name ?? undefined,
          teamFilter: input.teamFilter ?? null,
        });
        return { success: true };
      }),
    // サブスクリプションを解除
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string() }))
      .mutation(async ({ input }) => {
        const { deleteSubscription } = await import("./pushNotification");
        await deleteSubscription(input.endpoint);
        return { success: true };
      }),
  }),

  // ========== スタッフ管理 ==========
  patients: router({
    // 利用者一覧を取得（チーム絞り込み可）
    list: protectedProcedure
      .input(z.object({ team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional() }))
      .query(async ({ input }) => {
        return getPatients(input.team);
      }),

    // 利用者を名前で検索
    search: protectedProcedure
      .input(z.object({ query: z.string(), team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional() }))
      .query(async ({ input }) => {
        return searchPatients(input.query, input.team);
      }),

    // 利用者を追加（管理者のみ）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        nameKana: z.string().max(100).optional(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        patientCode: z.string().max(50).optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createPatient({ name: input.name, nameKana: input.nameKana, team: input.team, active: 1, patientCode: input.patientCode ?? null });
        broadcastEvent("patients");
        return { success: true, id };
      }),

    // 利用者を更新
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        nameKana: z.string().max(100).optional(),
        team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]).optional(),
        patientCode: z.string().max(50).optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updatePatient(id, data as any);
        broadcastEvent("patients");
        return { success: true };
      }),

    // 全利用者を取得（退所済も含む）
    listAll: protectedProcedure
      .input(z.object({ team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]).optional() }))
      .query(async ({ input }) => {
        return getAllPatientsIncludingInactive(input.team);
      }),

    // 利用者を退所扱いにする（active=0）
    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deactivatePatient(input.id);
        broadcastEvent("patients");
        return { success: true };
      }),

    // 利用者を復帰させる（active=1）
    activate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await updatePatient(input.id, { active: 1 });
        broadcastEvent("patients");
        return { success: true };
      }),

    // 利用者を一括登録
    batchCreate: protectedProcedure
      .input(z.object({
        patients: z.array(z.object({
          name: z.string().min(1).max(100),
          nameKana: z.string().max(100).optional(),
          team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]),
        })).min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        const results = await Promise.all(
          input.patients.map(p => createPatient({ name: p.name, nameKana: p.nameKana, team: p.team, active: 1 }))
        );
        broadcastEvent("patients");
        return { success: true, count: results.length };
      }),
  }),

  // ========== 訪問記録 ==========
  visitRecords: router({
    // 訪問記録を作成する
    create: protectedProcedure
      .input(z.object({
        patientId: z.number().optional(),
        patientName: z.string(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        clinicalNotes: z.string().optional(),
        nextVisitAt: z.date().optional(),
        notifiedTo: z.enum(["本人", "家族", "その他"]).optional(),
        notifiedToOther: z.string().optional(),
        notifyMethod: z.enum(["口頭", "カレンダー記入", "付箋", "電話", "その他"]).optional(),
        notifyMethodOther: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await upsertTodayVisitRecord({
          ...input,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        broadcastEvent("visitRecords");
        return { success: true, id };
      }),

    // 自分の訪問記録一覧を取得
    getMine: protectedProcedure.query(async ({ ctx }) => {
      return getVisitRecords(ctx.user.id);
    }),

    // スプレッドシート転送済みフラグを更新
    markExported: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await markVisitRecordExported(input.id);
        broadcastEvent("visitRecords");
        return { success: true };
      }),

    // スプレッドシートに転送する
    exportToSheet: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const record = await getVisitRecordById(input.id);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "記録が見つかりません" });

        const VISIT_RECORD_SHEET_ID = "1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo"; // ひなた_次回訪問日時
        // チームに基づいてシート名を決定（チーム別タブ）
        const getVisitTeamSheetName = (team: string | null | undefined): string => {
          const validTeams = ["身体", "天理", "郡山北部", "郡山南部"];
          if (team && validTeams.includes(team)) return team;
          return "その他";
        };
        const SHEET_NAME = getVisitTeamSheetName(record.team);

        // サービスアカウント認証
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "サービスアカウント設定がありません" });

        const { GoogleAuth } = await import("google-auth-library");
        const auth = new GoogleAuth({
          credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "認証トークン取得失敗" });

        // 日時フォーマット（JST: UTC+9 に変換して書き込む）
        const formatDate = (val: Date | number | null | undefined) => {
          if (!val) return "";
          const d = val instanceof Date ? val : new Date(val);
          // UTC+9（JST）に変換
          const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,"0")}/${String(jst.getUTCDate()).padStart(2,"0")} ${String(jst.getUTCHours()).padStart(2,"0")}:${String(jst.getUTCMinutes()).padStart(2,"0")}`;
        };

        // ヘッダー行の定義（ダッシュボード入力項目と整合）
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
        const row = [
          formatDate(record.createdAt),
          record.createdByName ?? "",
          record.team ?? "",
          record.patientName ?? "",
          formatDate(record.nextVisitAt),
          record.notifiedTo ?? "",
          record.notifiedToOther ?? "",
          record.notifyMethod ?? "",
          record.notifyMethodOther ?? "",
        ];

        // シートの存在確認（チーム別タブの自動作成対応）
        const metaCheckRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`, {
          headers: { Authorization: `Bearer ${token.token}` },
        });
        if (metaCheckRes.ok) {
          const metaCheck = await metaCheckRes.json() as { sheets?: { properties: { title: string } }[] };
          const sheetAlreadyExists = metaCheck.sheets?.some(s => s.properties.title === SHEET_NAME);
          if (!sheetAlreadyExists) {
            // シートがなければ新規作成
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
            });
          }
        }

        // 現在のシートの内容を確認してヘッダー行がなければ先に書き込む
        const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}?valueRenderOption=UNFORMATTED_VALUE`;
        const checkRes = await fetch(checkUrl, {
          headers: { Authorization: `Bearer ${token.token}` },
        });
        const checkData = checkRes.ok ? await checkRes.json() as { values?: string[][] } : { values: [] };
        const firstCell = checkData.values?.[0]?.[0] ?? "";
        if (firstCell !== "転送日時") {
          // ヘッダー行を1行目に書き込む
          const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}?valueInputOption=USER_ENTERED`;
          await fetch(headerUrl, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [HEADER_ROW] }),
          });
        }

        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:J")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const res = await fetch(appendUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [row] }),
        });
        if (!res.ok) {
          const text = await res.text();
          let userMessage = "スプレッドシートへの転送に失敗しました";
          let errorCode: "INTERNAL_SERVER_ERROR" | "FORBIDDEN" | "UNAUTHORIZED" = "INTERNAL_SERVER_ERROR";
          try {
            const errJson = JSON.parse(text);
            const status = res.status;
            const errMsg = errJson?.error?.message ?? "";
            if (status === 401 || status === 403) {
              errorCode = "FORBIDDEN";
              userMessage = "スプレッドシートへのアクセス権限がありません。管理者にお問い合わせください。";
            } else if (status === 404) {
              userMessage = "スプレッドシートが見つかりません。URLや共有設定を確認してください。";
            } else if (status === 429) {
              userMessage = "APIの利用制限に達しました。しばらく待ってから再試行してください。";
            } else if (errMsg.includes("RESOURCE_EXHAUSTED")) {
              userMessage = "APIの利用制限に達しました。しばらく待ってから再試行してください。";
            } else if (errMsg.includes("SERVICE_UNAVAILABLE") || status >= 500) {
              userMessage = "Googleのサービスが一時的に利用できません。しばらく待ってから再試行してください。";
            } else if (errMsg) {
              userMessage = `転送エラー: ${errMsg}`;
            }
          } catch {
            // JSONパース失敗時はデフォルトメッセージを使用
          }
          throw new TRPCError({ code: errorCode, message: userMessage });
        }

        // シートIDを取得してヘッダー書式・列幅・オートフィルターを設定（初回転送時のみ実行）
        try {
          const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`, {
            headers: { Authorization: `Bearer ${token.token}` },
          });
          if (metaRes.ok) {
            const meta = await metaRes.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
            // シート名で該当タブのsheetIdを取得（チーム別タブ対応）
            const sheetInfo = meta.sheets?.find(s => s.properties.title === SHEET_NAME);
            const sheetId = sheetInfo?.properties?.sheetId ?? 0;

            // 転送済み行数を取得して書式を適用
            const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:A")}`, {
              headers: { Authorization: `Bearer ${token.token}` },
            });
            const valuesData = valuesRes.ok ? await valuesRes.json() as { values?: string[][] } : { values: [] };
            const totalRows = (valuesData.values?.length ?? 1);
            const dataEndRow = Math.max(totalRows, 2); // データ行の終わり（最低2行）

            // batchUpdateで全書式を一括設定
            const batchBody = {
              requests: [
                // 1. ヘッダー行（1行目）：深青背景・白太字・中央揃え・フォントサイズ11
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
                    cell: {
                      userEnteredFormat: {
                        backgroundColor: { red: 0.165, green: 0.329, blue: 0.573 }, // #2A5492 深青
                        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11, fontFamily: "Noto Sans JP" },
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "MIDDLE",
                        wrapStrategy: "WRAP",
                        padding: { top: 6, bottom: 6, left: 6, right: 6 },
                      },
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,padding)",
                  },
                },
                // 2. データ行全体：フォント・垂直中央・パディング
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 9 },
                    cell: {
                      userEnteredFormat: {
                        textFormat: { fontSize: 10, fontFamily: "Noto Sans JP" },
                        verticalAlignment: "MIDDLE",
                        padding: { top: 4, bottom: 4, left: 6, right: 6 },
                      },
                    },
                    fields: "userEnteredFormat(textFormat,verticalAlignment,padding)",
                  },
                },
                // 3. 伝達方法（その他）列（I列）のみテキスト折り返し
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 8, endColumnIndex: 9 },
                    cell: {
                      userEnteredFormat: {
                        wrapStrategy: "WRAP",
                      },
                    },
                    fields: "userEnteredFormat.wrapStrategy",
                  },
                },
                // 4. 奇数行（データ行）：白背景
                ...Array.from({ length: Math.ceil((dataEndRow - 1) / 2) }, (_, i) => ({
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1 + i * 2, endRowIndex: Math.min(2 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
                    fields: "userEnteredFormat.backgroundColor",
                  },
                })),
                // 5. 偶数行（データ行）：極淡青背景 #EBF3FB
                ...Array.from({ length: Math.floor((dataEndRow - 1) / 2) }, (_, i) => ({
                  repeatCell: {
                    range: { sheetId, startRowIndex: 2 + i * 2, endRowIndex: Math.min(3 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 0.922, green: 0.953, blue: 0.984 } } },
                    fields: "userEnteredFormat.backgroundColor",
                  },
                })),
                // 6. 全セルに枠線を追加
                {
                  updateBorders: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 9 },
                    top:    { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    bottom: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    left:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    right:  { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    innerHorizontal: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    innerVertical:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                  },
                },
                // 7. 列幅を内容に合わせて設定
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 転送日時
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 担当者
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // チーム
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 利用者名
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 次回訪問日時
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 伝達先
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 伝達先(その他)
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 110 }, fields: "pixelSize" } }, // 伝達方法
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 伝達方法(その他)

                // 8. 行の高さ：ヘッダー行を少し高めに
                { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } },
                // 9. オートフィルターを設定（全列）
                {
                  setBasicFilter: {
                    filter: {
                      range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 9 },
                    },
                  },
                },
                // 10. ヘッダー行を固定（フリーズ）
                {
                  updateSheetProperties: {
                    properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                    fields: "gridProperties.frozenRowCount",
                  },
                },
                // 11. 転送日時（A列）に日時書式を設定
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 1 },
                    cell: {
                      userEnteredFormat: {
                        numberFormat: { type: "DATE_TIME", pattern: "yyyy/mm/dd hh:mm" },
                      },
                    },
                    fields: "userEnteredFormat.numberFormat",
                  },
                },
                // 12. 次回訪問日時（E列）に日時書式を設定
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 4, endColumnIndex: 5 },
                    cell: {
                      userEnteredFormat: {
                        numberFormat: { type: "DATE_TIME", pattern: "yyyy/mm/dd hh:mm" },
                      },
                    },
                    fields: "userEnteredFormat.numberFormat",
                  },
                },
              ],
            };
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify(batchBody),
            });
          }
        } catch {
          // 書式設定の失敗は転送自体に影響しない
        }

        // 転送済みフラグを立てる
        await markVisitRecordExported(input.id);
        return { success: true };
      }),

    // 転送済みフラグをリセット（未転送に戻す）
    unmarkExported: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await unmarkVisitRecordExported(input.id);
        broadcastEvent("visitRecords");
        return { success: true };
      }),

    // 音声テキストをLLMで解析し利用者名・次回訪問日時・伝達先・伝達方法を抽出する
    parseVisitVoice: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        patientNames: z.array(z.string()).optional(),
        patientNamesWithKana: z.array(z.object({ name: z.string(), kana: z.string() })).optional(),
        staffNames: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        // JSTで今日の日付を計算
        const jstNow = new Date(today.getTime() + 9 * 60 * 60 * 1000);
        const todayStr = `${jstNow.getUTCFullYear()}年${jstNow.getUTCMonth() + 1}月${jstNow.getUTCDate()}日`;
        const todayISO = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][jstNow.getUTCDay()];
        // 今週・来週の各曜日の日付を計算（月曜始まり）
        const weekDates: Record<string, string> = {};
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        for (let i = 0; i < 14; i++) {
          const d = new Date(jstNow.getTime() + i * 24 * 60 * 60 * 1000);
          const dn = dayNames[d.getUTCDay()];
          const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          if (i === 0) weekDates[`今日(${dn})`] = ds;
          else if (i === 1) weekDates[`明日(${dn})`] = ds;
          else if (i === 2) weekDates[`明後日(${dn})`] = ds;
          else {
            const label = i <= 6 ? `今週${dn}曜日` : `来週${dn}曜日`;
            if (!weekDates[label]) weekDates[label] = ds;
          }
        }
        const weekDatesStr = Object.entries(weekDates)
          .map(([k, v]) => `${k}=${v}`)
          .join('、');
        // 読み仮名付き利用者リストを構築（読み仮名があれば「正式名（読み）」形式で表示）
        let patientListStr = '';
        if (input.patientNamesWithKana && input.patientNamesWithKana.length > 0) {
          const entries = input.patientNamesWithKana
            .map(p => p.kana ? `${p.name}（${p.kana}）` : p.name)
            .join('、');
          patientListStr = `\n\n登録済利用者リスト（正式名（読み仮名）の形式）:\n${entries}\n\n【利用者名マッチングの重要ルール】\n- 音声で聞こえた読み方（ひらがな・カタカナ）を上記リストの読み仮名と照合し、最も近い利用者の正式名を返すこと\n- 特殊な漢字（難読字・旧字体など）でも、読み仮名が一致すれば必ずその正式名を返すこと\n- 例：「かせいとおる」「かせい」→「絈井達」、「ゆあさ」「ゆあさまさと」→「湯浅全人」\n- 姓のみ言及された場合でも読み仮名から特定できれば正式名を返すこと\n- 同姓が複数いる場合のみ姓のみを返すこと`;
        } else if (input.patientNames && input.patientNames.length > 0) {
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientNameに返すこと。姓のみで言及されても正式名を返すこと）:\n${input.patientNames.join('、')}`;
        }
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、利用者名・次回訪問日時・伝達先・伝達方法を抽出してJSONで返してください。

【今日の情報】
今日は${todayStr}（${dayOfWeek}曜日）です。
今後14日間の曜日対応表：${weekDatesStr}

【日付の解釈ルール】
- 「今日」「本日」→ ${todayISO}
- 「明日」「あした」→ 明日の日付
- 「明後日」「あさって」→ 明後日の日付
- 「今週○曜日」「今週の○曜日」→ 今週の該当曜日（上記対応表を参照）
- 「来週○曜日」「来週の○曜日」→ 来週の該当曜日（上記対応表を参照）
- 「○曜日」だけで「今週・来週」の指定がない場合→ 今日以降で最も近い該当曜日
- 「○月○日」「○日」→ 今月または翌月の該当日（過去にならないよう解釈）
- 「今月○日」「来月○日」→ 明示的な月を使って解釈
- 日付は必ずYYYY-MM-DD形式で返すこと

【時刻の解釈ルール】
- 「○時」だけで分の指定がない場合→ 「○時00分」として解釈（例：「14時」→「14:00」）
- 「○時半」→ 「○時30分」として解釈（例：「10時半」→「10:30」）
- 「○時○分」→ そのまま解釈
- 「午前○時」「朝○時」→ 00:00〜11:59の範囲で解釈
- 「午後○時」「昼○時」「夜○時」→ 12:00〜23:59の範囲で解釈（「午後1時」→「13:00」）
- 「夕方○時」→ 16:00〜18:59の範囲で解釈
- 「夜○時」→ 19:00〜23:59の範囲で解釈
- 時刻は必ずHH:mm形式で返すこと（例：「9:00」ではなく「09:00」）

【訂正表現の処理】
音声入力では言い間違いを訂正する場合があります。以下のような訂正・言い直しを示す表現がある場合は、その後に続く内容（最後に言及された内容）を正しい値として採用してください。
訂正表現の例：「じゃなくて」「ではなく」「違います」「違う」「あ、違う」「間違えました」「間違い」「取り消して」「やっぱり」「やっぱ」「えーと」「あ、えーと」「そうじゃなくて」「ちがう」「いや」「いや、違う」「ごめん」「ごめんなさい」「訂正します」「訂正して」「修正して」「変えて」「なくて」「じゃなく」「ではなくて」「でなく」「でなくて」「ちょっと待って」「待って」「ちょっと待ってください」「もう一度」「もう一回」「やり直し」「やり直して」「最初から」「リセット」「キャンセル」「なしで」「なしにして」「消して」「削除して」「戻して」「前に戻って」「そうではなくて」「そうじゃない」「そうじゃないです」「そうではない」「そうではありません」「別の」「別にして」「他の」「他にして」「違う人」「違う名前」「違う日」「違う時間」「違う日時」「ではなかった」「じゃなかった」「ではありません」「じゃありません」「ではないです」「じゃないです」「ちゃう」「ちゃうちゃう」「あかん」「あかんあかん」「ちゃうんちゃう」「ちゃうわ」「ちゃいます」「ちゃいますよ」「ちゃうで」「ちゃうやん」「ちゃうやろ」「ちゃうんや」「ちゃうんです」「ちゃうかな」「ちゃうかも」「あれちゃう」「それちゃう」「ちゃうかった」「ちゃうかったわ」「ちゃうかったです」「違うわ」「違うやん」「違うやろ」「違うんや」「違うんちゃう」「違うかな」「違うかも」「違うかった」「あ、ちゃう」「あ、ちゃうちゃう」「ちゃうちゃう、」「あかんわ」「あかんやん」「あかんやろ」「それあかん」「それはあかん」「それちゃうわ」「それちゃうやん」「それちゃうやろ」「それちゃうんや」「それちゃうんちゃう」「それちゃうかな」「それちゃうかも」「それちゃうかった」

【抽出項目】
- patientName: 利用者名。「○○さん」「○○の」など利用者を指す表現から抽出。利用者リストがある場合はリストから最も近い名前を完全な形で返す（姓のみ・読み仮名・略称で言及されても正式名を返す）。訂正表現がある場合は最後に言及された利用者名を使用すること。不明ならnull
- visitDate: 次回訪問日（YYYY-MM-DD形式）。上記の日付解釈ルールに従って解釈すること
- visitTime: 次回訪問時刻（HH:mm形式）。上記の時刻解釈ルールに従って解釈すること
- notifiedTo: 伝達先。「本人」「家族」「その他」のいずれか。不明ならnull
- notifiedToOther: notifiedToが「その他」の場合の自由記述
- notifyMethod: 伝達方法。「口頭」「カレンダー記入」「付箋」「電話」「その他」のいずれか。不明ならnull
- notifyMethodOther: notifyMethodが「その他」の場合の自由記述
- team: 利用者が所属するチーム。「身体」「天理」「郡山北部」「郡山南部」のいずれか。「しんたい」「からだ」と言われたら「身体」、「てんり」と言われたら「天理」、「きたべ」「きたぶ」「北部」と言われたら「郡山北部」、「みなみ」「南部」と言われたら「郡山南部」を返す。不明ならnull
- visitDateConfidence: visitDateの解析信頼度。「high」（明確に日付が述べられた）「medium」（相対表現・曜日指定など推測が必要）「low」（日付が不明確または推測困難）のいずれか
- visitTimeConfidence: visitTimeの解析信頼度。「high」（明確に時刻が述べられた）「medium」（時間帯表現など推測が必要）「low」（時刻が不明確または推測困難）のいずれか

不明な項目はnullを返してください。必ず有効なJSONのみを返してください。${patientListStr}`;


        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "visit_record_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  patientName: { type: ["string", "null"] },
                  visitDate: { type: ["string", "null"] },
                  visitTime: { type: ["string", "null"] },
                  notifiedTo: { type: ["string", "null"] },
                  notifiedToOther: { type: ["string", "null"] },
                  notifyMethod: { type: ["string", "null"] },
                  notifyMethodOther: { type: ["string", "null"] },
                  team: { type: ["string", "null"] },
                  visitDateConfidence: { type: ["string", "null"] },
                  visitTimeConfidence: { type: ["string", "null"] },
                },
                required: ["patientName", "visitDate", "visitTime", "notifiedTo", "notifiedToOther", "notifyMethod", "notifyMethodOther", "team", "visitDateConfidence", "visitTimeConfidence"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });
        try {
          const parsed = JSON.parse(content) as {
            patientName: string | null;
            visitDate: string | null;
            visitTime: string | null;
            notifiedTo: string | null;
            notifiedToOther: string | null;
            notifyMethod: string | null;
            notifyMethodOther: string | null;
            team: string | null;
            visitDateConfidence: 'high' | 'medium' | 'low' | null;
            visitTimeConfidence: 'high' | 'medium' | 'low' | null;
          };
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),

    // 次回訪問日時スプレッドシートにフィルター・書式を後付け適用
    applySheetFilter: protectedProcedure
      .input(z.object({ sheetName: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ実行できます" });
        }

        const VISIT_RECORD_SHEET_ID = "1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo";
        const TARGET_SHEET_NAMES = input.sheetName ? [input.sheetName] : ["身体", "天理", "郡山北部", "郡山南部"];

        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "サービスアカウント設定がありません" });

        const { GoogleAuth: GA } = await import("google-auth-library");
        const auth = new GA({
          credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "認証トークン取得失敗" });

        // シート一覧を取得
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${token.token}` } }
        );
        if (!metaRes.ok) {
          const text = await metaRes.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `メタデータ取得失敗: ${text}` });
        }
        const metaJson = await metaRes.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
        const allSheets = metaJson.sheets ?? [];

        const results: { sheetName: string; success: boolean; message: string }[] = [];

        for (const targetName of TARGET_SHEET_NAMES) {
          const sheet = allSheets.find(s => s.properties.title === targetName);
          if (!sheet) {
            results.push({ sheetName: targetName, success: false, message: "シートが見つかりません" });
            continue;
          }
          const sheetId = sheet.properties.sheetId;

          const batchRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                requests: [
                  // オートフィルターを設定（A〜I列）
                  {
                    setBasicFilter: {
                      filter: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 }
                      }
                    }
                  },
                  // ヘッダー行の書式設定
                  {
                    repeatCell: {
                      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
                      cell: {
                        userEnteredFormat: {
                          backgroundColor: { red: 0.267, green: 0.447, blue: 0.769 },
                          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                          horizontalAlignment: "CENTER",
                          wrapStrategy: "CLIP",
                        }
                      },
                      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)",
                    }
                  },
                  // 列幅の設定
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 転送日時
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 担当者
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // チーム
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 利用者名
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 次回訪問日時
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 伝達先
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 伝達先(その他)
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 110 }, fields: "pixelSize" } }, // 伝達方法
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 伝達方法(その他)
                  // 1行目を固定
                  {
                    updateSheetProperties: {
                      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                      fields: "gridProperties.frozenRowCount"
                    }
                  },
                  // ヘッダー行の高さ
                  { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } },
                ]
              }),
            }
          );
          if (batchRes.ok) {
            results.push({ sheetName: targetName, success: true, message: "フィルター・書式を適用しました" });
          } else {
            const errText = await batchRes.text();
            results.push({ sheetName: targetName, success: false, message: `適用失敗: ${errText.slice(0, 200)}` });
          }
        }

        return { results };
      }),
  }),

  // ========== アプリ内通知 ==========
  notifications: router({
     // 未読通知一覧を取得（自分対象または全員対象のみ）
    getUnread: protectedProcedure.query(async ({ ctx }) => {
      return getUnreadNotifications(ctx.user.id);
    }),
    // 全通知一覧を取得（最新100件・自分対象または全員対象のみ）
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return getAllNotifications(ctx.user.id);
    }),

    // 指定通知を既読にする
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await markNotificationRead(input.id);
        broadcastEvent("notifications");
        return { success: true };
      }),

    // 全通知を既読にする
    markAllRead: protectedProcedure.mutation(async () => {
      await markAllNotificationsRead();
      broadcastEvent("notifications");
      return { success: true };
    }),
  }),

  // ========== スタッフ管理（管理者専用） ==========
  staff: router({
    // スタッフ一覧を取得（変更連絡フォーム用：全ユーザー可）
    listForForm: protectedProcedure.query(async () => {
      const all = await getAllStaff();
      return all.map(s => ({ id: s.id, name: s.name ?? "不明", nameKana: s.nameKana ?? "", team: s.team }));
    }),
    // スタッフ一覧を取得（管理者のみ）
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
      }
      return getAllStaff();
    }),

    // スタッフアカウントを新規作成（管理者のみ）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        email: z.string().email(),
        password: z.string().min(6).max(100),
        role: z.enum(["user", "admin"]).default("user"),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).default("身体"),
        numberPlate: z.string().max(20).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        const bcrypt = await import("bcryptjs");
        const passwordHash = await bcrypt.hash(input.password, 12);
        try {
          await createStaffAccount({
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            team: input.team,
            numberPlate: input.numberPlate,
          });
          return { success: true };
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message ?? "アカウント作成に失敗しました" });
        }
      }),

    // スタッフのパスワードをリセット（管理者のみ）
    resetPassword: protectedProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(6).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        const bcrypt = await import("bcryptjs");
        const newPasswordHash = await bcrypt.hash(input.newPassword, 12);
        await resetStaffPassword(input.userId, newPasswordHash);
        broadcastEvent("staff");
        return { success: true };
      }),

    // スタッフアカウントを削除（管理者のみ）
    delete: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身のアカウントは削除できません" });
        }
        await deleteStaffAccount(input.userId);
        broadcastEvent("staff");
        return { success: true };
      }),

    // スタッフのロールを変更（管理者のみ）
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["user", "admin", "super_admin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        // super_adminへの昇格・降格は特級管理者のみ可能
        if (input.role === "super_admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "特級管理者への昇格は特級管理者のみ可能です" });
        }
        await updateStaffRole(input.userId, input.role);
        broadcastEvent("staff");
        return { success: true };
      }),
    // スタッフのメールアドレスを変更（管理者のみ）
    updateEmail: protectedProcedure
      .input(z.object({
        userId: z.number(),
        email: z.string().email(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        try {
          await updateStaffEmail(input.userId, input.email);
          broadcastEvent("staff");
          return { success: true };
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message ?? "メールアドレスの更新に失敗しました" });
        }
      }),

    // スタッフの基本情報を一括更新（管理者のみ）
    updateInfo: protectedProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().min(1).max(50),
        nameKana: z.string().max(100).optional(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]),
        role: z.enum(["user", "admin", "super_admin"]),
        numberPlate: z.string().max(20).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        await updateStaffInfo(input.userId, {
          name: input.name,
          nameKana: input.nameKana,
          team: input.team,
          role: input.role,
          numberPlate: input.numberPlate,
        });
        broadcastEvent("staff");
        return { success: true };
      }),
  }),

  // ========== Excelインポート ==========
  import: router({
    /**
     * Excelファイル（Base64）を受け取り、利用者・スタッフを一括登録する
     * 管理者のみ実行可能
     */
    excel: protectedProcedure
      .input(z.object({
        /** Base64エンコードされたExcelファイルデータ */
        fileBase64: z.string(),
        /** ファイル名（拡張子チェック用） */
        fileName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 管理者チェック
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ実行できます" });
        }

        // ファイル拡張子チェック
        const ext = input.fileName.split(".").pop()?.toLowerCase();
        if (ext !== "xlsx" && ext !== "xls") {
          throw new TRPCError({ code: "BAD_REQUEST", message: ".xlsx または .xls ファイルのみ対応しています" });
        }

        // xlsxパッケージでパース
        const XLSX = await import("xlsx");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer" });

        const VALID_TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
        type ValidTeam = typeof VALID_TEAMS[number];
        const VALID_STAFF_TEAMS = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"] as const;
        type ValidStaffTeam = typeof VALID_STAFF_TEAMS[number];

        const result = {
          patients: { success: 0, skipped: 0, errors: [] as string[] },
          staff: { success: 0, skipped: 0, errors: [] as string[] },
        };

        // ===== 利用者シートのパース =====
        const patientSheet = workbook.Sheets["利用者"];
        if (patientSheet) {
          const rows = (XLSX.utils.sheet_to_json(patientSheet, {
            header: 1,
            defval: "",
            range: 6, // 7行目（0-indexed: 6）からヘッダー行
          }) as unknown) as unknown[][];

          // 8行目（index 1）以降がデータ（index 0がヘッダー）
          const dataRows = rows.slice(1);

          const patientsToCreate: Array<{ name: string; nameKana?: string; team: ValidTeam; active: number }> = [];
          const patientsToUpdate: Array<{ id: number; nameKana?: string; team: ValidTeam; active: number }> = [];

          // 既存利用者を全件取得（重複チェック用）
          const { getPatients } = await import("./db");
          const existingPatients = await getPatients(); // active=1のみ取得
          const existingMap = new Map(
            existingPatients.map((p) => [`${p.name}__${p.team}`, p.id])
          );

          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const name = String(row[0] ?? "").trim();
            const nameKana = String(row[1] ?? "").trim();
            const teamRaw = String(row[2] ?? "").trim();
            const activeRaw = String(row[3] ?? "").trim();

            // 空行・記入例（グレー行）はスキップ
            if (!name || name === "山田 花子" || name === "鈴木 一郎" || name === "田中 美咏") {
              if (!name) continue;
              result.patients.skipped++;
              continue;
            }

            // チームバリデーション
            if (!VALID_TEAMS.includes(teamRaw as ValidTeam)) {
              result.patients.errors.push(`利用者 ${i + 2}行目: チーム「${teamRaw}」が無効です（身体/天理/郡山北部/郡山南部）`);
              continue;
            }

            const active = activeRaw.startsWith("0") ? 0 : 1;
            const dupKey = `${name}__${teamRaw}`;

            if (existingMap.has(dupKey)) {
              // 既存利用者：ふりがな・有効フラグを更新
              patientsToUpdate.push({
                id: existingMap.get(dupKey)!,
                nameKana: nameKana || undefined,
                team: teamRaw as ValidTeam,
                active,
              });
            } else {
              // 新規登録
              patientsToCreate.push({
                name,
                nameKana: nameKana || undefined,
                team: teamRaw as ValidTeam,
                active,
              });
            }
          }

          // 新規登録
          if (patientsToCreate.length > 0) {
            try {
              await batchCreatePatients(patientsToCreate);
              result.patients.success += patientsToCreate.length;
            } catch (e: any) {
              result.patients.errors.push(`利用者一括登録エラー: ${e.message}`);
            }
          }

          // 既存更新
          if (patientsToUpdate.length > 0) {
            const { updatePatient } = await import("./db");
            for (const p of patientsToUpdate) {
              try {
                await updatePatient(p.id, { nameKana: p.nameKana, team: p.team, active: p.active });
                result.patients.success++;
              } catch (e: any) {
                result.patients.errors.push(`利用者更新エラー (id=${p.id}): ${e.message}`);
              }
            }
          }
        }

        // ===== スタッフシートのパース =====
        const staffSheet = workbook.Sheets["スタッフ"];
        if (staffSheet) {
          const rows = (XLSX.utils.sheet_to_json(staffSheet, {
            header: 1,
            defval: "",
            range: 6, // 7行目（0-indexed: 6）からヘッダー行
          }) as unknown) as unknown[][];

          const dataRows = rows.slice(1);
          const staffToCreate: Array<{ name: string; team: ValidStaffTeam; role: "user" | "admin" }> = [];

          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const name = String(row[0] ?? "").trim();
            const teamRaw = String(row[1] ?? "").trim();
            const roleRaw = String(row[2] ?? "").trim().toLowerCase();

            // 空行・記入例はスキップ
            if (!name || name === "森脇 崇" || name === "佐藤 看護師" || name === "中村 作業療法士") {
              if (!name) continue;
              result.staff.skipped++;
              continue;
            }

            // チームバリデーション
            if (!VALID_STAFF_TEAMS.includes(teamRaw as ValidStaffTeam)) {
              result.staff.errors.push(`スタッフ ${i + 2}行目: チーム「${teamRaw}」が無効です（身体/天理/郡山北部/郡山南部/事務員/全チーム）`);
              continue;
            }

            const role: "user" | "admin" = roleRaw === "admin" ? "admin" : "user";

            staffToCreate.push({ name, team: teamRaw as ValidStaffTeam, role });
          }

          // スタッフはメールなしで登録（名前+チームで既存検索して更新）
          // 既存ユーザーは名前で検索して team/role を更新、存在しなければスキップ
          const db = await import("./db").then(m => m.getDb());
          if (db) {
            const { users: usersTable } = await import("../drizzle/schema");
            const { eq: drizzleEq, or, like } = await import("drizzle-orm");
            for (const s of staffToCreate) {
              // 名前で既存ユーザーを検索
              const existing = await db.select({ id: usersTable.id })
                .from(usersTable)
                .where(like(usersTable.name, s.name))
                .limit(1);
              if (existing.length > 0) {
                // 既存ユーザーのチーム・権限を更新
                await db.update(usersTable)
                  .set({ team: s.team, role: s.role, updatedAt: new Date() })
                  .where(drizzleEq(usersTable.id, existing[0].id));
                result.staff.success++;
              } else {
                // 未登録スタッフはスキップ（Google OAuthログイン後に自動登録されるため）
                result.staff.skipped++;
              }
            }
          }
        }

        return result;
      }),

    /** よみがなCSVエクスポート */
    exportKana: protectedProcedure.query(async () => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続失敗" });
      const { users: usersTable } = await import("../drizzle/schema");
      const staffList = await db.select({ id: usersTable.id, name: usersTable.name, nameKana: usersTable.nameKana, team: usersTable.team })
        .from(usersTable)
        .orderBy(usersTable.name);
      return staffList;
    }),

    /** よみがなCSV一括更新 */
    bulkUpdateKana: protectedProcedure
      .input(z.array(z.object({
        id: z.number(),
        nameKana: z.string(),
      })))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続失敗" });
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq: drizzleEq } = await import("drizzle-orm");
        let updated = 0;
        for (const item of input) {
          await db.update(usersTable)
            .set({ nameKana: item.nameKana, updatedAt: new Date() })
            .where(drizzleEq(usersTable.id, item.id));
          updated++;
        }
        return { updated };
      }),
  }),
  // ========== スケジュール変更連絡 ==========
  scheduleChanges: router({
    /** スケジュール変更連絡を作成する */
    create: protectedProcedure
      .input(z.object({
        changeType: z.enum(["visit_change", "visit_cancel", "visit_add", "meeting_add", "meeting_change"]),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).optional(),
        patientName: z.string().optional(),
        patientId: z.number().optional(),
        fromDatetime: z.string().optional(),
        toDatetime: z.string().optional(),
        staffBefore: z.string().optional(),
        staffAfter: z.string().optional(),
        meetingName: z.string().optional(),
        meetingStaff: z.string().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createScheduleChange({
          ...input,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        broadcastEvent("scheduleChanges");
        return { success: true, id };
      }),

    /** スケジュール変更連絡一覧を取得する */
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(async ({ input }) => {
        return getScheduleChanges(input?.limit ?? 100);
      }),

    /** スプレッドシートに転記する */
    exportToSheet: protectedProcedure
      .input(z.object({
        id: z.number(),
        spreadsheetId: z.string().optional(),
        sheetName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const record = await getScheduleChangeById(input.id);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "記録が見つかりません" });

        const CHANGE_SHEET_ID = input.spreadsheetId ?? "1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";
        // チームに基づいてシート名を決定（チーム別タブ）
        const getTeamSheetName = (team: string | null | undefined): string => {
          const validTeams = ["身体", "天理", "郡山北部", "郡山南部"];
          if (team && validTeams.includes(team)) return team;
          return "スケジュール変更連絡";
        };
        const SHEET_NAME = input.sheetName ?? getTeamSheetName(record.team);

        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "サービスアカウント設定がありません" });

        const { GoogleAuth: GA } = await import("google-auth-library");
        const auth = new GA({
          credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "認証トークン取得失敗" });

        // 変更種別の日本語ラベル
         const typeLabel: Record<string, string> = {
          visit_change: "訪問日時変更",
          visit_cancel: "訪問キャンセル",
          visit_add: "訪問追加",
          meeting_add: "会議追加",
          meeting_change: "会議変更",
          schedule_visit: "受診",
          schedule_short_stay: "ショートステイ",
          schedule_special_instruction: "特別指示書",
          schedule_hospitalization: "入院",
          schedule_discharge: "退院",
          schedule_new_contract: "新規契約・面談",
          schedule_visit_doctor: "訪問診療同席",
        };
        // 日時フォーマット
        const fmtDt = (dt: string | null | undefined) => {
          if (!dt) return "";
          try {
            const d = new Date(dt);
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          } catch { return dt; }
        };
        // 日付のみ（YYYY-MM-DD → YYYY/MM/DD）に変換する関数
        const fmtDate = (d: string | null | undefined): string => {
          if (!d) return "";
          // YYYY-MM-DD形式の場合はスラッシュ切り替えのみ
          const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (m) return `${m[1]}/${m[2]}/${m[3]}`;
          return d;
        };

        // 入力日時
        const createdAt = record.createdAt ? fmtDt(record.createdAt.toISOString()) : "";

        // スプレッドシートに追記する行データ
        const row = [
          createdAt,                                    // A: 入力日時
          record.createdByName,                         // B: 入力者
          typeLabel[record.changeType] ?? record.changeType, // C: 変更種別
          record.team ?? "",                            // D: チーム
          record.patientName ?? "",                     // E: 利用者名
          fmtDt(record.fromDatetime),                   // F: 変更前日時
          fmtDt(record.toDatetime),                     // G: 変更後日時
          record.staffBefore ?? "",                     // H: 変更前担当スタッフ
          record.staffAfter ?? "",                      // I: 変更後担当スタッフ
          record.meetingName ?? "",                     // J: 会議名
          record.meetingStaff ? (() => { try { return JSON.parse(record.meetingStaff!).join("、"); } catch { return record.meetingStaff ?? ""; } })() : "", // K: 会議参加スタッフ
          record.reason ?? "",                          // L: 変更理由・備考
          record.scheduleFacility ?? "",                 // M: 施設名
          fmtDate(record.schedulePostDischargeEndDate),   // N: 退院後3か月終了日（YYYY/MM/DD）
          record.scheduleTargetName ?? "",               // O: 対象者名
          record.scheduleStaff ? (() => { try { return JSON.parse(record.scheduleStaff!).join("、"); } catch { return record.scheduleStaff ?? ""; } })() : "", // P: 対応スタッフ
        ];

        // スプレッドシートにシートが存在するか確認し、なければ作成
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${token.token}` } }
        );
        if (!metaRes.ok) {
          const text = await metaRes.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `スプレッドシートへのアクセスに失敗: ${text}` });
        }
        const meta = await metaRes.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
        const sheetExists = meta.sheets?.some(s => s.properties.title === SHEET_NAME);

        if (!sheetExists) {
          // シートを作成
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
              }),
            }
          );
          // ヘッダー行を追加
          const headerRow = ["入力日時", "入力者", "変更種別", "チーム", "利用者名", "変更前日時", "変更後日時", "変更前担当スタッフ", "変更後担当スタッフ", "会議名", "会議参加スタッフ", "変更理由・備考", "施設名", "退院後3か月終了日（週5訪問）", "対象者名", "対応スタッフ"];
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values: [headerRow] }),
            }
          );

          // 新規作成したシートのIDを取得してフィルター・書式を設定
          const metaAfterCreate = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
            { headers: { Authorization: `Bearer ${token.token}` } }
          );
          if (metaAfterCreate.ok) {
            const metaJson = await metaAfterCreate.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
            const newSheet = metaJson.sheets?.find(s => s.properties.title === SHEET_NAME);
            if (newSheet) {
              const newSheetId = newSheet.properties.sheetId;
              await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    requests: [
                      // 1行目にオートフィルターを設定（A～P列）
                      {
                        setBasicFilter: {
                          filter: {
                            range: {
                              sheetId: newSheetId,
                              startRowIndex: 0,
                              endRowIndex: 1,
                              startColumnIndex: 0,
                              endColumnIndex: 16,
                            }
                          }
                        }
                      },
                      // ヘッダー行の書式設定（背景色・太字・テキスト折り返しなし）
                      {
                        repeatCell: {
                          range: {
                            sheetId: newSheetId,
                            startRowIndex: 0,
                            endRowIndex: 1,
                            startColumnIndex: 0,
                            endColumnIndex: 16,
                          },
                          cell: {
                            userEnteredFormat: {
                              backgroundColor: { red: 0.267, green: 0.447, blue: 0.769 },
                              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                              horizontalAlignment: "CENTER",
                              wrapStrategy: "CLIP",
                            }
                          },
                          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)",
                        }
                      },
                      // 列幅の設定（各列を内容に合わせて調整）
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 140 }, fields: "pixelSize" } }, // A: 入力日時
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },  // B: 入力者
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 110 }, fields: "pixelSize" } }, // C: 変更種別
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: "pixelSize" } },  // D: チーム
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // E: 利用者名
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 140 }, fields: "pixelSize" } }, // F: 変更前日時
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 140 }, fields: "pixelSize" } }, // G: 変更後日時
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // H: 変更前担当
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // I: 変更後担当
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 10 }, properties: { pixelSize: 120 }, fields: "pixelSize" } }, // J: 会議名
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 10, endIndex: 11 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // K: 会議参加スタッフ
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 200 }, fields: "pixelSize" } }, // L: 変更理由
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 12, endIndex: 13 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // M: 施設名
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 13, endIndex: 14 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // N: 退院後3か月終了日
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 14, endIndex: 15 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // O: 対象者名
                      { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: "COLUMNS", startIndex: 15, endIndex: 16 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // P: 対応スタッフ
                      // 1行目を固定（スクロール時もヘッダーが見えるように）
                      {
                        updateSheetProperties: {
                          properties: {
                            sheetId: newSheetId,
                            gridProperties: { frozenRowCount: 1 }
                          },
                          fields: "gridProperties.frozenRowCount"
                        }
                      }
                    ]
                  }),
                }
              );
            }
          }
        }

        // データ行を追記
        const appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:P")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [row] }),
          }
        );
        if (!appendRes.ok) {
          const text = await appendRes.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `スプレッドシートへの書き込みに失敗: ${text}` });
        }

        await markScheduleChangeExported(input.id);
        return { success: true };
      }),

    /** 音声テキストをLLMで解析しフォーム項目を抽出する */
    parseVoice: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        patientNamesWithKana: z.array(z.object({ name: z.string(), kana: z.string() })).optional(),
        patientNames: z.array(z.string()).optional(),
        staffNames: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        let patientListStr = '';
        if (input.patientNamesWithKana && input.patientNamesWithKana.length > 0) {
          const entries = input.patientNamesWithKana
            .map(p => p.kana ? `${p.name}（${p.kana}）` : p.name)
            .join('、');
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientName/patientLastNameに正式名を返すこと。姓のみ・読み仮名・略称で言及されても正式名を返すこと）:\n${entries}`;
        } else if (input.patientNames && input.patientNames.length > 0) {
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientName/patientLastNameに返すこと）:\n${input.patientNames.join('、')}`;
        }
        const staffListStr = input.staffNames && input.staffNames.length > 0
          ? `\n\n登録済みスタッフリスト（meetingStaffはこの中から正式名を選ぶこと。姓のみで言及された場合も正式名を返すこと）:\n${input.staffNames.join('、')}`
          : '';
        const today2 = new Date();
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const todayDayName = dayNames[today2.getDay()];
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、スケジュール変更連絡の各項目を抽出してJSONで返してください。

今日は${todayStr}（${todayDayName}曜日）です。

日時解析ルール（必ず遵守）:
1. 相対表現: 「今日」「明日」「明後日」「明々後日」「昨日」「一昨昨日」→ 今日からの相対日数で正確に計算
2. 曜日指定: 「次の火曜日」「今週の金曜日」「次の月曜日」→ 今日から最も近いその曜日（今日がその曜日なら翻週の同曜日）
3. 週表現: 「来週」→ 来週の月曜日、「再来週」→ 2週間後の月曜日、「今週」→ 今週の月曜日
4. 時刻解析: 「14時」→ 14:00、「午前9時」→ 09:00、「午後2時」→ 14:00、「午後2時半」→ 14:30、「午後」のみ→ 12:00、「午前」のみ→ 09:00、「午後3時」→ 15:00
5. 時間帯: 「朝」「午前中」→ 09:00、「昂」「昂山時」→ 11:00、「昇後」「昇後中」→ 13:00、「午後中」→ 14:00、「夕方」→ 17:00、「夜」→ 19:00
6. 分の省略: 「14時」のように分がない場合は:00を付ける
7. 日付のみ: 「4月。7日」「4/7」→ 年は今年または来年の近い方を選択
8. 【重要】時刻未指定: 日付のみ言及されて時刻が全く言及されていない場合は、時刻部分を必ずT00:00:00+09:00とすること。時間帯・時刻の言及が一切ない場合はT00:00:00+09:00を使用すること（例：「4月20日」→ 2026-04-20T00:00:00+09:00）
9. 信頼度スコア: 日時の解析信頼度を返す。「high」=明確に日時が述べられた、「medium」=相対表現・曜日指定など推測が必要、「low」=日時が不明確または推測困難

重要：音声入力では言い間違いを訂正する場合があります。以下のような訂正・言い直しを示す表現がある場合は、その後に続く内容（最後に言及された内容）を正しい値として採用してください。
訂正表現の例：「じゃなくて」「ではなく」「違います」「違う」「あ、違う」「間違えました」「間違い」「取り消して」「やっぱり」「やっぱ」「えーと」「あ、えーと」「そうじゃなくて」「ちがう」「いや」「いや、違う」「ごめん」「ごめんなさい」「訂正します」「訂正して」「修正して」「変えて」「なくて」「じゃなく」「ではなくて」「でなく」「でなくて」「ちょっと待って」「待って」「ちょっと待ってください」「もう一度」「もう一回」「やり直し」「やり直して」「最初から」「リセット」「キャンセル」「なしで」「なしにして」「消して」「削除して」「戻して」「前に戻って」「そうではなくて」「そうじゃない」「そうじゃないです」「そうではない」「そうではありません」「別の」「別にして」「他の」「他にして」「違う人」「違う名前」「違う日」「違う時間」「違う日時」「ではなかった」「じゃなかった」「ではありません」「じゃありません」「ではないです」「じゃないです」「ちゃう」「ちゃうちゃう」「あかん」「あかんあかん」「ちゃうんちゃう」「ちゃうわ」「ちゃいます」「ちゃいますよ」「ちゃうで」「ちゃうやん」「ちゃうやろ」「ちゃうんや」「ちゃうんです」「ちゃうかな」「ちゃうかも」「あれちゃう」「それちゃう」「ちゃうかった」「ちゃうかったわ」「ちゃうかったです」「違うわ」「違うやん」「違うやろ」「違うんや」「違うんちゃう」「違うかな」「違うかも」「違うかった」「あ、ちゃう」「あ、ちゃうちゃう」「ちゃうちゃう、」「あかんわ」「あかんやん」「あかんやろ」「それあかん」「それはあかん」「それちゃうわ」「それちゃうやん」「それちゃうやろ」「それちゃうんや」「それちゃうんちゃう」「それちゃうかな」「それちゃうかも」「それちゃうかった」

抽出項目:
- changeType: 次のいずれか。
  【変更連絡系】訪問日時変更=visit_change、訪問キャンセル=visit_cancel、訪問追加=visit_add、会議追加=meeting_add、会議変更=meeting_change
  【予定登録系】受診=schedule_visit、ショートステイ=schedule_short_stay、特別指示書=schedule_special_instruction、入院=schedule_hospitalization、退院=schedule_discharge、新規契約・面談=schedule_new_contract、訪問診療同席=schedule_visit_doctor
  予定登録系の判断基準：「受診」「病院に行く」「通院」→schedule_visit、「ショートステイ」「短期入所」→schedule_short_stay、「特別指示書」→schedule_special_instruction、「入院」「入院する」→schedule_hospitalization、「退院」「退院する」→schedule_discharge、「新規契約」「面談」「初回面談」「契約」→schedule_new_contract、「訪問診療」「往診同席」→schedule_visit_doctor
- team: 身体 / 天理 / 郡山北部 / 郡山南部 / 事務員 / 全チーム のいずれか
- patientName: 利用者名（姓名）。予定登録系で「対象者」「相手」「方」と言及された場合もここに入れる。訂正表現がある場合は最後に言及された利用者名を使用すること。利用者リストがある場合は正式名を返すこと。姓だけの場合は姓のみ返す
- patientLastName: 利用者の姓（苗字）のみ。姓名両方わかる場合は同じ値、姓だけの場合はその姓、利用者が不明な場合はnull
- fromDatetime: 変更前日時または予定開始日時（ISO 8601）。各種別の使い方:
  - visit_change: 変更前の訪問日時
  - visit_cancel: キャンセルする日の日付（必ずここに入れること）
  - visit_add: null（追加日時はtoDatetimeに入れる）
  - meeting_add: null（開催日時はtoDatetimeに入れる）
  - meeting_change: 変更前の会議日時
  - schedule_系: 予定開始日時（受診日・入院日・退院日等）
- toDatetime: 変更後日時または追加日時（ISO 8601）。各種別の使い方:
  - visit_change: 変更後の訪問日時
  - visit_cancel: null（キャンセルの場合は必ずnull）
  - visit_add: 追加する訪問日時（必ずここに入れること）
  - meeting_add: 会議の開催日時（必ずここに入れること）
  - meeting_change: 変更後の会議日時
  - schedule_系: 予定終了日時（省略可）
- staffBefore: 変更前担当スタッフ名
- staffAfter: 変更後担当スタッフ名
- meetingName: 会議名
- meetingStaff: 参加スタッフ名または対応スタッフ名の配列（例: ["森脇", "田中"]）。新規契約・面談の「対応スタッフ」もここに入れる
- reason: 変更理由・備考。「～のため」「～なので」「～だから」「～の都合」「体調不良」「急用」「病院受診」「家族の都合」「仕事の都合」「訪問拒否」「入院」「外出中」「デイサービス」「通院」「受診」「施設入所」など、理由・事情を示す語句や文を抽出してください。また、会議追加（meeting_add）または会議変更（meeting_change）の場合、「場所は」「会場は」「場所：」「センター」「事業所」「ファミリーサポート」など、会議の場所・会場情報もここに入れること（例：「場所：第三地域包括支援センター」）。理由が明示されていない場合はnullを返してください。
- scheduleFacilityName: 予定登録系の施設名・病院名・クリニック名。変更連絡系ではnull。
  抽出例：
  「大和郡山病院に受診」→ scheduleFacilityName="大和郡山病院"
  「山田クリニックで診察」→ scheduleFacilityName="山田クリニック"
  「天理市立病院に入院」→ scheduleFacilityName="天理市立病院"
  「施設名がない」→ scheduleFacilityName=null
- scheduleTargetName: 新規契約・面談（schedule_new_contract）の対象者名。「対象者」「相手」「方」「名前」「新規」などと共に言及された人物名。それ以外はnull。
  抽出例：
  「山田さんの初回面談」→ scheduleTargetName="山田"（patientNameと別項目に設定）
  「田中花子さんの新規契約」→ scheduleTargetName="田中花子"
  「対象者名がない」→ scheduleTargetName=null
- schedulePostDischargeEndDate: 退院後3か月終了日（退院日から90日後）。退院（schedule_discharge）のみ使用。ISO 8601の日付文字列（YYYY-MM-DD）。退院日が分かる場合は自動計算して返す。それ以外はnull
- fromDatetimeConfidence: fromDatetimeの解析信頼度。「high」「medium」「low」のいずれか。fromDatetimeがなければnull
- toDatetimeConfidence: toDatetimeの解析信頼度。「high」「medium」「low」のいずれか。toDatetimeがなければnull

不明な項目はnullを返してください。必ず有効なJSONのみを返してください。${patientListStr}${staffListStr}`;

        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "schedule_change_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  changeType: { type: ["string", "null"] },
                  team: { type: ["string", "null"] },
                  patientName: { type: ["string", "null"] },
                  patientLastName: { type: ["string", "null"] },
                  fromDatetime: { type: ["string", "null"] },
                  toDatetime: { type: ["string", "null"] },
                  staffBefore: { type: ["string", "null"] },
                  staffAfter: { type: ["string", "null"] },
                  meetingName: { type: ["string", "null"] },
                  meetingStaff: { type: ["array", "null"], items: { type: "string" } },
                  reason: { type: ["string", "null"] },
                  scheduleFacilityName: { type: ["string", "null"] },
                  scheduleTargetName: { type: ["string", "null"] },
                  schedulePostDischargeEndDate: { type: ["string", "null"] },
                  fromDatetimeConfidence: { type: ["string", "null"] },
                  toDatetimeConfidence: { type: ["string", "null"] },
                },
                required: ["changeType", "team", "patientName", "patientLastName", "fromDatetime", "toDatetime", "staffBefore", "staffAfter", "meetingName", "meetingStaff", "reason", "scheduleFacilityName", "scheduleTargetName", "schedulePostDischargeEndDate", "fromDatetimeConfidence", "toDatetimeConfidence"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });

        try {
          const parsed = JSON.parse(content);
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),

    /** 作成と同時にスプレッドシートへ転記する（ワンステップ） */
    createAndExport: protectedProcedure
      .input(z.object({
        changeType: z.enum(["visit_change", "visit_cancel", "visit_add", "meeting_add", "meeting_change", "schedule_visit", "schedule_short_stay", "schedule_special_instruction", "schedule_hospitalization", "schedule_discharge", "schedule_new_contract", "schedule_visit_doctor"]),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).optional(),
        patientName: z.string().optional(),
        patientId: z.number().optional(),
        fromDatetime: z.string().optional(),
        toDatetime: z.string().optional(),
        staffBefore: z.string().optional(),
        staffAfter: z.string().optional(),
        meetingName: z.string().optional(),
        meetingStaff: z.string().optional(),
        reason: z.string().optional(),
        spreadsheetId: z.string().optional(),
        sheetName: z.string().optional(),
        // 予定管理固有フィールド
        scheduleFacility: z.string().optional(),
        scheduleStartDate: z.string().optional(),
        scheduleEndDate: z.string().optional(),
        schedulePostDischargeEndDate: z.string().optional(),
        scheduleTargetName: z.string().optional(),
        scheduleStaff: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // まずDBに保存
        const id = await createScheduleChange({
          changeType: input.changeType,
          team: input.team,
          patientName: input.patientName,
          patientId: input.patientId,
          fromDatetime: input.fromDatetime,
          toDatetime: input.toDatetime,
          staffBefore: input.staffBefore,
          staffAfter: input.staffAfter,
          meetingName: input.meetingName,
          meetingStaff: input.meetingStaff,
          reason: input.reason,
          scheduleFacility: input.scheduleFacility,
          scheduleStartDate: input.scheduleStartDate,
          scheduleEndDate: input.scheduleEndDate,
          schedulePostDischargeEndDate: input.schedulePostDischargeEndDate,
          scheduleTargetName: input.scheduleTargetName,
          scheduleStaff: input.scheduleStaff,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });

        const record = await getScheduleChangeById(id);
        if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "作成した記録が見つかりません" });

        const CHANGE_SHEET_ID = input.spreadsheetId ?? "1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";
        // チームに基づいてシート名を決定（チーム別タブ）
        const getTeamSheetNameForCreate = (team: string | null | undefined): string => {
          const validTeams = ["身体", "天理", "郡山北部", "郡山南部"];
          if (team && validTeams.includes(team)) return team;
          return "スケジュール変更連絡";
        };
        const SHEET_NAME = input.sheetName ?? getTeamSheetNameForCreate(record.team);

        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) {
          // スプレッドシート転記はスキップしてDBのみ保存
          return { success: true, id, exported: false };
        }

        try {
          const { GoogleAuth: GA } = await import("google-auth-library");
          const auth = new GA({
            credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
          });
          const client = await auth.getClient();
          const token = await client.getAccessToken();
          if (!token.token) return { success: true, id, exported: false };

          const typeLabel: Record<string, string> = {
            visit_change: "訪問日時変更",
            visit_cancel: "訪問キャンセル",
            visit_add: "訪問追加",
            meeting_add: "会議追加",
            meeting_change: "会議変更",
            schedule_visit: "受診",
            schedule_short_stay: "ショートステイ",
            schedule_special_instruction: "特別指示書",
            schedule_hospitalization: "入院",
            schedule_discharge: "退院",
            schedule_new_contract: "新規契約・面談",
            schedule_visit_doctor: "訪問診療同席",
          };
          // 日時フォーマット（JST: UTC+9 に変換して書き込む））
          const fmtDt = (dt: string | Date | null | undefined) => {
            if (!dt) return "";
            try {
              const d = dt instanceof Date ? dt : new Date(dt);
              // UTC+9（JST）に変換
              const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
              return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,"0")}/${String(jst.getUTCDate()).padStart(2,"0")} ${String(jst.getUTCHours()).padStart(2,"0")}:${String(jst.getUTCMinutes()).padStart(2,"0")}`;
            } catch { return String(dt ?? ""); }
          };
          // 日付のみ（YYYY-MM-DD → YYYY/MM/DD）に変換する関数
          const fmtDate = (d: string | null | undefined): string => {
            if (!d) return "";
            const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return `${m[1]}/${m[2]}/${m[3]}`;
            return d;
          };

          const createdAt = record.createdAt ? fmtDt(record.createdAt) : "";

          const row = [
            createdAt,
            record.createdByName,
            typeLabel[record.changeType] ?? record.changeType,
            record.team ?? "",
            record.patientName ?? "",
            fmtDt(record.fromDatetime),
            fmtDt(record.toDatetime),
            record.staffBefore ?? "",
            record.staffAfter ?? "",
            record.meetingName ?? "",
            record.meetingStaff ? (() => { try { return JSON.parse(record.meetingStaff!).join("、"); } catch { return record.meetingStaff ?? ""; } })() : "",
            record.reason ?? "",
            // M列：施設名
            record.scheduleFacility ?? "",
            // N列：退院後3か月終了日（週5訪問）
            fmtDate(record.schedulePostDischargeEndDate),
            // O列：対象者名（新規契約・面談用）
            record.scheduleTargetName ?? "",
            // P列：対応スタッフ
            record.scheduleStaff ? (() => { try { return JSON.parse(record.scheduleStaff!).join("、"); } catch { return record.scheduleStaff ?? ""; } })() : "",
          ];

          // シート存在確認
          const metaRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
            { headers: { Authorization: `Bearer ${token.token}` } }
          );
          if (metaRes.ok) {
            const meta = await metaRes.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
            const sheetExists = meta.sheets?.some(s => s.properties.title === SHEET_NAME);
            if (!sheetExists) {
              await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
                }
              );
              const headerRow = ["入力日時", "入力者", "変更種別", "チーム", "利用者名", "変更前日時", "変更後日時", "変更前担当スタッフ", "変更後担当スタッフ", "会議名", "会議参加スタッフ", "変更理由・備考", "施設名", "退院後3か月終了日（週5訪問）", "対象者名", "対応スタッフ"];
              await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ values: [headerRow] }),
                }
              );
            }
          }

          const appendRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:P")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values: [row] }),
            }
          );

          if (appendRes.ok) {
            await markScheduleChangeExported(id);

            // シートのIDを取得してヘッダー書式・列幅・ゼブラストライプ・枠線・フィルター・行固定を設定
            try {
              const metaRes2 = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
                { headers: { Authorization: `Bearer ${token.token}` } }
              );
              if (metaRes2.ok) {
                const meta2 = await metaRes2.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
                const sheetInfo = meta2.sheets?.find(s => s.properties.title === SHEET_NAME);
                const sheetId = sheetInfo?.properties?.sheetId ?? 0;
                const COL_COUNT = 16; // AーPの16列

                // 転送済み行数を取得
                const valuesRes = await fetch(
                  `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:A")}`,
                  { headers: { Authorization: `Bearer ${token.token}` } }
                );
                const valuesData = valuesRes.ok ? await valuesRes.json() as { values?: string[][] } : { values: [] };
                const totalRows = valuesData.values?.length ?? 1;
                const dataEndRow = Math.max(totalRows, 2);

                const batchBody = {
                  requests: [
                    // 1. ヘッダー行（1行目）：深青背景・白太字・中央揃え・フォントサイズ11
                    {
                      repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: {
                          userEnteredFormat: {
                            backgroundColor: { red: 0.165, green: 0.329, blue: 0.573 }, // #2A5492 深青
                            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11, fontFamily: "Noto Sans JP" },
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "MIDDLE",
                            wrapStrategy: "WRAP",
                            padding: { top: 6, bottom: 6, left: 6, right: 6 },
                          },
                        },
                        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,padding)",
                      },
                    },
                    // 2. データ行全体：フォント・垂直中央・パディング
                    {
                      repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: {
                          userEnteredFormat: {
                            textFormat: { fontSize: 10, fontFamily: "Noto Sans JP" },
                            verticalAlignment: "MIDDLE",
                            padding: { top: 4, bottom: 4, left: 6, right: 6 },
                          },
                        },
                        fields: "userEnteredFormat(textFormat,verticalAlignment,padding)",
                      },
                    },
                    // 3. 変更理由・備考列（L列）のみテキスト折り返し
                    {
                      repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 11, endColumnIndex: 12 },
                        cell: { userEnteredFormat: { wrapStrategy: "WRAP" } },
                        fields: "userEnteredFormat.wrapStrategy",
                      },
                    },
                    // 4. 奇数行（データ行）：白背景
                    ...Array.from({ length: Math.ceil((dataEndRow - 1) / 2) }, (_, i) => ({
                      repeatCell: {
                        range: { sheetId, startRowIndex: 1 + i * 2, endRowIndex: Math.min(2 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
                        fields: "userEnteredFormat.backgroundColor",
                      },
                    })),
                    // 5. 偶数行（データ行）：極淡青背景 #EBF3FB
                    ...Array.from({ length: Math.floor((dataEndRow - 1) / 2) }, (_, i) => ({
                      repeatCell: {
                        range: { sheetId, startRowIndex: 2 + i * 2, endRowIndex: Math.min(3 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: { userEnteredFormat: { backgroundColor: { red: 0.922, green: 0.953, blue: 0.984 } } },
                        fields: "userEnteredFormat.backgroundColor",
                      },
                    })),
                    // 6. 全セルに枠線を追加
                    {
                      updateBorders: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        top:    { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        bottom: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        left:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        right:  { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        innerHorizontal: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        innerVertical:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                      },
                    },
                    // 7. 列幅を内容に合わせて設定
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0,  endIndex: 1  }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 入力日時
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1,  endIndex: 2  }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 入力者
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2,  endIndex: 3  }, properties: { pixelSize: 120 }, fields: "pixelSize" } }, // 変更種別
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3,  endIndex: 4  }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // チーム
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4,  endIndex: 5  }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 利用者名
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5,  endIndex: 6  }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 変更前日時
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6,  endIndex: 7  }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 変更後日時
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7,  endIndex: 8  }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 変更前担当
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8,  endIndex: 9  }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 変更後担当
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 9,  endIndex: 10 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 会議名
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 10, endIndex: 11 }, properties: { pixelSize: 180 }, fields: "pixelSize" } }, // 会議参加スタッフ
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 280 }, fields: "pixelSize" } }, // 変更理由・備考
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 12, endIndex: 13 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 施設名
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 13, endIndex: 14 }, properties: { pixelSize: 180 }, fields: "pixelSize" } }, // 退院後3か月終了日
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 14, endIndex: 15 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 対象者名
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 15, endIndex: 16 }, properties: { pixelSize: 180 }, fields: "pixelSize" } }, // 対応スタッフ
                    // 8. 行の高さ：ヘッダー行を少し高めに
                    { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } },
                    // 9. オートフィルターを設定（全列）
                    {
                      setBasicFilter: {
                        filter: {
                          range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        },
                      },
                    },
                    // 10. ヘッダー行を固定（フリーズ）
                    {
                      updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: "gridProperties.frozenRowCount",
                      },
                    },
                  ],
                };
                await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify(batchBody),
                });
              }
            } catch {
              // 書式設定の失敗は転送自体に影響しない
            }

            broadcastEvent("scheduleChanges");
            return { success: true, id, exported: true };
          }
          return { success: true, id, exported: false };
        } catch (e) {
          console.error("[ScheduleChange] スプレッドシート転記エラー:", e);
          return { success: true, id, exported: false };
        }
      }),

    /** 既存シートにフィルター・書式を後付け適用する（管理者のみ） */
    applySheetFilter: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string().optional(),
        sheetName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ実行できます" });
        }

        const CHANGE_SHEET_ID = input.spreadsheetId ?? "1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";
        const TARGET_SHEET_NAMES = input.sheetName
          ? [input.sheetName]
          : ["身体", "天理", "郡山北部", "郡山南部", "スケジュール変更連絡"];

        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "サービスアカウント設定がありません" });

        const { GoogleAuth: GA } = await import("google-auth-library");
        const auth = new GA({
          credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "認証トークン取得失敗" });

        // スプレッドシートのシート一覧を取得
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${token.token}` } }
        );
        if (!metaRes.ok) {
          const text = await metaRes.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `スプレッドシートのメタデータ取得失敗: ${text}` });
        }
        const metaJson = await metaRes.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
        const allSheets = metaJson.sheets ?? [];

        const results: { sheetName: string; success: boolean; message: string }[] = [];

        for (const targetName of TARGET_SHEET_NAMES) {
          const sheet = allSheets.find(s => s.properties.title === targetName);
          if (!sheet) {
            results.push({ sheetName: targetName, success: false, message: "シートが見つかりません" });
            continue;
          }
          const sheetId = sheet.properties.sheetId;

          // ① ヘッダー行の値を16列分に更新
          const newHeaderRow = ["入力日時", "入力者", "変更種別", "チーム", "利用者名", "変更前日時", "変更後日時", "変更前担当スタッフ", "変更後担当スタッフ", "会議名", "会議参加スタッフ", "変更理由・備考", "施設名", "退院後3か月終了日（週5訪問）", "対象者名", "対応スタッフ"];
          const headerUpdateRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(targetName + "!A1:P1")}?valueInputOption=RAW`,
            {
              method: "PUT",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values: [newHeaderRow] }),
            }
          );
          if (!headerUpdateRes.ok) {
            const errText = await headerUpdateRes.text();
            results.push({ sheetName: targetName, success: false, message: `ヘッダー更新失敗: ${errText.slice(0, 200)}` });
            continue;
          }

          // ② 書式・フィルター・列幅を16列対応に更新
          const batchRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                requests: [
                  // オートフィルターを設定（A〜P列: 16列）
                  {
                    setBasicFilter: {
                      filter: {
                        range: {
                          sheetId,
                          startRowIndex: 0,
                          endRowIndex: 1,
                          startColumnIndex: 0,
                          endColumnIndex: 16,
                        }
                      }
                    }
                  },
                  // ヘッダー行の書式設定（背景色・太字・テキスト折り返しなし）
                  {
                    repeatCell: {
                      range: {
                        sheetId,
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 16,
                      },
                      cell: {
                        userEnteredFormat: {
                          backgroundColor: { red: 0.267, green: 0.447, blue: 0.769 },
                          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                          horizontalAlignment: "CENTER",
                          wrapStrategy: "CLIP",
                        }
                      },
                      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)",
                    }
                  },
                  // 列幅の設定（A〜P: 16列）
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 140 }, fields: "pixelSize" } },   // A: 入力日時
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },    // B: 入力者
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 110 }, fields: "pixelSize" } },   // C: 変更種別
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: "pixelSize" } },    // D: チーム
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },   // E: 利用者名
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 140 }, fields: "pixelSize" } },   // F: 変更前日時
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 140 }, fields: "pixelSize" } },   // G: 変更後日時
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 130 }, fields: "pixelSize" } },   // H: 変更前担当スタッフ
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 130 }, fields: "pixelSize" } },   // I: 変更後担当スタッフ
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 10 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },  // J: 会議名
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 10, endIndex: 11 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // K: 会議参加スタッフ
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 200 }, fields: "pixelSize" } }, // L: 変更理由・備考
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 12, endIndex: 13 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // M: 施設名
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 13, endIndex: 14 }, properties: { pixelSize: 180 }, fields: "pixelSize" } }, // N: 退院後3か月終了日
                  // N列（2行目以降）をテキスト形式（@）に設定（日付として自動解釈されないように）
                  {
                    repeatCell: {
                      range: {
                        sheetId,
                        startRowIndex: 1, // 2行目以降（ヘッダー除く）
                        startColumnIndex: 13, // N列
                        endColumnIndex: 14,
                      },
                      cell: {
                        userEnteredFormat: {
                          numberFormat: { type: "TEXT", pattern: "@" },
                        }
                      },
                      fields: "userEnteredFormat.numberFormat",
                    }
                  },
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 14, endIndex: 15 }, properties: { pixelSize: 120 }, fields: "pixelSize" } }, // O: 対象者名
                  { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 15, endIndex: 16 }, properties: { pixelSize: 120 }, fields: "pixelSize" } }, // P: 対応スタッフ
                  // 1行目を固定
                  {
                    updateSheetProperties: {
                      properties: {
                        sheetId,
                        gridProperties: { frozenRowCount: 1 }
                      },
                      fields: "gridProperties.frozenRowCount"
                    }
                  }
                ]
              }),
            }
          );
          if (batchRes.ok) {
            results.push({ sheetName: targetName, success: true, message: "ヘッダー更新・フィルター・書式を適用しました（16列対応）" });
          } else {
            const errText = await batchRes.text();
            results.push({ sheetName: targetName, success: false, message: `適用失敗: ${errText.slice(0, 200)}` });
          }
        }

        return { results };
      }),
  }),

  // ========== アプリ設定 ==========
  settings: router({
    /** スプレッドシート自動削除の保持期間（日数）を取得 */
    getSheetCleanupDays: protectedProcedure.query(async () => {
      const value = await getSetting("sheet_cleanup_days", "7");
      return { days: parseInt(value, 10) };
    }),
    /** スプレッドシート自動削除の保持期間（日数）を更新（adminのみ） */
    setSheetCleanupDays: protectedProcedure
      .input(z.object({ days: z.number().int().min(1).max(90) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        await setSetting("sheet_cleanup_days", String(input.days));
        broadcastEvent("settings");
        return { success: true, days: input.days };
      }),
    /** スケジュール変更連絡自動削除の保持期間（日数）を取得 */
    getScheduleChangeDeleteDays: protectedProcedure.query(async () => {
      const value = await getSetting("schedule_change_delete_days", "3");
      return { days: parseInt(value, 10) };
    }),
    /** スケジュール変更連絡自動削除の保持期間（日数）を更新（adminのみ） */
    setScheduleChangeDeleteDays: protectedProcedure
      .input(z.object({ days: z.number().int().min(1).max(90) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        await setSetting("schedule_change_delete_days", String(input.days));
        broadcastEvent("settings");
        return { success: true, days: input.days };
      }),
    /** スプレッドシート共有先メールアドレス一覧を取得 */
    getShareEmails: protectedProcedure.query(async () => {
      const value = await getSetting("sheet_share_emails", "");
      const emails = value ? value.split(",").map((e) => e.trim()).filter(Boolean) : [];
      return { emails };
    }),
    /** スプレッドシート共有先メールアドレスを更新（adminのみ） */
    setShareEmails: protectedProcedure
      .input(z.object({ emails: z.array(z.string().email()).max(20) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        await setSetting("sheet_share_emails", input.emails.join(","));
        broadcastEvent("settings");
        return { success: true };
      }),
  }),
  // ========== クイックアクセスリンク ===========
  quickAccessLinks: router({
    /** 全クイックアクセスリンクを取得 */
    list: protectedProcedure.query(async () => {
      const { getAllQuickAccessLinks } = await import("./db");
      return getAllQuickAccessLinks();
    }),
    /** クイックアクセスリンクを作成（adminのみ） */
    create: protectedProcedure
      .input(z.object({
        category: z.enum(["スプレッドシート", "ドキュメント", "フォーム", "その他"]),
        label: z.string().min(1).max(200),
        href: z.string().url(),
        emoji: z.string().max(10).default(""),
        color: z.string().max(100).default("text-blue-600"),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManage2857 = ctx.user.role === "admin";
        if (!canManage2857) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { createQuickAccessLink } = await import("./db");
        const id = await createQuickAccessLink(input);
        broadcastEvent("quickAccessLinks");
        return { success: true, id };
      }),
    /** クイックアクセスリンクを更新（adminのみ） */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        category: z.enum(["スプレッドシート", "ドキュメント", "フォーム", "その他"]).optional(),
        label: z.string().min(1).max(200).optional(),
        href: z.string().url().optional(),
        emoji: z.string().max(10).optional(),
        color: z.string().max(100).optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManageQAUpdate = ctx.user.role === "admin";
        if (!canManageQAUpdate) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { updateQuickAccessLink } = await import("./db");
        const { id, ...data } = input;
        await updateQuickAccessLink(id, data);
        broadcastEvent("quickAccessLinks");
        return { success: true };
      }),
    /** \u30af\u30a4\u30c3\u30af\u30a2\u30af\u30bb\u30b9\u30ea\u30f3\u30af\u3092\u524a\u9664\uff08admin\u306e\u307f\uff09 */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const canManageQADelete = ctx.user.role === "admin";
        if (!canManageQADelete) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { deleteQuickAccessLink } = await import("./db");
        await deleteQuickAccessLink(input.id);
        broadcastEvent("quickAccessLinks");
        return { success: true };
      }),
  }),

  /** チームツールリンク管理 */
  teamTools: router({
    /** 指定チームのツールリンクを取得（全チームの場合は全データを返す） */
    list: protectedProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "全チーム"]),
      }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        const { teamTools } = await import("../drizzle/schema");
        const { eq, asc, inArray } = await import("drizzle-orm");
        if (input.team === "全チーム") {
          return db.select().from(teamTools)
            .where(inArray(teamTools.team, ["身体", "天理", "郡山北部", "郡山南部"]))
            .orderBy(asc(teamTools.team), asc(teamTools.sortOrder), asc(teamTools.createdAt));
        }
        return db.select().from(teamTools)
          .where(eq(teamTools.team, input.team))
          .orderBy(asc(teamTools.sortOrder), asc(teamTools.createdAt));
      }),
    /** チームツールリンクを作成（adminのみ） */
    create: protectedProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        label: z.string().min(1).max(200),
        href: z.string().url(),
        emoji: z.string().max(10).default("🔗"),
        color: z.string().max(100).default("text-blue-600"),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManageTTCreate = ctx.user.role === "admin";
        if (!canManageTTCreate) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { teamTools } = await import("../drizzle/schema");
        const result = await db.insert(teamTools).values({
          team: input.team,
          label: input.label,
          href: input.href,
          emoji: input.emoji,
          color: input.color,
          sortOrder: input.sortOrder,
          createdBy: ctx.user.id,
        });
        broadcastEvent("teamTools");
        return { success: true, id: Number(result[0].insertId) };
      }),
    /** チームツールリンクを更新（adminのみ） */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        label: z.string().min(1).max(200).optional(),
        href: z.string().url().optional(),
        emoji: z.string().max(10).optional(),
        color: z.string().max(100).optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManageTTUpdate = ctx.user.role === "admin";
        if (!canManageTTUpdate) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { teamTools } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { id, ...data } = input;
        await db.update(teamTools).set({ ...data, updatedAt: new Date() }).where(eq(teamTools.id, id));
        broadcastEvent("teamTools");
        return { success: true };
      }),
    /** チームツールリンクを削除（adminのみ） */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const canManageTTDelete = ctx.user.role === "admin";
        if (!canManageTTDelete) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { teamTools } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(teamTools).where(eq(teamTools.id, input.id));
        broadcastEvent("teamTools");
        return { success: true };
      }),
  }),

  /** 議事録管理 */
  minutes: router({
    /** 議事録一覧を取得（未確認数も含む） */
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      const { minutes, minutesChecks } = await import("../drizzle/schema");
      const allMinutes = await db.select().from(minutes).orderBy(minutes.createdAt);
      // 自分がチェック済みの議事録IDを取得
      const myChecks = await db.select().from(minutesChecks).where(eq(minutesChecks.userId, ctx.user.id));
      const checkedIds = new Set(myChecks.map((c) => c.minutesId));
      // 全員分の確認記録を取得（allCheckedAt計算に使用）
      const allChecks = await db.select({ minutesId: minutesChecks.minutesId, userId: minutesChecks.userId, checkedAt: minutesChecks.checkedAt }).from(minutesChecks);
      const allStaff = await db.select({ id: users.id }).from(users);
      const totalStaffCount = allStaff.length;
      const staffIds = new Set(allStaff.map((s) => s.id));
      // 各議事録ごとに確認済みユーザーIDと最終確認日時を集計
      const checksPerMinutes = new Map<number, { userIds: Set<number>; maxCheckedAt: Date }>();
      for (const c of allChecks) {
        if (!checksPerMinutes.has(c.minutesId)) {
          checksPerMinutes.set(c.minutesId, { userIds: new Set(), maxCheckedAt: c.checkedAt });
        }
        const entry = checksPerMinutes.get(c.minutesId)!;
        entry.userIds.add(c.userId);
        if (c.checkedAt > entry.maxCheckedAt) entry.maxCheckedAt = c.checkedAt;
      }
      // 管理者向け：各議事録の既読数を取得
      let readerCountMap: Map<number, number> = new Map();
      if (ctx.user.role === "admin" || ctx.user.role === "super_admin") {
        for (const [minutesId, entry] of checksPerMinutes) {
          readerCountMap.set(minutesId, entry.userIds.size);
        }
      }
      // 全員確認済み日時を計算（全スタッフが確認済みの場合のみ）
      const allCheckedAtMap = new Map<number, Date>();
      for (const [minutesId, entry] of checksPerMinutes) {
        const allConfirmed = staffIds.size > 0 && Array.from(staffIds).every((id) => entry.userIds.has(id));
        if (allConfirmed) {
          allCheckedAtMap.set(minutesId, entry.maxCheckedAt);
        }
      }
      return allMinutes.map((m) => ({
        ...m,
        checkedByMe: checkedIds.has(m.id),
        readerCount: readerCountMap.get(m.id) ?? 0,
        totalStaff: totalStaffCount,
        /** 全員が確認済みになった日時（全員確認済みでない場合はnull） */
        allCheckedAt: allCheckedAtMap.get(m.id) ?? null,
      }));
    }),
    /** 未確認件数を取得 */
    uncheckedCount: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return { count: 0 };
      const { minutes, minutesChecks } = await import("../drizzle/schema");
      const allMinutes = await db.select({ id: minutes.id }).from(minutes);
      const myChecks = await db.select({ minutesId: minutesChecks.minutesId }).from(minutesChecks).where(eq(minutesChecks.userId, ctx.user.id));
      const checkedIds = new Set(myChecks.map((c) => c.minutesId));
      const count = allMinutes.filter((m) => !checkedIds.has(m.id)).length;
      return { count };
    }),
    /** URLからドキュメントタイトルを取得（Google Drive API サービスアカウント認証） */
    fetchDocTitle: protectedProcedure
      .input(z.object({ url: z.string().url() }))
      .query(async ({ input }) => {
        try {
          // Google Docs/Sheets/Slides/Forms URLからファイルIDを抽出
          const googleDocsPattern = /\/(?:document|spreadsheets|presentation|forms\/d)(?:\/d)?\/([a-zA-Z0-9_-]{25,})/;
          const fileIdMatch = input.url.match(googleDocsPattern);

          if (fileIdMatch && fileIdMatch[1]) {
            const fileId = fileIdMatch[1];
            // サービスアカウント認証でGoogle Drive APIを呼び出す
            try {
              const auth = getAuth();
              // Drive読み取りスコープでトークンを取得
              const driveAuth = new GoogleAuth({
                credentials: {
                  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                  private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
                },
                scopes: ["https://www.googleapis.com/auth/drive.readonly"],
              });
              const client = await driveAuth.getClient();
              const tokenRes = await client.getAccessToken();
              if (tokenRes.token) {
                const driveRes = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`,
                  {
                    headers: { Authorization: `Bearer ${tokenRes.token}` },
                    signal: AbortSignal.timeout(5000),
                  }
                );
                if (driveRes.ok) {
                  const data = await driveRes.json() as { name?: string };
                  if (data.name) return { title: data.name };
                }
              }
            } catch (driveErr) {
              console.warn("[fetchDocTitle] Drive API error:", driveErr);
            }
          }

          // フォールバック: HTMLの<title>タグから取得
          const response = await fetch(input.url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) return { title: null };
          const html = await response.text();
          // <title>タグからタイトルを抽出
          const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (!match) return { title: null };
          // Google Docs/Sheets等の「- Google ...」を除去
          let title = match[1].trim();
          title = title.replace(/\s*[-–—]\s*(Googleスプレッドシート|Google Sheets|Google Docs|Googleドキュメント|Google Forms|Googleフォーム)\s*$/i, "").trim();
          return { title: title || null };
        } catch {
          return { title: null };
        }
      }),
    /** 議事録を投稿（adminのみ） */
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(300),
        content: z.string().min(1),
        documentUrl: z.string().url().optional().or(z.literal("")),
        documentLabel: z.string().max(200).optional(),
        deadline: z.date().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 全職員が投稿可能（権限チェックなし）
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes } = await import("../drizzle/schema");
        await db.insert(minutes).values({
          title: input.title,
          content: input.content,
          documentUrl: input.documentUrl || null,
          documentLabel: input.documentLabel || null,
          deadline: input.deadline ?? null,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "",
        });
        // 全職員へアプリ内通知を送信（投稿者本人を除く）
        try {
          const allStaff = await getAllStaff();
          const preview = input.title.length > 40 ? input.title.slice(0, 40) + "…" : input.title;
          const notifyTargets = allStaff.filter((s) => s.id !== ctx.user.id);
          await Promise.all(
            notifyTargets.map((s) =>
              createNotification({
                type: "minutes_posted",
                title: "新しい議事録が投稿されました",
                body: `${ctx.user.name ?? "不明"}さん：「${preview}」`,
                targetUserId: s.id,
              })
            )
          );
        } catch (e) {
          console.warn("[minutes.create] 通知送信エラー:", e);
        }
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 議事録を更新（adminのみ・deadline含む） */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        title: z.string().min(1).max(300).optional(),
        content: z.string().min(1).optional(),
        documentUrl: z.string().url().optional().or(z.literal("")).nullable(),
        documentLabel: z.string().max(200).optional().nullable(),
        deadline: z.date().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        // 投稿者本人または管理者のみ編集可能
        const target = await db.select({ createdBy: minutes.createdBy }).from(minutes).where(eqOp(minutes.id, input.id)).limit(1);
        if (!target.length) throw new TRPCError({ code: "NOT_FOUND", message: "議事録が見つかりません" });
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin" && ctx.user.id !== target[0].createdBy) {
          throw new TRPCError({ code: "FORBIDDEN", message: "投稿者本人または管理者のみ編集できます" });
        }
        const updateData: Record<string, unknown> = {};
        if (input.title !== undefined) updateData.title = input.title;
        if (input.content !== undefined) updateData.content = input.content;
        if (input.documentUrl !== undefined) updateData.documentUrl = input.documentUrl || null;
        if (input.documentLabel !== undefined) updateData.documentLabel = input.documentLabel || null;
        if ("deadline" in input) updateData.deadline = input.deadline ?? null;
        await db.update(minutes).set(updateData).where(eqOp(minutes.id, input.id));
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 未確認スタッフ全員にリマインド通知を送る（adminのみ） */
    sendReminder: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ送信できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes, minutesChecks, appNotifications } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        // 議事録タイトルを取得
        const minutesRows = await db.select({ title: minutes.title }).from(minutes).where(eqOp(minutes.id, input.minutesId)).limit(1);
        if (!minutesRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "議事録が見つかりません" });
        const minutesTitle = minutesRows[0].title;
        // 全スタッフ（管理者・事務員含む全ユーザー）を取得
        const allStaff = await db.select({ id: users.id, name: users.name }).from(users);
        // 確認済みユーザーIDを取得
        const checks = await db.select({ userId: minutesChecks.userId }).from(minutesChecks).where(eqOp(minutesChecks.minutesId, input.minutesId));
        const checkedIds = new Set(checks.map((c) => c.userId));
        // 未確認スタッフにアプリ内通知を作成
        const unreadStaff = allStaff.filter((s) => !checkedIds.has(s.id));
        if (unreadStaff.length === 0) return { success: true, sent: 0 };
        await db.insert(appNotifications).values(
          unreadStaff.map((s) => ({
            type: "minutes_reminder" as const,
            title: "議事録の確認をお願いします",
            body: `「${minutesTitle}」をまだ確認していません。議事録タブから確認してください。`,
            resourceId: input.minutesId,
            isRead: 0,
            targetUserId: s.id,
          }))
        );
        broadcastEvent("notifications");
        return { success: true, sent: unreadStaff.length };
      }),
    /** 議事録を確認チェックする（個人単位で自分のリストから削除） */
    check: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutesChecks } = await import("../drizzle/schema");
        // 既にチェック済か確認
        const existing = await db.select().from(minutesChecks)
          .where(eq(minutesChecks.minutesId, input.minutesId));
        const alreadyChecked = existing.some((c) => c.userId === ctx.user.id);
        if (alreadyChecked) return { success: true };
        // チェックを追加（個人の確認記録）
        await db.insert(minutesChecks).values({
          minutesId: input.minutesId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "",
        });
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 議事録の確認チェックを解除する（個人単位） */
    uncheck: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutesChecks } = await import("../drizzle/schema");
        const { and, eq: eqOp } = await import("drizzle-orm");
        await db.delete(minutesChecks).where(
          and(
            eqOp(minutesChecks.minutesId, input.minutesId),
            eqOp(minutesChecks.userId, ctx.user.id)
          )
        );
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 議事録の既読者一覧を取得（adminのみ） */
    getReaders: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ閲覧できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutesChecks } = await import("../drizzle/schema");
        // 全スタッフ（管理者・事務員含む全ユーザー）を取得
        const allStaff = await db.select({ id: users.id, name: users.name }).from(users);
        // この議事録をチェック済みのユーザーIDを取得
        const checks = await db.select().from(minutesChecks).where(eq(minutesChecks.minutesId, input.minutesId));
        const checkedUserIds = new Set(checks.map((c) => c.userId));
        const readers = checks.map((c) => ({ userId: c.userId, userName: c.userName, checkedAt: c.checkedAt }));
        const unread = allStaff.filter((s) => !checkedUserIds.has(s.id)).map((s) => ({ userId: s.id, userName: s.name ?? "" }));
        return { readers, unread };
      }),
    /** 議事録を削除（投稿者本人または管理者のみ） */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes, minutesChecks } = await import("../drizzle/schema");
        const { eq: eqDel } = await import("drizzle-orm");
        // 投稿者本人または管理者のみ削除可能
        const targetDel = await db.select({ createdBy: minutes.createdBy }).from(minutes).where(eqDel(minutes.id, input.id)).limit(1);
        if (!targetDel.length) throw new TRPCError({ code: "NOT_FOUND", message: "議事録が見つかりません" });
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin" && ctx.user.id !== targetDel[0].createdBy) {
          throw new TRPCError({ code: "FORBIDDEN", message: "投稿者本人または管理者のみ削除できます" });
        }
        await db.delete(minutesChecks).where(eq(minutesChecks.minutesId, input.id));
        await db.delete(minutes).where(eq(minutes.id, input.id));
        broadcastEvent("minutes");
        return { success: true };
      }),
  }),

  /** 音声入力誤変換フィードバック */
  voiceFeedback: router({
    /** 誤変換を報告する */
    report: protectedProcedure
      .input(z.object({
        originalText: z.string(),
        transcribedResult: z.string().optional(),
        wrongField: z.string().optional(),
        wrongValue: z.string().optional(),
        correctValue: z.string().optional(),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { voiceFeedback } = await import("../drizzle/schema");
        const insertData: typeof voiceFeedback.$inferInsert = {
          originalText: input.originalText,
          transcribedResult: input.transcribedResult ?? undefined,
          wrongField: input.wrongField ?? undefined,
          wrongValue: input.wrongValue ?? undefined,
          correctValue: input.correctValue ?? undefined,
          comment: input.comment ?? undefined,
          reportedBy: ctx.user.id,
          reportedByName: ctx.user.name ?? "",
        };
        await db.insert(voiceFeedback).values(insertData);
        // オーナーに通知
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `音声入力誤変換報告: ${ctx.user.name}`,
          content: [
            `報告者: ${ctx.user.name}`,
            `元の音声: ${input.originalText}`,
            input.wrongField ? `誤変換項目: ${input.wrongField}` : null,
            input.wrongValue ? `誤変換内容: ${input.wrongValue}` : null,
            input.correctValue ? `正しい値: ${input.correctValue}` : null,
            input.comment ? `コメント: ${input.comment}` : null,
          ].filter(Boolean).join("\n"),
        });
        return { success: true };
      }),
  }),

  // ============================================================
  // Google Calendar
  // ============================================================
  calendar: router({
    /** カレンダー連携状態を取得（トークンが保存されているかどうか） */
    status: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { connected: false };
      const { eq: eqOp } = await import("drizzle-orm");
      const { users: usersTable } = await import("../drizzle/schema");
      const rows = await db.select({
        googleAccessToken: usersTable.googleAccessToken,
        googleTokenExpiry: usersTable.googleTokenExpiry,
      }).from(usersTable).where(eqOp(usersTable.id, ctx.user.id)).limit(1);
      const row = rows[0];
      if (!row?.googleAccessToken) return { connected: false };
      return { connected: true, tokenExpiry: row.googleTokenExpiry };
    }),

    /** Google Calendarのイベントを取得 */
    getEvents: protectedProcedure
      .input(z.object({
        timeMin: z.string().optional(),
        timeMax: z.string().optional(),
        maxResults: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { eq: eqOp } = await import("drizzle-orm");
        const { users: usersTable } = await import("../drizzle/schema");
        const rows = await db.select({
          googleAccessToken: usersTable.googleAccessToken,
          googleRefreshToken: usersTable.googleRefreshToken,
          googleTokenExpiry: usersTable.googleTokenExpiry,
        }).from(usersTable).where(eqOp(usersTable.id, ctx.user.id)).limit(1);
        const row = rows[0];
        if (!row?.googleAccessToken) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Google Calendar not connected" });
        }
        // トークンが期限切れしそうならリフレッシュ
        let accessToken = row.googleAccessToken;
        const expiry = row.googleTokenExpiry ?? 0;
        if (expiry < Date.now() + 60_000 && row.googleRefreshToken) {
          try {
            const { OAuth2Client } = await import("google-auth-library");
            const oauth2Client = new OAuth2Client(
              process.env.GOOGLE_OAUTH_CLIENT_ID,
              process.env.GOOGLE_OAUTH_CLIENT_SECRET
            );
            oauth2Client.setCredentials({ refresh_token: row.googleRefreshToken });
            const { credentials } = await oauth2Client.refreshAccessToken();
            if (credentials.access_token) {
              accessToken = credentials.access_token;
              const newExpiry = credentials.expiry_date ?? Date.now() + 3600_000;
              const { updateUserGoogleTokens } = await import("./db");
              await updateUserGoogleTokens(ctx.user.id, accessToken, row.googleRefreshToken, newExpiry);
            }
          } catch (e) {
            console.error("[Calendar] Token refresh failed", e);
          }
        }
        // Google Calendar APIを呼び出す
        const now = new Date();
        const timeMin = input.timeMin ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const timeMax = input.timeMax ?? new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          maxResults: String(input.maxResults),
          singleEvents: "true",
          orderBy: "startTime",
        });
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!response.ok) {
          const errText = await response.text();
          console.error("[Calendar] API error", response.status, errText);
          if (response.status === 401) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Google Calendar token expired. Please reconnect." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google Calendar API error" });
        }
        const data = await response.json() as any;
        const events = (data.items ?? []).map((item: any) => ({
          id: item.id as string,
          summary: (item.summary ?? "タイトルなし") as string,
          description: (item.description ?? null) as string | null,
          location: (item.location ?? null) as string | null,
          start: (item.start?.dateTime ?? item.start?.date ?? "") as string,
          end: (item.end?.dateTime ?? item.end?.date ?? "") as string,
          isAllDay: !item.start?.dateTime as boolean,
          htmlLink: (item.htmlLink ?? null) as string | null,
          colorId: (item.colorId ?? null) as string | null,
        }));
        return { events };
      }),
  }),
  /** 操作ログ */
  toolAuditLogs: router({
    /** ツール操作ログ一覧を取得（管理者・事務員のみ） */
    list: protectedProcedure
      .input(z.object({
        limit: z.number().int().min(1).max(200).default(100),
        toolType: z.enum(["team", "common", "all"]).default("all"),
      }))
      .query(async ({ ctx, input }) => {
        const canView = ctx.user.role === "admin" || (ctx.user as any).team === "事務員";
        if (!canView) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者または事務員のみ閲覧できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        const { toolAuditLogs } = await import("../drizzle/schema");
        const { desc, eq } = await import("drizzle-orm");
        if (input.toolType === "all") {
          return db.select().from(toolAuditLogs)
            .orderBy(desc(toolAuditLogs.createdAt))
            .limit(input.limit);
        }
        return db.select().from(toolAuditLogs)
          .where(eq(toolAuditLogs.toolType, input.toolType as "team" | "common"))
          .orderBy(desc(toolAuditLogs.createdAt))
          .limit(input.limit);
      }),
    /** 全操作ログを取得（CSV出力用） */
    exportAll: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(), // YYYY-MM-DD
        endDate: z.string().optional(),   // YYYY-MM-DD
        userId: z.number().int().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const canView = ctx.user.role === "admin" || (ctx.user as any).team === "事務員";
        if (!canView) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者または事務員のみ閲覧できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];

        const schema = await import("../drizzle/schema");
        const { desc, gte, lte, and, eq } = await import("drizzle-orm");

        // 日付フィルターの準備（JST基準）
        const toStartMs = (dateStr: string) => new Date(`${dateStr}T00:00:00+09:00`).getTime();
        const toEndMs = (dateStr: string) => new Date(`${dateStr}T23:59:59+09:00`).getTime();
        const startMs = input?.startDate ? toStartMs(input.startDate) : undefined;
        const endMs = input?.endDate ? toEndMs(input.endDate) : undefined;
        const filterUserId = input?.userId;

        const rows: Array<{ datetime: string; userName: string; category: string; action: string; detail: string }> = [];

        // 1. 出退勤ログ
        const attendanceWhere = [];
        if (startMs) attendanceWhere.push(gte(schema.attendanceLogs.clockedAt, startMs));
        if (endMs) attendanceWhere.push(lte(schema.attendanceLogs.clockedAt, endMs));
        if (filterUserId) attendanceWhere.push(eq(schema.attendanceLogs.userId, filterUserId));
        const attendance = await db.select().from(schema.attendanceLogs)
          .where(attendanceWhere.length ? and(...attendanceWhere) : undefined)
          .orderBy(desc(schema.attendanceLogs.clockedAt))
          .limit(2000);
        for (const a of attendance) {
          rows.push({
            datetime: new Date(a.clockedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: a.userName,
            category: "出退勤",
            action: a.type === "clock_in" ? "出勤" : "退勤",
            detail: "",
          });
        }

        // 2. 残業申請
        const overtimeWhere = [];
        if (startMs) overtimeWhere.push(gte(schema.overtimeApprovals.createdAt, new Date(startMs)));
        if (endMs) overtimeWhere.push(lte(schema.overtimeApprovals.createdAt, new Date(endMs)));
        if (filterUserId) overtimeWhere.push(eq(schema.overtimeApprovals.applicantUserId, filterUserId));
        const overtime = await db.select().from(schema.overtimeApprovals)
          .where(overtimeWhere.length ? and(...overtimeWhere) : undefined)
          .orderBy(desc(schema.overtimeApprovals.createdAt))
          .limit(2000);
        for (const o of overtime) {
          const statusLabel = o.status === "approved" ? "承認済" : o.status === "rejected" ? "却下" : "承認待ち";
          rows.push({
            datetime: new Date(o.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: o.applicantName,
            category: "残業申請",
            action: `申請（${statusLabel}）`,
            detail: `申請日: ${o.applicationDate} 理由: ${o.requestedReason ?? ""}`,
          });
        }

        // 3. アルコールチェック
        const alcoholWhere = [];
        if (startMs) alcoholWhere.push(gte(schema.alcoholChecks.checkedAt, startMs));
        if (endMs) alcoholWhere.push(lte(schema.alcoholChecks.checkedAt, endMs));
        if (filterUserId) alcoholWhere.push(eq(schema.alcoholChecks.userId, filterUserId));
        const alcohol = await db.select().from(schema.alcoholChecks)
          .where(alcoholWhere.length ? and(...alcoholWhere) : undefined)
          .orderBy(desc(schema.alcoholChecks.checkedAt))
          .limit(2000);
        for (const a of alcohol) {
          rows.push({
            datetime: new Date(a.checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: a.userName,
            category: "アルコールチェック",
            action: a.type === "clock_in" ? "勤務前" : "勤務後",
            detail: `測定値: ${a.alcoholMeasuredValue ?? ""} 検知: ${a.alcoholDetected ? "検知あり" : "検知なし"}`,
          });
        }

        // 4. タスク作成
        const tasksWhere = [];
        if (startMs) tasksWhere.push(gte(schema.tasks.createdAt, new Date(startMs)));
        if (endMs) tasksWhere.push(lte(schema.tasks.createdAt, new Date(endMs)));
        if (filterUserId) tasksWhere.push(eq(schema.tasks.createdBy, filterUserId));
        const tasksList = await db.select().from(schema.tasks)
          .where(tasksWhere.length ? and(...tasksWhere) : undefined)
          .orderBy(desc(schema.tasks.createdAt))
          .limit(2000);
        for (const t of tasksList) {
          rows.push({
            datetime: new Date(t.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: t.createdByName ?? "",
            category: "タスク",
            action: "作成",
            detail: `内容: ${t.text ?? ""} 指定先: ${t.assignTeam ?? t.assignUserName ?? "全員"}`,
          });
        }

        // 5. メッセージ投稿
        const messagesWhere = [];
        if (startMs) messagesWhere.push(gte(schema.messages.createdAt, new Date(startMs)));
        if (endMs) messagesWhere.push(lte(schema.messages.createdAt, new Date(endMs)));
        if (filterUserId) messagesWhere.push(eq(schema.messages.createdBy, filterUserId));
        const messagesList = await db.select().from(schema.messages)
          .where(messagesWhere.length ? and(...messagesWhere) : undefined)
          .orderBy(desc(schema.messages.createdAt))
          .limit(2000);
        for (const m of messagesList) {
          rows.push({
            datetime: new Date(m.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: m.createdByName ?? "",
            category: "メッセージ",
            action: "投稿",
            detail: `内容: ${(m.text ?? "").slice(0, 100)}`,
          });
        }

        // 6. スケジュール変更連絡
        const scheduleWhere = [];
        if (startMs) scheduleWhere.push(gte(schema.scheduleChanges.createdAt, new Date(startMs)));
        if (endMs) scheduleWhere.push(lte(schema.scheduleChanges.createdAt, new Date(endMs)));
        if (filterUserId) scheduleWhere.push(eq(schema.scheduleChanges.createdBy, filterUserId));
        const scheduleChanges = await db.select().from(schema.scheduleChanges)
          .where(scheduleWhere.length ? and(...scheduleWhere) : undefined)
          .orderBy(desc(schema.scheduleChanges.createdAt))
          .limit(2000);
        for (const s of scheduleChanges) {
          rows.push({
            datetime: new Date(s.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: s.createdByName ?? "",
            category: "スケジュール変更連絡",
            action: "送信",
            detail: `利用者: ${s.patientName ?? ""} 理由: ${(s.reason ?? "").slice(0, 100)}`,
          });
        }

        // 7. ツール操作ログ
        const toolWhere = [];
        if (startMs) toolWhere.push(gte(schema.toolAuditLogs.createdAt, new Date(startMs)));
        if (endMs) toolWhere.push(lte(schema.toolAuditLogs.createdAt, new Date(endMs)));
        if (filterUserId) toolWhere.push(eq(schema.toolAuditLogs.operatedBy, filterUserId));
        const toolLogs = await db.select().from(schema.toolAuditLogs)
          .where(toolWhere.length ? and(...toolWhere) : undefined)
          .orderBy(desc(schema.toolAuditLogs.createdAt))
          .limit(2000);
        for (const t of toolLogs) {
          const actionLabel = t.action === "create" ? "追加" : t.action === "update" ? "更新" : "削除";
          rows.push({
            datetime: new Date(t.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: t.operatedByName,
            category: "ツール操作",
            action: actionLabel,
            detail: `ツール名: ${t.toolLabel} 種別: ${t.toolType === "team" ? "チームツール" : "全チーム共通"} ${t.team ? `チーム: ${t.team}` : ""}`,
          });
        }

        // 8. 月次署名
        const sigWhere = [];
        if (startMs) sigWhere.push(gte(schema.monthlySignatures.signedAt, startMs));
        if (endMs) sigWhere.push(lte(schema.monthlySignatures.signedAt, endMs));
        if (filterUserId) sigWhere.push(eq(schema.monthlySignatures.userId, filterUserId));
        const sigs = await db.select().from(schema.monthlySignatures)
          .where(sigWhere.length ? and(...sigWhere) : undefined)
          .orderBy(desc(schema.monthlySignatures.signedAt))
          .limit(2000);
        for (const s of sigs) {
          rows.push({
            datetime: new Date(s.signedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            userName: s.userName,
            category: "月次署名",
            action: "署名",
            detail: `対象年月: ${s.targetYear}年${s.targetMonth}月`,
          });
        }

        // 日時順にソート
        rows.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
        return rows;
      }),
    /** 全スタッフ一覧を取得（CSVフィルター用） */
    getStaffList: protectedProcedure.query(async ({ ctx }) => {
      const canView = ctx.user.role === "admin" || ctx.user.role === "super_admin" || (ctx.user as any).team === "事務員";
      if (!canView) throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const { users } = await import("../drizzle/schema");
      return db.select({ id: users.id, name: users.name, role: users.role, team: users.team })
        .from(users)
        .orderBy(users.name);
    }),
  }),

  teamGoals: router({
    /** 今日有効なチーム目標を全チーム分取得（フロントエンド側でチームタブに応じてフィルタ） */
    getActive: protectedProcedure.query(async () => {
      const today = new Date();
      const jst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = jst.toISOString().slice(0, 10);
      return await getActiveTeamGoals(todayStr);
    }),
    /** 全チーム目標を取得（管理画面用） */
    getAll: protectedProcedure.query(async () => {
      return await getAllTeamGoals();
    }),
    /** チーム目標を作成する */
    create: protectedProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "全チーム"]),
        title: z.string().min(1).max(200),
        body: z.string().max(2000).nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await createTeamGoal({
          team: input.team,
          title: input.title,
          body: input.body ?? null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        broadcastEvent("teamGoals");
        return { success: true };
      }),
    /** チーム目標を更新する */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "全チーム"]).optional(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().max(2000).nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateTeamGoal(id, data);
        broadcastEvent("teamGoals");
        return { success: true };
      }),
    /** チーム目標を削除する */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
         await deleteTeamGoal(input.id);
        broadcastEvent("teamGoals");
        return { success: true };
      }),
  }),
  // ============================================================
  // 出退勤打刻
  // ============================================================
  attendance: router({
    /** 出勤または退勤を打刻する（打刻のみ・アルコールチェックは別途） */
    clock: protectedProcedure
      .input(z.object({
        type: z.enum(["clock_in", "clock_out"]),
        numberPlate: z.string().max(20).optional(),
        locationAddress: z.string().optional(),
        /** 緊急打刻時の備考（緊急訪問の理由など） */
        emergencyNote: z.string().max(500).optional(),
        /** 運転目的 */
        drivingPurpose: z.enum(["commute", "visit", "transport", "errand", "other"]).optional(),
        /** アルコール測定値 */
        alcoholMeasuredValue: z.string().max(10).optional(),
        /** 残業開始時刻（UNIX ms） */
        overtimeStartAt: z.number().optional(),
        /** 残業終了時刻（UNIX ms） */
        overtimeEndAt: z.number().optional(),
        /** 残業理由 */
        overtimeReason: z.string().max(500).optional(),
        /** 残業連絡先 */
        overtimeContact: z.string().max(200).optional(),
        /** 残業件数 */
        overtimeCount: z.number().int().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const now = Date.now();
        const log = await clockAttendance({
          type: input.type,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "不明",
          clockedAt: now,
          emergencyNote: input.emergencyNote ?? null,
        });
        // 出退勤スプレッドシートへ転記（非同期・失敗しても打刻は成功扱い）
        const jstDate = new Date(now + 9 * 60 * 60 * 1000);
        const year = jstDate.getUTCFullYear();
        const month = jstDate.getUTCMonth() + 1;
        // 当月スプレッドシートが未登録の場合は自動作成する
        autoCreateTimesheetSpreadsheet(year, month).catch((e) => console.warn("[Timesheet] Auto-create failed:", e));
        // 退勤打刻時に総労働時間を計算（同日の出勤打刻時刻をDBから取得）
        let totalWorkMinutes: number | null = null;
        // 日付またぎフラグ: 出勤が前日で退勤が今日の場合にtrue
        let isOvernightClockOut = false;
        // 出勤打刻の clockedAt（スプレッドシート転記で前日行を検索するために使用）
        let clockInAt: number | null = null;
        if (input.type === "clock_out") {
          try {
            const todayLogs = await getTodayAttendance(ctx.user.id);
            const clockInLog = todayLogs.find((l) => l.type === "clock_in");
            if (clockInLog) {
              totalWorkMinutes = Math.round((now - clockInLog.clockedAt) / 60000);
              clockInAt = clockInLog.clockedAt;
            } else {
              // 今日の出勤ログがない場合、前日の出勤ログを検索（日付またぎ退勤）
              const yesterdayLogs = await getYesterdayAttendance(ctx.user.id);
              const prevClockInLog = yesterdayLogs.find((l) => l.type === "clock_in");
              if (prevClockInLog) {
                totalWorkMinutes = Math.round((now - prevClockInLog.clockedAt) / 60000);
                clockInAt = prevClockInLog.clockedAt;
                isOvernightClockOut = true;
                console.log("[Timesheet] Overnight clock_out detected for", ctx.user.name, "clockIn:", new Date(prevClockInLog.clockedAt).toISOString());
              }
            }
          } catch (e) {
            console.warn("[Timesheet] Failed to get today attendance for totalWorkMinutes:", e);
          }
        }
        // 月またぎ退勤の場合（出勤月≠退勤月）は前月のスプレッドシートを使用する
        // isOvernightClockOut=true かつ clockInAt が前月の場合に月またぎと判定
        let targetYear = year;
        let targetMonth = month;
        let isMonthCrossClockOut = false;
        if (isOvernightClockOut && clockInAt) {
          const clockInJstDate = new Date(clockInAt + 9 * 60 * 60 * 1000);
          const clockInYear = clockInJstDate.getUTCFullYear();
          const clockInMonth = clockInJstDate.getUTCMonth() + 1;
          if (clockInYear !== year || clockInMonth !== month) {
            // 月またぎ: 出勤月のスプレッドシートを使用
            targetYear = clockInYear;
            targetMonth = clockInMonth;
            isMonthCrossClockOut = true;
            console.log(`[Timesheet] Month-cross clock_out detected for ${ctx.user.name}: clockIn=${clockInYear}/${clockInMonth}, clockOut=${year}/${month}`);
          }
        }
        getTimesheetSpreadsheets(targetYear, targetMonth).then(async (sheets) => {
          // 自動作成後に再取得する（初回打刻時はスプレッドシートがまだ作成中の場合があるため、失敗しても打刻は成功扱い）
          if (!sheets || sheets.length === 0) {
            if (isMonthCrossClockOut) {
              // 月またぎの場合、前月スプレッドシートが未登録なら警告のみ（自動作成しない）
              console.warn(`[Timesheet] No spreadsheet for previous month ${targetYear}/${targetMonth} (month-cross clock_out)`);
              return;
            }
            // 自動作成を待って再試行
            const newSheetId = await autoCreateTimesheetSpreadsheet(targetYear, targetMonth).catch(() => null);
            if (!newSheetId) {
              console.warn(`[Timesheet] No spreadsheet available for ${targetYear}/${targetMonth}`);
              return;
            }
            const newSheets = await getTimesheetSpreadsheets(targetYear, targetMonth);
            if (!newSheets || newSheets.length === 0) return;
            for (const sheet of newSheets) {
              await appendTimesheetToSheet({
                clockedAt: now,
                type: input.type,
                userName: ctx.user.name ?? "不明",
                numberPlate: input.numberPlate ?? null,
                locationAddress: input.locationAddress ?? null,
                emergencyNote: input.emergencyNote ?? null,
                drivingPurpose: input.drivingPurpose ?? null,
                alcoholMeasuredValue: input.alcoholMeasuredValue ?? null,
                overtimeStartAt: input.overtimeStartAt ?? null,
                overtimeEndAt: input.overtimeEndAt ?? null,
                overtimeReason: input.overtimeReason ?? null,
                overtimeContact: input.overtimeContact ?? null,
                overtimeCount: input.overtimeCount ?? null,
                totalWorkMinutes,
                isOvernightClockOut,
                clockInAt,
              }, sheet.spreadsheetId).catch((err) => {
                console.error("[Timesheet] Sheet sync failed:", err);
              });
            }
            return;
          }
          for (const sheet of sheets) {
            await appendTimesheetToSheet({
              clockedAt: now,
              type: input.type,
              userName: ctx.user.name ?? "不明",
              numberPlate: input.numberPlate ?? null,
              locationAddress: input.locationAddress ?? null,
              emergencyNote: input.emergencyNote ?? null,
              drivingPurpose: input.drivingPurpose ?? null,
              alcoholMeasuredValue: input.alcoholMeasuredValue ?? null,
              overtimeStartAt: input.overtimeStartAt ?? null,
              overtimeEndAt: input.overtimeEndAt ?? null,
              overtimeReason: input.overtimeReason ?? null,
              overtimeContact: input.overtimeContact ?? null,
              overtimeCount: input.overtimeCount ?? null,
              totalWorkMinutes,
              isOvernightClockOut,
              clockInAt,
            }, sheet.spreadsheetId).catch((err) => {
              console.error("[Timesheet] Sheet sync failed:", err);
            });
          }
        }).catch((err) => {
          console.error("[Timesheet] getTimesheetSpreadsheets failed:", err);
        });
        return { success: true, log };
      }),
    /** アルコールチェックを記録しスプレッドシートに転記する */
    saveAlcoholCheck: protectedProcedure
      .input(z.object({
        clockType: z.enum(["clock_in", "clock_out"]),
        numberPlate: z.string().max(20),
        confirmMethod: z.enum(["online", "face"]).default("online"),
        detectorUsed: z.boolean().default(true),
        alcoholDetected: z.boolean().default(false),
        confirmerName: z.string().max(100).default("森脇崇"),
        notes: z.string().optional(),
        // 出退勤打刻時刻（アルコールチェック時に打刻時刻を記録）
        clockInAt: z.number().optional(),
        clockOutAt: z.number().optional(),
        // 残業入力（退勤時のみ）
        overtimeStartAt: z.number().optional(),
        overtimeEndAt: z.number().optional(),
        overtimeReason: z.string().optional(),
        overtimeContact: z.string().optional(),
        overtimeCount: z.number().optional(),
        // 位置情報（任意）
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        locationAddress: z.string().optional(),
        // 追加項目
        alcoholMeasuredValue: z.string().max(10).optional(),
        detectorType: z.string().max(100).optional(),
        drivingPurpose: z.enum(["commute", "visit", "transport", "errand", "other"]).optional(),
        hasPassenger: z.boolean().optional(),
        passengerCount: z.number().int().min(1).optional(),
        physicalCondition: z.enum(["good", "poor"]).optional(),
        physicalConditionNote: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const now = Date.now();
        // ナンバープレートをユーザー情報に保存
        if (input.numberPlate) {
          await updateUserNumberPlate(ctx.user.id, input.numberPlate);
        }
        // アルコールチェック記録
        const alcoholCheck = await saveAlcoholCheck({
          type: input.clockType,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "不明",
          numberPlate: input.numberPlate,
          confirmMethod: input.confirmMethod,
          detectorUsed: input.detectorUsed ? 1 : 0,
          alcoholDetected: input.alcoholDetected ? 1 : 0,
          confirmerName: input.confirmerName,
          notes: input.notes ?? null,
          checkedAt: now,
          clockInAt: input.clockInAt ?? null,
          clockOutAt: input.clockOutAt ?? null,
          overtimeStartAt: input.overtimeStartAt ?? null,
          overtimeEndAt: input.overtimeEndAt ?? null,
          overtimeReason: input.overtimeReason ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          locationAddress: input.locationAddress ?? null,
          alcoholMeasuredValue: input.alcoholMeasuredValue ?? null,
          detectorType: input.detectorType ?? null,
          drivingPurpose: input.drivingPurpose ?? null,
          hasPassenger: input.hasPassenger != null ? (input.hasPassenger ? 1 : 0) : null,
          passengerCount: input.passengerCount ?? null,
          physicalCondition: input.physicalCondition ?? null,
          physicalConditionNote: input.physicalConditionNote ?? null,
        } as any);
        // 月別スプレッドシートを取得して転記（非同期・失敗しても記録は成功扱い）
        const checkedDate = new Date(now);
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstDate = new Date(checkedDate.getTime() + jstOffset);
        // 日付またぎ・月またぎ退勤の判定（アルコールチェック用）
        let isOvernightAlcohol = false;
        let isMonthCrossAlcohol = false;
        if (input.clockType === "clock_out" && input.clockInAt) {
          const clockInJst = new Date(input.clockInAt + jstOffset);
          const clockOutJst = jstDate;
          const clockInDay = clockInJst.getUTCDate();
          const clockOutDay = clockOutJst.getUTCDate();
          if (clockInDay !== clockOutDay) {
            isOvernightAlcohol = true;
            const clockInMonth = clockInJst.getUTCMonth();
            const clockOutMonth = clockOutJst.getUTCMonth();
            if (clockInMonth !== clockOutMonth) {
              isMonthCrossAlcohol = true;
            }
          }
        }
        // 月またぎの場合は出勤月のスプレッドシートを使用する
        const targetJstDate = (isMonthCrossAlcohol && input.clockInAt)
          ? new Date(input.clockInAt + jstOffset)
          : jstDate;
        const year = targetJstDate.getUTCFullYear();
        const month = targetJstDate.getUTCMonth() + 1;
        // 当月スプレッドシートが未登録の場合は自動作成する
        autoCreateAlcoholCheckSpreadsheet(year, month).then(async (autoSpreadsheetId) => {
          if (autoSpreadsheetId) {
            console.log(`[AlcoholCheck] Using spreadsheet ${autoSpreadsheetId} for ${year}/${month}`);
          }
        }).catch((e) => console.warn("[AlcoholCheck] Auto-create spreadsheet failed:", e));

        getAlcoholCheckSpreadsheet(year, month).then(async (initialSheetReg) => {
          // スプレッドシートが未登録の場合、自動作成を試みてから再取得
          let sheetReg = initialSheetReg;
          if (!sheetReg) {
            const newId = await autoCreateAlcoholCheckSpreadsheet(year, month);
            if (newId) {
              sheetReg = await getAlcoholCheckSpreadsheet(year, month);
            }
          }
          if (!sheetReg) {
            console.warn(`[AlcoholCheck] No spreadsheet available for ${year}/${month}`);
            return;
          }
          await appendAlcoholCheckToSheet({
            ...alcoholCheck,
            clockInAt: input.clockInAt ?? null,
            clockOutAt: input.clockOutAt ?? null,
            overtimeStartAt: input.overtimeStartAt ?? null,
            overtimeEndAt: input.overtimeEndAt ?? null,
            overtimeReason: input.overtimeReason ?? null,
            overtimeContact: input.overtimeContact ?? null,
            overtimeCount: input.overtimeCount ?? null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            locationAddress: input.locationAddress ?? null,
            alcoholMeasuredValue: input.alcoholMeasuredValue ?? null,
            detectorType: input.detectorType ?? null,
            drivingPurpose: input.drivingPurpose ?? null,
            hasPassenger: input.hasPassenger ?? null,
            passengerCount: input.passengerCount ?? null,
            physicalCondition: input.physicalCondition ?? null,
            physicalConditionNote: input.physicalConditionNote ?? null,
            isOvernightClockOut: isOvernightAlcohol,
            isMonthCrossClockOut: isMonthCrossAlcohol,
          }, sheetReg.spreadsheetId);
          await markAlcoholCheckSynced(alcoholCheck.id);
          // 酒気帯「有」の場合は管理者（森脇崇）にプッシュ通知を送信する
          if (input.alcoholDetected) {
            const jstNowStr = new Date(now + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16);
            const typeLabel = input.clockType === 'clock_in' ? '出勤' : '退勤';
            await sendPushToUser('森脇崇', {
              title: '⚠️ 酒気帯検知 「有」 検知あり',
              body: `${jstNowStr}　${typeLabel}時　${ctx.user.name ?? '不明'}さんが酒気帯を検知されました。確認者: ${input.confirmerName}`,
              url: '/',
            }).catch((e) => console.error('[AlcoholCheck] Push notification failed:', e));
          }
        }).catch((err) => {
          console.error("[AlcoholCheck] Sheet sync failed:", err);
        });
        // 退勤時に残業ありの場合、overtimeApprovalsテーブルに自動登録して特級管理者に通知する
        if (input.clockType === 'clock_out' && input.overtimeStartAt && input.overtimeEndAt) {
          try {
            const { createOvertimeApproval, getSuperAdminUsers, createOvertimeNotification } = await import('./db');
            const jstNow = new Date(now + 9 * 60 * 60 * 1000);
            const applicationDate = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;
            const overtimeRecord = await createOvertimeApproval({
              applicantUserId: ctx.user.id,
              applicantName: ctx.user.name ?? '不明',
              applicationDate,
              requestedStartAt: input.overtimeStartAt,
              requestedEndAt: input.overtimeEndAt,
              requestedReason: input.overtimeReason ?? undefined,
            });
            // 特級管理者にプッシュ通知＋アプリ内通知を送信
            const superAdmins = await getSuperAdminUsers();
            const startStr = new Date(input.overtimeStartAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
            const endStr = new Date(input.overtimeEndAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
            const notifTitle = `⏰ 残業申請：${ctx.user.name ?? '不明'}`;
            const notifBody = `${applicationDate} ${startStr}〜${endStr}　理由：${input.overtimeReason ?? '未記入'}`;
            for (const admin of superAdmins) {
              createOvertimeNotification({
                targetUserId: admin.id,
                type: 'overtime_request',
                title: notifTitle,
                body: notifBody,
                resourceId: overtimeRecord?.insertId,
              }).catch((e) => console.warn('[OvertimeAuto] Notification insert failed:', e));
              sendPushToUser(admin.name ?? '', {
                title: notifTitle,
                body: notifBody,
                url: '/overtime-admin',
              }).catch((e) => console.warn('[OvertimeAuto] Push failed:', e));
            }
          } catch (e) {
            console.warn('[OvertimeAuto] Failed to create overtime approval from alcohol check:', e);
          }
        }
        return { success: true, alcoholCheckId: alcoholCheck.id };
      }),
    /** 月別スプレッドシート一覧を取得する（管理者用） */
    getSpreadsheets: protectedProcedure
      .query(async () => {
        return getAllAlcoholCheckSpreadsheets();
      }),
    /** 月別スプレッドシートを登録・更新する（管理者用） */
    upsertSpreadsheet: protectedProcedure
      .input(z.object({
        year: z.number().min(2020).max(2100),
        month: z.number().min(1).max(12),
        spreadsheetId: z.string().min(1).max(100),
        label: z.string().max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        await upsertAlcoholCheckSpreadsheet(input);
        return { success: true };
      }),
    /** 月別スプレッドシート登録を削除する（管理者用） */
    deleteSpreadsheet: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAlcoholCheckSpreadsheet(input.id);
        return { success: true };
      }),
    /** 指定年月のアルコールチェック用スプレッドシートを手動で自動作成する（管理者用） */
    createSpreadsheet: protectedProcedure
      .input(z.object({
        year: z.number().min(2020).max(2100),
        month: z.number().min(1).max(12),
      }))
      .mutation(async ({ input }) => {
        const spreadsheetId = await autoCreateAlcoholCheckSpreadsheet(input.year, input.month);
        if (!spreadsheetId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "スプレッドシートの作成に失敗しました" });
        }
        return { success: true, spreadsheetId };
      }),
    /** アルコールチェック記録を期間指定でCSV形式にエクスポートする（管理者用） */
    exportCsv: protectedProcedure
      .input(z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(async ({ input }) => {
        // 開始日の0:00 JST → UTC ms
        const startMs = new Date(`${input.startDate}T00:00:00+09:00`).getTime();
        // 終了日の23:59:59 JST → UTC ms
        const endMs = new Date(`${input.endDate}T23:59:59+09:00`).getTime();
        if (endMs < startMs) throw new TRPCError({ code: "BAD_REQUEST", message: "開始日は終了日以前にしてください" });
        const records = await getAlcoholChecksByRange(startMs, endMs);
        const toJST = (ms: number | null | undefined) =>
          ms ? new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
        const header = ["実施日時", "区分", "氏名", "ナンバープレート", "出勤打刻", "退勤打刻", "確認方法", "検知器使用", "酒気帯有無", "確認者", "残業時間", "残業理由", "連絡先", "人数", "備考", "登録日時"];
        const rows = records.map((r) => [
          toJST(r.checkedAt),
          r.type === "clock_in" ? "出勤" : "退勤",
          r.userName,
          r.numberPlate,
          toJST(r.clockInAt),
          toJST(r.clockOutAt),
          r.confirmMethod === "online" ? "オンライン画面" : "対面",
          r.detectorUsed ? "使用" : "未使用",
          r.alcoholDetected ? "有" : "無",
          r.confirmerName,
          r.overtimeStartAt && r.overtimeEndAt
            ? `${toJST(r.overtimeStartAt)}～${toJST(r.overtimeEndAt)}`
            : "",
          r.overtimeReason ?? "",
          (r as any).overtimeContact ?? "",
          (r as any).overtimeCount != null ? String((r as any).overtimeCount) : "",
          r.notes ?? "",
          toJST(r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt)),
        ]);
        // CSV変換（カンマ・改行をエスケープ）
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const csvLines = [header, ...rows].map((row) => row.map(escape).join(","));
        const csv = "\uFEFF" + csvLines.join("\n"); // BOM付き UTF-8
        return { csv, count: records.length };
      }),
    /** スプレッドシートを共有設定し、URLを返す（管理者用） */
    shareSpreadsheet: protectedProcedure
      .input(z.object({ spreadsheetId: z.string().min(1).max(100) }))
      .mutation(async ({ input }) => {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
          },
          scopes: ["https://www.googleapis.com/auth/drive"],
        });
        const drive = google.drive({ version: "v3", auth });
        // 既存の権限を確認する
        let alreadyShared = false;
        try {
          const permsRes = await drive.permissions.list({
            fileId: input.spreadsheetId,
            fields: "permissions(id,type,role,emailAddress)",
          });
          const perms = permsRes.data.permissions ?? [];
          alreadyShared = perms.some((p) => p.type === "anyone" || p.role === "writer" || p.role === "reader");
        } catch (_) {}
        // OWNER_EMAILへの共有が未設定なら追加する
        const ownerEmail = process.env.OWNER_EMAIL;
        if (ownerEmail) {
          try {
            await drive.permissions.create({
              fileId: input.spreadsheetId,
              requestBody: { type: "user", role: "writer", emailAddress: ownerEmail },
              sendNotificationEmail: false,
            });
          } catch (_) { /* 既に共有済みの場合は無視 */ }
        }
        const url = `https://docs.google.com/spreadsheets/d/${input.spreadsheetId}/edit`;
        return { success: true, url, alreadyShared };
      }),
    /** 未同期のアルコールチェック記録をスプレッドシートに再転記する（管理者用） */
    retrySync: protectedProcedure
      .mutation(async () => {
        const records = await getUnsyncedAlcoholChecks();
        let successCount = 0;
        let failCount = 0;
        const jstOffset = 9 * 60 * 60 * 1000;
        for (const record of records) {
          try {
            const checkedJst = new Date(record.checkedAt + jstOffset);
            const year = checkedJst.getUTCFullYear();
            const month = checkedJst.getUTCMonth() + 1;
            let sheetReg = await getAlcoholCheckSpreadsheet(year, month);
            if (!sheetReg) {
              const newId = await autoCreateAlcoholCheckSpreadsheet(year, month);
              if (newId) sheetReg = await getAlcoholCheckSpreadsheet(year, month);
            }
            if (!sheetReg) {
              console.warn(`[AlcoholCheck retrySync] No spreadsheet for ${year}/${month}, id=${record.id}`);
              failCount++;
              continue;
            }
            await appendAlcoholCheckToSheet({
              ...record,
              hasPassenger: record.hasPassenger != null ? record.hasPassenger !== 0 : null,
              isOvernightClockOut: false,
              isMonthCrossClockOut: false,
            }, sheetReg.spreadsheetId);
            await markAlcoholCheckSynced(record.id);
            successCount++;
          } catch (err) {
            console.error(`[AlcoholCheck retrySync] Failed for id=${record.id}:`, err);
            failCount++;
          }
        }
        return { success: true, successCount, failCount, total: records.length };
      }),
    /** 今日の自分の打刻履歴を取得する */
    today: protectedProcedure
      .query(async ({ ctx }) => {
        return getTodayAttendance(ctx.user.id);
      }),
    /** ユーザーのナンバープレートを更新する */
    updateNumberPlate: protectedProcedure
      .input(z.object({ numberPlate: z.string().max(20) }))
      .mutation(async ({ input, ctx }) => {
        await updateUserNumberPlate(ctx.user.id, input.numberPlate);
        return { success: true };
      }),
  }),
  // ============================================================
  // アルコール検知器設定
  // ============================================================
  alcoholDetector: router({
    /** 有効な検知器一覧を取得する（フォーム用プルダウン） */
    getActive: protectedProcedure.query(async () => {
      return getActiveAlcoholDetectors();
    }),
    /** 全検知器一覧を取得する（管理画面用） */
    getAll: protectedProcedure.query(async () => {
      return getAllAlcoholDetectors();
    }),
    /** 検知器を追加する */
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(200),
        modelNumber: z.string().max(100).optional(),
        manufacturer: z.string().max(100).optional(),
        isActive: z.number().int().min(0).max(1).default(1),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input }) => {
        const id = await createAlcoholDetector(input);
        return { success: true, id };
      }),
    /** 検知器を更新する */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(200).optional(),
        modelNumber: z.string().max(100).nullable().optional(),
        manufacturer: z.string().max(100).nullable().optional(),
        isActive: z.number().int().min(0).max(1).optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateAlcoholDetector(id, data);
        return { success: true };
      }),
    /** 検知器を削除する */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteAlcoholDetector(input.id);
        return { success: true };
      }),
  }),
  // ============================================================
  // AI共有プロンプト
  // ============================================================
  sharedPrompts: router({
    /** 全プロンプト一覧を取得する */
    getAll: protectedProcedure
      .query(async () => {
        return getSharedPrompts();
      }),
    /** プロンプトを新規作成する */
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        body: z.string().min(1),
        aiTool: z.string().min(1).max(100),
        category: z.string().max(100).optional(),
        usageNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const prompt = await createSharedPrompt({
          title: input.title,
          body: input.body,
          aiTool: input.aiTool,
          category: input.category,
          usageNotes: input.usageNotes,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        return { success: true, prompt };
      }),
    /** プロンプトを更新する */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200),
        body: z.string().min(1),
        aiTool: z.string().min(1).max(100),
        category: z.string().max(100).optional(),
        usageNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateSharedPrompt(input.id, {
          title: input.title,
          body: input.body,
          aiTool: input.aiTool,
          category: input.category,
          usageNotes: input.usageNotes,
          updatedByName: ctx.user.name ?? "不明",
        });
        return { success: true };
      }),
    /** プロンプトを削除する */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSharedPrompt(input.id);
        return { success: true };
      }),
    /** プロンプトの並び順を一括更新する（管理者・特級管理者のみ） */
    reorder: protectedProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
        }
        await reorderSharedPrompts(input.orderedIds);
        return { success: true };
      }),
    /** 管理者が選択した訪問チェック用プロンプトIDを取得する */
    getSelectedId: protectedProcedure
      .query(async () => {
        const val = await getSetting("visit_selected_prompt_id", "");
        return { promptId: val ? parseInt(val, 10) : null };
      }),
    /** 管理者が訪問チェック用プロンプトを選択する（管理者のみ） */
    setSelectedId: protectedProcedure
      .input(z.object({ promptId: z.number().nullable() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ操作できます" });
        }
        if (input.promptId === null) {
          await setSetting("visit_selected_prompt_id", "");
        } else {
          await setSetting("visit_selected_prompt_id", String(input.promptId));
        }
        return { success: true };
      }),
  }),

  // ============================================================
  // 事故リンク（accidentLinks）
  // ============================================================
  accidentLinks: router({
    /** 事故リンクを全件取得する */
    getAll: protectedProcedure.query(async () => {
      const { getAllAccidentLinks } = await import("./db");
      return getAllAccidentLinks();
    }),
    /** 事故リンクを追加する（管理者のみ） */
    create: protectedProcedure
      .input(z.object({
        category: z.enum(["医療事故・虐待", "ヒヤリハット・アクシデント"]),
        label: z.string().min(1).max(200),
        href: z.string().url(),
        description: z.string().max(500).optional().default(""),
        sortOrder: z.number().int().optional().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ追加できます" });
        }
        const { createAccidentLink } = await import("./db");
        const id = await createAccidentLink(input);
        return { success: true, id };
      }),
    /** 事故リンクを削除する（管理者のみ） */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ削除できます" });
        }
        const { deleteAccidentLink } = await import("./db");
        await deleteAccidentLink(input.id);
        return { success: true };
      }),
  }),

  /** ====== タイムシートスプレッドシート管理 ====== */
  timesheet: router({
    /** 全スプレッドシートを取得する */
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { getAllTimesheetSpreadsheets } = await import("./db");
        return getAllTimesheetSpreadsheets();
      }),
    /** 当月の業務日報URLを取得する（全スタッフ共通、出退勤画面用） */
    getCurrentMonthUrl: protectedProcedure
      .query(async ({ }) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const { getTimesheetSpreadsheets } = await import("./db");
        const sheets = await getTimesheetSpreadsheets(year, month);
        if (sheets.length > 0) {
          return { url: sheets[0].spreadsheetUrl, found: true };
        }
        // 当月がなければフォールバックとして前月を検索
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevSheets = await getTimesheetSpreadsheets(prevYear, prevMonth);
        if (prevSheets.length > 0) {
          return { url: prevSheets[0].spreadsheetUrl, found: false };
        }
        return { url: null, found: false };
      }),
    /** 月別スプレッドシートを取得する */
    getByMonth: protectedProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { getTimesheetSpreadsheets } = await import("./db");
        return getTimesheetSpreadsheets(input.year, input.month);
      }),
    /** スプレッドシートを登録する */
    create: protectedProcedure
      .input(z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        label: z.string().min(1).max(200),
        spreadsheetUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { createTimesheetSpreadsheet } = await import("./db");
        await createTimesheetSpreadsheet(input);
        return { success: true };
      }),
     /** スプレッドシートを削除する */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { deleteTimesheetSpreadsheet } = await import("./db");
        await deleteTimesheetSpreadsheet(input.id);
        return { success: true };
      }),
    /** 指定年月の出退勤スプレッドシートを自動作成する */
    autoCreate: protectedProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { year, month } = input;
        let spreadsheetId: string | null = null;
        try {
          // 既に登録済みならスキップ
          const { getTimesheetSpreadsheets, upsertTimesheetSpreadsheet, getSetting } = await import("./db");
          const existing = await getTimesheetSpreadsheets(year, month);
          if (existing && existing.length > 0) {
            spreadsheetId = existing[0].spreadsheetId;
          } else {
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
            // 指定のGoogle Driveフォルダ内に直接スプレッドシートを作成
            const TIMESHEET_FOLDER_ID = "11GxLu7YB23OzV8kxMpkwSWTLOei9j7hk";
            const createRes = await drive.files.create({
              requestBody: {
                name: title,
                mimeType: "application/vnd.google-apps.spreadsheet",
                parents: [TIMESHEET_FOLDER_ID],
              },
              fields: "id",
              supportsAllDrives: true,
            });
            spreadsheetId = createRes.data.id!;
            const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
            console.log(`[TimesheetAutoSheet] Created spreadsheet in folder: ${TIMESHEET_FOLDER_ID}`);
            // デフォルトシート（Sheet1等）を「概要」にリネーム
            const metaForRename = await sheets.spreadsheets.get({ spreadsheetId });
            const defaultSheetId = metaForRename.data.sheets?.[0]?.properties?.sheetId;
            if (defaultSheetId !== undefined) {
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                  requests: [{ updateSheetProperties: { properties: { sheetId: defaultSheetId, title: "概要" }, fields: "title" } }],
                },
              });
            }
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
                  ["記載項目", "日付 / 出勤打刻時間 / 退勤打刻時間 / 残業開始 / 残業終了 / 残業時間(分) / 残業理由 / 残業詳細（連絡先・件数） / 残業申請承認状況"],
                ],
              },
            });
            // 共有先メールアドレスに自動共有
            const shareEmailsValue = await getSetting("sheet_share_emails", "");
            const shareEmails = shareEmailsValue ? shareEmailsValue.split(",").map((e: string) => e.trim()).filter(Boolean) : [];
            for (const email of shareEmails) {
              await drive.permissions.create({
                fileId: spreadsheetId,
                requestBody: { type: "user", role: "writer", emailAddress: email },
                sendNotificationEmail: false,
              }).catch((e: unknown) => console.warn(`[TimesheetAutoSheet] Share to ${email} failed:`, e));
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
          }
        } catch (err) {
          console.error("[Timesheet.autoCreate] Exception:", err);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `スプレッドシートの作成に失敗しました: ${err instanceof Error ? err.message : String(err)}` });
        }
        if (!spreadsheetId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "スプレッドシートの作成に失敗しました（spreadsheetId が null）" });
        const { getTimesheetSpreadsheets } = await import("./db");
        const sheets = await getTimesheetSpreadsheets(year, month);
        return { success: true, spreadsheetId, spreadsheetUrl: sheets[0]?.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
      }),
    /** 出退勤スプレッドシートのURLをコピーする（共有URLを返す） */
    shareSpreadsheet: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { getAllTimesheetSpreadsheets } = await import("./db");
        const all = await getAllTimesheetSpreadsheets();
        const sheet = all.find((s) => s.id === input.id);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND" });
        return { url: sheet.spreadsheetUrl };
      }),
  }),
  /** ====== 残業申請・承認 ====== */
  overtime: router({
    /** 残業申請一覧を取得する（管理者用） */
    getAll: protectedProcedure
      .input(z.object({
        date: z.string().optional(),
        status: z.enum(["pending", "approved", "rejected", "all"]).optional(),
        team: z.string().optional(),
        yearMonth: z.string().optional(), // YYYY-MM形式
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { getOvertimeApprovals } = await import("./db");
        const opts: { date?: string; status?: string; team?: string; yearMonth?: string } = {};
        if (input?.date) opts.date = input.date;
        if (input?.status && input.status !== "all") opts.status = input.status;
        if (input?.team) opts.team = input.team;
        if (input?.yearMonth) opts.yearMonth = input.yearMonth;
        return getOvertimeApprovals(opts);
      }),
    /** 自分の残業申請一覧を取得する */
    getMine: protectedProcedure
      .query(async ({ ctx }) => {
        const { getOvertimeApprovalsByUser } = await import("./db");
        return getOvertimeApprovalsByUser(ctx.user.id);
      }),
    /** 残業申請を作成する */
    create: protectedProcedure
      .input(z.object({
        applicationDate: z.string(),
        requestedStartAt: z.number(),
        requestedEndAt: z.number(),
        requestedReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createOvertimeApproval, getSuperAdminUsers, createOvertimeNotification } = await import("./db");
        const record = await createOvertimeApproval({
          applicantUserId: ctx.user.id,
          applicantName: ctx.user.name ?? "不明",
          ...input,
        });
        // 特級管理者全員に残業申請のアプリ内通知を送信
        try {
          const superAdmins = await getSuperAdminUsers();
          const startTime = new Date(input.requestedStartAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
          const endTime = new Date(input.requestedEndAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
          const notifyPromises = superAdmins.map((admin) =>
            createOvertimeNotification({
              targetUserId: admin.id,
              type: "overtime_request",
              title: `残業申請：${ctx.user.name ?? "不明"}`,
              body: `${input.applicationDate} ${startTime}～${endTime}\n理由：${input.requestedReason ?? "（理由なし）"}\n承認または却下をお願いします。`,
              resourceId: (record as any)?.insertId ?? undefined,
            }).catch((e) => console.error(`[Overtime] notify failed for userId=${admin.id}:`, e))
          );
          await Promise.allSettled(notifyPromises);
        } catch (e) {
          console.error("[Overtime] Super admin notification failed:", e);
        }
        return { success: true };
      }),
    /** 残業申請を承認・却下する（管理者用） */
    approve: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        status: z.enum(["approved", "rejected"]),
        adjustedStartAt: z.number().optional(),
        adjustedEndAt: z.number().optional(),
        approverComment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { approveOvertimeApproval, getOvertimeApprovalById, getTimesheetSpreadsheets, createOvertimeNotification } = await import("./db");
        const approvedAt = Date.now();
        await approveOvertimeApproval({
          id: input.id,
          approverUserId: ctx.user.id,
          approverName: ctx.user.name ?? "不明",
          status: input.status,
          adjustedStartAt: input.adjustedStartAt,
          adjustedEndAt: input.adjustedEndAt,
          approverComment: input.approverComment,
        });
        // 承認後にスプレッドシートへ転記（非同期・失敗しても承認は成功扱い）
        getOvertimeApprovalById(input.id).then(async (record) => {
          if (!record) return;
          const appDate = record.applicationDate;
          const [year, month] = appDate.split("-").map(Number);
          const sheets = await getTimesheetSpreadsheets(year, month);
          if (!sheets || sheets.length === 0) {
            console.warn(`[Overtime] No spreadsheet registered for ${year}/${month}`);
            return;
          }
          for (const sheet of sheets) {
            // 残業申請専用タブ（月別）を更新
            await appendOvertimeToSheet({
              applicationDate: appDate,
              applicantName: record.applicantName,
              requestedStartAt: record.requestedStartAt,
              requestedEndAt: record.requestedEndAt,
              requestedReason: record.requestedReason,
              status: input.status,
              approverName: ctx.user.name ?? "不明",
              approvedAt,
              adjustedStartAt: input.adjustedStartAt ?? null,
              adjustedEndAt: input.adjustedEndAt ?? null,
              approverComment: input.approverComment ?? null,
              updateExisting: true, // 承認・却下時は既存行を上書き更新
            }, sheet.spreadsheetId).catch((err) => {
              console.error("[Overtime] Sheet sync failed:", err);
            });
            // 出退勤記録タブ（職員名タブ）のI列（残業申請承認状況）も更新
            await updateTimesheetOvertimeApproval({
              applicationDate: appDate,
              applicantName: record.applicantName,
              status: input.status,
              approverName: ctx.user.name ?? "不明",
              approverComment: input.approverComment ?? null,
              adjustedStartAt: input.adjustedStartAt ?? null,
              adjustedEndAt: input.adjustedEndAt ?? null,
              requestedStartAt: record.requestedStartAt,
              requestedEndAt: record.requestedEndAt,
              requestedReason: record.requestedReason ?? null,
              requestedDetail: null, // 残業詳細（連絡先・件数）は別途設定なし
            }, sheet.spreadsheetId).catch((err) => {
              console.error("[Timesheet] Approval status update failed:", err);
            });
          }
          // 申請者へ承認・却下の通知を送信
          if (record.applicantUserId) {
            const statusLabel = input.status === "approved" ? "承認" : "却下";
            const startStr = new Date(record.requestedStartAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
            const endStr = new Date(record.requestedEndAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
            createOvertimeNotification({
              targetUserId: record.applicantUserId,
              type: input.status === "approved" ? "overtime_approved" : "overtime_rejected",
              title: `残業申請が${statusLabel}されました`,
              body: `${record.applicationDate} ${startStr}～${endStr}\n${statusLabel}者：${ctx.user.name ?? "不明"}${input.approverComment ? `\nコメント：${input.approverComment}` : ""}`,
              resourceId: input.id,
            }).catch((e) => console.error("[Overtime] notify applicant failed:", e));
          }
        }).catch((err) => {
          console.error("[Overtime] getOvertimeApprovalById failed:", err);
        });
        // SSEで全クライアントに残業承認更新を通知（月次残業確認モーダルのリアルタイム更新）
        const { broadcastEvent } = await import("./_core/sse");
        broadcastEvent("overtimeApprovals", { id: input.id, status: input.status });
        return { success: true };
      }),
    /** 残業申請を削除する（申請者本人のみ・pending状態のみ） */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteOvertimeApproval } = await import("./db");
        await deleteOvertimeApproval(input.id, ctx.user.id);
        return { success: true };
      }),
    /** 残業申請を一括承認する（特級管理者・管理者のみ） */
    bulkApprove: protectedProcedure
      .input(z.object({
        ids: z.array(z.number().int()).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { approveOvertimeApproval, getOvertimeApprovalById, getTimesheetSpreadsheets, createOvertimeNotification } = await import("./db");
        const approvedAt = Date.now();
        const results: { id: number; success: boolean }[] = [];
        for (const id of input.ids) {
          try {
            await approveOvertimeApproval({
              id,
              approverUserId: ctx.user.id,
              approverName: ctx.user.name ?? "不明",
              status: "approved",
            });
            getOvertimeApprovalById(id).then(async (record) => {
              if (!record) return;
              const appDate = record.applicationDate;
              const [year, month] = appDate.split("-").map(Number);
              const sheets = await getTimesheetSpreadsheets(year, month);
              if (!sheets || sheets.length === 0) return;
              for (const sheet of sheets) {
                await appendOvertimeToSheet({
                  applicationDate: appDate,
                  applicantName: record.applicantName,
                  requestedStartAt: record.requestedStartAt,
                  requestedEndAt: record.requestedEndAt,
                  requestedReason: record.requestedReason,
                  status: "approved",
                  approverName: ctx.user.name ?? "不明",
                  approvedAt,
                  adjustedStartAt: null,
                  adjustedEndAt: null,
                  approverComment: null,
                  updateExisting: true,
                }, sheet.spreadsheetId).catch((err) => console.error("[BulkApprove] Sheet sync failed:", err));
                await updateTimesheetOvertimeApproval({
                  applicationDate: appDate,
                  applicantName: record.applicantName,
                  status: "approved",
                  approverName: ctx.user.name ?? "不明",
                  approverComment: null,
                  adjustedStartAt: null,
                  adjustedEndAt: null,
                  requestedStartAt: record.requestedStartAt,
                  requestedEndAt: record.requestedEndAt,
                  requestedReason: record.requestedReason ?? null,
                  requestedDetail: null,
                }, sheet.spreadsheetId).catch((err) => console.error("[BulkApprove] Timesheet update failed:", err));
              }
              if (record.applicantUserId) {
                const startStr = new Date(record.requestedStartAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
                const endStr = new Date(record.requestedEndAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
                createOvertimeNotification({
                  targetUserId: record.applicantUserId,
                  type: "overtime_approved",
                  title: "残業申請が承認されました",
                  body: `${record.applicationDate} ${startStr}～${endStr}\n承認者：${ctx.user.name ?? "不明"}`,
                  resourceId: id,
                }).catch((e) => console.error("[BulkApprove] notify failed:", e));
              }
            }).catch((err) => console.error("[BulkApprove] getById failed:", err));
            results.push({ id, success: true });
          } catch (err) {
            console.error(`[BulkApprove] id=${id} failed:`, err);
            results.push({ id, success: false });
          }
        }
        const { broadcastEvent } = await import("./_core/sse");
        broadcastEvent("overtimeApprovals", { bulkApproved: true });
        return { success: true, results };
      }),
    /** 自分の残業申請を年月で絞り込んで取得する（月次確認用） */
    getMineByMonth: protectedProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const { getOvertimeApprovalsByUser } = await import("./db");
        const all = await getOvertimeApprovalsByUser(ctx.user.id);
        // applicationDate は "YYYY-MM-DD" 形式
        const prefix = `${input.year}-${String(input.month).padStart(2, '0')}`;
        return all.filter(r => r.applicationDate.startsWith(prefix));
      }),
    /** 自分の承認済み残業時間サマリーを取得する（当日・今月） */
    getMyApprovedSummary: protectedProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int(), dateStr: z.string() }))
      .query(async ({ ctx, input }) => {
        const { getOvertimeApprovalsByUser } = await import("./db");
        const all = await getOvertimeApprovalsByUser(ctx.user.id);
        const approved = all.filter(r => r.status === 'approved');
        // 当日の承認済み残業
        const todayApproved = approved.filter(r => r.applicationDate === input.dateStr);
        // 今月の承認済み残業
        const prefix = `${input.year}-${String(input.month).padStart(2, '0')}`;
        const monthApproved = approved.filter(r => r.applicationDate.startsWith(prefix));
        // 残業時間計算（adjustedStartAt/adjustedEndAt があれば優先、なければ requestedStartAt/requestedEndAt）
        const calcMinutes = (r: typeof approved[0]) => {
          const start = r.adjustedStartAt ?? r.requestedStartAt;
          const end = r.adjustedEndAt ?? r.requestedEndAt;
          return Math.max(0, Math.round((end - start) / 60000));
        };
        const toHHMM = (ms: number) =>
          new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
        // 当日サマリー
        const todayMinutes = todayApproved.reduce((sum, r) => sum + calcMinutes(r), 0);
        const todayDetail = todayApproved.map(r => {
          const start = r.adjustedStartAt ?? r.requestedStartAt;
          const end = r.adjustedEndAt ?? r.requestedEndAt;
          return { startStr: toHHMM(start), endStr: toHHMM(end), minutes: calcMinutes(r) };
        });
        // 今月サマリー
        const monthTotalMinutes = monthApproved.reduce((sum, r) => sum + calcMinutes(r), 0);
        return {
          todayMinutes,
          todayDetail,
          monthTotalMinutes,
          monthApprovedCount: monthApproved.length,
        };
      }),
  }),

  // ============================================================
  // 月次勤怠確認署名
  // ============================================================
  monthlySignature: router({
    /** 自分の月次署名一覧を取得する */
    list: protectedProcedure
      .query(async ({ ctx }) => {
        const { getMonthlySignaturesByUser } = await import("./db");
        return await getMonthlySignaturesByUser(ctx.user.id);
      }),
    /** 特定年月の署名を取得する */
    get: protectedProcedure
      .input(z.object({ targetYear: z.number().int(), targetMonth: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const { getMonthlySignature } = await import("./db");
        return await getMonthlySignature(ctx.user.id, input.targetYear, input.targetMonth);
      }),
    /** 月次署名を作成または更新する */
    sign: protectedProcedure
      .input(z.object({
        targetYear: z.number().int(),
        targetMonth: z.number().int(),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 当月以降は署名不可（月が変わってから前月分のみ署名できる仕様）
        const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const currentYear = nowJST.getUTCFullYear();
        const currentMonth = nowJST.getUTCMonth() + 1;
        const isCurrentOrFuture = input.targetYear > currentYear ||
          (input.targetYear === currentYear && input.targetMonth >= currentMonth);
        if (isCurrentOrFuture) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${input.targetYear}年${input.targetMonth}月分の署名は翌月以降に行うことができます`,
          });
        }
        const { upsertMonthlySignature, getTimesheetSpreadsheets } = await import("./db");
        const signedAt = Date.now();
        const result = await upsertMonthlySignature({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "不明",
          targetYear: input.targetYear,
          targetMonth: input.targetMonth,
          signedAt,
          comment: input.comment,
        });
        // スプレッドシートへの署名転記（非同期・エラーは握りつぶす）
        try {
          const timesheets = await getTimesheetSpreadsheets(input.targetYear, input.targetMonth);
          if (timesheets && timesheets.length > 0) {
            const spreadsheetId = timesheets[0].spreadsheetId;
            await appendSignatureToTimesheetSheet({
              userName: ctx.user.name ?? "不明",
              targetYear: input.targetYear,
              targetMonth: input.targetMonth,
              signedAt,
              comment: input.comment,
            }, spreadsheetId);
          } else {
            console.warn(`[Signature] No timesheet spreadsheet found for ${input.targetYear}/${input.targetMonth}`);
          }
        } catch (sheetErr) {
          console.error("[Signature] Spreadsheet append failed (non-fatal):", sheetErr);
        }
        return result;
      }),
    /** 管理者：未署名スタッフを含む月次署名一覧を取得する */
    adminListWithUnsigned: protectedProcedure
      .input(z.object({
        targetYear: z.number().int().optional(),
        targetMonth: z.number().int().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getAllMonthlySignatures, getAllStaff } = await import("./db");
        const now = new Date();
        const year = input?.targetYear ?? now.getFullYear();
        const month = input?.targetMonth ?? (now.getMonth() + 1);
        const [signatures, allStaff] = await Promise.all([
          getAllMonthlySignatures(year, month),
          getAllStaff(),
        ]);
        const signedUserIds = new Set(signatures.map((s: any) => s.userId));
        const unsignedStaff = allStaff
          .filter((s: any) => !signedUserIds.has(s.id))
          .map((s: any) => ({ id: s.id, name: s.name, team: s.team }));
        return { signatures, unsignedStaff, year, month };
      }),

    /** 管理者：全職員の月次署名一覧を取得する */
    adminList: protectedProcedure
      .input(z.object({
        targetYear: z.number().int().optional(),
        targetMonth: z.number().int().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getAllMonthlySignatures } = await import("./db");
        return await getAllMonthlySignatures(input?.targetYear, input?.targetMonth);
      }),
    /** 管理者：月次署名を確認済みにする */
    adminConfirm: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { adminConfirmMonthlySignature } = await import("./db");
        await adminConfirmMonthlySignature(input.id, ctx.user.name ?? "不明");
        return { success: true };
      }),
  }),
  improvement: router({
    /** 業務改善提案を投稿する */
    submit: protectedProcedure
      .input(z.object({
        category: z.enum(["業務効率化", "コミュニケーション", "環境・設備", "ケアの質向上", "その他"]),
        content: z.string().min(1).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createImprovementSuggestion, getImprovementSpreadsheet, markImprovementSuggestionSynced } = await import("./db");
        const displayName = ctx.user.name ?? "不明";
        const result = await createImprovementSuggestion({
          createdBy: ctx.user.id,
          createdByName: displayName,
          category: input.category,
          content: input.content,
          isAnonymous: 0,
        });
        const insertId = (result as any).insertId as number;

        // スプレッドシート転記
        try {
          const sheet = await getImprovementSpreadsheet();
          if (sheet?.spreadsheetId) {
            const writeAuth = new google.auth.GoogleAuth({
              credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
              },
              scopes: ["https://www.googleapis.com/auth/spreadsheets"],
            });
            const writeClient = await writeAuth.getClient();
            const token = await writeClient.getAccessToken();
            if (token.token) {
              const sheetName = encodeURIComponent("シート1");
              const spreadsheetId = sheet.spreadsheetId;
              const HEADERS = ["投稿日時", "投稿者", "カテゴリ", "内容", "対応状況"];

              // 1行目を取得してヘッダーが未設定なら追加
              const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:E1`;
              const getRes = await fetch(getUrl, {
                headers: { Authorization: `Bearer ${token.token}` },
              });
              const getJson = await getRes.json() as { values?: string[][] };
              const firstRow = getJson.values?.[0] ?? [];
              if (firstRow.length === 0 || firstRow[0] !== HEADERS[0]) {
                // ヘッダー行を1行目に書き込む
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:E1?valueInputOption=USER_ENTERED`;
                await fetch(updateUrl, {
                  method: "PUT",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ values: [HEADERS] }),
                });
              }

              // データを追記
              const now = new Date();
              const dateStr = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
              const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:E:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
              await fetch(appendUrl, {
                method: "POST",
                headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ values: [[dateStr, displayName, input.category, input.content, ""]] }),
              });
              await markImprovementSuggestionSynced(insertId);
            }
          }
        } catch (e) {
          console.error("[Improvement] Sheet sync failed:", e);
        }

        return { success: true, id: insertId };
      }),

    /** 提案一覧を取得する */
    list: protectedProcedure.query(async () => {
      const { getImprovementSuggestions } = await import("./db");
      return await getImprovementSuggestions(200);
    }),

    /** 管理者：提案に返信する */
    reply: protectedProcedure
      .input(z.object({ id: z.number().int(), reply: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { replyToImprovementSuggestion } = await import("./db");
        await replyToImprovementSuggestion(input.id, input.reply, ctx.user.name ?? "管理者");
        return { success: true };
      }),

    /** 管理者：スプレッドシート設定を取得する */
    getSpreadsheet: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const { getImprovementSpreadsheet } = await import("./db");
      return await getImprovementSpreadsheet();
    }),

    /** 管理者：スプレッドシート設定を保存する */
    setSpreadsheet: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string().min(1),
        spreadsheetUrl: z.string().url(),
        label: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { upsertImprovementSpreadsheet } = await import("./db");
        await upsertImprovementSpreadsheet(input);
        return { success: true };
      }),
  }),

  /** 個人タスク管理 */
  personalTasks: router({
    /** 自分のタスク一覧を取得（期日順） */
    getMyTasks: protectedProcedure
      .input(z.object({
        showDone: z.boolean().optional().default(false),
      }))
      .query(async ({ ctx, input }) => {
        const { getMyPersonalTasks } = await import("./db");
        return await getMyPersonalTasks(ctx.user.id, ctx.user.team ?? null, input.showDone);
      }),

    /** 今日の個人タスク（ホーム画面用） */
    getTodayTasks: protectedProcedure.query(async ({ ctx }) => {
      const { getTodayPersonalTasks } = await import("./db");
      return await getTodayPersonalTasks(ctx.user.id, ctx.user.team ?? null);
    }),

    /** タスクを作成する */
    create: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        taskKind: z.enum(["at_time", "by_deadline"]).default("by_deadline"),
        dueDate: z.date().optional(),
        assignType: z.enum(["self", "personal", "team", "all"]).default("self"),
        assignTeam: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional(),
        assignUserId: z.number().optional(),
        assignUserName: z.string().optional(),
        assignTeams: z.string().optional(),
        assignUserIds: z.string().optional(),
        assignUserNames: z.string().optional(),
        repeatType: z.enum(["none", "daily", "weekly", "biweekly", "monthly", "nth_weekday"]).default("none"),
        repeatDayOfWeek: z.number().min(0).max(6).optional(),
        repeatDayOfMonth: z.number().min(1).max(31).optional(),
        repeatMonthInterval: z.number().min(1).max(12).optional(),
        repeatNthWeek: z.number().optional(),
        repeatNthDayOfWeek: z.number().min(0).max(6).optional(),
        repeatEndDate: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createPersonalTask } = await import("./db");
        const result = await createPersonalTask({
          ...input,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        // SSEブロードキャスト
        try {
          const { broadcastEvent } = await import("./_core/sse");
          broadcastEvent("personalTasks");
        } catch {}
        return result;
      }),

    /** タスクを完了/未完了にする */
    toggleDone: protectedProcedure
      .input(z.object({
        id: z.number(),
        done: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { togglePersonalTaskDone } = await import("./db");
        const result = await togglePersonalTaskDone(input.id, input.done, ctx.user.id);
        try { const { broadcastEvent } = await import("./_core/sse"); broadcastEvent("personalTasks"); } catch {}
        return result;
      }),

    /** タスクを更新する */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        text: z.string().min(1).optional(),
        taskKind: z.enum(["at_time", "by_deadline"]).optional(),
        dueDate: z.date().nullable().optional(),
        assignType: z.enum(["self", "personal", "team", "all"]).optional(),
        assignTeam: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).nullable().optional(),
        assignUserId: z.number().nullable().optional(),
        assignUserName: z.string().nullable().optional(),
        assignTeams: z.string().nullable().optional(),
        assignUserIds: z.string().nullable().optional(),
        assignUserNames: z.string().nullable().optional(),
        repeatType: z.enum(["none", "daily", "weekly", "biweekly", "monthly", "nth_weekday"]).optional(),
        repeatDayOfWeek: z.number().nullable().optional(),
        repeatDayOfMonth: z.number().nullable().optional(),
        repeatMonthInterval: z.number().nullable().optional(),
        repeatNthWeek: z.number().nullable().optional(),
        repeatNthDayOfWeek: z.number().nullable().optional(),
        repeatEndDate: z.date().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updatePersonalTask } = await import("./db");
        const result = await updatePersonalTask(input.id, input, ctx.user.id);
        try { const { broadcastEvent } = await import("./_core/sse"); broadcastEvent("personalTasks"); } catch {}
        return result;
      }),

    /** タスクを削除する（ソフトデリート） */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deletePersonalTask } = await import("./db");
        const result = await deletePersonalTask(input.id, ctx.user.id);
        try { const { broadcastEvent } = await import("./_core/sse"); broadcastEvent("personalTasks"); } catch {}
        return result;
      }),
  }),

  // ========== イレギュラー予定管理 ==========
  irregularSchedules: router({
    /** 一覧取得（削除済み除く） */
    list: protectedProcedure
      .input(z.object({
        team: z.string().optional(),
        scheduleType: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const { listIrregularSchedules } = await import("./db");
        return listIrregularSchedules(input ?? {});
      }),
    /** 新規作成 + スプレッドシート同期 */
    create: protectedProcedure
      .input(z.object({
        patientName: z.string().min(1),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        scheduleType: z.enum(["受診", "ショートステイ", "特別指示書", "入院", "退院", "新規契約・面談", "訪問診療同席"]),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        facilityName: z.string().nullable().optional(),
        actionRequired: z.string().nullable().optional(),
        postDischargeEndDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createIrregularSchedule } = await import("./db");
        const record = await createIrregularSchedule({
          ...input,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        try {
          const { syncIrregularScheduleToSheet } = await import("./irregularScheduleSync");
          await syncIrregularScheduleToSheet(record.id);
        } catch (e) {
          console.error("[irregularSchedules] sheet sync error:", e);
        }
        try { const { broadcastEvent } = await import("./_core/sse"); broadcastEvent("irregularSchedules"); } catch {}
        return record;
      }),
    /** 更新 + スプレッドシート同期 */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        patientName: z.string().min(1).optional(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional(),
        scheduleType: z.enum(["受診", "ショートステイ", "特別指示書", "入院", "退院", "新規契約・面談", "訪問診療同席"]).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        facilityName: z.string().nullable().optional(),
        actionRequired: z.string().nullable().optional(),
        postDischargeEndDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateIrregularSchedule } = await import("./db");
        const record = await updateIrregularSchedule(input.id, input, ctx.user.id);
        try {
          const { syncIrregularScheduleToSheet } = await import("./irregularScheduleSync");
          await syncIrregularScheduleToSheet(input.id);
        } catch (e) {
          console.error("[irregularSchedules] sheet sync error:", e);
        }
        try { const { broadcastEvent } = await import("./_core/sse"); broadcastEvent("irregularSchedules"); } catch {}
        return record;
      }),
    /** 削除（ソフトデリート） */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteIrregularSchedule } = await import("./db");
        await deleteIrregularSchedule(input.id, ctx.user.id);
        try { const { broadcastEvent } = await import("./_core/sse"); broadcastEvent("irregularSchedules"); } catch {}
        return { ok: true };
      }),
    /** スプレッドシートから全件再同期（管理者用） */
    syncFromSheet: protectedProcedure
      .mutation(async () => {
        const { syncAllFromSheet } = await import("./irregularScheduleSync");
        return syncAllFromSheet();
      }),
  }),

  // ========== 訪問予定スロット順番保存 ==========
  visitSlots: router({
    /** 訪問予定スロットの順番をDB に保存する */
    save: protectedProcedure
      .input(z.object({
        dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slotsJson: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { upsertVisitSlotOrder } = await import("./db");
        await upsertVisitSlotOrder(ctx.user.id, input.dateKey, input.slotsJson);
        return { ok: true };
      }),
    /** 訪問予定スロットの順番をDBから取得する */
    load: protectedProcedure
      .input(z.object({
        dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(async ({ ctx, input }) => {
        const { getVisitSlotOrder } = await import("./db");
        const slotsJson = await getVisitSlotOrder(ctx.user.id, input.dateKey);
        return { slotsJson };
      }),
  }),
  // ========== スケジュールメモ ==========
  scheduleNotes: router({
    /** 複数スクリーンショットIDのメモを一括取得する */
    getByIds: protectedProcedure
      .input(z.object({ screenshotIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        if (input.screenshotIds.length === 0) return [];
        return getScheduleNotesByIds(input.screenshotIds);
      }),
    /** 単一スクリーンショットのメモを取得する */
    get: protectedProcedure
      .input(z.object({ screenshotId: z.number() }))
      .query(async ({ input }) => {
        return getScheduleNote(input.screenshotId);
      }),
    /** メモを作成または更新する（全職員が編集可能） */
    upsert: protectedProcedure
      .input(z.object({
        screenshotId: z.number(),
        content: z.string().max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertScheduleNote({
          screenshotId: input.screenshotId,
          content: input.content,
          updatedBy: ctx.user.id,
          updatedByName: ctx.user.name ?? "不明",
        });
        // 全職員にリアルタイム同期
        try { broadcastEvent("scheduleNotes"); } catch {}
        return { ok: true };
      }),
    /** メモを削除する */
    delete: protectedProcedure
      .input(z.object({ screenshotId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteScheduleNote(input.screenshotId);
        try { broadcastEvent("scheduleNotes"); } catch {}
        return { ok: true };
      }),
  }),
  carePlanDisclosures: router({
    /** 本日この利用者への看護計画開示が転記済みかチェック */
    checkToday: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        if (!input.patientId) return { synced: false, disclosedAt: null };
        const { carePlanDisclosures } = await import("../drizzle/schema");
        const { and, eq: eqDr } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { synced: false, disclosedAt: null };
        const today = new Date().toLocaleDateString("ja-JP", {
          timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
        }).replace(/\//g, "-");
        const rows = await db.select()
          .from(carePlanDisclosures)
          .where(and(
            eqDr(carePlanDisclosures.patientId, input.patientId),
            eqDr(carePlanDisclosures.disclosedDate, today),
          ))
          .limit(1);
        if (rows.length === 0) return { synced: false, disclosedAt: null };
        return { synced: true, disclosedAt: rows[0].disclosedAt };
      }),
    /** 看護計画開示の記録 + Sheets転記 */
    sync: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        patientName: z.string().min(1),
        team: z.string().optional(),
        slotIndex: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { carePlanDisclosures, carePlanSpreadsheets } = await import("../drizzle/schema");
        const { and, eq: eqDr } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "データベース接続エラー" });
        }

        // 本日の日付（JST）
        const now = new Date();
        const jstNow = new Date(now.getTime());
        const today = jstNow.toLocaleDateString("ja-JP", {
          timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
        }).replace(/\//g, "-");
        const year = parseInt(today.split("-")[0]!, 10);

        // 重複チェック（同一利用者・同一日で1件まで）
        const existing = await db.select()
          .from(carePlanDisclosures)
          .where(and(
            eqDr(carePlanDisclosures.patientId, input.patientId),
            eqDr(carePlanDisclosures.disclosedDate, today),
          ))
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "本日この利用者への看護計画開示は既に転記済みです" });
        }

        // 開示時刻
        const disclosedAt = now.getTime();
        const disclosedTimeStr = now.toLocaleTimeString("ja-JP", {
          timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit"
        });

        // ===== Google Sheetsへ転記 =====
        let spreadsheetId: string | null = null;
        let sheetTabName: string | null = null;
        try {
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

          // 年度のスプレッドシート取得 or 新規作成
          const ssRows = await db.select()
            .from(carePlanSpreadsheets)
            .where(eqDr(carePlanSpreadsheets.year, year))
            .limit(1);
          if (ssRows.length > 0) {
            spreadsheetId = ssRows[0].spreadsheetId;
          } else {
            // 新規スプレッドシート作成
            const title = `看護計画開示記録_${year}年度`;
            const CARE_PLAN_FOLDER_ID = "1M1po6_l4AAqqygD9xoQU8jQPF9XXX7_4"; // アルコールチェックと同じフォルダ
            const createRes = await drive.files.create({
              requestBody: {
                name: title,
                mimeType: "application/vnd.google-apps.spreadsheet",
                parents: [CARE_PLAN_FOLDER_ID],
              },
              fields: "id",
              supportsAllDrives: true,
            });
            spreadsheetId = createRes.data.id!;
            console.log(`[CarePlanSheet] Created spreadsheet: ${spreadsheetId}`);

            // フォルダへ明示移動（保険）
            try {
              const fileInfo = await drive.files.get({
                fileId: spreadsheetId,
                fields: "parents",
                supportsAllDrives: true,
              });
              const currentParents = (fileInfo.data.parents ?? []).join(",");
              await drive.files.update({
                fileId: spreadsheetId,
                addParents: CARE_PLAN_FOLDER_ID,
                removeParents: currentParents,
                supportsAllDrives: true,
                fields: "id, parents",
              });
            } catch (moveErr) {
              console.warn(`[CarePlanSheet] Folder move failed (continuing):`, moveErr);
            }

            // デフォルトシート名を「概要」にリネーム
            // デフォルトシートを1つ目のチーム「身体」にリネーム
            const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
            const defaultSheetId = spreadsheetInfo.data.sheets?.[0]?.properties?.sheetId;
            const defaultSheetName = spreadsheetInfo.data.sheets?.[0]?.properties?.title ?? "Sheet1";
            if (defaultSheetName !== "身体" && defaultSheetId !== undefined) {
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                  requests: [{
                    updateSheetProperties: {
                      properties: { sheetId: defaultSheetId, title: "身体" },
                      fields: "title",
                    },
                  }],
                },
              });
            }

            // 残り3チームのタブを追加（天理、郡山北部、郡山南部）
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: {
                requests: [
                  { addSheet: { properties: { title: "天理" } } },
                  { addSheet: { properties: { title: "郡山北部" } } },
                  { addSheet: { properties: { title: "郡山南部" } } },
                ],
              },
            });

            // 4チーム全タブにヘッダー行を追加
            const HEADERS = ["開示日", "開示時刻", "利用者名", "チーム", "開示者名"];
            const TEAM_TABS = ["身体", "天理", "郡山北部", "郡山南部"];
            for (const tab of TEAM_TABS) {
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${tab}!A1:E1`,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [HEADERS] },
              });
            }

            // 共有設定（既存のsheet_share_emailsと特級管理者）
            try {
              const shareEmailsValue = await getSetting("sheet_share_emails", "");
              const shareEmails = shareEmailsValue ? shareEmailsValue.split(",").map((e: string) => e.trim()).filter(Boolean) : [];
              const { getSuperAdminUsers } = await import("./db");
              const superAdmins = await getSuperAdminUsers();
              const superAdminEmails = superAdmins.map((u) => u.email).filter((e): e is string => !!e);
              const allShareEmails = [...new Set([...shareEmails, ...superAdminEmails])];
              for (const email of allShareEmails) {
                await drive.permissions.create({
                  fileId: spreadsheetId,
                  requestBody: { type: "user", role: "writer", emailAddress: email },
                  sendNotificationEmail: false,
                }).catch((e: unknown) => console.warn(`[CarePlanSheet] Share to ${email} failed:`, e));
              }
              if (allShareEmails.length > 0) {
                console.log(`[CarePlanSheet] Shared with: ${allShareEmails.join(", ")}`);
              }
            } catch (shareErr) {
              console.warn(`[CarePlanSheet] Share step failed (continuing):`, shareErr);
            }

            // DBに登録
            await db.insert(carePlanSpreadsheets).values({
              year,
              spreadsheetId,
              label: title,
            });
          }

          // チームに応じたタブに行追加
          const VALID_TEAMS = ["身体", "天理", "郡山北部", "郡山南部"];
          sheetTabName = VALID_TEAMS.includes(input.team ?? "") ? input.team! : "身体";
          const newRow = [
            today,
            disclosedTimeStr,
            input.patientName,
            input.team ?? "",
            ctx.user.name ?? "不明",
          ];
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetTabName}!A:E`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [newRow] },
          });
          console.log(`[CarePlanSheet] Appended row to "${sheetTabName}" for patient ${input.patientId} (${input.patientName})`);
        } catch (sheetErr) {
          console.error("[CarePlanSheet] Sheets sync failed:", sheetErr);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `スプレッドシート転記に失敗しました: ${sheetErr instanceof Error ? sheetErr.message : String(sheetErr)}`,
          });
        }

        // ===== DBに記録 =====
        try {
          await db.insert(carePlanDisclosures).values({
            patientId: input.patientId,
            patientName: input.patientName,
            team: input.team ?? null,
            disclosedDate: today,
            disclosedAt,
            disclosedByUserId: ctx.user.id,
            disclosedByName: ctx.user.name ?? "不明",
            slotIndex: input.slotIndex ?? null,
            spreadsheetId,
            sheetTabName,
          });
        } catch (dbErr: unknown) {
          // ユニーク制約違反の場合（並行して別タブで先に転記された等）
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
          if (msg.toLowerCase().includes("duplicate")) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "本日この利用者への看護計画開示は既に転記済みです",
            });
          }
          throw dbErr;
        }

        return { success: true, disclosedAt, spreadsheetId };
      }),
  }),
});
export type AppRouter = typeof appRouter;

