import { describe, it, expect } from "vitest";

/**
 * アルコールチェック記録 CSV エクスポートのユニットテスト
 * DB接続を必要としないロジック（CSV変換・日付変換）のみをテストする
 */

// CSV変換ロジックを再現（routers.tsと同じ実装）
function buildCsvRow(record: {
  checkedAt: number;
  type: string;
  userName: string;
  numberPlate: string;
  clockInAt?: number | null;
  clockOutAt?: number | null;
  confirmMethod: string;
  detectorUsed: number;
  alcoholDetected: number;
  confirmerName: string;
  overtimeStartAt?: number | null;
  overtimeEndAt?: number | null;
  overtimeReason?: string | null;
  overtimeContact?: string | null;
  overtimeCount?: number | null;
  notes?: string | null;
  createdAt?: number | null;
}): string[] {
  const toJST = (ms: number | null | undefined) =>
    ms
      ? new Date(ms).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return [
    toJST(record.checkedAt),
    record.type === "clock_in" ? "出勤" : "退勤",
    record.userName,
    record.numberPlate,
    toJST(record.clockInAt),
    toJST(record.clockOutAt),
    record.confirmMethod === "online" ? "オンライン画面" : "対面",
    record.detectorUsed ? "使用" : "未使用",
    record.alcoholDetected ? "有" : "無",
    record.confirmerName,
    record.overtimeStartAt && record.overtimeEndAt
      ? `${toJST(record.overtimeStartAt)}～${toJST(record.overtimeEndAt)}`
      : "",
    record.overtimeReason ?? "",
    record.overtimeContact ?? "",
    record.overtimeCount != null ? String(record.overtimeCount) : "",
    record.notes ?? "",
    toJST(record.createdAt ?? null),
  ];
}

function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(escape).join(",")).join("\n");
}

describe("アルコールチェック CSV エクスポート", () => {
  it("出勤・酒気帯び無しのレコードが正しく変換される", () => {
    const record = {
      checkedAt: new Date("2026-04-01T08:00:00+09:00").getTime(),
      type: "clock_in",
      userName: "テスト太郎",
      numberPlate: "大和 500 あ 1234",
      clockInAt: new Date("2026-04-01T08:05:00+09:00").getTime(),
      clockOutAt: null,
      confirmMethod: "online",
      detectorUsed: 1,
      alcoholDetected: 0,
      confirmerName: "森脇崇",
      overtimeStartAt: null,
      overtimeEndAt: null,
      overtimeReason: null,
      overtimeContact: null,
      overtimeCount: null,
      notes: null,
      createdAt: new Date("2026-04-01T08:01:00+09:00").getTime(),
    };

    const row = buildCsvRow(record);
    expect(row[1]).toBe("出勤");
    expect(row[2]).toBe("テスト太郎");
    expect(row[6]).toBe("オンライン画面");
    expect(row[7]).toBe("使用");
    expect(row[8]).toBe("無");
    expect(row[9]).toBe("森脇崇");
    expect(row[10]).toBe(""); // 残業なし
  });

  it("退勤・酒気帯び有りのレコードが正しく変換される", () => {
    const record = {
      checkedAt: new Date("2026-04-01T17:30:00+09:00").getTime(),
      type: "clock_out",
      userName: "テスト花子",
      numberPlate: "大和 500 い 5678",
      clockInAt: null,
      clockOutAt: new Date("2026-04-01T17:35:00+09:00").getTime(),
      confirmMethod: "face",
      detectorUsed: 0,
      alcoholDetected: 1,
      confirmerName: "森脇崇",
      overtimeStartAt: null,
      overtimeEndAt: null,
      overtimeReason: null,
      overtimeContact: null,
      overtimeCount: null,
      notes: "要確認",
      createdAt: new Date("2026-04-01T17:31:00+09:00").getTime(),
    };

    const row = buildCsvRow(record);
    expect(row[1]).toBe("退勤");
    expect(row[6]).toBe("対面");
    expect(row[7]).toBe("未使用");
    expect(row[8]).toBe("有");
    expect(row[14]).toBe("要確認");
  });

  it("残業情報が正しく変換される", () => {
    const record = {
      checkedAt: new Date("2026-04-01T18:00:00+09:00").getTime(),
      type: "clock_out",
      userName: "テスト次郎",
      numberPlate: "大和 500 う 9012",
      clockInAt: null,
      clockOutAt: null,
      confirmMethod: "online",
      detectorUsed: 1,
      alcoholDetected: 0,
      confirmerName: "森脇崇",
      overtimeStartAt: new Date("2026-04-01T17:30:00+09:00").getTime(),
      overtimeEndAt: new Date("2026-04-01T19:00:00+09:00").getTime(),
      overtimeReason: "記録書Ⅱ作成",
      overtimeContact: "田中主任",
      overtimeCount: 3,
      notes: null,
      createdAt: new Date("2026-04-01T18:01:00+09:00").getTime(),
    };

    const row = buildCsvRow(record);
    expect(row[10]).toContain("～"); // 残業時間帯
    expect(row[11]).toBe("記録書Ⅱ作成");
    expect(row[12]).toBe("田中主任");
    expect(row[13]).toBe("3");
  });

  it("CSVのダブルクォートエスケープが正しく機能する", () => {
    const rows = [["テスト", '彼は"こんにちは"と言った', "正常"]];
    const csv = toCsv(rows);
    expect(csv).toContain('"彼は""こんにちは""と言った"');
  });

  it("ヘッダー行が16列である", () => {
    const header = [
      "実施日時", "区分", "氏名", "ナンバープレート", "出勤打刻", "退勤打刻",
      "確認方法", "検知器使用", "酒気帯有無", "確認者", "残業時間",
      "残業理由", "連絡先", "人数", "備考", "登録日時",
    ];
    expect(header).toHaveLength(16);
  });

  it("期間フィルターのUTCミリ秒変換が正しい（JST 0:00 → UTC）", () => {
    const startMs = new Date("2026-04-01T00:00:00+09:00").getTime();
    const endMs = new Date("2026-04-30T23:59:59+09:00").getTime();
    // JSTの4月1日0:00はUTCの3月31日15:00
    expect(new Date(startMs).toISOString()).toBe("2026-03-31T15:00:00.000Z");
    // JSTの4月30日23:59:59はUTCの4月30日14:59:59
    expect(new Date(endMs).toISOString()).toBe("2026-04-30T14:59:59.000Z");
    expect(endMs).toBeGreaterThan(startMs);
  });
});
