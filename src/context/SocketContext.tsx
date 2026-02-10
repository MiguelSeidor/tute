import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Room, RoomListItem, GameStateView, GameEvent } from '@shared/types';
import { useAuth } from './AuthContext';

import type { Seat } from '@shared/types';

interface PhraseEvent {
  seat: Seat;
  texto: string;
}

interface SocketContextType {
  connected: boolean;
  currentRoom: Room | null;
  roomList: RoomListItem[];
  gameState: GameStateView | null;
  gameStarted: boolean;
  phraseEvent: PhraseEvent | null;
  createRoom: (name: string, piedras: 3 | 5) => Promise<string>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => void;
  startGame: () => Promise<void>;
  sendAction: (action: GameEvent) => Promise<void>;
  sendPhrase: (texto: string) => void;
  rejoinRoom: () => Promise<boolean>;
  deleteRoom: () => Promise<void>;
  refreshRoomList: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [roomList, setRoomList] = useState<RoomListItem[]>([]);
  const [gameState, setGameState] = useState<GameStateView | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [phraseEvent, setPhraseEvent] = useState<PhraseEvent | null>(null);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
        setCurrentRoom(null);
        setGameState(null);
        setGameStarted(false);
      }
      return;
    }

    const socket = io({
      withCredentials: true,
      autoConnect: true,
    });

    socket.on('connect', () => {
      setConnected(true);
      // Request room list on connect
      socket.emit('room:list', (rooms: RoomListItem[]) => setRoomList(rooms));
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('room:updated', (room: Room) => setCurrentRoom(room));
    socket.on('room:list', (rooms: RoomListItem[]) => setRoomList(rooms));
    socket.on('game:state', (view: GameStateView) => setGameState(view));
    socket.on('game:started', () => setGameStarted(true));
    socket.on('game:phrase', (data: PhraseEvent) => setPhraseEvent(data));
    socket.on('room:deleted', () => {
      setCurrentRoom(null);
      setGameState(null);
      setGameStarted(false);
    });
    socket.on('error', (msg: string) => console.error('[socket]', msg));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const createRoom = useCallback(async (name: string, piedras: 3 | 5): Promise<string> => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket no conectado');

    return new Promise((resolve, reject) => {
      socket.emit('room:create', { name, piedras }, (res: any) => {
        if (res.success) resolve(res.roomId);
        else reject(new Error(res.error));
      });
    });
  }, []);

  const joinRoom = useCallback(async (roomId: string) => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket no conectado');

    return new Promise<void>((resolve, reject) => {
      socket.emit('room:join', { roomId }, (res: any) => {
        if (res.success) resolve();
        else reject(new Error(res.error));
      });
    });
  }, []);

  const leaveRoom = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;

    return new Promise<void>((resolve) => {
      socket.emit('room:leave', () => {
        setCurrentRoom(null);
        setGameState(null);
        setGameStarted(false);
        resolve();
      });
    });
  }, []);

  const setReady = useCallback((ready: boolean) => {
    socketRef.current?.emit('room:ready', ready);
  }, []);

  const startGame = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket no conectado');

    return new Promise<void>((resolve, reject) => {
      socket.emit('room:start', (res: any) => {
        if (res.success) resolve();
        else reject(new Error(res.error));
      });
    });
  }, []);

  const sendAction = useCallback(async (action: GameEvent) => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket no conectado');

    return new Promise<void>((resolve, reject) => {
      socket.emit('game:action', { action }, (res: any) => {
        if (res.success) resolve();
        else reject(new Error(res.error));
      });
    });
  }, []);

  const sendPhrase = useCallback((texto: string) => {
    socketRef.current?.emit('game:phrase', { texto });
  }, []);

  const rejoinRoom = useCallback(async (): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket) return false;

    return new Promise((resolve) => {
      socket.emit('room:rejoin', (res: any) => {
        if (res.success) {
          setCurrentRoom(res.room);
          setGameStarted(res.room.status === 'playing');
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }, []);

  const deleteRoom = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Socket no conectado');

    return new Promise<void>((resolve, reject) => {
      socket.emit('room:delete', (res: any) => {
        if (res.success) {
          setCurrentRoom(null);
          setGameState(null);
          setGameStarted(false);
          resolve();
        } else {
          reject(new Error(res.error));
        }
      });
    });
  }, []);

  const refreshRoomList = useCallback(() => {
    socketRef.current?.emit('room:list', (rooms: RoomListItem[]) => setRoomList(rooms));
  }, []);

  return (
    <SocketContext.Provider value={{
      connected, currentRoom, roomList, gameState, gameStarted, phraseEvent,
      createRoom, joinRoom, leaveRoom, setReady, startGame, sendAction, sendPhrase, rejoinRoom, deleteRoom, refreshRoomList,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket debe usarse dentro de SocketProvider');
  return ctx;
}
