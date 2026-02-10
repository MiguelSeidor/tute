// Tipos compartidos entre frontend y backend

export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
}

export interface AuthResponse {
  user: User;
  message: string;
}

export interface ErrorResponse {
  error: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ─── Socket.io / Multiplayer types ─────────────────────────

import type { Card, Seat, GameState, GameEvent, LogEvent, Palo } from '../src/engine/tuteTypes';

export type { Card, Seat, GameState, GameEvent, LogEvent, Palo };

export interface RoomPlayer {
  userId: string;
  username: string;
  seat: Seat | null;
  ready: boolean;
  connected: boolean;
}

export interface Room {
  id: string;
  name: string;
  hostUserId: string;
  piedras: 3 | 5;
  players: RoomPlayer[];
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

export interface RoomListItem {
  id: string;
  name: string;
  hostUsername: string;
  playerCount: number;
  maxPlayers: 4;
  status: Room['status'];
  piedras: 3 | 5;
}

/** Estado de juego "stripped" que el servidor envía a cada jugador */
export interface GameStateView {
  status: GameState['status'];
  dealer: Seat;
  activos: Seat[];
  turno: Seat;
  salidor: Seat;
  bazaN: number;
  triunfo: Card | null;
  mesa: { seat: Seat; card: Card }[];
  irADos: Seat | null;

  mySeat: Seat;
  myHand: Card[];
  otherPlayerCardCounts: Partial<Record<Seat, number>>;

  piedras: Record<Seat, number>;
  puntos: Record<Seat, number>;
  bazasPorJugador: Record<Seat, Card[][]>;

  reoLog: LogEvent[];
  perdedores: Seat[];

  seriePiedrasIniciales: number;
  serieTerminada: boolean;
  eliminados: Seat[];

  ultimoGanadorBaza: Seat | null;
  cantesCantados: Record<Seat, Record<Palo, boolean>>;
  cantesTuteCantado: Record<Seat, boolean>;

  // Nombres de jugadores por seat
  playerNames: Record<Seat, string>;

  // Connection status per seat (for disconnect indicators)
  playerConnected: Record<Seat, boolean>;
}

export interface CreateRoomRequest {
  name: string;
  piedras: 3 | 5;
}

export interface GameActionRequest {
  action: GameEvent;
}
