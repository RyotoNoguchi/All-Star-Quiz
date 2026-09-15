'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { createGameAudio, type Sound } from '@/lib/game-audio';
import { remainingSeconds, type ServerClock } from '@/lib/server-clock';
import type { GameSnapshot } from '@/types/game';
import type { ResultPresentation } from '@/lib/result-presentation';
type Props = {
  code: string;
  state: GameSnapshot | null;
  presentation: ResultPresentation | null;
  clock: ServerClock | null;
  connected: boolean;
};
export const useGameAudio = ({
  code,
  state,
  presentation,
  clock,
  connected,
}: Props) => {
  const engine = useRef<ReturnType<typeof createGameAudio> | null>(null);
  const owner = useRef('');
  const enabling = useRef(false);
  const previousBgm = useRef(true);
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [muted, setMuted] = useState(false);
  const [bgm, setBgm] = useState(true);
  const [message, setMessage] = useState(
    '音声はオフです。会場のモニター1台だけで有効にしてください。'
  );
  const seen = useRef('');
  const queue = useRef<{ key: string; sound: Sound; at: number }[]>([]);
  const played = useRef(new Set<string>());
  const phaseKey = useRef('');
  const countdown = useRef('');
  const nextBgm = useRef(0);
  const leaseDeadline = useRef(0);
  useEffect(() => () => engine.current?.close(), []);
  useEffect(() => {
    engine.current?.setVolume(muted ? 0 : volume);
    if (muted) engine.current?.stop();
  }, [muted, volume]);
  useEffect(() => {
    if (!enabled || !connected || !code) {
      engine.current?.stop();
      engine.current?.setDeadline(0);
      if (enabled) {
        setEnabled(false);
        setMessage(
          '接続が切れたため音声を停止しました。再接続後に有効にしてください。'
        );
      }
      return;
    }
    const leaseOwner = owner.current;
    const controller = new AbortController();
    let active = true;
    let renewing = false;
    const renew = async () => {
      if (renewing) return;
      renewing = true;
      const started = performance.now();
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 5000);
      try {
        const result = await api.monitor.audio.mutate(
          { code, owner: leaseOwner, release: false },
          { signal: requestController.signal }
        );
        if (!active) return;
        if (!result.granted || performance.now() >= started + 8000) {
          setMessage(
            '別の画面が音声を担当しているか、接続確認が遅れています。音声は停止しました。'
          );
          setEnabled(false);
          engine.current?.stop();
          engine.current?.setDeadline(0);
          return;
        }
        leaseDeadline.current = started + 8000;
        engine.current?.setDeadline(leaseDeadline.current);
        setMessage('このモニターで音声を再生しています。');
      } catch {
        if (active) {
          setMessage('音声の接続確認に失敗しました。再度有効にしてください。');
          setEnabled(false);
          engine.current?.stop();
          engine.current?.setDeadline(0);
        }
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abort);
        renewing = false;
      }
    };
    void renew();
    const timer = setInterval(() => void renew(), 3000);
    const hide = () => {
      if (document.hidden) {
        engine.current?.stop();
        engine.current?.setDeadline(0);
        setEnabled(false);
        setMessage(
          '画面を離れたため音声を停止しました。再度有効にしてください。'
        );
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hide);
      engine.current?.stop();
      engine.current?.setDeadline(0);
      leaseDeadline.current = 0;
      void api.monitor.audio
        .mutate({ code, owner: leaseOwner, release: true })
        .catch(() => {});
    };
  }, [enabled, connected, code]);
  useEffect(() => {
    const resultPhase =
      state?.phase === 'results' || state?.phase === 'finished';
    const key = `${state?.gameId}:${state?.question?.id || state?.lastResult?.questionId}:${resultPhase ? 'result' : state?.phase}:${presentation?.eventId}`;
    if (previousBgm.current && !bgm) engine.current?.stop();
    previousBgm.current = bgm;
    if (key !== phaseKey.current) {
      engine.current?.stop();
      nextBgm.current = 0;
      phaseKey.current = key;
    }
    if (!presentation || !enabled || muted || !connected) queue.current = [];
    if (presentation && presentation.eventId !== seen.current) {
      seen.current = presentation.eventId;
      played.current.clear();
      if (
        enabled &&
        !muted &&
        connected &&
        performance.now() < leaseDeadline.current
      ) {
        queue.current = [
          {
            key: 'answer',
            sound: presentation.isFinal ? 'bell' : 'correct',
            at: presentation.startedAt,
          },
        ];
        if (presentation.isFinal)
          queue.current.push({
            key: 'correct',
            sound: 'correct',
            at: presentation.startedAt + 1200,
          });
        if (presentation.newlyEliminatedIds.length)
          queue.current.push({
            key: 'eliminated',
            sound: state?.players.some(
              (player) =>
                presentation.newlyEliminatedIds.includes(player.id) &&
                player.eliminationReason === 'wrong'
            )
              ? 'wrong'
              : 'eliminated',
            at: presentation.startedAt + 900,
          });
      }
    }
    if (
      presentation &&
      state?.result?.winnerId &&
      enabled &&
      !muted &&
      queue.current.length &&
      !queue.current.some((item) => item.key === 'winner')
    )
      queue.current.push({
        key: 'winner',
        sound: 'winner',
        at: presentation.startedAt + 2700,
      });
    const tick = () => {
      if (
        !enabled ||
        muted ||
        !connected ||
        performance.now() >= leaseDeadline.current
      )
        return;
      const now = performance.now();
      for (const item of queue.current)
        if (!played.current.has(item.key) && now >= item.at) {
          played.current.add(item.key);
          if (now - item.at < 500) engine.current?.play(item.sound);
        }
      if (state?.phase === 'playing') {
        const seconds = Math.ceil(remainingSeconds(state.deadlineAt, clock));
        const countKey = `${state.question?.id}:${seconds}`;
        if (seconds > 0 && seconds <= 3 && countdown.current !== countKey) {
          countdown.current = countKey;
          engine.current?.play('countdown');
        }
      }
      if (
        bgm &&
        (state?.phase === 'waiting' || state?.phase === 'playing') &&
        now >= nextBgm.current
      ) {
        nextBgm.current = now + 1800;
        engine.current?.play('bgm');
      }
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [state, presentation, enabled, muted, bgm, connected, clock]);
  const enable = async () => {
    if (enabling.current) return;
    enabling.current = true;
    try {
      owner.current = crypto.randomUUID();
      engine.current ??= createGameAudio();
      engine.current.setVolume(muted ? 0 : volume);
      await engine.current.resume();
      setEnabled(true);
      setMessage('音声の再生担当を確認しています…');
    } catch {
      setMessage(
        'このブラウザーでは音声を開始できません。画面の結果表示をご利用ください。'
      );
    } finally {
      enabling.current = false;
    }
  };
  return {
    enabled,
    enable,
    disable: () => {
      setEnabled(false);
      setMessage('音声を停止しました。');
    },
    volume,
    setVolume,
    muted,
    setMuted,
    bgm,
    setBgm,
    message,
  };
};
