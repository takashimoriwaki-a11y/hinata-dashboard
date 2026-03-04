/**
 * DashboardLayout - サイドバー付きレイアウト
 * Design: 温かみのある和モダン・ケアUI
 * Sidebar: 深みのある温かいスレート (#1e293b相当)
 * Primary accent: ひなたオレンジ
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ClipboardEdit,
  Users,
  Calendar,
  CheckSquare,
  ExternalLink,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "ダッシュボード" },
  { href: "/record", icon: ClipboardEdit, label: "記録入力" },
  { href: "/patients", icon: Users, label: "利用者一覧" },
  { href: "/schedule", icon: Calendar, label: "訪問スケジュール" },
  { href: "/tasks", icon: CheckSquare, label: "タスク" },
];

const externalTools = [
  { label: "iBow（電子カルテ）", href: "https://ibow.cloud/", icon: ExternalLink },
  { label: "ZEST（スケジュール）", href: "https://zest.jp/", icon: ExternalLink },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const today = new Date();
  const dateStr = today.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col h-full transition-all duration-300 ease-in-out z-30",
          "bg-sidebar text-sidebar-foreground",
          sidebarOpen ? "w-56" : "w-16"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Sun className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-[10px] text-sidebar-foreground/60 leading-tight">こころの訪問看護</p>
              <p className="text-sm font-bold text-sidebar-foreground leading-tight">ひなた</p>
            </div>
          )}
        </div>

        {/* User info */}
        {sidebarOpen && (
          <div className="px-4 py-3 border-b border-sidebar-border">
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

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {sidebarOpen && (
            <p className="px-4 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-1">
              メニュー
            </p>
          )}
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all duration-150",
                    "text-sm font-medium",
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}

          {sidebarOpen && (
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
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all duration-150",
                "text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <tool.icon className="w-4 h-4 flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{tool.label}</span>}
            </a>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-sidebar-border py-2">
          <button
            onClick={() => toast.info("通知設定は準備中です")}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
              "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Bell className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>通知設定</span>}
          </button>
          <a
            href="/admin"
            onClick={(e) => { e.preventDefault(); toast.info("管理画面は準備中です"); }}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all duration-150",
              "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>管理画面</span>}
          </a>
          <button
            onClick={() => toast.info("ログアウト機能は準備中です")}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg w-[calc(100%-16px)] transition-all duration-150",
              "text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>ログアウト</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top header */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-border shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-muted-foreground"
            >
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
            <span className="text-sm text-muted-foreground font-medium">{dateStr}</span>
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
