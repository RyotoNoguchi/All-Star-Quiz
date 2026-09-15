CREATE TABLE "PersonalResult" (
  "gameId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "playerName" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "totalQuestions" INTEGER NOT NULL,
  "isWinner" BOOLEAN NOT NULL,
  "rank" INTEGER NOT NULL,
  "survivedQuestions" INTEGER NOT NULL,
  "eliminatedAtQuestion" INTEGER,
  "eliminationReason" TEXT,
  CONSTRAINT "PersonalResult_pkey" PRIMARY KEY ("gameId", "userId"),
  CONSTRAINT "PersonalResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PersonalResult_userId_completedAt_gameId_idx" ON "PersonalResult"("userId", "completedAt", "gameId");
INSERT INTO "PersonalResult" (
  "gameId", "userId", "playerId", "playerName", "code", "completedAt", "reason", "totalQuestions", "isWinner", "rank", "survivedQuestions", "eliminatedAtQuestion", "eliminationReason"
)
SELECT r."gameId", p."userId", p."id", p."name", g."code", r."completedAt", r."reason", r."totalQuestions", COALESCE(r."winnerId" = p."id", false),
  (entry->>'rank')::integer, (entry->>'survivedQuestions')::integer,
  CASE WHEN p."eliminatedAtQuestion" IS NULL THEN NULL ELSE GREATEST(0, p."eliminatedAtQuestion" + 1) END, p."eliminationReason"
FROM "GameResult" r JOIN "Game" g ON g."id" = r."gameId"
JOIN "Participant" p ON p."gameId" = r."gameId"
CROSS JOIN LATERAL jsonb_array_elements(r."ranking") AS entry
WHERE entry->>'playerId' = p."id";
