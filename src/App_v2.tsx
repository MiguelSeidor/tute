
// src/App_v2.tsx
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { initGame } from "./engine/tuteInit";
import { dispatch } from "./engine/tuteReducer";
import type { GameEvent, GameState, Seat, Card, Palo } from "./engine/tuteTypes";
import { Carta, MesaVisual } from "./ui/Primitives";
import { iaEligeCarta, iaDebeIrADos, iaDebeCambiar7, iaDebeTirarselas } from "./engine/tuteIA";
import { GameError } from "./engine/tuteTypes";
import { puedeJugar } from "./engine/tuteLogic";
import Simulador4 from "./ui/Simulador4";
import { useAuth } from "./context/AuthContext";
import { useSocket } from "./context/SocketContext";
import { AuthForm } from "./components/AuthForm";
import { LobbyScreen } from "./components/LobbyScreen";
import { OnlineGameScreen } from "./components/OnlineGameScreen";
import { StatsScreen } from "./components/StatsScreen";

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
  "De rey parriba",
  "Llevo un juegazo",
  "Hasta el más tonto hace relojes",
  "Muy mal se tié que dar",
  "Esto es remar pa morir en la orilla",
  "No te echa ni un manguito",
];


const FRASE_RIVAL_CANTE = "No.. si tos cantaremos";

type GameMode = "offline" | "online" | "stats" | null;

// Componente separado para el modo online (necesita useAuth y useSocket hooks)
function OnlineScreen({ bodyStyle, onBack }: { bodyStyle: string; onBack: () => void }) {
  const { user, loading } = useAuth();
  const { currentRoom, gameState } = useSocket();

  if (loading) {
    return (
      <>
        <style>{bodyStyle}</style>
        <div className="mode-screen" style={{ gap: 24 }}>
          <p style={{ fontSize: "1.2rem", opacity: 0.8 }}>Cargando...</p>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <style>{bodyStyle}</style>
        <AuthForm onBack={onBack} />
      </>
    );
  }

  // In a game
  if (currentRoom?.status === 'playing' && gameState) {
    return <OnlineGameScreen onLeave={onBack} />;
  }

  // Lobby
  return (
    <>
      <style>{bodyStyle}</style>
      <LobbyScreen onBack={onBack} />
    </>
  );
}

