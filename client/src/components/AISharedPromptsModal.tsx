/**
 * AISharedPromptsModal
 * 全職員が共有できるAIプロンプト集（Gemini / Gem / NotebookLM 等）
 * - 一覧表示・コピー・新規追加・修正・削除
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const AI_TOOLS = ["Gemini", "Gem", "NotebookLM", "その他"] as const;

const AI_TOOL_COLORS: Record<string, string> = {
  Gemini: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Gem: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  NotebookLM: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  その他: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PromptItem {
  id: number;
  title: string;
  body: string;
  aiTool: string;
  category: string | null;
  createdByName: string;
  updatedByName: string | null;
  createdAt: Date;
}

export default function AISharedPromptsModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();

  // 一覧取得
  const { data: prompts = [], isLoading } = trpc.sharedPrompts.getAll.useQuery(undefined, {
    enabled: open,
  });

  // 新規作成
  const createMutation = trpc.sharedPrompts.create.useMutation({
    onSuccess: () => {
      utils.sharedPrompts.getAll.invalidate();
      toast.success("プロンプトを追加しました");
      setShowForm(false);
      resetForm();
    },
    onError: () => toast.error("追加に失敗しました"),
  });

  // 更新
  const updateMutation = trpc.sharedPrompts.update.useMutation({
    onSuccess: () => {
      utils.sharedPrompts.getAll.invalidate();
      toast.success("プロンプトを更新しました");
      setEditingId(null);
      resetForm();
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  // 削除
  const deleteMutation = trpc.sharedPrompts.delete.useMutation({
    onSuccess: () => {
      utils.sharedPrompts.getAll.invalidate();
      toast.success("プロンプトを削除しました");
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  // フォームstate
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formAiTool, setFormAiTool] = useState<string>("Gemini");
  const [formCategory, setFormCategory] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterTool, setFilterTool] = useState<string>("すべて");

  function resetForm() {
    setFormTitle("");
    setFormBody("");
    setFormAiTool("Gemini");
    setFormCategory("");
  }

  function startEdit(p: PromptItem) {
    setEditingId(p.id);
    setFormTitle(p.title);
    setFormBody(p.body);
    setFormAiTool(p.aiTool);
    setFormCategory(p.category ?? "");
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  async function handleCopy(p: PromptItem) {
    try {
      await navigator.clipboard.writeText(p.body);
      setCopiedId(p.id);
      toast.success("プロンプトをコピーしました");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  }

  function handleSubmit() {
    if (!formTitle.trim() || !formBody.trim()) {
      toast.error("タイトルと本文は必須です");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({
        id: editingId,
        title: formTitle.trim(),
        body: formBody.trim(),
        aiTool: formAiTool,
        category: formCategory.trim() || undefined,
      });
    } else {
      createMutation.mutate({
        title: formTitle.trim(),
        body: formBody.trim(),
        aiTool: formAiTool,
        category: formCategory.trim() || undefined,
      });
    }
  }

  const filteredPrompts = filterTool === "すべて"
    ? (prompts as PromptItem[])
    : (prompts as PromptItem[]).filter((p) => p.aiTool === filterTool);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
        {/* ヘッダー */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="w-5 h-5 text-amber-500" />
            AI共有プロンプト
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gemini・Gem・NotebookLM などで使えるプロンプトを全職員で共有できます
          </p>
        </DialogHeader>

        {/* フィルター + 追加ボタン */}
        <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0 border-b border-border bg-muted/30">
          <div className="flex gap-1.5 flex-wrap flex-1">
            {["すべて", ...AI_TOOLS].map((tool) => (
              <button
                key={tool}
                onClick={() => setFilterTool(tool)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                  filterTool === tool
                    ? "bg-primary text-white shadow-sm"
                    : "bg-background border border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {tool}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              setEditingId(null);
              resetForm();
            }}
            className="flex-shrink-0 gap-1"
          >
            <Plus className="w-4 h-4" />
            追加
          </Button>
        </div>

        {/* 新規追加フォーム */}
        {showForm && (
          <div className="px-5 py-4 border-b border-border bg-amber-50/50 dark:bg-amber-950/20 flex-shrink-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-3">新しいプロンプトを追加</p>
            <PromptForm
              title={formTitle}
              body={formBody}
              aiTool={formAiTool}
              category={formCategory}
              onTitleChange={setFormTitle}
              onBodyChange={setFormBody}
              onAiToolChange={setFormAiTool}
              onCategoryChange={setFormCategory}
              onSubmit={handleSubmit}
              onCancel={() => { setShowForm(false); resetForm(); }}
              isLoading={createMutation.isPending}
              submitLabel="追加する"
            />
          </div>
        )}

        {/* 一覧 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {isLoading && (
            <div className="text-center text-sm text-muted-foreground py-8">読み込み中...</div>
          )}
          {!isLoading && filteredPrompts.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              プロンプトがまだありません。「追加」ボタンから登録してください。
            </div>
          )}
          {filteredPrompts.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card overflow-hidden">
              {editingId === p.id ? (
                /* 編集フォーム */
                <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-3">プロンプトを編集</p>
                  <PromptForm
                    title={formTitle}
                    body={formBody}
                    aiTool={formAiTool}
                    category={formCategory}
                    onTitleChange={setFormTitle}
                    onBodyChange={setFormBody}
                    onAiToolChange={setFormAiTool}
                    onCategoryChange={setFormCategory}
                    onSubmit={handleSubmit}
                    onCancel={cancelEdit}
                    isLoading={updateMutation.isPending}
                    submitLabel="更新する"
                  />
                </div>
              ) : (
                /* 通常表示 */
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            AI_TOOL_COLORS[p.aiTool] ?? AI_TOOL_COLORS["その他"]
                          )}
                        >
                          {p.aiTool}
                        </span>
                        {p.category && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {p.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground leading-snug">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.updatedByName
                          ? `${p.createdByName} 作成 / ${p.updatedByName} 更新`
                          : `${p.createdByName} 作成`}
                      </p>
                    </div>
                    {/* アクションボタン */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleCopy(p)}
                        title="プロンプトをコピー"
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {copiedId === p.id
                          ? <Check className="w-4 h-4 text-emerald-500" />
                          : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEdit(p)}
                        title="編集"
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`「${p.title}」を削除しますか？`)) {
                            deleteMutation.mutate({ id: p.id });
                          }
                        }}
                        title="削除"
                        className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        title={expandedId === p.id ? "折りたたむ" : "本文を表示"}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {expandedId === p.id
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {/* 本文（展開時） */}
                  {expandedId === p.id && (
                    <div className="mt-2 p-3 rounded-md bg-muted/50 text-sm text-foreground whitespace-pre-wrap leading-relaxed border border-border/50">
                      {p.body}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>閉じる</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== フォームコンポーネント ==========
interface PromptFormProps {
  title: string;
  body: string;
  aiTool: string;
  category: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onAiToolChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  submitLabel: string;
}

function PromptForm({
  title, body, aiTool, category,
  onTitleChange, onBodyChange, onAiToolChange, onCategoryChange,
  onSubmit, onCancel, isLoading, submitLabel,
}: PromptFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">タイトル <span className="text-red-500">*</span></label>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="例：訪問看護記録の要約"
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">対象AIツール</label>
          <Select value={aiTool} onValueChange={onAiToolChange}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_TOOLS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">カテゴリ（任意）</label>
        <Input
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          placeholder="例：記録作成、申請書類、利用者対応"
          className="text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">プロンプト本文 <span className="text-red-500">*</span></label>
        <Textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="AIへの指示内容を入力してください..."
          rows={5}
          className="text-sm resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>
          <X className="w-3.5 h-3.5 mr-1" />
          キャンセル
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isLoading}>
          <Check className="w-3.5 h-3.5 mr-1" />
          {isLoading ? "処理中..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
