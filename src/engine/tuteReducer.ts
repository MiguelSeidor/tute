import { type GameEvent, type GameState, GameError, type Seat, type Card, type Palo, PUNTOS, FUERZA } from "./tuteTypes";
import { startRound } from "./tuteInit";
import { puedeJugar, ganadorDeMesa, fuerzaIdx } from "./tuteLogic";


const TUTE_POINTS = 100;   // cambia si tu variante usa otro valor
const TUTE_ENDS_REO = false; // si true, cantar tute cierra el REO inmediatamente

export function dispatch(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "startRound": {
      const base = event.dealer !== undefined ? { ...state, dealer: event.dealer } : state;
      const rng = (event.rngSeed !== undefined) ? mulberry32(event.rngSeed) : Math.random;
      return startRound(base, rng as any, event.preset);
    }

    case "declareIrADos": {
      mustState(state, "decidiendo_irados");
      if (!state.activos.includes(event.seat)) throw new GameError("irados_invalido", "Solo un activo puede ir a los dos.");
      // Fijar irADos; pasar a jugando
      return {
        ...state,
        irADos: event.seat,
        status: "jugando",
        reoLog: [...state.reoLog, { t: "irADos", seat: event.seat, turno: -1 } as const],
      };
    }

    case "lockNoIrADos": {
      // Permite salir de "decidiendo_irados" cuando nadie declara.
      if (state.status !== "decidiendo_irados") return state;
      return {
        ...state,
        status: "jugando",
        // Opcional: podrías logear algún evento si lo deseas
        // reoLog: [...state.reoLog, { t: "startPlayingNoIrados" } as any],
      };
    }

    case "cambiar7": {
      mustState(state, "decidiendo_irados", "jugando");
      const seat = event.seat;
      if (!state.activos.includes(seat)) throw new GameError("cambiar7_invalido", "Solo un activo puede cambiar 7.");
      const triunfo = state.triunfo;
      if (!triunfo) throw new GameError("sin_triunfo", "No hay triunfo fijado.");
      if (triunfo.num === 7) throw new GameError("ya_es_7", "La muestra ya es 7.");
      const p = state.jugadores[seat];
      if (p.haJugadoAlMenosUna) throw new GameError("tarde", "Solo puedes cambiar antes de tu primera carta.");
      const tiene7 = p.mano.some(c => c.palo === triunfo.palo && c.num === 7);
      if (!tiene7) throw new GameError("no_tiene_7", "No tienes el 7 del palo de triunfo.");

      // Hacer swap: quitar 7 de la mano y meter la carta de triunfo; nueva muestra = 7
      const manoNueva = p.mano.filter(c => !(c.palo === triunfo.palo && c.num === 7));
      manoNueva.push(triunfo);
      const jugadores = structuredClone(state.jugadores);
      jugadores[seat].mano = ordenarMano(manoNueva);

      const nuevoTriunfo: Card = { palo: triunfo.palo, num: 7 };
      return {
        ...state,
        jugadores,
        triunfo: nuevoTriunfo,
        reoLog: [...state.reoLog, { t: "cambio7", seat, turno: -1, quita: triunfo, pone: nuevoTriunfo } as const],
      };
    }

    case "cantar": {
      mustState(state, "jugando");
      const { seat, palo, puntos } = event;

      // ⛔ Solo jugadores activos, nunca el dealer
      if (!state.activos.includes(seat)) {
        throw new GameError("no_activo", "Este seat no está activo en el REO.");
      }

      // ⛔ Solo el ganador de la última baza, ANTES de tirar en la baza siguiente:
      //    - mesa debe estar vacía (acabamos de resolver)
      //    - es su turno (va a salir)
      //    - coincide con ultimoGanadorBaza
      if (state.mesa.length !== 0) {
        throw new GameError("momento", "Se canta inmediatamente tras ganar baza y antes de tirar.");
      }
      if (state.turno !== seat) {
        throw new GameError("no_turno_cantar", "Solo quien sale puede cantar.");
      }
      if (state.ultimoGanadorBaza !== seat) {
        throw new GameError("no_ganador", "Solo el ganador de la última baza puede cantar.");
      }

      // ⛔ No repetir palo
      if (state.cantesCantados[seat][palo]) {
        throw new GameError("cante_repetido", "Ese palo ya se ha cantado.");
      }

      // ✔ Debe tener Rey (12) y Caballo (11) del palo en la mano actual
      const mano = state.jugadores[seat].mano;
      const tieneRey  = mano.some(c => c.palo === palo && c.num === 12);
      const tieneCab  = mano.some(c => c.palo === palo && c.num === 11);
      if (!tieneRey || !tieneCab) {
        throw new GameError("sin_pareja", "No tienes Rey+Caballo de ese palo.");
      }

      // ✔ Puntuación correcta según triunfo
      const triunfoPalo = state.triunfo?.palo as Palo;
      const esperado = palo === triunfoPalo ? 40 : 20;
      if (puntos !== esperado) {
        throw new GameError("puntos_invalidos", "Puntuación no válida para ese palo.");
      }

      // Aplica puntos y marca cante
      const jugadores = structuredClone(state.jugadores);
      jugadores[seat].puntos += puntos;

      const cantesCantados = structuredClone(state.cantesCantados);
      cantesCantados[seat][palo] = true;

      console.log(`[DEBUG] Cante aplicado: seat=${seat}, palo=${palo}, estado:`, cantesCantados[seat]); // para debug

      return {
        ...state,
        jugadores,
        cantesCantados,
        reoLog: [...state.reoLog, { t: "cante", seat, turno: state.bazaN, palo, puntos } as const],
      };
    }

    case "cantarTute": {
      mustState(state, "jugando");
      const seat = event.seat;

      // Solo activos
      if (!state.activos.includes(seat)) {
        throw new GameError("no_activo", "Este seat no está activo en el REO.");
      }

      // Solo tras ganar la baza anterior y con mesa vacía
      if (state.mesa.length !== 0) {
        throw new GameError("momento", "El TUTE se canta tras ganar baza y antes de tirar.");
      }
      if (state.turno !== seat) {
        throw new GameError("no_turno_cantar", "Solo quien sale puede cantar TUTE.");
      }
      if (state.ultimoGanadorBaza !== seat) {
        throw new GameError("no_ganador", "Solo el ganador de la última baza puede cantar TUTE.");
      }
      if (state.cantesTuteCantado[seat]) {
        throw new GameError("tute_repetido", "Ya has cantado TUTE.");
      }

      // Comprobar 4 reyes o 4 caballos
      const mano = state.jugadores[seat].mano;
      const tengo4Reyes = ["oros","copas","espadas","bastos"].every(
        p => mano.some(c => c.palo === p && c.num === 12)
      );
      const tengo4Caballos = ["oros","copas","espadas","bastos"].every(
        p => mano.some(c => c.palo === p && c.num === 11)
      );
      if (!tengo4Reyes && !tengo4Caballos) {
        throw new GameError("sin_tute", "No tienes los 4 Reyes ni los 4 Caballos.");
      }

      const kind = tengo4Reyes ? "reyes" : "caballos";

      const jugadores = structuredClone(state.jugadores);
      const piedrasPrev = state.piedras;

      // --- APLICAR REGLA VALENCIANA ---
      // SIN sumar puntos  ❌
      // Aplicar penalización a piedras  ✔
      // Cerrar REO si corresponde       ✔

      let piedrasNext = { ...piedrasPrev };
      let perdedores: Seat[] = [];
      let serieTerminada = state.serieTerminada;

      if (state.irADos === null) {
        // Caso normal: el que canta gana → los otros dos pierden 1 piedra
        const otros = state.activos.filter(s => s !== seat);
        otros.forEach(s => piedrasNext[s] = Math.max(0, piedrasNext[s] - 1));
        perdedores = otros;
      } else {
        const solo = state.irADos;
        const team = state.activos.filter(s => s !== solo);

        if (seat === solo) {
          // El solo canta TUTE → equipo pierde 1 piedra cada uno. El REO CONTINÚA.
          team.forEach(s => piedrasNext[s] = Math.max(0, piedrasNext[s] - 1));
          perdedores = []; // el REO sigue
        } else {
          // Contra el solo → el solo pierde 2 piedras y se cierra el REO
          piedrasNext[solo] = Math.max(0, piedrasNext[solo] - 2);
          perdedores = [solo];
        }
      }

      // Detectar fin de serie
      const cero = (Object.keys(piedrasNext) as unknown as Seat[])
        .filter(s => piedrasNext[s] <= 0);

      if (cero.length > 0) serieTerminada = true;

      const cantesTuteCantado = { ...state.cantesTuteCantado, [seat]: true };

      const logEntry = { t: "tute", seat, turno: state.bazaN, kind, puntos: 0 } as const;

      // Cerrar REO si procede
      const status = (state.irADos !== null && seat !== state.irADos)
        ? "resumen" // TUTE contra el solo → se cierra
        : state.status;
      
      const cantesCantados = { ...state.cantesCantados };

      return {
        ...state,
        jugadores,
        piedras: piedrasNext,
        cantesTuteCantado,
        cantesCantados,
        perdedores,
        status,
        serieTerminada,
        reoLog: [
          ...state.reoLog,
          { t: "tute", seat, turno: state.bazaN, kind, puntos: 0 } as const,
          ...(serieTerminada ? [{ t: "finalizarSerie", seatsCero: cero } as const] : []),
          ...(status === "resumen" ? [{ t: "finalizarReo", perdedores } as const] : []),
        ],
      };
    }

    case "jugarCarta": {
      mustState(state, "jugando");
      const { seat, card } = event;
      if (seat !== state.turno) throw new GameError("fuera_de_turno", "No es tu turno.");
      if (!state.activos.includes(seat)) throw new GameError("no_activo", "Este seat no está activo en el REO.");

      const p = state.jugadores[seat];
      const mano = p.mano;
      const triunfoPalo = state.triunfo?.palo as Palo;
      if (!mano.some(c => c.palo === card.palo && c.num === card.num)) {
        throw new GameError("no_en_mano", "Esa carta no está en tu mano.");
      }
      // Legalidad
      const legales = mano.filter(c => puedeJugar(c, mano, state.mesa, triunfoPalo));
      const esLegal = legales.some(c => c.palo === card.palo && c.num === card.num);
      if (!esLegal) throw new GameError("ilegal", "Movimiento ilegal.");

      // Aplicar jugada
      const jugadores = structuredClone(state.jugadores);
      jugadores[seat].mano = ordenarMano(mano.filter(c => !(c.palo === card.palo && c.num === card.num)));
      jugadores[seat].haJugadoAlMenosUna = true;

      const mesa = [...state.mesa, { seat, card }];

      // Siguiente turno = siguiente activo
      const nxt = nextTurn(state.activos, seat);
      const s1: GameState = {
        ...state,
        jugadores,
        mesa,
        turno: nxt, // Provisional; la UI lanzará resolverBaza en 350–600 ms
        reoLog: [...state.reoLog, { t: "jugar", seat, turno: state.bazaN, carta: card } as const],
      };

      return s1;
    }

    case "resolverBaza": {
      mustState(state, "jugando");
      if (state.mesa.length !== 3) throw new GameError("mesa_incompleta", "Faltan cartas para resolver.");
      return resolverBazaInner(state);
    }

    case "finalizarReo": {
      // Cierre manual (si tu UI lo necesita)
      if (state.status !== "jugando" && state.status !== "resumen") return state;
      // En este MVP, asumimos que perdedores ya están calculados donde toque.
      return {
        ...state,
        status: "resumen",
        reoLog: [...state.reoLog, { t: "finalizarReo", perdedores: state.perdedores } as const],
      };
    }

    case "resetSerie": {
      // Reinicia la serie: piedras al valor inicial, limpia flags de serie.
      // Dealer: por defecto lo dejamos como esté; si prefieres reiniciar dealer a 0, te indico abajo.
      const piedrasInicial = state.seriePiedrasIniciales ?? 5;
      const piedras: Record<Seat, number> = { 0: piedrasInicial, 1: piedrasInicial, 2: piedrasInicial, 3: piedrasInicial };

      // Limpieza de estado de REO/serie sin tocar dealer (o reseteándolo si quisieras)
      return {
        ...state,
        status: "inicial",                 // vuelve a "inicial"
        jugadores: {
          0: { ...state.jugadores[0], mano: [], puntos: 0, fallos: { oros:false,copas:false,espadas:false,bastos:false }, haJugadoAlMenosUna: false },
          1: { ...state.jugadores[1], mano: [], puntos: 0, fallos: { oros:false,copas:false,espadas:false,bastos:false }, haJugadoAlMenosUna: false },
          2: { ...state.jugadores[2], mano: [], puntos: 0, fallos: { oros:false,copas:false,espadas:false,bastos:false }, haJugadoAlMenosUna: false },
          3: { ...state.jugadores[3], mano: [], puntos: 0, fallos: { oros:false,copas:false,espadas:false,bastos:false }, haJugadoAlMenosUna: false },
        },
        activos: [],
        turno: state.dealer,
        salidor: state.dealer,
        bazaN: 0,
        triunfo: null,
        mesa: [],
        bazasPorJugador: { 0: [], 1: [], 2: [], 3: [] },
        perdedores: [],
        irADos: null,
        piedras,                           // ⬅️ piedras reset
        serieTerminada: false,             // ⬅️ limpiar flag
        reoLog: [],                        // ⬅️ nueva serie, nuevo log
      };
    }

    default:
      return state;
  }
}

