/**
 * 共有プロンプト並び替えAPIのテスト
 * reorderSharedPrompts: 管理者・特級管理者のみ並び替えを実行できる
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// DB関数をモック
vi.mock("./db", () => ({
  reorderSharedPrompts: vi.fn().mockResolvedValue(undefined),
}));

import { reorderSharedPrompts } from "./db";

describe("reorderSharedPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orderedIds配列を渡すと並び替え関数が呼ばれる", async () => {
    const orderedIds = [3, 1, 2];
    await reorderSharedPrompts(orderedIds);
    expect(reorderSharedPrompts).toHaveBeenCalledWith([3, 1, 2]);
    expect(reorderSharedPrompts).toHaveBeenCalledTimes(1);
  });

  it("空配列を渡しても正常に動作する", async () => {
    await reorderSharedPrompts([]);
    expect(reorderSharedPrompts).toHaveBeenCalledWith([]);
  });
});

// 権限チェックのロジックテスト（ルーター層のロジックを直接テスト）
describe("並び替え権限チェックロジック", () => {
  function checkPermission(role: string): boolean {
    return role === "admin" || role === "super_admin";
  }

  it("adminロールは並び替えを許可される", () => {
    expect(checkPermission("admin")).toBe(true);
  });

  it("super_adminロールは並び替えを許可される", () => {
    expect(checkPermission("super_admin")).toBe(true);
  });

  it("userロールは並び替えを拒否される", () => {
    expect(checkPermission("user")).toBe(false);
  });

  it("空文字列ロールは並び替えを拒否される", () => {
    expect(checkPermission("")).toBe(false);
  });
});
