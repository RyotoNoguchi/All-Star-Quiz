import type { EliminationReason, FinishReason } from '@/types/game';
export const eliminationLabels: Record<EliminationReason, string> = {
  wrong: '不正解のため脱落しました。',
  timeout: '時間内に回答が届かなかったため脱落しました。',
  slowest: '正解者の中で回答が最も遅かったため脱落しました。',
  left: 'ルームから退出しました。',
};
export const finishLabels: Record<FinishReason, string> = {
  final_question: '最終問題が終了しました。',
  all_eliminated: '生存者がいなくなったため終了しました。',
  all_left: '全員が退出したため終了しました。',
  cancelled: 'ホストがゲームを終了しました。',
  expired: 'ルームの有効期限が切れたため終了しました。',
};
