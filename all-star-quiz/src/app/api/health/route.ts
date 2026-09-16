import { dependenciesHealthy } from '@/lib/server/health';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = async () => {
  const ok = await dependenciesHealthy();
  return Response.json(
    { ok },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
};
