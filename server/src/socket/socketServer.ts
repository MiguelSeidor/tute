import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as cookie from 'cookie';
import { verifyToken } from '../utils/auth.js';
import { prisma } from '../db/client.js';
import { RoomManager } from '../managers/RoomManager.js';
import { GameManager } from '../managers/GameManager.js';
import type { CreateRoomRequest, GameActionRequest, Seat } from '@shared/types';
import { FRASES_PERMITIDAS } from '@shared/constants';

interface AuthSocket extends Socket {
  userId: string;
  username: string;
}

export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: process.env.NODE_ENV === 'production'
      ? {}
      : { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true },
  });

  const roomManager = new RoomManager();
  const gameManager = new GameManager();
  const pendingTrickRooms = new Set<string>(); // rooms waiting for trick resolution delay
  const userSockets = new Map<string, Set<string>>(); // userId → set of socketIds

  // ── Auth middleware ──────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie;
      if (!raw) return next(new Error('No autenticado'));

      const cookies = cookie.parse(raw);
      const token = cookies.auth_token;
      if (!token) return next(new Error('No autenticado'));

      const decoded = verifyToken(token);
      if (!decoded) return next(new Error('Token inválido'));

      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) return next(new Error('Usuario no encontrado'));

      (socket as AuthSocket).userId = user.id;
      (socket as AuthSocket).username = user.username;
      next();
    } catch {
      next(new Error('Error de autenticación'));
    }
  });

  // ── Helper: broadcast game views to all players in room ──
  function broadcastGameViews(roomId: string) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    for (const player of room.players) {
      try {
        const view = gameManager.createPlayerView(roomId, player.userId, room);
        // Emit to ALL sockets for this user (supports multiple sessions)
        const socketIds = userSockets.get(player.userId);
        if (socketIds) {
          for (const sid of socketIds) {
            const s = io.sockets.sockets.get(sid);
            if (s) s.emit('game:state', view);
          }
        }
      } catch {
        // Player might not be in game yet
      }
    }
  }

  // ── Connection handler ─────────────────────────────
  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthSocket;
    console.log(`[socket] Conectado: ${socket.username} (${socket.id})`);

    // Track this socket for the user
    if (!userSockets.has(socket.userId)) {
      userSockets.set(socket.userId, new Set());
    }
    userSockets.get(socket.userId)!.add(socket.id);

    // Reconnect: if user is in a room, rejoin
    const existingRoom = roomManager.getRoomByUser(socket.userId);
    if (existingRoom) {
      roomManager.setPlayerConnected(socket.userId, true);
      socket.join(existingRoom.id);
      io.to(existingRoom.id).emit('room:updated', existingRoom);

      // If game is in progress, send current state to reconnected player AND update others
      if (existingRoom.status === 'playing') {
        try {
          broadcastGameViews(existingRoom.id);
        } catch { /* game may not exist */ }
      }
    }

    // ── Room: Create ──
    socket.on('room:create', (data: CreateRoomRequest, cb: Function) => {
      try {
        if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 1 || data.name.length > 50) {
          cb({ success: false, error: 'Nombre de sala inválido (1-50 caracteres)' });
          return;
        }
        const room = roomManager.createRoom(socket.userId, socket.username, data.name.trim(), data.piedras, data.maxPlayers ?? 4);
        socket.join(room.id);
        cb({ success: true, roomId: room.id });
        io.to(room.id).emit('room:updated', room);
        io.emit('room:list', roomManager.listRooms());
      } catch (err: any) {
        cb({ success: false, error: err.message });
      }
    });

    // ── Room: Join ──
    socket.on('room:join', (data: { roomId: string }, cb: Function) => {
      try {
        const room = roomManager.joinRoom(data.roomId, socket.userId, socket.username);
        socket.join(room.id);
        cb({ success: true });
        io.to(room.id).emit('room:updated', room);
        io.emit('room:list', roomManager.listRooms());
      } catch (err: any) {
        cb({ success: false, error: err.message });
      }
    });

    // ── Room: Leave ──
    socket.on('room:leave', (cb: Function) => {
      const roomId = roomManager.getUserRoomId(socket.userId);
      if (!roomId) { cb({ success: true }); return; }

      const room = roomManager.getRoom(roomId);

      // During active game: don't remove player, just mark disconnected
      if (room && room.status === 'playing') {
        roomManager.setPlayerConnected(socket.userId, false);
        socket.leave(roomId);
        io.to(roomId).emit('room:updated', room);
        // Broadcast updated views so others see disconnected status
        broadcastGameViews(roomId);
        cb({ success: true });
        return;
      }

      // In lobby: remove player from room normally
      const { room: updatedRoom } = roomManager.leaveRoom(socket.userId);
      socket.leave(roomId);

      if (updatedRoom) {
        io.to(updatedRoom.id).emit('room:updated', updatedRoom);
      }
      cb({ success: true });
      io.emit('room:list', roomManager.listRooms());
    });

    // ── Room: Rejoin (check if user has an active room and rejoin it) ──
    socket.on('room:rejoin', (cb: Function) => {
      const room = roomManager.getRoomByUser(socket.userId);
      if (!room) { cb({ success: false }); return; }

      roomManager.setPlayerConnected(socket.userId, true);
      socket.join(room.id);
      io.to(room.id).emit('room:updated', room);

      if (room.status === 'playing') {
        broadcastGameViews(room.id);
      }

      cb({ success: true, room });
    });

    // ── Room: Delete (host only) ──
    socket.on('room:delete', (cb: Function) => {
      try {
        const roomId = roomManager.getUserRoomId(socket.userId);
        if (!roomId) throw new Error('No estás en ninguna sala');

        const room = roomManager.getRoom(roomId);
        if (!room) throw new Error('Sala no encontrada');
        if (room.hostUserId !== socket.userId) throw new Error('Solo el anfitrión puede eliminar la sala');

        // Notify all players and remove them from the socket room
        io.to(roomId).emit('room:deleted');

        // Remove all sockets from the socket.io room
        for (const [, s] of io.sockets.sockets) {
          if (room.players.some(p => p.userId === (s as AuthSocket).userId)) {
            s.leave(roomId);
          }
        }

        // Clean up game if active
        gameManager.deleteGame(roomId);
        roomManager.deleteRoom(roomId);

        cb({ success: true });
        io.emit('room:list', roomManager.listRooms());
      } catch (err: any) {
        cb({ success: false, error: err.message });
      }
    });

    // ── Room: List ──
    socket.on('room:list', (cb: Function) => {
      cb(roomManager.listRooms());
    });

    // ── Room: Ready ──
    socket.on('room:ready', (ready: boolean) => {
      try {
        const room = roomManager.setReady(socket.userId, ready);
        io.to(room.id).emit('room:updated', room);
      } catch (err: any) {
        socket.emit('error', err.message);
      }
    });

    // ── Room: Start ──
    socket.on('room:start', (cb: Function) => {
      try {
        const roomId = roomManager.getUserRoomId(socket.userId);
        if (!roomId) throw new Error('No estás en ninguna sala');

        const room = roomManager.startGame(roomId, socket.userId);

        // Create game + ceremony
        const { ceremony } = gameManager.createGame(room);

        io.to(room.id).emit('room:updated', room);
        io.to(room.id).emit('game:ceremony', ceremony);
        io.to(room.id).emit('game:started');

        // Send each player their view
        broadcastGameViews(room.id);

        cb({ success: true });
        io.emit('room:list', roomManager.listRooms());
      } catch (err: any) {
        cb({ success: false, error: err.message });
      }
    });

    // ── Game: Action ──
    socket.on('game:action', (data: GameActionRequest, cb: Function) => {
      try {
        const roomId = roomManager.getUserRoomId(socket.userId);
        if (!roomId) throw new Error('No estás en ninguna partida');

        if (pendingTrickRooms.has(roomId)) {
          throw new Error('Esperando resolución de baza');
        }

        gameManager.processAction(roomId, socket.userId, data.action);

        // If trick is complete, broadcast the full mesa first, then resolve after delay
        if (gameManager.needsTrickResolution(roomId)) {
          pendingTrickRooms.add(roomId);
          broadcastGameViews(roomId); // Show all cards on mesa
          cb({ success: true });

          setTimeout(() => {
            pendingTrickRooms.delete(roomId);
            gameManager.resolveTrick(roomId);
            broadcastGameViews(roomId); // Show resolved state
          }, 1500);
        } else {
          broadcastGameViews(roomId);
          cb({ success: true });
        }
      } catch (err: any) {
        cb({ success: false, error: err.message });
      }
    });

    // ── Game: Resumen Ready ──
    socket.on('resumen:ready', (cb: Function) => {
      try {
        const roomId = roomManager.getUserRoomId(socket.userId);
        if (!roomId) throw new Error('No estás en ninguna partida');

        const session = gameManager.getSession(roomId);
        if (!session) throw new Error('Partida no encontrada');

        const seat = session.userIdToSeat.get(socket.userId);
        if (seat === undefined) throw new Error('No estás en esta partida');

        const { allReady, advanceType, state } = gameManager.setResumenReady(roomId, seat);

        if (allReady && advanceType === 'reo') {
          io.to(roomId).emit('game:dealing', { dealer: state.dealer });
        }

        broadcastGameViews(roomId);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message });
      }
    });

    // ── Game: Phrase (broadcast bocadillo to all players) ──
    socket.on('game:phrase', (data: { texto: string }) => {
      if (!data.texto || typeof data.texto !== 'string') return;
      if (!FRASES_PERMITIDAS.has(data.texto)) return;
      const texto = data.texto;
      const roomId = roomManager.getUserRoomId(socket.userId);
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      const player = room.players.find(p => p.userId === socket.userId);
      if (!player || player.seat === null) return;
      io.to(roomId).emit('game:phrase', { seat: player.seat, texto });
    });

    // ── Game: Free chat (broadcast to all players) ──
    let lastChatTime = 0;
    socket.on('game:chat', (data: { texto: string }, cb: Function) => {
      try {
        if (!data.texto || typeof data.texto !== 'string') return cb?.({ success: false });
        const now = Date.now();
        if (now - lastChatTime < 2000) return cb?.({ success: false, error: 'Espera un momento' });
        const texto = data.texto.trim().slice(0, 60).replace(/[<>&"']/g, '');
        if (!texto) return cb?.({ success: false });
        lastChatTime = now;
        const roomId = roomManager.getUserRoomId(socket.userId);
        if (!roomId) return cb?.({ success: false });
        const room = roomManager.getRoom(roomId);
        if (!room) return cb?.({ success: false });
        const player = room.players.find(p => p.userId === socket.userId);
        if (!player || player.seat === null) return cb?.({ success: false });
        io.to(roomId).emit('game:chat', { seat: player.seat, texto });
        cb?.({ success: true });
      } catch (err: any) {
        cb?.({ success: false, error: err.message });
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      console.log(`[socket] Desconectado: ${socket.username} (${socket.id})`);

      // Remove this socket from user's set
      const sockets = userSockets.get(socket.userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) userSockets.delete(socket.userId);
      }

      // Only mark as disconnected if user has NO remaining sockets
      const hasOtherSockets = userSockets.has(socket.userId);
      if (!hasOtherSockets) {
        const room = roomManager.setPlayerConnected(socket.userId, false);
        if (room) {
          io.to(room.id).emit('room:updated', room);
          if (room.status === 'playing') {
            broadcastGameViews(room.id);
          }
        }
      }
    });
  });

  return io;
}
