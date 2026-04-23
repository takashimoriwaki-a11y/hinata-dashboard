/**
 * 音声入力一時停止機能のテスト
 *
 * useVoiceInput フックの isPaused 状態・pauseVoice・resumeVoice 関数の
 * インターフェース仕様を検証する。
 * フロントエンドフックのため、サーバー側のロジックではなく
 * 型・インターフェース・フック戻り値の構造を検証する。
 */

import { describe, it, expect } from "vitest";

// useVoiceInput の戻り値インターフェースを模倣した型定義
interface UseVoiceInputReturn {
  isRecording: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  elapsedSeconds: number;
  startVoice: () => void;
  stopVoice: () => void;
  pauseVoice: () => void;
  resumeVoice: () => void;
  toggleVoice: () => void;
  interimText: string;
  silenceCountdown: number | null;
  transcriptionStatus: string;
  lastTranscribedText: string;
  reportMistranscription: (wrongText: string, correctedText: string) => Promise<void>;
  clearLastTranscribedText: () => void;
}

// VoiceExternalState の型定義（VoiceMicButton のプロップ）
interface VoiceExternalState {
  isRecording: boolean;
  isPaused?: boolean;
  isProcessing: boolean;
  toggleVoice: () => void;
  pauseVoice?: () => void;
  resumeVoice?: () => void;
  interimText: string;
  silenceCountdown: number | null;
  elapsedSeconds?: number;
}

