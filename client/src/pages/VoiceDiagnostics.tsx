import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Mic,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Globe,
  Settings,
  Volume2,
} from "lucide-react";

// ============================================================
// 型定義
// ============================================================
type CheckStatus = "pending" | "checking" | "ok" | "warn" | "error";

interface DiagItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

// ============================================================
// ユーティリティ
// ============================================================
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isSafari = () =>
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const statusIcon = (s: CheckStatus) => {
  if (s === "ok") return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />;
  if (s === "warn") return <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />;
  if (s === "error") return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
  if (s === "checking") return <RefreshCw className="w-5 h-5 text-blue-400 shrink-0 animate-spin" />;
  return <AlertCircle className="w-5 h-5 text-gray-400 shrink-0" />;
};

const statusBadge = (s: CheckStatus) => {
  if (s === "ok") return <Badge className="bg-green-100 text-green-700 border-green-200">正常</Badge>;
  if (s === "warn") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">注意</Badge>;
  if (s === "error") return <Badge className="bg-red-100 text-red-700 border-red-200">エラー</Badge>;
  if (s === "checking") return <Badge className="bg-blue-100 text-blue-700 border-blue-200">確認中</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 border-gray-200">未確認</Badge>;
};

// ============================================================
// メインコンポーネント
// ============================================================
export default function VoiceDiagnosticsPage() {
  const [items, setItems] = useState<DiagItem[]>([
    {
      id: "https",
      label: "セキュア接続（HTTPS）",
      status: "pending",
      detail: "",
    },
    {
      id: "browser",
      label: "ブラウザの互換性",
      status: "pending",
      detail: "",
    },
    {
      id: "speechApi",
      label: "Web Speech API（音声認識）",
      status: "pending",
      detail: "",
    },
    {
      id: "mediaRecorder",
      label: "MediaRecorder（録音機能）",
      status: "pending",
      detail: "",
    },
    {
      id: "microphone",
      label: "マイクのアクセス許可",
      status: "pending",
      detail: "",
      fix: "マイクのテストボタンで許可を求めます",
    },
  ]);

  const [micTesting, setMicTesting] = useState(false);
  const [micResult, setMicResult] = useState<"idle" | "success" | "denied" | "error">("idle");
  const [micError, setMicError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [speechTestResult, setSpeechTestResult] = useState<string>("");
  const [speechTesting, setSpeechTesting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const update = (id: string, patch: Partial<DiagItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  // 自動診断（マイク許可以外）
  useEffect(() => {
    runAutoChecks();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const runAutoChecks = () => {
    // リセット
    setItems((prev) =>
      prev.map((item) => ({ ...item, status: "checking" as CheckStatus, detail: "" }))
    );
    setMicResult("idle");
    setMicError("");
    setSpeechTestResult("");

    // 1. HTTPS
    const isSecure = location.protocol === "https:" || location.hostname === "localhost";
    update("https", {
      status: isSecure ? "ok" : "error",
      detail: isSecure
        ? `現在のURL: ${location.origin}（セキュア接続）`
        : "HTTPSでアクセスしてください。音声入力はHTTPSが必須です。",
      fix: isSecure ? undefined : "URLが https:// で始まっているか確認してください。",
    });

    // 2. ブラウザ
    const ios = isIOS();
    const safari = isSafari();
    const ua = navigator.userAgent;
    let browserName = "不明";
    let browserStatus: CheckStatus = "ok";
    let browserDetail = "";
    let browserFix: string | undefined;

    if (ios) {
      if (safari) {
        browserName = "Safari（iOS）";
        browserStatus = "ok";
        browserDetail = "iOSのSafariは音声入力に対応しています。";
      } else if (/CriOS/.test(ua)) {
        browserName = "Chrome（iOS）";
        browserStatus = "warn";
        browserDetail =
          "iOSのChromeはWeb Speech APIに対応していません。MediaRecorder（Whisper）でフォールバックします。";
        browserFix = "最良の体験のためSafariをお使いください。";
      } else if (/FxiOS/.test(ua)) {
        browserName = "Firefox（iOS）";
        browserStatus = "warn";
        browserDetail =
          "iOSのFirefoxはWeb Speech APIに対応していません。MediaRecorder（Whisper）でフォールバックします。";
        browserFix = "最良の体験のためSafariをお使いください。";
      } else {
        browserName = "その他（iOS）";
        browserStatus = "warn";
        browserDetail = "このブラウザはWeb Speech APIに対応していない可能性があります。";
        browserFix = "Safariをお使いください。";
      }
    } else if (/Chrome/.test(ua) && !/Edg/.test(ua)) {
      browserName = "Chrome（デスクトップ/Android）";
      browserStatus = "ok";
      browserDetail = "Chromeは音声入力に対応しています。";
    } else if (/Firefox/.test(ua)) {
      browserName = "Firefox";
      browserStatus = "warn";
      browserDetail = "FirefoxはWeb Speech APIに対応していません。MediaRecorder（Whisper）でフォールバックします。";
    } else if (/Edg/.test(ua)) {
      browserName = "Edge";
      browserStatus = "ok";
      browserDetail = "Edgeは音声入力に対応しています。";
    } else if (safari) {
      browserName = "Safari（macOS）";
      browserStatus = "ok";
      browserDetail = "macOS Safariは音声入力に対応しています。";
    }

    update("browser", {
      status: browserStatus,
      detail: `${browserName}\n${browserDetail}`,
      fix: browserFix,
    });

    // 3. Web Speech API
    const hasSpeechApi =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    update("speechApi", {
      status: hasSpeechApi ? "ok" : "warn",
      detail: hasSpeechApi
        ? "Web Speech APIが利用可能です（高精度・リアルタイム認識）。"
        : "Web Speech APIが利用できません。Whisper（MediaRecorder）でフォールバックします。",
      fix: hasSpeechApi
        ? undefined
        : ios
        ? "iPhone設定 → Siriと音声入力 → 音声入力をオンにしてください。"
        : "Chromeまたは最新のSafariをお使いください。",
    });

    // 4. MediaRecorder
    const hasMediaRecorder = "MediaRecorder" in window;
    const supportedTypes = hasMediaRecorder
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"]
          .filter((t) => MediaRecorder.isTypeSupported(t))
      : [];
    update("mediaRecorder", {
      status: hasMediaRecorder ? "ok" : "error",
      detail: hasMediaRecorder
        ? `MediaRecorderが利用可能です。\n対応フォーマット: ${supportedTypes.join(", ") || "なし（デフォルト使用）"}`
        : "MediaRecorderが利用できません。このブラウザでは音声入力が使用できません。",
      fix: hasMediaRecorder ? undefined : "最新のSafariまたはChromeをお使いください。",
    });

    // 5. マイク許可は手動テストに委ねる
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (result.state === "granted") {
          update("microphone", {
            status: "ok",
            detail: "マイクへのアクセスが許可されています。",
          });
          setMicResult("success");
        } else if (result.state === "denied") {
          update("microphone", {
            status: "error",
            detail: "マイクへのアクセスが拒否されています。",
            fix: ios
              ? "iPhone設定 → Safari → マイクを「許可」にしてください。また、設定 → Siriと音声入力 → 音声入力をオンにしてください。"
              : "ブラウザのアドレスバー横の鍵アイコン → マイクを「許可」にしてください。",
          });
          setMicResult("denied");
        } else {
          update("microphone", {
            status: "warn",
            detail: "マイクの許可状態が不明です。下のボタンでテストしてください。",
            fix: "「マイクをテスト」ボタンをタップしてください。",
          });
        }
      })
      .catch(() => {
        update("microphone", {
          status: "warn",
          detail: "マイクの許可状態を自動確認できませんでした。下のボタンでテストしてください。",
          fix: "「マイクをテスト」ボタンをタップしてください。",
        });
      });
  };

  // マイクテスト
  const testMicrophone = async () => {
    setMicTesting(true);
    setMicResult("idle");
    setMicError("");
    update("microphone", { status: "checking", detail: "マイクへのアクセスを確認中..." });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // 3秒後に停止
      setTimeout(() => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }, 3000);

      update("microphone", {
        status: "ok",
        detail: "マイクへのアクセスが許可されています。音声入力が使用できます。",
      });
      setMicResult("success");
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      const ios = isIOS();
      let msg = "";
      let fix = "";

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        msg = "マイクへのアクセスが拒否されました。";
        fix = ios
          ? "①iPhone設定 → Siriと音声入力 → 音声入力をオン\n②iPhone設定 → Safari → マイクを「許可」に変更\n③Safariを再起動して再試行"
          : "ブラウザのアドレスバー横の鍵アイコン → マイクを「許可」に変更してページを再読み込みしてください。";
        setMicResult("denied");
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        msg = "マイクが見つかりません。";
        fix = "マイクが接続されているか確認してください。";
        setMicResult("error");
      } else if (error.name === "NotReadableError") {
        msg = "マイクが他のアプリに使用されています。";
        fix = "他のアプリを閉じてから再試行してください。";
        setMicResult("error");
      } else {
        msg = `エラー: ${error.message || error.name || "不明"}`;
        fix = "ページを再読み込みして再試行してください。";
        setMicResult("error");
      }

      update("microphone", {
        status: "error",
        detail: msg,
        fix,
      });
      setMicError(fix);
    } finally {
      setMicTesting(false);
    }
  };

  // Web Speech APIテスト
  const testSpeechRecognition = () => {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechTestResult("Web Speech APIが利用できません。");
      return;
    }

    setSpeechTesting(true);
    setSpeechTestResult("「テスト」と話しかけてください...");

    const recognition = new (SpeechRecognition as new () => SpeechRecognition)();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setSpeechTestResult(`認識結果: 「${transcript}」 ✓ 正常に動作しています`);
      setSpeechTesting(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setSpeechTestResult(`エラー: ${event.error}`);
      setSpeechTesting(false);
    };

    recognition.onend = () => {
      setSpeechTesting(false);
    };

    recognition.start();
  };

  // 全体ステータス
  const allOk = items.every((i) => i.status === "ok");
  const hasError = items.some((i) => i.status === "error");
  const hasWarn = items.some((i) => i.status === "warn");
  const overallStatus = hasError ? "error" : hasWarn ? "warn" : allOk ? "ok" : "pending";

  const ios = isIOS();

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-100">
          <Mic className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">音声入力 診断</h1>
          <p className="text-sm text-muted-foreground">
            音声入力が使えない場合はここで原因を確認できます
          </p>
        </div>
      </div>

      {/* 全体ステータスバナー */}
      {overallStatus === "ok" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-green-700">すべて正常です</p>
            <p className="text-sm text-green-600">音声入力が使用できる環境です。</p>
          </div>
        </div>
      )}
      {overallStatus === "error" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <XCircle className="w-6 h-6 text-red-500 shrink-0" />
          <div>
            <p className="font-semibold text-red-700">問題が検出されました</p>
            <p className="text-sm text-red-600">下の項目を確認して対処してください。</p>
          </div>
        </div>
      )}
      {overallStatus === "warn" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-50 border border-yellow-200">
          <AlertCircle className="w-6 h-6 text-yellow-500 shrink-0" />
          <div>
            <p className="font-semibold text-yellow-700">一部注意が必要です</p>
            <p className="text-sm text-yellow-600">下の項目を確認してください。</p>
          </div>
        </div>
      )}

      {/* 診断項目リスト */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>診断結果</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={runAutoChecks}
              className="text-xs text-muted-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              再診断
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {items.map((item) => (
            <div
              key={item.id}
              className="border rounded-lg overflow-hidden"
            >
              <button
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                onClick={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
              >
                {statusIcon(item.status)}
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                {statusBadge(item.status)}
                {expandedId === item.id ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {expandedId === item.id && (
                <div className="px-4 pb-4 space-y-2 border-t bg-muted/20">
                  <p className="text-sm text-muted-foreground whitespace-pre-line pt-3">
                    {item.detail || "詳細情報なし"}
                  </p>
                  {item.fix && (
                    <div className="flex gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <Settings className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-700 whitespace-pre-line">{item.fix}</p>
                    </div>
                  )}

                  {/* マイクテストボタン */}
                  {item.id === "microphone" && (
                    <Button
                      onClick={testMicrophone}
                      disabled={micTesting}
                      className="w-full mt-2"
                      variant={micResult === "success" ? "outline" : "default"}
                    >
                      {micTesting ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          確認中...
                        </>
                      ) : micResult === "success" ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                          マイク正常（再テスト）
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 mr-2" />
                          マイクをテスト
                        </>
                      )}
                    </Button>
                  )}

                  {/* Speech APIテストボタン */}
                  {item.id === "speechApi" && item.status === "ok" && (
                    <div className="space-y-2">
                      <Button
                        onClick={testSpeechRecognition}
                        disabled={speechTesting}
                        variant="outline"
                        className="w-full mt-2"
                      >
                        {speechTesting ? (
                          <>
                            <Volume2 className="w-4 h-4 mr-2 animate-pulse text-red-500" />
                            聞き取り中...
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-4 h-4 mr-2" />
                            音声認識をテスト（話しかける）
                          </>
                        )}
                      </Button>
                      {speechTestResult && (
                        <p className="text-sm text-center text-muted-foreground bg-muted rounded-lg p-2">
                          {speechTestResult}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* iOSの設定ガイド */}
      {ios && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-500" />
              iPhoneの設定確認手順
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                ① Siriと音声入力の設定
              </p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>iPhoneの「設定」アプリを開く</li>
                <li>「Siriと音声入力」をタップ</li>
                <li>「音声入力」をオンにする</li>
              </ol>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                ② Safariのマイク許可
              </p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>iPhoneの「設定」アプリを開く</li>
                <li>「Safari」をタップ</li>
                <li>「マイク」を「許可」に変更</li>
                <li>Safariを完全に閉じて再起動</li>
              </ol>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                ③ 設定後の確認
              </p>
              <p className="text-sm text-muted-foreground">
                設定変更後は上の「マイクをテスト」ボタンで動作確認してください。
              </p>
              <Button
                onClick={runAutoChecks}
                variant="outline"
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                診断を再実行
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 非iOS向けガイド */}
      {!ios && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-500" />
              ブラウザのマイク許可手順
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Chrome / Edge</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>アドレスバー左の鍵アイコンをクリック</li>
                <li>「マイク」を「許可」に変更</li>
                <li>ページを再読み込み（F5）</li>
              </ol>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Safari（macOS）</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>メニュー「Safari」→「設定」を開く</li>
                <li>「Webサイト」タブ → 「マイク」</li>
                <li>このサイトを「許可」に変更</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      )}

      {/* よくある質問 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">よくある質問</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">マイクを許可したのに使えない</p>
            <p>iPhoneの場合、Safariの設定だけでなく「設定 → Siriと音声入力 → 音声入力」もオンにする必要があります。</p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="font-semibold text-foreground">音声認識の精度が低い</p>
            <p>静かな場所でマイクに近づいて話してください。医療用語・専門用語はWhisperモード（MediaRecorder）の方が精度が高い場合があります。</p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="font-semibold text-foreground">録音が途中で止まる</p>
            <p>iOSでは画面をスリープにすると録音が中断されます。録音中は画面をオンのままにしてください。</p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="font-semibold text-foreground">それでも解決しない場合</p>
            <p>Safariを完全に終了して再起動するか、iPhoneを再起動してから再試行してください。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
