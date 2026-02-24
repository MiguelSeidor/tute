import { randomBytes } from 'crypto';
import type { Room, RoomPlayer, RoomListItem, Seat } from '@shared/types';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private userToRoom = new Map<string, string>();

  createRoom(userId: string, username: string, name: string, piedras: 3 | 5, maxPlayers: 3 | 4 = 4): Room {
    if (this.userToRoom.has(userId)) {
      throw new Error('Ya estás en una sala');
    }

    const roomId = randomBytes(6).toString('hex');

    const player: RoomPlayer = {
      userId,
      username,
      seat: 0 as Seat,
      ready: false,
      connected: true,
    };

    const room: Room = {
      id: roomId,
      name,
      hostUserId: userId,
      piedras,
      maxPlayers,
      players: [player],
      status: 'waiting',
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.userToRoom.set(userId, roomId);
    return room;
  }

  joinRoom(roomId: string, userId: string, username: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Sala no encontrada');
    if (room.status !== 'waiting') throw new Error('La partida ya ha comenzado');
    if (room.players.length >= room.maxPlayers) throw new Error('Sala llena');
    if (room.players.some(p => p.userId === userId)) throw new Error('Ya estás en esta sala');

    const existing = this.userToRoom.get(userId);
    if (existing && existing !== roomId) throw new Error('Ya estás en otra sala');

    // Assign next available seat
    const taken = new Set(room.players.map(p => p.seat));
    let seat: Seat | null = null;
    for (const s of [0, 1, 2, 3] as Seat[]) {
      if (!taken.has(s)) { seat = s; break; }
    }

    const player: RoomPlayer = {
      userId,
      username,
      seat,
      ready: false,
      connected: true,
    };

    room.players.push(player);
    this.userToRoom.set(userId, roomId);
    return room;
  }

  leaveRoom(userId: string): { room: Room | null; deleted: boolean } {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return { room: null, deleted: false };

    const room = this.rooms.get(roomId);
    if (!room) {
      this.userToRoom.delete(userId);
      return { room: null, deleted: false };
    }

    room.players = room.players.filter(p => p.userId !== userId);
    this.userToRoom.delete(userId);

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return { room: null, deleted: true };
    }

    // Transfer host if needed
    if (room.hostUserId === userId) {
      room.hostUserId = room.players[0].userId;
    }

    return { room, deleted: false };
  }

  setReady(userId: string, ready: boolean): Room {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) throw new Error('No estás en ninguna sala');

    const room = this.rooms.get(roomId)!;
    const player = room.players.find(p => p.userId === userId);
    if (!player) throw new Error('No estás en esta sala');

    player.ready = ready;
    return room;
  }

  canStartGame(roomId: string): { ok: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: 'Sala no encontrada' };
    if (room.status !== 'waiting') return { ok: false, reason: 'La partida ya comenzó' };
    if (room.players.length !== room.maxPlayers) return { ok: false, reason: `Se necesitan ${room.maxPlayers} jugadores (hay ${room.players.length})` };
    if (!room.players.every(p => p.ready)) return { ok: false, reason: 'Todos deben estar listos' };
    return { ok: true };
  }

  startGame(roomId: string, userId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Sala no encontrada');
    if (room.hostUserId !== userId) throw new Error('Solo el anfitrión puede iniciar');

    const { ok, reason } = this.canStartGame(roomId);
    if (!ok) throw new Error(reason);

    room.status = 'playing';
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByUser(userId: string): Room | undefined {
    const roomId = this.userToRoom.get(userId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getUserRoomId(userId: string): string | undefined {
    return this.userToRoom.get(userId);
  }

  listRooms(): RoomListItem[] {
    return Array.from(this.rooms.values())
      .filter(r => r.status === 'waiting')
      .map(r => ({
        id: r.id,
        name: r.name,
        hostUsername: r.players.find(p => p.userId === r.hostUserId)?.username || '?',
        playerCount: r.players.length,
        maxPlayers: r.maxPlayers,
        status: r.status,
        piedras: r.piedras,
      }));
  }

  setPlayerConnected(userId: string, connected: boolean): Room | undefined {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const player = room.players.find(p => p.userId === userId);
    if (player) player.connected = connected;
    return room;
  }

  finishGame(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.status = 'finished';
    return room;
  }

  deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const p of room.players) {
      this.userToRoom.delete(p.userId);
    }
    this.rooms.delete(roomId);
  }
}
