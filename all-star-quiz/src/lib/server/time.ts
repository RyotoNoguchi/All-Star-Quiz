import type { Prisma } from '@prisma/client';
export const databaseTime = async (tx: Prisma.TransactionClient) => {
  const rows = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC') AS now`;
  return rows[0]!.now;
};
