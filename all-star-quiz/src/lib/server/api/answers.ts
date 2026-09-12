import { answerInputSchema, receiptSchema } from '../answer-queue';
import { submitAnswer } from '../answers';
import { memberProcedure, service, trpc } from './trpc';
export const answersRouter = trpc.router({
  submit: memberProcedure
    .input(answerInputSchema)
    .output(receiptSchema)
    .mutation(({ ctx, input }) =>
      service(() => submitAnswer(ctx.identity.userId, input))
    ),
});