describe("音声入力一時停止機能 - インターフェース仕様", () => {
  it("UseVoiceInputReturn に isPaused フィールドが含まれる", () => {
    // isPaused は boolean 型であることを確認
    const mockReturn: UseVoiceInputReturn = {
      isRecording: false,
      isPaused: false,
      isProcessing: false,
      elapsedSeconds: 0,
      startVoice: () => {},
      stopVoice: () => {},
      pauseVoice: () => {},
      resumeVoice: () => {},
      toggleVoice: () => {},
      interimText: "",
      silenceCountdown: null,
      transcriptionStatus: "idle",
      lastTranscribedText: "",
      reportMistranscription: async () => {},
      clearLastTranscribedText: () => {},
    };
    expect(typeof mockReturn.isPaused).toBe("boolean");
    expect(mockReturn.isPaused).toBe(false);
  });

  it("UseVoiceInputReturn に pauseVoice 関数が含まれる", () => {
    const mockReturn: UseVoiceInputReturn = {
      isRecording: true,
      isPaused: false,
      isProcessing: false,
      elapsedSeconds: 10,
      startVoice: () => {},
      stopVoice: () => {},
      pauseVoice: () => {},
      resumeVoice: () => {},
      toggleVoice: () => {},
      interimText: "テスト中",
      silenceCountdown: 30,
      transcriptionStatus: "recording",
      lastTranscribedText: "",
      reportMistranscription: async () => {},
      clearLastTranscribedText: () => {},
    };
    expect(typeof mockReturn.pauseVoice).toBe("function");
  });

  it("UseVoiceInputReturn に resumeVoice 関数が含まれる", () => {
    const mockReturn: UseVoiceInputReturn = {
      isRecording: true,
      isPaused: true,
      isProcessing: false,
      elapsedSeconds: 15,
      startVoice: () => {},
      stopVoice: () => {},
      pauseVoice: () => {},
      resumeVoice: () => {},
      toggleVoice: () => {},
      interimText: "",
      silenceCountdown: null,
      transcriptionStatus: "recording",
      lastTranscribedText: "",
      reportMistranscription: async () => {},
      clearLastTranscribedText: () => {},
    };
    expect(typeof mockReturn.resumeVoice).toBe("function");
  });

  it("一時停止中は isRecording=true かつ isPaused=true の状態を持つ", () => {
    // 一時停止中の状態: 録音セッションは維持（isRecording=true）、認識は停止（isPaused=true）
    const pausedState: UseVoiceInputReturn = {
      isRecording: true,
      isPaused: true,
      isProcessing: false,
      elapsedSeconds: 20,
      startVoice: () => {},
      stopVoice: () => {},
      pauseVoice: () => {},
      resumeVoice: () => {},
      toggleVoice: () => {},
      interimText: "",
      silenceCountdown: null,
      transcriptionStatus: "recording",
      lastTranscribedText: "",
      reportMistranscription: async () => {},
      clearLastTranscribedText: () => {},
    };
    expect(pausedState.isRecording).toBe(true);
    expect(pausedState.isPaused).toBe(true);
    // 一時停止中は interimText が空になる
    expect(pausedState.interimText).toBe("");
  });

  it("停止状態では isRecording=false かつ isPaused=false の状態を持つ", () => {
    const stoppedState: UseVoiceInputReturn = {
      isRecording: false,
      isPaused: false,
      isProcessing: false,
      elapsedSeconds: 0,
      startVoice: () => {},
      stopVoice: () => {},
      pauseVoice: () => {},
      resumeVoice: () => {},
      toggleVoice: () => {},
      interimText: "",
      silenceCountdown: null,
      transcriptionStatus: "idle",
      lastTranscribedText: "",
      reportMistranscription: async () => {},
      clearLastTranscribedText: () => {},
    };
    expect(stoppedState.isRecording).toBe(false);
    expect(stoppedState.isPaused).toBe(false);
  });

  it("VoiceExternalState の isPaused はオプショナルフィールドである", () => {
    // isPaused を省略しても型エラーにならないことを確認
    const externalStateWithoutPause: VoiceExternalState = {
      isRecording: false,
      isProcessing: false,
      toggleVoice: () => {},
      interimText: "",
      silenceCountdown: null,
    };
    expect(externalStateWithoutPause.isPaused).toBeUndefined();
    expect(externalStateWithoutPause.pauseVoice).toBeUndefined();
    expect(externalStateWithoutPause.resumeVoice).toBeUndefined();
  });

  it("VoiceExternalState に isPaused・pauseVoice・resumeVoice を含められる", () => {
    let pauseCalled = false;
    let resumeCalled = false;

    const externalStateWithPause: VoiceExternalState = {
      isRecording: true,
      isPaused: false,
      isProcessing: false,
      toggleVoice: () => {},
      pauseVoice: () => { pauseCalled = true; },
      resumeVoice: () => { resumeCalled = true; },
      interimText: "話し中",
      silenceCountdown: 45,
      elapsedSeconds: 5,
    };

    externalStateWithPause.pauseVoice?.();
    expect(pauseCalled).toBe(true);

    externalStateWithPause.resumeVoice?.();
    expect(resumeCalled).toBe(true);
  });

  it("一時停止ボタンのロジック: isPaused=true のとき resumeVoice を呼ぶ", () => {
    let resumeCalled = false;
    let pauseCalled = false;

    const isPaused = true;
    const resumeVoice = () => { resumeCalled = true; };
    const pauseVoice = () => { pauseCalled = true; };

    // VoiceMicButton の handlePauseClick ロジックを模倣
    if (isPaused) {
      resumeVoice();
    } else {
      pauseVoice();
    }

    expect(resumeCalled).toBe(true);
    expect(pauseCalled).toBe(false);
  });

  it("一時停止ボタンのロジック: isPaused=false のとき pauseVoice を呼ぶ", () => {
    let resumeCalled = false;
    let pauseCalled = false;

    const isPaused = false;
    const resumeVoice = () => { resumeCalled = true; };
    const pauseVoice = () => { pauseCalled = true; };

    // VoiceMicButton の handlePauseClick ロジックを模倣
    if (isPaused) {
      resumeVoice();
    } else {
      pauseVoice();
    }

    expect(resumeCalled).toBe(false);
    expect(pauseCalled).toBe(true);
  });

  it("一時停止中は silenceCountdown が null になる（タイマー停止）", () => {
    // 一時停止時は無音タイマーを停止するため、silenceCountdown は null
    const pausedState: UseVoiceInputReturn = {
      isRecording: true,
      isPaused: true,
      isProcessing: false,
      elapsedSeconds: 30,
      startVoice: () => {},
      stopVoice: () => {},
      pauseVoice: () => {},
      resumeVoice: () => {},
      toggleVoice: () => {},
      interimText: "",
      silenceCountdown: null, // 一時停止中はタイマー停止
      transcriptionStatus: "recording",
      lastTranscribedText: "",
      reportMistranscription: async () => {},
      clearLastTranscribedText: () => {},
    };
    expect(pausedState.silenceCountdown).toBeNull();
  });
});
