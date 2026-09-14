'use client';
import { useEffect, useState } from 'react';
export const useReducedMotion = () => {
  const [system, setSystem] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    try {
      setManual(localStorage.getItem('quiz-reduced-motion') === 'true');
    } catch {}
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystem(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const setReducedMotion = (value: boolean) => {
    setManual(value);
    try {
      localStorage.setItem('quiz-reduced-motion', String(value));
    } catch {}
  };
  return { reducedMotion: system || manual, system, setReducedMotion };
};
