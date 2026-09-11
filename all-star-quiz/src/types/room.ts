export type Room = {
  code: string;
  phase: 'waiting';
  createdAt: number;
  players: { id: string; name: string; isHost: boolean }[];
};
export type RoomView = { room: Room; playerId: string };
