import { resultStage, type ResultPresentation } from '../result-presentation';
const live: ResultPresentation = {
  eventId: 'event',
  gameId: 'game',
  questionId: 'question',
  startedAt: 100,
  isFinal: true,
  newlyEliminatedIds: ['player'],
};
it('reveals correct answer, elimination, survivors and winner in order', () => {
  expect(
    [100, 999, 1000, 1900, 2800, 10000].map((now) =>
      resultStage(live, false, now)
    )
  ).toEqual([0, 0, 1, 2, 3, 3]);
});
it('skips delays for snapshots and reduced motion', () => {
  expect(resultStage(null, false, 100)).toBe(3);
  expect(resultStage(live, true, 100)).toBe(3);
});
