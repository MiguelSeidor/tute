
// src/engine/tuteIA.ts
import type { Card, GameState, Palo, Seat } from "./tuteTypes";
import { PUNTOS } from "./tuteTypes";
import { puedeJugar, gana, ganadorDeMesa, fuerzaIdx } from "./tuteLogic";

// ========================== HELPERS ==========================

/** Carta más barata (menos puntos; a igualdad, más débil por fuerza) */
function masBarata(cards: Card[]): Card {
  return [...cards].sort((a, b) =>
    PUNTOS[a.num] - PUNTOS[b.num] || fuerzaIdx(b.num) - fuerzaIdx(a.num)
  )[0];
}

/** Carta más cara (más puntos; a igualdad, más fuerte) */
function masCara(cards: Card[]): Card {
  return [...cards].sort((a, b) =>
    PUNTOS[b.num] - PUNTOS[a.num] || fuerzaIdx(a.num) - fuerzaIdx(b.num)
  )[0];
}

/** Número de cartas de un palo en la mano */
function cuentaPalo(mano: Card[], palo: Palo): number {
  return mano.filter(c => c.palo === palo).length;
}

/** Todas las cartas ya jugadas en bazas resueltas */
function cartasJugadas(state: GameState): Card[] {
  const played: Card[] = [];
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    for (const baza of state.bazasPorJugador[seat]) {
      played.push(...baza);
    }
  }
  return played;
}

/** ¿`other` es mi aliado? (solo en ir-a-dos: ambos en el equipo contra el solo) */
function esAliado(state: GameState, me: Seat, other: Seat): boolean {
  if (state.irADos === null) return false;
  if (state.irADos === me || state.irADos === other) return false;
  return true;
}

// ========================== PROTECCIÓN DE CANTES / TUTE ==========================

function cardKey(c: Card): string {
  return `${c.palo}-${c.num}`;
}

/**
 * Devuelve un Set con las cartas que forman parte de un TUTE potencial
 * (4 Reyes o 4 Caballos) o de un cante pendiente (Rey+Caballo del mismo palo).
 * Estas cartas deben protegerse y NO jugarse si hay alternativas.
 */
function cartasProtegidas(mano: Card[], state: GameState, seat: Seat): Set<string> {
  const prot = new Set<string>();

  // TUTE: proteger los 4 si los tenemos y no lo hemos cantado aún
  if (!state.cantesTuteCantado[seat]) {
    const reyes = mano.filter(c => c.num === 12);
    const caballos = mano.filter(c => c.num === 11);
    if (reyes.length === 4) reyes.forEach(c => prot.add(cardKey(c)));
    if (caballos.length === 4) caballos.forEach(c => prot.add(cardKey(c)));
  }

  // Cantes: proteger parejas Rey+Caballo no cantadas aún
  const cantados = state.cantesCantados[seat];
  for (const palo of ["oros", "copas", "espadas", "bastos"] as Palo[]) {
    if (cantados[palo]) continue;
    const tieneRey = mano.some(c => c.palo === palo && c.num === 12);
    const tieneCab = mano.some(c => c.palo === palo && c.num === 11);
    if (tieneRey && tieneCab) {
      prot.add(`${palo}-12`);
      prot.add(`${palo}-11`);
    }
  }

  return prot;
}

/**
 * ¿Tiene este seat cantes o TUTE pendientes de cantar?
 * Si es así, debería esforzarse más en ganar bazas.
 */
function tieneCantePendiente(mano: Card[], state: GameState, seat: Seat): boolean {
  // TUTE pendiente
  if (!state.cantesTuteCantado[seat]) {
    const reyes = mano.filter(c => c.num === 12);
    const caballos = mano.filter(c => c.num === 11);
    if (reyes.length === 4 || caballos.length === 4) return true;
  }

  // Cante pendiente
  const cantados = state.cantesCantados[seat];
  for (const palo of ["oros", "copas", "espadas", "bastos"] as Palo[]) {
    if (cantados[palo]) continue;
    const tieneRey = mano.some(c => c.palo === palo && c.num === 12);
    const tieneCab = mano.some(c => c.palo === palo && c.num === 11);
    if (tieneRey && tieneCab) return true;
  }

  return false;
}

/** De un array de cartas, devuelve solo las NO protegidas; si todas lo están, devuelve todas (fallback) */
function preferLibres(cards: Card[], protegidas: Set<string>): Card[] {
  const libres = cards.filter(c => !protegidas.has(cardKey(c)));
  return libres.length > 0 ? libres : cards;
}

