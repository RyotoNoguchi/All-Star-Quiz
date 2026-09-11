import type {
  Player,
  PublicPlayer,
  PublicQuestion,
  Question,
} from '@/types/game';

// TypeScriptの構造的型付けだけでは余分なプロパティを除去できないため、
// 公開データは許可したフィールドのみを新しいオブジェクトにコピーする。
export const toPublicQuestion = (question: Question): PublicQuestion => ({
  id: question.id,
  question: question.question,
  choices: { ...question.choices },
  ...(question.category !== undefined ? { category: question.category } : {}),
});

export const toPublicPlayer = (player: Player): PublicPlayer => ({
  id: player.id,
  name: player.name,
  isHost: player.isHost,
  isEliminated: player.isEliminated,
  ...(player.eliminationReason !== undefined
    ? { eliminationReason: player.eliminationReason }
    : {}),
  ...(player.leftAt !== undefined ? { leftAt: player.leftAt } : {}),
});
