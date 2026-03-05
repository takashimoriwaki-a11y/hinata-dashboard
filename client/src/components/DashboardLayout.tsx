/**
 * DashboardLayout - サイドバー付きレイアウト（PC・iPhone両対応レスポンシブ）
 * Design: ひなた公式ロゴ・ブランドカラー（オレンジ系）を使用した温かみのあるUI
 * PC: サイドバー（デフォルト折りたたみ）+ トップバー
 * iPhone: サイドバー非表示 + ボトムナビ固定
 */

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import DailyMessageBar from "./DailyMessageBar";
import { useTheme } from "@/contexts/ThemeContext";
import NotificationDropdown from "./NotificationDropdown";

// ロゴCDN URL
const LOGO_MARK_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_mark_bf1d0229.png";
const LOGO_TEXT_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_text_9eb540dd.svg";

// ========== ナビゲーション定義 ==========
const navItems = [
  { href: "/", icon: LayoutDashboard, label: "ホーム" },
  { href: "/record", icon: ClipboardEdit, label: "記録" },
  { href: "/tasks", icon: CheckSquare, label: "タスク" },
];

const externalTools = [
  { label: "ZEST（スケジュール）", href: "https://homecare.zest.jp/login", icon: ExternalLink },
  { label: "iBow（電子カルテ）", href: "https://ibow.cloud/", icon: ExternalLink },
];

