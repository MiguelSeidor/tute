import { useEffect } from "react";

export function useCardImagePreload() {
  useEffect(() => {
    const palos = ['espadas', 'oros', 'bastos', 'copas'];
    const nums = [1, 3, 6, 7, 10, 11, 12];
    for (const p of palos)
      for (const n of nums) {
        const img = new Image();
        img.src = `/cartas/${p}_${n}.png`;
      }
    const dorso = new Image();
    dorso.src = '/cartas/dorso.png';
    const piedra = new Image();
    piedra.src = '/cartas/piedra.png';
  }, []);
}
