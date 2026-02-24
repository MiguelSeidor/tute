export type Palo = "oros" | "copas" | "espadas" | "bastos";
export type Numero = 1 | 3 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  palo: Palo;
  num: Numero;
}

export const PALOS: Palo[] = ["oros", "copas", "espadas", "bastos"];
export const CARTAS: Numero[] = [1, 3, 6, 7, 10, 11, 12];

export const PUNTOS: Record<Numero, number> = {
  1: 11,
  3: 10,
  12: 4,
  11: 3,
  10: 2,
  7: 0,
  6: 0,
};

export const FUERZA: Numero[] = [1, 3, 12, 11, 10, 7, 6];

export type Seat = 0 | 1 | 2 | 3;

export interface PlayerInfo {
  mano: Card[];
  puntos: number;
  piedras: number;
  fallos: Record<Palo, boolean>;
  haJugadoAlMenosUna: boolean;
}

export type LogEvent =
  | { t: "startRound"; dealer: Seat; salidor: Seat; triunfo: Card }
  | { t: "irADos"; seat: Seat; turno: number }
  | { t: "cambio7"; seat: Seat; turno: number; quita: Card; pone: Card }
  | { t: "jugar"; seat: Seat; turno: number; carta: Card }
  | { t: "cante"; seat: Seat; turno: number; palo: Palo; puntos: 20 | 40 }
  | { t: "tute"; seat: Seat; turno: number; kind: "reyes" | "caballos"; puntos: number }
  | { t: "resolverBaza"; turno: number; ganador: Seat; cartas: { seat: Seat; card: Card }[]; puntos: number }
  | { t: "tirarselas"; seat: Seat; turno: number }
  | { t: "monte"; turno: number; deltas: { seat: Seat; puntos: number }[] }
  | { t: "piedras"; deltas: { seat: Seat; delta: number }[] }
  | { t: "finalizarReo"; perdedores: Seat[] }
  | { t: "finalizarSerie"; seatsCero: Seat[] };

export interface GameState {
  status: "inicial" | "decidiendo_irados" | "jugando" | "resumen";

  dealer: Seat;
  activos: Seat[];
  turno: Seat;
  salidor: Seat;
  bazaN: number;

  triunfo: Card | null;
  mesa: { seat: Seat; card: Card }[];

  jugadores: Record<Seat, PlayerInfo>;
  irADos: Seat | null;

  reoLog: LogEvent[];
  perdedores: Seat[];

  salidorInicialSerie: Seat;

  bazasPorJugador: Record<Seat, Card[][]>; // ⬅️ cada entry es una baza (array de 3 Card)
  piedras: Record<Seat, number>;

  numPlayers: 3 | 4;                // cuántos jugadores empezaron la serie
  emptySeat: Seat | null;           // seat vacío en partida de 3 jugadores (null si 4p)
  seriePiedrasIniciales: number;    // cuántas piedras tenía cada jugador al empezar la serie (ej. 5)
  serieTerminada: boolean;          // true si 2+ seats llegan a 0 y se cierra la serie
  eliminados: Seat[];               // seats eliminados (0 piedras en un REO anterior)

  ultimoGanadorBaza: Seat | null;
  cantesCantados: Record<Seat, Record<Palo, boolean>>;
  cantesTuteCantado: Record<Seat, boolean>;
}


export interface StartPreset {
  dealer?: Seat; // opcional; si no, usa el del estado/evento
  triunfo: Card; // carta de muestra
  manos: Partial<Record<Seat, Card[]>>; // manos por seat; el dealer DEBE ir con []
  ordenar?: boolean; // true por defecto
  validar?: boolean; // true por defecto
}

export type GameEvent =
  | { type: "startRound"; dealer?: Seat; preset?: StartPreset; rngSeed?: number }
  | { type: "declareIrADos"; seat: Seat }
  | { type: "lockNoIrADos" }   
  | { type: "cambiar7"; seat: Seat }
  | { type: "cantar"; seat: Seat; palo: Palo; puntos: 20 | 40 }
  | { type: "cantarTute"; seat: Seat }
  | { type: "jugarCarta"; seat: Seat; card: Card }
  | { type: "resolverBaza" }
  | { type: "tirarselas"; seat: Seat }
  | { type: "finalizarReo" }
  | { type: "resetSerie"; piedras?: number };


export class GameError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

