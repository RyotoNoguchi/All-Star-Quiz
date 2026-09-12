import { answersRouter } from './answers';
import { gamesRouter } from './games';
import { realtimeRouter } from './realtime';
import { questionsRouter } from './questions';
import { adminRouter } from './admin';
import { trpc } from './trpc';
import { roomsRouter } from './rooms';
export const appRouter = trpc.router({
  rooms: roomsRouter,
  answers: answersRouter,
  games: gamesRouter,
  realtime: realtimeRouter,
  questions: questionsRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;
