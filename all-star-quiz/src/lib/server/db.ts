import { PrismaClient } from '@prisma/client';
const shared = globalThis as typeof globalThis & { quizDb?: PrismaClient };
export const db = shared.quizDb ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') shared.quizDb = db;
