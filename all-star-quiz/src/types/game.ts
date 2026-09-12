import { type Choice } from '@/config/game';

/**
 * All Star Quiz 型定義
 */

// ゲーム基本型
export type GamePhase =
  | 'waiting'
  | 'playing'
  | 'closing'
  | 'results'
  | 'finished';
export type GameMode = 'practice' | 'multiplayer' | 'tournament';
export type QuestionType = 'normal' | 'final'; // 通常問題 or 最終問題

// 問題関連
export type Question = {
  id: string;
  question: string;
  choices: Record<Choice, string>;
  choiceImages?: Partial<Record<Choice, { url: string; alt: string }>>;
  answer: Choice;
  timeLimit: 10;
  type: QuestionType;
  category?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  explanation?: string;
};

// プレイヤー関連
export type Player = {
  id: string;
  name: string;
  avatar?: string;
  isHost: boolean;
  isEliminated: boolean;
  score: number;
  answeredAt?: number; // サーバー受付時刻 (Unix ms)
  eliminationReason?: EliminationReason;
  leftAt?: number;
  currentAnswer?: Choice;
};

// ゲーム状態
export type GameState = {
  id: string;
  phase: GamePhase;
  mode: GameMode;
  currentQuestionIndex: number;
  questions: Question[];
  players: Player[];
  hostId: string;
  settings: GameSettings;
  version: number;
  currentRound?: { questionId: string; startedAt: number; deadlineAt: number };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

// ゲーム設定
export type GameSettings = {
  maxPlayers: number;
  timeLimit: 10; // デフォルトの制限時間
  eliminationMode: true;
  showCorrectAnswer: true; // 結果発表後のみ
  allowReconnection: true;
  audioCues: boolean;
};

// 回答関連
export type Answer = {
  playerId: string;
  questionId: string;
  choice: Choice;
  answeredAt: number; // サーバー受付時刻 (Unix ms)
  requestId: string;
  acceptanceSequence: number; // ルーム内の原子的受付連番
  responseTime: number; // ミリ秒
  isCorrect: boolean;
};

// ゲーム結果
export type GameResult = {
  gameId: string;
  winnerId?: string;
  reason: FinishReason;
  finalRanking: RankingEntry[];
  totalQuestions: number;
  completedAt: string;
  statistics: GameStatistics;
};

export type GameStatistics = {
  totalPlayers: number;
  totalAnswers: number;
  averageResponseTime: number;
  questionStats: QuestionStatistics[];
};

export type QuestionStatistics = {
  questionId: string;
  correctAnswers: number;
  totalAnswers: number;
  averageResponseTime: number;
  choiceDistribution: Record<Choice, number>;
};

// UI状態型
export type QuizButtonState =
  | 'default'
  | 'selected'
  | 'correct'
  | 'incorrect'
  | 'disabled';
export type TimerState = 'normal' | 'urgent' | 'expired';

// 内部状態は直接配信しない。公開出題から正解・最終フラグ・解説を除く。
export type EliminationReason = 'wrong' | 'timeout' | 'slowest' | 'left';
export type FinishReason =
  | 'final_question'
  | 'all_eliminated'
  | 'all_left'
  | 'cancelled'
  | 'expired';
export type RankingEntry = {
  playerId: string;
  rank: number;
  survivedQuestions: number;
};
export type PublicQuestion = Pick<
  Question,
  'id' | 'question' | 'choices' | 'choiceImages' | 'category'
>;
export type PublicPlayer = Pick<
  Player,
  'id' | 'name' | 'isHost' | 'isEliminated' | 'eliminationReason' | 'leftAt'
>;
export type QuestionResult = {
  questionId: string;
  correctAnswer: Choice;
  explanation?: string;
  isFinal: boolean;
  answers: Answer[];
  players: PublicPlayer[];
  winnerId?: string;
};
export type GameSnapshot = {
  gameId: string;
  version: number;
  serverTime: number;
  phase: GamePhase;
  players: PublicPlayer[];
  hostId: string;
  question?: PublicQuestion;
  startedAt?: number;
  deadlineAt?: number;
  answerCount: number;
  lastResult?: QuestionResult; // 発表済み結果のみ
  result?: GameResult;
};
export type AnswerReceipt = {
  requestId: string;
  questionId: string;
  choice: Choice;
  answeredAt: number;
  responseTime: number;
};
export type PrivateGameSnapshot = GameSnapshot & {
  playerId: string;
  ownAnswer?: AnswerReceipt;
};
export type GameEvent = {
  gameId: string;
  eventId: string;
  version: number;
  serverTime: number;
} & (
  | { type: 'STATE_SYNC'; payload: GameSnapshot }
  | {
      type: 'QUESTION_STARTED';
      payload: {
        question: PublicQuestion;
        startedAt: number;
        deadlineAt: number;
      };
    }
  | {
      type: 'ANSWER_COUNT_UPDATED';
      payload: { questionId: string; answerCount: number };
    }
  | { type: 'QUESTION_CLOSED'; payload: { questionId: string } }
  | { type: 'QUESTION_ENDED'; payload: QuestionResult }
  | {
      type: 'GAME_ENDED';
      payload: { result: GameResult; lastResult?: QuestionResult };
    }
);
// 本人限定の応答は部屋へのブロードキャスト型に含めない。
export type AnswerAccepted = {
  type: 'ANSWER_ACCEPTED';
  payload: AnswerReceipt;
};
export type HostCommand = {
  gameId: string;
  requestId: string;
  expectedVersion: number;
  action: 'start' | 'next' | 'cancel';
};

// API型
export type CreateGameRequest = {
  hostName: string;
  settings: Partial<GameSettings>;
  questions?: Question[];
};

export type JoinGameRequest = {
  gameId: string;
  playerName: string;
};

export type SubmitAnswerRequest = {
  gameId: string;
  requestId: string; // UUID。本人はセッションから解決する
  questionId: string;
  choice: Choice;
};

// エラー型
export type GameError = {
  code:
    | 'GAME_NOT_FOUND'
    | 'GAME_FULL'
    | 'GAME_ALREADY_STARTED'
    | 'INVALID_ANSWER'
    | 'PLAYER_ELIMINATED'
    | 'INVALID_PHASE'
    | 'FORBIDDEN'
    | 'ANSWER_CLOSED'
    | 'REQUEST_CONFLICT'
    | 'ALREADY_ANSWERED'
    | 'STALE_VERSION';
  message: string;
  details?: unknown;
};

// Utility Types
export type PartialGameState = Partial<GameState>;
export type PlayerWithoutId = Omit<Player, 'id'>;
export type QuestionWithoutId = Omit<Question, 'id'>;

// Type Guards
export const isValidGamePhase = (phase: string): phase is GamePhase => {
  return ['waiting', 'playing', 'closing', 'results', 'finished'].includes(
    phase
  );
};

export const isValidChoice = (choice: string): choice is Choice => {
  return ['A', 'B', 'C', 'D'].includes(choice);
};

export const isPlayerEliminated = (player: Player): boolean => {
  return player.isEliminated;
};

export const isGameActive = (gameState: GameState): boolean => {
  return gameState.phase === 'playing';
};

export const isFinalQuestion = (question: Question): boolean => {
  return question.type === 'final';
};
