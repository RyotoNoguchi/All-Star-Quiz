export type ServerClock = { serverTime: number; measuredAt: number };
export const serverNow = (clock: ServerClock) =>
  clock.serverTime + performance.now() - clock.measuredAt;
export const remainingSeconds = (
  deadline: number | undefined,
  clock: ServerClock | null
) =>
  deadline !== undefined && clock
    ? Math.min(10, Math.max(0, (deadline - serverNow(clock)) / 1000))
    : 0;
