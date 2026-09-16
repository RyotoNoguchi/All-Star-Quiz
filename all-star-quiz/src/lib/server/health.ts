import { db } from './db';
import { infrastructureStore } from './shared-state';
export const dependenciesHealthy = async () => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([db.$queryRaw`SELECT 1`, infrastructureStore().ping()]),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Health timeout')), 2000);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};