export default function App_v2() {
  const { user, logout } = useAuth();
  const [gameMode, setGameMode] = useState<GameMode>(null);

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

  // ── Preload all card images on mount ──
  React.useEffect(() => {
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
  const [showBazas, setShowBazas] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status, game.activos]);

  // === BOCADILLO: "Tengo salida" — el salidor lo dice al empezar a jugar ===
  const prevStatusRef = React.useRef(game.status);
  React.useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = game.status;

    // Detectar transición a "jugando" (desde decidiendo_irados o inicial)
    if (game.status === "jugando" && prev !== "jugando") {
      const salidor = game.salidor;
      // Solo IA dice la frase automáticamente (J1 la tiene en el dropdown)
      if (!seatsHumanos.includes(salidor)) {
        // ~40% de probabilidad para no ser repetitivo
        if (Math.random() < 0.4) {
          window.setTimeout(() => {
            mostrarBocadillo(salidor, "Tengo salida");
          }, 600);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status, game.salidor]);

  // === BOCADILLO: frases condicionales (cantes, tute, tirárselas, piedras) ===
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

      // TUTE: el cantante pregunta antes "¿Cuántos caballos/reyes tenéis?"
      if (e.t === "tute") {
        const singer = e.seat as Seat;
        const frase = e.kind === "caballos"
          ? "¿Cuántos caballos tenéis?"
          : "¿Cuántos reyes tenéis?";
        mostrarBocadillo(singer, frase);
        return;
      }

      // Piedras: "Ha perdido un rico" cuando alguien con ≥3 piedras pierde
      if (e.t === "piedras") {
        const deltas = (e as any).deltas as { seat: number; delta: number }[];
        for (const d of deltas) {
          if (d.delta < 0) {
            // Calcular piedras que tenía ANTES de perder
            const piedrasAhora = game.piedras[d.seat as Seat];
            const piedrasAntes = piedrasAhora - d.delta; // delta es negativo, así que sumamos
            if (piedrasAntes >= 3) {
              // Un rival aleatorio dice la frase
              const otros = game.activos.filter(s => s !== d.seat);
              if (otros.length > 0) {
                const quien = otros[Math.floor(Math.random() * otros.length)];
                window.setTimeout(() => {
                  mostrarBocadillo(quien, "Ha perdido un rico");
                }, 1200);
              }
              break; // solo una vez por evento
            }
          }
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.reoLog]);

  React.useEffect(() => {
    // Evitar reentradas
    if (aiBusyRef.current) return;

    // Si el humano (J1) está activo y estamos decidiendo → NO actúa la IA
    const humanMustDecide =
      game.status === "decidiendo_irados" &&
      game.activos.includes(0 as Seat);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // Mostrar overlay si estamos en "decidiendo_irados" y J1 es activo
  React.useEffect(() => {
    const isDecidiendo = game.status === "decidiendo_irados";
    const j1Activo = game.activos.includes(0);
    setShowDecision(isDecidiendo && j1Activo);
  }, [game.status, game.activos]);

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch { /* ignore */ }
  }, []);

  // Persistir en localStorage
  React.useEffect(() => {
    if (RESET_ON_REFRESH) return;
    try {
      localStorage.setItem("tv2_destapado", JSON.stringify(modoDestapado));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch { /* ignore */ }

    // Mostrar selector de piedras antes de empezar
    setShowPiedrasChoice(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    hideHand = false,
  }: {
    seat: Seat;
    game: GameState;
    send: (ev: GameEvent) => void;
    revealAll?: boolean;
    hideHand?: boolean;
  }) {
    const dealer = game.dealer;
    const isDealer = dealer === seat;
    const mano = game.jugadores[seat].mano;
    const activos = game.activos;

    const isEliminated = (game.eliminados ?? []).includes(seat);

    return (
      <div style={{ textAlign: "center", minWidth: 'clamp(60px, 18vw, 200px)' }}>
        <div className="playerHeaderLine">
          <span>J{seat + 1}</span>
          <span className={`badge ${game.perdedores.includes(seat) ? 'badge--loser' : ''}`}
            style={game.perdedores.includes(seat) ? { background: 'rgba(255,60,60,0.3)', borderColor: 'rgba(255,60,60,0.6)', color: '#ff6b6b' } : {}}>
            {game.jugadores[seat].puntos} pts
          </span>
          {isDealer && <span className="badge badge--dealer">🎴</span>}
          {game.irADos === seat && <span className="badge badge--solo">Solo</span>}
          {isEliminated && <span className="badge badge--eliminated">Eliminado</span>}
          {!activos.includes(seat) && !isDealer && !isEliminated && (
            <span style={{ opacity: 0.7, fontSize: '0.75em' }}>(No juega)</span>
          )}
        </div>
        <div className="piedras-dots" style={{
          opacity: isEliminated ? 0.4 : 1, lineHeight: 1,
          display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap',
        }}>
          {game.piedras[seat] > 0
            ? Array.from({ length: Math.min(game.piedras[seat], 12) }).map((_, i) => (
                <img key={i} src="/cartas/piedra.png" alt="piedra" style={{ width: 'clamp(10px, 2.5vw, 16px)', height: 'auto' }} />
              ))
            : <span style={{ color: '#ff6b6b', fontSize: 'clamp(8px, 2vw, 11px)' }}>✕</span>}
        </div>

        <div className="playerActionLine">
          {lastActionBySeat[seat] || ""} {/* ✅ ahora seat es Seat, no any */}
        </div>

        {!hideHand && (
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
            <HandRow
              seat={seat}
              cards={mano as Card[]}
              interactive={
                seat === 0 &&
                game.status === "jugando" &&
                game.turno === 0 &&
                game.activos.includes(0 as Seat)
              }
              isLegalCard={(card) => isLegalCardForJ1(game, card)}
              onPlay={(c) => {
                if (!isLegalCardForJ1(game, c)) return;
                send({ type: "jugarCarta", seat: 0, card: c });
              }}
              revealAll={!!revealAll}
            />
          </div>
        )}
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
    const isMe = seat === (0 as Seat);

    // Auto-scale for J1 hand (same approach as online)
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = React.useState(1);

    React.useLayoutEffect(() => {
      if (!isMe) return;
      const el = containerRef.current;
      if (!el) return;
      const containerW = el.clientWidth || 0;
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) return;
      const scrollW = inner.scrollWidth;
      const s = containerW > 0 && scrollW > containerW ? containerW / scrollW : 1;
      setScale(Math.max(0.85, s));
    }, [isMe, cards.length]);

    if (isMe) {
      // === J1: solo cartas reales, gap responsive, auto-escala (como online) ===
      return (
        <div ref={containerRef} className="handRow" style={{ overflow: "hidden", minHeight: "var(--card-h)" }}>
          <div style={{
            display: "flex", justifyContent: "center", flexWrap: "nowrap",
            gap: "clamp(2px, 1vw, 6px)",
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "center bottom",
          }}>
            {cards.length === 0 ? (
              <span style={{ opacity: 0.5, alignSelf: "center" }}>Sin cartas</span>
            ) : cards.map((card) => {
              const legal = interactive && (isLegalCard ? isLegalCard(card) : true);
              return (
                <Carta
                  key={`${card.palo}-${card.num}`}
                  carta={card}
                  legal={legal}
                  onClick={() => legal && onPlay?.(card)}
                />
              );
            })}
          </div>
        </div>
      );
    }

    // === NPCs: overlapping fan, cards shrink to fit ===
    return (
      <div style={{ display: "flex", justifyContent: "center", minHeight: "calc(var(--npc-card-w) * 1.45)" }}>
        <div className="npc-card-fan">
          {cards.map((card, i) => {
            if (revealAll) {
              return (
                <Carta
                  key={i}
                  carta={card}
                  legal={false}
                  style={{ width: "var(--npc-card-w)", margin: 0 }}
                />
              );
            }
            return (
              <Carta
                key={i}
                tapada
                style={{ width: "var(--npc-card-w)", margin: 0 }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // === Tipos auxiliares de cantes
  type CanteOpt = { palo: Palo; puntos: 20 | 40 };

  // ¿Mostrar la barra de acciones de J1?
  function shouldShowActionsForJ1(game: GameState): boolean {
    if (game.status !== "jugando") return false;
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

  function bazaCardPts(c: Card): number {
    const m: Record<number, number> = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };
    return m[c.num] ?? 0;
  }

  function OfflineBazasModal({ game, onClose }: { game: GameState; onClose: () => void }) {
    const myBazas = game.bazasPorJugador[0] || [];
    const myTotal = myBazas.flat().reduce((s, c) => s + bazaCardPts(c), 0);

    let teammate: Seat | null = null;
    let teamBazas: Card[][] = [];
    if (game.irADos !== null && game.irADos !== 0) {
      const solo = game.irADos as Seat;
      teammate = game.activos.find(s => s !== solo && s !== 0) ?? null;
      if (teammate !== null) {
        teamBazas = game.bazasPorJugador[teammate] || [];
      }
    }

    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99997,
      }} onClick={onClose}>
        <div style={{
          width: 'min(600px, 92vw)', maxHeight: '85vh', overflowY: 'auto',
          background: '#13381f', padding: 16, borderRadius: 12, color: 'white',
          border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 10px 60px rgba(0,0,0,0.65)',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Mis bazas ({myBazas.length}) — {myTotal} pts</h3>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', opacity: 0.7,
            }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {myBazas.length === 0 ? (
              <span style={{ opacity: 0.7 }}>Sin bazas aún</span>
            ) : myBazas.map((baza, idx) => {
              const pts = baza.reduce((s, c) => s + bazaCardPts(c), 0);
              return (
                <div key={idx} title={`Baza ${idx + 1} — ${pts} pts`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)',
                }}>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>B{idx + 1}</span>
                  {baza.map((c, j) => <Carta key={j} carta={c} mini style={{ width: 28, margin: 1 }} />)}
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{pts}</span>
                </div>
              );
            })}
          </div>

          {teammate !== null && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Bazas de J{(teammate as number) + 1} ({teamBazas.length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {teamBazas.length === 0 ? (
                  <span style={{ opacity: 0.7 }}>Sin bazas aún</span>
                ) : teamBazas.map((baza, idx) => {
                  const pts = baza.reduce((s, c) => s + bazaCardPts(c), 0);
                  return (
                    <div key={idx} title={`Baza ${idx + 1} — ${pts} pts`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px', borderRadius: 999,
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)',
                    }}>
                      <span style={{ fontSize: 11, opacity: 0.8 }}>B{idx + 1}</span>
                      {baza.map((c, j) => <Carta key={j} carta={c} mini style={{ width: 28, margin: 1 }} />)}
                      <span style={{ fontSize: 11, opacity: 0.6 }}>{pts}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
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
      <div className="resumen-backdrop">
        <div className="resumen-panel">
          <h2 className="resumen-title">Resumen del REO</h2>

          <div style={{ overflowX: "auto" }}>
          <table className="resumen-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Acciones</th>
                <th>J1</th>
                <th>J2</th>
                <th>J3</th>
                <th>J4</th>
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
                    acciones.push(`J${e.seat + 1} cambia 7`);
                  } else if (e.t === "irADos") {
                    acciones.push(`J${e.seat + 1} va a dos`);
                  } else if (e.t === "cante") {
                    acciones.push(`J${e.seat + 1} canta ${e.palo} (${e.puntos})`);
                  } else if (e.t === "tute") {
                    acciones.push(`J${e.seat + 1} TUTE (+${e.puntos})`);
                  } else if (e.t === "tirarselas") {
                    acciones.push(`J${e.seat + 1} se tira`);
                  } else if (e.t === "resolverBaza") {
                    ganadorTurno = e.ganador;
                    acciones.push(`Gana J${e.ganador + 1} (+${e.puntos})`);
                  }
                }

                const cellBg = (seat: number) =>
                  ganadorTurno === seat
                    ? "rgba(0, 200, 120, 0.35)"
                    : game.perdedores.includes(seat as Seat)
                    ? "rgba(255, 0, 0, 0.35)"
                    : "transparent";

                return (
                  <tr key={t}>
                    <td>{t === -1 ? "Ini" : t + 1}</td>
                    <td>{acciones.length ? acciones.join(" | ") : ""}</td>
                    <td style={{ background: cellBg(0) }}>{jugadas[0] || ""}</td>
                    <td style={{ background: cellBg(1) }}>{jugadas[1] || ""}</td>
                    <td style={{ background: cellBg(2) }}>{jugadas[2] || ""}</td>
                    <td style={{ background: cellBg(3) }}>{jugadas[3] || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <div style={{ textAlign: "right", marginTop: 16 }}>
            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 6 }}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

    // ¿J1 juega este REO (está en activos)?
  function isJ1Active(game: GameState): boolean {
    return game.activos.includes(0 as Seat);
  }

  // ¿Es legal que J1 juegue esta carta ahora?
  function isLegalCardForJ1(game: GameState, c: Card): boolean {
    if (game.status !== "jugando") return false;
    if (game.turno !== 0) return false;
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


  // ========================== SHARED BODY STYLES ==========================
  const bodyStyle = `
    body {
      margin: 0;
      background: radial-gradient(1400px 900px at 20% 10%, #2e7d32 0%, #1b5e20 60%, #0f3f14 100%);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
    }
    #root {
      max-width: none;
      padding: 0;
      width: 100%;
    }
    .mode-screen {
      min-height: 100svh;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #fff;
      padding: 24px;
      box-sizing: border-box;
    }
    .mode-btn {
      padding: 24px 48px;
      font-size: clamp(1rem, 2.5vw, 1.3rem);
      font-weight: 700;
      border-radius: 14;
      border: 2px solid rgba(255,255,255,.3);
      background: rgba(255,255,255,.12);
      color: #fff;
      cursor: pointer;
      transition: background .2s, transform .15s;
      min-width: min(220px, 40vw);
      text-align: center;
      border-radius: 14px;
    }
    .mode-btn:hover {
      background: rgba(255,255,255,.25);
      transform: scale(1.04);
    }
    .mode-btn:active {
      transform: scale(0.98);
    }
  `;

  // ========================== MODE SELECTION ==========================
  if (gameMode === null) {
    return (
      <>
        <style>{bodyStyle}</style>
        <div className="mode-screen" style={{ gap: 32 }}>
          <h1 style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", margin: 0, textShadow: "0 3px 12px rgba(0,0,0,.4)", textAlign: "center" }}>
            Tute Parrillano
          </h1>
          <p style={{ opacity: 0.8, margin: 0, fontSize: "clamp(1rem, 2vw, 1.2rem)" }}>Elige modo de juego</p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
            <button className="mode-btn" onClick={() => setGameMode("offline")}>
              Juego Offline
              <div style={{ fontSize: ".85rem", fontWeight: 400, opacity: .7, marginTop: 8 }}>Juega contra la IA</div>
            </button>
            <button className="mode-btn" onClick={() => setGameMode("online")}>
              Juego Online
              <div style={{ fontSize: ".85rem", fontWeight: 400, opacity: .7, marginTop: 8 }}>Juega con amigos</div>
            </button>
            <button className="mode-btn" onClick={() => setGameMode("stats")}>
              Ranking
              <div style={{ fontSize: ".85rem", fontWeight: 400, opacity: .7, marginTop: 8 }}>Estadísticas y clasificación</div>
            </button>
          </div>
          {user && (
            <button
              onClick={() => logout()}
              style={{
                marginTop: 8, padding: "8px 24px", borderRadius: 8, cursor: "pointer",
                background: "rgba(255,60,60,0.2)", color: "#fff", fontSize: "0.9rem",
                border: "1px solid rgba(255,60,60,0.4)",
              }}
            >
              Cerrar sesión ({user.username})
            </button>
          )}
        </div>
      </>
    );
  }

  if (gameMode === "online") {
    return <OnlineScreen bodyStyle={bodyStyle} onBack={() => setGameMode(null)} />;
  }

  if (gameMode === "stats") {
    return (
      <>
        <style>{bodyStyle}</style>
        <StatsScreen onBack={() => setGameMode(null)} />
      </>
    );
  }

  // Render (Offline mode)
  return (
    <>
      <style>{bodyStyle}</style>
      {/* Reutilizamos tu CSS (puedes moverlo a .css cuando quieras) */}
      <style>{`
        :root {
          --card-w: clamp(76px, 3vw, 132px);
          --card-h: calc(var(--card-w) * 1.25);  /* altura aprox. según tus PNG */
          --npc-card-w: 45px;

          /* Cartas en la mesa: un poco más pequeñas para que quepan 3 sin solaparse */
          --mesa-card-w: calc(var(--card-w) * 0.85);
          --mesa-card-h: calc(var(--mesa-card-w) * 1.45);
        }
        .page {
          min-height: 100svh; display: flex; flex-direction: column; gap: 8px;
          padding: 8px; box-sizing: border-box; max-width: 1200px; margin: 0 auto; color: #fff;
        }
        body {
          margin:0;
          background: radial-gradient(1400px 900px at 20% 10%, #2e7d32 0%, #1b5e20 60%, #0f3f14 100%);
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
        }
        .board { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .headerBar { display:flex; align-items:center; justify-content:space-between; gap: 8px; flex-wrap: wrap; }
        .mesaBox { margin:0 auto; width: calc(var(--card-w) * 5.2); height: calc(var(--card-h) * 3.2);
          border-radius:12px; background: rgba(0,0,0,0.2); box-shadow: 0 10px 30px rgba(0,0,0,.25) inset; overflow:hidden; }
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
        .badge--eliminated {
          background: rgba(255,60,60,0.25);
          border-color: rgba(255,60,60,0.5);
          color: #ff6b6b;
        }
        .playerHeaderLine {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-bottom: 4px;
        }
        .playerActionLine {
          font-size: 12px; opacity: .85; min-height: 16px;
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
        .piedras-dots { letter-spacing: 1px; }
        /* NPC cards: overlapping fan */
        .npc-card-fan {
          display: flex;
          align-items: center;
        }
        .npc-card-fan > img {
          margin-left: -12px !important;
          box-shadow: -1px 0 4px rgba(0,0,0,0.4) !important;
          border-radius: 4px !important;
        }
        .npc-card-fan > img:first-child {
          margin-left: 0 !important;
        }
        /* Resumen modal */
        .resumen-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.55);
          display: flex; justify-content: center; align-items: center; z-index: 99998;
        }
        .resumen-panel {
          width: min(900px, 92vw); max-height: 90vh; overflow-y: auto;
          background: #13381f; padding: 20px; border-radius: 12px; color: white;
          border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 10px 60px rgba(0,0,0,0.65);
        }
        .resumen-title { margin-top: 0; font-size: 1.2rem; }
        .resumen-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .resumen-table th { border-bottom: 1px solid #fff; padding: 6px; white-space: nowrap; }
        .resumen-table td { padding: 6px; border-bottom: 1px solid #444; white-space: nowrap; }


        @media (max-width: 600px) {
          :root {
            --card-w: clamp(44px, 11vw, 70px);
            --npc-card-w: 34px;
          }
          .page { padding: 8px; gap: 8px; font-size: 13px; }
          .board { gap: 4px; }
          .mesaBox {
            width: calc(var(--card-w) * 4.5) !important;
            height: calc(var(--card-h) * 2.8) !important;
          }
          .npc-card-fan > img { margin-left: -24px !important; }
          .npc-card-fan > img:first-child { margin-left: 0 !important; }
          .playerHeaderLine { gap: 4px; flex-wrap: wrap; font-size: 12px; }
          .bocadillo { font-size: 11px; padding: 6px 10px; white-space: normal; max-width: 200px; text-align: center; }
          .anuncio-overlay { font-size: 14px !important; padding: 8px 16px !important; white-space: normal !important; max-width: 80% !important; }
          .badge { font-size: 10px; padding: 1px 6px; gap: 4px; }
          .handRow img { margin: 2px !important; }
          .resumen-panel { padding: 12px; }
          .resumen-title { font-size: 1rem; }
          .resumen-table { font-size: 11px; }
          .resumen-table th, .resumen-table td { padding: 4px 3px; }
        }
        @media (max-width: 430px) {
          :root {
            --card-w: clamp(32px, 8.5vw, 44px);
            --npc-card-w: 26px;
          }
          .page { padding: 4px; gap: 4px; font-size: 12px; min-height: auto; }
          .mesaBox {
            width: calc(var(--card-w) * 4.2) !important;
            height: calc(var(--card-h) * 2.6) !important;
          }
          .npc-card-fan > img { margin-left: -18px !important; }
          .npc-card-fan > img:first-child { margin-left: 0 !important; }
          .bocadillo { max-width: 160px; font-size: 10px; padding: 4px 8px; }
          .anuncio-overlay { font-size: 12px !important; padding: 6px 12px !important; }
          .badge { font-size: 9px; }
          .playerHeaderLine { font-size: 11px; margin-bottom: 2px; }
          .handRow img { margin: 0px !important; }
          .resumen-panel { padding: 10px; width: 96vw; }
          .resumen-title { font-size: 0.9rem; margin-bottom: 8px; }
          .resumen-table { font-size: 10px; }
          .resumen-table th, .resumen-table td { padding: 3px 2px; }
        }
      `}</style>

      <div className="page">
        <div className="board">

          {/* Header compacto */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {game.triunfo && (
                <Carta carta={game.triunfo} legal={false} style={{ width: 'clamp(28px, 6vw, 40px)', margin: 0, flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.85rem)', opacity: 0.7 }}>
                  Triunfo: <b>{game.triunfo ? game.triunfo.palo : '—'}</b>
                </div>
                <div style={{ fontSize: 'clamp(0.65rem, 2vw, 0.8rem)', opacity: 0.6 }}>
                  {game.status === 'decidiendo_irados' ? 'Decidiendo IR A DOS...' :
                    game.status === 'jugando' ? `Turno: J${turno + 1}` :
                      game.status === 'resumen' ? 'Resumen del REO' : 'Preparado'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  if (window.confirm('¿Salir de la partida offline y volver al menú principal?')) {
                    if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }
                    setGameMode(null);
                  }
                }}
                style={{
                  background: 'rgba(255,60,60,0.25)', color: '#fff', padding: '3px 10px',
                  borderRadius: 6, cursor: 'pointer', fontSize: 'clamp(0.65rem, 2vw, 0.8rem)',
                  border: '1px solid rgba(255,60,60,0.5)',
                }}
              >
                Salir
              </button>
              <button
                onClick={() => {
                  setGame(prev => ({ ...prev, status: "inicial" as any, mesa: [] }));
                  setShowSim(true);
                  if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }
                }}
                style={{
                  background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '3px 10px',
                  borderRadius: 6, cursor: 'pointer', fontSize: 'clamp(0.65rem, 2vw, 0.8rem)',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              >
                Simular
              </button>
              <button
                onClick={() => send({ type: "startRound" })}
                style={{
                  background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '3px 10px',
                  borderRadius: 6, cursor: 'pointer', fontSize: 'clamp(0.65rem, 2vw, 0.8rem)',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}
              >
                Iniciar
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'clamp(0.6rem, 2vw, 0.75rem)', cursor: 'pointer', opacity: 0.8 }}>
                <input type="checkbox" checked={modoDestapado} onChange={(e) => setModoDestapado(e.target.checked)} />
                Destapado
              </label>
            </div>
          </div>


          {/* TABLERO 4 ESQUINAS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)",
              gridTemplateRows: "auto auto auto",
              gap: "clamp(4px, 1.5vw, 12px)",
              alignItems: "center",
              justifyItems: "center",
            }}
          >
            {/* J3 ARRIBA (seat 2) */}
            <div style={{ gridColumn: "2", gridRow: "1", position: "relative" }}>
              <PlayerBox seat={2} game={game} send={send} revealAll={modoDestapado}/>
              {bocadillos[2] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[2].key}>{bocadillos[2].texto}</div>
              )}
            </div>

            {/* J2 IZQUIERDA (seat 1) */}
            <div style={{ gridColumn: "1", gridRow: "2", position: "relative", justifySelf: "end" }}>
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
            <div style={{ gridColumn: "3", gridRow: "2", position: "relative", justifySelf: "start" }}>
              <PlayerBox seat={3} game={game} send={send} revealAll={modoDestapado}/>
              {bocadillos[3] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[3].key}>{bocadillos[3].texto}</div>
              )}
            </div>

            {/* J1 ABAJO (seat 0) — solo header, mano fuera del grid */}
            <div style={{ gridColumn: "2", gridRow: "3", position: "relative" }}>
              <PlayerBox seat={0} game={game} send={send} revealAll={modoDestapado} hideHand/>
              {bocadillos[0] && (
                <div className="bocadillo bocadillo--below" key={bocadillos[0].key}>{bocadillos[0].texto}</div>
              )}
            </div>
          </div>

          {/* Mano de J1 (fuera del grid para no ensanchar la columna central) */}
          <div style={{ display: "flex", justifyContent: "center", overflow: "hidden", minHeight: "var(--card-h)" }}>
            <HandRow
              seat={0 as Seat}
              cards={game.jugadores[0].mano as Card[]}
              interactive={
                game.status === "jugando" &&
                game.turno === 0 &&
                game.activos.includes(0 as Seat)
              }
              isLegalCard={(card) => isLegalCardForJ1(game, card)}
              onPlay={(c) => {
                if (!isLegalCardForJ1(game, c)) return;
                send({ type: "jugarCarta", seat: 0, card: c });
              }}
              revealAll={!!modoDestapado}
            />
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
              <option value="Tengo salida" style={{ color: "#111" }}>Tengo salida</option>
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
                      send({ type: "cantar", seat: 0, palo: opt.palo, puntos: opt.puntos });
                      setCantesDisponiblesJ1([]);
                      setBloqueaCantesEsteTurno(true);
                    }}
                    title={`Cantar ${opt.palo} (${opt.puntos})`}
                  >
                    Cantar {opt.palo} ({opt.puntos})
                  </button>
                ))}
              </div>
            )}

            {/* Bazas button */}
            {isJ1Active(game) && (
              <button onClick={() => setShowBazas(true)}>
                Bazas ({game.bazasPorJugador[0].length})
              </button>
            )}
          </div>
        )}

        {/* Bazas modal */}
        {showBazas && <OfflineBazasModal game={game} onClose={() => setShowBazas(false)} />}
        </div>
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
            // REO: planificamos dealer rotado (saltando eliminados)
            const CLOCKWISE: Seat[] = [0, 3, 2, 1];
            const eliminados = game.eliminados ?? [];
            const dealerIdx = CLOCKWISE.indexOf(game.dealer);
            let nextDealer = game.dealer;
            for (let i = 1; i <= 4; i++) {
              const candidate = CLOCKWISE[(dealerIdx + i) % CLOCKWISE.length];
              if (!eliminados.includes(candidate)) {
                nextDealer = candidate;
                break;
              }
            }
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
