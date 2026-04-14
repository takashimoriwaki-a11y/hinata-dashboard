/**
 * AttendanceCheckModal - 出勤時・退勤時の確認モーダル
 * 手順チェック + アルコールチェック記録 + 打刻を一画面で完結させる
 * 打刻ボタンはいつでも押せる（手順完了を待たない）
 *
 * 出勤画面レイアウト：手順チェック → アルコールチェック → フッター（アルコールチェック記録 / 出勤打刻）
 * 退勤画面レイアウト：残業カード → 退勤打刻ボタン → アルコールチェック → アルコール記録 → みまもドライブ停止
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  LogIn,
  LogOut,
  X,
  Loader2,
  Car,
  Shield,
  ChevronDown,
  Clock,
  Users,
  FileText,
  BarChart2,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { DAILY_REPORT_SPREADSHEET_ID } from "@/lib/spreadsheetLinks";
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

// 出勤・退勤の手順ステップ定義
interface ClockInStep {
  id: string;
  label: string;
  description?: string;
  link?: { url: string; label: string; isDailyReport?: boolean };
}

const CLOCK_IN_STEPS: ClockInStep[] = [
  {
    id: "mimamodrive_in",
    label: "みまもドライブ",
    description: "出発前にみまもドライブを起動する",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
  },
  {
    id: "daily_report_in",
    label: "業務日報",
    description: "前日までの記録確認",
    link: {
      url: `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit`,
      label: "業務日報を開く",
      isDailyReport: true,
    },
  },
  {
    id: "ibow_in",
    label: "ibow 24時間体制の記録確認",
    description: "ibowで24時間体制の記録内容を確認する",
    link: {
      url: "https://login.ibowservice.jp/",
      label: "ibowを開く",
    },
  },
];

const CLOCK_OUT_STEPS: ClockInStep[] = [
  {
    id: "mimamodrive_out",
    label: "自宅到着時にみまもドライブを停止",
    description: "自宅到着時に日報を確定して",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
  },
];

// 出勤打刻に必要な全ステップID（手順チェック）
const CLOCK_IN_REQUIRED_STEP_IDS = CLOCK_IN_STEPS.map((s) => s.id);

// 時間の選択肢
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50];

/** JSTの時を取得（ブラウザのロケールに依存せず常にAsia/Tokyo基準） */
function getJSTHours(date: Date): number {
  return parseInt(
    date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false }),
    10
  );
}

/** JSTの分を取得 */
function getJSTMinutes(date: Date): number {
  return parseInt(
    date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", minute: "numeric" }),
    10
  );
}

function floorToTenMinutes(date: Date): number {
  return Math.floor(getJSTMinutes(date) / 10) * 10;
}

interface AttendanceCheckModalProps {
  type: "clock_in" | "clock_out";
  onClose: () => void;
  onConfirm?: () => void;
  /** 退勤時チェックリストのURL（全チーム共通ツールから取得） */
  checkoutChecklistUrl?: string | null;
  /** 緊急訪問看護などで追加打刻する場合はtrue（localStorageの完了フラグを無視して新規打刻を許可） */
  isEmergency?: boolean;
}

// localStorageのキーを生成する（当日の日付を含める）
function getStorageKey(type: "clock_in" | "clock_out"): string {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return `attendance_${type}_${dateStr}`;
}

interface SavedState {
  done: Record<string, boolean>;
  alcoholRecorded: boolean;
  alcoholSkipped?: boolean;
  clockInDone?: boolean;
  clockOutDone?: boolean;
  hasOvertime?: boolean;
  overtimeStartHour?: number;
  overtimeStartMinute?: number;
  overtimeEndHour?: number;
  overtimeEndMinute?: number;
  overtimeReasonType?: string;
  overtimeContactTarget?: string;
  overtimeRecordCount?: number;
  overtimeFreeText?: string;
}

