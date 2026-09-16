import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '../db';
import { createSharedStore, closeSharedStore } from '../shared-state';
import { limitRequest } from '../request-policy';
import { createContext } from '../api/context';
import { appRouter } from '../api/router';
import { GET as health } from '@/app/api/health/route';
if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_test_'))
  throw new Error('Use test:db');
const redisUrl = process.env.REDIS_URL!;
afterEach(() => {
  vi.unstubAllEnvs();
  closeSharedStore();
});
afterAll(async () => {
  closeSharedStore();
  await db.$disconnect();
});
it('enforces a shared atomic quota across independent clients and renews after expiry', async () => {
  const prefix = `${process.env.QUIZ_REDIS_PREFIX}:quota:${randomUUID()}`;
  const first = createSharedStore(redisUrl, prefix);
  const second = createSharedStore(redisUrl, prefix);
  try {
    const answers = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? first : second).quota('same', 5, 50)
      )
    );
    expect(answers.filter(Boolean)).toHaveLength(5);
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(await second.quota('same', 5, 50)).toBe(true);
  } finally {
    first.close();
    second.close();
  }
});
it('rejects excess creation before issuing sessions and fails closed when coordination is down', async () => {
  vi.stubEnv('RATE_LIMIT_ENABLED', 'true');
  vi.stubEnv(
    'QUIZ_REDIS_PREFIX',
    `${process.env.QUIZ_REDIS_PREFIX}:limit:${randomUUID()}`
  );
  const request = new NextRequest('http://localhost:3000/api/trpc', {
    headers: { origin: 'http://localhost:3000' },
  });
  for (let count = 0; count < 20; count++)
    await limitRequest(request, 'rooms.create');
  const headers = new Headers();
  const caller = appRouter.createCaller(await createContext(request, headers));
  await expect(
    caller.rooms.create({ name: '拒否される作成' })
  ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  expect(headers.get('Retry-After')).toBe('60');
  expect(headers.get('set-cookie')).toBeNull();
  closeSharedStore();
  vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');
  await expect(
    limitRequest(request, 'answers.submit', 'user')
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
});
it('reports dependency failure as 503 without exposing connection details', async () => {
  expect((await health()).status).toBe(200);
  closeSharedStore();
  vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');
  const result = await health();
  expect(result.status).toBe(503);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(await result.json()).toEqual({ ok: false });
});
it('prevents a non-owner database role from reading application tables', async () => {
  const role = `quiz_policy_${randomUUID().replaceAll('-', '')}`;
  const schema = process.env.QUIZ_TEST_SCHEMA!;
  await db.user.create({ data: {} });
  await db.$executeRawUnsafe(`CREATE ROLE "${role}"`);
  try {
    await db.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`
    );
    await db.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`
    );
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
      return tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "User"`;
    });
    expect(rows[0]?.count).toBe(BigInt(0));
  } finally {
    await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
    await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
  }
});
