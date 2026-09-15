import {
  readLastHistoryGame,
  rememberHistoryGame,
} from '../history-preference';
it('stores only a valid navigation id and tolerates deletion or invalid input', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  rememberHistoryGame(id);
  expect(readLastHistoryGame()).toBe(id);
  rememberHistoryGame('invalid');
  expect(readLastHistoryGame()).toBeNull();
  rememberHistoryGame(null);
  expect(readLastHistoryGame()).toBeNull();
});
