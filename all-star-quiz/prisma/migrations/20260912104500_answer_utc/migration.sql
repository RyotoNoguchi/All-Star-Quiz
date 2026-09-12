ALTER TABLE "AnswerSubmission" ALTER COLUMN "receivedAt" SET DEFAULT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC');
