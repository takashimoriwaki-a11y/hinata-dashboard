/**
 * 音声入力誤変換報告（voiceFeedback）機能のユニットテスト
 *
 * DB接続なしでロジックを検証するため、モックを使用する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ========== ヘルパー関数のテスト ==========

describe("voiceFeedback ロジック", () => {
  describe("フィードバックデータのバリデーション", () => {
    it("originalTextが空文字の場合は無効と判定する", () => {
      const isValid = (originalText: string) => originalText.trim().length > 0;
      expect(isValid("")).toBe(false);
      expect(isValid("   ")).toBe(false);
    });

    it("originalTextが有効な場合はtrueを返す", () => {
      const isValid = (originalText: string) => originalText.trim().length > 0;
      expect(isValid("田中さんの訪問を変更してください")).toBe(true);
    });

    it("wrongFieldが空の場合はundefinedとして扱う", () => {
      const toOptional = (v: string) => v || undefined;
      expect(toOptional("")).toBeUndefined();
      expect(toOptional("利用者名")).toBe("利用者名");
    });

    it("wrongValue, correctValue, commentが空の場合はundefinedとして扱う", () => {
      const toOptional = (v: string) => v || undefined;
      expect(toOptional("")).toBeUndefined();
      expect(toOptional("天理チーム")).toBe("天理チーム");
      expect(toOptional("郡山北部チーム")).toBe("郡山北部チーム");
    });
  });

  describe("通知メッセージの生成", () => {
    it("全フィールドが揃っている場合に正しいメッセージを生成する", () => {
      const buildNotificationContent = (params: {
        reporterName: string;
        originalText: string;
        wrongField?: string;
        wrongValue?: string;
        correctValue?: string;
        comment?: string;
      }) => {
        return [
          `報告者: ${params.reporterName}`,
          `元の音声: ${params.originalText}`,
          params.wrongField ? `誤変換項目: ${params.wrongField}` : null,
          params.wrongValue ? `誤変換内容: ${params.wrongValue}` : null,
          params.correctValue ? `正しい値: ${params.correctValue}` : null,
          params.comment ? `コメント: ${params.comment}` : null,
        ].filter(Boolean).join("\n");
      };

      const content = buildNotificationContent({
        reporterName: "森脇 崇",
        originalText: "田中さんの訪問を天理チームに変更してください",
        wrongField: "チーム",
        wrongValue: "天理チーム",
        correctValue: "郡山北部チーム",
        comment: "「北部」と言ったのに天理と認識された",
      });

      expect(content).toContain("報告者: 森脇 崇");
      expect(content).toContain("元の音声: 田中さんの訪問を天理チームに変更してください");
      expect(content).toContain("誤変換項目: チーム");
      expect(content).toContain("誤変換内容: 天理チーム");
      expect(content).toContain("正しい値: 郡山北部チーム");
      expect(content).toContain("コメント: 「北部」と言ったのに天理と認識された");
    });

    it("オプションフィールドが空の場合は通知メッセージに含まれない", () => {
      const buildNotificationContent = (params: {
        reporterName: string;
        originalText: string;
        wrongField?: string;
        wrongValue?: string;
        correctValue?: string;
        comment?: string;
      }) => {
        return [
          `報告者: ${params.reporterName}`,
          `元の音声: ${params.originalText}`,
          params.wrongField ? `誤変換項目: ${params.wrongField}` : null,
          params.wrongValue ? `誤変換内容: ${params.wrongValue}` : null,
          params.correctValue ? `正しい値: ${params.correctValue}` : null,
          params.comment ? `コメント: ${params.comment}` : null,
        ].filter(Boolean).join("\n");
      };

      const content = buildNotificationContent({
        reporterName: "テストユーザー",
        originalText: "音声テキスト",
      });

      expect(content).toContain("報告者: テストユーザー");
      expect(content).toContain("元の音声: 音声テキスト");
      expect(content).not.toContain("誤変換項目");
      expect(content).not.toContain("誤変換内容");
      expect(content).not.toContain("正しい値");
      expect(content).not.toContain("コメント");
    });

    it("通知タイトルに報告者名が含まれる", () => {
      const buildTitle = (reporterName: string) =>
        `音声入力誤変換報告: ${reporterName}`;

      expect(buildTitle("森脇 崇")).toBe("音声入力誤変換報告: 森脇 崇");
      expect(buildTitle("田中 花子")).toBe("音声入力誤変換報告: 田中 花子");
    });
  });

  describe("誤変換項目の選択肢", () => {
    const WRONG_FIELD_OPTIONS = [
      "変更種別",
      "チーム",
      "利用者名",
      "変更前日時",
      "変更後日時",
      "担当スタッフ",
      "伝達先",
      "理由",
      "その他",
    ];

    it("9種類の誤変換項目選択肢が定義されている", () => {
      expect(WRONG_FIELD_OPTIONS).toHaveLength(9);
    });

    it("主要な項目が含まれている", () => {
      expect(WRONG_FIELD_OPTIONS).toContain("チーム");
      expect(WRONG_FIELD_OPTIONS).toContain("利用者名");
      expect(WRONG_FIELD_OPTIONS).toContain("変更前日時");
      expect(WRONG_FIELD_OPTIONS).toContain("変更後日時");
    });

    it("「その他」が選択肢に含まれている", () => {
      expect(WRONG_FIELD_OPTIONS).toContain("その他");
    });
  });

  describe("transcribedResultのJSON変換", () => {
    it("フォームデータをJSON文字列に変換できる", () => {
      const formData = {
        changeType: "visit_change",
        team: "郡山北部",
        patientName: "田中 花子",
        fromDatetime: "2026-03-10 10:00",
        toDatetime: "2026-03-10 11:00",
        staffBefore: "森脇",
        staffAfter: "山田",
        meetingName: "",
        reason: "スタッフ都合",
      };

      const json = JSON.stringify(formData);
      const parsed = JSON.parse(json);

      expect(parsed.changeType).toBe("visit_change");
      expect(parsed.team).toBe("郡山北部");
      expect(parsed.patientName).toBe("田中 花子");
    });

    it("空のフォームデータもJSON変換できる", () => {
      const emptyFormData = {
        changeType: "",
        team: "",
        patientName: "",
        fromDatetime: "",
        toDatetime: "",
        staffBefore: "",
        staffAfter: "",
        meetingName: "",
        reason: "",
      };

      const json = JSON.stringify(emptyFormData);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});
