// AudioPlayback — 音声再生の統合 (第3パッケージ: 音声再生・同期)
//
// 役割:
// - 音声素材 (実ファイル) の AudioBuffer を先読みデコードする
// - 再生開始/一時停止に合わせて AudioEngine をスケジュール/停止する
// - 再生中のシーク (再生ヘッドのジャンプ) を検出して再スケジュールする
// - トラック構成やミュートが再生中に変わったら再スケジュールする
// - バッファのデコード完了が再生中なら、その素材も含めて再スケジュールする
//
// 同期方式: マスターはアプリの再生ヘッド (state.currentTime)。
// エンジン側クロックとの差が 0.35 秒を超えたらジャンプとみなす
// (動画要素のシーク同期と同じ閾値)。

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store.ts';
import { audioEngine, planAudioSegments } from '../utils/audioEngine.ts';

const SEEK_THRESHOLD_SEC = 0.35;

export function AudioPlayback() {
  const { state } = useEditorStore();
  const { isPlaying, currentTime, tracks, mediaItems } = state;

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // デコード完了のたびに増えるカウンタ (再生中なら再スケジュールの合図)
  const [readyTick, setReadyTick] = useState(0);

  const scheduleFromNow = useCallback(() => {
    const s = stateRef.current;
    const segments = planAudioSegments(s.tracks, s.mediaItems, s.currentTime);
    audioEngine.play(segments, s.currentTime);
  }, []);

  // 音声素材の先読みデコード (URL がある実ファイルのみ)
  useEffect(() => {
    for (const item of mediaItems) {
      if (item.type !== 'audio' || !item.url) continue;
      if (audioEngine.hasBuffer(item.id)) continue;
      void audioEngine.load(item).then(buffer => {
        if (buffer) setReadyTick(t => t + 1);
      });
    }
  }, [mediaItems]);

  // 再生/停止と、再生中の構成変更・デコード完了への追随
  useEffect(() => {
    if (!isPlaying) {
      audioEngine.stop();
      return;
    }
    void audioEngine.resume();
    scheduleFromNow();
  }, [isPlaying, tracks, mediaItems, readyTick, scheduleFromNow]);

  // 再生中のシーク検出 (エンジンの想定時刻とヘッドが乖離したら再スケジュール)
  const playingRef = useRef(isPlaying);
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!playingRef.current) return;
    const expected = audioEngine.expectedTimelineTime();
    if (expected === null) return;
    if (Math.abs(currentTime - expected) > SEEK_THRESHOLD_SEC) {
      scheduleFromNow();
    }
  }, [currentTime, scheduleFromNow]);

  // アンマウント時は停止
  useEffect(() => {
    return () => {
      audioEngine.stop();
    };
  }, []);

  return null;
}
