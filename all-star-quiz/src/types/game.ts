import { type Choice } from '@/config/game'

/**
 * All Star Quiz 型定義
 */

// ゲーム基本型
export type GamePhase = 'waiting' | 'playing' | 'results' | 'finished'
export type GameMode = 'practice' | 'multiplayer' | 'tournament'
export type QuestionType = 'normal' | 'final' // 通常問題 or 最終問題

// 問題関連
export type Question = {
  id: string
  question: string
  choices: Record<Choice, string>
  answer: Choice
  timeLimit: number
  type: QuestionType
  category?: string
  difficulty?: 'easy' | 'normal' | 'hard'
  explanation?: string
}

// プレイヤー関連
export type Player = {
  id: string
  name: string
  avatar?: string
  isHost: boolean
  isEliminated: boolean
  score: number
  answeredAt?: number // 回答時刻 (タイムスタンプ)
  currentAnswer?: Choice
}

// ゲーム状態
export type GameState = {
  id: string
  phase: GamePhase
  mode: GameMode
  currentQuestionIndex: number
  questions: Question[]
  players: Player[]
  hostId: string
  settings: GameSettings
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

// ゲーム設定
export type GameSettings = {
  maxPlayers: number
  timeLimit: number // デフォルトの制限時間
  eliminationMode: boolean
  showCorrectAnswer: boolean
  allowReconnection: boolean
  audioCues: boolean
}

// 回答関連
export type Answer = {
  playerId: string
  questionId: string
  choice: Choice
  answeredAt: number
  responseTime: number // ミリ秒
  isCorrect: boolean
}

// ゲーム結果
export type GameResult = {
  gameId: string
  winnerId?: string
  finalRanking: Player[]
  totalQuestions: number
  completedAt: string
  statistics: GameStatistics
}

export type GameStatistics = {
  totalPlayers: number
  totalAnswers: number
  averageResponseTime: number
  questionStats: QuestionStatistics[]
}

export type QuestionStatistics = {
  questionId: string
  correctAnswers: number
  totalAnswers: number
  averageResponseTime: number
  choiceDistribution: Record<Choice, number>
}

// UI状態型
export type QuizButtonState = 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled'
export type TimerState = 'normal' | 'urgent' | 'expired'

// イベント型
export type GameEvent = 
  | { type: 'PLAYER_JOINED'; payload: Player }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string } }
  | { type: 'GAME_STARTED'; payload: GameState }
  | { type: 'QUESTION_STARTED'; payload: { question: Question; timeLimit: number } }
  | { type: 'ANSWER_SUBMITTED'; payload: Answer }
  | { type: 'QUESTION_ENDED'; payload: { results: Answer[]; correctAnswer: Choice } }
  | { type: 'PLAYER_ELIMINATED'; payload: { playerId: string; reason: 'wrong' | 'timeout' } }
  | { type: 'GAME_ENDED'; payload: GameResult }

// API型
export type CreateGameRequest = {
  hostName: string
  settings: Partial<GameSettings>
  questions?: Question[]
}

export type JoinGameRequest = {
  gameId: string
  playerName: string
}

export type SubmitAnswerRequest = {
  gameId: string
  playerId: string
  questionId: string
  choice: Choice
  answeredAt: number
}

// エラー型
export type GameError = {
  code: 'GAME_NOT_FOUND' | 'GAME_FULL' | 'GAME_ALREADY_STARTED' | 'INVALID_ANSWER' | 'PLAYER_ELIMINATED'
  message: string
  details?: unknown
}

// Utility Types
export type PartialGameState = Partial<GameState>
export type PlayerWithoutId = Omit<Player, 'id'>
export type QuestionWithoutId = Omit<Question, 'id'>

// Type Guards
export const isValidGamePhase = (phase: string): phase is GamePhase => {
  return ['waiting', 'playing', 'results', 'finished'].includes(phase)
}

export const isValidChoice = (choice: string): choice is Choice => {
  return ['A', 'B', 'C', 'D'].includes(choice)
}

export const isPlayerEliminated = (player: Player): boolean => {
  return player.isEliminated
}

export const isGameActive = (gameState: GameState): boolean => {
  return gameState.phase === 'playing'
}

export const isFinalQuestion = (question: Question): boolean => {
  return question.type === 'final'
}