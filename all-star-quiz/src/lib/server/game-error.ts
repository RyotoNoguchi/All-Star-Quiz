export class GameFlowError extends Error {
  constructor(
    public reason:
      | 'GAME_NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_PHASE'
      | 'STALE_VERSION'
      | 'REQUEST_CONFLICT'
      | 'INVALID_SETUP',
    message: string
  ) {
    super(message);
  }
}
