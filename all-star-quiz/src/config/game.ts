/**
 * All Star Quiz ゲーム設定
 */

export const GAME_CONFIG = {
  // タイマー設定
  COUNTDOWN_DURATION: 10, // 秒
  COUNTDOWN_URGENT_THRESHOLD: 3, // 秒 (この時間以下で緊急表示)
  
  // 選択肢設定
  CHOICES: ['A', 'B', 'C', 'D'] as const,
  
  // アニメーション設定
  ANIMATIONS: {
    QUIZ_PULSE: 'quiz-pulse 2s infinite',
    QUIZ_SHAKE: 'quiz-shake 0.5s ease-in-out',
    QUIZ_BOUNCE: 'quiz-bounce 0.6s ease-in-out',
  },
  
  // UI設定
  UI: {
    GRADIENT_BACKGROUND: 'bg-gradient-to-br from-blue-50 to-indigo-100',
    GAME_GRADIENT_BACKGROUND: 'bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900',
    CARD_BACKDROP: 'bg-white/5 backdrop-blur border-white/10',
  },
  
  // ゲームルール
  RULES: {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 20,
    ELIMINATION_ON_WRONG: true,
    ELIMINATION_ON_TIMEOUT: true,
    FINAL_QUESTION_FASTEST_WINS: true, // 最終問題は最速正解者が勝利
  },
  
  // 音響効果設定
  AUDIO: {
    COUNTDOWN_TICK: true,
    CORRECT_SOUND: true,
    INCORRECT_SOUND: true,
    FINAL_BELL: true,
    ELIMINATION_SOUND: true,
  },
  
  // 開発設定
  DEV: {
    SHOW_ANSWER_IN_DEV: process.env.NODE_ENV === 'development',
    EXTENDED_TIMER_IN_DEV: process.env.NODE_ENV === 'development' ? 30 : 10,
  },
} as const

// 型エクスポート
export type Choice = typeof GAME_CONFIG.CHOICES[number]
export type AnimationName = keyof typeof GAME_CONFIG.ANIMATIONS

// ユーティリティ関数
export const getChoiceLabel = (choice: Choice): string => {
  const labels = {
    A: '①',
    B: '②', 
    C: '③',
    D: '④'
  }
  return labels[choice]
}

export const getChoiceColor = (choice: Choice): string => {
  const colors = {
    A: 'bg-red-500 hover:bg-red-600',
    B: 'bg-blue-500 hover:bg-blue-600',
    C: 'bg-green-500 hover:bg-green-600',
    D: 'bg-yellow-500 hover:bg-yellow-600'
  }
  return colors[choice]
}

export const isValidChoice = (value: string): value is Choice => {
  return GAME_CONFIG.CHOICES.includes(value as Choice)
}