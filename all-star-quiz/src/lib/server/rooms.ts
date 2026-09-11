import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Room, RoomView } from '@/types/room';
import { GAME_CONFIG } from '@/config/game';

type StoredRoom = Room & { members: Record<string, string> };
type State = Record<string, StoredRoom>;
export class RoomError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

// One shared queue per Node process, including development hot reloads.
const globalStore = globalThis as typeof globalThis & {
  roomQueue?: Promise<unknown>;
};
const filePath = () =>
  process.env.ROOM_STORE_PATH || join(process.cwd(), '.data', 'rooms.json');
const transact = <T>(operation: (state: State) => T): Promise<T> => {
  const next = (globalStore.roomQueue || Promise.resolve()).then(async () => {
    const file = filePath();
    await mkdir(dirname(file), { recursive: true });
    const state: State = await readFile(file, 'utf8')
      .then(JSON.parse)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return {};
        throw error;
      });
    for (const [code, room] of Object.entries(state)) {
      if (Date.now() - room.createdAt > 24 * 60 * 60 * 1000) delete state[code];
    }
    const result = operation(state);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, file);
    return result;
  });
  globalStore.roomQueue = next.catch(() => undefined);
  return next;
};
const validateName = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 20) {
    throw new RoomError('名前を1〜20文字で入力してください。');
  }
  return value.trim();
};
const getRoom = (state: State, code: string) => {
  if (!/^[A-F0-9]{6}$/.test(code))
    throw new RoomError('6文字のルームコードを入力してください。');
  const room = state[code];
  if (!room)
    throw new RoomError(
      'ルームが見つかりません。コードを確認してください。',
      404
    );
  return room;
};
const view = (room: StoredRoom, token: string): RoomView => {
  const playerId = room.members[token];
  if (!playerId) throw new RoomError('このルームに参加してください。', 403);
  return {
    room: {
      code: room.code,
      phase: room.phase,
      createdAt: room.createdAt,
      players: room.players,
    },
    playerId,
  };
};
export const createRoom = (name: unknown, token: string) =>
  transact((state) => {
    const playerName = validateName(name);
    let code = randomBytes(3).toString('hex').toUpperCase();
    while (state[code]) code = randomBytes(3).toString('hex').toUpperCase();
    const id = randomUUID();
    const room: StoredRoom = {
      code,
      phase: 'waiting',
      createdAt: Date.now(),
      players: [{ id, name: playerName, isHost: true }],
      members: { [token]: id },
    };
    state[code] = room;
    return view(room, token);
  });
export const joinRoom = (code: string, name: unknown, token: string) =>
  transact((state) => {
    const playerName = validateName(name);
    const room = getRoom(state, code);
    if (room.members[token]) return view(room, token);
    if (room.players.length >= GAME_CONFIG.RULES.MAX_PLAYERS)
      throw new RoomError('ルームは満員です。', 409);
    if (room.players.some((player) => player.name === playerName))
      throw new RoomError(
        'その名前は使用されています。別の名前を入力してください。',
        409
      );
    const id = randomUUID();
    room.players.push({ id, name: playerName, isHost: false });
    room.members[token] = id;
    return view(room, token);
  });
export const readRoom = (code: string, token: string) =>
  transact((state) => view(getRoom(state, code), token));
export const leaveRoom = (code: string, token: string) =>
  transact((state) => {
    const room = getRoom(state, code);
    const { playerId } = view(room, token);
    room.players = room.players.filter((player) => player.id !== playerId);
    delete room.members[token];
    if (!room.players.length) delete state[code];
    else if (!room.players.some((player) => player.isHost))
      room.players[0]!.isHost = true;
    return { ok: true };
  });
