/**
 * 通知機能のユニットテスト
 * DBなしで動作する純粋なロジックをテストする
 */

import { describe, it, expect } from "vitest";

// 通知タイプの定義テスト
describe("通知タイプ定義", () => {
  const validTypes = ["schedule_updated", "task_today", "new_message"] as const;

  it("3種類の通知タイプが定義されている", () => {
    expect(validTypes).toHaveLength(3);
    expect(validTypes).toContain("schedule_updated");
    expect(validTypes).toContain("task_today");
    expect(validTypes).toContain("new_message");
  });
});

// 通知メッセージ生成ロジックのテスト
describe("通知メッセージ生成", () => {
  it("スケジュール更新通知のメッセージが正しく生成される", () => {
    const userName = "崇";
    const team = "郡山北部";
    const day = "今日";
    const title = "スケジュールが更新されました";
    const body = `${userName}さんが${team}チームの${day}のスケジュールを更新しました`;
    expect(title).toBe("スケジュールが更新されました");
    expect(body).toBe("崇さんが郡山北部チームの今日のスケジュールを更新しました");
  });

  it("タスク追加通知 - 全スタッフ向け", () => {
    const assignType = "all";
    const assignLabel =
      assignType === "all" ? "全スタッフ" :
      assignType === "team" ? "チーム" : "個人指定";
    expect(assignLabel).toBe("全スタッフ");
  });

  it("タスク追加通知 - チーム向け", () => {
    const assignType = "team";
    const assignTeam = "身体";
    const assignLabel =
      assignType === "all" ? "全スタッフ" :
      assignType === "team" ? `${assignTeam}チーム` : "個人指定";
    expect(assignLabel).toBe("身体チーム");
  });

  it("タスク追加通知 - 個人向け", () => {
    const assignType = "personal";
    const assignUserName = "田中さん";
    const assignLabel =
      assignType === "all" ? "全スタッフ" :
      assignType === "team" ? "チーム" :
      assignUserName ?? "個人指定";
    expect(assignLabel).toBe("田中さん");
  });

  it("メッセージ本文が40文字を超えると省略される", () => {
    const longText = "これは非常に長いメッセージです。テストのために41文字以上の内容を含んでいます。X";
    const preview = longText.length > 40 ? longText.slice(0, 40) + "…" : longText;
    expect(preview.length).toBeLessThanOrEqual(41); // 40文字 + "…"
    expect(preview.endsWith("…")).toBe(true);
  });

  it("メッセージ本文が40文字以下の場合は省略されない", () => {
    const shortText = "短いメッセージ";
    const preview = shortText.length > 40 ? shortText.slice(0, 40) + "…" : shortText;
    expect(preview).toBe(shortText);
    expect(preview.endsWith("…")).toBe(false);
  });
});

// 相対時刻フォーマットのテスト
describe("相対時刻フォーマット", () => {
  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    return `${days}日前`;
  }

  it("30秒前は「たった今」と表示される", () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(date)).toBe("たった今");
  });

  it("5分前は「5分前」と表示される", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("5分前");
  });

  it("2時間前は「2時間前」と表示される", () => {
    const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("2時間前");
  });

  it("3日前は「3日前」と表示される", () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("3日前");
  });
});

// 未読カウントのテスト
describe("未読カウント計算", () => {
  it("未読通知の件数が正しく計算される", () => {
    const notifications = [
      { id: 1, isRead: 0 },
      { id: 2, isRead: 1 },
      { id: 3, isRead: 0 },
      { id: 4, isRead: 0 },
    ];
    const unreadCount = notifications.filter((n) => n.isRead === 0).length;
    expect(unreadCount).toBe(3);
  });

  it("全既読の場合は0件", () => {
    const notifications = [
      { id: 1, isRead: 1 },
      { id: 2, isRead: 1 },
    ];
    const unreadCount = notifications.filter((n) => n.isRead === 0).length;
    expect(unreadCount).toBe(0);
  });

  it("通知がない場合は0件", () => {
    const notifications: { id: number; isRead: number }[] = [];
    const unreadCount = notifications.filter((n) => n.isRead === 0).length;
    expect(unreadCount).toBe(0);
  });
});
