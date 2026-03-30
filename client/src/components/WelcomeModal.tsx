/**
 * WelcomeModal - チーム設定完了後に表示するウェルカムメッセージ
 * 初回ログイン時、チームを設定した直後に表示される
 */

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WelcomeModalProps {
  open: boolean;
  teamName: string;
  userName?: string;
  onClose: () => void;
}

const TEAM_EMOJI: Record<string, string> = {
  身体: "💚",
  天理: "💙",
  郡山北部: "🧡",
  郡山南部: "💜",
  事務員: "🩶",
  全チーム: "❤️",
};

const TEAM_COLOR: Record<string, string> = {
  身体: "from-[#4CAF82]/20 to-[#4CAF82]/5 border-[#4CAF82]/30",
  天理: "from-[#4A90D9]/20 to-[#4A90D9]/5 border-[#4A90D9]/30",
  郡山北部: "from-[#E8A838]/20 to-[#E8A838]/5 border-[#E8A838]/30",
  郡山南部: "from-[#C06BC0]/20 to-[#C06BC0]/5 border-[#C06BC0]/30",
  事務員: "from-gray-400/20 to-gray-400/5 border-gray-400/30",
  全チーム: "from-[#E85C5C]/20 to-[#E85C5C]/5 border-[#E85C5C]/30",
};

const GUIDE_ITEMS = [
  {
    icon: "🏠",
    title: "ホーム",
    desc: "訪問スケジュールや業務ツールへのクイックアクセス",
  },
  {
    icon: "📋",
    title: "事故",
    desc: "ヒヤリハット・アクシデントの報告と管理",
  },
  {
    icon: "📖",
    title: "護誌",
    desc: "利用者の記録と次回訪問日時の管理",
  },
  {
    icon: "✅",
    title: "記録",
    desc: "病状の経過記録とスプレッドシートへの転送",
  },
  {
    icon: "🔄",
    title: "変更連絡",
    desc: "訪問スケジュールの変更をチームへ共有",
  },
];

export function WelcomeModal({ open, teamName, userName, onClose }: WelcomeModalProps) {
  const emoji = TEAM_EMOJI[teamName] ?? "🌸";
  const colorClass = TEAM_COLOR[teamName] ?? "from-primary/20 to-primary/5 border-primary/30";

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm mx-auto rounded-2xl p-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* ヘッダー */}
        <div className={`bg-gradient-to-b ${colorClass} border-b px-6 pt-6 pb-5 text-center`}>
          <div className="text-5xl mb-3 animate-bounce">{emoji}</div>
          <h2 className="text-xl font-bold text-foreground">
            ようこそ、ひなたへ！
          </h2>
          {userName && (
            <p className="text-sm text-muted-foreground mt-1">
              {userName} さん
            </p>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 bg-background/70 rounded-full px-3 py-1.5 text-sm font-semibold">
            <span>{emoji}</span>
            <span>{teamName} チームに参加しました</span>
          </div>
        </div>

        {/* 使い方ガイド */}
        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            アプリの使い方
          </p>
          <div className="space-y-2.5">
            {GUIDE_ITEMS.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 pb-5">
          <p className="text-xs text-center text-muted-foreground mb-3">
            チームや権限は管理者が変更できます。
            <br />
            困ったことがあれば管理者へご連絡ください。
          </p>
          <Button
            className="w-full h-11 text-base font-bold"
            onClick={onClose}
          >
            はじめる 🌸
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
