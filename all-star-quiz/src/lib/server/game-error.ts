export class GameFlowError extends Error {
  constructor(
    public reason:
      | 'GAME_NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_PHASE'
      | 'STALE_VERSION'
      | 'REQUEST_CONFLICT'
      | 'INVALID_SETUP'
      | 'PLAYER_ELIMINATED'
      | 'ANSWER_CLOSED'
      | 'ALREADY_ANSWERED',
    message: string
  ) {
    super(message);
  }
}
