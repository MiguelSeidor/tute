import { useState, useRef, useEffect } from "react";
import type { Seat } from "../engine/tuteTypes";
import { getVisualSlot } from "../ui/DealerCeremony";
import type { DealCardAnim } from "../ui/DealerCeremony";

export function useDealingAnimation(
  trigger: Seat | null,
  mySeat: Seat,
  onComplete: () => void,
  activos?: Seat[]
): DealCardAnim[] {
  const [reoDealCards, setReoDealCards] = useState<DealCardAnim[]>([]);
  const cardIdRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const activosRef = useRef(activos);
  activosRef.current = activos;

  useEffect(() => {
    if (trigger === null) {
      setReoDealCards([]);
      return;
    }

    const dealer = trigger;
    // Deal only to active players (excluding the dealer)
    const targets = activosRef.current
      ? activosRef.current.filter(s => s !== dealer)
      : [];
    if (targets.length === 0) {
      onCompleteRef.current();
      return;
    }
    const dealOrder: Seat[] = [];
    for (let round = 0; round < 3; round++) {
      for (const s of targets) dealOrder.push(s);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const interval = 200;

    dealOrder.forEach((seat, i) => {
      timers.push(setTimeout(() => {
        const id = cardIdRef.current++;
        const targetSlot = getVisualSlot(seat, mySeat);
        setReoDealCards(prev => [...prev, { id, targetSlot }]);
        timers.push(setTimeout(() => {
          setReoDealCards(prev => prev.filter(c => c.id !== id));
        }, 500));
      }, i * interval));
    });

    const totalTime = dealOrder.length * interval + 600;
    timers.push(setTimeout(() => {
      onCompleteRef.current();
    }, totalTime));

    return () => timers.forEach(t => clearTimeout(t));
  }, [trigger, mySeat]);

  return reoDealCards;
}
