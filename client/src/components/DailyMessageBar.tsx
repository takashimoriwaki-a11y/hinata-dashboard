/**
 * DailyMessageBar - 今日の一言バー（編集権限管理付き）
 * - 全員：今日の一言を閲覧できる
 * - 編集権限者のみ：メッセージの追加・削除・並び替えが可能
 * - 権限確認はPINコード（4桁）で行う（シンプルな運用向け）
 * - メッセージはlocalStorageに永続保存
 */

import { useState, useEffect } from "react";
import { Pencil, X, Plus, Trash2, Lock, CheckCircle, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ========== デフォルトメッセージ ==========
const DEFAULT_MESSAGES = [
  "今日もチームワーク向上！",
  "今日もケアの質を高めよう！",
  "今日もチームメンバーを褒めよう！",
  "今日も主任を褒めよう！",
  "今日も副所長を褒めよう！",
  "今日も所長を褒めよう！",
  "今日も事務員を褒めよう！",
  "今日も事務長を褒めよう！",
  "今日も安全運転するぞ！",
  "今日も感染対策を徹底！",
];

// 編集権限PINコード（4桁）
const EDITOR_PIN = "1234";

const STORAGE_KEY = "hinata_daily_messages";

function loadMessages(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_MESSAGES;
}

function saveMessages(messages: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

function getDailyMessage(messages: string[]): string {
  if (messages.length === 0) return "今日もよろしくお願いします！";
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return messages[dayOfYear % messages.length];
}

export default function DailyMessageBar() {
  const [messages, setMessages] = useState<string[]>(loadMessages);
  const [dailyMessage, setDailyMessage] = useState(() => getDailyMessage(loadMessages()));

  // 編集モード
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  // 0:00 になったらメッセージを更新
  useEffect(() => {
    const scheduleNextUpdate = () => {
      const now = new Date();
      const msUntilMidnight =
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      return setTimeout(() => {
        setDailyMessage(getDailyMessage(messages));
        scheduleNextUpdate();
      }, msUntilMidnight);
    };
    const timer = scheduleNextUpdate();
    return () => clearTimeout(timer);
  }, [messages]);

  // メッセージ変更時に今日の一言を更新
  useEffect(() => {
    setDailyMessage(getDailyMessage(messages));
    saveMessages(messages);
  }, [messages]);

  const handleEditClick = () => {
    if (isAuthenticated) {
      setIsEditorMode(!isEditorMode);
      setExpanded(!isEditorMode);
    } else {
      setShowPinDialog(true);
      setPin("");
      setPinError(false);
    }
  };

  const handlePinSubmit = () => {
    if (pin === EDITOR_PIN) {
      setIsAuthenticated(true);
      setShowPinDialog(false);
      setIsEditorMode(true);
      setExpanded(true);
      toast.success("編集モードに入りました");
    } else {
      setPinError(true);
      setPin("");
      setTimeout(() => setPinError(false), 1500);
    }
  };

  const handleAddMessage = () => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    if (messages.includes(trimmed)) {
      toast.error("同じメッセージがすでに存在します");
      return;
    }
    setMessages((prev) => [...prev, trimmed]);
    setNewMessage("");
    toast.success("メッセージを追加しました");
  };

  const handleDeleteMessage = (index: number) => {
    if (messages.length <= 1) {
      toast.error("最低1件のメッセージが必要です");
      return;
    }
    setMessages((prev) => prev.filter((_, i) => i !== index));
    toast.success("メッセージを削除しました");
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setMessages((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === messages.length - 1) return;
    setMessages((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleExitEditor = () => {
    setIsEditorMode(false);
    setExpanded(false);
    setIsAuthenticated(false);
    toast.info("編集モードを終了しました");
  };

  return (
    <div className="flex-shrink-0">
      {/* ========== 今日の一言バー ========== */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-2 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
        <span className="text-sm flex-shrink-0">🌻</span>
        <p className="text-xs font-semibold text-orange-700 tracking-wide flex-1 truncate">
          {dailyMessage}
        </p>
        {/* 編集ボタン */}
        <button
          onClick={handleEditClick}
          className={cn(
            "flex-shrink-0 p-1 rounded transition-colors",
            isAuthenticated
              ? "text-orange-600 hover:bg-orange-100"
              : "text-orange-300 hover:text-orange-500 hover:bg-orange-100"
          )}
          title={isAuthenticated ? "メッセージを編集" : "編集（権限が必要）"}
        >
          {isAuthenticated ? (
            isEditorMode ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />
          ) : (
            <Lock className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* ========== PINダイアログ ========== */}
      {showPinDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-orange-500" />
              <h3 className="text-base font-bold text-foreground">編集権限の確認</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              編集権限者のみメッセージの追加・削除ができます。<br />PINコードを入力してください。
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4桁のPIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
              autoFocus
              className={cn(
                "w-full text-center text-xl font-bold tracking-[0.5em] border-2 rounded-xl px-4 py-3 mb-3 outline-none transition-colors",
                pinError
                  ? "border-red-400 bg-red-50 text-red-600 animate-pulse"
                  : "border-orange-200 focus:border-orange-400 bg-orange-50/50"
              )}
            />
            {pinError && (
              <p className="text-xs text-red-500 text-center mb-3">PINコードが違います</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowPinDialog(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handlePinSubmit}
                disabled={pin.length !== 4}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 transition-colors"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 編集パネル ========== */}
      {isEditorMode && isAuthenticated && (
        <div className="bg-orange-50 border-b border-orange-200 px-3 md:px-4 py-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-bold text-orange-700">メッセージ編集中</span>
              <span className="text-[10px] text-orange-500 bg-orange-100 px-1.5 py-0.5 rounded-full">{messages.length}件</span>
            </div>
            <button
              onClick={handleExitEditor}
              className="text-[10px] text-orange-600 hover:text-orange-800 underline"
            >
              編集を終了
            </button>
          </div>

          {/* メッセージ一覧 */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-orange-100"
              >
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleMoveUp(i)}
                    disabled={i === 0}
                    className="text-orange-300 hover:text-orange-600 disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(i)}
                    disabled={i === messages.length - 1}
                    className="text-orange-300 hover:text-orange-600 disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-[10px] text-orange-400 font-mono w-4 flex-shrink-0">{i + 1}</span>
                <p className="flex-1 text-xs text-foreground truncate">{msg}</p>
                {msg === dailyMessage && (
                  <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full flex-shrink-0">今日</span>
                )}
                <button
                  onClick={() => handleDeleteMessage(i)}
                  className="flex-shrink-0 text-muted-foreground hover:text-red-500 transition-colors p-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* 新規追加 */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="新しいメッセージを入力..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMessage()}
              className="flex-1 text-xs border border-orange-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button
              onClick={handleAddMessage}
              disabled={!newMessage.trim()}
              className="flex-shrink-0 flex items-center gap-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
