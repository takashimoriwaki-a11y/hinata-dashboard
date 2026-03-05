export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// ローカル認証: ログインページのパス
export const getLoginUrl = (_returnPath?: string) => {
  return "/login";
};
