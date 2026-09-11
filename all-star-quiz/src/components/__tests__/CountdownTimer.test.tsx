import { render, screen, act } from '@testing-library/react';
import { CountdownTimer } from '../game/CountdownTimer';

// Mock timers
vi.useFakeTimers();

describe('CountdownTimer', () => {
  const mockOnTimeUp = vi.fn();
  const mockOnTick = vi.fn();

  beforeEach(() => {
    mockOnTimeUp.mockClear();
    mockOnTick.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('renders correctly with initial duration', () => {
    render(
      <CountdownTimer duration={10} onTimeUp={mockOnTimeUp} isActive={false} />
    );

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('seconds remaining')).toBeInTheDocument();
  });

  it('counts down when active', () => {
    render(
      <CountdownTimer
        duration={5}
        onTimeUp={mockOnTimeUp}
        isActive={true}
        onTick={mockOnTick}
      />
    );

    // Initial state
    expect(screen.getByText('5')).toBeInTheDocument();

    // Advance timer by 1 second (10 intervals of 100ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(mockOnTick).toHaveBeenCalled();
  });

  it('calls onTimeUp when timer reaches zero', () => {
    render(
      <CountdownTimer duration={1} onTimeUp={mockOnTimeUp} isActive={true} />
    );

    // Advance timer to completion
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockOnTimeUp).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows urgent state when time is low', () => {
    render(
      <CountdownTimer duration={2} onTimeUp={mockOnTimeUp} isActive={true} />
    );

    expect(screen.getByText('2')).toHaveClass('text-red-400', 'animate-pulse');
  });

  it('does not count down when inactive', () => {
    render(
      <CountdownTimer duration={5} onTimeUp={mockOnTimeUp} isActive={false} />
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(mockOnTimeUp).not.toHaveBeenCalled();
  });
});

it('finishes only once even when the parent keeps the timer active', () => {
  const onTimeUp = vi.fn();
  const { unmount } = render(
    <CountdownTimer duration={1} isActive onTimeUp={onTimeUp} />
  );
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(onTimeUp).toHaveBeenCalledTimes(1);
  expect(screen.getByText('0')).toBeInTheDocument();
  unmount();
});

it('starts a new full countdown after reactivation', () => {
  const onTimeUp = vi.fn();
  const { rerender, unmount } = render(
    <CountdownTimer duration={2} isActive onTimeUp={onTimeUp} />
  );
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  rerender(
    <CountdownTimer duration={2} isActive={false} onTimeUp={onTimeUp} />
  );
  expect(screen.getByText('0')).toBeInTheDocument();
  rerender(<CountdownTimer duration={2} isActive onTimeUp={onTimeUp} />);
  expect(screen.getByText('2')).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(onTimeUp).toHaveBeenCalledTimes(2);
  unmount();
});
