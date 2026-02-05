
// src/engine/tuteIA.ts
import type { Card, GameState, Palo, Seat } from "./tuteTypes";
import { PUNTOS, FUERZA } from "./tuteTypes";
import { puedeJugar } from "./tuteLogic";

// ===== Heurísticas simples y puras =====

// A) ¿La IA debería ir a los dos?
export function iaDebeIrADos(state: GameState, seat: Seat): boolean {
  // Solo activos pueden ir a los dos:
  if (!state.activos.includes(seat)) return false;
  if (state.status !== "decidiendo_irados") return false;

  const mano = state.jugadores[seat].mano;
  const triunfoPalo = state.triunfo?.palo as Palo;

  // Puntuación simple: +2 As, +1.6 Tres, +0.8 Rey, +0.5 Caballo, +0.3 Diez
  // Triunfos fuertes suman extra.
  let score = 0;
  let triunfos = 0;
  let fuertTri = 0;

  const fuerzaIdx = (n: number) => FUERZA.indexOf(n as any);

  for (const c of mano) {
    if (c.num === 1) score += 2.0;
    else if (c.num === 3) score += 1.6;
    else if (c.num === 12) score += 0.8;
    else if (c.num === 11) score += 0.5;
    else if (c.num === 10) score += 0.3;

    if (c.palo === triunfoPalo) {
      triunfos++;
      if (c.num === 1) { score += 0.8; fuertTri++; }
      else if (c.num === 3) { score += 0.6; fuertTri++; }
      else if (c.num === 12) score += 0.3;
      else if (c.num === 11) score += 0.2;
      else if (c.num === 10) score += 0.1;
    }
  }

  // Pequeños ajustes por longitud de palo triunfo
  if (triunfos >= 3) score += 0.5;
  if (triunfos >= 4) score += 1.0;

  // Umbrales sencillos
  if (fuertTri >= 2 && triunfos >= 3 && score >= 7) return true;
  if (score >= 8.5) return true;

  return false;
}

// B) ¿La IA debería cambiar el 7 (antes de su primera carta)?
export function iaDebeCambiar7(state: GameState, seat: Seat): boolean {
  if (state.status !== "decidiendo_irados" && state.status !== "jugando") return false;
  if (!state.activos.includes(seat)) return false;
  const p = state.jugadores[seat];
  if (p.haJugadoAlMenosUna) return false;
  const triunfo = state.triunfo;
  if (!triunfo) return false;
  if (triunfo.num === 7) return false;
  const tiene7 = p.mano.some(c => c.palo === triunfo.palo && c.num === 7);
  return !!tiene7;
}

// C) Elegir carta para jugar (mínimo razonable)
export function iaEligeCarta(state: GameState, seat: Seat): Card | null {
  if (state.status !== "jugando") return null;
  if (state.turno !== seat) return null;

  const mano = state.jugadores[seat].mano;
  const triunfo = state.triunfo?.palo as Palo;
  const legales = mano.filter(c => puedeJugar(c, mano, state.mesa, triunfo));
  if (legales.length === 0) return null;

  // Heurística básica:
  // - Si hay puntos en mesa o peligro, intentar ganar barato.
  // - Si no, tirar carta de menor puntos; si empatan, la de peor fuerza.
  const puntosMesa = state.mesa.reduce((s, m) => s + (PUNTOS[m.card.num] || 0), 0);

  // Mínima que gana (si conviene ganar)
  const puedeGanar = (c: Card) => {
    const hipot = [...state.mesa, { seat, card: c }];
    const paloSalida = hipot[0].card.palo as Palo;
    // Determinar ganador con la misma lógica del reducer (simplificado aquí):
    // Reusaremos la idea: simulamos cuál sería ganadora comparando por fuerza.
    // Para mantenerlo simple, elegimos: si hay carta más fuerte del palo/triunfo entre hipotéticas.
    // (En un siguiente paso podemos reutilizar ganadorDeMesa si la exportamos.)
    return true; // Para un MVP, no calculamos; preferimos regla segura abajo.
  };

  if (puntosMesa > 0) {
    // tratar de jugar la carta con más probabilidad de ganar: usa fuerza invertida (más fuerte = menor idx)
    const byFuerza = [...legales].sort((a, b) => FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num));
    return byFuerza[0];
  }

  // Si no hay urgencia: tirar la que menos puntos da; a igualdad, la más débil por fuerza
  const byPuntosAsc = [...legales].sort(
    (a, b) => (PUNTOS[a.num] || 0) - (PUNTOS[b.num] || 0) || (FUERZA.indexOf(b.num) - FUERZA.indexOf(a.num))
  );
  return byPuntosAsc[0];
}
