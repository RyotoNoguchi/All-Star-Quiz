import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
const base = new URL(process.env.TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(base.hostname))
  throw new Error('Backup drill requires local disposable PostgreSQL');
const container =
  process.env.QUIZ_POSTGRES_CONTAINER ||
  execFileSync('docker', ['compose', 'ps', '-q', 'postgres'], {
    encoding: 'utf8',
  }).trim();
if (!/^[a-f0-9]{12,64}$/.test(container))
  throw new Error('Set the test PostgreSQL container ID');
const suffix = randomBytes(8).toString('hex');
const sourceName = `quiz_backup_${suffix}`;
const targetName = `quiz_restore_${suffix}`;
const sourceURL = new URL(base);
sourceURL.pathname = `/${sourceName}`;
sourceURL.search = '';
const targetURL = new URL(base);
targetURL.pathname = `/${targetName}`;
targetURL.search = '';
const env = {
  ...process.env,
  DATABASE_URL: sourceURL.href,
  DIRECT_URL: sourceURL.href,
  BACKUP_DATABASE_URL: sourceURL.href,
  QUIZ_POSTGRES_CONTAINER: container,
};
const directory = await mkdtemp(join(tmpdir(), 'quiz-backup-drill-'));
const archive = join(directory, 'quiz.dump');
const wrapper = join(directory, 'pg_dump');
const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Backup drill command failed (${code})`))
    );
  });
const docker = (args, options) =>
  run('docker', ['exec', '-i', container, ...args], options);
const source = new PrismaClient({
  datasources: { db: { url: sourceURL.href } },
});
const target = new PrismaClient({
  datasources: { db: { url: targetURL.href } },
});
try {
  await docker([
    'createdb',
    '-U',
    decodeURIComponent(base.username),
    sourceName,
  ]);
  await docker([
    'createdb',
    '-U',
    decodeURIComponent(base.username),
    targetName,
  ]);
  await run(process.execPath, [
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
  ]);
  const user = await source.user.create({ data: {} });
  const game = await source.game.create({
    data: {
      code: 'ABCDEF',
      phase: 'finished',
      expiresAt: new Date(),
      finishReason: 'cancelled',
    },
  });
  await source.personalResult.create({
    data: {
      gameId: game.id,
      userId: user.id,
      playerId: randomBytes(16).toString('hex'),
      playerName: '復元確認',
      code: game.code,
      completedAt: new Date(),
      reason: 'cancelled',
      totalQuestions: 0,
      rank: 1,
      survivedQuestions: 0,
      isWinner: false,
    },
  });
  await source.questionImage.create({
    data: { data: new Uint8Array([1, 2, 3, 255]) },
  });
  await writeFile(
    wrapper,
    '#!/bin/sh\nexec docker exec -i -e PGDATABASE -e PGUSER -e PGPASSWORD -e PGHOST=127.0.0.1 -e PGPORT=5432 "$QUIZ_POSTGRES_CONTAINER" pg_dump "$@"\n',
    { mode: 0o700 }
  );
  env.PG_DUMP_BIN = wrapper;
  await run(process.execPath, ['scripts/backup-database.mjs', archive]);
  assert.equal((await stat(archive)).mode & 0o777, 0o600);
  // This database was created by this drill. No CASCADE: refuse any unexpected objects.
  await target.$executeRawUnsafe('DROP SCHEMA public');
  const file = await open(archive, 'r');
  try {
    await docker(
      [
        'pg_restore',
        '-U',
        decodeURIComponent(base.username),
        '--no-owner',
        '--no-acl',
        '--single-transaction',
        '--exit-on-error',
        '-d',
        targetName,
      ],
      { stdio: [file.fd, 'inherit', 'inherit'] }
    );
  } finally {
    await file.close();
  }
  assert.deepEqual(
    await target.personalResult.findMany(),
    await source.personalResult.findMany()
  );
  assert.deepEqual(
    await target.questionImage.findMany(),
    await source.questionImage.findMany()
  );
  const rows =
    await target.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE oid = '"PersonalResult"'::regclass`;
  assert.equal(rows[0].relrowsecurity, true);
  console.log(
    'Backup/restore drill passed: private result, image bytes and row security restored into a separate database.'
  );
} finally {
  await Promise.all([source.$disconnect(), target.$disconnect()]);
  await docker([
    'dropdb',
    '-U',
    decodeURIComponent(base.username),
    '--if-exists',
    '--force',
    sourceName,
  ]);
  await docker([
    'dropdb',
    '-U',
    decodeURIComponent(base.username),
    '--if-exists',
    '--force',
    targetName,
  ]);
  await rm(directory, { recursive: true, force: true });
}
