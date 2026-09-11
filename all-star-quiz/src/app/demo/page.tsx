'use client';

import { useState, type FC } from 'react';
import { GameLayout } from '@/components/layout/GameLayout';
import { QuizButton } from '@/components/game/QuizButton';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GameErrorBoundary } from '@/components/layout/ErrorBoundary';
import { GAME_CONFIG, type Choice } from '@/config/game';

const Home: FC = () => {
  const [timerKey, setTimerKey] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<Choice | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isTimerActive, setIsTimerActive] = useState(false);

  const sampleQuestion = {
    question: 'オールスター感謝祭で最も人気のあるクイズ形式は？',
    choices: {
      A: '早押しクイズ',
      B: 'サバイバルクイズ',
      C: '漢字クイズ',
      D: '常識クイズ',
    } as Record<Choice, string>,
    answer: 'B' as Choice,
  };

  const handleAnswerSelect = (choice: Choice) => {
    if (!showResult) {
      setSelectedAnswer(choice);
    }
  };

  const handleTimeUp = () => {
    setShowResult(true);
    setIsTimerActive(false);
  };

  const startDemo = () => {
    setSelectedAnswer(null);
    setShowResult(false);
    setIsTimerActive(true);
  };

  const resetDemo = () => {
    setTimerKey((value) => value + 1);
    setSelectedAnswer(null);
    setShowResult(false);
    setIsTimerActive(false);
  };

  return (
    <GameErrorBoundary>
      <GameLayout title="🌟 All Star Quiz - Demo">
        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold gradient-text mb-4">
              Welcome to All Star Quiz!
            </h2>
            <p className="text-white/80 text-lg">
              オールスター感謝祭風サバイバルクイズアプリケーション
            </p>
          </div>

          <Card className="p-6 bg-white/5 backdrop-blur border-white/10">
            <div className="space-y-6">
              <div className="text-center">
                <CountdownTimer
                  key={timerKey}
                  duration={GAME_CONFIG.COUNTDOWN_DURATION}
                  onTimeUp={handleTimeUp}
                  isActive={isTimerActive}
                />
              </div>

              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-6">
                  {sampleQuestion.question}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(sampleQuestion.choices).map(
                  ([choice, text]) => (
                    <QuizButton
                      key={choice}
                      choice={choice as Choice}
                      onClick={handleAnswerSelect}
                      disabled={!isTimerActive || showResult}
                      isSelected={selectedAnswer === choice}
                      isCorrect={choice === sampleQuestion.answer}
                      showResult={showResult}
                    >
                      {text}
                    </QuizButton>
                  )
                )}
              </div>

              <div className="flex justify-center gap-4">
                <Button
                  onClick={startDemo}
                  disabled={isTimerActive}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Start Demo
                </Button>
                <Button
                  onClick={resetDemo}
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  Reset
                </Button>
              </div>

              {showResult && (
                <div className="text-center p-4 bg-white/10 rounded-lg">
                  <p className="text-lg font-semibold">
                    {selectedAnswer === sampleQuestion.answer
                      ? '🎉 正解！サバイバルクイズが一番人気です！'
                      : selectedAnswer
                        ? '❌ 不正解...正解は B: サバイバルクイズでした'
                        : '⏰ 時間切れ！正解は B: サバイバルクイズでした'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          <div className="text-center text-white/60 text-sm">
            <p>Built with Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui</p>
          </div>
        </div>
      </GameLayout>
    </GameErrorBoundary>
  );
};

export default Home;
