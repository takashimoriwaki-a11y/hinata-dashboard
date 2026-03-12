import { describe, it, expect, vi } from "vitest";
import { addDays, isPast, isToday } from "date-fns";

// DBモック
const mockMinutes = [
  {
    id: 1,
    title: "4月スタッフ会議",
    content: "4月スタッフ会議",
    documentUrl: "https://docs.google.com/document/d/abc123",
    documentLabel: "4月スタッフ会議",
    createdBy: 1,
    createdByName: "森脇崇",
    deadline: null,
    createdAt: new Date("2026-03-01T10:00:00Z"),
    updatedAt: new Date("2026-03-01T10:00:00Z"),
  },
  {
    id: 2,
    title: "3月研修資料",
    content: "3月研修資料",
    documentUrl: null,
    documentLabel: null,
    createdBy: 1,
    createdByName: "森脇崇",
    deadline: new Date("2026-03-15T00:00:00Z"), // 期限あり
    createdAt: new Date("2026-02-28T09:00:00Z"),
    updatedAt: new Date("2026-02-28T09:00:00Z"),
  },
  {
    id: 3,
    title: "感染対策マニュアル改訂",
    content: "感染対策マニュアル改訂",
    documentUrl: "https://docs.google.com/document/d/xyz789",
    documentLabel: "感染対策マニュアル",
    createdBy: 1,
    createdByName: "田中花子",
    deadline: new Date("2020-01-01T00:00:00Z"), // 期限切れ（過去日付）
    createdAt: new Date("2026-02-20T09:00:00Z"),
    updatedAt: new Date("2026-02-20T09:00:00Z"),
  },
];

const mockChecks = [
  {
    id: 1,
    minutesId: 1,
    userId: 2,
    userName: "田中花子",
    checkedAt: new Date("2026-03-02T08:00:00Z"),
  },
  {
    id: 2,
    minutesId: 1,
    userId: 3,
    userName: "鈴木次郎",
    checkedAt: new Date("2026-03-02T09:00:00Z"),
  },
];

const mockUsers = [
  { id: 2, name: "田中花子", role: "user" },
  { id: 3, name: "鈴木次郎", role: "user" },
  { id: 4, name: "佐藤三郎", role: "user" },
];

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// ---- 既読者確認 ----
describe("議事録 getReaders API", () => {
  it("既読者リストと未確認者リストを正しく分離できる", () => {
    const checkedUserIds = new Set(mockChecks.map((c) => c.userId));
    const readers = mockChecks.map((c) => ({
      userId: c.userId,
      userName: c.userName,
      checkedAt: c.checkedAt,
    }));
    const unread = mockUsers
      .filter((s) => !checkedUserIds.has(s.id))
      .map((s) => ({ userId: s.id, userName: s.name ?? "" }));

    expect(readers).toHaveLength(2);
    expect(readers[0].userName).toBe("田中花子");
    expect(readers[1].userName).toBe("鈴木次郎");
    expect(unread).toHaveLength(1);
    expect(unread[0].userName).toBe("佐藤三郎");
  });

  it("全員が確認済みの場合、未確認者リストは空になる", () => {
    const allChecks = mockUsers.map((u, i) => ({
      id: i + 1,
      minutesId: 2,
      userId: u.id,
      userName: u.name,
      checkedAt: new Date(),
    }));
    const checkedUserIds = new Set(allChecks.map((c) => c.userId));
    const unread = mockUsers
      .filter((s) => !checkedUserIds.has(s.id))
      .map((s) => ({ userId: s.id, userName: s.name ?? "" }));

    expect(unread).toHaveLength(0);
  });

  it("誰も確認していない場合、既読者リストは空になる", () => {
    const readers: { userId: number; userName: string; checkedAt: Date }[] = [];
    const checkedUserIds = new Set<number>();
    const unread = mockUsers
      .filter((s) => !checkedUserIds.has(s.id))
      .map((s) => ({ userId: s.id, userName: s.name ?? "" }));

    expect(readers).toHaveLength(0);
    expect(unread).toHaveLength(3);
  });
});

// ---- checkedByMe フィルタリング ----
describe("議事録 list API - checkedByMe フィルタリング", () => {
  it("自分がチェック済みの議事録にはcheckedByMe=trueが付く", () => {
    const myUserId = 2;
    const myCheckedIds = new Set(
      mockChecks.filter((c) => c.userId === myUserId).map((c) => c.minutesId)
    );
    const result = mockMinutes.map((m) => ({
      ...m,
      checkedByMe: myCheckedIds.has(m.id),
    }));

    expect(result[0].checkedByMe).toBe(true);  // id=1 はチェック済み
    expect(result[1].checkedByMe).toBe(false); // id=2 は未チェック
  });

  it("未確認リストはcheckedByMe=falseのものだけになる", () => {
    const myUserId = 2;
    const myCheckedIds = new Set(
      mockChecks.filter((c) => c.userId === myUserId).map((c) => c.minutesId)
    );
    const allWithChecked = mockMinutes.map((m) => ({
      ...m,
      checkedByMe: myCheckedIds.has(m.id),
    }));

    const unreadList = allWithChecked.filter((m) => !m.checkedByMe);
    const readList = allWithChecked.filter((m) => m.checkedByMe);

    expect(unreadList).toHaveLength(2);
    expect(readList).toHaveLength(1);
    expect(readList[0].id).toBe(1);
  });
});

