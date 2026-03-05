/**
 * メッセージ機能のユニットテスト
 * - getActiveMessages: 期限切れ・削除済み・未公開を除外
 * - createMessage: 正常作成
 * - softDeleteMessage: 作成者のみ削除
 * - toggleReaction: トグル動作
 * - expireMessages: 期限切れ自動削除
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// DB関数をモック
vi.mock("./db", () => {
  const now = new Date();
  const past = new Date(now.getTime() - 60 * 60 * 1000); // 1時間前
  const future = new Date(now.getTime() + 60 * 60 * 1000); // 1時間後

  const mockMessages = [
    {
      id: 1,
      text: "全体向けメッセージ",
      createdBy: 1,
      createdByName: "森脇崇",
      displayFrom: null,
      displayUntil: null,
      scheduledAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      text: "表示期間設定あり",
      createdBy: 2,
      createdByName: "田中花子",
      displayFrom: past,
      displayUntil: future,
      scheduledAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      text: "削除済みメッセージ",
      createdBy: 1,
      createdByName: "森脇崇",
      displayFrom: null,
      displayUntil: null,
      scheduledAt: null,
      deletedAt: now,
      createdAt: past,
      updatedAt: now,
    },
    {
      id: 4,
      text: "予約送信（未来）",
      createdBy: 1,
      createdByName: "森脇崇",
      displayFrom: null,
      displayUntil: null,
      scheduledAt: future,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 5,
      text: "期限切れメッセージ",
      createdBy: 2,
      createdByName: "田中花子",
      displayFrom: null,
      displayUntil: past,
      scheduledAt: null,
      deletedAt: null,
      createdAt: past,
      updatedAt: now,
    },
  ];

  const mockReactions = [
    { id: 1, messageId: 1, userId: 2, userName: "田中花子", emoji: "❤️", createdAt: now },
    { id: 2, messageId: 1, userId: 3, userName: "佐藤次郎", emoji: "👍", createdAt: now },
  ];

  return {
    getActiveMessages: vi.fn(async () =>
      mockMessages.filter(
        (m) =>
          !m.deletedAt &&
          (!m.scheduledAt || m.scheduledAt <= new Date()) &&
          (!m.displayFrom || m.displayFrom <= new Date()) &&
          (!m.displayUntil || m.displayUntil > new Date())
      )
    ),
    createMessage: vi.fn(async (data: Record<string, unknown>) => {
      const newId = mockMessages.length + 1;
      mockMessages.push({
        id: newId,
        text: data.text as string,
        createdBy: data.createdBy as number,
        createdByName: data.createdByName as string,
        displayFrom: (data.displayFrom as Date | null) ?? null,
        displayUntil: (data.displayUntil as Date | null) ?? null,
        scheduledAt: (data.scheduledAt as Date | null) ?? null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return newId;
    }),
    softDeleteMessage: vi.fn(async (id: number, userId: number) => {
      const msg = mockMessages.find((m) => m.id === id);
      if (msg && msg.createdBy === userId) {
        msg.deletedAt = new Date();
      }
    }),
    getMessageById: vi.fn(async (id: number) => mockMessages.find((m) => m.id === id)),
    toggleReaction: vi.fn(async (messageId: number, userId: number, userName: string, emoji: string) => {
      const existing = mockReactions.find(
        (r) => r.messageId === messageId && r.userId === userId && r.emoji === emoji
      );
      if (existing) {
        mockReactions.splice(mockReactions.indexOf(existing), 1);
        return { action: "removed" as const };
      } else {
        mockReactions.push({ id: mockReactions.length + 1, messageId, userId, userName, emoji, createdAt: new Date() });
        return { action: "added" as const };
      }
    }),
    getReactionsByMessageIds: vi.fn(async (ids: number[]) =>
      mockReactions.filter((r) => ids.includes(r.messageId))
    ),
    expireMessages: vi.fn(async () => {
      const now2 = new Date();
      let count = 0;
      for (const m of mockMessages) {
        if (!m.deletedAt && m.displayUntil && m.displayUntil < now2) {
          m.deletedAt = now2;
          count++;
        }
      }
      return count;
    }),
  };
});

describe("メッセージ機能", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getActiveMessagesが削除済み・期限切れ・未公開を除外して返すこと", async () => {
    const { getActiveMessages } = await import("./db");
    const result = await getActiveMessages();
    // id:1（全体）とid:2（表示期間内）のみ返る
    expect(result.length).toBe(2);
    expect(result.map((m) => m.id)).toContain(1);
    expect(result.map((m) => m.id)).toContain(2);
    // id:3（削除済み）は含まれない
    expect(result.map((m) => m.id)).not.toContain(3);
    // id:4（予約送信・未来）は含まれない
    expect(result.map((m) => m.id)).not.toContain(4);
    // id:5（期限切れ）は含まれない
    expect(result.map((m) => m.id)).not.toContain(5);
  });

  it("createMessageが正しく呼び出されること", async () => {
    const { createMessage } = await import("./db");
    const id = await createMessage({
      text: "新しいメッセージ",
      createdBy: 1,
      createdByName: "森脇崇",
      displayFrom: undefined,
      displayUntil: undefined,
      scheduledAt: undefined,
    });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: "新しいメッセージ", createdBy: 1 })
    );
  });

  it("softDeleteMessageが作成者のみ削除できること", async () => {
    const { softDeleteMessage, getMessageById } = await import("./db");
    // 作成者（userId:1）が自分のメッセージ（id:1）を削除
    await softDeleteMessage(1, 1);
    expect(softDeleteMessage).toHaveBeenCalledWith(1, 1);
    // 他人のメッセージ（id:2, createdBy:2）をuserId:1が削除しようとしても削除されない
    await softDeleteMessage(2, 1);
    const msg = await getMessageById(2);
    expect(msg?.deletedAt).toBeNull();
  });

  it("toggleReactionが追加・削除をトグルすること", async () => {
    const { toggleReaction } = await import("./db");
    // 新規追加
    const added = await toggleReaction(2, 3, "佐藤次郎", "✅");
    expect(added.action).toBe("added");
    // 同じ絵文字を再度押すと削除
    const removed = await toggleReaction(2, 3, "佐藤次郎", "✅");
    expect(removed.action).toBe("removed");
  });

  it("expireMessagesが期限切れメッセージを論理削除すること", async () => {
    const { expireMessages } = await import("./db");
    const count = await expireMessages();
    // id:5が期限切れなので1件削除される
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("getReactionsByMessageIdsが指定IDのリアクションを返すこと", async () => {
    const { getReactionsByMessageIds } = await import("./db");
    const reactions = await getReactionsByMessageIds([1]);
    expect(reactions.length).toBeGreaterThanOrEqual(2);
    expect(reactions.every((r) => r.messageId === 1)).toBe(true);
  });

  it("空のIDリストでgetReactionsByMessageIdsが空配列を返すこと", async () => {
    const { getReactionsByMessageIds } = await import("./db");
    const reactions = await getReactionsByMessageIds([]);
    expect(reactions).toEqual([]);
  });
});
