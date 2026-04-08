/**
 * offlineQueue.test.ts - オフラインキューストアのユニットテスト
 * クライアントサイドのlocalStorageを使うライブラリのロジックをサーバー側でテスト
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// localStorageのモック
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};
vi.stubGlobal("localStorage", localStorageMock);

// crypto.randomUUID のモック
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

// モック後にimport
const { enqueue, dequeue, getQueue, getQueueCount, clearQueue } = await import("../client/src/lib/offlineQueue");

describe("offlineQueue", () => {
  beforeEach(() => {
    localStorageMock.clear();
    uuidCounter = 0;
  });

  it("enqueue でアイテムをキューに追加できる", () => {
    const item = enqueue({ type: "tasks.create", payload: { text: "テストタスク" }, label: "タスク追加: テストタスク" });
    expect(item.type).toBe("tasks.create");
    expect(item.label).toBe("タスク追加: テストタスク");
    expect(item.id).toBeTruthy();
    expect(getQueueCount()).toBe(1);
  });

  it("複数アイテムをキューに追加できる", () => {
    enqueue({ type: "tasks.create", payload: { text: "タスク1" }, label: "タスク1" });
    enqueue({ type: "messages.create", payload: { text: "メッセージ1" }, label: "メッセージ1" });
    expect(getQueueCount()).toBe(2);
  });

  it("dequeue で特定のアイテムを削除できる", () => {
    const item1 = enqueue({ type: "tasks.create", payload: { text: "タスク1" }, label: "タスク1" });
    const item2 = enqueue({ type: "messages.create", payload: { text: "メッセージ1" }, label: "メッセージ1" });
    dequeue(item1.id);
    expect(getQueueCount()).toBe(1);
    const queue = getQueue();
    expect(queue[0].id).toBe(item2.id);
  });

  it("getQueue でキューの全アイテムを取得できる", () => {
    enqueue({ type: "tasks.create", payload: { text: "タスク1" }, label: "タスク1" });
    enqueue({ type: "scheduleChanges.createAndExport", payload: { changeType: "visit_cancel" }, label: "変更連絡" });
    const queue = getQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].type).toBe("tasks.create");
    expect(queue[1].type).toBe("scheduleChanges.createAndExport");
  });

  it("clearQueue でキューを全消去できる", () => {
    enqueue({ type: "tasks.create", payload: { text: "タスク1" }, label: "タスク1" });
    enqueue({ type: "messages.create", payload: { text: "メッセージ1" }, label: "メッセージ1" });
    clearQueue();
    expect(getQueueCount()).toBe(0);
  });

  it("localStorage に永続化される", () => {
    enqueue({ type: "tasks.create", payload: { text: "永続化テスト" }, label: "永続化テスト" });
    const stored = localStorage.getItem("hinata_offline_queue");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].payload.text).toBe("永続化テスト");
  });

  it("空のキューでは getQueueCount が 0 を返す", () => {
    expect(getQueueCount()).toBe(0);
  });
});