// ========================== SALIDA (posición 0) ==========================

function elegirSalida(legales: Card[], state: GameState, seat: Seat): Card {
  const mano = state.jugadores[seat].mano;
  const tp = state.triunfo!.palo;
  const played = cartasJugadas(state);
  const protegidas = cartasProtegidas(mano, state, seat);
  const quieroGanar = tieneCantePendiente(mano, state, seat);

  // === IR A DOS SOLO: "arrastrar" — sacar triunfos rivales con As/3 ===
  if (state.irADos === seat) {
    const misTriunfos = preferLibres(legales.filter(c => c.palo === tp), protegidas);
    const fuertes = misTriunfos.filter(c => c.num === 1 || c.num === 3);
    if (fuertes.length > 0 && legales.filter(c => c.palo === tp).length >= 3) {
      return fuertes.sort((a, b) => fuerzaIdx(a.num) - fuerzaIdx(b.num))[0];
    }
  }

  // Si tengo cantes/tute pendientes, priorizar ganar con cartas fuertes
  if (quieroGanar) {
    // Ases de no-triunfo (no protegidos)
    const asesLibres = preferLibres(legales.filter(c => c.num === 1 && c.palo !== tp), protegidas);
    if (asesLibres.length > 0 && asesLibres[0].num === 1) {
      return asesLibres.sort((a, b) => cuentaPalo(mano, a.palo) - cuentaPalo(mano, b.palo))[0];
    }
    // As de triunfo si no está protegido
    const asTrumpLibre = preferLibres(legales.filter(c => c.num === 1 && c.palo === tp), protegidas);
    if (asTrumpLibre.length > 0 && asTrumpLibre[0].num === 1) return asTrumpLibre[0];
  }

  // 1) Ases de palos NO triunfo — muy probables de ganar
  const ases = preferLibres(legales.filter(c => c.num === 1 && c.palo !== tp), protegidas);
  if (ases.length > 0 && ases[0].num === 1) {
    return ases.sort((a, b) => cuentaPalo(mano, a.palo) - cuentaPalo(mano, b.palo))[0];
  }

  // 2) Tres de un palo cuyo As ya se jugó (el 3 es ahora el jefe del palo)
  const tresesLibres = preferLibres(legales.filter(c => c.num === 3 && c.palo !== tp), protegidas);
  for (const tres of tresesLibres) {
    if (played.some(c => c.palo === tres.palo && c.num === 1)) {
      return tres;
    }
  }

  // 3) Cartas baratas (6, 7, 10) de palos NO triunfo — achique / sondeo
  const baratas = preferLibres(
    legales.filter(c => c.palo !== tp && PUNTOS[c.num] <= 2),
    protegidas
  ).sort((a, b) =>
    PUNTOS[a.num] - PUNTOS[b.num] ||
    cuentaPalo(mano, a.palo) - cuentaPalo(mano, b.palo)
  );
  if (baratas.length > 0) return baratas[0];

  // 4) Cualquier carta de palo NO triunfo, la más barata (evitando protegidas)
  const noTrump = preferLibres(legales.filter(c => c.palo !== tp), protegidas);
  if (noTrump.length > 0) return masBarata(noTrump);

  // 5) Solo tengo triunfos — el más barato (evitando protegidas)
  return masBarata(preferLibres(legales, protegidas));
}

// ========================== SEGUNDO (posición 1) ==========================

