import type { z } from 'zod';
import { db } from './db';
import { withGame, closeQuestionIfReady } from './game-flow';
import { GameFlowError } from './game-error';
import {
  type answerInputSchema,
  enqueueAnswer,
  receiptSchema,
  submissionError,
} from './answer-queue';
export const submitAnswer = async (
  userId: string,
  input: z.input<typeof answerInputSchema>
) => {
  const submission = await enqueueAnswer(userId, input);
  if (!submission.processedAt) {
    try {
      await withGame(submission.gameId, closeQuestionIfReady);
    } catch (error) {
      if (!(error instanceof GameFlowError)) throw error;
      await db.answerSubmission.updateMany({
        where: { id: submission.id, processedAt: null },
        data: { processedAt: new Date(), errorCode: 'ANSWER_CLOSED' },
      });
    }
  }
  const result = await db.answerSubmission.findUniqueOrThrow({
    where: { id: submission.id },
  });
  if (result.errorCode) throw submissionError(result.errorCode);
  return receiptSchema.parse(result.receipt);
};