// ------------------------ Helpers internos reducer ------------------------

export function ordenarMano(mano: Card[]) {
  const paloOrden: Record<Palo, number> = { oros: 0, copas: 1, espadas: 2, bastos: 3 };
  return [...mano].sort((a, b) => {
    if (a.palo !== b.palo) return paloOrden[a.palo] - paloOrden[b.palo];
    // FUERZA: índice menor = carta más fuerte → así salen 1,3,12,11,10,7,6 (mayor a menor)
    return FUERZA.indexOf(a.num) - FUERZA.indexOf(b.num);
  });
}

function mustState(state: GameState, ...allowed: GameState["status"][]) {
  if (!allowed.includes(state.status)) {
    throw new GameError("estado_invalido", `Evento no permitido en estado ${state.status}`);
  }
}

function nextTurn(activos: Seat[], current: Seat): Seat {
  const idx = activos.indexOf(current);
  return activos[(idx + 1) % activos.length];
}

function resolverBazaInner(state: GameState): GameState {
  if (!state.triunfo) {
    throw new GameError("sin_triunfo", "No hay triunfo fijado al resolver la baza.");
  }
  const triunfoPalo = state.triunfo.palo;

  const { ganador, puntos } = ganadorDeMesa(state.mesa, triunfoPalo);

  const jugadores = structuredClone(state.jugadores);


  const bazasPorJugador = {
    0: state.bazasPorJugador[0].map(b => [...b]),
    1: state.bazasPorJugador[1].map(b => [...b]),
    2: state.bazasPorJugador[2].map(b => [...b]),
    3: state.bazasPorJugador[3].map(b => [...b]),
  } as Record<Seat, Card[][]>;

  const bazaGanada = state.mesa.map(x => ({ palo: x.card.palo, num: x.card.num }));
  bazasPorJugador[ganador] = [...bazasPorJugador[ganador], bazaGanada];

  jugadores[ganador].puntos += puntos;

  const logEntry = { t: "resolverBaza", turno: state.bazaN, ganador, cartas: state.mesa, puntos } as const;

  const bazaN = state.bazaN + 1;
  const ultima = bazaN === 9; // 9 bazas en juego a 3 jugadores activos

  let s1: GameState = {
    ...state,
    jugadores,
    bazasPorJugador,
    mesa: [],
    turno: ganador,
    salidor: ganador,
    bazaN,
    ultimoGanadorBaza: ganador,
    reoLog: [...state.reoLog, logEntry],
  };

  if (ultima) {
    // 10 de monte
    jugadores[ganador].puntos += 10;

    let perdedores: Seat[] = [];

    if (state.irADos === null) {
      // ✔ Caso normal (sin ir a los dos): perdedores = min entre activos
      const activos = s1.activos;
      const ptsActivos = activos.map(seat => ({ seat, pts: jugadores[seat].puntos }));
      const min = Math.min(...ptsActivos.map(x => x.pts));
      perdedores = ptsActivos.filter(x => x.pts === min).map(x => x.seat);
    } else {
      // ✔ Caso ir a los dos: solo vs equipo
      const solo = state.irADos as Seat;
      const team = s1.activos.filter(s => s !== solo) as Seat[];
      const soloPts = jugadores[solo].puntos;
      const teamPts = jugadores[team[0]].puntos + jugadores[team[1]].puntos;

      if (soloPts > teamPts) {
        perdedores = team;
      } else if (soloPts < teamPts) {
        perdedores = [solo];
      } else {
        // Empate: decide quien gana la última baza
        perdedores = (ganador === solo) ? team : [solo];
      }
    }

    // 🔻 Piedras: deltas según perdedores e irADos
    let piedrasDeltas: { seat: Seat; delta: number }[] = [];

    if (state.irADos === null) {
      piedrasDeltas = perdedores.map(seat => ({ seat, delta: -1 as const }));
    } else {
      const solo = state.irADos as Seat;
      const team = s1.activos.filter(s => s !== solo) as Seat[];
      const perdioSolo = perdedores.length === 1 && perdedores[0] === solo;
      const perdioEquipo = perdedores.length === 2 && perdedores.includes(team[0]) && perdedores.includes(team[1]);

      if (perdioSolo) {
        piedrasDeltas = [{ seat: solo, delta: -2 as const }];
      } else if (perdioEquipo) {
        piedrasDeltas = [
          { seat: team[0], delta: -1 as const },
          { seat: team[1], delta: -1 as const },
        ];
        if (SOLO_BONUS_ON_TEAM_WIN) {
          piedrasDeltas.push({ seat: solo, delta: +2 as const });
        }
      }
    }

    const piedrasNext = applyPiedras(s1.piedras, piedrasDeltas);
    // ⬇️ Detectar fin de serie: si algún seat ≤ 0
    const seatsCero = (Object.keys(piedrasNext) as unknown as Seat[])
      .filter(s => piedrasNext[s] <= 0);

    const serieTerminada = seatsCero.length > 0;


    s1 = {
      ...s1,
      status: "resumen",
      perdedores,
      piedras: piedrasNext,
      serieTerminada,
      reoLog: [
        ...s1.reoLog,
        { t: "piedras", deltas: piedrasDeltas } as const,
        ...(serieTerminada ? [{ t: "finalizarSerie", seatsCero } as const] : []),
        { t: "finalizarReo", perdedores } as const
      ],
    };
  }

  return s1;
}

const SOLO_BONUS_ON_TEAM_WIN = true; // ⬅️ pon a false si NO quieres +2 al solo cuando gana al equipo

function clampStone(n: number) {
  return Math.max(0, n|0);
}

function applyPiedras(
  current: Record<Seat, number>,
  deltas: { seat: Seat; delta: number }[]
): Record<Seat, number> {
  const next = { ...current };
  for (const { seat, delta } of deltas) {
    const prev = next[seat] ?? 0;
    next[seat] = clampStone(prev + delta);
  }
  return next;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

