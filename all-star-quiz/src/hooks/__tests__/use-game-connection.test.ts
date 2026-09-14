import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useGameConnection,
  announceRoomDeparture,
} from '../use-game-connection';
import type { PrivateGameSnapshot } from '@/types/game';
const mocks = vi.hoisted(() => ({
  ticket: vi.fn(),
  snapshot: vi.fn(),
  io: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  api: {
    realtime: { ticket: { mutate: mocks.ticket } },
    games: { snapshot: { query: mocks.snapshot } },
  },
  apiErrorStatus: (error: { status?: number }) => error.status,
}));
vi.mock('socket.io-client', () => ({ io: mocks.io }));
const state: PrivateGameSnapshot = {
  code: 'ABCDEF',
  gameId: 'game',
  playerId: 'me',
  phase: 'waiting',
  version: 1,
  serverTime: 1,
  players: [{ id: 'me', name: '私', isHost: true, isEliminated: false }],
  hostId: 'me',
  answerCount: 0,
};
const sockets: ReturnType<typeof fakeSocket>[] = [];
const fakeSocket = () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    on: (name: string, handler: (...args: unknown[]) => void) =>
      handlers.set(name, handler),
    fire: (name: string, payload?: unknown) => handlers.get(name)?.(payload),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: () => handlers.clear(),
  };
};
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', 'http://localhost:3001');
  mocks.ticket.mockReset().mockResolvedValue({ ticket: 'fresh' });
  mocks.snapshot.mockReset().mockResolvedValue(state);
  mocks.io.mockReset().mockImplementation(() => {
    const socket = fakeSocket();
    sockets.push(socket);
    return socket;
  });
  sockets.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const connected = async () => {
  const hook = renderHook(({ code }) => useGameConnection(code), {
    initialProps: { code: state.code },
  });
  await waitFor(() => expect(sockets).toHaveLength(1));
  await act(async () => sockets[0]!.fire('connect'));
  await waitFor(() => expect(hook.result.current.status).toBe('connected'));
  return hook;
};
it('synchronizes membership and host changes from events without periodic HTTP polling', async () => {
  const hook = await connected();
  act(() =>
    sockets[0]!.fire('GAME_EVENT', {
      gameId: 'game',
      eventId: 'event',
      version: 2,
      serverTime: 2,
      type: 'STATE_SYNC',
      payload: {
        ...state,
        version: 2,
        hostId: 'peer',
        players: [
          { ...state.players[0], isHost: false },
          { id: 'peer', name: '友達', isHost: true, isEliminated: false },
        ],
      },
    })
  );
  expect(hook.result.current.state?.hostId).toBe('peer');
  expect(hook.result.current.state?.players).toHaveLength(2);
  expect(mocks.snapshot).toHaveBeenCalledTimes(1);
});
it('ignores late requests after leaving and disconnects the old room', async () => {
  let resolve!: (value: PrivateGameSnapshot) => void;
  mocks.snapshot.mockReturnValue(
    new Promise<PrivateGameSnapshot>((done) => {
      resolve = done;
    })
  );
  const hook = renderHook(({ code }) => useGameConnection(code), {
    initialProps: { code: state.code },
  });
  await waitFor(() => expect(sockets).toHaveLength(1));
  act(() => sockets[0]!.fire('connect'));
  hook.rerender({ code: '' });
  await act(async () => resolve(state));
  expect(hook.result.current.state).toBeNull();
  expect(hook.result.current.status).toBe('idle');
  expect(sockets[0]!.disconnect).toHaveBeenCalled();
});
it('fetches a new ticket and current snapshot after disconnect', async () => {
  const hook = await connected();
  vi.useFakeTimers();
  act(() => sockets[0]!.fire('disconnect'));
  expect(hook.result.current.status).toBe('reconnecting');
  mocks.snapshot.mockResolvedValue({ ...state, version: 4, phase: 'finished' });
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(mocks.ticket).toHaveBeenCalledTimes(2);
  await act(async () => sockets[1]!.fire('connect'));
  expect(hook.result.current.state?.phase).toBe('finished');
  expect(hook.result.current.status).toBe('connected');
});
it('denies expired or departed membership and clears stale state', async () => {
  const hook = await connected();
  vi.useFakeTimers();
  mocks.ticket.mockRejectedValue({ status: 403 });
  act(() => sockets[0]!.fire('disconnect'));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(hook.result.current.status).toBe('denied');
  expect(hook.result.current.state).toBeNull();
});
it('retries boundedly, reports failure, and allows manual recovery', async () => {
  mocks.ticket.mockRejectedValue(new Error('offline'));
  vi.useFakeTimers();
  const hook = renderHook(() => useGameConnection(state.code));
  await act(async () => vi.advanceTimersByTimeAsync(16000));
  expect(hook.result.current.status).toBe('failed');
  expect(mocks.ticket).toHaveBeenCalledTimes(5);
  mocks.ticket.mockResolvedValue({ ticket: 'recovered' });
  act(() => hook.result.current.retry());
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await act(async () => sockets[0]!.fire('connect'));
  expect(hook.result.current.status).toBe('connected');
});
it('resynchronizes when a version is missing without applying an incomplete event', async () => {
  const hook = await connected();
  mocks.snapshot.mockResolvedValue({ ...state, version: 4 });
  await act(async () =>
    sockets[0]!.fire('GAME_EVENT', {
      gameId: 'game',
      eventId: 'gap',
      version: 4,
      serverTime: 4,
      type: 'ANSWER_COUNT_UPDATED',
      payload: { questionId: 'q', answerCount: 1 },
    })
  );
  expect(mocks.snapshot).toHaveBeenCalledTimes(2);
  expect(hook.result.current.state?.version).toBe(4);
});

