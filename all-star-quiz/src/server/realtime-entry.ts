import 'dotenv/config';
import { startRealtimeServer } from './realtime';
import { db } from '../lib/server/db';
import { closeSharedStore } from '../lib/server/shared-state';
const main = async () => {
  if (!process.env.REDIS_URL) throw new Error('Configure REDIS_URL');
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Invalid PORT');
  const server = await startRealtimeServer({
    port,
    redisUrl: process.env.REDIS_URL,
    origins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  });
  console.log(`Realtime server listening on port ${server.port}`);
  const stop = async () => {
    await server.close();
    closeSharedStore();
    await db.$disconnect();
  };
  process.once('SIGINT', () => {
    void stop();
  });
  process.once('SIGTERM', () => {
    void stop();
  });
};
void main().catch(() => {
  console.error(
    'Realtime server failed to start. Check service configuration and connectivity.'
  );
  process.exitCode = 1;
});
