export type Sound =
  | 'correct'
  | 'wrong'
  | 'eliminated'
  | 'countdown'
  | 'bell'
  | 'winner'
  | 'bgm';
// Original synthesized motifs. No recordings or third-party music are used.
export const soundNotes: Record<Sound, readonly number[]> = {
  correct: [523.25, 659.25, 783.99],
  wrong: [220, 164.81],
  eliminated: [392, 293.66, 196],
  countdown: [880],
  bell: [523.25, 1046.5, 783.99, 523.25],
  winner: [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5],
  bgm: [130.81, 164.81, 196, 164.81],
};
export const createGameAudio = () => {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.connect(context.destination);
  let volume = 0.25;
  let deadline = 0;
  const nodes = new Set<OscillatorNode>();
  const stop = () => {
    for (const node of nodes) {
      try {
        node.stop();
      } catch {}
      node.disconnect();
    }
    nodes.clear();
  };
  const updateGain = () => {
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(
      performance.now() < deadline ? volume : 0,
      context.currentTime
    );
    gain.gain.setValueAtTime(
      0,
      context.currentTime + Math.max(0, (deadline - performance.now()) / 1000)
    );
  };
  return {
    resume: () => context.resume(),
    stop,
    close: () => {
      stop();
      void context.close();
    },
    setVolume: (value: number) => {
      volume = Math.max(0, Math.min(1, value));
      updateGain();
    },
    setDeadline: (value: number) => {
      deadline = value;
      updateGain();
    },
    play: (sound: Sound) => {
      if (context.state !== 'running' || performance.now() >= deadline) return;
      const step = sound === 'bgm' ? 0.4 : sound === 'bell' ? 0.3 : 0.16;
      soundNotes[sound].forEach((frequency, index) => {
        const when = context.currentTime + index * step;
        const duration = sound === 'bell' ? 0.7 : step * 0.8;
        if (performance.now() + (index * step + duration) * 1000 >= deadline)
          return;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = sound === 'wrong' ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        envelope.gain.setValueAtTime(0, when);
        envelope.gain.linearRampToValueAtTime(
          sound === 'bgm' ? 0.06 : 0.18,
          when + 0.015
        );
        envelope.gain.exponentialRampToValueAtTime(0.001, when + duration);
        oscillator.connect(envelope);
        envelope.connect(gain);
        nodes.add(oscillator);
        oscillator.onended = () => {
          nodes.delete(oscillator);
          oscillator.disconnect();
          envelope.disconnect();
        };
        oscillator.start(when);
        oscillator.stop(when + duration);
      });
    },
  };
};
