import { useState, useRef, useEffect } from "react";
import type { Seat, LogEvent } from "../engine/tuteTypes";

type AnuncioTipo = "cante" | "tute" | "irados" | "tirarselas";

export function useAnuncio(
  reoLog: LogEvent[],
  nameOf: (seat: Seat) => string
) {
  const [anuncio, setAnuncio] = useState<{ texto: string; tipo: AnuncioTipo } | null>(null);
  const logLenRef = useRef(0);

  // Detect new anuncio events
  useEffect(() => {
    const prevLen = logLenRef.current;
    logLenRef.current = reoLog.length;
    if (reoLog.length <= prevLen) return;

    for (let i = prevLen; i < reoLog.length; i++) {
      const e = reoLog[i] as any;
      if (e.t === "tute") {
        const kind = e.kind === "reyes" ? "4 Reyes" : "4 Caballos";
        setAnuncio({ texto: `${nameOf(e.seat)} canta TUTE (${kind})`, tipo: "tute" });
        return;
      }
      if (e.t === "cante") {
        setAnuncio({ texto: `${nameOf(e.seat)} canta ${e.palo} (${e.puntos})`, tipo: "cante" });
        return;
      }
      if (e.t === "irADos") {
        setAnuncio({ texto: `${nameOf(e.seat)} va a los dos!`, tipo: "irados" });
        return;
      }
      if (e.t === "tirarselas") {
        setAnuncio({ texto: `${nameOf(e.seat)} se las tira!`, tipo: "tirarselas" });
        return;
      }
    }
  }, [reoLog]);

  // Auto-hide after 2s
  useEffect(() => {
    if (!anuncio) return;
    const t = setTimeout(() => setAnuncio(null), 2000);
    return () => clearTimeout(t);
  }, [anuncio]);

  return anuncio;
}
