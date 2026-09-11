import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';
import { createContext } from '@/lib/server/api/context';
import { appRouter } from '@/lib/server/api/router';
export const runtime = 'nodejs';
const handler = (request: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    allowBatching: false,
    createContext: ({ resHeaders }) => {
      resHeaders.set('Cache-Control', 'no-store');
      return createContext(request, resHeaders);
    },
  });
export const GET = handler;
export const POST = handler;