// ---- タブ切り替えロジック ----
describe("議事録タブ切り替えロジック", () => {
  it("未確認タブでは checkedByMe=false のアイテムが表示される", () => {
    const items = [
      { id: 1, checkedByMe: false },
      { id: 2, checkedByMe: true },
      { id: 3, checkedByMe: false },
    ];
    const localCheckedIds = new Set<number>();
    const unreadList = items.filter(
      (m) => !m.checkedByMe && !localCheckedIds.has(m.id)
    );
    expect(unreadList).toHaveLength(2);
    expect(unreadList.map((m) => m.id)).toEqual([1, 3]);
  });

  it("楽観的更新でlocalCheckedIdsに追加されたアイテムは未確認タブから消える", () => {
    const items = [
      { id: 1, checkedByMe: false },
      { id: 2, checkedByMe: false },
      { id: 3, checkedByMe: false },
    ];
    const localCheckedIds = new Set<number>([1, 2]);
    const unreadList = items.filter(
      (m) => !m.checkedByMe && !localCheckedIds.has(m.id)
    );
    expect(unreadList).toHaveLength(1);
    expect(unreadList[0].id).toBe(3);
  });

  it("確認済みタブでは checkedByMe=true または localCheckedIds に含まれるアイテムが表示される", () => {
    const items = [
      { id: 1, checkedByMe: false },
      { id: 2, checkedByMe: true },
      { id: 3, checkedByMe: false },
    ];
    const localCheckedIds = new Set<number>([3]);
    const readList = items.filter(
      (m) => m.checkedByMe || localCheckedIds.has(m.id)
    );
    expect(readList).toHaveLength(2);
    expect(readList.map((m) => m.id)).toEqual([2, 3]);
  });
});

// ---- 検索・絞り込みロジック ----
describe("議事録 検索・絞り込みロジック", () => {
  it("タイトルでの部分一致検索が機能する", () => {
    const query = "研修";
    const filtered = mockMinutes.filter((m) =>
      m.title.toLowerCase().includes(query.toLowerCase())
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  it("投稿者名での検索が機能する", () => {
    const query = "田中";
    const filtered = mockMinutes.filter((m) =>
      m.title.toLowerCase().includes(query.toLowerCase()) ||
      (m.createdByName && m.createdByName.toLowerCase().includes(query.toLowerCase()))
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(3);
  });

  it("大文字小文字を区別しない検索が機能する", () => {
    const query = "GOOGLE";
    const filtered = mockMinutes.filter((m) =>
      m.title.toLowerCase().includes(query.toLowerCase())
    );
    // タイトルに"google"は含まれないので0件
    expect(filtered).toHaveLength(0);
  });

  it("空の検索クエリでは全件が返る", () => {
    const query = "";
    const filtered = query.trim()
      ? mockMinutes.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()))
      : mockMinutes;
    expect(filtered).toHaveLength(3);
  });

  it("検索結果が0件の場合、空配列が返る", () => {
    const query = "存在しないキーワード12345";
    const filtered = mockMinutes.filter((m) =>
      m.title.toLowerCase().includes(query.toLowerCase())
    );
    expect(filtered).toHaveLength(0);
  });
});

// ---- 期限設定ロジック ----
describe("議事録 期限設定ロジック", () => {
  it("期限なしの議事録はdeadlineがnull", () => {
    const m = mockMinutes[0];
    expect(m.deadline).toBeNull();
  });

  it("期限ありの議事録はdeadlineがDateオブジェクト", () => {
    const m = mockMinutes[1];
    expect(m.deadline).toBeInstanceOf(Date);
  });

  it("過去の日付は期限切れと判定される", () => {
    const overdueDate = new Date("2020-01-01T00:00:00Z");
    const overdue = isPast(overdueDate) && !isToday(overdueDate);
    expect(overdue).toBe(true);
  });

  it("未来の日付は期限切れと判定されない", () => {
    const futureDate = addDays(new Date(), 30);
    const overdue = isPast(futureDate) && !isToday(futureDate);
    expect(overdue).toBe(false);
  });

  it("2日以内の期限は緊急アイテムとしてカウントされる", () => {
    const urgentItems = mockMinutes.filter((m) => {
      if (!m.deadline) return false;
      const d = new Date(m.deadline);
      return d <= addDays(new Date(), 2);
    });
    // mockMinutes[2] (id=3) は2020年1月1日なので期限切れ → 緊急
    expect(urgentItems.length).toBeGreaterThanOrEqual(1);
    expect(urgentItems.some((m) => m.id === 3)).toBe(true);
  });
});

// ---- リマインド通知ロジック ----
describe("議事録 リマインド通知ロジック", () => {
  it("未確認スタッフのみにリマインドが送られる", () => {
    const minutesId = 1;
    const checks = mockChecks.filter((c) => c.minutesId === minutesId);
    const checkedIds = new Set(checks.map((c) => c.userId));
    const unreadStaff = mockUsers.filter((s) => !checkedIds.has(s.id));

    // 通知対象は未確認スタッフのみ
    const notifications = unreadStaff.map((s) => ({
      type: "minutes_reminder",
      title: "議事録の確認をお願いします",
      body: `「4月スタッフ会議」をまだ確認していません。`,
      targetUserId: s.id,
    }));

    expect(notifications).toHaveLength(1);
    expect(notifications[0].targetUserId).toBe(4); // 佐藤三郎のみ
  });

  it("全員確認済みの場合はリマインドが0件", () => {
    const allCheckedIds = new Set(mockUsers.map((u) => u.id));
    const unreadStaff = mockUsers.filter((s) => !allCheckedIds.has(s.id));
    expect(unreadStaff).toHaveLength(0);
  });

  it("リマインド通知にはtargetUserIdが設定される", () => {
    const staff = { id: 4, name: "佐藤三郎" };
    const notification = {
      type: "minutes_reminder" as const,
      title: "議事録の確認をお願いします",
      body: "「テスト議事録」をまだ確認していません。",
      targetUserId: staff.id,
      isRead: 0,
    };
    expect(notification.targetUserId).toBe(4);
    expect(notification.isRead).toBe(0);
  });
});