function elegirSegundo(legales: Card[], state: GameState, seat: Seat): Card {
  const mano = state.jugadores[seat].mano;
  const tp = state.triunfo!.palo;
  const paloSalida = state.mesa[0].card.palo;
  const lider = state.mesa[0].seat;
  const cartaLider = state.mesa[0].card;
  const puntosLider = PUNTOS[cartaLider.num];
  const protegidas = cartasProtegidas(mano, state, seat);
  const quieroGanar = tieneCantePendiente(mano, state, seat);

  // Separar ganadoras de perdedoras
  const winners: Card[] = [];
  const losers: Card[] = [];
  for (const c of legales) {
    if (gana(cartaLider, c, tp, paloSalida) === c) {
      winners.push(c);
    } else {
      losers.push(c);
    }
  }

  // --- IR A DOS: aliado lidera ---
  if (esAliado(state, seat, lider)) {
    if (puntosLider >= 10) return masCara(preferLibres(legales, protegidas));
    return masBarata(preferLibres(legales, protegidas));
  }

  // --- Juego normal o enemigo lidera ---
  if (winners.length > 0) {
    // Preferir ganadoras no protegidas
    const winPool = preferLibres(winners, protegidas);
    const cheapWin = masBarata(winPool);

    // Tengo cantes/tute pendientes → ganar para poder cantar
    if (quieroGanar) return cheapWin;

    // Hay puntos en mesa → vale la pena ganar
    if (puntosLider >= 4) return cheapWin;

    // Ganar gratis (con 6 o 7)
    if (PUNTOS[cheapWin.num] === 0) return cheapWin;

    // Ganar con As suele aguantar al tercer jugador
    if (cheapWin.num === 1) return cheapWin;

    // Poca cosa en mesa y ganar me cuesta puntos → conservar
    if (losers.length > 0) return masBarata(preferLibres(losers, protegidas));
    return cheapWin;
  }

  // No puedo ganar → tirar lo más barato (evitando protegidas)
  return masBarata(preferLibres(legales, protegidas));
}

// ========================== ÚLTIMO (posición 2) ==========================

function elegirUltimo(legales: Card[], state: GameState, seat: Seat): Card {
  const mano = state.jugadores[seat].mano;
  const tp = state.triunfo!.palo;
  const puntosMesa = state.mesa.reduce((s, m) => s + PUNTOS[m.card.num], 0);
  const protegidas = cartasProtegidas(mano, state, seat);
  const quieroGanar = tieneCantePendiente(mano, state, seat);

  // ¿Quién va ganando de los 2 en mesa?
  const paloSalida = state.mesa[0].card.palo;
  const ganaMesa = gana(state.mesa[0].card, state.mesa[1].card, tp, paloSalida);
  const currentWinnerSeat = ganaMesa === state.mesa[0].card
    ? state.mesa[0].seat
    : state.mesa[1].seat;

  // Separar ganadoras de perdedoras (simulando mesa completa)
  const winners: Card[] = [];
  const losers: Card[] = [];
  for (const c of legales) {
    const hipot = [...state.mesa, { seat, card: c }];
    const { ganador } = ganadorDeMesa(hipot, tp);
    (ganador === seat ? winners : losers).push(c);
  }

  // --- IR A DOS: mi aliado va ganando ---
  if (esAliado(state, seat, currentWinnerSeat)) {
    if (losers.length > 0) return masCara(preferLibres(losers, protegidas));
    return masBarata(preferLibres(winners, protegidas));
  }

  // --- Juego normal o enemigo gana ---
  if (winners.length > 0) {
    const winPool = preferLibres(winners, protegidas);
    const cheapWin = masBarata(winPool);

    // Tengo cantes/tute pendientes → ganar
    if (quieroGanar) return cheapWin;

    // Hay puntos en mesa → ganar con lo mínimo
    if (puntosMesa >= 2) return cheapWin;

    // Ganar gratis
    if (PUNTOS[cheapWin.num] === 0) return cheapWin;

    // Mesa vacía de puntos y ganar cuesta → no desperdiciar
    if (losers.length > 0) return masBarata(preferLibres(losers, protegidas));
    return cheapWin;
  }

  // No puedo ganar → tirar lo más barato posible (evitando protegidas)
  return masBarata(preferLibres(legales, protegidas));
}

// ========================== ELEGIR CARTA (principal) ==========================

export function iaEligeCarta(state: GameState, seat: Seat): Card | null {
  if (state.status !== "jugando") return null;
  if (state.turno !== seat) return null;

  const mano = state.jugadores[seat].mano;
  const triunfo = state.triunfo?.palo as Palo;
  const legales = mano.filter(c => puedeJugar(c, mano, state.mesa, triunfo));
  if (legales.length === 0) return null;
  if (legales.length === 1) return legales[0];

  const posicion = state.mesa.length; // 0 = salida, 1 = segundo, 2 = último

  if (posicion === 0) return elegirSalida(legales, state, seat);
  if (posicion === 2) return elegirUltimo(legales, state, seat);
  return elegirSegundo(legales, state, seat);
}

// ========================== IR A DOS ==========================

