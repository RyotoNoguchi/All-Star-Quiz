import 'dotenv/config';
import { createAdminAccount } from '../src/lib/server/admin';
import { db } from '../src/lib/server/db';
const main = async () => {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password)
      throw new Error(
        'Set ADMIN_EMAIL and ADMIN_PASSWORD in the local environment.'
      );
    await createAdminAccount(email, password);
    console.log(
      'Administrator created. Remove ADMIN_PASSWORD from the environment.'
    );
  } catch {
    console.error(
      'Administrator creation failed. Check the email, password length (12–128), and that the account does not already exist.'
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
};
void main();
