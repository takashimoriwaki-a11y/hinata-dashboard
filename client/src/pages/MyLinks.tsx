/**
 * マイリンクページ
 * 個人用リンクの管理（追加・編集・削除）とGoogle Picker APIによるDriveファイル選択
 * バックエンドOAuthリダイレクト方式（iOSのPWA対応）
 * フォルダ展開ブラウザ機能（共有ドライブ対応）
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Link as LinkIcon,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  FolderOpen,
  Star,
  ChevronRight,
  Folder,
  BookmarkPlus,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

// 環境変数
const PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined;

// MIMEタイプからアイコン・ラベルを取得
function getMimeInfo(mimeType: string): { emoji: string; label: string } {
  if (mimeType === "application/vnd.google-apps.spreadsheet") return { emoji: "📊", label: "スプレッドシート" };
  if (mimeType === "application/vnd.google-apps.document") return { emoji: "📄", label: "ドキュメント" };
  if (mimeType === "application/vnd.google-apps.presentation") return { emoji: "📑", label: "スライド" };
  if (mimeType === "application/vnd.google-apps.folder") return { emoji: "📁", label: "フォルダ" };
  if (mimeType === "application/vnd.google-apps.form") return { emoji: "📝", label: "フォーム" };
  if (mimeType.startsWith("image/")) return { emoji: "🖼️", label: "画像" };
  if (mimeType === "application/pdf") return { emoji: "📕", label: "PDF" };
  return { emoji: "🔗", label: "ファイル" };
}

// Google APIスクリプトを動的ロード
function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

// パンくずリストのアイテム
interface BreadcrumbItem {
  id: string;
  name: string;
  driveId?: string;
}

// フォルダブラウザダイアログ
function FolderBrowserDialog({
  open,
  onClose,
  initialFolder,
  onSelectFile,
}: {
  open: boolean;
  onClose: () => void;
  initialFolder: { id: string; name: string; driveId?: string } | null;
  onSelectFile: (file: { id: string; name: string; mimeType: string; webViewLink: string }) => void;
}) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>("");
  const [currentDriveId, setCurrentDriveId] = useState<string | undefined>(undefined);

  // ダイアログが開いたとき初期フォルダをセット
  useEffect(() => {
    if (open && initialFolder) {
      setCurrentFolderId(initialFolder.id);
      setCurrentDriveId(initialFolder.driveId);
      setBreadcrumbs([{ id: initialFolder.id, name: initialFolder.name, driveId: initialFolder.driveId }]);
    }
  }, [open, initialFolder]);

  const { data, isLoading, error } = trpc.myLinks.listDriveFolder.useQuery(
    { folderId: currentFolderId, driveId: currentDriveId },
    { enabled: open && !!currentFolderId, retry: false }
  );

  const navigateToFolder = (folder: { id: string; name: string; mimeType: string }) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name, driveId: currentDriveId }]);
    setCurrentFolderId(folder.id);
  };

  const navigateToBreadcrumb = (index: number) => {
    const item = breadcrumbs[index];
    if (!item) return;
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setCurrentFolderId(item.id);
    setCurrentDriveId(item.driveId);
  };

  const handleSelectCurrentFolder = () => {
    const current = breadcrumbs[breadcrumbs.length - 1];
    if (!current) return;
    onSelectFile({
      id: current.id,
      name: current.name,
      mimeType: "application/vnd.google-apps.folder",
      webViewLink: `https://drive.google.com/drive/folders/${current.id}`,
    });
  };

  const files = data?.files ?? [];
  const folders = files.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  const nonFolders = files.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-amber-500" />
            共有ドライブを閲覧
          </DialogTitle>
        </DialogHeader>

        {/* パンくずリスト */}
        <div className="flex items-center gap-1 flex-wrap px-1 py-1 bg-muted/40 rounded-md text-xs">
          {breadcrumbs.map((crumb, idx) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
              <button
                onClick={() => navigateToBreadcrumb(idx)}
                className={`truncate max-w-[120px] hover:text-primary transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? "font-semibold text-foreground cursor-default"
                    : "text-muted-foreground hover:underline"
                }`}
                disabled={idx === breadcrumbs.length - 1}
              >
                {idx === 0 ? <Folder className="w-3 h-3 inline mr-0.5" /> : null}
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* ファイル一覧 */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">読み込み中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm text-destructive">フォルダの読み込みに失敗しました</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">このフォルダは空です</p>
            </div>
          ) : (
            <>
              {/* フォルダ */}
              {folders.map((file) => (
                <button
                  key={file.id}
                  onClick={() => navigateToFolder(file)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left group"
                >
                  <span className="text-lg flex-shrink-0">📁</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">フォルダ</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
                </button>
              ))}
              {/* ファイル */}
              {nonFolders.map((file) => {
                const { emoji, label } = getMimeInfo(file.mimeType);
                return (
                  <button
                    key={file.id}
                    onClick={() => onSelectFile(file)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-primary/10 transition-colors text-left group"
                  >
                    <span className="text-lg flex-shrink-0">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                    <BookmarkPlus className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* フッター */}
        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectCurrentFolder}
            className="gap-1.5 flex-1 sm:flex-none"
          >
            <BookmarkPlus className="w-4 h-4" />
            このフォルダをリンクに追加
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyLinks() {
  const utils = trpc.useUtils();

  // マイリンク一覧
  const { data: links, isLoading } = trpc.myLinks.list.useQuery(undefined, { retry: false });

  const createLink = trpc.myLinks.create.useMutation({
    onSuccess: () => {
      utils.myLinks.list.invalidate();
      toast.success("リンクを追加しました");
      setShowAddDialog(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLink = trpc.myLinks.update.useMutation({
    onSuccess: () => {
      utils.myLinks.list.invalidate();
      toast.success("リンクを更新しました");
      setEditingLink(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLink = trpc.myLinks.delete.useMutation({
    onSuccess: () => {
      utils.myLinks.list.invalidate();
      toast.success("リンクを削除しました");
      setDeleteTargetId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // フォーム状態
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔗");
  const [newDescription, setNewDescription] = useState("");

  // 編集状態
  const [editingLink, setEditingLink] = useState<{
    id: number;
    label: string;
    url: string;
    emoji: string;
    description?: string | null;
  } | null>(null);

  // 削除確認
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Picker状態
  const [pickerLoading, setPickerLoading] = useState(false);
  // アクセストークンをrefで保持（セッション中は再認証を避けるため）
  const accessTokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);

  // フォルダブラウザ状態
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [browsingFolder, setBrowsingFolder] = useState<{ id: string; name: string; driveId?: string } | null>(null);

  const resetForm = () => {
    setNewLabel("");
    setNewUrl("");
    setNewEmoji("🔗");
    setNewDescription("");
  };

  // URLフラグメントからpicker_tokenを取得してPickerを開く（バックエンドOAuthコールバック後）
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("picker_token=")) return;

    const params = new URLSearchParams(hash.replace("#", "?"));
    const token = params.get("picker_token");
    if (!token) return;

    // URLフラグメントをクリア（リロード時に再実行されないよう）
    window.history.replaceState(null, "", window.location.pathname);

    // トークンを保存してPickerを開く
    accessTokenRef.current = decodeURIComponent(token);
    tokenExpiryRef.current = Date.now() + 55 * 60 * 1000; // 55分
    openPicker(accessTokenRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URLクエリのpicker_errorを処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("picker_error");
    if (!err) return;
    window.history.replaceState(null, "", window.location.pathname);
    toast.error("Driveの認証に失敗しました。再度お試しください。");
  }, []);

  // フォルダ選択時の処理（フォルダブラウザを開く）
  const handleFolderSelected = useCallback((doc: { id: string; name: string; mimeType: string; url: string }) => {
    // driveIdはPickerのdocから取得できないため、undefinedで渡す（APIがincludeItemsFromAllDrivesで対応）
    setBrowsingFolder({ id: doc.id, name: doc.name, driveId: undefined });
    setFolderBrowserOpen(true);
  }, []);

  // Google Picker APIでファイルを選択
  const openPicker = useCallback(async (token: string) => {
    if (!PICKER_API_KEY) {
      toast.error("Picker APIキーが設定されていません");
      return;
    }
    try {
      setPickerLoading(true);
      // gapi.jsをロード
      await loadScript("google-gapi-script", "https://apis.google.com/js/api.js");
      // pickerモジュールをロード
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).gapi.load("picker", { callback: resolve, onerror: reject });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      // マイドライブビュー
      const myDriveView = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);
      // 共有ドライブビュー（Shared Drives）
      const sharedDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setEnableDrives(true);
      const picker = new google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(PICKER_API_KEY)
        .setLocale("ja")
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .addView(myDriveView)
        .addView(sharedDriveView)
        .setCallback((data: {
          action: string;
          docs?: Array<{ id: string; name: string; mimeType: string; url: string }>;
        }) => {
          if (data.action === google.picker.Action.PICKED && data.docs && data.docs.length > 0) {
            const doc = data.docs[0];
            // フォルダが選択された場合はフォルダブラウザを開く
            if (doc.mimeType === "application/vnd.google-apps.folder") {
              handleFolderSelected(doc);
            } else {
              // ファイルが選択された場合はマイリンク追加ダイアログを開く
              const { emoji } = getMimeInfo(doc.mimeType);
              setNewEmoji(emoji);
              setNewLabel(doc.name);
              const fileUrl = doc.url || `https://drive.google.com/open?id=${doc.id}`;
              setNewUrl(fileUrl);
              setShowAddDialog(true);
            }
          }
          setPickerLoading(false);
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      console.error("[GooglePicker] Error:", err);
      toast.error("Pickerの起動に失敗しました");
      setPickerLoading(false);
    }
  }, [handleFolderSelected]);

  // 「Driveから追加」ボタン押下時の処理
  const handleDriveAdd = useCallback(() => {
    if (!PICKER_API_KEY) {
      toast.error("Picker APIキーが設定されていません");
      return;
    }

    // 有効なトークンがあればそのまま使う（再認証不要）
    if (accessTokenRef.current && Date.now() < tokenExpiryRef.current) {
      openPicker(accessTokenRef.current);
      return;
    }

    // バックエンドOAuthリダイレクト方式でGoogleサインイン
    // iOSのPWA環境でも動作する
    const origin = window.location.origin;
    window.location.href = `/api/auth/google/picker?origin=${encodeURIComponent(origin)}`;
  }, [openPicker]);

  // フォルダブラウザからファイルが選択されたとき
  const handleFileSelectedFromBrowser = useCallback((file: {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
  }) => {
    setFolderBrowserOpen(false);
    const { emoji } = getMimeInfo(file.mimeType);
    setNewEmoji(emoji);
    setNewLabel(file.name);
    const fileUrl = file.webViewLink || `https://drive.google.com/open?id=${file.id}`;
    setNewUrl(fileUrl);
    setShowAddDialog(true);
  }, []);

  const handleAdd = () => {
    if (!newLabel.trim()) { toast.error("ラベルを入力してください"); return; }
    if (!newUrl.trim()) { toast.error("URLを入力してください"); return; }
    createLink.mutate({
      label: newLabel.trim(),
      url: newUrl.trim(),
      emoji: newEmoji || "🔗",
      description: newDescription.trim() || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingLink) return;
    if (!editingLink.label.trim()) { toast.error("ラベルを入力してください"); return; }
    if (!editingLink.url.trim()) { toast.error("URLを入力してください"); return; }
    updateLink.mutate({
      id: editingLink.id,
      label: editingLink.label.trim(),
      url: editingLink.url.trim(),
      emoji: editingLink.emoji || "🔗",
      description: editingLink.description?.trim() || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Star className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">マイリンク</h1>
            <p className="text-sm text-muted-foreground">よく使うリンクを登録・管理できます</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDriveAdd}
            disabled={pickerLoading}
            className="gap-1.5"
          >
            {pickerLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderOpen className="w-4 h-4" />
            )}
            Driveから追加
          </Button>
          <Button
            size="sm"
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            追加
          </Button>
        </div>
      </div>

      {/* 説明バナー */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <FolderOpen className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium mb-0.5">Driveから追加について</p>
          <p>「Driveから追加」ボタンからGoogleアカウントにサインインすると、マイドライブや<strong>共有ドライブ</strong>のファイル・フォルダを選択してマイリンクに追加できます。フォルダを選択するとアプリ内でフォルダ内を閲覧・展開できます。</p>
        </div>
      </div>

      {/* リンク一覧 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-primary" />
            登録済みリンク
            {links && links.length > 0 && (
              <Badge variant="secondary" className="ml-1">{links.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !links || links.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <LinkIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">リンクはまだ登録されていません</p>
              <p className="text-xs text-muted-foreground">「追加」または「Driveから追加」ボタンでリンクを登録できます</p>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors group"
                >
                  <span className="text-xl flex-shrink-0">{link.emoji ?? "🔗"}</span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-primary hover:underline flex items-center gap-1 truncate"
                    >
                      {link.label}
                      <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
                    </a>
                    {link.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{link.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 truncate">{link.url}</p>
                  </div>
                  {/* スマートフォン対応: タップでも表示されるようopacity-100を追加 */}
                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => setEditingLink({
                        id: link.id,
                        label: link.label,
                        url: link.url,
                        emoji: link.emoji ?? "🔗",
                        description: link.description,
                      })}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTargetId(link.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* フォルダブラウザダイアログ */}
      <FolderBrowserDialog
        open={folderBrowserOpen}
        onClose={() => setFolderBrowserOpen(false)}
        initialFolder={browsingFolder}
        onSelectFile={handleFileSelectedFromBrowser}
      />

      {/* 追加ダイアログ */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>リンクを追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">絵文字</Label>
                <Input
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  className="w-16 text-center text-lg"
                  maxLength={4}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">ラベル名 <span className="text-destructive">*</span></Label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="例: 業務日報"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">URL <span className="text-destructive">*</span></Label>
              <Input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">メモ（任意）</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="このリンクの説明"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              キャンセル
            </Button>
            <Button onClick={handleAdd} disabled={createLink.isPending}>
              {createLink.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={!!editingLink} onOpenChange={(open) => { if (!open) setEditingLink(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>リンクを編集</DialogTitle>
          </DialogHeader>
          {editingLink && (
            <div className="space-y-4 py-2">
              <div className="flex gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">絵文字</Label>
                  <Input
                    value={editingLink.emoji}
                    onChange={(e) => setEditingLink({ ...editingLink, emoji: e.target.value })}
                    className="w-16 text-center text-lg"
                    maxLength={4}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">ラベル名 <span className="text-destructive">*</span></Label>
                  <Input
                    value={editingLink.label}
                    onChange={(e) => setEditingLink({ ...editingLink, label: e.target.value })}
                    placeholder="例: 業務日報"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL <span className="text-destructive">*</span></Label>
                <Input
                  type="url"
                  value={editingLink.url}
                  onChange={(e) => setEditingLink({ ...editingLink, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">メモ（任意）</Label>
                <Input
                  value={editingLink.description ?? ""}
                  onChange={(e) => setEditingLink({ ...editingLink, description: e.target.value })}
                  placeholder="このリンクの説明"
                  maxLength={200}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLink(null)}>
              キャンセル
            </Button>
            <Button onClick={handleUpdate} disabled={updateLink.isPending}>
              {updateLink.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>リンクを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTargetId !== null && deleteLink.mutate({ id: deleteTargetId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLink.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "削除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
