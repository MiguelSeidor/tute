import { type GameState, type PlayerInfo, type Seat, PALOS, type Card, type StartPreset } from "./tuteTypes";
import { repartirTresYTriunfo } from "./tuteLogic";
import { ordenarMano } from "./tuteReducer";

// Estado inicial (serie): 4 asientos, piedras = 5, dealer 0 (por ejemplo)
export function initGame(
  piedrasIniciales = 5,
  dealer: Seat = 0,
  numPlayers: 3 | 4 = 4,
  emptySeat?: Seat, // seat vacío para partidas de 3 jugadores
): GameState {
  const eliminados: Seat[] = [];
  const jugadores: Record<Seat, PlayerInfo> = {
    0: mkPlayerInfo(piedrasIniciales),
    1: mkPlayerInfo(piedrasIniciales),
    2: mkPlayerInfo(piedrasIniciales),
    3: mkPlayerInfo(piedrasIniciales),
  };
  const piedras: Record<Seat, number> = {
    0: piedrasIniciales,
    1: piedrasIniciales,
    2: piedrasIniciales,
    3: piedrasIniciales,
  };

  // Para 3 jugadores: marcar el seat vacío como eliminado con 0 piedras
  if (numPlayers === 3 && emptySeat !== undefined) {
    eliminados.push(emptySeat);
    piedras[emptySeat] = 0;
    jugadores[emptySeat].piedras = 0;
  }

  return {
    status: "inicial",
    dealer,
    activos: [],     // se fijan en startRound()
    turno: dealer,   // temporal; se corrige en startRound()
    salidor: dealer, // temporal
    bazaN: 0,
    triunfo: null,
    mesa: [],
    jugadores,
    irADos: null,
    reoLog: [],
    perdedores: [],
    salidorInicialSerie: ((dealer + 1) % 4) as Seat,
    bazasPorJugador: { 0: [], 1: [], 2: [], 3: [] },
    piedras,
    numPlayers,
    emptySeat: numPlayers === 3 && emptySeat !== undefined ? emptySeat : null,
    seriePiedrasIniciales: piedrasIniciales,
    serieTerminada: false,
    eliminados,
    ultimoGanadorBaza: null,
    cantesCantados: {
      0: { oros:false, copas:false, espadas:false, bastos:false },
      1: { oros:false, copas:false, espadas:false, bastos:false },
      2: { oros:false, copas:false, espadas:false, bastos:false },
      3: { oros:false, copas:false, espadas:false, bastos:false },
    },
    cantesTuteCantado: { 0:false, 1:false, 2:false, 3:false },
  };
}

function mkPlayerInfo(piedrasIniciales: number): PlayerInfo {
  return {
    mano: [],
    puntos: 0,
    piedras: piedrasIniciales,
    fallos: { oros: false, copas: false, espadas: false, bastos: false },
    haJugadoAlMenosUna: false,
  };
}


function validarPreset(preset: StartPreset, dealer: Seat, eliminados: Seat[] = []) {
  const ALL: Card[] = PALOS.flatMap(p => [1,3,6,7,10,11,12].map(n => ({ palo: p, num: n as any })));
  const manos = preset.manos || {};
  const key = (c: Card) => `${c.palo}-${c.num}`;
  const alive = ([0,1,2,3] as Seat[]).filter(s => !eliminados.includes(s));
  const dealerPlays = alive.length <= 3; // con 3 vivos el dealer también juega

  const usadas = [
    ...(manos[0] ?? []),
    ...(manos[1] ?? []),
    ...(manos[2] ?? []),
    ...(manos[3] ?? []),
  ];
  // dealer vacío solo si no juega (4 vivos)
  if (!dealerPlays && (manos[dealer] ?? []).length !== 0) throw new Error("Preset inválido: el dealer debe tener 0 cartas");
  // activos con 9 cartas cada uno
  const activos = dealerPlays ? alive : alive.filter(s => s !== dealer);
  activos.forEach(s => {
    const len = (manos[s] ?? []).length;
    if (len !== 9) throw new Error(`Preset inválido: el seat ${s} debe tener 9 cartas (tiene ${len})`);
  });
  // eliminados con 0 cartas
  eliminados.forEach(s => {
    if ((manos[s] ?? []).length !== 0) throw new Error(`Preset inválido: el seat ${s} está eliminado y debe tener 0 cartas`);
  });
  // duplicados (incluyendo triunfo)
  const set = new Set<string>(usadas.map(key).concat(key(preset.triunfo)));
  if (set.size !== usadas.length + 1) throw new Error("Preset inválido: cartas duplicadas (incluyendo triunfo)");
  // baraja completa 28 exactas
  const resto = ALL.filter(c => !set.has(key(c)));
  if (resto.length !== 0) throw new Error("Preset inválido: con la muestra indicada no deben sobrar cartas");
}


