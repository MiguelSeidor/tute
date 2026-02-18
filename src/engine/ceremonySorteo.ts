import { PALOS, CARTAS, type Palo, type Seat, type Card } from './tuteTypes';

export interface CeremonyData {
  suitAssignments: Record<Seat, Palo>;
  card: Card;
  dealer: Seat;
}

/**
 * Genera los datos de la ceremonia de sorteo de dealer:
 * 1. Baraja los 4 palos y asigna uno a cada seat
 * 2. Elige una carta al azar de la baraja
 * 3. El dealer es el seat cuyo palo coincide con el de la carta
 */
export function generateCeremonyData(): CeremonyData {
  // Barajar palos y asignar uno a cada seat
  const shuffled = [...PALOS].sort(() => Math.random() - 0.5);
  const suitAssignments = {
    0: shuffled[0],
    1: shuffled[1],
    2: shuffled[2],
    3: shuffled[3],
  } as Record<Seat, Palo>;

  // Elegir carta random
  const palo = PALOS[Math.floor(Math.random() * PALOS.length)];
  const num = CARTAS[Math.floor(Math.random() * CARTAS.length)];
  const card: Card = { palo, num };

  // El dealer es el seat cuyo palo asignado coincide con el de la carta
  const dealerEntry = Object.entries(suitAssignments).find(([, p]) => p === card.palo)!;
  const dealer = Number(dealerEntry[0]) as Seat;

  return { suitAssignments, card, dealer };
}
