CREATE TABLE "AnswerSubmission" (
 "id" TEXT NOT NULL, "gameId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "questionId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "choice" "Choice" NOT NULL,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),
 "acceptanceSequence" SERIAL NOT NULL,
 "processedAt" TIMESTAMP(3), "errorCode" TEXT, "receipt" JSONB,
 CONSTRAINT "AnswerSubmission_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AnswerSubmission_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnswerSubmission_gameId_userId_questionId_requestId_key" ON "AnswerSubmission"("gameId", "userId", "questionId", "requestId");
CREATE INDEX "AnswerSubmission_gameId_processedAt_acceptanceSequence_idx" ON "AnswerSubmission"("gameId", "processedAt", "acceptanceSequence");
