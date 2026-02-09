import { type Card, CARTAS, FUERZA, GameError, type Numero, type Palo, PUNTOS, PALOS, type Seat } from "./tuteTypes";

// RNG simple (puedes pasar otro RNG más adelante)
export type RNG = () => number;
export const defaultRng: RNG = () => Math.random();

export function fuerzaIdx(n: number) {
  return FUERZA.indexOf(n as Numero);
}
export function puntosCarta(c: Card) {
  return PUNTOS[c.num];
}

// Crea baraja del Tute valenciano (28 cartas)
export function crearBaraja(): Card[] {
  const out: Card[] = [];
  for (const p of PALOS) for (const n of CARTAS) out.push({ palo: p, num: n });
  return out;
}

// Baraja in-place
export function barajar(a: Card[], rng: RNG = defaultRng): Card[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ¿c1 gana a c2 dado triunfo y palo de salida?
export function gana(c1: Card, c2: Card, triunfo: Palo, paloSalida: Palo): Card {
  const misma = c1.palo === c2.palo;
  if (misma) return fuerzaIdx(c1.num) < fuerzaIdx(c2.num) ? c1 : c2;
  if (c1.palo === triunfo && c2.palo !== triunfo) return c1;
  if (c2.palo === triunfo && c1.palo !== triunfo) return c2;
  if (c1.palo === paloSalida) return c1;
  if (c2.palo === paloSalida) return c2;
  return c1;
}

// Legalidad Tute valenciano (3 jugadores): seguir palo; superar si puedes; fallar sólo si ganas
export function puedeJugar(carta: Card, mano: Card[], mesa: { seat: Seat; card: Card }[], triunfo: Palo): boolean {
  if (mesa.length === 0) return true;

  const paloSalida = mesa[0].card.palo as Palo;

  // Calcular ganadora actual
  let ganadora = mesa[0].card;
  for (let i = 1; i < mesa.length; i++) ganadora = gana(ganadora, mesa[i].card, triunfo, paloSalida);

  const idx = (n: number) => fuerzaIdx(n);

  const tengoPaloSalida = mano.some(c => c.palo === paloSalida);
  const misTriunfos = mano.filter(c => c.palo === triunfo);
  const tengoTriunfo = misTriunfos.length > 0;
  const triunfosEnMesa = mesa.filter(x => x.card.palo === triunfo);

  // 1) TENGO PALO DE SALIDA
  if (tengoPaloSalida) {
    if (ganadora.palo === paloSalida) {
      const puedoSuperarConPalo = mano.some(c => c.palo === paloSalida && idx(c.num) < idx(ganadora.num));
      if (puedoSuperarConPalo) return carta.palo === paloSalida && idx(carta.num) < idx(ganadora.num);
      return carta.palo === paloSalida; // no puedo superar → cualquier carta del palo
    }
    // El ganador es triunfo → sólo debo seguir palo (no hay obligación de superar)
    return carta.palo === paloSalida;
  }

  // 2) NO TENGO PALO DE SALIDA
  if (!tengoTriunfo) return true; // libre

  // 2.a) Ya hay triunfo en mesa → sobretriunfar si puedo
  if (triunfosEnMesa.length > 0) {
    let triunfoGanador = triunfosEnMesa[0].card;
    for (let k = 1; k < triunfosEnMesa.length; k++) {
      if (idx(triunfosEnMesa[k].card.num) < idx(triunfoGanador.num)) triunfoGanador = triunfosEnMesa[k].card;
    }
    const puedoSuperarTriunfo = misTriunfos.some(c => idx(c.num) < idx(triunfoGanador.num));
    if (puedoSuperarTriunfo) return carta.palo === triunfo && idx(carta.num) < idx(triunfoGanador.num);
    return true; // no puedo superar triunfo → libre
  }

  // 2.b) No hay triunfo en mesa → si fallo CON triunfo, gano; estoy obligado a fallar
  return carta.palo === triunfo;
}

// Determina ganador de la baza actual y los puntos sumados

export function ganadorDeMesa(
  mesa: { seat: Seat; card: Card }[],
  triunfo: Palo
): { ganador: Seat; puntos: number } {
  if (mesa.length === 0) throw new GameError("mesa_vacia", "No hay cartas en mesa");
  const paloSalida = mesa[0].card.palo;

  let winIndex = 0;
  let winCard = mesa[0].card;

  for (let i = 1; i < mesa.length; i++) {
    const candidate = mesa[i].card;
    const g = gana(winCard, candidate, triunfo, paloSalida);
    if (g !== winCard) {  // si cambia el ganador
      winIndex = i;
      winCard = candidate;
    }
  }

  const puntos = mesa.reduce((s, x) => s + puntosCarta(x.card), 0);
  return { ganador: mesa[winIndex].seat, puntos };
}

// Baraja + reparto (3 manos de 9; dealer con 0; triunfo = carta 28)
export function repartirTresYTriunfo(rng: RNG = defaultRng) {
  const baraja = barajar(crearBaraja(), rng);
  const mano0 = baraja.slice(0, 9);
  const mano1 = baraja.slice(9, 18);
  const mano2 = baraja.slice(18, 27);
  const triunfo = baraja[27];
  return { mano0, mano1, mano2, triunfo };
}

// Helpers varios
export function hasCard(hay: Card[], c: Card) {
  return hay.some(x => x.palo === c.palo && x.num === c.num);
}

