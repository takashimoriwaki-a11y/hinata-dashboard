/**
 * NotificationDropdown - ベルマーク通知ドロップダウン
 * スケジュール更新・タスク追加・新着メッセージの3種類の通知を表示する
 */

import { useState, useRef, useEffect } from "react";
import { Bell, Calendar, CheckSquare, MessageSquare, Check, CheckCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type NotificationType = "schedule_updated" | "task_today" | "new_message";

const TYPE_CONFIG: Record<NotificationType, { icon: React.ElementType; color: string; bg: string }> = {
  schedule_updated: { icon: Calendar, color: "text-blue-500", bg: "bg-blue-50" },
  task_today: { icon: CheckSquare, color: "text-amber-500", bg: "bg-amber-50" },
  new_message: { icon: MessageSquare, color: "text-emerald-500", bg: "bg-emerald-50" },
};

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

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [], refetch } = trpc.notifications.getAll.useQuery(undefined, {
    refetchInterval: 30000, // 30秒ごとに自動更新
  });

  const unreadCount = notifications.filter((n) => n.isRead === 0).length;

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => refetch(),
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("すべて既読にしました");
    },
  });

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ベルボタン */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
        aria-label="通知"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ドロップダウンパネル */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[480px] bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">通知</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount}件未読
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors"
                  title="すべて既読にする"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>全既読</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 通知リスト */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Bell className="w-8 h-8 opacity-30" />
                <p className="text-sm">通知はありません</p>
              </div>
            ) : (
              notifications.map((n) => {
                const config = TYPE_CONFIG[n.type as NotificationType] ?? TYPE_CONFIG.new_message;
                const Icon = config.icon;
                const isUnread = n.isRead === 0;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-border/50 cursor-pointer transition-colors",
                      isUnread
                        ? "bg-primary/5 hover:bg-primary/10"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => {
                      if (isUnread) markRead.mutate({ id: n.id });
                    }}
                  >
                    {/* アイコン */}
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", config.bg)}>
                      <Icon className={cn("w-4 h-4", config.color)} />
                    </div>
                    {/* テキスト */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={cn("text-xs font-semibold leading-tight", isUnread ? "text-foreground" : "text-muted-foreground")}>
                          {n.title}
                        </p>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                    {/* 既読ボタン */}
                    {isUnread && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead.mutate({ id: n.id });
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors flex-shrink-0"
                        title="既読にする"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
