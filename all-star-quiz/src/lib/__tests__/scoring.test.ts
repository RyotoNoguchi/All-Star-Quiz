import { normalEliminations, finalOutcome } from '../scoring';
const players = ['a', 'b', 'c'].map((id) => ({
  id,
  isEliminated: false,
  hasLeft: false,
}));
const answer = (
  playerId: string,
  responseTime: number,
  acceptanceSequence: number,
  isCorrect = true
) => ({ playerId, responseTime, acceptanceSequence, isCorrect });
it.each([
  {
    name: 'wrong and timeout',
    answers: [answer('a', 100, 1), answer('b', 200, 2, false)],
    expected: [
      { playerId: 'b', reason: 'wrong' },
      { playerId: 'c', reason: 'timeout' },
    ],
  },
  {
    name: 'only the slowest correct player',
    answers: [answer('a', 100, 1), answer('b', 300, 2), answer('c', 200, 3)],
    expected: [{ playerId: 'b', reason: 'slowest' }],
  },
  {
    name: 'ties resolved by acceptance sequence',
    answers: [answer('a', 100, 1), answer('b', 100, 3), answer('c', 100, 2)],
    expected: [{ playerId: 'b', reason: 'slowest' }],
  },
  {
    name: 'no correct answers',
    answers: [answer('a', 100, 1, false)],
    expected: [
      { playerId: 'a', reason: 'wrong' },
      { playerId: 'b', reason: 'timeout' },
      { playerId: 'c', reason: 'timeout' },
    ],
  },
])('$name', ({ answers, expected }) => {
  expect(normalEliminations(players, answers)).toEqual(expected);
});
it('excludes departed and previously eliminated players from the speed comparison', () => {
  expect(
    normalEliminations(
      [
        { ...players[0]!, hasLeft: true },
        { ...players[1]!, isEliminated: true },
        players[2]!,
      ],
      [answer('a', 500, 1), answer('b', 400, 2), answer('c', 300, 3)]
    )
  ).toEqual([]);
});
it('does not mutate the supplied players or answer ordering', () => {
  const answers = [
    answer('c', 100, 3),
    answer('a', 200, 1),
    answer('b', 300, 2),
  ];
  const before = structuredClone({ players, answers });
  normalEliminations(players, answers);
  expect({ players, answers }).toEqual(before);
});

it('awards the fastest correct finalist and keeps other correct finalists alive', () => {
  expect(
    finalOutcome(players, [
      answer('a', 200, 1),
      answer('b', 100, 3),
      answer('c', 100, 2),
    ])
  ).toEqual({ winnerId: 'c', eliminated: [] });
});
it('has no winner without correct answers and never promotes an eliminated or departed finalist', () => {
  expect(finalOutcome(players, [answer('a', 100, 1, false)])).toEqual({
    winnerId: undefined,
    eliminated: [
      { playerId: 'a', reason: 'wrong' },
      { playerId: 'b', reason: 'timeout' },
      { playerId: 'c', reason: 'timeout' },
    ],
  });
  expect(
    finalOutcome(
      [
        { ...players[0]!, hasLeft: true },
        { ...players[1]!, isEliminated: true },
        players[2]!,
      ],
      [answer('a', 10, 1), answer('b', 20, 2), answer('c', 30, 3)]
    )
  ).toEqual({ winnerId: 'c', eliminated: [] });
});
