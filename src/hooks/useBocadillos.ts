import { useState, useRef, useCallback } from "react";
import type { Seat } from "../engine/tuteTypes";

export function useBocadillos(timeout = 4000) {
  const [bocadillos, setBocadillos] = useState<Record<Seat, { texto: string; key: number } | null>>({
    0: null, 1: null, 2: null, 3: null,
  } as Record<Seat, { texto: string; key: number } | null>);
  const keyRef = useRef(0);

  const mostrarBocadillo = useCallback((seat: Seat, texto: string) => {
    keyRef.current++;
    const key = keyRef.current;
    setBocadillos(prev => ({ ...prev, [seat]: { texto, key } }));
    setTimeout(() => {
      setBocadillos(prev => prev[seat]?.key === key ? { ...prev, [seat]: null } : prev);
    }, timeout);
  }, [timeout]);

  return { bocadillos, mostrarBocadillo };
}
