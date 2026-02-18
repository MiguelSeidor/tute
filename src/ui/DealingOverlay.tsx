import React, { useState, useEffect, useRef } from 'react';
import type { Seat } from '../engine/tuteTypes';

const CLOCKWISE: Seat[] = [0, 3, 2, 1];

type VisualSlot = 'bottom' | 'left' | 'top' | 'right';

interface DealingOverlayProps {
  dealer: Seat;
  mySeat?: Seat;
  onComplete: () => void;
}

const DIRECTION: Record<VisualSlot, { x: string; y: string }> = {
  top:    { x: '0px', y: 'clamp(-120px, -25vh, -80px)' },
  left:   { x: 'clamp(-120px, -25vw, -80px)', y: '0px' },
  right:  { x: 'clamp(80px, 25vw, 120px)', y: '0px' },
  bottom: { x: '0px', y: 'clamp(80px, 25vh, 120px)' },
};

function getVisualSlot(seat: Seat, mySeat?: Seat): VisualSlot {
  if (mySeat === undefined) {
    return (['bottom', 'left', 'top', 'right'] as const)[seat];
  }
  const myIdx = CLOCKWISE.indexOf(mySeat);
  const seatIdx = CLOCKWISE.indexOf(seat);
  const offset = (seatIdx - myIdx + 4) % 4;
  return (['bottom', 'right', 'top', 'left'] as const)[offset];
}

export function DealingOverlay({ dealer, mySeat, onComplete }: DealingOverlayProps) {
  const [cards, setCards] = useState<{ id: number; targetSlot: VisualSlot }[]>([]);
  const cardId = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const activos = CLOCKWISE.filter(s => s !== dealer);
    const dealOrder: Seat[] = [];
    for (let round = 0; round < 3; round++) {
      for (const s of activos) dealOrder.push(s);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const interval = 200;

    dealOrder.forEach((seat, i) => {
      timers.push(setTimeout(() => {
        const id = cardId.current++;
        const targetSlot = getVisualSlot(seat, mySeat);
        setCards(prev => [...prev, { id, targetSlot }]);
        timers.push(setTimeout(() => {
          setCards(prev => prev.filter(c => c.id !== id));
        }, 500));
      }, i * interval));
    });

    const totalTime = dealOrder.length * interval + 600;
    timers.push(setTimeout(() => onCompleteRef.current(), totalTime));

    return () => timers.forEach(t => clearTimeout(t));
  }, [dealer, mySeat]);

  return (
    <>
      <style>{`
        @keyframes deal-fly {
          from { opacity: 1; transform: translate(0, 0) scale(1); }
          to   { opacity: 0; transform: translate(var(--deal-tx), var(--deal-ty)) scale(0.4); }
        }
        .dealing-overlay {
          position: fixed; inset: 0; z-index: 100000;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        .dealing-origin {
          position: relative;
          width: 1px; height: 1px;
        }
        .dealing-card {
          position: absolute;
          width: clamp(28px, 7vw, 52px);
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          top: 50%; left: 50%;
          margin-top: clamp(-28px, -5vw, -36px);
          margin-left: clamp(-20px, -4vw, -26px);
          animation: deal-fly 450ms ease-in both;
        }
      `}</style>

      <div className="dealing-overlay">
        <div className="dealing-origin">
          {cards.map(dc => {
            const dir = DIRECTION[dc.targetSlot];
            return (
              <img
                key={dc.id}
                className="dealing-card"
                src="/cartas/dorso.png"
                alt="carta"
                style={{
                  '--deal-tx': dir.x,
                  '--deal-ty': dir.y,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
