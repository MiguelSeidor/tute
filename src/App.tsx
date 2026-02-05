
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

/*
TUTE VALENCIANO – 3 JUGADORES
*/

// --- CONFIGURACIÓN ---
const PALOS = ["oros", "copas", "espadas", "bastos"];
const CARTAS = [1, 3, 6, 7, 10, 11, 12];
const PUNTOS: Record<number, number> = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2, 7: 0, 6: 0 };
const FUERZA = [1, 3, 12, 11, 10, 7, 6];

// --- UTILIDADES ---
const barajar = (a: any[]) => [...a].sort(() => Math.random() - 0.5);
function crearBaraja() {
  return barajar(PALOS.flatMap((p) => CARTAS.map((n) => ({ palo: p, num: n }))));
}
function gana(c1: any, c2: any, triunfo: string, paloSalida: string) {
  const misma = c1.palo === c2.palo;
  if (misma) return FUERZA.indexOf(c1.num) < FUERZA.indexOf(c2.num) ? c1 : c2;
  if (c1.palo === triunfo && c2.palo !== triunfo) return c1;
  if (c2.palo === triunfo && c1.palo !== triunfo) return c2;
  if (c1.palo === paloSalida) return c1;
  if (c2.palo === paloSalida) return c2;
  return c1;
}

/** LEGALIDAD del tute valenciano: seguir palo; superar si puedes; fallar solo si ganas. */
function puedeJugar(carta: any, mano: any[], mesa: any[], triunfo: string) {
  // Sin cartas en mesa → libre
  if (mesa.length === 0) return true;

  const paloSalida = mesa[0].palo;

  // Carta ganadora actual (para saber si gana palo de salida o triunfo)
  let ganadora = mesa[0];
  for (let i = 1; i < mesa.length; i++) {
    ganadora = gana(ganadora, mesa[i], triunfo, paloSalida);
  }

  const idx = (n: number) => FUERZA.indexOf(n);

  // ¿Tengo cartas del palo de salida?
  const tengoPaloSalida = mano.some((c) => c.palo === paloSalida);

  // Triunfos en mi mano y en mesa
  const misTriunfos = mano.filter((c) => c.palo === triunfo);
  const tengoTriunfo = misTriunfos.length > 0;
  const triunfosEnMesa = mesa.filter((c) => c.palo === triunfo);

  // === 1) TENGO PALO DE SALIDA ==========================================
  if (tengoPaloSalida) {
    if (ganadora.palo === paloSalida) {
      // El ganador actual es del palo de salida → obligación de superar si puedo
      const puedoSuperarConPalo = mano.some(
        (c) => c.palo === paloSalida && idx(c.num) < idx(ganadora.num)
      );

      if (puedoSuperarConPalo) {
        // Debo jugar del palo y por encima de la ganadora actual del palo
        return carta.palo === paloSalida && idx(carta.num) < idx(ganadora.num);
      }

      // No puedo superar → cualquier carta del palo de salida es válida
      return carta.palo === paloSalida;
    }

    // ⚠️ El ganador actual es TRIUNFO → NO hay obligación de superar con el palo de salida.
    // Solo debo seguir palo.
    return carta.palo === paloSalida;
  }

  // === 2) NO TENGO PALO DE SALIDA =======================================
  if (!tengoTriunfo) {
    // No tengo ni palo de salida ni triunfo → libre
    return true;
  }

  // 2.a) Si ya hay triunfo en mesa: debo sobretriunfar SOLO si puedo
  if (triunfosEnMesa.length > 0) {
    let triunfoGanador = triunfosEnMesa[0];
    for (let k = 1; k < triunfosEnMesa.length; k++) {
      if (idx(triunfosEnMesa[k].num) < idx(triunfoGanador.num)) {
        triunfoGanador = triunfosEnMesa[k];
      }
    }

    const puedoSuperarTriunfo = misTriunfos.some(
      (c) => idx(c.num) < idx(triunfoGanador.num)
    );

    if (puedoSuperarTriunfo) {
      // Obligado a tirar un triunfo que supere al triunfo ganador
      return carta.palo === triunfo && idx(carta.num) < idx(triunfoGanador.num);
    }

    // No puedo superar el triunfo actual → libre
    return true;
  }

  // 2.b) NO hay triunfo en mesa:
  // Si tengo triunfo, al fallar GANARÍA → obligado a fallar con triunfo
  return carta.palo === triunfo;
}


// ======= UI =======
function Carta({
  carta, onClick, tapada = false, legal = true, style = {}, animFrom = null, mini = false,
}: any) {
  const src = tapada ? "/cartas/dorso.png" : `/cartas/${carta.palo}_${carta.num}.png`;
  const animationName =
    animFrom === 0 ? "from-bottom" :
    animFrom === 1 ? "from-left"   :
    animFrom === 2 ? "from-right"  : null;

  return (
    <img
      src={src}
      alt="carta"
      onClick={legal ? onClick : undefined}
      style={{
        width: mini ? "calc(var(--card-w) * .5)" : "var(--card-w)",
        margin: mini ? 3 : 6,
        cursor: legal ? "pointer" : "not-allowed",
        opacity: legal ? 1 : 0.4,
        borderRadius: 6,
        boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
        animation: animationName ? `${animationName} 260ms ease-out both` : undefined,
        ...style,
      }}
    />
  );
}

function MesaVisual({ mesa }: any) {
  const posiciones: any = {
    0: { bottom: 0, left: "50%", transform: "translateX(-50%)" },
    1: { left: 0, top: "50%", transform: "translateY(-50%)" },
    2: { right: 0, top: "50%", transform: "translateY(-50%)" },
  };
  return (
    <div
      style={{
        position: "relative", width: "100%", height: "100%",
        padding: 10, boxSizing: "border-box", borderRadius: 12,
        background: "rgba(0,0,0,0.2)",
      }}
    >
      {mesa.map((c: any, i: number) => (
        <div key={i} style={{ position: "absolute", ...posiciones[c.j] }}>
          <Carta carta={c} animFrom={c.j} />
        </div>
      ))}
    </div>
  );
}

function PanelTriunfo({ triunfo }: any) {
  const key = triunfo ? `${triunfo.palo}-${triunfo.num}` : "sin-triunfo";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 12px" }}>
      <div
        key={key}
        style={{
          width: 76, height: 106, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.15)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)",
          animation: "pop-in 200ms ease-out both",
        }}
      >
        {triunfo ? <Carta carta={triunfo} legal style={{ width: "var(--npc-card-w)", margin: 0 }} /> : <span style={{ opacity: 0.7 }}>—</span>}
      </div>
      <div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>Muestra (Triunfo)</div>
        <div style={{ fontWeight: "bold" }}>{triunfo ? `${triunfo.num} de ${triunfo.palo}` : "—"}</div>
      </div>
    </div>
  );
}

