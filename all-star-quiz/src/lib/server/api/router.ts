import { adminRouter } from './admin';
import { trpc } from './trpc';
import { roomsRouter } from './rooms';
export const appRouter = trpc.router({
  rooms: roomsRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;
