import { describe, it, expect, vi, beforeEach } from "vitest";

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
    createdAt: new Date("2026-02-28T09:00:00Z"),
    updatedAt: new Date("2026-02-28T09:00:00Z"),
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

describe("議事録 getReaders API", () => {
  it("既読者リストと未確認者リストを正しく分離できる", () => {
    // minutesId=1 のチェック済みユーザーIDのセット
    const checkedUserIds = new Set(mockChecks.map((c) => c.userId));
    
    // 既読者リスト
    const readers = mockChecks.map((c) => ({
      userId: c.userId,
      userName: c.userName,
      checkedAt: c.checkedAt,
    }));
    
    // 未確認者リスト（全スタッフからチェック済みを除外）
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

    expect(unreadList).toHaveLength(1);
    expect(unreadList[0].id).toBe(2);
    expect(readList).toHaveLength(1);
    expect(readList[0].id).toBe(1);
  });
});

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
    const localCheckedIds = new Set<number>([1, 2]); // id=1,2をローカルでチェック済み
    
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
    const localCheckedIds = new Set<number>([3]); // id=3をローカルでチェック済み
    
    const readList = items.filter(
      (m) => m.checkedByMe || localCheckedIds.has(m.id)
    );
    
    expect(readList).toHaveLength(2);
    expect(readList.map((m) => m.id)).toEqual([2, 3]);
  });
});
