import { act, cleanup, renderHook } from '@testing-library/react';
import { useGameAudio } from '../use-game-audio';
import type { GameSnapshot } from '@/types/game';
import type { ResultPresentation } from '@/lib/result-presentation';
const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  close: vi.fn(),
  resume: vi.fn(),
  setVolume: vi.fn(),
  setDeadline: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  api: { monitor: { audio: { mutate: mocks.lease } } },
}));
vi.mock('@/lib/game-audio', () => ({ createGameAudio: () => mocks }));
const state: GameSnapshot = {
  gameId: 'g',
  code: 'ABCDEF',
  phase: 'playing',
  version: 1,
  serverTime: 0,
  players: [],
  hostId: 'p',
  answerCount: 0,
  question: {
    id: 'q',
    question: '問題',
    choices: { A: '一', B: '二', C: '三', D: '四' },
  },
  deadlineAt: 10000,
};
const presentation: ResultPresentation = {
  gameId: 'g',
  questionId: 'q',
  eventId: 'event',
  startedAt: 100,
  isFinal: true,
  newlyEliminatedIds: [],
};
const props = {
  code: state.code,
  state,
  presentation: null as ResultPresentation | null,
  clock: { serverTime: 0, measuredAt: 0 },
  connected: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(100);
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  mocks.resume.mockResolvedValue(undefined);
  mocks.lease.mockResolvedValue({ granted: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('plays a final bell once, preserves it for GAME_ENDED, and never replays a snapshot', async () => {
  const hook = renderHook((value) => useGameAudio(value), {
    initialProps: props,
  });
  await act(async () => {
    await hook.result.current.enable();
  });
  const resultState: GameSnapshot = {
    ...state,
    phase: 'results',
    lastResult: {
      questionId: 'q',
      correctAnswer: 'A',
      isFinal: true,
      players: [],
      answers: [],
    },
  };
  hook.rerender({ ...props, state: resultState, presentation });
  expect(
    mocks.play.mock.calls.filter(([sound]) => sound === 'bell')
  ).toHaveLength(1);
  const stopped = mocks.stop.mock.calls.length;
  hook.rerender({
    ...props,
    state: {
      ...resultState,
      phase: 'finished',
      result: {
        gameId: 'g',
        winnerId: 'p',
        reason: 'final_question',
        totalQuestions: 1,
        completedAt: '',
        finalRanking: [],
        statistics: {
          totalPlayers: 1,
          totalAnswers: 1,
          averageResponseTime: 0,
          questionStats: [],
        },
      },
    },
    presentation,
  });
  expect(mocks.stop.mock.calls).toHaveLength(stopped);
  act(() => vi.advanceTimersByTime(2800));
  expect(mocks.play).toHaveBeenCalledWith('winner');
  expect(
    mocks.play.mock.calls.filter(([sound]) => sound === 'bell')
  ).toHaveLength(1);
  hook.rerender({ ...props, state: resultState, presentation: null });
  const calls = mocks.play.mock.calls.length;
  act(() => vi.advanceTimersByTime(1000));
  expect(mocks.play.mock.calls).toHaveLength(calls);
});
it('does not replay a result when enabled afterwards and stops on disconnect', async () => {
  const hook = renderHook((value) => useGameAudio(value), {
    initialProps: {
      ...props,
      state: { ...state, phase: 'results' as const },
      presentation,
    },
  });
  await act(async () => {
    await hook.result.current.enable();
  });
  act(() => vi.advanceTimersByTime(2800));
  expect(mocks.play).not.toHaveBeenCalled();
  hook.rerender({
    ...props,
    state: { ...state, phase: 'results' },
    presentation,
    connected: false,
  });
  expect(hook.result.current.enabled).toBe(false);
  expect(mocks.setDeadline).toHaveBeenLastCalledWith(0);
});
it('refuses a second audio owner and stops after lease failure', async () => {
  mocks.lease.mockResolvedValue({ granted: false });
  const hook = renderHook(() => useGameAudio(props));
  await act(async () => {
    await hook.result.current.enable();
  });
  expect(hook.result.current.enabled).toBe(false);
  expect(mocks.play).not.toHaveBeenCalled();
  expect(hook.result.current.message).toContain('別の画面');
});
it('stops current sounds when muted or BGM is disabled', async () => {
  const hook = renderHook(() => useGameAudio(props));
  await act(async () => {
    await hook.result.current.enable();
  });
  act(() => vi.advanceTimersByTime(100));
  expect(mocks.play).toHaveBeenCalledWith('bgm');
  const calls = mocks.stop.mock.calls.length;
  act(() => hook.result.current.setBgm(false));
  expect(mocks.stop.mock.calls.length).toBeGreaterThan(calls);
  act(() => hook.result.current.setMuted(true));
  expect(mocks.setVolume).toHaveBeenLastCalledWith(0);
});
