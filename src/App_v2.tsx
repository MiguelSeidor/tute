
// src/App_v2.tsx
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { initGame } from "./engine/tuteInit";
import { dispatch } from "./engine/tuteReducer";
import type { GameEvent, GameState, Seat, Card, Palo } from "./engine/tuteTypes";
import { Carta, MesaVisual, PanelTriunfo } from "./ui/Primitives";
import { iaEligeCarta, iaDebeIrADos, iaDebeCambiar7, iaDebeTirarselas } from "./engine/tuteIA";
import { GameError } from "./engine/tuteTypes";
import { puedeJugar } from "./engine/tuteLogic";
import Simulador4 from "./ui/Simulador4";

// ========================== FRASES BOCADILLOS ==========================

const FRASES_RANDOM = [
  "De ningún cobarde se escribe ná",
  "Hasta el rabo todo es toro",
  "Quien más chifle, capador",
  "A cojones vistos, macho seguro",
  "El culo por un zarzal",
  "Arriero somos",
  "La habéis pillao gorda",
  "Achiquemán",
];

interface FraseCondicional {
  texto: string;
  condicion: "cante_40" | "cante_20_oros" | "cante_20_bastos" | "cante_20_copas" | "cante_20_espadas";
  quien: "cantante";
}

const FRASES_CONDICIONALES: FraseCondicional[] = [
  { texto: "¡Las cuacuá!", condicion: "cante_40", quien: "cantante" },
  { texto: "¡Oremos!", condicion: "cante_20_oros", quien: "cantante" },
  { texto: "¡En bastos!", condicion: "cante_20_bastos", quien: "cantante" },
  { texto: "¡En copas!", condicion: "cante_20_copas", quien: "cantante" },
  { texto: "¡En espadas!", condicion: "cante_20_espadas", quien: "cantante" },
];

const FRASE_RIVAL_CANTE = "No.. si tos cantaremos";

