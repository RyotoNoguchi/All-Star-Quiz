import { createSharedStore } from '../src/lib/server/shared-state';
const store = createSharedStore(
  process.env.REDIS_URL!,
  process.env.QUIZ_REDIS_PREFIX!
);
const main = async () => {
  try {
    const [mode, gameId] = process.argv.slice(2);
    const result =
      mode === 'acquire'
        ? await store.acquire(gameId!, 5000)
        : await store.read(gameId!, 2);
    process.stdout.write(JSON.stringify(result));
  } finally {
    store.close();
  }
};
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
