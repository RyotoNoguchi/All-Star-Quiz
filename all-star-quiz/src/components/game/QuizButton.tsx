import { type ReactNode, type FC, memo, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { type Choice } from '@/config/game';

type Props = {
  choice: Choice;
  children: ReactNode;
  onClick?: (choice: Choice) => void;
  disabled?: boolean;
  isSelected?: boolean;
  isCorrect?: boolean;
  showResult?: boolean;
};

export const QuizButton: FC<Props> = memo(function QuizButton(props) {
  const { onClick, choice } = props;

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(choice);
    }
  }, [onClick, choice]);

  const buttonVariant = useMemo(() => {
    if (props.showResult) {
      if (props.isSelected && props.isCorrect) return 'default';
      if (props.isSelected && !props.isCorrect) return 'destructive';
      if (props.isCorrect) return 'default';
      return 'outline';
    }
    return props.isSelected ? 'default' : 'outline';
  }, [props.showResult, props.isSelected, props.isCorrect]);

  const buttonClassName = useMemo(() => {
    let baseClasses =
      'w-full h-16 text-lg font-semibold transition-all duration-200 border-2';

    if (props.showResult) {
      if (props.isSelected && props.isCorrect) {
        baseClasses +=
          ' bg-green-500 hover:bg-green-600 border-green-400 text-white animate-quiz-bounce';
      } else if (props.isSelected && !props.isCorrect) {
        baseClasses +=
          ' bg-red-500 hover:bg-red-600 border-red-400 text-white animate-quiz-shake';
      } else if (props.isCorrect) {
        baseClasses += ' bg-green-500/20 border-green-400 text-green-100';
      } else {
        baseClasses += ' bg-gray-500/20 border-gray-400 text-gray-300';
      }
    } else {
      if (props.isSelected) {
        baseClasses +=
          ' bg-blue-500 hover:bg-blue-600 border-blue-400 text-white scale-105 animate-quiz-pulse';
      } else {
        baseClasses +=
          ' bg-white/10 hover:bg-white/20 border-white/30 text-white hover:scale-105';
      }
    }

    return baseClasses;
  }, [props.showResult, props.isSelected, props.isCorrect]);

  return (
    <Button
      variant={buttonVariant}
      className={buttonClassName}
      onClick={handleClick}
      disabled={props.disabled}
      aria-label={`選択肢${props.choice}: ${props.children}`}
      aria-pressed={props.isSelected}
      aria-describedby={
        props.showResult && props.isCorrect ? 'correct-answer' : undefined
      }
    >
      <span className="mr-3 font-bold text-xl" aria-hidden="true">
        {props.choice}
      </span>
      <span className="flex-1 text-left">{props.children}</span>
      {props.showResult && props.isCorrect && (
        <span className="ml-2 text-green-200" aria-label="正解">
          ✓
        </span>
      )}
      {props.showResult && props.isSelected && !props.isCorrect && (
        <span className="ml-2 text-red-200" aria-label="不正解">
          ✗
        </span>
      )}
    </Button>
  );
});
