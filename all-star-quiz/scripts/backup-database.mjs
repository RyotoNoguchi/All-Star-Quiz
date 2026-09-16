import 'dotenv/config';
import { spawn } from 'node:child_process';
import { open, unlink } from 'node:fs/promises';

const destination = process.argv[2];
if (!destination || !process.env.BACKUP_DATABASE_URL)
  throw new Error(
    'Usage: BACKUP_DATABASE_URL=... npm run db:backup -- /private/path/quiz.dump'
  );
const url = new URL(process.env.BACKUP_DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol))
  throw new Error('PostgreSQL URL required');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
if (
  !local &&
  (url.searchParams.get('sslmode') !== 'require' ||
    url.searchParams.get('sslaccept') !== 'strict')
)
  throw new Error('Remote backup requires sslmode=require&sslaccept=strict');
// Credentials remain in environment variables, never process arguments or output.
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGSSLMODE: local ? 'prefer' : 'verify-full',
  ...(local ? {} : { PGSSLROOTCERT: process.env.PGSSLROOTCERT || 'system' }),
};
const file = await open(destination, 'wx', 0o600);
try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PG_DUMP_BIN || 'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', '--schema=public'],
      { env, stdio: ['ignore', file.fd, 'inherit'] }
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Backup failed (${code})`))
    );
  });
  console.log(
    'Application database archive saved. Keep it on encrypted, access-controlled storage.'
  );
} catch (error) {
  await unlink(destination);
  throw error;
} finally {
  await file.close();
}
