ALTER TABLE "Participant" ADD COLUMN "disconnectedAt" TIMESTAMP(3);
CREATE TABLE "GameCommand" (
 "id" TEXT NOT NULL, "gameId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
 "userId" TEXT NOT NULL, "action" TEXT NOT NULL, "expectedVersion" INTEGER NOT NULL,
 "response" JSONB NOT NULL, CONSTRAINT "GameCommand_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "GameCommand_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GameCommand_gameId_requestId_key" ON "GameCommand"("gameId", "requestId");
CREATE TABLE "RealtimeConnection" (
 "id" TEXT NOT NULL, "participantId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RealtimeConnection_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "RealtimeConnection_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RealtimeConnection_participantId_expiresAt_idx" ON "RealtimeConnection"("participantId", "expiresAt");
CREATE INDEX "RealtimeConnection_expiresAt_idx" ON "RealtimeConnection"("expiresAt");
