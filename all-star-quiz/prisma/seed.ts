import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const main = async () => {
  try {
    for (const question of [
      {
        id: 'seed-normal-1',
        question: '1 + 1 は？',
        choices: { A: '1', B: '2', C: '3', D: '4' },
        answer: 'B' as const,
        type: 'normal' as const,
      },
      {
        id: 'seed-final-1',
        question: '日本の首都は？',
        choices: { A: '東京', B: '大阪', C: '京都', D: '福岡' },
        answer: 'A' as const,
        type: 'final' as const,
      },
    ])
      await db.question.upsert({
        where: { id: question.id },
        update: {},
        create: { ...question, category: '練習' },
      });
  } finally {
    await db.$disconnect();
  }
};
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
