import { trpc } from './trpc';
import { roomsRouter } from './rooms';
export const appRouter = trpc.router({ rooms: roomsRouter });
export type AppRouter = typeof appRouter;
