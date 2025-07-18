'use client';

import { useEffect, useState, type FC } from 'react';
import { Progress } from '@/components/ui/progress';
import { GAME_CONFIG } from '@/config/game';

type Props = {
  duration: number; // in seconds
  onTimeUp: () => void;
  isActive: boolean;
  onTick?: (timeLeft: number) => void;
}

export const CountdownTimer: FC<Props> = (props) => {
  const { duration, isActive, onTimeUp, onTick } = props;
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!isActive) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 0.1;
        onTick?.(newTime);
        
        if (newTime <= 0) {
          onTimeUp();
          return 0;
        }
        return newTime;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isActive, onTimeUp, onTick]);

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  const progressValue = (timeLeft / duration) * 100;
  const isUrgent = timeLeft <= GAME_CONFIG.COUNTDOWN_URGENT_THRESHOLD;

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="text-center">
        <div 
          className={`text-6xl font-bold transition-colors duration-200 ${
            isUrgent ? 'text-red-400 animate-pulse' : 'text-white'
          }`}
        >
          {Math.ceil(Math.max(0, timeLeft))}
        </div>
        <p className="text-white/80 text-lg">seconds remaining</p>
      </div>
      
      <Progress 
        value={progressValue} 
        className={`h-3 transition-colors duration-200 ${
          isUrgent ? 'bg-red-900/50' : 'bg-white/20'
        }`}
      />
    </div>
  );
}