import { joinRoom, readRoom } from '../src/lib/server/rooms';
import { db } from '../src/lib/server/db';
const [action, code, token] = process.argv.slice(2);
if (!code || !token) throw new Error('Missing worker parameters');
const main = async () => {
  try {
    if (action === 'read')
      console.log(
        JSON.stringify(
          await readRoom(
            code,
            (await db.user.findUniqueOrThrow({ where: { tokenHash: token } }))
              .id
          )
        )
      );
    else {
      const results = [];
      for (let i = 0; i < 13; i++) {
        try {
          const user = await db.user.create({
            data: { tokenHash: `${token}-${i}` },
          });
          await joinRoom(code, `${token}-${i}`, user.id);
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