// Arranca un REO: dealer reparte, define activos, salidor = siguiente vivo tras dealer
export function startRound(
  state: GameState,
  rng: () => number = Math.random,
  preset?: StartPreset
): GameState {
  const dealer = preset?.dealer ?? state.dealer;
  const CLOCKWISE: Seat[] = [0, 3, 2, 1];
  const eliminados = state.eliminados ?? [];
  const alive = CLOCKWISE.filter(s => !eliminados.includes(s));

  // Salidor: siguiente vivo en sentido horario desde el dealer
  const dealerIdxCW = CLOCKWISE.indexOf(dealer);
  let salidor: Seat = dealer;
  for (let i = 1; i < 4; i++) {
    const candidate = CLOCKWISE[(dealerIdxCW + i) % CLOCKWISE.length];
    if (!eliminados.includes(candidate)) {
      salidor = candidate;
      break;
    }
  }

  // Activos: con 4 vivos el dealer no juega; con 3 vivos el dealer también juega
  let activosHorario: Seat[];
  if (alive.length >= 4) {
    activosHorario = alive.filter(s => s !== dealer);
  } else {
    activosHorario = [...alive]; // los 3 vivos juegan (incluido dealer)
  }
  const activosEnOrden = rotateToStart(activosHorario, salidor);

  let m: Record<Seat, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  let triunfo: Card;

  if (preset) {
    if (preset.validar ?? true) validarPreset(preset, dealer, eliminados);
    triunfo = preset.triunfo;
    m = {
      0: preset.manos[0] ?? [],
      1: preset.manos[1] ?? [],
      2: preset.manos[2] ?? [],
      3: preset.manos[3] ?? [],
    } as Record<Seat, Card[]>;
  } else {
    const { mano0, mano1, mano2, triunfo: tri } = repartirTresYTriunfo(rng);
    triunfo = tri;
    m[activosEnOrden[0]] = mano0;
    m[activosEnOrden[1]] = mano1;
    m[activosEnOrden[2]] = mano2;
  }

  const jugadores = structuredClone(state.jugadores);
  for (const s of [0,1,2,3] as Seat[]) {
    jugadores[s].mano = (preset?.ordenar === false) ? [...(m[s] ?? [])] : ordenarMano(m[s] ?? []);
    jugadores[s].puntos = 0;
    jugadores[s].fallos = { oros:false, copas:false, espadas:false, bastos:false };
    jugadores[s].haJugadoAlMenosUna = false;
  }

  return {
    ...state,
    status: "decidiendo_irados",
    dealer,
    activos: activosEnOrden,
    turno: salidor,
    salidor,
    bazaN: 0,
    triunfo,
    mesa: [],
    jugadores,
    irADos: null,
    reoLog: [{ t: "startRound", dealer, salidor, triunfo }],
    perdedores: [],
    bazasPorJugador: { 0: [], 1: [], 2: [], 3: [] },
    ultimoGanadorBaza: null,
    cantesCantados: {  // ✅ Resetear al iniciar REO
      0: { oros:false, copas:false, espadas:false, bastos:false },
      1: { oros:false, copas:false, espadas:false, bastos:false },
      2: { oros:false, copas:false, espadas:false, bastos:false },
      3: { oros:false, copas:false, espadas:false, bastos:false },
    },
    cantesTuteCantado: { 0:false, 1:false, 2:false, 3:false },
  };
}

function rotateToStart(arr: Seat[], first: Seat): Seat[] {
  const i = arr.indexOf(first);
  return i < 0 ? arr : [...arr.slice(i), ...arr.slice(0, i)];
}



