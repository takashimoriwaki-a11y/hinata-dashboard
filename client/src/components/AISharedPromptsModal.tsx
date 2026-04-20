/*
 * AISharedPromptsModal
 * 全職員が共有できるAIプロンプト集（Gemini / Gem / NotebookLM 等）
 * - 一覧表示・コピー・新規追加・修正・削除
 * - プロンプト本文に加えて「使い方」も保存・表示できる
 * - 管理者・特級管理者は上下ボタンで並び替えが可能
 *
 * 【dnd-kit完全除去】
 * useSortable() / SortableContext / DndContext を一切使わない。
 * 並び替えは上下ボタン（ChevronUp/ChevronDown）で実装。
 * React error #185 を根本解消。
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
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
  BookOpen,
  Camera,
  ArrowUp,
  ArrowDown,
  GripVertical,
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
  usageNotes: string | null;
  createdByName: string;
  updatedByName: string | null;
  createdAt: Date;
  sortOrder: number;
}

// ========== メインコンポーネント ==========
export default function AISharedPromptsModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // 一覧取得
  const { data: prompts = [], isLoading } = trpc.sharedPrompts.getAll.useQuery(undefined, {
    enabled: open,
  });

  // 並び替えモード（localOrderの前に定義する必要がある）
  const [isSortMode, setIsSortMode] = useState(false);

  // ローカルの並び順state（並び替えモード用）
  // currentPromptsKey（文字列）を依存配列に使うことで、参照の変化ではなく値の変化のみに反応し無限ループを防ぐ
  const [localOrder, setLocalOrder] = useState<PromptItem[]>([]);
  const currentPromptsKey = prompts.map((p) => p.id).join(",");
  useEffect(() => {
    if (!isSortMode) {
      setLocalOrder(prompts as PromptItem[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPromptsKey]);

  // プロンプト選択（スクショ用）
  const { data: selectedPromptIdData } = trpc.sharedPrompts.getSelectedId.useQuery(undefined, {
    enabled: open && isAdmin,
  });
  const setSelectedPromptIdMutation = trpc.sharedPrompts.setSelectedId.useMutation({
    onSuccess: () => {
      utils.sharedPrompts.getSelectedId.invalidate();
      toast.success("プロンプトを設定しました");
    },
    onError: (err) => toast.error(`設定エラー: ${err.message}`),
  });

  // 並び替え保存
  const reorderMutation = trpc.sharedPrompts.reorder.useMutation({
    onSuccess: () => {
      utils.sharedPrompts.getAll.invalidate();
      toast.success("並び順を保存しました");
      setIsSortMode(false);
    },
    onError: (err) => toast.error(`保存エラー: ${err.message}`),
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
  const [formUsageNotes, setFormUsageNotes] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterTool, setFilterTool] = useState<string>("すべて");

  function resetForm() {
    setFormTitle("");
    setFormBody("");
    setFormAiTool("Gemini");
    setFormCategory("");
    setFormUsageNotes("");
  }

  function startEdit(p: PromptItem) {
    setEditingId(p.id);
    setFormTitle(p.title);
    setFormBody(p.body);
    setFormAiTool(p.aiTool);
    setFormCategory(p.category ?? "");
    setFormUsageNotes(p.usageNotes ?? "");
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
        usageNotes: formUsageNotes.trim() || undefined,
      });
    } else {
      createMutation.mutate({
        title: formTitle.trim(),
        body: formBody.trim(),
        aiTool: formAiTool,
        category: formCategory.trim() || undefined,
        usageNotes: formUsageNotes.trim() || undefined,
      });
    }
  }

  // 上下ボタンによる並び替え
  function moveUp(index: number) {
    if (index === 0) return;
    setLocalOrder((items) => {
      const next = [...items];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setLocalOrder((items) => {
      if (index >= items.length - 1) return items;
      const next = [...items];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function handleSaveOrder() {
    reorderMutation.mutate({ orderedIds: localOrder.map((p) => p.id) });
  }

  function handleCancelSort() {
    setLocalOrder(prompts as PromptItem[]);
    setIsSortMode(false);
  }

  // 通常モード時のフィルタリング
  const filteredPrompts = filterTool === "すべて"
    ? localOrder
    : localOrder.filter((p) => p.aiTool === filterTool);

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

        {/* フィルター + 追加ボタン + 並び替えボタン */}
        <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0 border-b border-border bg-muted/30">
          {!isSortMode ? (
            <>
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
              <div className="flex gap-1.5 flex-shrink-0">
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsSortMode(true);
                      setShowForm(false);
                      setEditingId(null);
                      setExpandedId(null);
                    }}
                    className="gap-1 text-xs"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                    並び替え
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setShowForm(!showForm);
                    setEditingId(null);
                    resetForm();
                  }}
                  className="gap-1"
                >
                  <Plus className="w-4 h-4" />
                  追加
                </Button>
              </div>
            </>
          ) : (
            /* 並び替えモード時のヘッダー */
            <div className="flex items-center gap-2 w-full">
              <div className="flex items-center gap-1.5 flex-1">
                <GripVertical className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">並び替えモード</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">— ▲▼ボタンで順番を変更</span>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelSort}
                  disabled={reorderMutation.isPending}
                  className="gap-1 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                  キャンセル
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveOrder}
                  disabled={reorderMutation.isPending}
                  className="gap-1 text-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  {reorderMutation.isPending ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 一覧 + 追加フォーム（スクロール可能エリア） */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">

          {/* 新規追加フォーム */}
          {showForm && !isSortMode && (
            <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-4">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-3">新しいプロンプトを追加</p>
              <PromptForm
                title={formTitle}
                body={formBody}
                aiTool={formAiTool}
                category={formCategory}
                usageNotes={formUsageNotes}
                onTitleChange={setFormTitle}
                onBodyChange={setFormBody}
                onAiToolChange={setFormAiTool}
                onCategoryChange={setFormCategory}
                onUsageNotesChange={setFormUsageNotes}
                onSubmit={handleSubmit}
                onCancel={() => { setShowForm(false); resetForm(); }}
                isLoading={createMutation.isPending}
                submitLabel="追加する"
              />
            </div>
          )}

          {isLoading && (
            <div className="text-center text-sm text-muted-foreground py-8">読み込み中...</div>
          )}
          {!isLoading && filteredPrompts.length === 0 && !isSortMode && (
            <div className="text-center text-sm text-muted-foreground py-8">
              プロンプトがまだありません。「追加」ボタンから登録してください。
            </div>
          )}

          {/* 並び替えモード */}
          {isSortMode && localOrder.map((p, index) => (
            <div
              key={p.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div className="p-3 flex items-center gap-2">
                {/* 上下ボタン */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-muted-foreground hover:text-foreground"
                    title="上へ"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === localOrder.length - 1}
                    className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-muted-foreground hover:text-foreground"
                    title="下へ"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* プロンプト情報 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
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
                  <p className="text-sm font-semibold text-foreground leading-snug truncate">{p.title}</p>
                </div>
                {/* 順番表示 */}
                <span className="text-xs text-muted-foreground flex-shrink-0 w-6 text-center font-mono">
                  {index + 1}
                </span>
              </div>
            </div>
          ))}

          {/* 通常モード */}
          {!isSortMode && filteredPrompts.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card overflow-hidden">
              {editingId === p.id ? (
                <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-3">プロンプトを編集</p>
                  <PromptForm
                    title={formTitle}
                    body={formBody}
                    aiTool={formAiTool}
                    category={formCategory}
                    usageNotes={formUsageNotes}
                    onTitleChange={setFormTitle}
                    onBodyChange={setFormBody}
                    onAiToolChange={setFormAiTool}
                    onCategoryChange={setFormCategory}
                    onUsageNotesChange={setFormUsageNotes}
                    onSubmit={handleSubmit}
                    onCancel={cancelEdit}
                    isLoading={updateMutation.isPending}
                    submitLabel="更新する"
                  />
                </div>
              ) : (
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
                        {p.usageNotes && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            使い方あり
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
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-muted-foreground hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        title={expandedId === p.id ? "折りたたむ" : "本文・使い方を表示"}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {expandedId === p.id
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {expandedId === p.id && (
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">📋 プロンプト本文</p>
                        <div className="p-3 rounded-md bg-muted/50 text-sm text-foreground whitespace-pre-wrap leading-relaxed border border-border/50">
                          {p.body}
                        </div>
                      </div>
                      {p.usageNotes && (
                        <div>
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" />
                            使い方・説明
                          </p>
                          <div className="p-3 rounded-md bg-amber-50/70 dark:bg-amber-950/30 text-sm text-foreground whitespace-pre-wrap leading-relaxed border border-amber-200/50 dark:border-amber-800/50">
                            {p.usageNotes}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 管理者向け：スクショ用プロンプト選択（一番下） */}
          {isAdmin && !isSortMode && (
            <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                管理者設定：ボイスメモコピー用プロンプト選択
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">
                選択したプロンプトが「ボイスメモをNotebookLMに...」のコピーボタンで取得できます
              </p>
              <div className="space-y-1.5">
                <button
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                    !selectedPromptIdData?.promptId
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  )}
                  onClick={() => setSelectedPromptIdMutation.mutate({ promptId: null })}
                >
                  選択なし
                </button>
                {localOrder.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                      selectedPromptIdData?.promptId === p.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    )}
                    onClick={() => setSelectedPromptIdMutation.mutate({ promptId: p.id })}
                  >
                    <span className="font-medium">{p.title}</span>
                    {p.aiTool && (
                      <span className="ml-2 text-[10px] opacity-70">[{p.aiTool}]</span>
                    )}
                  </button>
                ))}
                {localOrder.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    AI共有プロンプトが登録されていません
                  </p>
                )}
              </div>
            </div>
          )}
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
  usageNotes: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onAiToolChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onUsageNotesChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  submitLabel: string;
}

function PromptForm({
  title, body, aiTool, category, usageNotes,
  onTitleChange, onBodyChange, onAiToolChange, onCategoryChange, onUsageNotesChange,
  onSubmit, onCancel, isLoading, submitLabel,
}: PromptFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">
            タイトル <span className="text-red-500">*</span>
          </label>
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
        <label className="text-xs font-medium text-foreground mb-1 block">
          プロンプト本文 <span className="text-red-500">*</span>
        </label>
        <Textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="AIへの指示内容を入力してください..."
          rows={5}
          className="text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-amber-600" />
          使い方・説明（任意）
        </label>
        <Textarea
          value={usageNotes}
          onChange={(e) => onUsageNotesChange(e.target.value)}
          placeholder="このプロンプトの使い方や注意点を入力してください"
          rows={3}
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