export function iaDebeIrADos(state: GameState, seat: Seat): boolean {
  if (!state.activos.includes(seat)) return false;
  if (state.status !== "decidiendo_irados") return false;

  const mano = state.jugadores[seat].mano;
  const tp = state.triunfo?.palo as Palo;

  const triunfos = mano.filter(c => c.palo === tp);
  const asT = triunfos.some(c => c.num === 1);
  const tresT = triunfos.some(c => c.num === 3);
  const asesOtros = mano.filter(c => c.num === 1 && c.palo !== tp).length;

  // Cante de 40 potencial (Rey + Caballo del triunfo)
  const cante40 = mano.some(c => c.palo === tp && c.num === 12) &&
                  mano.some(c => c.palo === tp && c.num === 11);

  // Mínimo imprescindible: As de triunfo + al menos 3 triunfos
  if (!asT) return false;
  if (triunfos.length < 3) return false;

  // Caso 1: 4+ triunfos con As+3 + al menos 1 As de otro palo
  if (triunfos.length >= 4 && tresT && asesOtros >= 1) return true;

  // Caso 2: 3 triunfos con As+3 + 2 Ases de otros palos
  if (triunfos.length >= 3 && tresT && asesOtros >= 2) return true;

  // Caso 3: 4+ triunfos con As + cante40 + 1 As de otro palo
  if (triunfos.length >= 4 && cante40 && asesOtros >= 1) return true;

  // Caso 4: 5+ triunfos con As+3 (control aplastante)
  if (triunfos.length >= 5 && tresT) return true;

  return false;
}

// ========================== TIRÁRSELAS (rendición) ==========================

export function iaDebeTirarselas(state: GameState, seat: Seat): boolean {
  if (state.status !== "jugando") return false;
  if (!state.activos.includes(seat)) return false;

  // Ir-a-dos: equipo nunca se rinde
  if (state.irADos !== null && state.irADos !== seat) return false;

  const mano = state.jugadores[seat].mano;
  const puntos = state.jugadores[seat].puntos;
  const tp = state.triunfo?.palo as Palo;

  // Cartas que pueden ganar bazas: As, 3, Rey, Caballo (fuerzaIdx <= 3)
  const cartasFuertes = mano.filter(c => fuerzaIdx(c.num) <= 3);
  // Triunfos fuertes: As, 3, Rey, Caballo de triunfo
  const triunfosFuertes = mano.filter(c => c.palo === tp && fuerzaIdx(c.num) <= 3);

  // "Mano basura": TODAS las cartas son 10, 7 o 6 (fuerzaIdx >= 4)
  // No tiene Ases, ni 3, ni Reyes, ni Caballos → no puede ganar bazas
  const manoBasura = cartasFuertes.length === 0;

  if (manoBasura) {
    // Con mano basura, rendirse desde baza 2+ (no en la primera, dar chance a ver qué pasa)
    if (state.bazaN >= 2) {
      if (state.irADos === seat) return true; // Solo con basura → rendirse seguro
      return puntos <= 30; // Normal: si además lleva pocos puntos, rendirse
    }
  }

  // --- Camino conservador para manos con algo de fuerza ---
  if (state.bazaN < 7) return false;

  // No rendirse si tengo Ases o 3 (pueden ganar bazas)
  if (mano.some(c => c.num === 1)) return false;
  if (mano.some(c => c.num === 3)) return false;

  // No rendirse si tengo triunfos fuertes
  if (triunfosFuertes.length > 0) return false;

  // Ir-a-dos solo: rendirse si va muy perdido
  if (state.irADos === seat) {
    const team = state.activos.filter(s => s !== seat) as Seat[];
    const puntosEquipo = team.reduce((acc, t) => acc + state.jugadores[t].puntos, 0 as number);
    return puntos < puntosEquipo * 0.4;
  }

  // Normal: rendirse si ≤10 puntos y sin cartas fuertes
  return puntos <= 10;
}

// ========================== CAMBIAR 7 ==========================

export function iaDebeCambiar7(state: GameState, seat: Seat): boolean {
  if (state.status !== "decidiendo_irados" && state.status !== "jugando") return false;
  if (!state.activos.includes(seat)) return false;
  const p = state.jugadores[seat];
  if (p.haJugadoAlMenosUna) return false;
  const triunfo = state.triunfo;
  if (!triunfo) return false;
  if (triunfo.num === 7) return false;
  return p.mano.some(c => c.palo === triunfo.palo && c.num === 7);
}
