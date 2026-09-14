'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api, apiErrorStatus } from '@/lib/api-client';
import type { AnswerReceipt, PrivateGameSnapshot } from '@/types/game';
import type { Choice } from '@/config/game';
const requestSchema = z.object({
  requestId: z.string().uuid(),
  choice: z.enum(['A', 'B', 'C', 'D']),
});
type Pending = z.infer<typeof requestSchema>;
export const useAnswer = (state: PrivateGameSnapshot) => {
  const questionId = state.question?.id || '';
  const key = `quiz-answer:${state.gameId}:${state.playerId}:${questionId}`;
  const [pending, setPending] = useState<Pending | null>(null);
  const [receipt, setReceipt] = useState<AnswerReceipt | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const request = useRef<Pending | null>(null);
  const inFlight = useRef(false);
  const lifecycle = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = lifecycle.current + 1;
    lifecycle.current = current;
    request.current = null;
    inFlight.current = false;
    setPending(null);
    setReceipt(null);
    setSending(false);
    setError('');
    setRetryable(false);
    try {
      const saved = requestSchema.safeParse(
        JSON.parse(sessionStorage.getItem(key) || 'null')
      );
      if (saved.success) {
        request.current = saved.data;
        setPending(saved.data);
        setRetryable(true);
      }
    } catch {
      /* Storage is optional; in-memory idempotency still applies. */
    }
    return () => {
      lifecycle.current = current + 1;
      activeRequest.current?.abort();
    };
  }, [key]);
  const own =
    state.ownAnswer?.questionId === questionId ? state.ownAnswer : null;
  const accepted = own || receipt;
  useEffect(() => {
    if (accepted) {
      try {
        sessionStorage.removeItem(key);
      } catch {}
    }
  }, [accepted, key]);
  const submit = async (choice?: Choice) => {
    if (inFlight.current || accepted || !questionId) return;
    const next =
      request.current ||
      (choice ? { requestId: crypto.randomUUID(), choice } : null);
    if (!next) return;
    request.current = next;
    setPending(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {}
    const version = lifecycle.current;
    inFlight.current = true;
    setSending(true);
    setRetryable(false);
    setError('');
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await api.answers.submit.mutate(
        {
          gameId: state.gameId,
          questionId,
          ...next,
        },
        { signal: controller.signal }
      );
      if (version === lifecycle.current) setReceipt(result);
    } catch (cause) {
      if (version !== lifecycle.current) return;
      const status = apiErrorStatus(cause);
      const canRetry = status === undefined || status >= 500 || status === 429;
      setRetryable(canRetry);
      setError(
        canRetry
          ? '回答の受付を確認できませんでした。同じ回答を再送してください。'
          : cause instanceof Error
            ? cause.message
            : '回答を送信できませんでした。'
      );
    } finally {
      clearTimeout(timeout);
      if (version === lifecycle.current) {
        inFlight.current = false;
        setSending(false);
      }
    }
  };
  return { accepted, pending, sending, error, retryable, submit };
};
