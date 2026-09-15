import { historyRouter } from './history';
import { hostRouter } from './host';
import { monitorRouter } from './monitor';
import { answersRouter } from './answers';
import { gamesRouter } from './games';
import { realtimeRouter } from './realtime';
import { questionsRouter } from './questions';
import { adminRouter } from './admin';
import { trpc } from './trpc';
import { roomsRouter } from './rooms';
export const appRouter = trpc.router({
  history: historyRouter,
  host: hostRouter,
  monitor: monitorRouter,
  rooms: roomsRouter,
  answers: answersRouter,
  games: gamesRouter,
  realtime: realtimeRouter,
  questions: questionsRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;
