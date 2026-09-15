const KEY = 'quiz-last-history-game';
const valid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
// A navigation preference only. Authentication and result data never live here.
export const readLastHistoryGame = () => {
  try {
    const value = localStorage.getItem(KEY);
    return value && valid(value) ? value : null;
  } catch {
    return null;
  }
};
export const rememberHistoryGame = (gameId: string | null) => {
  try {
    if (gameId && valid(gameId)) localStorage.setItem(KEY, gameId);
    else localStorage.removeItem(KEY);
  } catch {}
};
