export type ResultPresentation = {
  eventId: string;
  gameId: string;
  questionId: string;
  startedAt: number;
  isFinal: boolean;
  newlyEliminatedIds: string[];
};
export const resultStage = (
  presentation: ResultPresentation | null,
  reducedMotion: boolean,
  now: number
) =>
  !presentation || reducedMotion
    ? 3
    : Math.min(
        3,
        Math.max(0, Math.floor((now - presentation.startedAt) / 900))
      );
