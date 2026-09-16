import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { open, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { build } from 'esbuild';

if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)
  throw new Error(
    'Set TEST_DATABASE_URL and TEST_REDIS_URL for isolated E2E tests.'
  );
const lock = await open('.e2e-running', 'wx');
const schema = `quiz_e2e_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set('schema', schema);
const baseURL = 'http://localhost:3200';
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  DIRECT_URL: url.href,
  QUIZ_TEST_SCHEMA: schema,
  REDIS_URL: process.env.TEST_REDIS_URL,
  QUIZ_REDIS_PREFIX: schema,
  QUIZ_REALTIME_PREFIX: `${schema}:realtime`,
  REALTIME_TICKET_SECRET: randomBytes(32).toString('hex'),
  ALLOWED_ORIGINS: baseURL,
  NEXT_PUBLIC_REALTIME_URL: 'http://localhost:3201',
  QUIZ_E2E_BASE_URL: baseURL,
};
const admin = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
const fixture = new PrismaClient({ datasources: { db: { url: url.href } } });
const children = new Set();
let interrupted = false;
const start = (args, overrides = {}) => {
  if (interrupted) throw new Error('E2E interrupted.');
  const child = spawn(process.execPath, args, {
    env: { ...env, ...overrides },
    stdio: 'inherit',
  });
  children.add(child);
  child.done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      children.delete(child);
      resolve(code);
    });
  });
  return child;
};
const run = async (args) => {
  const code = await start(args).done;
  if (code !== 0) throw new Error(`E2E command failed (${code}).`);
};
const stop = async () => {
  await Promise.all(
    [...children].map(async (child) => {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        await child.done;
      } finally {
        clearTimeout(force);
      }
    })
  );
};
const interrupt = () => {
  interrupted = true;
  for (const child of children) child.kill('SIGTERM');
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const ready = async (address, child) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (interrupted || child.exitCode !== null || child.signalCode !== null)
      throw new Error('E2E service exited before readiness.');
    try {
      if ((await fetch(address, { signal: AbortSignal.timeout(1000) })).ok)
        return;
    } catch {}
    await delay(200);
  }
  throw new Error('E2E service did not become ready.');
};
try {
  for (const port of [3200, 3201]) {
    const probe = createServer();
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, resolve);
    });
    await new Promise((resolve) => probe.close(resolve));
  }
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await fixture.question.createMany({
    data: ['normal', 'final'].map((type) => ({
      question:
        type === 'normal'
          ? 'E2E 通常問題：青を選んでください'
          : 'E2E 最終問題：青を選んでください',
      choices: { A: '青', B: '赤', C: '黄', D: '緑' },
      answer: 'A',
      type,
      timeLimit: 10,
      category: 'E2E',
      explanation: '青が正解です。',
      choiceImages: {},
    })),
  });
  await run(['node_modules/next/dist/bin/next', 'build']);
  await build({
    entryPoints: ['src/server/realtime-entry.ts'],
    bundle: true,
    platform: 'node',
    packages: 'external',
    outfile: '.realtime/server.cjs',
  });
  const realtime = start(['.realtime/server.cjs'], { PORT: '3201' });
  const web = start([
    'node_modules/next/dist/bin/next',
    'start',
    '--port',
    '3200',
  ]);
  await Promise.all([
    ready(`${baseURL}/`, web),
    ready('http://localhost:3201/health', realtime),
  ]);
  await run(['node_modules/@playwright/test/cli.js', 'test']);
} finally {
  try {
    await stop();
    await fixture.$disconnect();
    try {
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`
      );
    } finally {
      await admin.$disconnect();
    }
    const redis = createClient({
      url: process.env.TEST_REDIS_URL,
      socket: { connectTimeout: 2000, reconnectStrategy: false },
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      for await (const keys of redis.scanIterator({
        MATCH: `${schema}:*`,
        COUNT: 100,
      })) {
        if (keys.length) await redis.del(keys);
      }
    } finally {
      if (redis.isOpen) redis.destroy();
    }
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await lock.close();
    await unlink('.e2e-running');
  }
}
