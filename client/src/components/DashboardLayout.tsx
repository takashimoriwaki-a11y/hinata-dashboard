/**
 * DashboardLayout - サイドバー付きレイアウト（PC・iPhone両対応レスポンシブ）
 * Design: ひなた公式ロゴ・ブランドカラー（オレンジ系）を使用した温かみのあるUI
 * PC: サイドバー（デフォルト折りたたみ）+ トップバー
 * iPhone: サイドバー非表示 + ボトムナビ固定
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { usePushNotification } from "@/hooks/usePushNotification";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ClipboardEdit,
  CheckSquare,
  ExternalLink,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Calendar,
  Menu,
  X,
  CalendarClock,
  History,
  ListTodo,
  Car,
  FileText,
  CalendarDays,
  BookOpen,
  ShieldAlert,
  Star,
  Sun,
  Moon,
  Sparkles,
  MapPin,
  FileCheck,
  Target,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TeamGoalsTicker from "./TeamGoalsTicker";
import { MonthlyOvertimeSignature } from "./MonthlyOvertimeSignature";
import AISharedPromptsModal from "./AISharedPromptsModal";
import { TeamSetupModal } from "./TeamSetupModal";
import { WelcomeModal } from "./WelcomeModal";
import { useTheme } from "@/contexts/ThemeContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import NotificationDropdown from "./NotificationDropdown";
import GlobalLoadingIndicator from "./GlobalLoadingIndicator";
import { useOfflineQueueContext } from "@/contexts/OfflineQueueContext";

// ロゴCDN URL
const LOGO_MARK_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_mark_bf1d0229.png";
const LOGO_TEXT_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_text_9eb540dd.svg";

// ========== ナビゲーション定義 ==========
const navItems = [
  { href: "/", icon: LayoutDashboard, label: "ホーム" },
  { href: "/schedule-change-history", icon: History, label: "変更履歴" },
  { href: "/my-links", icon: Star, label: "マイリンク追加" },
];

const externalTools = [
  { label: "ZEST（スケジュール）", href: "https://homecare.zest.jp/login", icon: ExternalLink },

];

// ボトムナビゲーション（順: 議事録・訪問・ホーム・個人タスク・変更連絡）
const bottomNavItems = [
  { type: "internal", href: "/minutes", icon: BookOpen, label: "議事録", badge: true },
  { type: "internal", href: "/record", icon: MapPin, label: "訪問" },
  { type: "internal", href: "/", icon: LayoutDashboard, label: "ホーム", monthlySignatureBadge: true },
  { type: "internal", href: "/personal-tasks", icon: ClipboardList, label: "個人タスク" },
  { type: "internal", href: "/schedule-change", icon: CalendarClock, label: "変更連絡" },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { queueCount, isFlushing } = useOfflineQueueContext();
  const { data: minutesUnchecked } = trpc.minutes.uncheckedCount.useQuery(undefined, {
    refetchInterval: 60000,
  });
  
  // タブ切り替え高速化：主要ページのデータをプリフェッチ
  // utils は毎レンダーで参照が変わる可能性があるため依存配列から除外し、
  // useRef で安定した参照を保持することで無限ループを防ぐ
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  useEffect(() => {
    utilsRef.current = utils;
  });
  useEffect(() => {
    const u = utilsRef.current;
    // ホーム以外のページでホームのデータを事前読み込み
    if (location !== '/') {
      u.visits.getCurrent.prefetch();
      u.messages.getActive.prefetch();
      u.tasks.getMine.prefetch();
      u.schedule.getAll.prefetch();
    }
    // 記録タブ以外で利用者データを事前読み込み
    if (location !== '/record') {
      u.patients.list.prefetch({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  const SIDEBAR_KEY = "hinata-sidebar-collapsed";
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch {}
      return next;
    });
  };
  // モバイル用ドロワー開閉
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isNight, toggleTheme, switchable, theme } = useTheme();
  // SSEリアルタイム同期：他職員の更新を自動反映する
  useRealtimeSync();
  const { logout, user } = useAuth({ redirectOnUnauthenticated: true });
  // ログインユーザーの名前の最初の1文字をアバターに表示
  const userInitial = user?.name ? user.name.charAt(0) : "?";
  const { isSubscribed, isLoading: pushLoading, subscribe, unsubscribe, permission: pushPermission } = usePushNotification();
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("all");
  const [showAIPromptsModal, setShowAIPromptsModal] = useState(false);
  const [showMonthlyOvertimeModal, setShowMonthlyOvertimeModal] = useState(false);

  // 月次署名の未署名バッジ用クエリ（今月分）
  const { signatureYear, signatureMonth } = useMemo(() => {
    const d = new Date();
    return { signatureYear: d.getFullYear(), signatureMonth: d.getMonth() + 1 };
  }, []);
  const { data: currentMonthSignature } = trpc.monthlySignature.get.useQuery(
    { targetYear: signatureYear, targetMonth: signatureMonth },
    { enabled: !!user, refetchInterval: 60000 }
  );
  const isMonthlySignatureUnsigned = !!user && !currentMonthSignature;

  // 初回チーム設定モーダル
  const { data: myProfile } = trpc.userSettings.getMyProfile.useQuery(undefined, {
    enabled: !!user,
  });
  const [teamSetupModalDismissed, setTeamSetupModalDismissed] = useState(false);
  const showTeamSetupModal = !!user && !!myProfile && !myProfile.teamSetupDone && !teamSetupModalDismissed;
  const [welcomeTeam, setWelcomeTeam] = useState<string | null>(null);
  const showWelcomeModal = welcomeTeam !== null;
  // iOS PWAモードの検出（ホーム画面に追加されている場合はtrue）
  const isIOSPWA = typeof window !== "undefined" &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isIOS = typeof window !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

  const handleLogout = async () => {
    try {
      // サーバー側のCookieをクリア
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    await logout();
    window.location.href = "/login";
  };

  // ページ遷移時にモバイルドロワーを閉じる
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ページ遷移時にスクロール位置を記憶・復元する（localStorageで永続化 - アプリ再起動後も復元）
  const mainRef = useRef<HTMLElement>(null);
  const prevLocationRef = useRef<string>(location);
  // スクロール中の誤タップ防止
  const touchStartYRef = useRef<number | null>(null);
  const isScrollingRef = useRef(false);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    // 前のページのスクロール位置を保存（localStorageに永続化）
    const prevPath = prevLocationRef.current;
    if (prevPath !== location) {
      try { localStorage.setItem(`scroll:${prevPath}`, String(el.scrollTop)); } catch {}
      prevLocationRef.current = location;
    }

    // 新しいページの保存済スクロール位置を復元（なければ先頭）
    const saved = localStorage.getItem(`scroll:${location}`);
    // DOMが描画された後に復元するため遅延させる（RouteTransitionWrapperのアニメーション40ms + 余裕分）
    const timer = setTimeout(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = saved ? parseInt(saved, 10) : 0;
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [location]);

  const dateStr = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  });
  const timeStr = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });
  const timeStrShort = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });

  // サイドバー内容（PC・モバイル共通）
  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full min-h-0">
      {/* ロゴエリア */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border py-3",
        (collapsed && !mobile) ? "justify-center px-0" : "gap-2 px-4"
      )}>
        <img src={LOGO_MARK_URL} alt="ひなた" className="w-9 h-9 object-contain flex-shrink-0" />
        {(!collapsed || mobile) && (
          <div className="flex flex-col gap-0.5 flex-1">
            <p className="text-[10px] text-sidebar-foreground/75 leading-tight whitespace-nowrap">こころの訪問看護ステーション</p>
            <span className="text-sm font-bold text-sidebar-foreground leading-tight tracking-wide">ひなた</span>
          </div>
        )}
        {mobile ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto flex-shrink-0 text-sidebar-foreground/80 hover:text-sidebar-foreground p-1"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          /* PC版: 開閉ボタンをロゴエリア右端に配置 */
          <button
            onClick={toggleCollapsed}
            className="ml-auto flex-shrink-0 p-1.5 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            title={collapsed ? "サイドパネルを開く" : "サイドパネルを閉じる"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* ユーザー情報 */}
      {(!collapsed || mobile) && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <Avatar className="w-9 h-9 flex-shrink-0">
              <AvatarFallback className="bg-primary text-white text-sm font-bold">{userInitial}</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">{user?.name ?? "ゲスト"}</p>
            </div>
          </div>
        </div>
      )}

      {/* ナビゲーション */}
      <nav className="flex-1 py-3 overflow-y-auto min-h-0">
        {(!collapsed || mobile) && (
          <p className="px-4 text-xs font-semibold text-sidebar-foreground/65 uppercase tracking-wider mb-1">
            メニュー
          </p>
        )}
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                title={(collapsed && !mobile) ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 py-3 mx-2 rounded-lg transition-all duration-200 select-none active:scale-95 active:opacity-80 hover:-translate-y-0.5 hover:shadow-sm",
                  "text-sm font-medium",
                  (collapsed && !mobile) ? "justify-center px-0" : "px-3",
                  isActive
                    ? "bg-primary text-white shadow-md -translate-y-0.5"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
              </div>
            </Link>
          );
        })}

        {/* AI共有プロンプトボタン */}
        <button
          onClick={() => setShowAIPromptsModal(true)}
          title={(collapsed && !mobile) ? "共有プロンプト" : undefined}
          className={cn(
            "flex items-center gap-3 py-3 mx-2 rounded-lg transition-all duration-200 select-none active:scale-95 active:opacity-80 hover:-translate-y-0.5 hover:shadow-sm",
            "text-sm font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            (collapsed && !mobile) ? "justify-center px-0" : "px-3 w-[calc(100%-1rem)]"
          )}
        >
          <Sparkles className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || mobile) && <span className="truncate">共有プロンプト</span>}
        </button>

        {/* 月次残業確認・署名（他のナビアイテムと統一感のあるボタン形式） */}
        <button
          onClick={() => setShowMonthlyOvertimeModal(true)}
          title={(collapsed && !mobile) ? "月次残業署名" : undefined}
          className={cn(
            "relative flex items-center gap-3 py-3 mx-2 rounded-lg transition-all duration-200 select-none active:scale-95 active:opacity-80 hover:-translate-y-0.5 hover:shadow-sm",
            "text-sm font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            (collapsed && !mobile) ? "justify-center px-0" : "px-3 w-[calc(100%-1rem)]"
          )}
        >
          <span className="relative inline-flex flex-shrink-0">
            <FileCheck className="w-5 h-5" />
            {isMonthlySignatureUnsigned && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-sidebar" />
            )}
          </span>
          {(!collapsed || mobile) && (
            <span className="truncate flex-1 text-left">月次残業署名</span>
          )}
          {(!collapsed || mobile) && isMonthlySignatureUnsigned && (
            <span className="flex-shrink-0 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>

        {/* チーム目標（全職員表示） */}
        <Link href="/team-goals">
          <button
            onClick={() => setMobileOpen(false)}
            title={(collapsed && !mobile) ? "チーム目標" : undefined}
            className={cn(
              "relative flex items-center gap-3 py-3 mx-2 rounded-lg transition-all duration-200 select-none active:scale-95 active:opacity-80 hover:-translate-y-0.5 hover:shadow-sm",
              "text-sm font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              (collapsed && !mobile) ? "justify-center px-0" : "px-3 w-[calc(100%-1rem)]"
            )}
          >
            <Target className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || mobile) && (
              <span className="truncate flex-1 text-left">チーム目標</span>
            )}
          </button>
        </Link>
      </nav>

      {/* ボトムアクション */}
      <div className="border-t border-sidebar-border py-2 pb-[68px] flex-shrink-0">
        <button
          onPointerDown={() => {}}
          onClick={async () => {
            if (pushPermission === "unsupported") {
              toast.error("このブラウザはプッシュ通知に対応していません");
              return;
            }
            // iOSではユーザーアクション直後にrequestPermissionを呼ぶ必要がある
            if (!isSubscribed && "Notification" in window && Notification.permission === "default") {
              try {
                const perm = await Notification.requestPermission();
                if (perm === "denied") {
                  toast.error("通知がブロックされています。iPhoneの設定アプリ → Safari → 通知 から許可してください。");
                  return;
                }
              } catch {
                // iOS PWAでない場合は無視してダイアログを開く
              }
            }
            setNotifDialogOpen(true);
          }}
          disabled={pushLoading}
          title={(collapsed && !mobile) ? (isSubscribed ? "通知中" : "通知を有効にする") : undefined}
          className={cn(
            "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150 select-none active:scale-95 active:opacity-80",
            "text-sm hover:bg-sidebar-accent",
            (collapsed && !mobile) ? "justify-center px-0" : "px-3",
            isSubscribed
              ? "text-emerald-600 hover:text-emerald-700"
              : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
          )}
        >
          <div className="relative flex-shrink-0">
            <Bell className={cn("w-4 h-4", isSubscribed && "fill-emerald-500")} />
            {isSubscribed && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
            )}
          </div>
          {(!collapsed || mobile) && (
            <span>{pushLoading ? "処理中..." : isSubscribed ? "通知中" : "通知を有効に"}</span>
          )}
        </button>
        {user?.role === "admin" && (
          <Link href="/admin">
            <div
              title={(collapsed && !mobile) ? "管理画面" : undefined}
              className={cn(
                "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
                "text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                (collapsed && !mobile) ? "justify-center px-0" : "px-3",
                location === "/admin" && "bg-primary text-white"
              )}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              {(!collapsed || mobile) && <span>管理画面</span>}
            </div>
          </Link>
        )}
        {/* ダークモード手動切替ボタン（switchable=trueのとき表示） */}
        {switchable && toggleTheme && (
          <button
            onClick={toggleTheme}
            title={(collapsed && !mobile) ? (theme === "dark" ? "ライトモードに切替" : "ダークモードに切替") : undefined}
            className={cn(
              "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150 select-none active:scale-95 active:opacity-80",
              "text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              (collapsed && !mobile) ? "justify-center px-0" : "px-3"
            )}
          >
            <span className={cn(
              "w-4 h-4 flex-shrink-0 transition-transform duration-500",
              theme === "dark" ? "rotate-0" : "rotate-180"
            )}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </span>
            {(!collapsed || mobile) && (
              <span>{theme === "dark" ? "ライトモード" : "ダークモード"}</span>
            )}
          </button>
        )}
        <button
          onClick={handleLogout}
          title={(collapsed && !mobile) ? "ログアウト" : undefined}
          className={cn(
            "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150 select-none active:scale-95 active:opacity-80",
            "text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            (collapsed && !mobile) ? "justify-center px-0" : "px-3"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(!collapsed || mobile) && <span>ログアウト</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-orange-50/40 dark:bg-background">

      {/* ========== PC用サイドバー（md以上で表示・開閉可能） ========== */}
      <div className="relative hidden md:flex flex-shrink-0 h-full">
        <aside
          className={cn(
            "flex flex-col h-full z-30 overflow-hidden",
            "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
            "transition-all duration-300 ease-in-out",
            collapsed ? "w-14" : "w-56"
          )}
        >
          <SidebarContent />

        </aside>
      </div>

      {/* ========== モバイル用ドロワーオーバーレイ ========== */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ========== モバイル用ドロワー ========== */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex flex-col w-72 overflow-hidden",
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl",
          "transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ height: "calc(100dvh - 60px - env(safe-area-inset-bottom, 0px))" }}
      >
        <SidebarContent mobile />
      </aside>

      {/* ========== メインコンテンツエリア ========== */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* トップヘッダー */}
        <header className={cn(
          "flex items-center justify-between px-3 md:px-4 py-2.5 border-b border-border shadow-sm flex-shrink-0 bg-sidebar"
        )}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0 overflow-hidden">
            {/* モバイル: ハンバーガーメニュー（PC版は常時固定表示のため非表示） */}
            <button
              className="md:hidden text-muted-foreground hover:text-primary p-1 -ml-1 flex-shrink-0"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* ロゴマーク：PC版はサイドバーに表示されるためトップバーでは非表示 */}
            <img src={LOGO_MARK_URL} alt="ひなた" className="md:hidden w-7 h-7 object-contain flex-shrink-0" />
            {/* 日付・ステーション名: スマホでは縦並び、PCでは横並び */}
            <div className="flex flex-col md:flex-row md:items-center md:gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("text-xs md:text-sm font-semibold whitespace-nowrap", isNight ? "text-slate-100" : "text-foreground/80")}>{dateStr}</span>
                {/* モバイル: HH:MM、PC: HH:MM:SS */}
                <span className={cn("text-xs font-mono font-medium whitespace-nowrap tabular-nums md:hidden", isNight ? "text-[oklch(0.75_0.1_280)]" : "text-foreground/80")}>{timeStrShort}</span>
                <span className={cn("hidden md:inline text-xs font-mono font-medium whitespace-nowrap tabular-nums", isNight ? "text-[oklch(0.75_0.1_280)]" : "text-foreground/80")}>{timeStr}</span>
              </div>
              <span className={cn("hidden md:block text-xs font-medium border-l border-border pl-3 whitespace-nowrap", isNight ? "text-slate-200" : "text-foreground/75")}>こころの訪問看護ステーションひなた</span>
              <span className={cn("md:hidden font-semibold leading-tight whitespace-nowrap", isNight ? "text-slate-200" : "text-foreground")} style={{fontSize: "0.6rem"}}>こころの訪問看護ステーションひなた</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Instagramボタン */}
            <a
              href="https://www.instagram.com/kokoronohinata/"
              target="_blank"
              rel="noopener noreferrer"
              title="ヒナタ公式Instagramを開く"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors flex-shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "oklch(0.62 0.22 15)" }}
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <GlobalLoadingIndicator />
            {/* オフラインキュー件数バッジ */}
            {queueCount > 0 && (
              <div
                title={isFlushing ? "送信中...「" + queueCount + "件」" : "オフライン中に保存した操作: " + queueCount + "件"}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 text-xs font-semibold"
              >
                {isFlushing ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{queueCount}</span>
              </div>
            )}
            <NotificationDropdown />
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-white text-xs font-bold">{userInitial}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* チーム目標バー（常時固定表示） */}
        <TeamGoalsTicker />

        {/* ページコンテンツ（ボトムナビ分の余白） */}
        <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-orange-50/40 dark:bg-background main-content-safe md:pb-4">
          {children}
        </main>

        {/* 初回チーム設定モーダル */}
        <TeamSetupModal
          open={showTeamSetupModal}
          onComplete={(team?: string) => {
            setTeamSetupModalDismissed(true);
            if (team) setWelcomeTeam(team);
          }}
        />

        {/* チーム設定完了後ウェルカムモーダル */}
        <WelcomeModal
          open={showWelcomeModal}
          teamName={welcomeTeam ?? ""}
          userName={user?.name ?? undefined}
          onClose={() => setWelcomeTeam(null)}
        />

        {/* AI共有プロンプトモーダル */}
        <AISharedPromptsModal
          open={showAIPromptsModal}
          onClose={() => setShowAIPromptsModal(false)}
        />

        {/* 月次残業確認・署名モーダル */}
        <Dialog open={showMonthlyOvertimeModal} onOpenChange={setShowMonthlyOvertimeModal}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                月次残業確認・署名
              </DialogTitle>
              <DialogDescription>
                今月の残業時間を確認し、署名してください。
              </DialogDescription>
            </DialogHeader>
            <MonthlyOvertimeSignature />
          </DialogContent>
        </Dialog>

        {/* ========== ボトムナビゲーションバー（モバイル・ PC共通） ========== */}        <nav className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t border-sidebar-border bottom-nav-safe bg-sidebar",
          isNight ? "shadow-[0_-2px_12px_rgba(0,0,0,0.3)]" : "shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
        )}>
          <div className="flex items-stretch h-[60px] max-w-screen-sm mx-auto md:max-w-none">
            {bottomNavItems.map((item) => {
              const isActive = item.type === "internal" && location === item.href;

              if (item.type === "external") {
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent", WebkitTouchCallout: "none" }}
                    onPointerDown={() => { try { navigator.vibrate?.(8); } catch {} }}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors select-none",
                      isNight ? "text-slate-200 active:text-primary active:scale-95" : "text-muted-foreground active:text-primary active:scale-95"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-xs font-medium whitespace-nowrap">{item.label}</span>
                  </a>
                );
              }

              const badgeCount = item.badge && item.href === "/minutes" ? (minutesUnchecked?.count ?? 0) : 0;
              const showMonthlySignatureDot = !!(item as any).monthlySignatureBadge && isMonthlySignatureUnsigned;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent", WebkitTouchCallout: "none" }}
                  onPointerDown={(e) => {
                    // スクロール判定用にタッチ開始Y座標を記録
                    if (e.pointerType === 'touch') {
                      touchStartYRef.current = e.clientY;
                      isScrollingRef.current = false;
                    }
                    try { navigator.vibrate?.(8); } catch {}
                    // アクティブなタブを再タップしたらページ最上部へスクロール
                    if (isActive) {
                      e.preventDefault();
                      const mainEl = document.querySelector('main.main-content-safe');
                      if (mainEl) {
                        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                      } else {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }
                  }}
                  onPointerMove={(e) => {
                    // 10px以上移動したらスクロール中フラグを立てる
                    if (e.pointerType === 'touch' && touchStartYRef.current !== null) {
                      if (Math.abs(e.clientY - touchStartYRef.current) > 10) {
                        isScrollingRef.current = true;
                      }
                    }
                  }}
                  onClick={(e) => {
                    // スクロール中はナビゲーションをキャンセル
                    if (isScrollingRef.current) {
                      e.preventDefault();
                      isScrollingRef.current = false;
                      return;
                    }
                  }}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative select-none active:scale-95",
                    isActive ? "text-primary" : isNight ? "text-slate-200 active:text-primary" : "text-muted-foreground active:text-primary"
                  )}
                >
                  <div className="relative">
                    <item.icon className={cn("w-5 h-5", isActive && "scale-110")} />
                    {isActive && !showMonthlySignatureDot && (
                      <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                    {!isActive && badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                    {showMonthlySignatureDot && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-sidebar" />
                    )}
                  </div>
                  <span className={cn("text-xs whitespace-nowrap", isActive ? "font-bold" : "font-medium")}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

      </div>

      {/* ========== 通知設定ダイアログ ========== */}
      <Dialog open={notifDialogOpen} onOpenChange={setNotifDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              プッシュ通知設定
            </DialogTitle>
            <DialogDescription>
              スケジュールが更新されたときに通知を受け取るチームを選んでください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* iOSでPWA未インストールの場合の警告 */}
            {isIOS && !isIOSPWA && (
              <div className="flex flex-col gap-1.5 px-3 py-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg text-sm text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                <p className="font-semibold">⚠️ iPhoneでの通知設定について</p>
                <p className="text-xs leading-relaxed">
                  iPhoneでプッシュ通知を受け取るには、まず「ホーム画面に追加」が必要です。
                </p>
                <ol className="text-xs leading-relaxed list-decimal list-inside space-y-1">
                  <li>Safariの共有ボタン（中央下の四角矢印）をタップ</li>
                  <li>「ホーム画面に追加」を選択</li>
                  <li>追加後、ホーム画面の「ひなた」アイコンから起動</li>
                  <li>再度この画面で通知を有効に</li>
                </ol>
              </div>
            )}
            {/* 現在の状態表示 */}
            {isSubscribed && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-sm text-emerald-700 dark:text-emerald-400">
                <Bell className="w-4 h-4 fill-emerald-500" />
                通知は現在オンになっています
              </div>
            )}
            {/* 通知がブロックされている場合の警告 */}
            {pushPermission === "denied" && (
              <div className="flex flex-col gap-1 px-3 py-2 bg-red-50 dark:bg-red-900/30 rounded-lg text-sm text-red-700 dark:text-red-400">
                <p className="font-semibold">❌ 通知がブロックされています</p>
                <p className="text-xs">設定アプリ → 「Safari」 → 「通知」を「許可」に変更してから再度お試しください。</p>
              </div>
            )}

            {/* チーム選択 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">通知するチーム</label>
              <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="チームを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🔔 全チーム（すべての更新で通知）</SelectItem>
                  <SelectItem value="身体">📌 身体チームのみ</SelectItem>
                  <SelectItem value="天理">📌 天理チームのみ</SelectItem>
                  <SelectItem value="郡山北部">📌 郡山北部チームのみ</SelectItem>
                  <SelectItem value="郡山南部">📌 郡山南部チームのみ</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                「全チーム」を選ぶと、どのチームのスケジュールが更新されても通知が届きます。
              </p>
            </div>

            {/* ボタングループ */}
            <div className="flex gap-2 pt-1">
              <button
                onPointerDown={() => {}}
                onClick={async () => {
                  const filter = selectedTeamFilter === "all" ? null : selectedTeamFilter;
                  // iOS対応: ボタンクリック時に既に許可取得済みの場合はフラグを渡す
                  const alreadyGranted = "Notification" in window && Notification.permission === "granted";
                  await subscribe(filter, alreadyGranted);
                  setNotifDialogOpen(false);
                }}
                disabled={pushLoading}
                className="flex-1 bg-primary text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {pushLoading ? "処理中..." : isSubscribed ? "設定を更新" : "通知を有効にする"}
              </button>
              {isSubscribed && (
                <button
                  onClick={async () => {
                    await unsubscribe();
                    setNotifDialogOpen(false);
                  }}
                  disabled={pushLoading}
                  className="flex-1 border border-destructive text-destructive text-sm font-medium py-2 px-4 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  通知をオフにする
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
