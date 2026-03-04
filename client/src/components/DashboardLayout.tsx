/**
 * DashboardLayout - サイドバー付きレイアウト
 * Design: ひなた公式ロゴ・ブランドカラー（オレンジ #E8845A系）を使用した温かみのあるUI
 * Sidebar: デフォルト折りたたみ（アイコンのみ）、ボタンで展開
 * BottomNav: ホーム / 記録 / ZEST / iBow / タスク
 */

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ロゴCDN URL
const LOGO_MARK_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_mark_bf1d0229.png";
const LOGO_TEXT_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_text_9eb540dd.svg";

// ========== ナビゲーション定義 ==========
// 訪問スケジュール・利用者一覧はサイドバーから削除
const navItems = [
  { href: "/", icon: LayoutDashboard, label: "ホーム" },
  { href: "/record", icon: ClipboardEdit, label: "記録" },
  { href: "/tasks", icon: CheckSquare, label: "タスク" },
];

const externalTools = [
  { label: "iBow（電子カルテ）", href: "https://ibow.cloud/", icon: ExternalLink },
  { label: "ZEST（スケジュール）", href: "https://zest.jp/", icon: ExternalLink },
];

// ボトムナビゲーション（5タブ）
const bottomNavItems = [
  { type: "internal", href: "/", icon: LayoutDashboard, label: "ホーム" },
  { type: "internal", href: "/record", icon: ClipboardEdit, label: "記録" },
  { type: "external", href: "https://zest.jp/", icon: Calendar, label: "ZEST" },
  { type: "external", href: "https://ibow.cloud/", icon: ClipboardList, label: "iBow" },
  { type: "internal", href: "/tasks", icon: CheckSquare, label: "タスク" },
] as const;

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  // デフォルト折りたたみ（true = 折りたたみ状態）
  const [collapsed, setCollapsed] = useState(true);

  const today = new Date();
  const dateStr = today.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ========== サイドバー ========== */}
      <aside
        className={cn(
          "relative flex flex-col h-full transition-all duration-300 ease-in-out z-30 flex-shrink-0",
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
          collapsed ? "w-[60px]" : "w-56"
        )}
      >
        {/* ロゴエリア */}
        <div
          className={cn(
            "flex items-center border-b border-sidebar-border py-3",
            collapsed ? "justify-center px-0" : "gap-2 px-3"
          )}
        >
          <img
            src={LOGO_MARK_URL}
            alt="ひなた"
            className="w-9 h-9 object-contain flex-shrink-0"
          />
          {!collapsed && (
            <div className="overflow-hidden flex flex-col gap-0.5">
              <p className="text-[9px] text-sidebar-foreground/50 leading-tight">こころの訪問看護ステーション</p>
              <img
                src={LOGO_TEXT_URL}
                alt="ひなた"
                className="h-5 object-contain object-left"
              />
            </div>
          )}
        </div>

        {/* ユーザー情報 */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="bg-primary text-white text-xs font-bold">崇</AvatarFallback>
              </Avatar>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">森脇 崇</p>
                <p className="text-[10px] text-sidebar-foreground/60 truncate">統括所長・看護師</p>
              </div>
            </div>
          </div>
        )}

        {/* ナビゲーション */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {!collapsed && (
            <p className="px-4 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-1">
              メニュー
            </p>
          )}
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 py-2.5 mx-2 rounded-lg transition-all duration-150",
                    "text-sm font-medium",
                    collapsed ? "justify-center px-0" : "px-3",
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}

          {!collapsed && (
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
              title={collapsed ? tool.label : undefined}
              className={cn(
                "flex items-center gap-3 py-2.5 mx-2 rounded-lg transition-all duration-150",
                "text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                collapsed ? "justify-center px-0" : "px-3"
              )}
            >
              <tool.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{tool.label}</span>}
            </a>
          ))}
        </nav>

        {/* ボトムアクション */}
        <div className="border-t border-sidebar-border py-2">
          <button
            onClick={() => toast.info("通知設定は準備中です")}
            title={collapsed ? "通知設定" : undefined}
            className={cn(
              "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
              "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed ? "justify-center px-0" : "px-3"
            )}
          >
            <Bell className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>通知設定</span>}
          </button>
          <a
            href="/admin"
            onClick={(e) => { e.preventDefault(); toast.info("管理画面は準備中です"); }}
            title={collapsed ? "管理画面" : undefined}
            className={cn(
              "flex items-center gap-3 py-2.5 mx-2 rounded-lg transition-all duration-150",
              "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed ? "justify-center px-0" : "px-3"
            )}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>管理画面</span>}
          </a>
          <button
            onClick={() => toast.info("ログアウト機能は準備中です")}
            title={collapsed ? "ログアウト" : undefined}
            className={cn(
              "flex items-center gap-3 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
              "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed ? "justify-center px-0" : "px-3"
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>ログアウト</span>}
          </button>
        </div>

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

      {/* ========== メインコンテンツエリア ========== */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* トップヘッダー */}
        <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-border shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* ロゴマーク（折りたたみ時の補助） */}
            <img src={LOGO_MARK_URL} alt="ひなた" className="w-7 h-7 object-contain" />
            <span className="text-sm text-muted-foreground font-medium hidden sm:block">{dateStr}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative text-muted-foreground">
              <Bell className="w-4 h-4" />
              <Badge className="absolute -top-1 -right-1 w-4 h-4 p-0 text-[9px] bg-primary text-white flex items-center justify-center">
                3
              </Badge>
            </Button>
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-white text-xs font-bold">崇</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* ページコンテンツ（ボトムナビ分の余白） */}
        <main className="flex-1 overflow-y-auto bg-background pb-16">
          {children}
        </main>

        {/* ========== ボトムナビゲーションバー ========== */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
          <div className="flex items-stretch h-16">
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
                      "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                      "text-muted-foreground hover:text-primary"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </a>
                );
              }

              return (
                <Link key={item.label} href={item.href}>
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 transition-colors h-full px-2 w-full",
                      isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                    )}
                  >
                    <div className="relative">
                      <item.icon className="w-5 h-5" />
                      {isActive && (
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className={cn("text-[10px] font-medium", isActive && "font-bold")}>
                      {item.label}
                    </span>
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
