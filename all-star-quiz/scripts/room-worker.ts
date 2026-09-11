import { joinRoom, readRoom } from '../src/lib/server/rooms';
import { db } from '../src/lib/server/db';
const [action, code, token] = process.argv.slice(2);
if (!code || !token) throw new Error('Missing worker parameters');
const main = async () => {
  try {
    if (action === 'read')
      console.log(JSON.stringify(await readRoom(code, token)));
    else {
      const results = [];
      for (let i = 0; i < 13; i++) {
        try {
          await joinRoom(code, `${token}-${i}`, `${token}-${i}`);
          results.push(true);
        } catch {
          results.push(false);
        }
      }
      console.log(JSON.stringify(results));
    }
  } finally {
    await db.$disconnect();
  }
};
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
