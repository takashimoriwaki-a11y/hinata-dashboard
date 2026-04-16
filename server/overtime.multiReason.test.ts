/**
 * 残業理由複数選択ロジックのユニットテスト
 * buildOvertimeReason 相当のロジックを純粋関数として検証する
 */
import { describe, it, expect } from "vitest";

// AttendanceCheckModal.tsx の buildOvertimeReason ロジックを純粋関数として抽出
function buildOvertimeReason(
  overtimeReasonTypes: string[],
  overtimeContactTarget: string,
  overtimeRecordCount: number,
  overtimeFreeText: string
): string {
  if (overtimeReasonTypes.length === 0) return "";
  const parts = overtimeReasonTypes.map((reason) => {
    switch (reason) {
      case "訪問看護実施": return "訪問看護実施";
      case "支援者連絡": return overtimeContactTarget ? `支援者連絡（${overtimeContactTarget}）` : "支援者連絡";
      case "家族連絡": return overtimeContactTarget ? `家族連絡（${overtimeContactTarget}）` : "家族連絡";
      case "記録書Ⅱ作成": return `記録書Ⅱ作成（${overtimeRecordCount}人分）`;
      case "月次報告書作成": return `月次報告書作成（${overtimeRecordCount}人分）`;
      case "状態報告書作成": return `状態報告書作成（${overtimeRecordCount}人分）`;
      case "その他": return overtimeFreeText || "その他";
      default: return reason;
    }
  });
  return parts.join("、");
}

describe("残業理由複数選択ロジック", () => {
  it("理由が0件の場合は空文字を返す", () => {
    expect(buildOvertimeReason([], "", 1, "")).toBe("");
  });

  it("単一理由（訪問看護実施）を正しく返す", () => {
    expect(buildOvertimeReason(["訪問看護実施"], "", 1, "")).toBe("訪問看護実施");
  });

  it("複数理由を「、」区切りで結合する", () => {
    const result = buildOvertimeReason(["訪問看護実施", "記録書Ⅱ作成"], "", 2, "");
    expect(result).toBe("訪問看護実施、記録書Ⅱ作成（2人分）");
  });

  it("支援者連絡に連絡先が付与される", () => {
    const result = buildOvertimeReason(["支援者連絡"], "山田さん", 1, "");
    expect(result).toBe("支援者連絡（山田さん）");
  });

  it("家族連絡に連絡先が付与される", () => {
    const result = buildOvertimeReason(["家族連絡"], "鈴木さん", 1, "");
    expect(result).toBe("家族連絡（鈴木さん）");
  });

  it("支援者連絡と家族連絡を同時選択した場合、同じ連絡先が両方に付与される", () => {
    const result = buildOvertimeReason(["支援者連絡", "家族連絡"], "田中さん", 1, "");
    expect(result).toBe("支援者連絡（田中さん）、家族連絡（田中さん）");
  });

  it("記録書Ⅱ作成に人数が付与される", () => {
    const result = buildOvertimeReason(["記録書Ⅱ作成"], "", 3, "");
    expect(result).toBe("記録書Ⅱ作成（3人分）");
  });

  it("月次報告書作成に人数が付与される", () => {
    const result = buildOvertimeReason(["月次報告書作成"], "", 5, "");
    expect(result).toBe("月次報告書作成（5人分）");
  });

  it("状態報告書作成に人数が付与される", () => {
    const result = buildOvertimeReason(["状態報告書作成"], "", 4, "");
    expect(result).toBe("状態報告書作成（4人分）");
  });

  it("その他に自由記述が付与される", () => {
    const result = buildOvertimeReason(["その他"], "", 1, "カンファレンス参加");
    expect(result).toBe("カンファレンス参加");
  });

  it("その他で自由記述が空の場合は「その他」を返す", () => {
    const result = buildOvertimeReason(["その他"], "", 1, "");
    expect(result).toBe("その他");
  });

  it("3つの理由を複合選択できる", () => {
    const result = buildOvertimeReason(
      ["訪問看護実施", "記録書Ⅱ作成", "その他"],
      "",
      2,
      "追加対応"
    );
    expect(result).toBe("訪問看護実施、記録書Ⅱ作成（2人分）、追加対応");
  });

  it("localStorageの「、」区切り保存値を復元できる", () => {
    // savedState.overtimeReasonType = "訪問看護実施、記録書Ⅱ作成" として保存された値を復元
    const savedValue = "訪問看護実施、記録書Ⅱ作成";
    const restored = savedValue.split("、");
    expect(restored).toEqual(["訪問看護実施", "記録書Ⅱ作成"]);
    const result = buildOvertimeReason(restored, "", 2, "");
    expect(result).toBe("訪問看護実施、記録書Ⅱ作成（2人分）");
  });
});
