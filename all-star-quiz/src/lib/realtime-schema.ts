import { z } from 'zod';
import {
  gameResultSchema,
  publicPlayerSchema,
  questionResultSchema,
} from './result-schema';
import type { GameEvent, PrivateGameSnapshot } from '@/types/game';
export const publicQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  choices: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
  }),
  choiceImages: z
    .object({
      A: z.object({ url: z.string(), alt: z.string() }).optional(),
      B: z.object({ url: z.string(), alt: z.string() }).optional(),
      C: z.object({ url: z.string(), alt: z.string() }).optional(),
      D: z.object({ url: z.string(), alt: z.string() }).optional(),
    })
    .optional(),
  category: z.string().optional(),
});
export const publicSnapshotSchema = z.object({
  gameId: z.string(),
  code: z.string(),
  version: z.number().int(),
  serverTime: z.number(),
  phase: z.enum(['waiting', 'playing', 'closing', 'results', 'finished']),
  players: z.array(publicPlayerSchema),
  hostId: z.string(),
  question: publicQuestionSchema.optional(),
  startedAt: z.number().optional(),
  deadlineAt: z.number().optional(),
  answerCount: z.number().int(),
  lastResult: questionResultSchema.optional(),
  result: gameResultSchema.optional(),
});
export const privateSnapshotSchema = publicSnapshotSchema.extend({
  playerId: z.string(),
  ownAnswer: z
    .object({
      requestId: z.string(),
      questionId: z.string(),
      choice: z.enum(['A', 'B', 'C', 'D']),
      answeredAt: z.number(),
      responseTime: z.number(),
    })
    .optional(),
});
const envelope = {
  gameId: z.string(),
  eventId: z.string(),
  version: z.number().int(),
  serverTime: z.number(),
};
export const gameEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelope,
    type: z.literal('STATE_SYNC'),
    payload: publicSnapshotSchema,
  }),
  z.object({
    ...envelope,
    type: z.literal('QUESTION_STARTED'),
    payload: z.object({
      question: publicQuestionSchema,
      startedAt: z.number(),
      deadlineAt: z.number(),
    }),
  }),
  z.object({
    ...envelope,
    type: z.literal('ANSWER_COUNT_UPDATED'),
    payload: z.object({
      questionId: z.string(),
      answerCount: z.number().int(),
    }),
  }),
  z.object({
    ...envelope,
    type: z.literal('QUESTION_CLOSED'),
    payload: z.object({ questionId: z.string() }),
  }),
  z.object({
    ...envelope,
    type: z.literal('QUESTION_ENDED'),
    payload: questionResultSchema,
  }),
  z.object({
    ...envelope,
    type: z.literal('GAME_ENDED'),
    payload: z.object({
      result: gameResultSchema,
      lastResult: questionResultSchema.optional(),
    }),
  }),
]);
// Wire JSON omits undefined optional fields; validation also strips unknown/private keys.
export const parseGameEvent = (value: unknown): GameEvent =>
  gameEventSchema.parse(value) as GameEvent;
export const parsePrivateSnapshot = (value: unknown): PrivateGameSnapshot =>
  privateSnapshotSchema.parse(value) as PrivateGameSnapshot;
