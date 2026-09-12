import { z } from 'zod';
const text = z.string().trim().min(1).max(200);
const image = z
  .object({
    url: z
      .url()
      .max(2048)
      .refine(
        (url) => new URL(url).protocol === 'https:',
        'HTTPS画像URLが必要です。'
      ),
    alt: text,
  })
  .strict();
export const questionFields = z
  .object({
    question: z.string().trim().min(1).max(500),
    choices: z.object({ A: text, B: text, C: text, D: text }).strict(),
    choiceImages: z
      .object({
        A: image.optional(),
        B: image.optional(),
        C: image.optional(),
        D: image.optional(),
      })
      .strict()
      .default({}),
    answer: z.enum(['A', 'B', 'C', 'D']),
    type: z.enum(['normal', 'final']),
    timeLimit: z.literal(10).default(10),
    category: z.string().trim().min(1).max(50).nullable().default(null),
    explanation: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();

export const questionSnapshotSchema = questionFields
  .extend({ id: z.string(), version: z.number().int().nonnegative() })
  .strip();
