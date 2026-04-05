/**
 * VoiceHelpDialog
 *
 * 音声入力の話しかけ例を表示するモーダルダイアログ。
 * 各画面の音声入力カードに「？」ボタンとして配置する。
 */

import { useState } from "react";
import { HelpCircle, Mic, Volume2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type VoiceHelpMode = "task" | "message" | "record" | "schedule";

interface VoiceHelpDialogProps {
  mode: VoiceHelpMode;
  className?: string;
}

const helpContent: Record<
  VoiceHelpMode,
  {
    title: string;
    description: string;
    examples: { label: string; text: string }[];
    tips: string[];
  }
> = {
  task: {
    title: "タスク作成の話しかけ方",
    description: "マイクをタップして、タスクの内容を話しかけてください。AIが自動的に各項目に転記します。",
    examples: [
      { label: "例文", text: "○○チームの○○さん、×月×日に自立支援医療の受給者証の写真を撮る" },
      { label: "全員向け", text: "全員に今週中に研修資料を確認してもらう" },
      { label: "繰り返し", text: "毎週月曜日に申し送りシートを更新する" },
      { label: "個人タスク", text: "自分で来月 15日までに請求書を確認する" },
    ],
    tips: [
      "チーム名（郡山南部・天理・身体など）を含めると担当チームが自動設定されます",
      "日付表現：「明日」「明後日」「来週火曜」「再来週月曜」「今週金曜」「4月十六日」などが使えます",
      "「全員に」「全スタッフに」と言うと全体タスクになります",
      "「毎週○曜日」「毎月○日」と言うと繰り返し設定になります",
    ],
  },
  message: {
    title: "メッセージ作成の話しかけ方",
    description: "マイクをタップして、伝えたい内容を話しかけてください。AIが自動的に各項目に転記します。",
    examples: [
      { label: "例文", text: "○月○日から１週間は交通安全週間なので、安全運転を心がけましょう" },
      { label: "期間指定", text: "来週月曜から金曜まで、会議のため午前 10時から 12時は電話対応できません" },
      { label: "予約送信", text: "明日の朝 8時に送信して、今日の訪問件数を報告します" },
    ],
    tips: [
      "日時表現：「来週月曜の午後3時」「再来週火曜の午前10時半」「今週金曜の午後」などが使えます",
      "「○日から○日まで」と言うと表示期間が自動設定されます",
      "「○時に送信して」と言うと予約送信が設定されます",
      "重要な連絡は「重要」「緊急」と冠頭に付けると目立ちます",
    ],
  },
  record: {
    title: "訪問記録の話しかけ方",
    description: "マイクをタップして、訪問内容を話しかけてください。AIが自動的に各項目に転記します。",
    examples: [
      {
        label: "例文（次回訪問日時）",
        text: "○○チームの○○さん、次回訪問は明後日の×時×分、本人に口頭で伝えた。",
      },
      {
        label: "詳細",
        text: "身体チームの鈴木一郎さん、次回は 3月 20日午後 2時、家族に電話で連絡済み。今日は血圧が高めで 140の 90、頭痛の訴えあり、主治医に報告予定",
      },
      {
        label: "伝達方法",
        text: "天理チームの佐藤美子さん、次回訪問は明後日の午後 3時、カレンダーに記入しました",
      },
    ],
    tips: [
      "チーム名と利用者名を最初に言うと自動選択されます",
      "日時表現：「明日の14時」「来週火曜の午後3時」「再来週月曜の午前10時半」「今週金曜の午後」などが使えます",
      "「本人に」「家族に」「電話で」「口頭で」など伝達方法も認識します",
      "病状の経過は自由に話しかけてください",
    ],
  },
  schedule: {
    title: "変更連絡の話しかけ方",
    description: "マイクをタップして、スケジュール変更の内容を話しかけてください。AIが自動的に各項目に転記します。",
    examples: [
      {
        label: "例文",
        text: "○○チームの○○さん、次回の訪問は明後日の×時から×月×日の×時に変更。本人の受診のため。",
      },
      {
        label: "スタッフ変更",
        text: "天理チームの田中さんの担当を鈴木さんに変更、体調不良のため",
      },
      {
        label: "キャンセル",
        text: "身体チームの佐藤さんの今日の訪問をキャンセル、入院のため",
      },
      {
        label: "会議変更",
        text: "来週月曜の全体会議を火曜の午後 3時に変更、会場の都合のため",
      },
    ],
    tips: [
      "チーム名・利用者名・変更前後の日時を含めると精度が上がります",
      "日時表現：「明日の14時」「来週火曜の午後3時」「再来週月曜の午前10時半」「今週金曜の午後」などが使えます",
      "変更理由を「○○のため」と言うと理由欄に転記されます",
      "「キャンセル」「中止」「延期」などの変更種別も認識します",
    ],
  },
};

export function VoiceHelpDialog({ mode, className }: VoiceHelpDialogProps) {
  const [open, setOpen] = useState(false);
  const content = helpContent[mode];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center",
            "h-6 w-6 rounded-full",
            "text-muted-foreground hover:text-primary hover:bg-primary/10",
            "transition-colors duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            className
          )}
          aria-label="音声入力ヘルプ"
          title="話しかけ方のヒント"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mic className="w-4 h-4 text-primary" />
            {content.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 説明 */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {content.description}
          </p>

          {/* 話しかけ例 */}
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-primary" />
              話しかけの例
            </h3>
            <div className="space-y-2">
              {content.examples.map((ex, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-muted/60 border border-border px-3 py-2.5"
                >
                  <span className="text-[10px] font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5 mr-2">
                    {ex.label}
                  </span>
                  <p className="text-xs text-foreground leading-relaxed mt-1.5">
                    「{ex.text}」
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* コツ */}
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2">
              認識精度を上げるコツ
            </h3>
            <ul className="space-y-1.5">
              {content.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary text-xs mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 共通ヒント */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
              💡 iPhoneでは「Safari」または「Chrome」をご利用ください。マイクの使用許可が必要です。
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
