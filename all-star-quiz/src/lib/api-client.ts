import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from './server/api/router';
export const api = createTRPCClient<AppRouter>({
  links: [httpLink({ url: '/api/trpc' })],
});
export const apiErrorStatus = (error: unknown): number | undefined =>
  error instanceof TRPCClientError ? error.data?.httpStatus : undefined;