export function AttendanceCheckModal({ type, onClose, onConfirm, checkoutChecklistUrl, isEmergency }: AttendanceCheckModalProps) {
  const isClockIn = type === "clock_in";
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // 当月の業務日報URLをスプレッドシートURL管理（linkKey='daily_report'）から取得
  const { data: dailyReportLink } = trpc.spreadsheetLinks.getDailyReportUrl.useQuery(
    undefined,
    { enabled: isClockIn }
  );

  // 当月URLが取得できた場合は業務日報リンクを差し替える
  const steps = isClockIn
    ? CLOCK_IN_STEPS.map((step) => {
        if (step.id === "daily_report_in" && dailyReportLink?.url) {
          return { ...step, link: { ...step.link!, url: dailyReportLink.url } };
        }
        return step;
      })
    : CLOCK_OUT_STEPS;

  // 事務員はアルコールチェックが任意
  const isOfficeStaff = (user as any)?.team === "事務員";

  // localStorageから保存済み状態を読み込む（緊急打刻時はリセット）
  const loadSavedState = (): SavedState | null => {
    if (isEmergency) return null; // 緊急打刻時は保存済み状態を無視
    try {
      const saved = localStorage.getItem(getStorageKey(type));
      if (saved) return JSON.parse(saved) as SavedState;
    } catch {
      // ignore
    }
    return null;
  };
  const savedState = loadSavedState();

  // 手順チェック状態
  const [done, setDone] = useState<Record<string, boolean>>(savedState?.done ?? {});
  const [openingStepId, setOpeningStepId] = useState<string | null>(null);

  // アルコールチェック記録済みフラグ（出勤・退勤共通）
  const [alcoholRecorded, setAlcoholRecorded] = useState(savedState?.alcoholRecorded ?? false);
  // アルコールチェックスキップフラグ（事務員のみ）
  const [alcoholSkipped, setAlcoholSkipped] = useState(savedState?.alcoholSkipped ?? false);
  // 出勤打刻済みフラグ
  const [clockInDone, setClockInDone] = useState(savedState?.clockInDone ?? false);
  // 退勤打刻済みフラグ
  const [clockOutDone, setClockOutDone] = useState(savedState?.clockOutDone ?? false);

  // dragY は削除（スワイプジェスチャーを無効化）
  const dragY = 0;

  // スクロールコンテナと次のアクションターゲットの ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const afterAlcoholRef = useRef<HTMLDivElement>(null);
  const alcoholHeaderRef = useRef<HTMLDivElement>(null); // アコーディオン展開時のスクロールターゲット

  // アルコールチェック完了後に次のアクションへスクロールするヘルパー
  const scrollToAfterAlcohol = useCallback(() => {
    setTimeout(() => {
      if (afterAlcoholRef.current && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const target = afterAlcoholRef.current;
        const targetTop = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        container.scrollTo({ top: targetTop - 8, behavior: 'smooth' });
      }
    }, 350); // アコーディオンのアニメーション完了後にスクロール
  }, []);

  // アコーディオン展開時にフォーム先頭へスクロールするヘルパー
  const scrollToAlcoholHeader = useCallback(() => {
    setTimeout(() => {
      if (alcoholHeaderRef.current && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const target = alcoholHeaderRef.current;
        const targetTop = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        container.scrollTo({ top: targetTop - 8, behavior: 'smooth' });
      }
    }, 50); // 展開開始直後にスクロール
  }, []);

  // スワイプジェスチャーは削除済み（誤操作防止のため）

  // 緊急打刻時の備考
  const [emergencyNote, setEmergencyNote] = useState("");

  // ── アルコールチェック フォーム状態 ──
  const [numberPlate, setNumberPlate] = useState("");
  // 退勤時はデフォルトで「対面」、出勤時は「オンライン画面」
  const [confirmMethod, setConfirmMethod] = useState<"online" | "face">(isClockIn ? "online" : "face");
  const [detectorUsed, setDetectorUsed] = useState(true);
  const [alcoholDetected, setAlcoholDetected] = useState(false);
  const [confirmerName, setConfirmerName] = useState("森脇崇");
  const [notes, setNotes] = useState("");
  // 追加項目（測定値・検知器種類・運転目的・同乗者・体調）
  const [alcoholMeasuredValue, setAlcoholMeasuredValue] = useState("0.00");
  const [detectorType, setDetectorType] = useState("");
  // 検知器一覧（DB登録済みのプルダウン用）
  const { data: detectors = [] } = trpc.alcoholDetector.getActive.useQuery();
  const [drivingPurpose, setDrivingPurpose] = useState<"commute" | "visit" | "transport" | "errand" | "other">(isClockIn ? "visit" : "commute");
  const [hasPassenger, setHasPassenger] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);
  const [physicalCondition, setPhysicalCondition] = useState<"good" | "poor">("good");
  const [physicalConditionNote, setPhysicalConditionNote] = useState("");

  // アルコールチェックフォームの折りたたみ状態（デフォルトは折りたたみ、記録済みも折りたたむ）
  const [alcoholOpen, setAlcoholOpen] = useState(false);

  // 残業入力（退勤時のみ）
  const openedAt = useMemo(() => new Date(), []);
  const [hasOvertime, setHasOvertime] = useState(savedState?.hasOvertime ?? false);
  const [overtimeStartHour, setOvertimeStartHour] = useState(savedState?.overtimeStartHour ?? 17);
  const [overtimeStartMinute, setOvertimeStartMinute] = useState(savedState?.overtimeStartMinute ?? 0);
  const [overtimeEndHour, setOvertimeEndHour] = useState(savedState?.overtimeEndHour ?? getJSTHours(openedAt));
  const [overtimeEndMinute, setOvertimeEndMinute] = useState(savedState?.overtimeEndMinute ?? floorToTenMinutes(openedAt));
  const [overtimeReasonType, setOvertimeReasonType] = useState(savedState?.overtimeReasonType ?? "");
  const [overtimeContactTarget, setOvertimeContactTarget] = useState(savedState?.overtimeContactTarget ?? "");
  const [overtimeRecordCount, setOvertimeRecordCount] = useState(savedState?.overtimeRecordCount ?? 1);
  const [overtimeFreeText, setOvertimeFreeText] = useState(savedState?.overtimeFreeText ?? "");

  // 位置情報
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "success" | "denied" | "error">("idle");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);

  // ユーザーのナンバープレートを自動取得（値がない場合は空文字列にリセット）
  useEffect(() => {
    if (user !== undefined) {
      setNumberPlate((user as any)?.numberPlate ?? "");
    }
  }, [user]);

  // モーダルを開いたら自動で位置情報を取得
  useEffect(() => {
    fetchLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 状態をlocalStorageに自動保存する
  useEffect(() => {
    const stateToSave: SavedState = {
      done,
      alcoholRecorded,
      alcoholSkipped,
      clockInDone,
      clockOutDone,
      hasOvertime,
      overtimeStartHour,
      overtimeStartMinute,
      overtimeEndHour,
      overtimeEndMinute,
      overtimeReasonType,
      overtimeContactTarget,
      overtimeRecordCount,
      overtimeFreeText,
    };
    try {
      localStorage.setItem(getStorageKey(type), JSON.stringify(stateToSave));
    } catch {
      // ignore storage errors
    }
  }, [type, done, alcoholRecorded, alcoholSkipped, clockInDone, clockOutDone, hasOvertime, overtimeStartHour, overtimeStartMinute, overtimeEndHour, overtimeEndMinute, overtimeReasonType, overtimeContactTarget, overtimeRecordCount, overtimeFreeText]);

  // モーダルが開いている間、bodyのスクロールをロックする（iOS対応）
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  // 出勤画面：全ステップ完了 + アルコール記録済み + 打刻済み → ホームへ自動遷移
  useEffect(() => {
    if (!isClockIn) return;
    const allStepsDone = CLOCK_IN_REQUIRED_STEP_IDS.every((id) => done[id]);
    // 事務員はスキップでもOK
    const alcoholDone = alcoholRecorded || (isOfficeStaff && alcoholSkipped);
    if (allStepsDone && alcoholDone && clockInDone) {
      // 全タスク完了時の触覚フィードバック（iOS: ダブルバイブレーション）
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      // 完了フラグを別キーに保存（ページリロード後も出勤済みとして判定できるように）
      try {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        localStorage.setItem(`attendance_done_clock_in_${dateStr}`, "true");
        localStorage.removeItem(getStorageKey(type));
      } catch { /* ignore */ }
      // 少し待ってからホームへ戻る
      const timer = setTimeout(() => {
        onClose();
        onConfirm?.();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isClockIn, done, alcoholRecorded, alcoholSkipped, isOfficeStaff, clockInDone, onClose, onConfirm, type]);
  // 退勤画面：退勤打刻済み + アルコール記録済み + みまもドライブ停止済み → ホームへ自動遷移
  useEffect(() => {
    if (isClockIn) return;
    const mimamoStopDone = done["mimamodrive_out"];
    // 事務員はスキップでもOK
    const alcoholDone = alcoholRecorded || (isOfficeStaff && alcoholSkipped);
    if (clockOutDone && alcoholDone && mimamoStopDone) {
      // 全タスク完了時の触覚フィードバック（iOS: ダブルバイブレーション）
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      // 完了フラグを別キーに保存（ページリロード後も退勤済みとして判定できるように）
      try {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        localStorage.setItem(`attendance_done_clock_out_${dateStr}`, "true");
        localStorage.removeItem(getStorageKey(type));
      } catch { /* ignore */ }
      const timer = setTimeout(() => {
        onClose();
        onConfirm?.();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isClockIn, done, alcoholRecorded, alcoholSkipped, isOfficeStaff, clockOutDone, onClose, onConfirm, type]);
  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ja`,
            { headers: { "User-Agent": "hinata-dashboard/1.0" } }
          );
          const data = await res.json();
          const addr = data?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setLocationAddress(addr);
        } catch {
          setLocationAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
        setLocationStatus("success");
      },
      (err) => {
        setLocationStatus(err.code === 1 ? "denied" : "error");
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const toTodayMs = (hour: number, minute: number): number => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

  const buildOvertimeReason = (): string => {
    switch (overtimeReasonType) {
      case "訪問看護実施": return "訪問看護実施";
      case "支援者連絡": return overtimeContactTarget ? `支援者連絡（${overtimeContactTarget}）` : "支援者連絡";
      case "家族連絡": return overtimeContactTarget ? `家族連絡（${overtimeContactTarget}）` : "家族連絡";
      case "記録書Ⅱ作成": return `記録書Ⅱ作成（${overtimeRecordCount}人分）`;
      case "月次報告書作成": return `月次報告書作成（${overtimeRecordCount}人分）`;
      case "状態報告書作成": return `状態報告書作成（${overtimeRecordCount}人分）`;
      case "その他": return overtimeFreeText || "その他";
      default: return "";
    }
  };

  // ── ミューテーション ──
  // 残業申請専用 mutation
  const [overtimeSubmitted, setOvertimeSubmitted] = useState(false);
  const [showOvertimeConfirm, setShowOvertimeConfirm] = useState(false);
  // 全リセット確認ダイアログ
  const [showOvertimeResetConfirm, setShowOvertimeResetConfirm] = useState(false);
  // アルコールチェック全リセット確認ダイアログ
  const [showAlcoholResetConfirm, setShowAlcoholResetConfirm] = useState(false);
  const [showAlcoholReEditConfirm, setShowAlcoholReEditConfirm] = useState(false); // 記録済み後の再編集確認
  // 閉じる前の確認ダイアログ
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // 変更があるかどうかを判定する（アルコールチェック入力・残業入力が初期値から変わっているか）
  const hasUnsavedChanges = (() => {
    // アルコールチェック記録済み・スキップ済みの場合は変更なし
    if (alcoholRecorded || alcoholSkipped) return false;
    // 手順チェックが1つでも完了していたら変更あり
    if (Object.values(done).some(Boolean)) return true;
    // アルコールチェックフォームが初期値から変わっているか
    const defaultNumberPlate = (user as any)?.numberPlate ?? "";
    const defaultConfirmMethod = isClockIn ? "online" : "face";
    const defaultDrivingPurpose = isClockIn ? "visit" : "commute";
    if (numberPlate !== defaultNumberPlate) return true;
    if (confirmMethod !== defaultConfirmMethod) return true;
    if (!detectorUsed) return true; // デフォルトはtrue
    if (alcoholDetected) return true; // デフォルトはfalse
    if (confirmerName !== "森脇崇") return true;
    if (notes.trim() !== "") return true;
    if (alcoholMeasuredValue !== "0.00" && alcoholMeasuredValue !== "") return true;
    if (drivingPurpose !== defaultDrivingPurpose) return true;
    if (hasPassenger) return true; // デフォルトはfalse
    if (physicalCondition !== "good") return true;
    if (physicalConditionNote.trim() !== "") return true;
    // 退勤時：残業入力が変わっているか
    if (!isClockIn && hasOvertime) return true;
    return false;
  })();

  // 閉じるハンドラー（変更があれば確認ダイアログを表示）
  const handleCloseRequest = () => {
    if (hasUnsavedChanges) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };
  const overtimeMutation = trpc.overtime.create.useMutation({
    onSuccess: () => {
      toast.success("残業申請を送信しました");
      setOvertimeSubmitted(true);
      void utils.overtime.getMine.invalidate();
    },
    onError: (e) => {
      toast.error(`残業申請に失敗しました: ${e.message}`);
    },
  });

  const handleOvertimeSubmit = () => {
    if (!hasOvertime) return;
    if (!overtimeReasonType) {
      toast.error("残業理由を選択してください");
      return;
    }
    if (overtimeReasonType === "支援者連絡" && !overtimeContactTarget.trim()) {
      toast.error("連絡先を入力してください");
      return;
    }
    if (overtimeReasonType === "家族連絡" && !overtimeContactTarget.trim()) {
      toast.error("連絡先を入力してください");
      return;
    }
    if (overtimeReasonType === "その他" && !overtimeFreeText.trim()) {
      toast.error("残業理由の詳細を入力してください");
      return;
    }
    // バリデーション通過後、確認ダイアログを表示
    setShowOvertimeConfirm(true);
  };

  const handleOvertimeConfirm = () => {
    const today = new Date();
    const applicationDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    overtimeMutation.mutate({
      applicationDate,
      requestedStartAt: toTodayMs(overtimeStartHour, overtimeStartMinute),
      requestedEndAt: toTodayMs(overtimeEndHour, overtimeEndMinute),
      requestedReason: buildOvertimeReason(),
    });
    setShowOvertimeConfirm(false);
  };

  // 打刻専用 mutation
  const clockMutation = trpc.attendance.clock.useMutation({
    onSuccess: () => {
      toast.success(isClockIn ? "出勤打刻しました" : "退勤打刻しました");
      void utils.attendance.today.invalidate();
      if (isClockIn) {
        setClockInDone(true);
      } else {
        setClockOutDone(true);
      }
    },
    onError: (e) => {
      toast.error(`打刻に失敗しました: ${e.message}`);
    },
  });
  // アルコールチェック記録専用 mutation
  const saveAlcoholCheckMutation = trpc.attendance.saveAlcoholCheck.useMutation({
    onSuccess: () => {
      toast.success(isClockIn ? "出勤アルコールチェックを記録しました" : "退勤アルコールチェックを記録しました");
      void utils.attendance.today.invalidate();
      setAlcoholRecorded(true);
      // 記録完了後は即座にアコーディオンを折りたたむ、次のアクションへスクロール
      setAlcoholOpen(false);
      scrollToAfterAlcohol();
    },
    onError: (e) => {
      toast.error(`アルコールチェック記録に失敗しました: ${e.message}`);
    },
  });

  // 業務日報リンクを開く
  const openDailyReport = async (step: ClockInStep) => {
    if (!step.link) return;
    // まず直接URLでウィンドウを開く（ポップアップブロック対策）
    const targetUrl = step.link.url;
    const newWindow = window.open(targetUrl, "_blank", "noopener,noreferrer");
    setDone((prev) => ({ ...prev, [step.id]: true }));
    setOpeningStepId(step.id);
    try {
      // 当月URLからスプレッドシートIDを抽出（当月URLが設定されている場合はそちらを優先）
      const spreadsheetIdMatch = targetUrl.match(/\/spreadsheets\/d\/([^/]+)/);
      const spreadsheetId = spreadsheetIdMatch ? spreadsheetIdMatch[1] : DAILY_REPORT_SPREADSHEET_ID;
      // バックグラウンドでgidを取得し、取得できたら既存ウィンドウのURLを更新
      const result = await utils.spreadsheetLinks.getDailyReportSheetGid.fetch({ spreadsheetId });
      if (result.gid !== null && newWindow && !newWindow.closed) {
        const gidUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${result.gid}`;
        newWindow.location.href = gidUrl;
      } else if (newWindow && !newWindow.closed) {
        // gidが取得できない場合、今日の日付をシート名として検索するURLを構築
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const sheetName = `${month}/${day}`;
        const encodedSheet = encodeURIComponent(sheetName);
        const rangeUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#rangeid=${encodedSheet}`;
        newWindow.location.href = rangeUrl;
      }
    } catch {
      // gid取得失敗時もデフォルトURLのまま（既に開いているので問題なし）
    } finally {
      setOpeningStepId(null);
    }
  };

  const openLink = (step: ClockInStep) => {
    if (!step.link) return;
    window.open(step.link.url, "_blank", "noopener,noreferrer");
    setDone((prev) => ({ ...prev, [step.id]: true }));
  };

  const handleStepButton = async (step: ClockInStep) => {
    if (!step.link) return;
    if (step.link.isDailyReport) {
      await openDailyReport(step);
    } else {
      openLink(step);
    }
  };

  // 打刻のみ実行
  const handleClockOnly = () => {
    if (clockMutation.isPending) return;
    clockMutation.mutate({
      type,
      emergencyNote: isEmergency && emergencyNote.trim() ? emergencyNote.trim() : undefined,
      drivingPurpose: drivingPurpose ?? undefined,
      alcoholMeasuredValue: (detectorUsed && alcoholMeasuredValue.trim()) ? alcoholMeasuredValue.trim() : undefined,
    });
  };

  // アルコールチェック記録のみ実行
  const handleAlcoholOnly = () => {
    if (saveAlcoholCheckMutation.isPending) return;
    // 事務員はナンバープレート必須チェックをスキップ
    if (!isOfficeStaff && !numberPlate.trim()) {
      toast.error("ナンバープレートを入力してください");
      return;
    }
    if (!isClockIn && hasOvertime && !overtimeReasonType) {
      toast.error("残業理由を選択してください");
      return;
    }
    if (!isClockIn && hasOvertime && overtimeReasonType === "支援者連絡" && !overtimeContactTarget.trim()) {
      toast.error("連絡先を入力してください");
      return;
    }
    if (!isClockIn && hasOvertime && overtimeReasonType === "家族連絡" && !overtimeContactTarget.trim()) {
      toast.error("連絡先を入力してください");
      return;
    }
    if (!isClockIn && hasOvertime && overtimeReasonType === "その他" && !overtimeFreeText.trim()) {
      toast.error("残業理由の詳細を入力してください");
      return;
    }
    saveAlcoholCheckMutation.mutate({
      clockType: type,
      numberPlate: numberPlate.trim(),
      confirmMethod,
      detectorUsed,
      alcoholDetected,
      confirmerName,
      notes: notes.trim() || undefined,
      clockInAt: undefined,
      clockOutAt: undefined,
      overtimeStartAt: (!isClockIn && hasOvertime) ? toTodayMs(overtimeStartHour, overtimeStartMinute) : undefined,
      overtimeEndAt: (!isClockIn && hasOvertime) ? toTodayMs(overtimeEndHour, overtimeEndMinute) : undefined,
      overtimeReason: (!isClockIn && hasOvertime) ? buildOvertimeReason() : undefined,
      overtimeContact: (!isClockIn && hasOvertime && overtimeContactTarget.trim()) ? overtimeContactTarget.trim() : undefined,
      overtimeCount: (!isClockIn && hasOvertime && ["記録書Ⅱ作成", "月次報告書作成", "状態報告書作成"].includes(overtimeReasonType)) ? overtimeRecordCount : undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      locationAddress: locationAddress ?? undefined,
      // 追加項目
      alcoholMeasuredValue: (detectorUsed && alcoholMeasuredValue.trim()) ? alcoholMeasuredValue.trim() : undefined,
      detectorType: detectorUsed ? "Portable alcohol tester CSY-006" : undefined,
      drivingPurpose,
      hasPassenger,
      passengerCount: hasPassenger ? passengerCount : undefined,
      physicalCondition,
      physicalConditionNote: (physicalCondition === "poor" && physicalConditionNote.trim()) ? physicalConditionNote.trim() : undefined,
    });
  };

  const isClockPending = clockMutation.isPending;
  const isAlcoholPending = saveAlcoholCheckMutation.isPending;

  // 出勤画面：全ステップ完了チェック
  const allClockInStepsDone = isClockIn && CLOCK_IN_REQUIRED_STEP_IDS.every((id) => done[id]);
  const alcoholDoneForBanner = alcoholRecorded || (isOfficeStaff && alcoholSkipped);
  const allClockInTasksDone = isClockIn && allClockInStepsDone && alcoholDoneForBanner && clockInDone;

  // アルコール記録済みになったら自動で折りたたむ
  useEffect(() => {
    if (alcoholRecorded) setAlcoholOpen(false);
  }, [alcoholRecorded]);

  // ── アルコールチェックフォームのJSX（共通） ──
  const alcoholCheckForm = (
    <div className={`mx-3 mt-2 mb-0 rounded-xl border-2 overflow-hidden ${
      isClockIn
        ? "border-orange-200 dark:border-orange-800"
        : "border-cyan-200 dark:border-cyan-800"
    }`}>
      {/* セクションヘッダー（タップで展開/折りたたみ） */}
      <div
        ref={alcoholHeaderRef}
        onClick={() => {
          const next = !alcoholOpen;
          setAlcoholOpen(next);
          if (next) scrollToAlcoholHeader();
        }}
        className={`px-4 py-3 flex items-center justify-between gap-2 cursor-pointer select-none ${
        isClockIn
          ? "bg-orange-100 dark:bg-orange-900/30"
          : "bg-cyan-100 dark:bg-cyan-900/30"
      }`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Shield className={`w-4 h-4 flex-shrink-0 ${isClockIn ? "text-orange-600 dark:text-orange-400" : "text-cyan-600 dark:text-cyan-400"}`} />
          <span className={`text-sm font-bold ${isClockIn ? "text-orange-700 dark:text-orange-300" : "text-cyan-700 dark:text-cyan-300"}`}>
            アルコールチェック
          </span>
          {isOfficeStaff && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">(任意)</span>
          )}
          {alcoholRecorded && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setShowAlcoholReEditConfirm(true); }}
              className="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-0.5 hover:opacity-70 transition-opacity active:scale-95 underline-offset-2 hover:underline"
              style={{ animation: 'alcoholBadgeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
              title="タップして再編集"
            >
              <CheckCircle2 className="w-3 h-3" />
              記録済み
            </button>
          )}
          {alcoholSkipped && !alcoholRecorded && (
            <span
              className="text-xs text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-0.5"
              style={{ animation: 'alcoholBadgeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
            >
              スキップ済み
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {/* 全リセットボタン（未記録時のみ表示） */}
          {!alcoholRecorded && !alcoholSkipped && (
            <button
              type="button"
              onClick={() => setShowAlcoholResetConfirm(true)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                isClockIn
                  ? "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-800/50"
                  : "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-200 dark:hover:bg-cyan-800/50"
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              全リセット
            </button>
          )}
          {/* 事務員向けスキップボタン */}
          {isOfficeStaff && !alcoholRecorded && (
            <button
              type="button"
              onClick={() => {
                const newSkipped = !alcoholSkipped;
                setAlcoholSkipped(newSkipped);
                // スキップ時はアコーディオンを折りたたんで次のアクションへスクロール
                if (newSkipped) {
                  setAlcoholOpen(false);
                  scrollToAfterAlcohol();
                }
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                alcoholSkipped
                  ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {alcoholSkipped ? "✓ スキップ済み" : "スキップ"}
            </button>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isClockIn ? "text-orange-500" : "text-cyan-500"} ${alcoholOpen ? "rotate-180" : "rotate-0"}`} />
        </div>
      </div>

      {/* アコーディオンコンテンツ */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: alcoholOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
      <div className="overflow-hidden">
      {/* スキップ済みの場合はフォームを非表示 */}
      {alcoholSkipped && !alcoholRecorded ? (
        <div className="px-4 py-3 bg-white dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            アルコールチェックをスキップしました
          </p>
          <button
            type="button"
            onClick={() => setAlcoholSkipped(false)}
            className="mt-2 w-full text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            スキップを取り消す
          </button>
        </div>
      ) : (
      <div className="px-4 py-4 space-y-4 bg-white dark:bg-gray-900">
        {/* ナンバープレート */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              <Car className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
              ナンバープレート {!isOfficeStaff && <span className="text-red-500">*</span>}{isOfficeStaff && <span className="text-xs text-gray-400 font-normal ml-1">(任意)</span>}
            </label>
            <button type="button" onClick={() => setNumberPlate((user as any)?.numberPlate ?? "")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <input
            type="text"
            value={numberPlate}
            onChange={(e) => setNumberPlate(e.target.value)}
            placeholder="例: 大和 300 あ 1234"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400"
            style={{ fontSize: "16px" }}
          />
          {(user as any)?.numberPlate && (
            <p className="text-xs text-gray-400 mt-1">
              ※ アカウントに登録されたナンバープレートを自動入力しました
            </p>
          )}
        </div>

        {/* 位置情報 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {locationStatus === "loading" && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                位置情報取得中...
              </span>
            )}
            {locationStatus === "success" && locationAddress && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[220px]" title={locationAddress}>
                  {locationAddress.slice(0, 30)}{locationAddress.length > 30 ? "..." : ""}
                </span>
              </span>
            )}
            {locationStatus === "denied" && (
              <span className="text-xs text-amber-500">位置情報が許可されていません</span>
            )}
            {locationStatus === "error" && (
              <span className="text-xs text-red-500">位置情報の取得に失敗しました</span>
            )}
            {locationStatus === "idle" && (
              <span className="text-xs text-gray-400">位置情報未取得</span>
            )}
          </div>
          {(locationStatus === "denied" || locationStatus === "error" || locationStatus === "idle") && (
            <button
              type="button"
              onClick={fetchLocation}
              className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              再取得
            </button>
          )}
        </div>

        {/* 確認方法 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">確認方法</label>
            <button type="button" onClick={() => setConfirmMethod(isClockIn ? "online" : "face")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <div className="flex gap-2">
            {(["online", "face"] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setConfirmMethod(method)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                  confirmMethod === method
                    ? isClockIn
                      ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                      : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                }`}
              >
                {method === "online" ? "オンライン画面" : "対面"}
              </button>
            ))}
          </div>
        </div>

        {/* 検知器使用 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">検知器使用</label>
            <button type="button" onClick={() => { setDetectorUsed(true); setAlcoholMeasuredValue(""); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <div className="flex gap-2">
            {([true, false] as const).map((used) => (
              <button
                key={String(used)}
                type="button"
                onClick={() => setDetectorUsed(used)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                  detectorUsed === used
                    ? isClockIn
                      ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                      : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                }`}
              >
                {used ? "使用" : "未使用"}
              </button>
            ))}
          </div>
        </div>

        {/* 測定値（検知器使用時のみ） + 検知器の種類・型番 — アコーディオンアニメーション */}
        <div
          className={`accordion-grid ${detectorUsed ? "accordion-grid-open" : "accordion-grid-closed"}`}
        >
          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">測定値（mg/L）</label>
                <button type="button" onClick={() => setAlcoholMeasuredValue("0.00")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
              </div>
              <div className="relative">
                <select
                  value={alcoholMeasuredValue}
                  onChange={(e) => setAlcoholMeasuredValue(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 appearance-none pr-8"
                >
                  <option value="">— 選択してください —</option>
                  {Array.from({ length: 26 }, (_, i) => (i * 0.01).toFixed(2)).map((v) => (
                    <option key={v} value={v}>{v} mg/L</option>
                  ))}
                  <option value="0.26">検知（要報告）</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                検知器の種類・型番
              </label>
              <div className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300">
                Portable alcohol tester CSY-006
              </div>
            </div>
          </div>
        </div>

        {/* 酒気帯び有無 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">酒気帯び</label>
            <button type="button" onClick={() => setAlcoholDetected(false)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <div className="flex gap-2">
            {([false, true] as const).map((detected) => (
              <button
                key={String(detected)}
                type="button"
                onClick={() => setAlcoholDetected(detected)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                  alcoholDetected === detected
                    ? detected
                      ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                      : isClockIn
                        ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                        : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                }`}
              >
                {detected ? "有" : "無"}
              </button>
            ))}
          </div>
          {alcoholDetected && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
              ⚠️ 酒気帯びが検知されました。安全管理者に報告してください。
            </p>
          )}
        </div>

        {/* 確認者 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">確認者（安全運転管理者）</label>
            <button type="button" onClick={() => setConfirmerName("森脇崇")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <div className="relative">
            <select
              value={confirmerName}
              onChange={(e) => setConfirmerName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 appearance-none pr-8"
            >
              <option value="森脇崇">森脇崇（安全運転管理者）</option>
              <option value="森脇英樹">森脇英樹（代理）</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* 運転目的 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">運転目的</label>
            <button type="button" onClick={() => setDrivingPurpose(isClockIn ? "visit" : "commute")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "commute", label: "通勤" },
              { value: "visit", label: "業務訪問" },
              { value: "transport", label: "送迎" },
              { value: "errand", label: "物品購入" },
              { value: "other", label: "その他" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDrivingPurpose(opt.value)}
                className={`py-2 text-sm font-medium rounded-xl border-2 transition-all ${
                  drivingPurpose === opt.value
                    ? isClockIn
                      ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                      : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 同乗者の有無 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">同乗者</label>
            <button type="button" onClick={() => { setHasPassenger(false); setPassengerCount(1); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <div className="flex gap-2">
            {([false, true] as const).map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setHasPassenger(val)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                  hasPassenger === val
                    ? isClockIn
                      ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                      : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                }`}
              >
                {val ? "有" : "無"}
              </button>
            ))}
          </div>
          {hasPassenger && (
            <div className="mt-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">人数</label>
              <input
                type="number"
                min={1}
                max={10}
                value={passengerCount}
                onChange={(e) => setPassengerCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400"
              />
            </div>
          )}
        </div>

        {/* 体調確認 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">体調確認</label>
            <button type="button" onClick={() => { setPhysicalCondition("good"); setPhysicalConditionNote(""); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <div className="flex gap-2">
            {(["good", "poor"] as const).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setPhysicalCondition(val)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                  physicalCondition === val
                    ? val === "poor"
                      ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                      : isClockIn
                        ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                        : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                }`}
              >
                {val === "good" ? "良好" : "不調"}
              </button>
            ))}
          </div>
          {physicalCondition === "poor" && (
            <div className="mt-2">
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-1 font-medium">
                ⚠️ 不調の場合は内容を入力してください。安全運転管理者に報告してください。
              </p>
              <textarea
                value={physicalConditionNote}
                onChange={(e) => setPhysicalConditionNote(e.target.value)}
                placeholder="不調の内容（症状・服薬影響等）"
                rows={2}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-amber-400 resize-none"
              />
            </div>
          )}
        </div>

        {/* 備考 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">備考（任意）</label>
            <button type="button" onClick={() => setNotes("")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="特記事項があれば入力"
            rows={2}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 resize-none"
          />
        </div>
      </div>
      )}
      </div>
      </div>
    </div>
  );

  // ── 残業カードのJSX（退勤時のみ） ──
  // NOTE: 上記の `)}` は `{alcoholSkipped && !alcoholRecorded}` の閉じタグ
  const overtimeCard = (
    <div className="mx-3 my-2 rounded-xl border-2 border-purple-200 dark:border-purple-800 overflow-hidden">
      <div className={`flex items-center ${hasOvertime ? "bg-purple-50 dark:bg-purple-950/30" : "bg-gray-50 dark:bg-gray-800"}`}>
        <button
          type="button"
          onClick={() => setHasOvertime((v) => !v)}
          className={`flex-1 flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors ${
            hasOvertime
              ? "text-purple-700 dark:text-purple-300"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span className="flex-shrink-0">残業申請</span>
            {/* トグルオフ時に入力内容プレビューを表示 */}
            {!hasOvertime && overtimeReasonType && (
              <span className="text-xs text-purple-600 dark:text-purple-400 font-normal truncate ml-1">
                {String(overtimeStartHour).padStart(2, "0")}:{String(overtimeStartMinute).padStart(2, "0")}〜{String(overtimeEndHour).padStart(2, "0")}:{String(overtimeEndMinute).padStart(2, "0")} / {buildOvertimeReason()}
              </span>
            )}
          </div>
          <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 flex-shrink-0 ${hasOvertime ? "bg-purple-500" : "bg-gray-300 dark:bg-gray-600"}`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${hasOvertime ? "translate-x-5" : "translate-x-0"}`} />
          </div>
        </button>
        {hasOvertime && !overtimeSubmitted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowOvertimeResetConfirm(true);
            }}
            className="flex items-center gap-1 mr-3 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3" />
            全リセット
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: hasOvertime ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="overflow-hidden">
        <div className="px-4 pb-4 pt-3 space-y-3 bg-white dark:bg-gray-900">
          {/* 残業開始時刻 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                残業開始時刻
                <span className="text-gray-400 font-normal ml-1">（デフォルト: 17:00）</span>
              </label>
              <button type="button" onClick={() => { setOvertimeStartHour(17); setOvertimeStartMinute(0); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <select
                  value={overtimeStartHour}
                  onChange={(e) => setOvertimeStartHour(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}時</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative flex-1">
                <select
                  value={overtimeStartMinute}
                  onChange={(e) => setOvertimeStartMinute(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                >
                  {MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}分</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 残業終了時刻 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                残業終了時刻
                <span className="text-gray-400 font-normal ml-1">（画面を開いた時刻から自動取得）</span>
              </label>
              <button type="button" onClick={() => { setOvertimeEndHour(getJSTHours(openedAt)); setOvertimeEndMinute(floorToTenMinutes(openedAt)); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <select
                  value={overtimeEndHour}
                  onChange={(e) => setOvertimeEndHour(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}時</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative flex-1">
                <select
                  value={overtimeEndMinute}
                  onChange={(e) => setOvertimeEndMinute(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                >
                  {MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}分</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 残業理由プリセット */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">残業理由 <span className="text-red-500">*</span></label>
              <button type="button" onClick={() => { setOvertimeReasonType(""); setOvertimeContactTarget(""); setOvertimeRecordCount(1); setOvertimeFreeText(""); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">リセット</button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {["訪問看護実施", "支援者連絡", "家族連絡", "記録書Ⅱ作成", "月次報告書作成", "状態報告書作成", "その他"].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    setOvertimeReasonType(reason);
                    setOvertimeContactTarget("");
                    setOvertimeRecordCount(1);
                    setOvertimeFreeText("");
                  }}
                  className={`py-2 px-2 text-xs font-medium rounded-xl border-2 transition-all text-center ${
                    overtimeReasonType === reason
                      ? "bg-purple-500 border-purple-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {/* 支援者連絡：連絡先入力 */}
          {overtimeReasonType === "支援者連絡" && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Users className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                誰に連絡したか <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={overtimeContactTarget}
                onChange={(e) => setOvertimeContactTarget(e.target.value)}
                placeholder="例: 相談支援専門員 山田さん"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400"
                style={{ fontSize: "16px" }}
              />
            </div>
          )}

          {/* 家族連絡：連絡先入力 */}
          {overtimeReasonType === "家族連絡" && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Users className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                誰に連絡したか <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={overtimeContactTarget}
                onChange={(e) => setOvertimeContactTarget(e.target.value)}
                placeholder="例: ○○様の長女 鈴木さん"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400"
                style={{ fontSize: "16px" }}
              />
            </div>
          )}

          {/* 記録書Ⅱ・月次・状態報告書：人数プルダウン */}
          {["記録書Ⅱ作成", "月次報告書作成", "状態報告書作成"].includes(overtimeReasonType) && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <FileText className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                何人分 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={overtimeRecordCount}
                  onChange={(e) => setOvertimeRecordCount(Number(e.target.value))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400 appearance-none pr-8"
                >
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}人分</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* その他：自由記述 */}
          {overtimeReasonType === "その他" && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <BarChart2 className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                詳細を入力 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={overtimeFreeText}
                onChange={(e) => setOvertimeFreeText(e.target.value)}
                placeholder="残業の詳細を入力してください"
                rows={2}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400 resize-none"
              />
            </div>
          )}

          {/* 残業申請「申請」ボタン */}
          <button
            type="button"
            disabled={overtimeMutation.isPending || overtimeSubmitted || !overtimeReasonType}
            onClick={handleOvertimeSubmit}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all shadow-md active:scale-95 disabled:cursor-not-allowed ${
              overtimeSubmitted
                ? "bg-green-500 opacity-80"
                : "bg-purple-500 hover:bg-purple-600 disabled:opacity-50"
            }`}
          >
            {overtimeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                申請中...
              </>
            ) : overtimeSubmitted ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                申請済み
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                申請
              </>
            )}
          </button>
        </div>
        </div>
      </div>
    </div>
  );

  // ── 手順チェックリストアイテムのレンダラー ──
  const renderStepItem = (step: ClockInStep) => {
    const isDone = done[step.id];
    const isOpening = openingStepId === step.id;
    return (
      <div
        key={step.id}
        className={`mx-3 my-2 rounded-xl border transition-all duration-200 ${
          isDone
            ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        }`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="flex-shrink-0 mt-0.5">
            {isDone ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : (
              <div
                className={`w-6 h-6 rounded-full ${
                  isClockIn
                    ? "bg-red-100 dark:bg-red-900/40"
                    : "bg-blue-100 dark:bg-blue-900/40"
                }`}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold leading-snug ${
                isDone
                  ? "text-green-700 dark:text-green-400 line-through"
                  : "text-gray-800 dark:text-gray-200"
              }`}
            >
              {step.label}
            </p>
            {step.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                {step.description}
              </p>
            )}
          </div>
        </div>
        {!isDone && step.link && (
          <div className="px-4 pb-3 pt-0">
            <button
              type="button"
              disabled={isOpening}
              onClick={() => void handleStepButton(step)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                isOpening ? "opacity-60 cursor-wait" : ""
              } ${
                isClockIn
                  ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
              }`}
            >
              {isOpening ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ExternalLink className="w-3 h-3" />
              )}
              {step.link.label}
            </button>
          </div>
        )}
        {isDone && (
          <div className="px-4 pb-3 pt-0">
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ 完了</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    {/* 閉じる前の確認ダイアログ */}
    <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
      <AlertDialogContent className="max-w-sm mx-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <X className={`w-5 h-5 ${isClockIn ? "text-red-500" : "text-blue-500"}`} />
            入力内容が保存されていません
          </AlertDialogTitle>
          <AlertDialogDescription>
            アルコールチェックや手順の入力内容が残っています。このまま閉じると入力内容は失われます。本当に閉じますか？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>入力を続ける</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setShowCloseConfirm(false);
              onClose();
            }}
            className="bg-gray-600 hover:bg-gray-700 text-white"
          >
            このまま閉じる
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 残業申請全リセット確認ダイアログ */}
    <AlertDialog open={showOvertimeResetConfirm} onOpenChange={setShowOvertimeResetConfirm}>
      <AlertDialogContent className="max-w-sm mx-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-purple-500" />
            入力内容のリセット
          </AlertDialogTitle>
          <AlertDialogDescription>
            残業申請の全ての入力内容をリセットします。よろしいですか？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOvertimeStartHour(17);
              setOvertimeStartMinute(0);
              setOvertimeEndHour(getJSTHours(openedAt));
              setOvertimeEndMinute(floorToTenMinutes(openedAt));
              setOvertimeReasonType("");
              setOvertimeContactTarget("");
              setOvertimeRecordCount(1);
              setOvertimeFreeText("");
              setShowOvertimeResetConfirm(false);
            }}
            className="bg-purple-500 hover:bg-purple-600 text-white"
          >
            リセットする
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* アルコールチェック全リセット確認ダイアログ */}
    <AlertDialog open={showAlcoholResetConfirm} onOpenChange={setShowAlcoholResetConfirm}>
      <AlertDialogContent className="max-w-sm mx-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${isClockIn ? "text-orange-500" : "text-cyan-500"}`} />
            入力内容のリセット
          </AlertDialogTitle>
          <AlertDialogDescription>
            アルコールチェックの全ての入力内容をリセットします。よろしいですか？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setNumberPlate((user as any)?.numberPlate ?? "");
              setConfirmMethod(isClockIn ? "online" : "face");
              setDetectorUsed(true);
              setAlcoholDetected(false);
              setConfirmerName("森脇崇");
              setNotes("");
              setAlcoholMeasuredValue("");
              setDetectorType("");
              setDrivingPurpose(isClockIn ? "visit" : "commute");
              setHasPassenger(false);
              setPassengerCount(1);
              setPhysicalCondition("good");
              setPhysicalConditionNote("");
              setShowAlcoholResetConfirm(false);
            }}
            className={isClockIn ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-cyan-500 hover:bg-cyan-600 text-white"}
          >
            リセットする
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* アルコールチェック再編集確認ダイアログ */}
    <AlertDialog open={showAlcoholReEditConfirm} onOpenChange={setShowAlcoholReEditConfirm}>
      <AlertDialogContent className="max-w-sm mx-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${isClockIn ? "text-orange-500" : "text-cyan-500"}`} />
            アルコールチェックの再編集
          </AlertDialogTitle>
          <AlertDialogDescription>
            記録済みのアルコールチェックを再編集します。入力内容はリセットされます。よろしいですか？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              // 記録済みフラグをリセットしてアコーディオンを展開
              setAlcoholRecorded(false);
              setAlcoholOpen(true);
              setShowAlcoholReEditConfirm(false);
              scrollToAlcoholHeader();
            }}
            className={isClockIn ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-cyan-500 hover:bg-cyan-600 text-white"}
          >
            再編集する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 残業申請確認ダイアログ */}
    <AlertDialog open={showOvertimeConfirm} onOpenChange={setShowOvertimeConfirm}>
      <AlertDialogContent className="max-w-sm mx-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-500" />
            残業申請 — 送信前確認
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground text-xs">以下の内容で残業申請を送信します。内容をご確認ください。</p>

              {/* 申請者・日付バッジ */}
              <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-950/30 rounded-xl px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">申請者</span>
                  <span className="text-xs font-semibold text-foreground">{user?.name ?? "—"}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" })}
                </span>
              </div>

              {/* 時刻・残業時間 */}
              <div className="bg-purple-50 dark:bg-purple-950/30 rounded-xl p-3 space-y-2">
                {/* 時刻行 */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">残業時間帯</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {String(overtimeStartHour).padStart(2, "0")}:{String(overtimeStartMinute).padStart(2, "0")}
                    {" 〜 "}
                    {String(overtimeEndHour).padStart(2, "0")}:{String(overtimeEndMinute).padStart(2, "0")}
                  </span>
                </div>
                {/* 合計時間 */}
                {(() => {
                  const startMins = overtimeStartHour * 60 + overtimeStartMinute;
                  const endMins = overtimeEndHour * 60 + overtimeEndMinute;
                  const diffMins = endMins - startMins;
                  if (diffMins > 0) {
                    const h = Math.floor(diffMins / 60);
                    const m = diffMins % 60;
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">合計時間</span>
                        <span className="font-semibold text-purple-600 dark:text-purple-400 tabular-nums">
                          {h > 0 ? `${h}時間` : ""}{m > 0 ? `${m}分` : ""}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* 区切り線 */}
                <div className="border-t border-purple-200 dark:border-purple-800 pt-2 mt-1" />
                {/* 理由 */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">残業理由</span>
                  <span className="font-medium text-foreground text-right">{buildOvertimeReason()}</span>
                </div>
                {/* 連絡先（支援者・家族連絡の場合） */}
                {(overtimeReasonType === "支援者連絡" || overtimeReasonType === "家族連絡") && overtimeContactTarget && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground flex-shrink-0">連絡先</span>
                    <span className="font-medium text-foreground text-right">{overtimeContactTarget}</span>
                  </div>
                )}
                {/* 人数（記録書系の場合） */}
                {["記録書Ⅱ作成", "月次報告書作成", "状態報告書作成"].includes(overtimeReasonType) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">対象人数</span>
                    <span className="font-medium text-foreground">{overtimeRecordCount}人分</span>
                  </div>
                )}
                {/* 自由記述（その他の場合） */}
                {overtimeReasonType === "その他" && overtimeFreeText && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground flex-shrink-0">詳細</span>
                    <span className="font-medium text-foreground text-right">{overtimeFreeText}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
                ⚠️ 送信後は内容を変更できません。内容をよく確認してから申請してください。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>修正する</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleOvertimeConfirm}
            className="bg-purple-500 hover:bg-purple-600 text-white"
          >
            この内容で申請する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden">
      {/* 背景オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCloseRequest}
      />
      {/* モーダル本体 */}
      <div
        className="relative w-full sm:max-w-md mx-0 sm:mx-4 bg-white dark:bg-gray-900 rounded-b-2xl sm:rounded-2xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] overflow-hidden"
      >
        {/* スワイプインジケーターは削除（誤操作防止） */}
        {/* ヘッダー */}
        <div
          className={`px-4 py-3.5 flex items-center gap-2 flex-shrink-0 rounded-t-none sm:rounded-t-2xl ${
            isClockIn
              ? "bg-gradient-to-r from-red-500 to-rose-600"
              : "bg-gradient-to-r from-blue-500 to-indigo-600"
          }`}
        >
          <div className="flex items-center gap-2 text-white flex-1 min-w-0">
            {isClockIn ? (
              <LogIn className="w-5 h-5 flex-shrink-0" />
            ) : (
              <LogOut className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-base font-bold truncate">
              {isEmergency
                ? (isClockIn ? "絊急出勤打刻" : "絊急退勤打刻")
                : (isClockIn ? "出勤時確認" : "退勤時確認")}
            </span>
          </div>
          {/* 進捗インジケーター */}
          {(() => {
            if (isClockIn) {
              // 出勤時：手順ステップ数 + アルコール + 打刻
              const total = steps.length + 2; // 手順ステップ + アルコール + 打刻
              const completedSteps = steps.filter(s => done[s.id]).length;
              const completedAlcohol = alcoholDoneForBanner ? 1 : 0;
              const completedClockIn = clockInDone ? 1 : 0;
              const completed = completedSteps + completedAlcohol + completedClockIn;
              return (
                <div className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  completed === total
                    ? 'bg-white/30 text-white'
                    : 'bg-white/20 text-white/90'
                }`}>
                  {completed === total ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                  <span>{completed}/{total}</span>
                </div>
              );
            } else {
              // 退勤時：打刻 + アルコール + 手順ステップ
              const total = 1 + 1 + steps.length; // 退勤打刻 + アルコール + みまもドライブ
              const completedClockOut = clockOutDone ? 1 : 0;
              const completedAlcohol = alcoholDoneForBanner ? 1 : 0;
              const completedSteps = steps.filter(s => done[s.id]).length;
              const completed = completedClockOut + completedAlcohol + completedSteps;
              return (
                <div className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  completed === total
                    ? 'bg-white/30 text-white'
                    : 'bg-white/20 text-white/90'
                }`}>
                  {completed === total ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                  <span>{completed}/{total}</span>
                </div>
              );
            }
          })()}
          <button
            type="button"
            onClick={handleCloseRequest}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div ref={scrollContainerRef} className="pt-2 pb-0 overflow-y-auto flex-1 min-h-0 overscroll-contain" style={{WebkitOverflowScrolling: 'touch', touchAction: 'pan-y'}}>

          {isClockIn ? (
            // ── 出勤画面レイアウト：手順チェック → アルコールチェック ──
            <>
              {steps.map(renderStepItem)}
              {alcoholCheckForm}
              {/* アルコール記録後のスクロールターゲット（出勤打刻ボタンの直前） */}
              <div ref={afterAlcoholRef} />
            </>
          ) : (
            // ── 退勤画面レイアウト：残業カード → 退勤打刻 → アルコールチェック → アルコール記録 → みまもドライブ停止 ──
            <>
              {/* 1. 残業申請 */}
              {overtimeCard}
              {/* 2. 退勤打刻ボタン */}
              <div className="mx-3 my-2">
                {clockOutDone ? (
                  <div
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm shadow-md bg-green-500"
                    style={{ animation: "clockOutSuccess 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    退勤打刻完了
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isClockPending}
                    onClick={handleClockOnly}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md active:scale-95 bg-blue-500 hover:bg-blue-600"
                  >
                    {isClockPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        打刻中...
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4" />
                        退勤打刻
                      </>
                    )}
                  </button>
                )}
              </div>
              {/* 2.5 退勤時チェックリスト（任意・最後の退勤者用） */}
              <div className="mx-3 my-2">
                {checkoutChecklistUrl ? (
                  <a
                    href={checkoutChecklistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all shadow-md active:scale-95 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700"
                  >
                    <ClipboardList className="w-4 h-4" />
                    退勤時チェックリスト
                    <span className="text-xs text-amber-500 dark:text-amber-500">（最後の退勤者のみ）</span>
                  </a>
                ) : (
                  <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-muted/50 text-muted-foreground border border-border cursor-not-allowed opacity-60">
                    <ClipboardList className="w-4 h-4" />
                    退勤時チェックリスト
                    <span className="text-xs">（未登録）</span>
                  </div>
                )}
              </div>
              {/* 3. アルコールチェック（フォーム） */}
              {alcoholCheckForm}
              {/* アルコール記録後のスクロールターゲット（アルコール記録ボタンの直前） */}
              <div ref={afterAlcoholRef} />
              {/* 4. アルコール記録ボタン（スキップ済みの場合は非表示） */}
              {!alcoholSkipped && (
              <div className="mx-3 my-2">
                <button
                  type="button"
                  disabled={isAlcoholPending || alcoholRecorded}
                  onClick={handleAlcoholOnly}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:cursor-not-allowed shadow-md active:scale-95 ${
                    alcoholRecorded
                      ? "bg-green-500 opacity-80"
                      : "bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                  }`}
                >
                  {isAlcoholPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      記録中...
                    </>
                  ) : alcoholRecorded ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      アルコールチェック記録済み
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      アルコールチェック記録
                    </>
                  )}
                </button>
              </div>
              )}
              {/* 5. みまもドライブ停止 */}
              {steps.map(renderStepItem)}
            </>
          )}
        </div>

        {/* フッター（出勤時のみ） */}
        {isClockIn && (
          <div className="px-5 pt-2 pb-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2 bg-white dark:bg-gray-900">
            {/* 全完了バナー */}
            {allClockInTasksDone && (
              <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                  全て完了！ホームに戻ります...
                </span>
              </div>
            )}
            {/* アルコールチェック記録ボタン（先）・スキップ済みの場合はスキップ済み表示 */}
            {alcoholSkipped && !alcoholRecorded ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <CheckCircle2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">アルコールチェックスキップ済み</span>
              </div>
            ) : (
            <button
              type="button"
              disabled={isAlcoholPending || alcoholRecorded}
              onClick={handleAlcoholOnly}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:cursor-not-allowed shadow-md active:scale-95 ${
                alcoholRecorded
                  ? "bg-green-500 opacity-80"
                  : "bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
              }`}
            >
              {isAlcoholPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  記録中...
                </>
              ) : alcoholRecorded ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  アルコールチェック記録済み
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  アルコールチェック記録
                </>
              )}
            </button>
            )}
            {/* 出勤打刻ボタン（後） */}
            <button
              type="button"
              disabled={isClockPending || clockInDone}
              onClick={handleClockOnly}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:cursor-not-allowed shadow-md active:scale-95 ${
                clockInDone
                  ? "bg-green-500 clock-done-animate"
                  : "bg-red-500 hover:bg-red-600 disabled:opacity-50"
              }`}
            >
              {isClockPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  打刻中...
                </>
              ) : clockInDone ? (
                <span className="flex items-center gap-2 clock-done-content-animate">
                  <CheckCircle2 className="w-5 h-5" />
                  出勤打刻完了
                </span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  出勤打刻
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCloseRequest}
              className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              キャンセル
            </button>
          </div>
        )}
        {/* 退勤時フッター（閉じるのみ） */}
        {!isClockIn && (
          <div className="px-5 pt-2 pb-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-900">
            <button
              type="button"
              onClick={handleCloseRequest}
              className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