function OverlayDecision({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999
    }}>
      <div style={{
        background: "rgba(255,255,255,0.92)", padding: "28px 35px", borderRadius: 12,
        border: "2px solid rgba(0,0,0,0.3)", boxShadow: "0 8px 45px rgba(0,0,0,0.4)",
        textAlign: "center", minWidth: 280
      }}>
        <h2 style={{ marginTop: 0 }}>¿Quieres ir a los dos?</h2>
        <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
          <button style={{ padding: "10px 20px", fontSize: 16, borderRadius: 6 }} onClick={onYes}>Sí</button>
          <button style={{ padding: "10px 20px", fontSize: 16, borderRadius: 6 }} onClick={onNo}>No</button>
        </div>
      </div>
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---
export default function TuteValenciano() {
  const [manos, setManos] = useState<any[][]>([[], [], []]);
  const [mesa, setMesa] = useState<any[]>([]);
  const [turno, setTurno] = useState(0);
  const [triunfo, setTriunfo] = useState<any>(null);
  const [puntos, setPuntos] = useState([0, 0, 0]);
  const [irADos, setIrADos] = useState<number | null>(null);
  const [vistas, setVistas] = useState<any[]>([]);
  const [fallos, setFallos] = useState<any[]>([
    { oros: false, copas: false, espadas: false, bastos: false },
    { oros: false, copas: false, espadas: false, bastos: false },
    { oros: false, copas: false, espadas: false, bastos: false },
  ]);
  const [bloqueado, setBloqueado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const [estadoCantar, setEstadoCantar] =
    useState<"no_disponible" | "pendiente" | "hecho" | "perdido">("no_disponible");
  const [estadoCantarIA, setEstadoCantarIA] = useState(["no_disponible", "no_disponible", "no_disponible"]);
  const [bazaN, setBazaN] = useState(0);
  const [cantesDisponibles, setCantesDisponibles] = useState<any[]>([]);
  const [yaCantoEsteTurno, setYaCantoEsteTurno] = useState(false);
  const [iaYaCambioMuestra, setIaYaCambioMuestra] = useState([false, false, false]);
  const [colaMensajes, setColaMensajes] = useState<{ texto: string; duracion: number }[]>([]);
  const mensajeTimerRef = React.useRef<number | null>(null);

  // Refs de control (nivel superior del componente, NO dentro de funciones)
  const yaCambioInicialRef = React.useRef<[boolean, boolean, boolean]>([false, false, false]);
  const yaRegistroIrADosRef = React.useRef<boolean>(false);

  const [esperandoDecisionInicial, setEsperandoDecisionInicial] = useState(true);

  const startedRef = React.useRef(false);
  const [modoDestapado, setModoDestapado] = useState(false);

  const [cantesCantadosIA, setCantesCantadosIA] = useState<any[][]>([[], [], []]);
  const [cantesDisponiblesIAReales, setCantesDisponiblesIAReales] = useState<any[][]>([[], [], []]); // por si limitas a 1 cante
  const [bazasPorJugador, setBazasPorJugador] = useState<any[][]>([[], [], []]);

  // Palos ya cantados por el HUMANO (evita cantar dos veces el mismo palo)
  const [cantesCantadosHumano, setCantesCantadosHumano] = useState<string[]>([]);

  // Índices de los jugadores que han quedado últimos al finalizar la partida.
  // Puede haber empates (p.ej., [1,2]).
  const [perdedores, setPerdedores] = useState<number[]>([]);

  // Quién salió primero en la partida (mano inicial), para desempates de partida normal
  const [salidorInicial, setSalidorInicial] = useState<number>(0);


  // Piedras (chinas) por jugador: contamos “piedras perdidas”
  const [piedras, setPiedras] = useState<number[]>([5, 5, 5]);

  // Serie cerrada (cuando alguien llega a 0 piedras)
  const [serieCerrada, setSerieCerrada] = useState<boolean>(false);

  // Clave de almacenamiento local
  const PIEDRAS_KEY = "tute_piedras_v2";


  // Jugador que reparte en este REO (rota en sentido horario)
  // null significa "no establecido aún" (primer REO de la serie)
  const [dealer, setDealer] = useState<number | null>(null);


  // === Simulador de REO ===
  const [simOpen, setSimOpen] = useState(false);
  const [simJ0, setSimJ0] = useState<string>(""); // cartas de J1 (tú)
  const [simJ1, setSimJ1] = useState<string>(""); // cartas de J2
  const [simJ2, setSimJ2] = useState<string>(""); // cartas de J3

  // Dealer simulado (0=J1, 1=J2, 2=J3)
  const [simDealer, setSimDealer] = useState<number>(0);

  // Triunfo simulado: {palo, num} o "auto"
  const [simTriPalo, setSimTriPalo] = useState<string>("auto"); // "auto" | "oros" | "copas" | "espadas" | "bastos"
  const [simTriNum, setSimTriNum] = useState<number>(7);        // 1,3,6,7,10,11,12 (solo si no es auto)

  // Mensaje de error de validación
  const [simError, setSimError] = useState<string>("");


  const [tuteDisponible, setTuteDisponible] = useState<boolean>(false);
  const [tutePerdido, setTutePerdido] = useState<boolean>(false);



  // === TUTE para IA ===
  // Si cada jugador IA (J2 y J3) tiene TUTE disponible tras ganar baza
  const [tuteDisponibleIA, setTuteDisponibleIA] = useState<boolean[]>([false, false, false]);

  // Si ya lo han perdido (porque cantaron 40, 20 o ya lo cantaron)
  const [tutePerdidoIA, setTutePerdidoIA] = useState<boolean[]>([false, false, false]);


  // Registro de todo el REO para testeo/inspección
  const [reoLog, setReoLog] = useState<any[]>([]);
  const [mostrarResumenReo, setMostrarResumenReo] = useState(false);

  // ⏱️ Cuenta atrás para autorreinicio tras cerrar el modal
  const [autoRestartSeconds, setAutoRestartSeconds] = useState<number | null>(null);


  // ===== EFECTOS =====
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (esperandoDecisionInicial) return;
    if (bloqueado) return;
    if (serieCerrada) return;  
    if (turno === 0) return;
    if ((manos[turno] as any[]).length === 0) return;
    const t = setTimeout(() => jugarIA(turno), 350 + Math.random() * 450);
    return () => clearTimeout(t);
  }, [turno, bloqueado, manos, mesa, esperandoDecisionInicial, serieCerrada]);

  useEffect(() => {
    if (mensaje === "" && colaMensajes.length > 0) {
      const { texto, duracion } = colaMensajes[0];
      setMensaje(texto);
      setColaMensajes((prev) => prev.slice(1));
      if (mensajeTimerRef.current) { clearTimeout(mensajeTimerRef.current); mensajeTimerRef.current = null; }
      mensajeTimerRef.current = window.setTimeout(() => { setMensaje(""); mensajeTimerRef.current = null; }, duracion || 5000);
    }
  }, [mensaje, colaMensajes]);

  useEffect(() => () => { if (mensajeTimerRef.current) { clearTimeout(mensajeTimerRef.current); mensajeTimerRef.current = null; } }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIEDRAS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length === 3 && arr.every(x => Number.isFinite(x)))
          setPiedras(arr);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    try {
      localStorage.setItem(PIEDRAS_KEY, JSON.stringify(piedras));
    } catch {}
  }, [piedras]);


  // ⏱️ Cuenta atrás de reinicio automático del REO
  useEffect(() => {
    if (autoRestartSeconds === null) return;

    if (autoRestartSeconds <= 0) {
      // Reiniciar REO automáticamente
      iniciar();
      setAutoRestartSeconds(null);
      return;
    }

    const t = setTimeout(() => {
      setAutoRestartSeconds((prev) => (prev !== null ? prev - 1 : prev));
    }, 1000);

    return () => clearTimeout(t);
  }, [autoRestartSeconds]);

  // Cuando dealer se pone a null → arrancar la siguiente REO automáticamente
  useEffect(() => {
    if (dealer === null && !serieCerrada) {
      iniciar(true);    // ahora sí, dealer === null en este render
    }
  }, [dealer, serieCerrada]);



  // ===== HELPERS =====
  function pushMensaje(texto: string, duracion = 5000) {
    if (!texto) return;
    setColaMensajes((prev) => [...prev, { texto, duracion }]);
  }


  function cartaToString(c: any) {
    const palo = c.palo[0].toUpperCase(); // O, C, E, B
    return `${palo}-${c.num}`;
  }


  function logReo(entry: any) {
    setReoLog(prev => [...prev, entry]);
  }

  function obtenerCantes(mano: any[], triunfoPalo: string) {
    const cantes: { palo: string; puntos: number }[] = [];
    for (const p of PALOS) {
      const tieneRey = mano.some((c) => c.palo === p && c.num === 12);
      const tieneCab = mano.some((c) => c.palo === p && c.num === 11);
      if (tieneRey && tieneCab) cantes.push({ palo: p, puntos: p === triunfoPalo ? 40 : 20 });
    }
    return cantes;
  }

  function puedeCambiarSiete(j: number) {
    if (!triunfo) return false;
    if (triunfo.num === 7) return false;
    const noHaJugadoAun = !vistas.some((c) => c.j === j);
    if (!noHaJugadoAun) return false;
    return (manos[j] as any[]).some((c) => c.palo === triunfo.palo && c.num === 7);
  }

  function ordenarMano(mano: any[]) {
    const ordenPalos: any = { oros: 0, copas: 1, espadas: 2, bastos: 3 };
    return [...mano].sort((a, b) => {
      if (a.palo !== b.palo) return ordenPalos[a.palo] - ordenPalos[b.palo];
      return FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num);
    });
  }

  function sumarPiedra(j: number, n = 1) {
    setPiedras(prev => {
      const copy = [...prev];
      copy[j] = Math.max(0, (copy[j] ?? 0) + n);
      return copy;
    });
  }

  function restarPiedra(j: number, n = 1) {
    setPiedras(prev => {
      const copy = [...prev];
      copy[j] = Math.max(0, (copy[j] ?? 0) - n);
      return copy;
    });
  }


  // === Helpers para simulación ===
  const ALL_CARDS = PALOS.flatMap((p) => CARTAS.map((n) => ({ palo: p, num: n })));
  const ABBR: Record<string, string> = { o: "oros", c: "copas", e: "espadas", b: "bastos" };
  const keyC = (c: any) => `${c.palo}-${c.num}`;

  /** Convierte un token ("oros-1", "o-1", "copas:3", "E 10") a carta {palo, num} */
  function parseTokenToCard(tok: string): { palo: string; num: number } | null {
    const t = tok.trim().toLowerCase().replace(/[:,]/g, "-").replace(/\s+/g, "-");
    if (!t) return null;
    const parts = t.split("-").filter(Boolean);
    if (parts.length < 2) return null;

    // palo puede ser largo o abreviado
    let palo = parts[0];
    if (ABBR[palo]) palo = ABBR[palo];

    const num = Number(parts[1]);
    if (!PALOS.includes(palo)) return null;
    if (!CARTAS.includes(num)) return null;

    return { palo, num };
  }

  /** Convierte una cadena de cartas a lista de cartas, p.ej.: "oros-1, o-3, e-10, bastos-7" */
  function parseCardsList(s: string): { ok: boolean; cards: any[]; error?: string } {
    const tokens = s.split(/[\n,;]+/);
    const cards: any[] = [];
    for (const raw of tokens) {
      const card = parseTokenToCard(raw);
      if (!card) {
        const shown = raw.trim() || "(vacío)";
        return { ok: false, cards: [], error: `No reconozco la carta: "${shown}"` };
      }
      cards.push(card);
    }
    return { ok: true, cards };
  }

  /** Comprueba si dos cartas son iguales */
  function sameCard(a: any, b: any) {
    return a.palo === b.palo && a.num === b.num;
  }

  /** Quita duplicados preservando orden */
  function uniqueCards(arr: any[]) {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const c of arr) {
      const k = keyC(c);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(c);
      }
    }
    return out;
  }


  // ¿La carta num de 'palo' ya ha salido (mesa actual o vistas)?
  function hasBeenSeenInPlay(palo: string, num: number, mesaLocal: any[], vistasLocal: any[]) {
    return mesaLocal.some(c => c.palo === palo && c.num === num) ||
           vistasLocal.some((c: any) => c.palo === palo && c.num === num);
  }


  // Devuelve el triunfo MÁS fuerte para abrir arrastre (1 > 3 > 12 > 11 > 10 > 7 > 6)
  function pickTrumpLead(mano: any[], triunfoPalo?: string | null) {
    if (!triunfoPalo) return null;
    const trumps = mano.filter(c => c.palo === triunfoPalo);
    if (trumps.length === 0) return null;
    // FUERZA: índice menor = más fuerte (1,3,12,11,10,7,6)
    return trumps.sort((a, b) => FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num))[0];
  }

  // ¿Tengo TODAS las cartas restantes de 'palo' (fuera de mi mano no queda ninguna)?
  function ownsAllRemainingOfSuit(palo: string, mano: any[], mesaLocal: any[], vistasLocal: any[]) {
    const TOTAL_EN_PALO = 7; // 1,3,12,11,10,7,6
    const enMano = mano.filter(c => c.palo === palo).length;
    const enMesa = mesaLocal.filter(c => c.palo === palo).length;
    const enVistas = vistasLocal.filter((c: any) => c.palo === palo).length;
    // si mi mano + mesa + vistas = 7 → fuera de mi mano ya no queda ninguna por jugar
    return (enMano + enMesa + enVistas) === TOTAL_EN_PALO;
  }

  // Elige la carta con más puntos de un palo concreto (entre 'legales' de ese palo)
  function pickHighestPointsInSuit(legales: any[], palo: string) {
    const delPalo = legales.filter(c => c.palo === palo);
    if (delPalo.length === 0) return null;
    return delPalo.sort((a, b) =>
      (PUNTOS[b.num] || 0) - (PUNTOS[a.num] || 0) || (FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num))
    )[0];
  }


  function nuevaPartida(piedrasIniciales: number = 5) {
    setPiedras([piedrasIniciales, piedrasIniciales, piedrasIniciales]);
    setPerdedores([]);
    setSerieCerrada(false);

    // 👉 MUY IMPORTANTE: borrar dealer para que en el siguiente REO sea random
    setDealer(null);

    pushMensaje(`🆕 Nueva partida: piedras reseteadas a ${piedrasIniciales}`, 3000);

    // ❌ YA NO LLAMAMOS iniciar(true) AQUÍ
  }



  // ===== FLUJO =====
  function iniciar(force: boolean = false) {
    // Si protegiste reinicios cuando hay piedras a 0:
    if (!force && piedras.some(v => v <= 0)) {
      pushMensaje("No puedes reiniciar: hay un jugador sin piedras", 4000);
      return;
    }

    // 🔓 SIEMPRE arrancamos "desbloqueado"
    setBloqueado(false);
    if (force) setSerieCerrada(false);
    setMensaje("");
    setColaMensajes([]);
    setCantesCantadosIA([[], [], []]);
    setCantesCantadosHumano([]);
    if (mensajeTimerRef.current) { clearTimeout(mensajeTimerRef.current); mensajeTimerRef.current = null; }
    setReoLog([])

    yaCambioInicialRef.current = [false, false, false];
    yaRegistroIrADosRef.current = false;

    const baraja = crearBaraja();
    let mano0 = ordenarMano(baraja.slice(0, 9));
    let mano1 = ordenarMano(baraja.slice(9, 18));
    let mano2 = ordenarMano(baraja.slice(18, 27));
    let triunfoLocal = baraja[27];

    let candidatoIrADos: number | null = null;
    if (iaDebeIrADos(mano1, triunfoLocal.palo)) candidatoIrADos = 1;
    else if (iaDebeIrADos(mano2, triunfoLocal.palo)) candidatoIrADos = 2;


    const intentaCambio7 = (j: number, mano: any[]) => {
      if (j === 0) return mano;
      if (triunfoLocal.num === 7) return mano;

      // ⛔ evita doble ejecución en dev/StrictMode o reentradas
      if (yaCambioInicialRef.current[j]) return mano;

      const tiene7 = mano.some((c) => c.palo === triunfoLocal.palo && c.num === 7);
      if (!tiene7) return mano;

      yaCambioInicialRef.current[j] = true; // ✅ marcado: ya lo hizo este IA

      const cartaOriginal = { ...triunfoLocal };

      // Log turno inicial (-1)
      logReo({
        tipo: "cambio7",
        jugador: j,
        turno: -1,
        quita: cartaToString(cartaOriginal),
        pone: cartaToString({ palo: cartaOriginal.palo, num: 7 }),
      });

      // Aplicar el cambio a la mano y a triunfoLocal
      const nueva = mano.filter((c) => !(c.palo === cartaOriginal.palo && c.num === 7));
      nueva.push(triunfoLocal);

      triunfoLocal = { palo: cartaOriginal.palo, num: 7 };

      pushMensaje(
        `Jugador ${j + 1} cambia la muestra: sustituye ${cartaOriginal.num} de ${cartaOriginal.palo} por 7 de ${cartaOriginal.palo}`,
        5000
      );

      return ordenarMano(nueva);
    };



    mano1 = intentaCambio7(1, mano1);
    mano2 = intentaCambio7(2, mano2);

    const debeMostrarVentana = candidatoIrADos === null;

    setBazaN(0);
    setManos([mano0, mano1, mano2]);
    setTriunfo(triunfoLocal);
    setMesa([]);
    setPuntos([0, 0, 0]);
    setPerdedores([]);
    setIrADos(candidatoIrADos);
    setVistas([]);
    setFallos([
      { oros: false, copas: false, espadas: false, bastos: false },
      { oros: false, copas: false, espadas: false, bastos: false },
      { oros: false, copas: false, espadas: false, bastos: false },
    ]);
    setEstadoCantar("no_disponible");
    setCantesDisponibles([]);
    setYaCantoEsteTurno(false);
    setBazasPorJugador([[], [], []]);
    setIaYaCambioMuestra([false, false, false]);

    // Determinar dealer (si es el primer REO de la serie)
    let nuevoDealer = dealer;
    if (dealer === null) {
      nuevoDealer = Math.floor(Math.random() * 3); // dealer aleatorio SOLO para primer REO
      setDealer(nuevoDealer);
    }

    // El turno siempre empieza en el jugador siguiente al dealer
    const salidor = (nuevoDealer + 1) % 3;

    setTurno(salidor);
    setSalidorInicial(salidor);

    if (candidatoIrADos !== null) {
      setEsperandoDecisionInicial(false); // IA ya decidió ir a los dos
    } else {
      setEsperandoDecisionInicial(true); // cerramos overlay
    }

    setTuteDisponible(false);
    setTutePerdido(false);
    setTuteDisponibleIA([false,false,false]);
    setTutePerdidoIA([false,false,false]);
  }

  function jugar(j: number, carta: any) {
    if (serieCerrada) return;   // bloquea si la serie terminó
    if (j !== turno) return;
    if (!puedeJugar(carta, manos[j], mesa, triunfo?.palo)) return alert("Movimiento ilegal");

    // Registrar jugada
    logReo({
      tipo: "jugar",
      jugador: j,
      carta: { palo: carta.palo, num: carta.num },
      turno: bazaN,
    });


    if (j === 0 && estadoCantar === "pendiente" && !yaCantoEsteTurno) { setEstadoCantar("perdido"); setCantesDisponibles([]); }
    if (j !== 0 && estadoCantarIA[j] === "pendiente") { const e = [...estadoCantarIA]; (e as any)[j] = "perdido"; setEstadoCantarIA(e); }

    if (mesa.length > 0) {
      const paloSalida = mesa[0].palo;
      if (carta.palo !== paloSalida) {
        setFallos((prev) => { const n = [...prev]; (n as any)[j][paloSalida] = true; return n; });
      }
    }

    const nm = [...manos] as any[][];
    nm[j] = nm[j].filter((c) => !(c.palo === carta.palo && c.num === carta.num));
    if (j === 0) nm[j] = ordenarMano(nm[j]);

    const nuevaMesa = [...mesa, { ...carta, j }];
    setManos(nm as any);
    setMesa(nuevaMesa);
    if (nuevaMesa.length === 3) { setBloqueado(true); setTimeout(() => resolver(nuevaMesa), 800); }
    else setTurno((turno + 1) % 3);
  }

  function tieneTute(mano: any[]) {
    const reyes = mano.filter(c => c.num === 12).length;
    const caballos = mano.filter(c => c.num === 11).length;
    return reyes === 4 || caballos === 4;
  }

  function cambiarTriunfo() {
    logReo({
      tipo: "cambio7",
      jugador: 0,
      turno: vistas.length > 0 ? bazaN : -1,
      quita: cartaToString({ palo: triunfo.palo, num: triunfo.num }),
      pone: cartaToString({ palo: triunfo.palo, num: 7 })
    });
    if (!triunfo) return;
    const sieteEnMano = (manos[0] as any[]).some((c) => c.palo === triunfo.palo && c.num === 7);
    if (!sieteEnMano || triunfo.num === 7) return;
    const paloTriunfo = triunfo.palo;
    const nuevaMano = (manos[0] as any[]).filter((c) => !(c.palo === paloTriunfo && c.num === 7));
    nuevaMano.push(triunfo);
    const nuevasManos = [...manos] as any[][];
    nuevasManos[0] = ordenarMano(nuevaMano);
    setManos(nuevasManos as any);
    setTriunfo({ palo: paloTriunfo, num: 7 });
    pushMensaje(`Cambio: has puesto el 7 de ${paloTriunfo} como muestra`, 5000);
  }


  function cambiarTriunfoIA(j: number) {
    if (j === 0 || !triunfo) return false;

    if (iaYaCambioMuestra[j]) return false;

    const noHaJugadoAun = !vistas.some(c => c.j === j);
    if (!noHaJugadoAun || triunfo.num === 7) return false;

    const paloTriunfo = triunfo.palo;
    const tiene7 = manos[j].some(c => c.palo === paloTriunfo && c.num === 7);
    if (!tiene7) return false;

    // GUARDA la carta antes de cambiar
    const cartaOriginal = { ...triunfo };

    // HACER EL CAMBIO
    const nuevaMano = manos[j].filter(c => !(c.palo === paloTriunfo && c.num === 7));
    nuevaMano.push(triunfo);

    const nuevasManos = [...manos];
    nuevasManos[j] = ordenarMano(nuevaMano);
    setManos(nuevasManos);

    setTriunfo({ palo: paloTriunfo, num: 7 });

    pushMensaje(`Jugador ${j + 1} cambia la muestra: sustituye ${cartaOriginal.num} de ${cartaOriginal.palo} por 7 de ${paloTriunfo}`, 5000);

    // REGISTRAR CAMBIO DE 7
    logReo({
      tipo: "cambio7",
      jugador: j,
      turno: vistas.length > 0 ? bazaN : -1,
      quita: cartaToString(cartaOriginal),
      pone: cartaToString({ palo: paloTriunfo, num: 7 })
    });


    // ✅ marcar que este jugador IA YA hizo el cambio (no repetir)
    setIaYaCambioMuestra((prev) => {
      const copy = [...prev];
      copy[j] = true;
      return copy;
    });


    return true;
  }




  function cantarTuteIA(jDeclara: number) {
    logReo({
      tipo: "tute",
      jugador: jDeclara,
      turno: bazaN,
    });

    // Marcarlo como usado / perdido
    setTuteDisponibleIA(prev => {
      const p = [...prev];
      p[jDeclara] = false;
      return p;
    });

    // Registrar que ese jugador ya no puede volver a cantar TUTE
    setTutePerdidoIA(prev => {
      const p = [...prev];
      p[jDeclara] = true;
      return p;
    });

    // Aplicar penalización según reglas
    aplicarPenalizacionPorTute(jDeclara);
  }


  // ===== IA (Modo Inteligente – Equilibrado) =====
  function jugarIA(j: number) {
    // 0) Cante de TUTE de la IA antes de jugar (si procede)
    if (tuteDisponibleIA[j] && !tutePerdidoIA[j]) {
      cantarTuteIA(j);
      return;
    }


    // 0.b) Si tiene cante pendiente (20/40), canta ANTES de jugar carta
    if (estadoCantarIA[j] === "pendiente") {
      const manoIA = manos[j] as any[];
      const posibles = obtenerCantes(manoIA, triunfo?.palo);
      const yaCantados = cantesCantadosIA[j] || [];
      const candidatos = posibles.filter(c => !yaCantados.includes(c.palo));

      if (candidatos.length > 0) {
        // Elegimos el mejor (prioridad 40 > 20)
        const mejor = [...candidatos].sort((a, b) => b.puntos - a.puntos)[0];

      logReo({
        tipo: "cante",
        jugador: j,
        palo: mejor.palo,
        puntos: mejor.puntos,
        turno: bazaN,
      });

        // Sumar puntos del cante
        const np2 = [...puntos];
        np2[j] += mejor.puntos;
        setPuntos(np2);

        // Mensaje
        pushMensaje(`🎺 Jugador ${j + 1} canta ${mejor.palo} (+${mejor.puntos})`, 5000);

        // Marcar estado como "hecho" y registrar palo cantado
        const nuevoEstado = [...estadoCantarIA];
        nuevoEstado[j] = "hecho";
        setEstadoCantarIA(nuevoEstado);

        const mem = [...cantesCantadosIA];
        mem[j] = [...yaCantados, mejor.palo];
        setCantesCantadosIA(mem);
      } else {
        // No hay nada que cantar realmente → no insistir
        const nuevo = [...estadoCantarIA];
        nuevo[j] = "perdido";
        setEstadoCantarIA(nuevo);
        // Continúa a decidir la carta
      }
    }


    const mano = manos[j];
    const paloTriunfo = triunfo?.palo;
    const mesaLocal = mesa;
    const cartasEnMesa = mesaLocal.length;

    // Cartas legales
    const legales = mano.filter((c: any) => puedeJugar(c, mano, mesaLocal, paloTriunfo));
    if (legales.length === 0) return;

    // Utils
    const idx = (n: number) => FUERZA.indexOf(n);
    const isTri = (c: any) => c.palo === paloTriunfo;
    const puntosCarta = (c: any) => PUNTOS[c.num] || 0;

    const ganaCon = (c: any) => {
      const hipotetica = [...mesaLocal, { ...c, j }];
      let w = hipotetica[0];
      const paloSalida = hipotetica[0].palo;
      for (let k = 1; k < hipotetica.length; k++) {
        w = gana(w, hipotetica[k], paloTriunfo, paloSalida);
      }
      return w.j === j;
    };

    const ganadorActual = (() => {
      if (cartasEnMesa === 0) return null;
      let w = mesaLocal[0];
      const paloSalida = mesaLocal[0].palo;
      for (let k = 1; k < mesaLocal.length; k++) {
        w = gana(w, mesaLocal[k], paloTriunfo, paloSalida);
      }
      return w;
    })();

    const puntosEnMesa = mesaLocal.reduce((s, c) => s + (PUNTOS[c.num] || 0), 0);

    // Quiénes son rivales y compañero (según ir a los dos)
    const rivales = [0, 1, 2].filter(x => x !== j);
    const esSolo = irADos === j;
    const haySolo = irADos !== null;
    const compi = haySolo ? (esSolo ? null : rivales.find(x => x !== irADos)!) : null;
    const esEquipo = haySolo ? !esSolo : true; // si hay solo y no soy yo -> estoy en equipo

    // === PRIORIDADES auxiliares ===

    // P1) Peligro de TUTE del ganador actual: si el ganador actual es rival y está ganando con 12 o 11
    const peligroTute = (() => {
      if (!ganadorActual) return false;
      const quien = ganadorActual.j;
      const esRival = quien !== j && (compi === null || quien !== compi);
      return esRival && (ganadorActual.num === 12 || ganadorActual.num === 11);
    })();

    // P2) Peligro de CANTE del ganador (40/20): si gana con 12/11 del mismo palo que podría emparejar
    const peligroCante = (() => {
      if (!ganadorActual) return false;
      const quien = ganadorActual.j;
      const esRival = quien !== j && (compi === null || quien !== compi);
      return esRival && (ganadorActual.num === 12 || ganadorActual.num === 11);
    })();

    // P5) ¿Es baza de monte? (última)
    const esBazaDeMonte = bazaN === 8; // se está resolviendo la baza 9

    // helper: separar legales por características
    const legalesOrdenFUERZAAsc = [...legales].sort((a, b) => idx(a.num) - idx(b.num)); // más fuerte = menor idx
    const legalesOrdenFUERZADesc = [...legales].sort((a, b) => idx(b.num) - idx(a.num));
    const legalesPuntosDesc = [...legales].sort((a, b) => puntosCarta(b) - puntosCarta(a));

    // helper: legales que GANAN / PIERDEN
    const ganadoras = legales.filter(ganaCon);
    const pierden = legales.filter(c => !ganaCon(c));

    // helper: legales del palo de salida (si aplica)
    const paloSalida = mesaLocal[0]?.palo;
    const tengoPaloSalida = paloSalida ? mano.some(c => c.palo === paloSalida) : false;
    const legalesMismoPaloSalida = paloSalida ? legales.filter(c => c.palo === paloSalida) : [];
    const legalesTriunfo = legales.filter(isTri);

    // helper: ganador actual es compi / rival
    const ganaCompi = ganadorActual && compi !== null && ganadorActual.j === compi;
    const ganaRival = ganadorActual && (ganadorActual.j !== j) && (!compi || ganadorActual.j !== compi);



    // ============================================
    // CASO 1: NO HAY CARTAS EN MESA (SALGO YO)
    // ============================================
    if (cartasEnMesa === 0) {
      // Guard para fallbacks: si la elegida es triunfo y tengo mejores, arrastro FUERTE
      function jugarConGuardia(c: any) {
        if (paloTriunfo && c.palo === paloTriunfo) {
          const mejorTri = pickTrumpLead(mano, paloTriunfo);
          if (mejorTri) return jugar(j, mejorTri);
        }
        return jugar(j, c);
      }

      // a) Si hay solo y YO estoy en equipo → forzar fallos del solo / sacar triunfos del solo
      if (haySolo && !esSolo) {
        // Si sabemos que el solo falla algún palo → abrir ahí para forzar su triunfo
        const solo = irADos!;
        const fallosSolo = fallos[solo];
        const palosFalladosSolo = PALOS.filter(p => fallosSolo[p]);
        const cartaForzarFallo =
          legales.find(c => palosFalladosSolo.includes(c.palo) && !isTri(c));
        if (cartaForzarFallo) return jugar(j, cartaForzarFallo);

        // Si decido abrir a triunfo, arrastro FUERTE (1, luego 3, luego 12, …)
        const misTri = mano.filter(isTri);
        if (misTri.length >= 2) {
          const mejorTri = pickTrumpLead(mano, paloTriunfo);
          if (mejorTri) return jugar(j, mejorTri);
        }

        // Salida: si poseo todo lo que queda de un palo → jugar la carta de MÁS puntos de ese palo
        const porPalo = PALOS
          .map(p => ({ p, cartas: mano.filter(c => c.palo === p) }))
          .sort((a, b) => b.cartas.length - a.cartas.length);

        for (const g of porPalo) {
          if (ownsAllRemainingOfSuit(g.p, mano, mesaLocal, vistas)) {
            const mejorPuntos = pickHighestPointsInSuit(legales, g.p);
            if (mejorPuntos) return jugar(j, mejorPuntos);
          }
          // si no poseo todas → prioriza carta sin puntos
          const c = legales.find(x => x.palo === g.p && puntosCarta(x) === 0);
          if (c) return jugar(j, c);
        }

        // Fallbacks con guardia (si cae triunfo pequeño, sustituye por arrastre fuerte)
        const sinP_salidaA = legales.find(c => puntosCarta(c) === 0);
        if (sinP_salidaA) return jugarConGuardia(sinP_salidaA);

        return jugarConGuardia(legalesOrdenFUERZAAsc[legalesOrdenFUERZAAsc.length - 1]);
      }

      // b) Si YO soy el solo → limpiar triunfo arrastrando FUERTE
      if (haySolo && esSolo) {
        const misTri = mano.filter(isTri);
        if (misTri.length >= 2) {
          const mejorTri = pickTrumpLead(mano, paloTriunfo);
          if (mejorTri) return jugar(j, mejorTri);
        }

        // Si es baza de monte, prioriza ganar con la mejor que gane y capture puntos
        if (esBazaDeMonte) {
          const mejorGanadora = ganadoras.sort((a, b) => puntosCarta(b) - puntosCarta(a))[0];
          if (mejorGanadora) return jugar(j, mejorGanadora);
        }

        // Salida: si poseo todo un palo → jugar la de MÁS puntos; si no, sin puntos de palo largo
        const porPalo = PALOS
          .map(p => ({ p, cartas: mano.filter(c => c.palo === p) }))
          .sort((a, b) => b.cartas.length - a.cartas.length);

        for (const g of porPalo) {
          if (ownsAllRemainingOfSuit(g.p, mano, mesaLocal, vistas)) {
            const mejorPuntos = pickHighestPointsInSuit(legales, g.p);
            if (mejorPuntos) return jugar(j, mejorPuntos);
          }
          const c = legales.find(x => x.palo === g.p && puntosCarta(x) === 0);
          if (c) return jugar(j, c);
        }

        // Fallbacks con guardia
        const sinP_salidaB = legales.find(c => puntosCarta(c) === 0);
        if (sinP_salidaB) return jugarConGuardia(sinP_salidaB);

        return jugarConGuardia(legalesOrdenFUERZAAsc[legalesOrdenFUERZAAsc.length - 1]);
      }


      // c) Nadie va a los dos → salida equilibrada (evitar regalar cante)
      // Evitar abrir con 12/11 sueltos si no tengo la pareja
      const candidatosSeguros = legales.filter(c => {
        if (c.num === 12 || c.num === 11) {
          const tengoPareja = mano.some(
            x =>
              x.palo === c.palo &&
              ((c.num === 12 && x.num === 11) || (c.num === 11 && x.num === 12))
          );
          return tengoPareja; // sólo abrir si hay pareja 12+11
        }
        return true;
      });

      if (candidatosSeguros.length > 0) {
        // 🔥 Regla que pediste:
        // Si tengo varias cartas de un palo NO triunfo y tengo As → SALIR con el As.
        // Sólo salir de 3 si NO tengo As y el As YA HA SALIDO.
        for (const p of PALOS) {
          if (p === paloTriunfo) continue; // no aplicar en triunfo

          const lenP = mano.filter(x => x.palo === p).length;
          const tengoAs = mano.some(x => x.palo === p && x.num === 1);
          const tengoTres = mano.some(x => x.palo === p && x.num === 3);
          if (lenP >= 2) {
            // 1) Si tengo As → salir de As
            if (tengoAs) {
              const asDelPalo = candidatosSeguros.find(x => x.palo === p && x.num === 1);
              if (asDelPalo) return jugar(j, asDelPalo);
            }
            // 2) Si NO tengo As y SÍ tengo 3 → salir de 3 SÓLO si el As YA HA SALIDO
            if (!tengoAs && tengoTres) {
              const asYaVisto = hasBeenSeenInPlay(p, 1, mesaLocal, vistas);
              if (asYaVisto) {
                const tresDelPalo = candidatosSeguros.find(x => x.palo === p && x.num === 3);
                if (tresDelPalo) return jugar(j, tresDelPalo);
              }
            }
          }
        }

        // Si no hay dominio claro: prioriza carta sin puntos de un palo largo
        const porPalo = PALOS
          .map(p => ({ p, cartas: mano.filter(c => c.palo === p) }))
          .sort((a, b) => b.cartas.length - a.cartas.length);

        for (const g of porPalo) {
          const c = candidatosSeguros.find(
            x => x.palo === g.p && puntosCarta(x) === 0
          );
          if (c) {
            // Guard: si accidentalmente es triunfo, evita achicar y abre fuerte a triunfo
            if (paloTriunfo && c.palo === paloTriunfo) {
              const trumps = mano.filter(x => x.palo === paloTriunfo);
              if (trumps.length > 0) {
                const mejorTri = trumps.sort(
                  (a, b) => FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num)
                )[0]; // 1 > 3 > 12 > 11 > 10 > 7 > 6
                return jugar(j, mejorTri);
              }
            }
            return jugar(j, c);
          }
        }

        // Último recurso: evita gastar 1/3 si no es necesario
        const noAltisima = candidatosSeguros.find(x => !(x.num === 1 || x.num === 3));
        if (noAltisima) {
          if (paloTriunfo && noAltisima.palo === paloTriunfo) {
            const trumps = mano.filter(x => x.palo === paloTriunfo);
            if (trumps.length > 0) {
              const mejorTri = trumps.sort(
                (a, b) => FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num)
              )[0];
              return jugar(j, mejorTri);
            }
          }
          return jugar(j, noAltisima);
        }

        // Muy último: lo que quede (con guardia de triunfo)
        const ultima = candidatosSeguros[candidatosSeguros.length - 1];
        if (ultima) {
          if (paloTriunfo && ultima.palo === paloTriunfo) {
            const trumps = mano.filter(x => x.palo === paloTriunfo);
            if (trumps.length > 0) {
              const mejorTri = trumps.sort(
                (a, b) => FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num)
              )[0];
              return jugar(j, mejorTri);
            }
          }
          return jugar(j, ultima);
        }
      }

      // Fallback salida global (con guard de triunfo)
      const sinP_salidaC = legales.find(c => puntosCarta(c) === 0);
      if (sinP_salidaC) {
        if (paloTriunfo && sinP_salidaC.palo === paloTriunfo) {
          const trumps = mano.filter(x => x.palo === paloTriunfo);
          if (trumps.length > 0) {
            const mejorTri = trumps.sort(
              (a, b) => FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num)
            )[0];
            return jugar(j, mejorTri);
          }
        }
        return jugar(j, sinP_salidaC);
      }

      const ult = legalesOrdenFUERZAAsc[legalesOrdenFUERZAAsc.length - 1];
      if (ult) {
        if (paloTriunfo && ult.palo === paloTriunfo) {
          const trumps = mano.filter(x => x.palo === paloTriunfo);
          if (trumps.length > 0) {
            const mejorTri = trumps.sort(
              (a, b) => FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num)
            )[0];
            return jugar(j, mejorTri);
          }
        }
        return jugar(j, ult);
      }


      // Fallback salida global con guardia
      const sinP_fallbackGlobal = legales.find(c => puntosCarta(c) === 0);
      if (sinP_fallbackGlobal) return jugarConGuardia(sinP_fallbackGlobal);

      return jugarConGuardia(legalesOrdenFUERZAAsc[legalesOrdenFUERZAAsc.length - 1]);
    }

    // ============================================
    // CASO 2: HAY CARTAS EN MESA (SIGO JUGADA)
    // ============================================
    // 2.1 Si tengo palo de salida
    if (tengoPaloSalida) {

      //
      // a) GANADOR ACTUAL ES TRIUNFO
      //
      if (ganadorActual && ganadorActual.palo === paloTriunfo) {

        // 🔥 Si YO poseo todos los triunfos restantes → NO seguir arrastrando triunfo
        const poseoTodosTriunfos = ownsAllRemainingOfSuit(
          paloTriunfo,
          mano,
          mesaLocal,
          vistas
        );

        if (poseoTodosTriunfos) {
          // Tirar carta sin puntos FUERA del triunfo si es posible
          const sinPuntosFueraTri = legales.find(
            (c) => c.palo !== paloTriunfo && PUNTOS[c.num] === 0
          );
          if (sinPuntosFueraTri) return jugar(j, sinPuntosFueraTri);

          // Si no, tirar la que menos puntos tenga fuera del triunfo
          const menosPuntosFuera = legales
            .filter((c) => c.palo !== paloTriunfo)
            .sort((a, b) => (PUNTOS[a.num] || 0) - (PUNTOS[b.num] || 0))[0];
          if (menosPuntosFuera) return jugar(j, menosPuntosFuera);

          // Último recurso
          return jugar(
            j,
            legalesOrdenFUERZAAsc[legalesOrdenFUERZAAsc.length - 1]
          );
        }

        // Si NO poseo todos los triunfos → seguir palo sin dar puntos
        const delPalo = legalesMismoPaloSalida.sort(
          (a, b) => idx(b.num) - idx(a.num)
        );
        const sinP = delPalo.find((c) => PUNTOS[c.num] === 0);
        if (sinP) return jugar(j, sinP);

        return jugar(j, delPalo[0]);
      }

      //
      // b) GANADOR ACTUAL ES DEL PALO DE SALIDA
      //
      if (ganaRival) {
        const poseoTodoPalo = ownsAllRemainingOfSuit(
          paloSalida,
          mano,
          mesaLocal,
          vistas
        );

        // Cartas del palo que pueden GANAR
        const ganadorasMismoPalo = legalesMismoPaloSalida.filter(ganaCon);

        // Si puedo ganar
        if (ganadorasMismoPalo.length > 0) {
          // 🔥 Si poseo TODO el palo → ganar con la carta de MÁS puntos
          if (poseoTodoPalo) {
            const ganaMasPuntos = ganadorasMismoPalo.sort(
              (a, b) =>
                (PUNTOS[b.num] || 0) -
                  (PUNTOS[a.num] || 0) ||
                idx(a.num) - idx(b.num)
            )[0];
            return jugar(j, ganaMasPuntos);
          }

          // Si NO poseo todo el palo → ganar con la mínima que gana (ahorro)
          const ganMin = ganadorasMismoPalo.sort(
            (a, b) => idx(b.num) - idx(a.num)
          ).pop();
          return jugar(j, ganMin!);
        }

        // No puedo ganar → bajar la que NO da puntos
        const ordenadas = legalesMismoPaloSalida.sort(
          (a, b) => idx(b.num) - idx(a.num)
        );
        const sinP = ordenadas.find((c) => PUNTOS[c.num] === 0);
        if (sinP) return jugar(j, sinP);

        return jugar(j, ordenadas[0]);
      }

      //
      // c) GANA MI COMPAÑERO (en modo "ir a los dos")
      //
      if (ganaCompi) {
        // Intentar CARGAR puntos sin arrebatar la baza
        const noGanar = legalesMismoPaloSalida.filter((c) => !ganaCon(c));

        if (noGanar.length > 0) {
          const conMasPuntos = noGanar.sort(
            (a, b) => (PUNTOS[b.num] || 0) - (PUNTOS[a.num] || 0)
          )[0];
          return jugar(j, conMasPuntos);
        }

        // Si todo gana (muy raro) → tirar la de menos puntos
        const menosPuntos = legales
          .sort(
            (a, b) => (PUNTOS[a.num] || 0) - (PUNTOS[b.num] || 0)
          )[0];
        return jugar(j, menosPuntos);
      }
    }


    // 2.2 No tengo palo de salida
    if (!tengoPaloSalida) {
      // a) Si gana rival
      if (ganaRival) {
        // Si tengo triunfo:
        if (legalesTriunfo.length > 0) {
          // Si ya hay triunfo en mesa, intentar sobretriunfar si conviene
          const hayTriMesa = mesaLocal.some(c => c.palo === paloTriunfo);
          if (hayTriMesa) {
            const sobre = legalesTriunfo.filter(ganaCon)
              .sort((a, b) => idx(b.num) - idx(a.num)) // mínima que gana
              .pop();
            if ((peligroTute || peligroCante || puntosEnMesa > 0 || esBazaDeMonte) && sobre) {
              return jugar(j, sobre);
            }
            // Si no merece la pena, descartar sin puntos (si es posible)
            const desc = legales.find(c => !isTri(c) && puntosCarta(c) === 0);
            if (desc) return jugar(j, desc);
            // o tirar triunfo pequeño que NO gane (para no regalar)
            const triQueNoGana = legalesTriunfo.find(c => !ganaCon(c));
            if (triQueNoGana) return jugar(j, triQueNoGana);
            // último recurso: el triunfo más bajo
            const triBajo = legalesTriunfo.slice().sort((a, b) => idx(b.num) - idx(a.num))[0];
            return jugar(j, triBajo);
          } else {
            // No hay triunfo en mesa: fallar solo si conviene (puntos/peligro/monte)
            const falloMinimo = legalesTriunfo.slice().sort((a, b) => idx(b.num) - idx(a.num)).pop();
            if (peligroTute || peligroCante || puntosEnMesa > 0 || esBazaDeMonte) {
              if (falloMinimo) return jugar(j, falloMinimo);
            }
            // Si no conviene: descartar sin puntos
            const desc = legales.find(c => !isTri(c) && puntosCarta(c) === 0);
            if (desc) return jugar(j, desc);
            // último recurso: triunfo bajo
            const triBajo = legalesTriunfo.slice().sort((a, b) => idx(b.num) - idx(a.num))[0];
            return jugar(j, triBajo);
          }
        } else {
          // No tengo triunfo: descartar. Si compi va ganando (no en este branch), se cargaría; aquí rival gana → evita regalar puntos
          const sinP = legales.find(c => puntosCarta(c) === 0);
          if (sinP) return jugar(j, sinP);
          // si todas dan puntos, descarta la de menor puntos
          const menosPuntos = [...legales].sort((a, b) => puntosCarta(a) - puntosCarta(b))[0];
          return jugar(j, menosPuntos);
        }
      }

      // b) Si gana compi → cargar puntos sin arrebatarle
      if (ganaCompi) {
        // Evitar triunfos que sobrepasen al compi
        const noGanar = legales.filter(c => !ganaCon(c));
        if (noGanar.length > 0) {
          const conMasPuntos = noGanar.sort((a, b) => puntosCarta(b) - puntosCarta(a))[0];
          return jugar(j, conMasPuntos);
        }
        // Si todo gana (raro), tira la que menos puntos tenga
        const menosPuntos = [...legales].sort((a, b) => puntosCarta(a) - puntosCarta(b))[0];
        return jugar(j, menosPuntos);
      }
    }

    // ============================================
    // Fallback generales (por si no ha entrado nada)
    // ============================================

    // Si puedo ganar barato y hay puntos/peligros, hazlo
    const ganMinGlobal = ganadoras.sort((a, b) => idx(b.num) - idx(a.num)).pop();
    if ((peligroTute || peligroCante || puntosEnMesa > 0 || esBazaDeMonte) && ganMinGlobal) {
      return jugar(j, ganMinGlobal);
    }

    // Si estoy en equipo y compi gana, cargar
    if (ganaCompi) {
      const perdedorConPuntosGlobal = pierden.sort((a, b) => puntosCarta(b) - puntosCarta(a))[0];
      if (perdedorConPuntosGlobal) return jugar(j, perdedorConPuntosGlobal);
    }

    // Evitar regalar puntos: tirar sin puntos si puedo
    const sinP = legales.find(c => puntosCarta(c) === 0);
    if (sinP) return jugar(j, sinP);

    // Último recurso: la peor por fuerza (evitar gastar 1/3 si no es necesario)
    const noAltisima = legales.find(c => !(c.num === 1 || c.num === 3));
    if (noAltisima) return jugar(j, noAltisima);

    // Muy último
    return jugar(j, legalesOrdenFUERZAAsc[legalesOrdenFUERZAAsc.length - 1]);
  }


  function iaDebeIrADos(mano: any[], triunfoPalo: string) {
    let score = 0;
    for (const c of mano) {
      if (c.num === 1) score += 2.4;
      else if (c.num === 3) score += 2.0;
      else if (c.num === 12) score += 0.9;
      else if (c.num === 11) score += 0.6;
      else if (c.num === 10) score += 0.4;
      else if (c.num === 7) score += 0.1;
    }
    let triunfos = 0, triunfosFuertes = 0;
    for (const c of mano) if (c.palo === triunfoPalo) {
      triunfos++;
      if (c.num === 1) { score += 1.0; triunfosFuertes++; }
      else if (c.num === 3) { score += 0.8; triunfosFuertes++; }
      else if (c.num === 12) score += 0.4;
      else if (c.num === 11) score += 0.3;
      else if (c.num === 10) score += 0.1;
    }
    if (triunfos === 2) score += 0.4;
    if (triunfos === 3) score += 0.9;
    if (triunfos === 4) score += 1.6;
    if (triunfos >= 5) score += 3.0;

    const palos: Record<string, number> = {};
    for (const c of mano) palos[c.palo] = (palos[c.palo] || 0) + 1;
    for (const p in palos) { const n = palos[p]; if (n === 4) score += 0.7; if (n === 5) score += 1.5; if (n >= 6) score += 2.5; }

    const cantes = obtenerCantes(mano, triunfoPalo);
    const tiene20 = cantes.some((c) => c.puntos === 20);
    const tiene40 = cantes.some((c) => c.puntos === 40);
    if (tiene40) score += 1.2;
    if (tiene20) score += 0.4;

    const tieneAs = mano.some((c) => c.num === 1);
    const tieneTres = mano.some((c) => c.num === 3);

    if (triunfosFuertes < 2) return false;
    if (triunfos < 3 && !(tieneAs && tieneTres)) return false;
    if (tiene40 && (triunfos < 3 && triunfosFuertes < 2)) return false;

    if (score >= 13.5) return true;
    if (score <= 11.5) return false;

    if (tiene40 && triunfosFuertes >= 2 && triunfos >= 3) return true;
    if ((palos[triunfoPalo] ?? 0) >= 5 && triunfosFuertes >= 1) return true;
    if (tieneAs && tieneTres && triunfos >= 3) return true;

    return false;
  }

  function getTeamMateIdx(irADos: number | null) {
    if (irADos === 1) return 2;
    if (irADos === 2) return 1;
    return null;
  }


  function abrirSimulador() {
    setSimOpen(true);
    setSimError("");

    // ejemplos de ayuda (deja vacío si no quieres auto-rellenar)
    if (!simJ0 && !simJ1 && !simJ2) {
      setSimJ0("oros-1, oros-3, oros-12, oros-11, oros-10, oros-7, oros-6, copas-1, copas-3");
      setSimJ1("copas-12, copas-11, copas-10, copas-7, copas-6, espadas-1, espadas-3, espadas-12, espadas-11");
      setSimJ2("espadas-10, espadas-7, espadas-6, bastos-1, bastos-3, bastos-12, bastos-11, bastos-10, bastos-7");
      setSimDealer(0); // reparte J1 por defecto en ejemplo
      setSimTriPalo("auto"); // que derive automáticamente
      setSimTriNum(7);
    }
  }

  function cancelarSimulador() {
    setSimOpen(false);
    setSimError("");
  }

  /** Arranca el REO con manos/dealer/triunfo elegidos en el modal */
  function arrancarSimulacion() {
    setSimError("");

    // 1) Parsear listas
    const p0 = parseCardsList(simJ0);
    const p1 = parseCardsList(simJ1);
    const p2 = parseCardsList(simJ2);

    if (!p0.ok) return setSimError(p0.error!);
    if (!p1.ok) return setSimError(p1.error!);
    if (!p2.ok) return setSimError(p2.error!);

    let j0 = uniqueCards(p0.cards);
    let j1 = uniqueCards(p1.cards);
    let j2 = uniqueCards(p2.cards);

    // 2) Comprobar 9 cartas por jugador
    if (j0.length !== 9) return setSimError(`J1 debe tener 9 cartas (ahora tiene ${j0.length})`);
    if (j1.length !== 9) return setSimError(`J2 debe tener 9 cartas (ahora tiene ${j1.length})`);
    if (j2.length !== 9) return setSimError(`J3 debe tener 9 cartas (ahora tiene ${j2.length})`);

    // 3) Comprobar duplicados globales y validez
    const used = [...j0, ...j1, ...j2];
    const invalid = used.filter(
      (c) => !PALOS.includes(c.palo) || !CARTAS.includes(c.num)
    );
    if (invalid.length > 0) return setSimError(`Cartas inválidas: ${invalid.map(keyC).join(", ")}`);

    const dupCheck = new Set<string>();
    const dups: string[] = [];
    for (const c of used) {
      const k = keyC(c);
      if (dupCheck.has(k)) dups.push(k);
      dupCheck.add(k);
    }
    if (dups.length > 0) return setSimError(`Cartas duplicadas: ${dups.join(", ")}`);

    // 4) Triunfo (muestra)
    let tri: any = null;
    if (simTriPalo === "auto") {
      // La muestra debe ser la ÚNICA carta restante (de 28 totales)
      const left = ALL_CARDS.filter(
        (c) => !used.some((u) => sameCard(u, c))
      );
      if (left.length !== 1) {
        return setSimError(
          `Modo AUTO de muestra requiere que quede exactamente 1 carta libre (quedan ${left.length}).`
        );
      }
      tri = left[0];
    } else {
      tri = { palo: simTriPalo, num: simTriNum };
      // Validar que no esté ya en alguna mano
      if (used.some((u) => sameCard(u, tri))) {
        return setSimError(`La muestra (${keyC(tri)}) no puede estar en una mano.`);
      }
      // Validar que pertenezca a la baraja del juego
      if (!PALOS.includes(tri.palo) || !CARTAS.includes(tri.num)) {
        return setSimError(`Muestra inválida: ${keyC(tri)}`);
      }
      // Asegurar que el total sea 28 (9+9+9+1)
      const leftover = ALL_CARDS.filter(
        (c) => !used.some((u) => sameCard(u, c)) && !sameCard(c, tri)
      );
      if (leftover.length !== 0) {
        return setSimError(
          `Con la muestra indicada deben quedar 0 cartas libres; sobran ${leftover.length}.`
        );
      }
    }

    // 5) Volcado al estado del juego
    j0 = ordenarMano(j0);
    j1 = ordenarMano(j1);
    j2 = ordenarMano(j2);

    // Reset de partida (igual que iniciar)
    setBloqueado(false);
    setMensaje("");
    setColaMensajes([]);
    setCantesCantadosIA([[], [], []]);
    setCantesCantadosHumano([]);
    if (mensajeTimerRef.current) {
      clearTimeout(mensajeTimerRef.current);
      mensajeTimerRef.current = null;
    }

    setBazaN(0);
    setManos([j0, j1, j2]);
    setTriunfo(tri);
    setMesa([]);
    setPuntos([0, 0, 0]);
    setPerdedores([]);
    setIrADos(null); // de inicio (lo recalculamos debajo si quieres)
    setVistas([]);
    setFallos([
      { oros: false, copas: false, espadas: false, bastos: false },
      { oros: false, copas: false, espadas: false, bastos: false },
      { oros: false, copas: false, espadas: false, bastos: false },
    ]);
    setEstadoCantar("no_disponible");
    setCantesDisponibles([]);
    setYaCantoEsteTurno(false);
    setBazasPorJugador([[], [], []]);
    setIaYaCambioMuestra([false, false, false]);

    // Dealer elegido
    try {
      // Si tienes estado 'dealer', fíjalo aquí
      // @ts-ignore - si no existe dealer en tu estado, ignora esta línea
      setDealer?.(simDealer);
    } catch {}

    // Turno: siempre el siguiente al dealer
    const salidor = (simDealer + 1) % 3;
    setTurno(salidor);
    setSalidorInicial(salidor);

    // Decidir overlay: si alguna IA iría a los dos con estas manos, lo fijamos; si no, pedimos tu decisión
    let candidatoIrADos: number | null = null;
    if (iaDebeIrADos(j1, tri.palo)) candidatoIrADos = 1;
    else if (iaDebeIrADos(j2, tri.palo)) candidatoIrADos = 2;

    if (candidatoIrADos !== null) {
      setIrADos(candidatoIrADos);
      setEsperandoDecisionInicial(false);
    } else {
      setEsperandoDecisionInicial(true);
    }

    // Reset de TUTE igual que iniciar()
    setTuteDisponible(false);
    setTutePerdido(false);
    setTuteDisponibleIA([false,false,false]);
    setTutePerdidoIA([false,false,false]);

    // Cerrar modal
    setSimOpen(false);
    pushMensaje("🧪 REO simulado cargado. ¡Listo para empezar!", 3000);
  }


  function uniqueCantesPorPalo(arr: { palo: string; puntos: number }[]) {
    const seen = new Set<string>();
    const out: { palo: string; puntos: number }[] = [];
    for (const c of arr) {
      if (!seen.has(c.palo)) {
        seen.add(c.palo);
        out.push(c);
      }
    }
    return out;
  }

  
  function resolver(cartas: any[]) {

    // Guardar cartas vistas
    setVistas((prev) => [...prev, ...cartas]);

    // Determinar ganador de la baza
    const paloSalida = cartas[0].palo;
    let win = cartas[0];
    cartas.slice(1).forEach((c) => {
      win = gana(win, c, triunfo?.palo, paloSalida);
    });
    const winnerIdx = win.j as number;

    // Registrar la baza ganada
    setBazasPorJugador((prev) => {
      const copia = prev.map((arr) => [...arr]);
      const clonBaza = cartas.map((c) => ({ ...c }));
      copia[winnerIdx] = [...copia[winnerIdx], clonBaza];
      return copia;
    });

    // Sumar puntos de la baza
    const pts = cartas.reduce((s, c) => s + PUNTOS[c.num], 0);
    const np = [...puntos];
    np[winnerIdx] += pts;

    const nextBaza = bazaN + 1;
    const esUltimaBaza = nextBaza === 9;

    //===============================
    // 🔥 SNAPSHOT: manosDespues
    //===============================
    const manosDespues = manos.map(arr => [...arr]);

    for (const c of cartas) {
      const jIdx = c.j;
      const idx = manosDespues[jIdx].findIndex(
        x => x.palo === c.palo && x.num === c.num
      );
      if (idx >= 0) manosDespues[jIdx].splice(idx, 1);
    }

    // ===============================
    // MONTE en última baza
    // ===============================
    if (esUltimaBaza) {
      if (irADos !== null && winnerIdx !== irADos) {
        np[(irADos + 1) % 3] += 5;
        np[(irADos + 2) % 3] += 5;
        pushMensaje("10 de monte repartidas (+5/+5)", 5000);
      } else {
        np[winnerIdx] += 10;
        const nombre = winnerIdx === 0 ? "Tú" : `Jugador ${winnerIdx + 1}`;
        pushMensaje(`10 de monte para ${nombre}`, 5000);
      }
    }

    // ===============================
    // FIN DE REO (si última baza)
    // ===============================
    if (esUltimaBaza) {
      let idxPerdedores: number[] = [];

      if (irADos === null) {
        // Normal
        const minScore = Math.min(...np);
        const empatadosMin = [0, 1, 2].filter(i => np[i] === minScore);

        if (empatadosMin.length === 1) {
          idxPerdedores = empatadosMin;
        } else {
          if (empatadosMin.includes(winnerIdx)) {
            idxPerdedores = empatadosMin.filter(i => i !== winnerIdx);
          } else {
            const dist = (i: number) => (i - salidorInicial + 3) % 3;
            const ganadorDesempate = [...empatadosMin].sort(
              (a, b) => dist(a) - dist(b)
            )[0];
            idxPerdedores = empatadosMin.filter(i => i !== ganadorDesempate);
          }
        }
      } else {
        // 1 vs 2
        const solo = irADos;
        const team = [0, 1, 2].filter(i => i !== solo);
        const sumTeam = np[team[0]] + np[team[1]];
        const soloPts = np[solo];

        if (soloPts > sumTeam) {
          idxPerdedores = team;
        } else if (soloPts < sumTeam) {
          idxPerdedores = [solo];
        } else {
          if (winnerIdx === solo) {
            idxPerdedores = team;
          } else {
            idxPerdedores = [solo];
          }
        }
      }

      setPerdedores(idxPerdedores);

      // 🔥 Aplicar piedras por final de REO
      if (irADos === null) {
        if (idxPerdedores.length > 0) {
          aplicarPiedras(idxPerdedores.map(j => ({ j, delta: -1 })));
        }
      } else {
        const solo = irADos;
        const team = [0, 1, 2].filter(i => i !== solo);

        const perdioSolo = idxPerdedores.length === 1 && idxPerdedores[0] === solo;
        const perdioEquipo =
          idxPerdedores.length === 2 &&
          idxPerdedores.includes(team[0]) &&
          idxPerdedores.includes(team[1]);

        if (perdioSolo) {
          aplicarPiedras([{ j: solo, delta: -2 }]);
        } else if (perdioEquipo) {
          aplicarPiedras([
            { j: team[0], delta: -1 },
            { j: team[1], delta: -1 },
            { j: solo, delta: +2 },
          ]);
        }
      }

      // Mensaje
      if (idxPerdedores.length > 0) {
        const etiqueta = idxPerdedores
          .map(i => (i === 0 ? "Tú" : `Jugador ${i + 1}`))
          .join(" y ");
        pushMensaje(`🏁 Fin de REO. Pierde: ${etiqueta}`, 5000);
      } else {
        pushMensaje(`🏁 Fin de REO. Empate`, 5000);
      }

      // Rotación del dealer
      setDealer(prev => (prev + 1) % 3);
      setMostrarResumenReo(true);
    }

    // ========================================
    // 🔥 CANTE DE TUTE (HUMANO e IA)
    // ========================================

    // HUMANO
    if (winnerIdx === 0) {
      if (!tutePerdido) {
        const manoGanador = manosDespues[0];
        if (tieneTute(manoGanador)) {
          setTuteDisponible(true);
        } else {
          setTuteDisponible(false);
        }
      }
    }

    // IA
    if (winnerIdx !== 0) {
      if (!tutePerdidoIA[winnerIdx]) {
        const manoGanador = manosDespues[winnerIdx];
        const t = [...tuteDisponibleIA];
        t[winnerIdx] = tieneTute(manoGanador);
        setTuteDisponibleIA(t);
      }
    }


    // ========================================
    // 🔥 CANTES NORMALES
    // ========================================
    if (winnerIdx === 0) {
      if (estadoCantar !== "perdido") {
        const recalculados = obtenerCantes(manosDespues[0], triunfo?.palo);
        const filtrados = recalculados.filter(
          c => !cantesCantadosHumano.includes(c.palo)
        );
        const unicos = uniqueCantesPorPalo(filtrados);

        if (unicos.length > 0) {
          setCantesDisponibles(unicos);
          setEstadoCantar("pendiente");
          setYaCantoEsteTurno(false);
        } else {
          setCantesDisponibles([]);
          setEstadoCantar("hecho");
        }
      }
    } else {
      const posiblesIA = obtenerCantes(manosDespues[winnerIdx], triunfo?.palo);
      const yaCantados = cantesCantadosIA[winnerIdx] || [];
      const pendientes = posiblesIA.filter(c => !yaCantados.includes(c.palo));
      if (pendientes.length > 0) {
        const mejor = [...pendientes].sort((a, b) => b.puntos - a.puntos)[0];
        const nuevoEstado = [...estadoCantarIA];
        nuevoEstado[winnerIdx] = "pendiente";
        setEstadoCantarIA(nuevoEstado);
        setCantesDisponiblesIAReales(prev => {
          const prox = [...prev];
          prox[winnerIdx] = [mejor];
          return prox;
        });
      }
    }

    // ========================
    // Volcar estado final
    // ========================
    setPuntos(np);
    setMesa([]);
    setTurno(winnerIdx);
    setBazaN(nextBaza);
    setTimeout(() => setBloqueado(false), 200);
  }


  // Aplica varios cambios de piedras en un único setState.
  // Ej.: aplicarPiedras([{j:1, delta:-1}, {j:2, delta:-1}])
  function aplicarPiedras(cambios: { j: number; delta: number }[]) {
    setPiedras(prev => {
      const copy = [...prev];
      for (const { j, delta } of cambios) {
        const valPrev = copy[j] ?? 0;
        copy[j] = Math.max(0, valPrev + delta);  // no baja de 0
      }
      return copy;
    });
  }

  // Revisa si alguien alcanzó 0 y cierra la serie
  useEffect(() => {
    if (serieCerrada) return;
    const idxEnCero = [0,1,2].filter(i => piedras[i] === 0);
    if (idxEnCero.length > 0) {
      setSerieCerrada(true);
      const etiqueta = idxEnCero.map(i => (i === 0 ? "Tú" : `Jugador ${i+1}`)).join(" y ");
      pushMensaje(`🏁 Serie terminada: ${etiqueta} sin piedras.`, 6000);
    }
  }, [piedras, serieCerrada]);

  // Reinicia SOLO la serie de piedras a 5,5,5 (no toca la partida en curso)
  function nuevaSerieDePiedras() {
    setPiedras([5, 5, 5]);
    setSerieCerrada(false);
  }

  // Llama a esto cuando alguien cante Tute (jDeclara = 0|1|2)
  function aplicarPiedrasPorTute(jDeclara: number) {
    if (irADos === null) {
      // Sin ir a los dos → los otros dos pierden 1
      const rivales = [0,1,2].filter(i => i !== jDeclara);
      aplicarPiedras(rivales.map(j => ({ j, delta: -1 })));
      pushMensaje(`🃏 Tute de ${jDeclara===0 ? "Tú" : "Jugador "+(jDeclara+1)}: rivales −1 piedra`, 5000);
    } else {
      const solo = irADos;
      const team = [0,1,2].filter(i => i !== solo);

      if (jDeclara === solo) {
        // Tute del solo → equipo −1 cada uno
        aplicarPiedras(team.map(j => ({ j, delta: -1 })));
        pushMensaje(`🃏 Tute del que va solo: equipo −1 piedra cada uno`, 5000);
      } else {
        // Tute contra el solo → solo −2
        aplicarPiedras([{ j: solo, delta: -2 }]);
        pushMensaje(`🃏 Tute contra el que va solo: el solo −2 piedras`, 5000);
      }
    }
  }


  function resolverDecisionInicial(humanoQuiereIrADos: boolean) {
    // ⛔ si esta función reentrara por algún efecto, evita múltiple registro
    if (yaRegistroIrADosRef.current) return;

    let candidato: number | null = null;

    // 1) Humano
    if (humanoQuiereIrADos) candidato = 0;

    // 2) IA J2
    if (candidato === null && iaDebeIrADos(manos[1] as any[], triunfo?.palo)) {
      candidato = 1;
      pushMensaje("Jugador 2 declara IR A LOS DOS");
    }

    // 3) IA J3
    if (candidato === null && iaDebeIrADos(manos[2] as any[], triunfo?.palo)) {
      candidato = 2;
      pushMensaje("Jugador 3 declara IR A LOS DOS");
    }

    // 4) Registrar AHORA (cuando ya sabemos quién es)
    if (candidato !== null) {
      logReo({
        tipo: "irADos",
        jugador: candidato,
        turno: -1,
      });
      setIrADos(candidato);
    }

    // 5) Cambios de 7 iniciales de IA (evita duplicar si ya se hizo en iniciar)
    [1, 2].forEach((j) => {
      if (!iaYaCambioMuestra[j]) {
        cambiarTriunfoIA(j);
      }
    });

    yaRegistroIrADosRef.current = true;

    setEsperandoDecisionInicial(false);
    setBloqueado(false);
  }


  function cantar(cante: any) {
    logReo({
      tipo: "cante",
      jugador: 0,
      palo: cante.palo,
      puntos: cante.puntos,
      turno: bazaN,
    });

    const np = [...puntos]; np[0] += cante.puntos; setPuntos(np);
    pushMensaje(`🎺 Cante de ${cante.palo} (+${cante.puntos})`, 5000);
    setCantesCantadosHumano(prev => [...prev, cante.palo]);
    const restantes = cantesDisponibles.filter((c) => c.palo !== cante.palo);
    setCantesDisponibles(restantes);
    setYaCantoEsteTurno(true);
    setEstadoCantar("hecho");

    // 🔥 Si canto 40 y tenía TUTE sin cantar → se pierde TUTE
    if (cante.puntos === 40 && tuteDisponible) {
      setTuteDisponible(false);
      setTutePerdido(true);
    }

    // 🔥 Si canto 20 y tenía 40 o TUTE sin cantar → se pierden
    if (cante.puntos === 20) {
      // Pierde TUTE
      if (tuteDisponible) {
        setTuteDisponible(false);
        setTutePerdido(true);
      }
      // Pierde 40 (si existiera futuro 40 que no haya cantado)
      // Ya lo haces filtrando cantesDisponibles
    }

  }


  // Termina el REO inmediatamente por TUTE
  function terminarReoPorTute() {
    setMesa([]);
    setManos([[], [], []]);
    setBloqueado(true);
    setEsperandoDecisionInicial(false);
    pushMensaje("Fin del REO por TUTE", 5000);
  }


  // Aplica penalizaciones de piedras según jDeclara (el que canta)
  // y fija perdedores en el panel si el REO se cierra por TUTE.
  function aplicarPenalizacionPorTute(jDeclara: number) {
    if (irADos === null) {
      // Caso normal: los otros dos pierden 1 piedra y EL REO TERMINA
      const otros = [0, 1, 2].filter(i => i !== jDeclara);

      // 🔴 Marcar perdedores en el panel (los otros dos)
      setPerdedores(otros);

      aplicarPiedras(otros.map(j => ({ j, delta: -1 })));
      pushMensaje(`🎴 TUTE de J${jDeclara + 1}: rivales pierden 1 piedra`, 6000);

      terminarReoPorTute();
      return;
    }

    // Caso ir a los dos
    const solo = irADos;
    const equipo = [0, 1, 2].filter(i => i !== solo);

    if (jDeclara === solo) {
      // El SOLO canta TUTE → equipo −1 cada uno y el REO CONTINÚA
      aplicarPiedras(equipo.map(j => ({ j, delta: -1 })));
      pushMensaje(`🎴 TUTE del que va solo: rivales pierden 1 piedra (continúa el REO)`, 6000);

      // 🧼 El REO sigue: limpiamos cualquier marca previa de perdedores
      setPerdedores([]);

      return;
    } else {
      // El EQUIPO canta TUTE contra el SOLO → solo −2 piedras y EL REO TERMINA

      // 🔴 Marcar perdedor: el solo
      setPerdedores([solo]);

      aplicarPiedras([{ j: solo, delta: -2 }]);
      pushMensaje(`🎴 TUTE contra el que va solo: J${solo + 1} pierde 2 piedras`, 6000);

      terminarReoPorTute();
      return;
    }
  }

  function cantarTute() {
    logReo({
      tipo: "tute",
      jugador: 0,
      turno: bazaN,
    });

    const jDeclara = 0;

    // Marcar que ya he cantado este turno
    setYaCantoEsteTurno(true);
    setEstadoCantar("hecho");

    // Bloquear futuros TUTE
    setTuteDisponible(false);
    setTutePerdido(true);

    // Aplicar reglas completas de tute
    aplicarPenalizacionPorTute(jDeclara);
  }

  // En el render de la cabecera:
  const hayJugadorSinPiedras = piedras.some((v: number) => v <= 0);
  // ============ RENDER ============
  return (
    <>
      {esperandoDecisionInicial &&
        ReactDOM.createPortal(
          <OverlayDecision
            onYes={() => resolverDecisionInicial(true)}
            onNo={() => resolverDecisionInicial(false)}
          />,
          document.body
        )}

      {/* ESTILOS GLOBALES */}
      <style>{`
        html, body, #root { height: 100%; margin: 0; }
        body {
          background:
            radial-gradient(1400px 900px at 20% 10%, #2e7d32 0%, #1b5e20 60%, #0f3f14 100%);
        }
        :root {
          --card-w: clamp(76px, 4vw, 132px);
          --card-h: calc(var(--card-w) * 1);
          //--gutter: clamp(8px, 1vw, 20px);
          --page-max: 1800px;
          --sidebar-w: 320px;

          --npc-card-w: 64px;
        }

        /* 2 columnas: tablero (izq) + puntos (der) */
        .page {
          min-height: 100svh;
          display: grid;
          grid-template-columns: minmax(0, 1fr) var(--sidebar-w);
          gap: var(--gutter);
          padding: var(--gutter);
          box-sizing: border-box;
          max-width: var(--page-max);
          margin: 0 auto;
          color: #fff;
        }

        .board { display: flex; flex-direction: column; gap: var(--gutter); }
        .headerBar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

        .opponentsRow {
          display: flex; gap: var(--gutter);
          justify-content: space-between; align-items: flex-start; flex-wrap: wrap;
        }
        .opponent { flex: 1 1 0; min-width: 360px; text-align: center; }

        .fila-cartas {
          display: flex; gap: 6px; align-items: center; justify-content: center;
          min-height: var(--card-h); flex-wrap: wrap;
        }

        .mesaBox { margin: 0 auto; width: calc(var(--card-w) * 5.2); height: calc(var(--card-h) * 3.1);
          border-radius: 12px; background: rgba(0,0,0,0.2); box-shadow: 0 10px 30px rgba(0,0,0,.25) inset; overflow: hidden; }

        .sidebar {
          background: rgba(0,0,0,0.15);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 12px;
          padding: 12px; box-sizing: border-box; min-height: 100%;
        }

        /* Caja de puntos por jugador (aplicaremos esta clase al contenedor) */
        .pill {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(0,0,0,0.12);
          margin-bottom: 8px;
        }

        /* Perdedor → resaltar en rojo */
        .pill.loser {
          border-color: #ff6b6b;
          background: rgba(255, 60, 60, 0.18);
          box-shadow: 0 0 0 2px rgba(255, 60, 60, 0.25) inset;
        }


        /* === Dealer (repartidor) === */
        .dealerBadge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          background: linear-gradient(180deg, #ffd54f, #ffb300);
          color: #3b2b00;
          border: 1px solid rgba(255,255,255,0.35);
          box-shadow: 0 0 0 2px rgba(255,179,0,0.25), 0 2px 6px rgba(0,0,0,0.25);
          white-space: nowrap;
        }
        .dealerIcon { font-size: 14px; line-height: 1; }



        /* === Sección Piedras (sidebar) === */
        .sectionTitle {
          margin: 16px 0 8px;
        }

        /* “Píldora” básica reutilizable (igual que .pill, por si aún no existía aquí) */
        .pill {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(0,0,0,0.12);
          margin-bottom: 8px;
        }

        /* Perdedor de la mano (panel de puntos) – ya la tienes, la dejamos como está */
        .pill.loser {
          border-color: #ff6b6b;
          background: rgba(255, 60, 60, 0.18);
          box-shadow: 0 0 0 2px rgba(255, 60, 60, 0.25) inset;
        }

        /* 🔴 Jugador SIN piedras (sección Piedras): doble borde rojo llamativo
           Usamos 2 “anillos” con box-shadow para simular doble borde sin romper layout. */
        .stonePill {
          padding: 8px 10px;
          border-radius: 12px;
          border: 2px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.12);
          margin-bottom: 8px;
        }

        /* Estado “out” (piedras <= 0): doble contorno rojo y brillo leve */
        .stonePill.out {
          border-color: #ff4d4d;                                 /* borde interno rojo */
          box-shadow:
            0 0 0 3px rgba(255, 77, 77, 0.55),                   /* anillo rojo externo */
            0 0 0 6px rgba(255, 77, 77, 0.20);                   /* segundo anillo (doble) */
        }

        /* Texto de valor de piedras un poco destacado */
        .stoneValue {
          font-weight: 600;
          opacity: .95;
        }


        /* Doble borde rojo para jugadores con 0 o menos piedras */
        .pill.stoneOut {
          border-color: #ff4d4d; /* borde del recuadro */
          box-shadow:
            0 0 0 3px rgba(255, 77, 77, 0.55),  /* primer anillo (externo) */
            0 0 0 6px rgba(255, 77, 77, 0.20);  /* segundo anillo (doble borde) */
        }


        /* Responsive: sidebar abajo */
        @media (max-width: 1000px) {
          .page { grid-template-columns: 1fr; }
          .sidebar { order: 2; }
        }

        @keyframes from-bottom { from { transform: translateY(30px) scale(0.96); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes from-left   { from { transform: translateX(-40px) scale(0.96); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
        @keyframes from-right  { from { transform: translateX(40px) scale(0.96); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
        @keyframes pop-in      { from { transform: scale(0.92); opacity: .6; } to { transform: scale(1); opacity: 1; } }
      `}</style>



      <div className="page">
        {/* IZQUIERDA: TABLERO */}
        <div className="board">
          {/* Cabecera */}
          <div className="headerBar">
            <h2 style={{ margin: 0 }}>Tute Valenciano (3 jugadores)</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 10px", background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, cursor: "pointer"
              }}>
                <input
                  type="checkbox"
                  checked={modoDestapado}
                  onChange={(e) => setModoDestapado(e.target.checked)}
                  style={{ transform: "scale(1.1)", cursor: "pointer" }}
                />
                <span>Modo destapado</span>
              </label>
              <button
                onClick={() => nuevaPartida(5)}  // ← si quieres otro número, cámbialo aquí
                title="Reinicia piedras y comienza una nueva partida"
                style={{ padding: "8px 14px", borderRadius: 8 }}
              >
                Nueva Partida
              </button>

              {/* Reiniciar: deshabilitado si alguien no tiene piedras */}
              <button
                onClick={() => iniciar()}
                disabled={hayJugadorSinPiedras || autoRestartSeconds !== null}
                title={
                  hayJugadorSinPiedras
                    ? "Hay un jugador sin piedras"
                    : autoRestartSeconds !== null
                    ? `Reinicio automático en ${autoRestartSeconds}s…`
                    : "Reiniciar mano"
                }
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  opacity: hayJugadorSinPiedras || autoRestartSeconds !== null ? 0.5 : 1,
                  cursor: hayJugadorSinPiedras || autoRestartSeconds !== null ? "not-allowed" : "pointer",
                }}
              >
                Reiniciar REO
              </button>
              <button
                onClick={abrirSimulador}
                title="Configura un REO de test: manos, dealer y muestra"
                style={{ padding: "8px 14px", borderRadius: 8 }}
              >
                Simular REO
              </button>
            </div>
          </div>

          <p style={{ fontWeight: "bold", marginBottom: 0 }}>
            {turno === 0 ? "🟢 Tu turno" : `⏳ Turno del jugador ${turno + 1}`}
          </p>

          <PanelTriunfo triunfo={triunfo} />

          {/* Fila J2 + J3 */}
          <div className="opponentsRow">
            {[1, 2].map((j) => (
              <div key={j} className="opponent">
                <p
                  style={{
                    margin: "4px 0 6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8
                  }}
                >
                  Jugador {j + 1}{irADos === j && " (Va solo)"}
                  {dealer === j && (
                    <span className="dealerBadge" title="Reparte este REO">
                      <span className="dealerIcon">🎴</span> Reparte
                    </span>
                  )}
                </p>
                <div className="fila-cartas">
                  {modoDestapado
                    ? (manos[j] as any[]).map((c, i) => (
                        <Carta key={i} carta={c} legal={false} style={{ width: "var(--npc-card-w)" }} />
                      ))
                    : Array.from({ length: 9 }).map((_, i) => (
                        <Carta
                          key={i}
                          tapada
                          style={{
                            width: "var(--npc-card-w)",
                            visibility: i < (manos[j] as any[]).length ? "visible" : "hidden",
                          }}
                        />
                      ))}
                </div>
              </div>
            ))}
          </div>

          {/* Mesa centrada */}
          <div className="mesaBox">
            <MesaVisual mesa={mesa} />
          </div>

          {/* Tu mano */}
          <div>
            <h3 style={{ margin: "10px 0 6px", display: "flex", alignItems: "center", gap: 8 }}>
              Tu mano{irADos === 0 && " (Vas solo)"}
              {dealer === 0 && (
                <span className="dealerBadge" title="Repartes este REO">
                  <span className="dealerIcon">🎴</span> Reparte
                </span>
              )}
            </h3>
            <div className="fila-cartas">
              {(manos[0] as any[]).map((c, i) => {
                const legal = puedeJugar(c, manos[0], mesa, triunfo?.palo);
                return <Carta key={i} carta={c} legal={legal} onClick={() => legal && jugar(0, c)} />;
              })}
            </div>
          </div>

          {/* Acciones */}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            {/* CANTAR TUTE (solo si toca) */}
            {turno === 0 && tuteDisponible && !tutePerdido && !yaCantoEsteTurno && (
              <button onClick={cantarTute}>Cantar TUTE</button>
            )}
            {(() => {
              if (turno !== 0 || estadoCantar !== "pendiente" || yaCantoEsteTurno || cantesDisponibles.length === 0) return null;
              if (cantesDisponibles.length === 1) {
                const c = cantesDisponibles[0];
                return <button onClick={() => cantar(c)}>Cantar {c.palo} ({c.puntos})</button>;
              }
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  {cantesDisponibles.map((c, i) => (
                    <button key={i} onClick={() => cantar(c)}>Cantar {c.palo} ({c.puntos})</button>
                  ))}
                </div>
              );
            })()}
            {(() => {
              const puedeCambiar7 =
                turno === 0 && triunfo &&
                (manos[0] as any[]).length === 9 &&
                triunfo.num !== 7 &&
                (manos[0] as any[]).some((c) => c.palo === triunfo.palo && c.num === 7);
              return (
                <button
                  onClick={cambiarTriunfo}
                  disabled={!puedeCambiar7}
                  title={puedeCambiar7 ? `Cambiar 7 de ${triunfo?.palo}` : "Solo antes de tu primera carta"}
                  style={{ opacity: puedeCambiar7 ? 1 : 0.5, cursor: puedeCambiar7 ? "pointer" : "not-allowed" }}
                >
                  Cambiar 7 {triunfo ? `(${triunfo.palo})` : ""}
                </button>
              );
            })()}
          </div>

          {/* Bazas propias */}
          <div>
            <h3>Mis bazas ganadas</h3>
            <div style={{
              position: "relative", display: "flex", alignItems: "center", gap: 8,
              height: 64, overflowX: "auto", overflowY: "hidden",
              padding: "8px 10px", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, background: "rgba(0,0,0,0.2)", marginBottom: 20, whiteSpace: "nowrap",
            }}>
              {bazasPorJugador[0].length === 0 ? (
                <span style={{ opacity: 0.7 }}>Aún no has ganado ninguna baza</span>
              ) : (
                bazasPorJugador[0].map((baza, i) => {
                  const puntosBaza = baza.reduce((s: number, c: any) => s + (PUNTOS[c.num] || 0), 0);
                  return (
                    <div key={i} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                      title={`Baza ${i + 1} • ${puntosBaza} puntos`}>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 10px", borderRadius: 999,
                        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)"
                      }}>
                        <span style={{ fontSize: 12, opacity: 0.9, marginRight: 2 }}>Baza {i + 1}</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {baza.map((c: any, j: number) => (
                            <Carta key={j} carta={c} mini style={{ width: 32, margin: 2 }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bazas compañero */}
          {(() => {
            const teammate = getTeamMateIdx(irADos);
            if (teammate === null) return null;
            return (
              <div>
                <h3>Bazas de tu compañero ({teammate === 1 ? "Jugador 2" : "Jugador 3"})</h3>
                <div style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 8,
                  height: 64, overflowX: "auto", overflowY: "hidden",
                  padding: "8px 10px", border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8, background: "rgba(0,0,0,0.2)", marginBottom: 20, whiteSpace: "nowrap",
                }}>
                  {bazasPorJugador[teammate].length === 0 ? (
                    <span style={{ opacity: 0.7 }}>Tu compañero aún no ha ganado bazas</span>
                  ) : (
                    bazasPorJugador[teammate].map((baza, i) => {
                      const puntosBaza = baza.reduce((s: number, c: any) => s + (PUNTOS[c.num] || 0), 0);
                      return (
                        <div key={i} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                          title={`Baza ${i + 1} • ${puntosBaza} puntos`}>
                          <div style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 10px", borderRadius: 999,
                            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)"
                          }}>
                            <span style={{ fontSize: 12, opacity: 0.9, marginRight: 2 }}>Baza {i + 1}</span>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {baza.map((c: any, j: number) => (
                                <Carta key={j} carta={c} mini style={{ width: 32, margin: 2 }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        
        {/* DERECHA: PUNTOS */}
        <aside className="sidebar">
          <h3 style={{ marginTop: 0 }}>Puntos</h3>

          {/* Píldoras por jugador */}
          <div className={`pill ${perdedores.includes(0) ? "loser" : ""}`}>
            <strong>J1:</strong> {puntos[0]}
          </div>
          <div className={`pill ${perdedores.includes(1) ? "loser" : ""}`}>
            <strong>J2:</strong> {puntos[1]}
          </div>
          <div className={`pill ${perdedores.includes(2) ? "loser" : ""}`}>
            <strong>J3:</strong> {puntos[2]}
          </div>

          {mensaje && (
            <p
              style={{
                background: "rgba(255,255,0,0.25)",
                padding: "6px 12px",
                borderRadius: 6,
                color: "white",
                fontWeight: "bold",
                marginTop: 8
              }}
            >
              {mensaje}
            </p>
          )}


          {/* --- SECCIÓN PIEDRAS --- */}       
          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Piedras</h4>

          <div
            className={`pill ${piedras[0] <= 0 ? "stoneOut" : ""}`}
            style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}
          >
            <span>
              <strong>J1:</strong> {piedras[0]} {piedras[0] > 0 ? "●".repeat(Math.min(piedras[0], 12)) : "—"}
            </span>
            {modoDestapado && (
              <span style={{ display: "inline-flex", gap: 6 }}>
                <button onClick={() => aplicarPiedras([{ j: 0, delta: -1 }])}>-</button>
                <button onClick={() => aplicarPiedras([{ j: 0, delta: +1 }])}>+</button>
              </span>
            )}
          </div>

          <div
            className={`pill ${piedras[1] <= 0 ? "stoneOut" : ""}`}
            style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}
          >
            <span>
              <strong>J2:</strong> {piedras[1]} {piedras[1] > 0 ? "●".repeat(Math.min(piedras[1], 12)) : "—"}
            </span>
            {modoDestapado && (
              <span style={{ display: "inline-flex", gap: 6 }}>
                <button onClick={() => aplicarPiedras([{ j: 1, delta: -1 }])}>-</button>
                <button onClick={() => aplicarPiedras([{ j: 1, delta: +1 }])}>+</button>
              </span>
            )}
          </div>

          <div
            className={`pill ${piedras[2] <= 0 ? "stoneOut" : ""}`}
            style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}
          >
            <span>
              <strong>J3:</strong> {piedras[2]} {piedras[2] > 0 ? "●".repeat(Math.min(piedras[2], 12)) : "—"}
            </span>
            {modoDestapado && (
              <span style={{ display: "inline-flex", gap: 6 }}>
                <button onClick={() => aplicarPiedras([{ j: 2, delta: -1 }])}>-</button>
                <button onClick={() => aplicarPiedras([{ j: 2, delta: +1 }])}>+</button>
              </span>
            )}
          </div>
        </aside>
      </div>

      {simOpen && ReactDOM.createPortal(
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100000
        }}>
          <div style={{
            width: "min(960px, 95vw)", maxHeight: "90vh", overflow: "auto",
            background: "#1f4024", color: "#fff",
            borderRadius: 12, border: "1px solid rgba(255,255,255,.25)",
            boxShadow: "0 15px 60px rgba(0,0,0,.6)", padding: 16
          }}>
            <h2 style={{ marginTop: 0 }}>Simular REO</h2>

            <p style={{ opacity: .9, marginTop: 4 }}>
              Introduce <strong>9 cartas por jugador</strong> usando formato:
              <code> oros-1, o-3, espadas-10, b-7 </code>.
              Palos admitidos: <code>oros|copas|espadas|bastos</code> o <code>o|c|e|b</code>. Números: {CARTAS.join(", ")}.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              <div>
                <label><strong>J1 (Tú)</strong></label>
                <textarea
                  value={simJ0} onChange={e => setSimJ0(e.target.value)}
                  rows={3} style={{ width: "100%", borderRadius: 8, padding: 8 }}
                  placeholder="oros-1, oros-3, ..."
                />
              </div>
              <div>
                <label><strong>J2</strong></label>
                <textarea
                  value={simJ1} onChange={e => setSimJ1(e.target.value)}
                  rows={3} style={{ width: "100%", borderRadius: 8, padding: 8 }}
                  placeholder="copas-12, e-1, ..."
                />
              </div>
              <div>
                <label><strong>J3</strong></label>
                <textarea
                  value={simJ2} onChange={e => setSimJ2(e.target.value)}
                  rows={3} style={{ width: "100%", borderRadius: 8, padding: 8 }}
                  placeholder="bastos-1, b-3, ..."
                />
              </div>

              <div>
                <label><strong>Dealer</strong></label>
                <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                  {[0,1,2].map(j => (
                    <label key={j} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="radio"
                        name="simDealer"
                        checked={simDealer === j}
                        onChange={() => setSimDealer(j)}
                      />
                      {j === 0 ? "J1 (Tú)" : `J${j+1}`}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label><strong>Muestra (Triunfo)</strong></label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="radio"
                      name="simTriModo"
                      checked={simTriPalo === "auto"}
                      onChange={() => setSimTriPalo("auto")}
                    />
                    Auto (carta restante)
                  </label>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="radio"
                      name="simTriModo"
                      checked={simTriPalo !== "auto"}
                      onChange={() => setSimTriPalo("oros")}
                    />
                    Manual:
                    <select
                      value={simTriPalo === "auto" ? "oros" : simTriPalo}
                      onChange={e => setSimTriPalo(e.target.value)}
                    >
                      {PALOS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select
                      value={simTriNum}
                      onChange={e => setSimTriNum(parseInt(e.target.value, 10))}
                    >
                      {CARTAS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            {simError && (
              <p style={{
                background: "rgba(255,0,0,.2)", border: "1px solid rgba(255,0,0,.4)",
                padding: "8px 10px", borderRadius: 8, marginTop: 12
              }}>
                ⚠️ {simError}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={cancelarSimulador} style={{ padding: "8px 14px", borderRadius: 8 }}>
                Cancelar
              </button>
              <button onClick={arrancarSimulacion} style={{ padding: "8px 14px", borderRadius: 8 }}>
                Comenzar REO simulado
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


      {mostrarResumenReo && ReactDOM.createPortal(
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 99999
        }}>
          <div style={{
            width: "min(900px, 90vw)",
            maxHeight: "90vh",
            overflowY: "auto",
            background: "#13381f",
            padding: 20,
            borderRadius: 12,
            color: "white",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "0 10px 60px rgba(0,0,0,0.65)"
          }}>
            <h2 style={{ marginTop: 0 }}>Resumen del REO</h2>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: "1px solid #fff", padding: 6 }}>Turno</th>
                  <th style={{ borderBottom: "1px solid #fff", padding: 6 }}>Acciones</th>
                  <th style={{ borderBottom: "1px solid #fff", padding: 6 }}>J1</th>
                  <th style={{ borderBottom: "1px solid #fff", padding: 6 }}>J2</th>
                  <th style={{ borderBottom: "1px solid #fff", padding: 6 }}>J3</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Agrupar por turno
                  const turnos: Record<number, any[]> = {};
                  for (const e of reoLog) {
                    if (!turnos[e.turno]) turnos[e.turno] = [];
                    turnos[e.turno].push(e);
                  }

                  const filas = Object.keys(turnos)
                    .map(k => parseInt(k))
                    .sort((a, b) => a - b);

                  return filas.map(turno => {
                    const eventos = turnos[turno];

                    // Determinar quién salió este turno (primer "jugar" del array)
                    let salidorTurno: number | null = null;

                    for (const e of eventos) {
                      if (e.tipo === "jugar") {
                        salidorTurno = e.jugador;
                        break;
                      }
                    }

                    const jugadas: Record<number, string | null> = {
                      0: null,
                      1: null,
                      2: null,
                    };

                    const acciones: string[] = [];

                    for (const e of eventos) {
                      if (e.tipo === "jugar") {
                        jugadas[e.jugador] = `${e.carta.palo[0]}-${e.carta.num}`;
                      } else if (e.tipo === "cante") {
                        acciones.push(`J${e.jugador + 1} canta ${e.palo} (${e.puntos})`);
                      } else if (e.tipo === "tute") {
                        acciones.push(`J${e.jugador + 1} canta TUTE`);
                      } else if (e.tipo === "cambio7") {
                        acciones.push(`J${e.jugador + 1} cambia ${e.quita} → ${e.pone}`);
                      } else if (e.tipo === "irADos") {
                        acciones.push(`J${e.jugador + 1} Va solo`);
                      }
                    }

                    return (
                      <tr key={turno}>
                        <td style={{ padding: 6, borderBottom: "1px solid #444" }}>{turno === -1 ? "Inicio" : turno + 1}</td>
                        <td style={{ padding: 6, borderBottom: "1px solid #444" }}>
                          {acciones.length ? acciones.join(" | ") : ""}
                        </td>
                        <td 
                          style={{
                            padding: 6,
                            borderBottom: "1px solid #444",
                            background:
                              salidorTurno === 0
                                ? "rgba(255,255,0,0.35)"
                                : perdedores.includes(0)
                                ? "rgba(255,0,0,0.35)"   // 🔴 Perdedor → rojo
                                : "transparent",
                          }}
                        >
                          {jugadas[0] || ""}
                        </td>

                        <td 
                          style={{
                            padding: 6,
                            borderBottom: "1px solid #444",
                            background:
                              salidorTurno === 1
                                ? "rgba(255,255,0,0.35)"
                                : perdedores.includes(1)
                                ? "rgba(255,0,0,0.35)"   // 🔴 Perdedor → rojo
                                : "transparent",
                          }}
                        >
                          {jugadas[1] || ""}
                        </td>

                        <td 
                          style={{
                            padding: 6,
                            borderBottom: "1px solid #444",
                            background:
                              salidorTurno === 2
                                ? "rgba(255,255,0,0.35)"
                                : perdedores.includes(2)
                                ? "rgba(255,0,0,0.35)"   // 🔴 Perdedor → rojo
                                : "transparent",
                          }}
                        >
                          {jugadas[2] || ""}
                        </td>

                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>

            <div style={{ textAlign: "right", marginTop: 20 }}>
              <button
                onClick={() => {
                  setMostrarResumenReo(false);
                  setReoLog([]);
                  setAutoRestartSeconds(5);   // ⏱️ arranca cuenta atrás
                }}
                style={{ padding: "8px 14px", borderRadius: 6 }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


      {/* Snackbar de cuenta atrás para reiniciar el REO */}
      {autoRestartSeconds !== null && (
        <div style={{
          position: "fixed",
          left: "50%",
          bottom: 20,
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.25)",
          zIndex: 100001
        }}>
          Reiniciando REO en {autoRestartSeconds}…
        </div>
      )}

    </>
  );
}
