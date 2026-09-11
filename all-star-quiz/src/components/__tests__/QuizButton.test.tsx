import { render, screen, fireEvent } from '@testing-library/react';
import { QuizButton } from '../game/QuizButton';

describe('QuizButton', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  it('renders correctly with choice and text', () => {
    render(
      <QuizButton choice="A" onClick={mockOnClick}>
        Test Answer
      </QuizButton>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Test Answer')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    render(
      <QuizButton choice="B" onClick={mockOnClick}>
        Test Answer
      </QuizButton>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <QuizButton choice="C" onClick={mockOnClick} disabled>
        Test Answer
      </QuizButton>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('shows selected state correctly', () => {
    render(
      <QuizButton choice="D" onClick={mockOnClick} isSelected>
        Test Answer
      </QuizButton>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('scale-105');
  });

  it('shows correct result state when showResult is true', () => {
    render(
      <QuizButton
        choice="A"
        onClick={mockOnClick}
        isSelected
        isCorrect
        showResult
      >
        Correct Answer
      </QuizButton>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-green-500');
  });

  it('shows incorrect result state when showResult is true', () => {
    render(
      <QuizButton
        choice="B"
        onClick={mockOnClick}
        isSelected
        isCorrect={false}
        showResult
      >
        Wrong Answer
      </QuizButton>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-red-500');
  });
});
