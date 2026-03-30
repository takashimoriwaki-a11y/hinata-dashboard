import { describe, it, expect } from "vitest";

/**
 * @kokoronohinata.com ドメイン自動登録ロジックのユニットテスト
 * googleAuth.ts のコールバック内で使用するドメイン判定ロジックを検証する
 */

const ALLOWED_DOMAIN = "kokoronohinata.com";

function isAllowedDomain(email: string | null): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === ALLOWED_DOMAIN;
}

describe("Google OAuth ドメイン自動登録ロジック", () => {
  it("@kokoronohinata.com のメールアドレスは許可される", () => {
    expect(isAllowedDomain("tanaka@kokoronohinata.com")).toBe(true);
    expect(isAllowedDomain("yamada.hanako@kokoronohinata.com")).toBe(true);
    expect(isAllowedDomain("staff01@kokoronohinata.com")).toBe(true);
  });

  it("大文字小文字を区別せず許可される", () => {
    expect(isAllowedDomain("TEST@KOKORONOHINATA.COM")).toBe(true);
    expect(isAllowedDomain("User@Kokoronohinata.Com")).toBe(true);
  });

  it("他のドメインは拒否される", () => {
    expect(isAllowedDomain("user@gmail.com")).toBe(false);
    expect(isAllowedDomain("user@yahoo.co.jp")).toBe(false);
    expect(isAllowedDomain("user@example.com")).toBe(false);
  });

  it("類似ドメインも拒否される（サブドメイン・偽装等）", () => {
    expect(isAllowedDomain("user@sub.kokoronohinata.com")).toBe(false);
    expect(isAllowedDomain("user@kokoronohinata.com.evil.com")).toBe(false);
    expect(isAllowedDomain("user@notkokoronohinata.com")).toBe(false);
  });

  it("メールアドレスがnullまたは空の場合は拒否される", () => {
    expect(isAllowedDomain(null)).toBe(false);
    expect(isAllowedDomain("")).toBe(false);
  });

  it("@記号がないメールアドレスは拒否される", () => {
    expect(isAllowedDomain("notanemail")).toBe(false);
  });
});