// ボトムナビゲーション（5タブ）
const bottomNavItems = [
  { type: "internal", href: "/", icon: LayoutDashboard, label: "ホーム" },
  { type: "internal", href: "/record", icon: ClipboardEdit, label: "記録" },
  { type: "internal", href: "/tasks", icon: CheckSquare, label: "タスク" },
  { type: "external", href: "https://homecare.zest.jp/login", icon: Calendar, label: "ZEST" },
  { type: "external", href: "https://ibow.cloud/", icon: ClipboardList, label: "iBow" },
] as const;

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  // モバイル用ドロワー開閉
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isNight } = useTheme();

  // ページ遷移時にモバイルドロワーを閉じる
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const today = new Date();
  const dateStr = today.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  // サイドバー内容（PC・モバイル共通）
  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {/* ロゴエリア */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border py-3",
        (collapsed && !mobile) ? "justify-center px-0" : "gap-2 px-4"
      )}>
        <img src={LOGO_MARK_URL} alt="ひなた" className="w-9 h-9 object-contain flex-shrink-0" />
        {(!collapsed || mobile) && (
          <div className="overflow-hidden flex flex-col gap-0.5">
            <p className="text-[9px] text-sidebar-foreground/50 leading-tight">こころの訪問看護ステーション</p>
            <img src={LOGO_TEXT_URL} alt="ひなた" className="h-5 object-contain object-left" />
          </div>
        )}
        {mobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto text-sidebar-foreground/60 hover:text-sidebar-foreground p-1"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ユーザー情報 */}
      {(!collapsed || mobile) && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <Avatar className="w-9 h-9 flex-shrink-0">
              <AvatarFallback className="bg-primary text-white text-sm font-bold">崇</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">森脇 崇</p>
              <p className="text-[11px] text-sidebar-foreground/60 truncate">統括所長・看護師</p>
            </div>
          </div>
        </div>
      )}

      {/* ナビゲーション */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {(!collapsed || mobile) && (
          <p className="px-4 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-1">
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
                  "flex items-center gap-3 py-3 mx-2 rounded-lg transition-all duration-150",
                  "text-sm font-medium",
                  (collapsed && !mobile) ? "justify-center px-0" : "px-3",
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
              </div>
            </Link>
          );
        })}

        {(!collapsed || mobile) && (
          <p className="px-4 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider mt-4 mb-1">
            外部ツール
          </p>
        )}
        {externalTools.map((tool) => (
          <a
            key={tool.label}
            href={tool.href}
            target="_blank"
            rel="noopener noreferrer"
            title={(collapsed && !mobile) ? tool.label : undefined}
            className={cn(
              "flex items-center gap-3 py-3 mx-2 rounded-lg transition-all duration-150",
              "text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              (collapsed && !mobile) ? "justify-center px-0" : "px-3"
            )}
          >
            <tool.icon className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || mobile) && <span className="truncate">{tool.label}</span>}
          </a>
        ))}
      </nav>

      {/* ボトムアクション */}
      <div className="border-t border-sidebar-border py-2">
        <button
          onClick={() => toast.info("通知設定は準備中です")}
          title={(collapsed && !mobile) ? "通知設定" : undefined}
          className={cn(
            "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
            "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            (collapsed && !mobile) ? "justify-center px-0" : "px-3"
          )}
        >
          <Bell className="w-4 h-4 flex-shrink-0" />
          {(!collapsed || mobile) && <span>通知設定</span>}
        </button>
        <Link href="/admin">
          <div
            title={(collapsed && !mobile) ? "管理画面" : undefined}
            className={cn(
              "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
              "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              (collapsed && !mobile) ? "justify-center px-0" : "px-3",
              location === "/admin" && "bg-primary text-white"
            )}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {(!collapsed || mobile) && <span>管理画面</span>}
          </div>
        </Link>
        <button
          onClick={() => toast.info("ログアウト機能は準備中です")}
          title={(collapsed && !mobile) ? "ログアウト" : undefined}
          className={cn(
            "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
            "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            (collapsed && !mobile) ? "justify-center px-0" : "px-3"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(!collapsed || mobile) && <span>ログアウト</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ========== PC用サイドバー（md以上で表示） ========== */}
      <aside
        className={cn(
          "relative hidden md:flex flex-col h-full transition-all duration-300 ease-in-out z-30 flex-shrink-0",
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
          collapsed ? "w-[60px]" : "w-56"
        )}
      >
        <SidebarContent />

        {/* 折りたたみトグルボタン */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute -right-3 top-[68px] z-40",
            "w-6 h-6 rounded-full bg-white border border-border shadow-md",
            "flex items-center justify-center",
            "text-muted-foreground hover:text-primary hover:shadow-lg transition-all duration-200"
          )}
          title={collapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronLeft className="w-3.5 h-3.5" />
          }
        </button>
      </aside>

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
          "fixed top-0 left-0 h-full z-50 flex flex-col w-72",
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
          "transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent mobile />
      </aside>

      {/* ========== メインコンテンツエリア ========== */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* ========== 今日の一言バー ========== */}
        <DailyMessageBar />

        {/* トップヘッダー */}
        <header className={cn(
          "flex items-center justify-between px-3 md:px-4 py-2.5 border-b border-border shadow-sm flex-shrink-0",
          isNight ? "bg-[oklch(0.35_0.015_250)]" : "bg-white"
        )}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {/* モバイル: ハンバーガーメニュー */}
            <button
              className="md:hidden text-muted-foreground hover:text-primary p-1 -ml-1 flex-shrink-0"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* ロゴマーク */}
            <img src={LOGO_MARK_URL} alt="ひなた" className="w-7 h-7 object-contain flex-shrink-0" />
            {/* 日付・ステーション名: スマホでは縦並び、PCでは横並び */}
            <div className="flex flex-col md:flex-row md:items-center md:gap-3 min-w-0">
              <span className="text-xs md:text-sm text-muted-foreground font-medium whitespace-nowrap">{dateStr}</span>
              <span className="hidden md:block text-xs text-muted-foreground/70 font-medium border-l border-border pl-3 whitespace-nowrap">こころの訪問看護ステーションひなた</span>
              <span className="md:hidden text-[10px] text-muted-foreground/60 font-medium leading-tight whitespace-nowrap">こころの訪問看護ステーションひなた</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <NotificationDropdown />
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-white text-xs font-bold">崇</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* ページコンテンツ（ボトムナビ分の余白） */}
        <main className="flex-1 overflow-y-auto bg-background pb-20 md:pb-4">
          {children}
        </main>

        {/* ========== ボトムナビゲーションバー（モバイル・PC共通） ========== */}
        <nav className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t border-border",
          isNight
            ? "bg-[oklch(0.35_0.015_250)] shadow-[0_-2px_12px_rgba(0,0,0,0.3)]"
            : "bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
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
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                      "text-muted-foreground hover:text-primary active:scale-95"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </a>
                );
              }

              return (
                <Link key={item.label} href={item.href} className="flex-1">
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 transition-all h-full w-full active:scale-95",
                      isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                    )}
                  >
                    <div className="relative">
                      <item.icon className={cn("w-5 h-5", isActive && "scale-110")} />
                      {isActive && (
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className={cn("text-[10px]", isActive ? "font-bold" : "font-medium")}>
                      {item.label}
                    </span>
                    {isActive && (
                      <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

      </div>
    </div>
  );
}
