ALTER TABLE "Participant" ADD COLUMN "eliminatedAtQuestion" INTEGER;
ALTER TABLE "GameResult" ADD COLUMN "totalQuestions" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "GameEventRecord" (
 "id" TEXT NOT NULL, "gameId" TEXT NOT NULL, "version" INTEGER NOT NULL, "type" TEXT NOT NULL,
 "payload" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "publishedAt" TIMESTAMP(3),
 CONSTRAINT "GameEventRecord_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "GameEventRecord_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GameEventRecord_gameId_version_key" ON "GameEventRecord"("gameId", "version");
CREATE INDEX "GameEventRecord_publishedAt_createdAt_idx" ON "GameEventRecord"("publishedAt", "createdAt");
