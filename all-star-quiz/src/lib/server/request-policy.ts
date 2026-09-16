import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { NextRequest } from 'next/server';
import { infrastructureStore } from './shared-state';
import { isProductionDeployment } from './deployment-config';
export const limitRequest = async (
  request: NextRequest,
  path: string,
  userId?: string
) => {
  if (process.env.RATE_LIMIT_ENABLED !== 'true' && !isProductionDeployment())
    return;
  // Only trust the Vercel-overwritten header on Vercel; self-hosted requests share a conservative bucket.
  const address =
    process.env.VERCEL === '1'
      ? request.headers.get('x-vercel-forwarded-for') || 'unknown'
      : 'self-hosted';
  const network =
    path === 'rooms.create' || path === 'rooms.join' || path === 'admin.login';
  const principal = network ? address : userId || address;
  const limit = path === 'rooms.create' || path === 'admin.login' ? 20 : 120;
  const group = path.endsWith('.ticket') ? 'ticket' : path;
  const bucket = createHash('sha256')
    .update(`${group}:${principal}`)
    .digest('hex');
  let allowed: boolean;
  try {
    allowed = await infrastructureStore().quota(bucket, limit, 60000);
  } catch {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message:
        '通信サービスに接続できません。少し待ってから再試行してください。',
    });
  }
  if (!allowed)
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: '操作が集中しています。1分ほど待ってから再試行してください。',
    });
};
export const logRequest = (
  path: string,
  status: number,
  durationMs: number
) => {
  if (process.env.LOG_REQUESTS !== 'true' && !isProductionDeployment()) return;
  console.log(
    JSON.stringify({
      event: 'api_request',
      path,
      status,
      durationMs: Math.round(durationMs),
      time: new Date().toISOString(),
    })
  );
};