export default function App_v2() {
  const [game, setGame] = useState<GameState>(() => {
    const randomDealer = Math.floor(Math.random() * 4) as Seat;
    return initGame(5, randomDealer);
  });

  // === Overlay Decisión (J1) ===
  const [showDecision, setShowDecision] = useState(false);

  // === Modal Resumen + autorreinicio ===
  const [hideSummary, setHideSummary] = useState(false);
  const [autoRestartSeconds, setAutoRestartSeconds] = useState<number | null>(null);
  // === Estado local para CANTES de J1
  const [cantesDisponiblesJ1, setCantesDisponiblesJ1] = useState<CanteOpt[]>([]);
  const [bloqueaCantesEsteTurno, setBloqueaCantesEsteTurno] = useState(false);

  const aiBusyRef = React.useRef(false);
  const aiTimerRef = React.useRef<number | null>(null);

  // === Anuncio visual (cantes, tute, ir a los dos) ===
  const [anuncio, setAnuncio] = useState<{ texto: string; tipo: "cante" | "tute" | "irados" | "tirarselas" } | null>(null);
  const anuncioLogLen = React.useRef(0);

  // Estado: última acción por seat (se actualiza al cambiar el log)
  const [lastActionBySeat, setLastActionBySeat] = useState<Record<Seat, string>>({
    0: "", 1: "", 2: "", 3: ""
  });

  const [restartKind, setRestartKind] = useState<"reo" | "serie" | null>(null);
  const [plannedDealer, setPlannedDealer] = useState<Seat | null>(null);
  const [showSim, setShowSim] = React.useState(false);
  const [showPiedrasChoice, setShowPiedrasChoice] = useState(false);
  const RESET_ON_REFRESH = true;

  // === BOCADILLOS tipo cómic ===
  const [bocadillos, setBocadillos] = useState<Record<Seat, { texto: string; key: number } | null>>({
    0: null, 1: null, 2: null, 3: null
  });
  const bocadilloKeyRef = React.useRef(0);
  const bocadilloLogLenRef = React.useRef(0);

  function mostrarBocadillo(seat: Seat, texto: string) {
    bocadilloKeyRef.current++;
    const key = bocadilloKeyRef.current;
    setBocadillos(prev => ({ ...prev, [seat]: { texto, key } }));
    window.setTimeout(() => {
      setBocadillos(prev => prev[seat]?.key === key ? { ...prev, [seat]: null } : prev);
    }, 4000);
  }

  React.useEffect(() => {
    // Derivamos última acción "visible" por jugador desde el log más reciente hacia atrás
    const last: Record<number, string> = { 0: "", 1: "", 2: "", 3: "" };

    // Primero, si hay un resolverBaza al final, asignamos al ganador "Gana la baza (+p)"
    for (let i = game.reoLog.length - 1; i >= 0; i--) {
      const e = (game.reoLog as any[])[i];
      if (e?.t === "resolverBaza" && typeof e.ganador === "number") {
        last[e.ganador] = `Gana la baza (+${e.puntos})`;
        break;
      }
    }

    // Ahora buscamos la última acción específica por seat (sin pisar "Gana la baza")
    const activeSeats = new Set<number>(game.activos);
    for (let i = game.reoLog.length - 1; i >= 0; i--) {
      const e: any = (game.reoLog as any[])[i];
      const s = typeof e?.seat === "number" ? e.seat : null;

      if (s !== null) {
        // ignorar dealer/no-activo por seguridad
        if (!activeSeats.has(s)) continue;
        if (last[s]) continue; // ya tiene "Gana baza" u otra acción más reciente

        const text = formatAction(e);
        if (text) last[s] = text;
      }
    }

    setLastActionBySeat(last as any);
  }, [game.reoLog, game.activos]);

  // Detectar nuevos eventos de cante/tute/irADos para mostrar anuncio visual
  React.useEffect(() => {
    const log = game.reoLog;
    const prevLen = anuncioLogLen.current;
    anuncioLogLen.current = log.length;

    if (log.length <= prevLen) return; // no hay eventos nuevos

    // Buscar en los eventos nuevos
    for (let i = prevLen; i < log.length; i++) {
      const e = log[i] as any;
      if (e.t === "tute") {
        const kind = e.kind === "reyes" ? "4 Reyes" : "4 Caballos";
        setAnuncio({ texto: `J${e.seat + 1} canta TUTE (${kind})`, tipo: "tute" });
        return;
      }
      if (e.t === "cante") {
        setAnuncio({ texto: `J${e.seat + 1} canta ${e.palo} (${e.puntos})`, tipo: "cante" });
        return;
      }
      if (e.t === "irADos") {
        setAnuncio({ texto: `J${e.seat + 1} va a los dos!`, tipo: "irados" });
        return;
      }
      if (e.t === "tirarselas") {
        setAnuncio({ texto: `J${e.seat + 1} se las tira!`, tipo: "tirarselas" });
        return;
      }
    }
  }, [game.reoLog]);

  // Auto-ocultar anuncio tras 2 segundos
  React.useEffect(() => {
    if (!anuncio) return;
    const t = window.setTimeout(() => setAnuncio(null), 2000);
    return () => window.clearTimeout(t);
  }, [anuncio]);

  // Cleanup global del timer IA (solo al desmontar)
  React.useEffect(() => () => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
      aiBusyRef.current = false;
    }
  }, []);

  // Resetear flag de bloqueo cuando cambia el turno o la baza
  React.useEffect(() => {
    setBloqueaCantesEsteTurno(false);
  }, [game.turno, game.bazaN]);

  // Seats controlados por humanos (preparado para multijugador)
  const seatsHumanos: Seat[] = [0 as Seat];

  // === BOCADILLO: frases random cada 20 segundos (solo IA) ===
  React.useEffect(() => {
    if (game.status !== "jugando") return;

    const interval = window.setInterval(() => {
      // Solo IA: excluir seats humanos
      const candidates = (game.activos.length > 0 ? game.activos : ([0, 1, 2, 3] as Seat[]))
        .filter(s => !seatsHumanos.includes(s));
      if (candidates.length === 0) return;
      const seat = candidates[Math.floor(Math.random() * candidates.length)];
      const frase = FRASES_RANDOM[Math.floor(Math.random() * FRASES_RANDOM.length)];
      mostrarBocadillo(seat, frase);
    }, 20000);

    return () => window.clearInterval(interval);
  }, [game.status, game.activos]);

  // === BOCADILLO: frases condicionales (cantes) ===
  React.useEffect(() => {
    const log = game.reoLog;
    const prevLen = bocadilloLogLenRef.current;
    bocadilloLogLenRef.current = log.length;

    if (log.length <= prevLen) return;

    for (let i = prevLen; i < log.length; i++) {
      const e = log[i] as any;

      if (e.t === "tirarselas") {
        mostrarBocadillo(e.seat as Seat, "Me rindo...");
        return;
      }

      if (e.t === "cante") {
        const singer = e.seat as Seat;

        // El cantante dice la frase del palo
        if (e.puntos === 40) {
          mostrarBocadillo(singer, "¡Las cuacuá!");
        } else if (e.palo === "oros") {
          mostrarBocadillo(singer, "¡Oremos!");
        } else if (e.palo === "bastos") {
          mostrarBocadillo(singer, "¡En bastos!");
        } else if (e.palo === "copas") {
          mostrarBocadillo(singer, "¡En copas!");
        } else if (e.palo === "espadas") {
          mostrarBocadillo(singer, "¡En espadas!");
        }

        // Un rival aleatorio reacciona con retraso
        const rivals = game.activos.filter(s => s !== singer);
        if (rivals.length > 0) {
          const rival = rivals[Math.floor(Math.random() * rivals.length)];
          window.setTimeout(() => {
            mostrarBocadillo(rival, FRASE_RIVAL_CANTE);
          }, 1500);
        }
        return;
      }
    }
  }, [game.reoLog]);

  React.useEffect(() => {
    // Evitar reentradas
    if (aiBusyRef.current) return;

    // Si el humano (J1) está activo y no es dealer, y estamos decidiendo → NO actúa la IA
    const humanMustDecide =
      game.status === "decidiendo_irados" &&
      game.activos.includes(0 as Seat) &&
      game.dealer !== 0;
    if (humanMustDecide) return;

    // Flag local para saber si este efecto agendó un timer
    let scheduledTimer: number | null = null;

    // Helper para programar una acción IA con delay (con try/catch)
    const doLater = (fn: () => void, ms: number = 400) => {
      aiBusyRef.current = true;
      const timerId = window.setTimeout(() => {
        try { fn(); }
        catch (err: any) {
          if (err?.code !== "fuera_de_turno" && err?.code !== "mesa_incompleta") console.error(err);
        } finally {
          aiBusyRef.current = false;
          aiTimerRef.current = null;
        }
      }, ms);
      aiTimerRef.current = timerId;
      scheduledTimer = timerId;
    };

    // Cleanup: si el efecto se re-ejecuta antes de que el timer dispare,
    // cancelar el timer pendiente y resetear aiBusyRef.
    const cleanup = () => {
      if (scheduledTimer !== null) {
        window.clearTimeout(scheduledTimer);
        scheduledTimer = null;
        aiTimerRef.current = null;
        aiBusyRef.current = false;
      }
    };

    // === Fase: decidiendo_irados ===
    if (game.status === "decidiendo_irados") {
      // Si J1 es dealer (no decide), puede decidir IA
      const candidatos = game.activos.filter(s => s !== 0);
      for (const seat of candidatos) {
        if (iaDebeIrADos(game, seat)) {
          doLater(() => setGame(prev => dispatch(prev, { type: "declareIrADos", seat } as any)), 500);
          return cleanup;
        }
      }
      // Si nadie declara en 1200ms → pasamos a jugando sin irADos
      const t = window.setTimeout(() => {
        setGame(prev => (prev.status === "decidiendo_irados" ? dispatch(prev, { type: "lockNoIrADos" }) : prev));
      }, 1200);
      return () => { cleanup(); window.clearTimeout(t); };
    }

    if (game.status === "jugando") {
      // Si hay 3 cartas, espera a resolver
      if (game.mesa.length === 3) return;

      const turno = game.turno;
      if (turno === 0) return; // tu turno, IA no actúa

      // Solo cantar si ganó la baza anterior y mesa está vacía
      const puedeCantar =
        game.mesa.length === 0 &&
        game.ultimoGanadorBaza === turno;

      if (puedeCantar) {
        // ¿Ya cantó algo en esta baza? (un solo cante por baza ganada)
        const yaCanto = game.reoLog.some((e: any) =>
          (e.t === "cante" || e.t === "tute") &&
          e.seat === turno &&
          e.turno === game.bazaN
        );

        if (!yaCanto) {
          // 1) TUTE si procede (máxima prioridad)
          const tute = canteTuteDisponibleParaSeat(game, turno as Seat);
          if (tute) {
            doLater(() => setGame(prev => dispatch(prev, { type: "cantarTute", seat: turno as Seat } as any)), 350);
            return cleanup;
          }

          // 2) CANTES 20/40 — solo UNO por baza ganada (el más valioso)
          const cantes = cantesDisponiblesParaSeat(game, turno as Seat);
          if (cantes.length > 0) {
            const mejor = cantes.reduce((a, b) => b.puntos > a.puntos ? b : a);

            doLater(() => {
              setGame(prev => dispatch(prev, {
                type: "cantar",
                seat: turno as Seat,
                palo: mejor.palo,
                puntos: mejor.puntos
              } as any));
            }, 350);
            return cleanup;
          }
        }
      }

      // 3) ¿Tirárselas? (IA evalúa rendición)
      if (iaDebeTirarselas(game, turno)) {
        doLater(() => setGame(prev => dispatch(prev, { type: "tirarselas", seat: turno })), 600);
        return cleanup;
      }

      // 4) Cambiar 7 si procede (antes de su primera carta)
      if (iaDebeCambiar7(game, turno)) {
        doLater(() => setGame(prev => dispatch(prev, { type: "cambiar7", seat: turno } as any)), 350);
        return cleanup;
      }

      // 4) Jugar carta
      const carta = iaEligeCarta(game, turno);
      if (carta) {
        doLater(() => setGame(prev => dispatch(prev, { type: "jugarCarta", seat: turno, card: carta } as any)), 500 + Math.random() * 300);
        return cleanup;
      }
    }
  }, [game]);

  // Mostrar overlay si estamos en "decidiendo_irados" y J1 es activo (no dealer)
  React.useEffect(() => {
    const isDecidiendo = game.status === "decidiendo_irados";
    const j1Activo = game.activos.includes(0);
    const j1NoDealer = game.dealer !== 0;
    setShowDecision(isDecidiendo && j1Activo && j1NoDealer);
  }, [game.status, game.activos, game.dealer]);

  React.useEffect(() => {
    if (autoRestartSeconds === null) return;

    if (autoRestartSeconds <= 0) {
      const dealerToUse = plannedDealer ?? game.dealer;

      setHideSummary(false);
      setAutoRestartSeconds(null);

      if (restartKind === "serie") {
        // Nueva SERIE → reset + primer REO con dealer planificado (aleatorio)
        setGame(prev => dispatch(prev, { type: "resetSerie" }));
        setGame(prev => dispatch(prev, { type: "startRound", dealer: dealerToUse as Seat }));
      } else if (restartKind === "reo") {
        // REO normal → start con dealer rotado que ya planificamos
        setGame(prev => dispatch(prev, { type: "startRound", dealer: dealerToUse as Seat }));
      }

      // Limpiar flags
      setRestartKind(null);
      setPlannedDealer(null);
      return;
    }

    const t = window.setTimeout(() => {
      setAutoRestartSeconds(prev => (prev !== null ? prev - 1 : prev));
    }, 1000);

    return () => window.clearTimeout(t);
  }, [autoRestartSeconds, restartKind, plannedDealer, game.dealer]);

  React.useEffect(() => {
    if (game.status !== "decidiendo_irados" && showDecision) {
      setShowDecision(false);
    }
  }, [game.status, showDecision]);

  // Anti-atasco: resolver "decidiendo_irados" automáticamente
  React.useEffect(() => {
    if (game.status !== "decidiendo_irados") return;

    // Si el overlay de J1 está visible, esperamos al usuario
    if (showDecision) return;

    // Si NO hay overlay (p. ej. J1 es dealer), intentamos:
    // 1) Dejar un tiempo para que IA (si existe) decida
    // 2) Si nadie declara en 1200ms → lockNoIrADos
    const t = window.setTimeout(() => {
      setGame(prev => (prev.status === "decidiendo_irados"
        ? dispatch(prev, { type: "lockNoIrADos" })
        : prev
      ));
    }, 1200);

    return () => window.clearTimeout(t);
  }, [game.status, showDecision, setGame]);


  // Cuando hay 3 cartas en mesa, espera un poco para que la 3ª se vea y luego resuelve la baza
  React.useEffect(() => {
    if (game.status !== "jugando") return;
    if (game.mesa.length !== 3) return;

    const t = window.setTimeout(() => {
      setGame(prev => dispatch(prev, { type: "resolverBaza" }));
    }, 450); // 350–600 ms se ve bien

    return () => window.clearTimeout(t);
  }, [game.status, game.mesa.length]);

  // Reset de cantes al iniciar un REO
  React.useEffect(() => {
    if (game.status === "decidiendo_irados" && game.bazaN === 0) {
      setCantesDisponiblesJ1([]);
      setBloqueaCantesEsteTurno(false); 
    }
  }, [game.status, game.bazaN]);

  // Recalcular cantes SOLO cuando J1 gana una baza
  React.useEffect(() => {
      if (game.status !== "jugando") {
        setCantesDisponiblesJ1([]);
        setBloqueaCantesEsteTurno(false);
        return;
      }

      // ✅ Si ya se cantó algo este turno, no mostrar más opciones
      if (bloqueaCantesEsteTurno) {
        setCantesDisponiblesJ1([]);
        return;
      }

      // ✅ Solo mostrar cantes si J1 ganó la ÚLTIMA baza y es su turno
      if (game.ultimoGanadorBaza !== 0 || game.turno !== 0) {
        setCantesDisponiblesJ1([]);
        return;
      }

      // ✅ Mesa debe estar vacía (acabamos de resolver la baza)
      if (game.mesa.length !== 0) {
        setCantesDisponiblesJ1([]);
        return;
      }

      // Si J1 ganó baza: calcula cantes con la mano actual
      const posibles = obtenerCantesJ1(
        game.jugadores[0].mano,
        game.triunfo?.palo || null,
        game.cantesCantados[0] // ✅ pasar el estado de cantes
      );

      setCantesDisponiblesJ1(posibles);

  }, [
      game.status,
      game.turno,
      game.mesa.length,
      game.ultimoGanadorBaza,
      game.triunfo,
      game.jugadores,
      game.cantesCantados,
      bloqueaCantesEsteTurno,
  ]);

  // Hidratar la SERIE desde localStorage (piedras + dealer) si existen
  React.useEffect(() => {
    if (RESET_ON_REFRESH) return;
    try {
      const raw = localStorage.getItem("tv2_series");
      if (!raw) return;
      const saved = JSON.parse(raw);

      // Validación mínima
      const dealerOk = typeof saved?.dealer === "number" && saved.dealer >= 0 && saved.dealer <= 3;
      const piedrasOk =
        saved?.piedras &&
        [0,1,2,3].every((s) => typeof saved.piedras[s] === "number" && saved.piedras[s] >= 0);

      if (!dealerOk || !piedrasOk) return;

      // Aplicar sólo los campos de serie; no tocar status/mesa/log
      setGame((prev) => ({
        ...prev,
        dealer: saved.dealer as Seat,
        piedras: {
          0: saved.piedras[0],
          1: saved.piedras[1],
          2: saved.piedras[2],
          3: saved.piedras[3],
        },
      }));
    } catch (e) {
      console.warn("[persistencia] No se pudo hidratar tv2_series:", e);
    }
    // Solo una vez al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistir serie cada vez que cambien piedras o dealer
  React.useEffect(() => {
    if (RESET_ON_REFRESH) return;
    try {
      const payload = {
        dealer: game.dealer,
        piedras: game.piedras,
      };
      localStorage.setItem("tv2_series", JSON.stringify(payload));
    } catch (e) {
      console.warn("[persistencia] No se pudo guardar tv2_series:", e);
    }
  }, [game.dealer, game.piedras]);

  // === Juego destapado (debug): mostrar todas las cartas de todos los jugadores ===
  const [modoDestapado, setModoDestapado] = useState<boolean>(false);

  // Hidratar desde localStorage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("tv2_destapado");
      if (!raw) return;
      const v = JSON.parse(raw);
      if (typeof v === "boolean") setModoDestapado(v);
    } catch {}
  }, []);

  // Persistir en localStorage
  React.useEffect(() => {
    if (RESET_ON_REFRESH) return;
    try {
      localStorage.setItem("tv2_destapado", JSON.stringify(modoDestapado));
    } catch {}
  }, [modoDestapado]);

  // justo dentro del componente App_v2
  const bootRef = React.useRef(false);

  React.useEffect(() => {
    if (!RESET_ON_REFRESH) return;

    if (bootRef.current) return; // evita reentradas en StrictMode
    bootRef.current = true;

    try {
      // Limpia cualquier rastro previo
      localStorage.removeItem("tv2_series");
      localStorage.removeItem("tv2_destapado");
    } catch {}

    // Mostrar selector de piedras antes de empezar
    setShowPiedrasChoice(true);

  }, []);


  function send(ev: GameEvent) {
    try {
      setGame(prev => dispatch(prev, ev));
    } catch (err: any) {
      if (err instanceof GameError) {
        if (err.code === "fuera_de_turno" || err.code === "mesa_incompleta" || err.code === "ilegal") {
          // Silenciar errores esperables si por UX aún no está todo blindado
          return;
        }
        alert(`${err.code}: ${err.message}`);
        return;
      }
      console.error(err);
      alert(err?.message || "Error inesperado");
    }
  }

  function iniciarNuevaSerie(piedras: number) {
    setShowPiedrasChoice(false);
    const randDealer = Math.floor(Math.random() * 4) as Seat;
    setGame(prev => dispatch(prev, { type: "resetSerie", piedras }));
    setGame(prev => dispatch(prev, { type: "startRound", dealer: randDealer }));
    setHideSummary(false);
    setAutoRestartSeconds(null);
    setRestartKind(null);
    setPlannedDealer(null);
  }

  // Helpers UI
  const activos = game.activos;
  const dealer = game.dealer;
  const turno = game.turno;

  function OverlayDecision({ visible, onYes, onNo }: { visible: boolean; onYes: () => void; onNo: () => void }) {
    if (!visible) return null;
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999
      }}>
        <div style={{
          background: "rgba(255,255,255,0.95)", padding: "28px 35px", borderRadius: 12,
          border: "2px solid rgba(0,0,0,0.25)", boxShadow: "0 8px 45px rgba(0,0,0,0.35)",
          textAlign: "center", minWidth: 280, color:"#111"
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

  // --- PlayerBox: renderiza las cartas y el título de cada seat ---
  // IMPORTA los tipos arriba si no los tienes
  // import type { Seat, GameState, GameEvent, Card } from "./engine/tuteTypes";

  // --- PlayerBox: renderiza las cartas y el título de cada seat ---
  function PlayerBox({
    seat,
    game,
    send,
    revealAll,
  }: {
    seat: Seat;
    game: GameState;
    send: (ev: GameEvent) => void;
    revealAll?: boolean;
  }) {
    const dealer = game.dealer;
    const isDealer = dealer === seat;
    const mano = game.jugadores[seat].mano;
    const activos = game.activos;

    const canJ1Play =
      seat === 0 &&
      game.status === "jugando" &&
      game.turno === 0 &&
      activos.includes(0 as Seat) &&
      !isDealer;

    return (
      <div style={{ textAlign: "center", minWidth: 200 }}>
        <div className="playerHeaderLine">
          <span>Jugador {seat + 1}</span>

          {isDealer && (
            <span className="badge badge--dealer" title="Reparte este REO">
              🎴 Reparte
            </span>
          )}

          {game.irADos === seat && (
            <span className="badge badge--solo" title="Va a los dos">
              🥇 Va solo
            </span>
          )}

          {!activos.includes(seat) && !isDealer && (
            <span style={{ opacity: 0.7 }}>(No juega)</span>
          )}
        </div>

        <div className="playerActionLine">
          {lastActionBySeat[seat] || ""} {/* ✅ ahora seat es Seat, no any */}
        </div>

        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
          <HandRow
            seat={seat}
            cards={mano as Card[]}
            interactive={
              seat === 0 &&
              game.status === "jugando" &&
              game.turno === 0 &&
              game.activos.includes(0 as Seat) &&
              !isDealer
            }
            isLegalCard={(card) => isLegalCardForJ1(game, card)}
            onPlay={(c) => {
              if (!isLegalCardForJ1(game, c)) return;
              send({ type: "jugarCarta", seat: 0, card: c });
            }}
            revealAll={!!revealAll}
          />
        </div>
      </div>
    );
  }

  // HandRow con auto-escala para encajar SIEMPRE 9 slots en UNA sola línea para J1.
  // - Para J1 (seat===0): sin wrap + escala dinámica + 9 slots (los vacíos son placeholders invisibles).
  // - Para el resto: comportamiento anterior (wrap), sin escala.
  function HandRow({
  seat,
  cards,
  interactive = false,
  onPlay,
  isLegalCard,
  revealAll = false,
  }: {
    seat: Seat;
    cards: Card[];
    interactive?: boolean;
    onPlay?: (c: Card) => void;
    isLegalCard?: (c: Card) => boolean;
    revealAll?: boolean;               // ⬅️ NUEVO
  }) {
    const TOTAL_SLOTS = 9;
    const GAP_PX = 6;
    const isMe = seat === (0 as Seat);

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = React.useState(1);

    const readCssNumber = (name: string, fallback: number) => {
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name);
        const n = parseFloat(v);
        return Number.isFinite(n) && n > 0 ? n : fallback;
      } catch {
        return fallback;
      }
    };

    React.useLayoutEffect(() => {
      if (!isMe) return; // solo J1 auto‑escala
      const el = containerRef.current;
      if (!el) return;
      const containerW = el.clientWidth || 0;
      const cardW = readCssNumber("--card-w", 110);
      const cardH = readCssNumber("--card-h", Math.round(cardW * 1.45));
      const requiredW = TOTAL_SLOTS * cardW + (TOTAL_SLOTS - 1) * GAP_PX;
      const sRaw = containerW > 0 ? containerW / requiredW : 1;
      const s = Math.min(1, Math.max(0.85, sRaw)); // ⬅️ suelo 0.85 para no “encoger” de más
      setScale(s);
    }, [isMe, cards.length]);

    const containerStyle: React.CSSProperties = isMe
      ? {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "nowrap",
          gap: GAP_PX,
          minHeight: "var(--card-h)",
          overflow: "hidden",
        }
      : {
          display: "flex",
          flexWrap: "wrap",
          gap: GAP_PX,
          justifyContent: "center",
          minHeight: "var(--card-h)",
        };

    const scaledRowStyle: React.CSSProperties = isMe
      ? {
          display: "flex",
          flexWrap: "nowrap",
          gap: GAP_PX,
          transformOrigin: "center center",
          transform: `scale(${Number.isFinite(scale) && scale > 0 ? scale : 1})`,
        }
      : {};

    return (
      <div ref={containerRef} className="handRow" style={containerStyle}>
        {isMe ? (
          // === J1: siempre 9 slots en 1 línea, con auto‑escala ===
          <div style={scaledRowStyle}>
            {Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
              const has = i < cards.length;
              if (!has) return <Carta key={i} tapada style={{ visibility: "hidden" }} />;
              const card = cards[i];
              const legal = interactive && (isLegalCard ? isLegalCard(card) : true);
              return (
                <Carta
                  key={i}
                  carta={card}
                  legal={legal}
                  onClick={() => legal && onPlay?.(card)}
                />
              );
            })}
          </div>
        ) : (
          // === NPCs: si revealAll, mostrar carta real; si no, dorso ===
          Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
            const has = i < cards.length;
            if (!has) {
              return (
                <Carta
                  key={i}
                  tapada
                  style={{ width: "var(--npc-card-w)", visibility: "hidden" }}
                />
              );
            }
            const card = cards[i];
            if (revealAll) {
              // Destapado: carta real pero SIN onClick
              return (
                <Carta
                  key={i}
                  carta={card}
                  legal={false}
                  style={{ width: "var(--npc-card-w)" }}
                />
              );
            }
            // Normal: dorso
            return (
              <Carta
                key={i}
                tapada
                style={{ width: "var(--npc-card-w)", visibility: "visible" }}
              />
            );
          })
        )}
      </div>
    );
  }

  // === Tipos auxiliares de cantes
  type CanteOpt = { palo: Palo; puntos: 20 | 40 };

  // ¿Mostrar la barra de acciones de J1? (ya lo tienes, por claridad lo usamos)
  function shouldShowActionsForJ1(game: GameState): boolean {
    if (!(game.status === "jugando")) return false;
    if (game.dealer === 0) return false;
    if (!game.activos.includes(0 as Seat)) return false;
    return true;
  }

  // Calcula cantes (20/40) en la mano de J1 según el triunfo
  // Firma actualizada
  function obtenerCantesJ1(mano: Card[], triunfoPalo: Palo | null, yaCantados: Record<Palo, boolean>): CanteOpt[] {
    if (!triunfoPalo) return [];
    const palos: Palo[] = ["oros", "copas", "espadas", "bastos"];
    const res: CanteOpt[] = [];
    for (const p of palos) {
      if (yaCantados[p]) continue; // ✅ evita repetir cantes
      const tieneRey = mano.some(c => c.palo === p && c.num === 12);
      const tieneCab = mano.some(c => c.palo === p && c.num === 11);
      if (tieneRey && tieneCab) {
        const puntos = (p === triunfoPalo ? 40 : 20) as 20 | 40;
        res.push({ palo: p, puntos });
      }
    }
    return res;
  }

  // El último ganador de baza (leyendo del log)
  function ultimoGanadorBaza(game: GameState): Seat | null {
    // Buscamos el último evento t:"resolverBaza"
    for (let i = game.reoLog.length - 1; i >= 0; i--) {
      const e = game.reoLog[i] as any;
      if (e?.t === "resolverBaza" && typeof e.ganador === "number") return e.ganador as Seat;
    }
    return null;
  }

  function canteTuteDisponibleParaSeat(game: GameState, seat: Seat): { kind: "reyes" | "caballos" } | null {
    if (game.status !== "jugando") return null;
    if (game.mesa.length !== 0) return null;  
    if (game.turno !== seat) return null;
    
    // ✅ CRÍTICO: si ya cantó TUTE, no puede volver a cantar
    if (game.cantesTuteCantado[seat]) return null;

    // ✅ Solo puede cantar si ganó la baza ANTERIOR (no en la primera baza)
    // En la primera baza, ultimoGanadorBaza es null, por lo que esta verificación
    // correctamente impide cantar TUTE
    if (game.ultimoGanadorBaza !== seat) return null;

    const mano = game.jugadores[seat].mano;
    const palos: Palo[] = ["oros","copas","espadas","bastos"];

    const tengo4Reyes = palos.every(p => mano.some(c => c.palo === p && c.num === 12));
    if (tengo4Reyes) return { kind: "reyes" };

    const tengo4Caballos = palos.every(p => mano.some(c => c.palo === p && c.num === 11));
    if (tengo4Caballos) return { kind: "caballos" };

    return null;
  }

  // === Helper: ¿J1 puede cambiar el 7 ahora mismo? ===
  function canChangeSevenForJ1(game: GameState): boolean {
    // Debe haber triunfo
    if (!game.triunfo) return false;
    // Si la muestra ya es 7, no hay nada que cambiar
    if (game.triunfo.num === 7) return false;

    // J1 no puede ser dealer
    if (game.dealer === 0) return false;

    // J1 debe estar activo
    if (!game.activos.includes(0 as Seat)) return false;

    // Debe estar en “jugando” o “decidiendo_irados”
    if (!(game.status === "jugando" || game.status === "decidiendo_irados")) return false;

    // J1 aún no ha jugado carta
    const j1 = game.jugadores[0 as Seat];
    if (!j1 || j1.haJugadoAlMenosUna) return false;

    // Debe tener el 7 del palo del triunfo
    const tiene7 = j1.mano.some(c => c.palo === game.triunfo!.palo && c.num === 7);
    return tiene7;
  }

  function ResumenModal({
    game,
    visible,
    onClose,
  }: {
    game: GameState;
    visible: boolean;
    onClose: () => void;
  }) {
    if (!visible) return null;

    const activeSeats = new Set<number>(game.activos);

    // Agrupar por turno (objeto, no Map)
    const turnos: Record<number, any[]> = {};

    for (const e of game.reoLog as any[]) {
      let key: number;

      // Normalizar clave: "Inicio" = -1
      if (e?.turno === undefined || e?.turno === null) {
        if (e?.t === "cambio7" || e?.t === "irADos" || e?.t === "startRound") {
          key = -1;
        } else {
          continue;  // ignora eventos sin turno que no sean de inicio
        }
      } else {
        key = Number(e.turno);
        if (!Number.isFinite(key)) continue;
      }

      // Si el evento tiene seat y no es activo (dealer), se ignora
      const hasSeat = typeof e?.seat === "number";
      if (hasSeat && !activeSeats.has(e.seat)) continue;

      if (!turnos[key]) turnos[key] = [];
      turnos[key].push(e);
    }

    const orden = Object.keys(turnos).map(Number).sort((a, b) => a - b);

    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99998
      }}>
        <div style={{
          width: "min(900px, 90vw)", maxHeight: "90vh", overflowY: "auto",
          background: "#13381f", padding: 20, borderRadius: 12, color: "white",
          border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 10px 60px rgba(0,0,0,0.65)"
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
                <th style={{ borderBottom: "1px solid #fff", padding: 6 }}>J4</th>
              </tr>
            </thead>
            <tbody>
              {orden.map((t) => {
                const eventos = turnos[t]!;
                const eventosFiltrados = eventos.filter((e: any) =>
                  typeof e?.seat === "number" ? activeSeats.has(e.seat) : true
                );

                const jugadas: Record<number, string | null> = { 0: null, 1: null, 2: null, 3: null };
                const acciones: string[] = [];
                let ganadorTurno: number | null = null;

                for (const e of eventosFiltrados) {
                  if (e.t === "jugar") {
                    jugadas[e.seat] = `${e.carta.palo[0].toUpperCase()}-${e.carta.num}`;
                  } else if (e.t === "cambio7") {
                    acciones.push(`J${e.seat + 1} cambia ${e.quita.palo[0].toUpperCase()}-${e.quita.num} → ${e.pone.palo[0].toUpperCase()}-${e.pone.num}`);
                  } else if (e.t === "irADos") {
                    acciones.push(`J${e.seat + 1} va a los dos`);
                  } else if (e.t === "cante") {
                    acciones.push(`J${e.seat + 1} canta ${e.palo} (${e.puntos})`);
                  } else if (e.t === "tute") {
                    acciones.push(`J${e.seat + 1} canta TUTE (${e.kind}) (+${e.puntos})`);
                  } else if (e.t === "tirarselas") {
                    acciones.push(`J${e.seat + 1} se las tira`);
                  } else if (e.t === "resolverBaza") {
                    ganadorTurno = e.ganador;
                    acciones.push(`Gana la baza J${e.ganador + 1} (+${e.puntos})`);
                  }
                }

                const cellStyle = (seat: number) => ({
                  padding: 6,
                  borderBottom: "1px solid #444",
                  background:
                    ganadorTurno === seat
                      ? "rgba(0, 200, 120, 0.35)"   // ✅ verde al ganador del turno
                      : game.perdedores.includes(seat as Seat)
                      ? "rgba(255, 0, 0, 0.35)"     // 🔴 perdedores al final del REO
                      : "transparent",
                });

                return (
                  <tr key={t}>
                    <td style={{ padding: 6, borderBottom: "1px solid #444" }}>
                      {t === -1 ? "Inicio" : t + 1}
                    </td>
                    <td style={{ padding: 6, borderBottom: "1px solid #444" }}>
                      {acciones.length ? acciones.join(" | ") : ""}
                    </td>
                    <td style={cellStyle(0)}>{jugadas[0] || ""}</td>
                    <td style={cellStyle(1)}>{jugadas[1] || ""}</td>
                    <td style={cellStyle(2)}>{jugadas[2] || ""}</td>
                    <td style={cellStyle(3)}>{jugadas[3] || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ textAlign: "right", marginTop: 20 }}>
            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 6 }}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

    // ¿J1 juega este REO (no es dealer y está en activos)?
  function isJ1Active(game: GameState): boolean {
    return game.dealer !== 0 && game.activos.includes(0 as Seat);
  }

  // ¿Es legal que J1 juegue esta carta ahora?
  function isLegalCardForJ1(game: GameState, c: Card): boolean {
    // Debe ser su turno y estar en estado "jugando"
    if (game.status !== "jugando") return false;
    if (game.turno !== 0) return false;
    if (game.dealer === 0) return false;               // por si acaso: J1 dealer no juega
    if (!game.activos.includes(0 as Seat)) return false;

    const mano = game.jugadores[0 as Seat].mano;
    const triunfoPalo = game.triunfo?.palo as Palo;

    // Legalidad según motor (seguir palo, superar si puedes, fallar solo si ganas…)
    return puedeJugar(c, mano, game.mesa, triunfoPalo);
  }


  // ==== Helpers de formato de acciones para la línea bajo el nombre ====
  function cartaAbbr(c: Card) {
    return `${c.palo[0].toUpperCase()}-${c.num}`;
  }

  function formatAction(e: any): string | null {
    switch (e?.t) {
      case "cambio7":
        return `Cambia ${cartaAbbr(e.quita)} → ${cartaAbbr(e.pone)}`;
      case "irADos":
        return `Declara ir a los dos`;
      case "cante":
        return `Canta ${e.palo} (${e.puntos})`;
      case "tute":
        return `Canta TUTE`;
      case "jugar":
        return `Juega ${cartaAbbr(e.carta)}`;
      case "tirarselas":
        return `Se las tira`;
      case "resolverBaza":
        // esto lo asignaremos al ganador explícitamente abajo
        return null;
      case "startRound":
        return `Recibe muestra: ${cartaAbbr(e.triunfo)}`;
      default:
        return null;
    }
  }

  function canteTuteDisponibleJ1(game: GameState): boolean {
    return !!canteTuteDisponibleParaSeat(game, 0 as Seat);
  }

  function cantesDisponiblesParaSeat(game: GameState, seat: Seat): CanteOpt[] {
      if (game.status !== "jugando") return [];
      if (game.mesa.length !== 0) return [];
      if (game.turno !== seat) return [];
      
      // ✅ Solo puede cantar si ganó la baza ANTERIOR
      if (game.ultimoGanadorBaza !== seat) return [];

      const triunfoPalo = game.triunfo?.palo || null;
      if (!triunfoPalo) return [];

      // ✅ CRÍTICO: leer del estado del motor, NO de variables locales
      const yaCantados = game.cantesCantados[seat];
      const mano = game.jugadores[seat].mano;

      const palos: Palo[] = ["oros", "copas", "espadas", "bastos"];
      const res: CanteOpt[] = [];

      for (const p of palos) {
        // ✅ Verificar si ya se cantó este palo (debe estar en el estado del motor)
        if (yaCantados[p]) {
          console.log(`[DEBUG] Palo ${p} ya fue cantado por seat ${seat}`); // para debug
          continue;
        }
        
        const tieneRey = mano.some(c => c.palo === p && c.num === 12);
        const tieneCab = mano.some(c => c.palo === p && c.num === 11);
        
        if (tieneRey && tieneCab) {
          res.push({ palo: p, puntos: (p === triunfoPalo ? 40 : 20) as 20 | 40 });
        }
      }
      
      console.log(`[DEBUG] Cantes disponibles para seat ${seat}:`, res); // para debug
      return res;
  }


  // Render
  return (
    <>
      {/* Reutilizamos tu CSS (puedes moverlo a .css cuando quieras) */}
      <style>{`
        :root {
          --card-w: clamp(76px, 3vw, 132px);
          --card-h: calc(var(--card-w) * 1.25);  /* altura aprox. según tus PNG */
          --npc-card-w: 51px;

          /* Cartas en la mesa: un poco más pequeñas para que quepan 3 sin solaparse */
          --mesa-card-w: calc(var(--card-w) * 0.85);
          --mesa-card-h: calc(var(--mesa-card-w) * 1.45);
        }
        .page {
          min-height: 100svh; display: grid; grid-template-columns: minmax(0, 1fr) 320px;
          gap: 12px; padding: 12px; box-sizing: border-box; max-width: 1800px; margin: 0 auto; color: #fff;
        }
        body {
          margin:0;
          background: radial-gradient(1400px 900px at 20% 10%, #2e7d32 0%, #1b5e20 60%, #0f3f14 100%);
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
        }
        .board { display: flex; flex-direction: column; gap: 12px; }
        .headerBar { display:flex; align-items:center; justify-content:space-between; gap: 12px; }
        .opponentsRow { display:flex; gap:12px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
        .opponent { flex:1 1 0; min-width: 360px; text-align:center; }
        .fila-cartas { display:flex; gap:6px; align-items:center; justify-content:center; min-height:calc(var(--card-w) * 1); flex-wrap:wrap; }
        .mesaBox { margin:0 auto; width: calc(var(--card-w) * 5.2); height: calc(var(--card-h) * 3.2);
          border-radius:12px; background: rgba(0,0,0,0.2); box-shadow: 0 10px 30px rgba(0,0,0,.25) inset; overflow:hidden; }
        .sidebar { background: rgba(0,0,0,0.15); border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:12px; min-height:100%; }
        .pill { padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.12); margin-bottom:8px; }
        .pill.loser { border-color: #ff6b6b; background: rgba(255,60,60,0.18); box-shadow: inset 0 0 0 2px rgba(255,60,60,0.25); }
        .dealerBadge { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:700;
          background: linear-gradient(180deg, #ffd54f, #ffb300); color:#3b2b00; border:1px solid rgba(255,255,255,0.35); }
        .dealerIcon { font-size:14px; line-height:1; }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(0,0,0,0.18);
        }
        .badge--dealer {
          background: linear-gradient(180deg, #ffd54f, #ffb300);
          color: #3b2b00;
          border-color: rgba(255,255,255,0.35);
        }
        .badge--solo {
          background: rgba(0,200,120,0.25);
          border-color: rgba(0,255,180,0.35);
        }
        .playerHeaderLine {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-bottom: 4px;
        }
        .playerActionLine {
          font-size: 12px; opacity: .85; min-height: 16px;
        }
        .pill.stoneOut {
          border-color: #ff4d4d;
          box-shadow:
            0 0 0 3px rgba(255, 77, 77, 0.55),
            0 0 0 6px rgba(255, 77, 77, 0.20);
        }
        .mesaBox.anuncio-activo {
          box-shadow:
            0 0 12px 4px rgba(0, 255, 120, 0.5),
            0 0 30px 8px rgba(0, 255, 120, 0.25),
            0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(0, 255, 120, 0.7);
          transition: box-shadow 0.3s ease, border 0.3s ease;
        }
        .mesaBox.anuncio-tute {
          box-shadow:
            0 0 16px 6px rgba(255, 215, 0, 0.6),
            0 0 40px 12px rgba(255, 215, 0, 0.3),
            0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(255, 215, 0, 0.8);
        }
        .mesaBox.anuncio-irados {
          box-shadow:
            0 0 12px 4px rgba(255, 140, 0, 0.5),
            0 0 30px 8px rgba(255, 140, 0, 0.25),
            0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(255, 140, 0, 0.7);
        }
        @keyframes anuncio-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .anuncio-overlay {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10;
          padding: 14px 28px;
          border-radius: 12px;
          font-size: 20px;
          font-weight: 800;
          text-align: center;
          white-space: nowrap;
          pointer-events: none;
          animation: anuncio-in 250ms ease-out both;
        }
        .anuncio-overlay.cante {
          background: rgba(0, 80, 40, 0.85);
          color: #66ffaa;
          border: 2px solid rgba(0, 255, 120, 0.6);
          text-shadow: 0 0 12px rgba(0, 255, 120, 0.5);
        }
        .anuncio-overlay.tute {
          background: rgba(80, 60, 0, 0.9);
          color: #ffd700;
          border: 2px solid rgba(255, 215, 0, 0.7);
          text-shadow: 0 0 16px rgba(255, 215, 0, 0.6);
          font-size: 26px;
        }
        .anuncio-overlay.irados {
          background: rgba(80, 40, 0, 0.9);
          color: #ffaa33;
          border: 2px solid rgba(255, 140, 0, 0.6);
          text-shadow: 0 0 12px rgba(255, 140, 0, 0.5);
        }
        .mesaBox.anuncio-tirarselas {
          box-shadow:
            0 0 12px 4px rgba(255, 60, 60, 0.5),
            0 0 30px 8px rgba(255, 60, 60, 0.25),
            0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(255, 60, 60, 0.7);
        }
        .anuncio-overlay.tirarselas {
          background: rgba(100, 10, 10, 0.9);
          color: #ff6b6b;
          border: 2px solid rgba(255, 60, 60, 0.7);
          text-shadow: 0 0 12px rgba(255, 60, 60, 0.5);
        }

        /* === BOCADILLOS CÓMIC === */
        @keyframes bocadillo-in {
          from { opacity: 0; transform: translateX(-50%) scale(0.7); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes bocadillo-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        .bocadillo {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;
          padding: 8px 16px;
          border-radius: 18px;
          background: #fff;
          color: #222;
          font-size: 14px;
          font-weight: 700;
          font-style: italic;
          white-space: nowrap;
          box-shadow: 0 3px 12px rgba(0,0,0,0.35);
          pointer-events: none;
          animation: bocadillo-in 300ms ease-out both;
        }
        .bocadillo::after {
          content: "";
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          border: 8px solid transparent;
        }
        .bocadillo--above {
          bottom: calc(100% + 10px);
        }
        .bocadillo--above::after {
          top: 100%;
          border-top-color: #fff;
        }
        .bocadillo--below {
          top: calc(100% + 10px);
        }
        .bocadillo--below::after {
          bottom: 100%;
          border-bottom-color: #fff;
        }
      `}</style>

      <div className="page">
        {/* IZQ: TABLERO */}
        <div className="board">

          {/* Cabecera */}
        <div className="headerBar">
          <h2 style={{ margin: 0 }}>Tute Parrillano</h2>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <button 
              onClick={() => {
                  // 1) Parar partida actual
                  setGame(prev => ({
                    ...prev,
                    status: "inicial",   // ⏸ congela partida
                    mesa: [],            // limpiar mesa (por seguridad visual)
                  }));

                  // 2) Abrir simulador
                  setShowSim(true);

                  // 3) Cancelar cualquier temporizador de IA en marcha
                  if (aiTimerRef.current) {
                    clearTimeout(aiTimerRef.current);
                    aiTimerRef.current = null;
                  }
                }}
              title="Configura un REO de test: manos, dealer y muestra">
              Simular REO
            </button>
            <button onClick={() => send({ type: "startRound" })}>Iniciar REO</button>

            {/* ⬇️ Juego destapado (debug) */}
            <label style={{ display:"inline-flex", alignItems:"center", gap:6, userSelect:"none", cursor:"pointer" }}>
              <input
                type="checkbox"
                checked={modoDestapado}
                onChange={(e) => setModoDestapado(e.target.checked)}
              />
              Juego destapado
            </label>
          </div>
        </div>

          {/* Subcabecera */}
          <p style={{ fontWeight: "bold", marginBottom: 0 }}>
            {game.status === "jugando"
              ? (turno !== undefined ? `⏳ Turno del jugador ${turno + 1}` : "⏳ Turno…")
              : game.status === "decidiendo_irados"
              ? "🗳 Decidiendo IR A LOS DOS…"
              : game.status === "resumen"
              ? "🏁 Resumen del REO"
              : "Preparado (pulsa Iniciar REO)"}&nbsp;
            {dealer !== undefined && (
              <span className="dealerBadge" title="Reparte este REO">
                <span className="dealerIcon">🎴</span> Dealer: J{dealer + 1}
              </span>
            )}
          </p>

          <PanelTriunfo triunfo={game.triunfo} />


          {/* TABLERO 4 ESQUINAS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gridTemplateRows: "1fr auto 1fr",
              gap: "12px",
              alignItems: "center",
              justifyItems: "center",
              marginTop: "-100px",
            }}
          >
            {/* J3 ARRIBA (seat 2) */}
            <div style={{ gridColumn: "2", gridRow: "1", position: "relative" }}>
              <PlayerBox seat={2} game={game} send={send} revealAll={modoDestapado}/>
              {bocadillos[2] && (
                <div className="bocadillo bocadillo--below" key={bocadillos[2].key}>{bocadillos[2].texto}</div>
              )}
            </div>

            {/* J2 IZQUIERDA (seat 1) */}
            <div style={{ gridColumn: "1", gridRow: "2", position: "relative" }}>
              <PlayerBox seat={1} game={game} send={send} revealAll={modoDestapado}/>
              {bocadillos[1] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[1].key}>{bocadillos[1].texto}</div>
              )}
            </div>

            {/* MESA CENTRO */}
            <div style={{ gridColumn: "2", gridRow: "2" }}>
              <div
                className={`mesaBox${anuncio ? ` anuncio-${anuncio.tipo === "cante" ? "activo" : anuncio.tipo}` : ""}`}

                style={{ position: "relative" }}
              >
                <MesaVisual mesa={game.mesa} />
                {anuncio && (
                  <div className={`anuncio-overlay ${anuncio.tipo}`} key={anuncio.texto}>
                    {anuncio.texto}
                  </div>
                )}
              </div>
            </div>

            {/* J4 DERECHA (seat 3) */}
            <div style={{ gridColumn: "3", gridRow: "2", position: "relative" }}>
              <PlayerBox seat={3} game={game} send={send} revealAll={modoDestapado}/>
              {bocadillos[3] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[3].key}>{bocadillos[3].texto}</div>
              )}
            </div>

            {/* J1 ABAJO (seat 0) */}
            <div style={{ gridColumn: "2", gridRow: "3", position: "relative" }}>
              <PlayerBox seat={0} game={game} send={send} revealAll={modoDestapado}/>
              {bocadillos[0] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[0].key}>{bocadillos[0].texto}</div>
              )}
            </div>
          </div>
          
        {/* Acciones (Cambiar 7, Cantar) */}
        {shouldShowActionsForJ1(game) && (
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", justifyContent:"center" }}>

            {/* Cambiar 7 */}
            <button
              onClick={() => send({ type: "cambiar7", seat: 0 })}
              disabled={!canChangeSevenForJ1(game)}
              title={
                canChangeSevenForJ1(game)
                  ? `Cambiar 7 (${game.triunfo?.palo})`
                  : "Solo antes de tu primera carta y si tienes el 7 del triunfo"
              }
            >
              Cambiar 7
            </button>
            
            {/* Cantar TUTE */}
            {game.status === "jugando" && !bloqueaCantesEsteTurno && canteTuteDisponibleJ1(game) && (
              <button
                onClick={() => {
                  send({ type: "cantarTute", seat: 0 });
                  setCantesDisponiblesJ1([]); // ocultar cantes 20/40
                  setBloqueaCantesEsteTurno(true); // ✅ bloquear más cantes este turno
                }}
                title="Cantar TUTE (4 Reyes o 4 Caballos)"
              >
                Cantar TUTE
              </button>
            )}
            
            {/* Bocadillo: selector de frases para J1 */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  mostrarBocadillo(0 as Seat, e.target.value);
                  e.target.value = "";
                }
              }}
              style={{
                padding: "6px 10px", borderRadius: 6, fontSize: 13,
                background: "rgba(255,255,255,0.12)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer",
                maxWidth: 200,
              }}
              title="Elige una frase para tu bocadillo"
            >
              <option value="" disabled>Decir algo...</option>
              {FRASES_RANDOM.map((f, i) => (
                <option key={i} value={f} style={{ color: "#111" }}>{f}</option>
              ))}
            </select>

            {/* Tirárselas (J1 se rinde) */}
            {game.status === "jugando" && game.activos.includes(0 as Seat) && (
              <button
                onClick={() => send({ type: "tirarselas", seat: 0 })}
                style={{ background: "rgba(255,60,60,0.25)", borderColor: "rgba(255,60,60,0.5)" }}
                title="Rendirse: pierdes este REO inmediatamente"
              >
                Tirárselas
              </button>
            )}

            {/* CANTES (solo si J1 ganó la última baza) */}
            {game.status === "jugando" && !bloqueaCantesEsteTurno && cantesDisponiblesJ1.length > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                {cantesDisponiblesJ1.map((opt, i) => (
                  <button
                    key={`${opt.palo}-${opt.puntos}-${i}`}
                    onClick={() => {
                      // Emitimos el evento al motor
                      send({ type: "cantar", seat: 0, palo: opt.palo, puntos: opt.puntos });
                      // Ocultamos TODOS los cantes disponibles
                      setCantesDisponiblesJ1([]);
                      setBloqueaCantesEsteTurno(true); // ✅ bloquear más cantes este turno
                    }}
                    title={`Cantar ${opt.palo} (${opt.puntos})`}
                  >
                    Cantar {opt.palo} ({opt.puntos})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mis bazas (J1) */}
        {isJ1Active(game) && (
          <div>
            <h3 style={{ margin: "12px 0 6px" }}>Mis bazas</h3>
            <div style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 64,
              overflowX: "auto",
              overflowY: "hidden",
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              background: "rgba(0,0,0,0.2)",
              whiteSpace: "nowrap",
            }}>
              {game.bazasPorJugador[0].length === 0 ? (
                <span style={{ opacity: 0.7 }}>Aún no has ganado ninguna baza</span>
              ) : (
                game.bazasPorJugador[0].map((baza, idx) => {
                  const pts = baza.reduce((s, c) => s + (c.num === 1 ? 11 : c.num === 3 ? 10 : c.num === 12 ? 4 : c.num === 11 ? 3 : c.num === 10 ? 2 : 0), 0);
                  return (
                    <div key={idx} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                        title={`Baza ${idx + 1} • ${pts} puntos`}>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 10px", borderRadius: 999,
                        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)"
                      }}>
                        <span style={{ fontSize: 12, opacity: 0.9, marginRight: 2 }}>Baza {idx + 1}</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {baza.map((c, j) => (
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
        )}
        {/* Bazas del compañero (solo si J1 juega este REO y hay equipo) */}
        {isJ1Active(game) && game.irADos !== null && (() => {
          const solo = game.irADos as Seat;
          // Si J1 va solo → no hay compañero que mostrar
          if (solo === 0) return null;

          // J1 está en equipo: su compañero es el activo que no es el solo ni él
          const teammate = game.activos.find(s => s !== solo && s !== 0) ?? null;
          if (teammate === null) return null;

          return (
            <div>
              <h3 style={{ margin: "12px 0 6px" }}>Bazas de tu compañero (J{teammate + 1})</h3>
              <div style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 64,
                overflowX: "auto",
                overflowY: "hidden",
                padding: "8px 10px",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                background: "rgba(0,0,0,0.2)",
                whiteSpace: "nowrap",
              }}>
                {game.bazasPorJugador[teammate].length === 0 ? (
                  <span style={{ opacity: 0.7 }}>Tu compañero aún no ha ganado bazas</span>
                ) : (
                  game.bazasPorJugador[teammate].map((baza, i) => {
                    const pts = baza.reduce((s, c) => s + (c.num === 1 ? 11 : c.num === 3 ? 10 : c.num === 12 ? 4 : c.num === 11 ? 3 : c.num === 10 ? 2 : 0), 0);
                    return (
                      <div key={i} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                          title={`Baza ${i + 1} • ${pts} puntos`}>
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 10px", borderRadius: 999,
                          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)"
                        }}>
                          <span style={{ fontSize: 12, opacity: 0.9, marginRight: 2 }}>Baza {i + 1}</span>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {baza.map((c, j) => (
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

        

        {/* DER: SIDEBAR */}
        <aside className="sidebar">
          <h3 style={{ marginTop: 0 }}>Puntos</h3>
          {[0,1,2,3].map(s => (
            <div key={s} className={`pill ${game.perdedores.includes(s as Seat) ? "loser" : ""}`}>
              <strong>J{s+1}:</strong> {game.jugadores[s as Seat].puntos}
              {dealer === s && <span style={{ marginLeft:8, opacity:.8 }}>(dealer)</span>}
            </div>
          ))}

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Estado</h4>
          <div className="pill">
            <div><strong>Estado:</strong> {game.status}</div>
            <div><strong>Dealer:</strong> J{dealer+1}</div>
            <div><strong>Activos:</strong> {activos.map(x => `J${x+1}`).join(", ") || "—"}</div>
            <div><strong>Turno:</strong> {game.status === "jugando" ? `J${turno+1}` : "—"}</div>
            <div><strong>Baza:</strong> {game.bazaN + 1}</div>
          </div>

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Piedras</h4>
          {([0,1,2,3] as Seat[]).map(s => {
            const val = game.piedras[s];
            const out = val <= 0;
            return (
              <div
                key={s}
                className={`pill ${out ? "stoneOut" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}
                title={out ? "Sin piedras" : `${val} piedras`}
              >
                <span>
                  <strong>J{s+1}:</strong> {val} {val > 0 ? "●".repeat(Math.min(val, 12)) : "—"}
                </span>
              </div>
            );
          })}

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Log (últimos)</h4>
          <div className="pill" style={{ maxHeight: 220, overflow:"auto", fontFamily:"monospace", fontSize:12 }}>
            {game.reoLog.slice(-8).map((e, i) => <div key={i}>{JSON.stringify(e)}</div>)}
          </div>
        </aside>
      </div>

      {/* Overlay: Decisión ir a los dos (J1) */}
      <OverlayDecision
        visible={showDecision}
        onYes={() => {
          // J1 declara
          setShowDecision(false);
          setGame(prev => dispatch(prev, { type: "declareIrADos", seat: 0 }));
        }}
        onNo={() => {
          // J1 NO quiere. Evaluamos si alguna IA quiere ir a los dos.
          setShowDecision(false);
          window.setTimeout(() => {
            setGame(prev => {
              if (prev.status !== "decidiendo_irados") return prev;
              // Dar oportunidad a cada IA activa (no J1)
              const candidatos = prev.activos.filter(s => s !== 0);
              for (const seat of candidatos) {
                if (iaDebeIrADos(prev, seat)) {
                  return dispatch(prev, { type: "declareIrADos", seat });
                }
              }
              // Nadie quiere → lockNoIrADos
              return dispatch(prev, { type: "lockNoIrADos" });
            });
          }, 800);
        }}
      />

      {/* Modal Resumen: visible cuando el motor está en 'resumen' y no lo hemos ocultado con "Cerrar" */}
      <ResumenModal
        game={game}
        visible={game.status === "resumen" && !hideSummary}
        onClose={() => {
          setHideSummary(true);

          if (game.serieTerminada) {
            // SERIE terminada: preguntar piedras antes de reiniciar
            setShowPiedrasChoice(true);
          } else {
            // REO: planificamos dealer rotado y marcamos tipo 'reo'
            const nextDealer = ((game.dealer + 3) % 4) as Seat;
            setPlannedDealer(nextDealer);
            setRestartKind("reo");
            setAutoRestartSeconds(5);
          }
        }}
      />

      {/* Snackbar con cuenta atrás de reinicio */}
      {autoRestartSeconds !== null && (
        <div style={{
          position: "fixed",
          left: "50%",
          bottom: 20,
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.80)",
          color: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.25)",
          zIndex: 100001,
          display: "flex",
          gap: 10,
          alignItems: "center"
        }}>
          {restartKind === "serie" ? (
            <>
              <span>
                <strong>Nueva PARTIDA</strong> en {autoRestartSeconds}s…
                {plannedDealer !== null && (
                  <> Dealer inicial: <strong>J{(plannedDealer as number) + 1}</strong></>
                )}
              </span>
            </>
          ) : (
            <span>Reiniciando REO en {autoRestartSeconds}s…</span>
          )}

          {/* Botón de cancelar solo en REO (opcional). En SERIE lo quitamos para evitar incoherencias. */}
          {restartKind !== "serie" && (
            <button
              onClick={() => {
                setAutoRestartSeconds(null);
                setRestartKind(null);
                setPlannedDealer(null);
                setHideSummary(false);
              }}
              style={{
                marginLeft: 10, padding: "4px 8px", borderRadius: 6,
                background: "rgba(255,255,255,0.12)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer"
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      )}
      {/* Overlay: Elección de piedras (inicio de serie) */}
      {showPiedrasChoice && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", justifyContent: "center", alignItems: "center", zIndex: 99999
        }}>
          <div style={{
            background: "rgba(255,255,255,0.95)", padding: "28px 35px", borderRadius: 12,
            border: "2px solid rgba(0,0,0,0.25)", boxShadow: "0 8px 45px rgba(0,0,0,0.35)",
            textAlign: "center", minWidth: 300, color: "#111"
          }}>
            <h2 style={{ marginTop: 0 }}>Nueva partida</h2>
            <p style={{ marginBottom: 20 }}>¿A cuántas piedras quieres jugar?</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
              <button
                style={{ padding: "12px 28px", fontSize: 18, borderRadius: 8, fontWeight: 700 }}
                onClick={() => iniciarNuevaSerie(3)}
              >
                3 Piedras
              </button>
              <button
                style={{ padding: "12px 28px", fontSize: 18, borderRadius: 8, fontWeight: 700 }}
                onClick={() => iniciarNuevaSerie(5)}
              >
                5 Piedras
              </button>
            </div>
          </div>
        </div>
      )}

  {showSim && ReactDOM.createPortal(
    <Simulador4
      visible={showSim}
      onClose={() => setShowSim(false)}
      send={send}
      defaultDealer={game.dealer} // para arrancar con el dealer actual seleccionado
    />,
    document.body
  )}
    </>
  );
}
