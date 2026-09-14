'use client';
import { useEffect, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, apiErrorStatus } from '@/lib/api-client';
import { applyGameEvent, applyGameSnapshot } from '@/lib/game-sync';
import {
  parseGameEvent,
  parsePrivateSnapshot,
  parsePublicSnapshot,
} from '@/lib/realtime-schema';
import type { ServerClock } from '@/lib/server-clock';
import type { GameSnapshot } from '@/types/game';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'denied';
type Connection<T extends GameSnapshot> = {
  state: T | null;
  status: ConnectionStatus;
  message: string;
  clock: ServerClock | null;
};
type Source<T extends GameSnapshot> = {
  ticket: (code: string, signal: AbortSignal) => Promise<{ ticket: string }>;
  snapshot: (code: string, signal: AbortSignal) => Promise<T>;
  deniedMessage: string;
};
const useSyncedGame = <T extends GameSnapshot>(
  code: string,
  source: Source<T>
) => {
  const [connection, setConnection] = useState<Connection<T>>({
    state: null,
    status: 'idle',
    message: '',
    clock: null,
  });
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(() => setGeneration((value) => value + 1), []);
  useEffect(() => {
    let stopped = false;
    let socket: Socket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let epoch = 0;
    let state: T | null = null;
    let clock: ServerClock | null = null;
    let targetVersion = -1;
    let syncing = false;
    const controller = new AbortController();
    const publish = (status: ConnectionStatus, message = '') => {
      if (!stopped) setConnection({ state, status, message, clock });
    };
    const denied = () => {
      state = null;
      publish('denied', source.deniedMessage);
      stopped = true;
      controller.abort();
      socket?.disconnect();
      clearTimeout(timer);
    };
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel('quiz-membership');
    if (channel)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const value = event.data;
        if (
          value &&
          typeof value === 'object' &&
          'left' in value &&
          value.left === code
        )
          denied();
      };
    const valid = (attempt: number) => !stopped && attempt === epoch;
    const schedule = () => {
      if (stopped) return;
      epoch++;
      socket?.removeAllListeners();
      socket?.disconnect();
      syncing = false;
      clearTimeout(timer);
      attempts++;
      if (attempts >= 5) {
        publish(
          'failed',
          '接続できませんでした。通信環境を確認して再接続してください。'
        );
        return;
      }
      publish('reconnecting', '接続が切れました。再接続しています…');
      timer = setTimeout(
        () => void connect(),
        Math.min(1000 * 2 ** (attempts - 1), 8000)
      );
    };
    const sync = async (attempt: number) => {
      if (!valid(attempt) || syncing) return;
      syncing = true;
      publish(
        state ? 'reconnecting' : 'connecting',
        '最新の状態を取得しています…'
      );
      try {
        do {
          const started = performance.now();
          const snapshot = await source.snapshot(code, controller.signal);
          if (!valid(attempt)) return;
          const measuredAt = performance.now();
          clock = {
            serverTime: snapshot.serverTime + (measuredAt - started) / 2,
            measuredAt,
          };
          state = applyGameSnapshot(state, snapshot);
        } while (state.version < targetVersion);
        attempts = 0;
        publish('connected');
      } catch (error) {
        if (!valid(attempt)) return;
        if ([401, 403, 404].includes(apiErrorStatus(error) || 0)) denied();
        else schedule();
      } finally {
        if (valid(attempt)) syncing = false;
      }
    };
    const connect = async () => {
      const attempt = ++epoch;
      try {
        const url = process.env.NEXT_PUBLIC_REALTIME_URL;
        if (!url) {
          publish(
            'failed',
            '通信サービスの準備ができていません。主催者にお知らせください。'
          );
          return;
        }
        const { ticket } = await source.ticket(code, controller.signal);
        if (!valid(attempt)) return;
        socket = io(url, {
          transports: ['websocket'],
          auth: { ticket },
          reconnection: false,
          autoConnect: false,
          timeout: 5000,
        });
        socket.on('connect', () => void sync(attempt));
        socket.on('connect_error', schedule);
        socket.on('disconnect', schedule);
        socket.on('GAME_EVENT', (raw: unknown) => {
          if (!valid(attempt)) return;
          try {
            const event = parseGameEvent(raw);
            if (state && event.gameId !== state.gameId) return;
            targetVersion = Math.max(targetVersion, event.version);
            const update = applyGameEvent(state, event);
            state = update.state;
            if (update.needsSync) void sync(attempt);
            else if (!syncing) publish('connected');
          } catch {
            void sync(attempt);
          }
        });
        socket.connect();
      } catch (error) {
        if (!valid(attempt)) return;
        if ([401, 403, 404].includes(apiErrorStatus(error) || 0)) denied();
        else schedule();
      }
    };
    const resume = () => {
      if (document.visibilityState === 'visible' && socket?.connected)
        void sync(epoch);
    };
    document.addEventListener('visibilitychange', resume);
    publish(code ? 'connecting' : 'idle');
    if (code) void connect();
    return () => {
      stopped = true;
      epoch++;
      controller.abort();
      clearTimeout(timer);
      socket?.removeAllListeners();
      socket?.disconnect();
      channel?.close();
      document.removeEventListener('visibilitychange', resume);
    };
  }, [code, generation, source]);
  // Hide the previous room synchronously, even before the effect cleanup runs.
  return {
    ...connection,
    state: connection.state?.code === code ? connection.state : null,
    retry,
  };
};

export const announceRoomDeparture = (code: string) => {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('quiz-membership');
  channel.postMessage({ left: code });
  channel.close();
};

const playerSource = {
  ticket: (code: string, signal: AbortSignal) =>
    api.realtime.ticket.mutate({ code }, { signal }),
  snapshot: async (code: string, signal: AbortSignal) =>
    parsePrivateSnapshot(await api.games.snapshot.query({ code }, { signal })),
  deniedMessage:
    '退出したか、参加の有効期限が切れました。参加し直してください。',
};
const monitorSource = {
  ticket: (code: string, signal: AbortSignal) =>
    api.monitor.ticket.mutate({ code }, { signal }),
  snapshot: async (code: string, signal: AbortSignal) =>
    parsePublicSnapshot(await api.monitor.snapshot.query({ code }, { signal })),
  deniedMessage:
    'このルームのホストだけがモニターを表示できます。参加状況と有効期限を確認してください。',
};
export const useGameConnection = (code: string) =>
  useSyncedGame(code, playerSource);
export const useMonitorConnection = (code: string) =>
  useSyncedGame(code, monitorSource);
