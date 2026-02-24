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

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// ─── Stats / Ranking types ──────────────────────────────────

export interface RankingEntry {
  userId: string;
  username: string;
  wins: number;
  gamesPlayed: number;
  winRate: number;
  elo: number;
}

export interface GameHistoryEntry {
  id: string;
  roomName: string;
  piedrasCount: number;
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  players: { username: string; isWinner: boolean; finalPiedras: number; totalPuntos: number; bazasGanadas: number }[];
  myResult: 'win' | 'loss';
  myStats: {
    totalPuntos: number;
    bazasGanadas: number;
    cantes20: number;
    cantes40: number;
    tutes: number;
    vecesIrADos: number;
    eloChange: number;
  };
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  elo: number;
  totalPuntos: number;
  totalBazas: number;
  totalCantes20: number;
  totalCantes40: number;
  totalTutes: number;
  totalIrADos: number;
  avgPuntosPerGame: number;
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
  maxPlayers: 3 | 4;
  players: RoomPlayer[];
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

export interface RoomListItem {
  id: string;
  name: string;
  hostUsername: string;
  playerCount: number;
  maxPlayers: 3 | 4;
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

  // Seats that have marked "ready" to close the resumen modal
  resumenReady: Seat[];

  // 3p vs 4p
  numPlayers: 3 | 4;
  emptySeat: Seat | null;
}

export interface CreateRoomRequest {
  name: string;
  piedras: 3 | 5;
  maxPlayers?: 3 | 4;
}

export interface GameActionRequest {
  action: GameEvent;
}