it('clears every same-browser tab on departure without affecting another room', async () => {
  const listeners = new Set<{
    onmessage?: (event: { data: unknown }) => void;
  }>();
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage?: (event: { data: unknown }) => void;
      constructor() {
        listeners.add(this);
      }
      postMessage(data: unknown) {
        for (const listener of listeners)
          if (listener !== this) listener.onmessage?.({ data });
      }
      close() {
        listeners.delete(this);
      }
    }
  );
  try {
    const hook = await connected();
    act(() => announceRoomDeparture('BBBBBB'));
    expect(hook.result.current.state).not.toBeNull();
    act(() => announceRoomDeparture(state.code));
    expect(hook.result.current.state).toBeNull();
    expect(hook.result.current.status).toBe('denied');
  } finally {
    vi.unstubAllGlobals();
  }
});
it('starts a result presentation once and clears it on authoritative synchronization', async () => {
  mocks.snapshot.mockResolvedValue({
    ...state,
    phase: 'playing',
    question: {
      id: 'question',
      question: '問題',
      choices: { A: '一', B: '二', C: '三', D: '四' },
    },
  });
  const hook = await connected();
  const event = {
    gameId: 'game',
    eventId: 'result-event',
    version: 2,
    serverTime: 2,
    type: 'QUESTION_ENDED',
    payload: {
      questionId: 'question',
      correctAnswer: 'A',
      isFinal: false,
      answers: [],
      players: [
        {
          ...state.players[0]!,
          isEliminated: true,
          eliminationReason: 'wrong',
        },
      ],
    },
  };
  act(() => sockets[0]!.fire('GAME_EVENT', event));
  const presentation = hook.result.current.presentation;
  expect(presentation?.newlyEliminatedIds).toEqual(['me']);
  act(() => sockets[0]!.fire('GAME_EVENT', event));
  expect(hook.result.current.presentation).toBe(presentation);
  act(() =>
    sockets[0]!.fire('GAME_EVENT', {
      gameId: 'game',
      eventId: 'sync-event',
      version: 3,
      serverTime: 3,
      type: 'STATE_SYNC',
      payload: { ...state, version: 3 },
    })
  );
  expect(hook.result.current.presentation).toBeNull();
});
