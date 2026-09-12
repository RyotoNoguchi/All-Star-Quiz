import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable local or CI PostgreSQL database.'
  );
const schema = `quiz_test_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set('schema', schema);
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  DIRECT_URL: url.href,
  QUIZ_TEST_SCHEMA: schema,
  REDIS_URL: process.env.TEST_REDIS_URL || '',
  QUIZ_REDIS_PREFIX: schema,
};
const admin = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database test command exited ${code}`))
    );
  });
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run([
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    'vitest.db.config.ts',
  ]);
} finally {
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
