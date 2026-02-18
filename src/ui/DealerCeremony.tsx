import { useState, useEffect, useRef, useCallback } from 'react';
import type { Seat, Palo } from '../engine/tuteTypes';

export const CLOCKWISE: Seat[] = [0, 3, 2, 1];

export const PALO_LABELS: Record<Palo, string> = {
  oros: 'Oros',
  copas: 'Copas',
  espadas: 'Espadas',
  bastos: 'Bastos',
};

export const PALO_ICONS: Record<Palo, string> = {
  oros: '🟡',
  copas: '🏆',
  espadas: '⚔️',
  bastos: '🪵',
};

export type CeremonyPhase = 'text' | 'suits' | 'card_reveal' | 'card_slide' | 'dealing' | 'done';

type VisualSlot = 'bottom' | 'left' | 'top' | 'right';

/** Position vectors for each player slot relative to mesa center */
export const DEAL_DIRECTION: Record<VisualSlot, { x: string; y: string }> = {
  top:    { x: '0px', y: 'clamp(-200px, -25vh, -80px)' },
  left:   { x: 'clamp(-200px, -25vw, -80px)', y: '0px' },
  right:  { x: 'clamp(80px, 25vw, 200px)', y: '0px' },
  bottom: { x: '0px', y: 'clamp(80px, 25vh, 200px)' },
};

export function getVisualSlot(seat: Seat, mySeat?: Seat): VisualSlot {
  if (mySeat === undefined) {
    return (['bottom', 'left', 'top', 'right'] as const)[seat];
  }
  const myIdx = CLOCKWISE.indexOf(mySeat);
  const seatIdx = CLOCKWISE.indexOf(seat);
  const offset = (seatIdx - myIdx + 4) % 4;
  return (['bottom', 'right', 'top', 'left'] as const)[offset];
}

export interface DealCardAnim {
  id: number;
  targetSlot: VisualSlot;
}

interface UseCeremonyPhaseOptions {
  active: boolean;
  dealer: Seat;
  mySeat?: Seat;
  onComplete: () => void;
}

/**
 * Hook that manages the ceremony phase state machine.
 * Returns current phase and deal card animation state.
 */
export function useCeremonyPhase({ active, dealer, mySeat, onComplete }: UseCeremonyPhaseOptions) {
  const [phase, setPhase] = useState<CeremonyPhase>('text');
  const [dealCards, setDealCards] = useState<DealCardAnim[]>([]);
  const dealCardId = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Reset phase when ceremony becomes active
  useEffect(() => {
    if (active) {
      setPhase('text');
      setDealCards([]);
      dealCardId.current = 0;
    }
  }, [active]);

  // Phase transitions
  useEffect(() => {
    if (!active) return;

    const timings: Partial<Record<CeremonyPhase, { next: CeremonyPhase; delay: number }>> = {
      text:        { next: 'suits',       delay: 2500 },
      suits:       { next: 'card_reveal', delay: 2000 },
      card_reveal: { next: 'card_slide',  delay: 2000 },
      card_slide:  { next: 'dealing',     delay: 1500 },
    };

    const current = timings[phase];
    if (!current) return;

    const timer = setTimeout(() => setPhase(current.next), current.delay);
    return () => clearTimeout(timer);
  }, [active, phase]);

  // Dealing animation
  useEffect(() => {
    if (!active || phase !== 'dealing') return;

    const activos = CLOCKWISE.filter(s => s !== dealer);
    const dealOrder: Seat[] = [];
    for (let round = 0; round < 3; round++) {
      for (const s of activos) dealOrder.push(s);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const interval = 250;

    dealOrder.forEach((seat, i) => {
      timers.push(setTimeout(() => {
        const id = dealCardId.current++;
        const targetSlot = getVisualSlot(seat, mySeat);
        setDealCards(prev => [...prev, { id, targetSlot }]);
        timers.push(setTimeout(() => {
          setDealCards(prev => prev.filter(c => c.id !== id));
        }, 600));
      }, i * interval));
    });

    const totalTime = dealOrder.length * interval + 800;
    timers.push(setTimeout(() => {
      setPhase('done');
      onCompleteRef.current();
    }, totalTime));

    return () => timers.forEach(t => clearTimeout(t));
  }, [active, phase, dealer, mySeat]);

  const showBadges = active && (phase === 'suits' || phase === 'card_reveal' || phase === 'card_slide' || phase === 'dealing');

  const dealerSlot = getVisualSlot(dealer, mySeat);

  return {
    phase: active ? phase : ('done' as CeremonyPhase),
    dealCards,
    showBadges,
    dealerSlot,
  };
}
