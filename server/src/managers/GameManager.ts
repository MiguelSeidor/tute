import type { GameState, GameEvent, Seat, GameStateView, Room, Palo } from '@shared/types';
import { initGame } from '@engine/tuteInit';
import { dispatch } from '@engine/tuteReducer';
import { PALOS, CARTAS } from '@engine/tuteTypes';
import { generateCeremonyData, generateCeremony3Data, type AnyCeremonyData } from '@engine/ceremonySorteo';
import { prisma } from '../db/client.js';

const CLOCKWISE: Seat[] = [0, 3, 2, 1];

interface PlayerSeriesStats {
  totalPuntos: number;
  bazasGanadas: number;
  cantes20: number;
  cantes40: number;
  tutes: number;
  vecesIrADos: number;
}

function emptyStats(): PlayerSeriesStats {
  return { totalPuntos: 0, bazasGanadas: 0, cantes20: 0, cantes40: 0, tutes: 0, vecesIrADos: 0 };
}

function calculateElo(myElo: number, oppAvgElo: number, won: boolean): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (oppAvgElo - myElo) / 400));
  return Math.round(myElo + K * ((won ? 1 : 0) - expected));
}

interface GameSession {
  roomId: string;
  roomName: string;
  state: GameState;
  seatToUserId: Record<Seat, string>;
  userIdToSeat: Map<string, Seat>;
  playerNames: Record<Seat, string>;
  resultSaved: boolean;
  startTime: Date;
  seriesStats: Record<Seat, PlayerSeriesStats>;

  // Ir-a-dos phase tracking (server manages per-player turns)
  irADosPending: Seat[];    // active players who haven't decided yet
  irADosCurrent: number;    // index into irADosPending for who decides next

  // Resumen ready tracking — seats that clicked "Listo"
  resumenReady: Set<Seat>;
}

export class GameManager {
  private games = new Map<string, GameSession>();

  createGame(room: Room): { state: GameState; ceremony: AnyCeremonyData } {
    const maxPlayers = room.maxPlayers ?? 4;

    if (room.players.length !== maxPlayers) {
      throw new Error(`Se necesitan exactamente ${maxPlayers} jugadores`);
    }

    const seatToUserId = {} as Record<Seat, string>;
    const userIdToSeat = new Map<string, Seat>();
    const playerNames = {} as Record<Seat, string>;

    let ceremony: AnyCeremonyData;
    let emptySeat: Seat | undefined;

    if (maxPlayers === 3) {
      // Shuffle seats: assign 3 players to 3 random seats out of [0,1,2,3]
      const allSeats = ([0, 1, 2, 3] as Seat[]).sort(() => Math.random() - 0.5);
      const playerSeats = allSeats.slice(0, 3);
      emptySeat = allSeats[3];

      for (let i = 0; i < room.players.length; i++) {
        const p = room.players[i];
        const seat = playerSeats[i];
        seatToUserId[seat] = p.userId;
        userIdToSeat.set(p.userId, seat);
        playerNames[seat] = p.username;
      }
      // Fill empty seat placeholder
      seatToUserId[emptySeat] = '';
      playerNames[emptySeat] = '';

      const c3 = generateCeremony3Data(playerSeats);
      ceremony = { type: '3p', ...c3 };
    } else {
      for (const p of room.players) {
        const seat = p.seat as Seat;
        seatToUserId[seat] = p.userId;
        userIdToSeat.set(p.userId, seat);
        playerNames[seat] = p.username;
      }

      const c4 = generateCeremonyData();
      ceremony = { type: '4p', ...c4 };
    }

    const dealer = ceremony.dealer;
    let state = initGame(room.piedras, dealer, maxPlayers, emptySeat);

    // Start first round
    state = dispatch(state, { type: 'startRound' });

    const session: GameSession = {
      roomId: room.id, roomName: room.name, state, seatToUserId, userIdToSeat, playerNames,
      resultSaved: false,
      startTime: new Date(),
      seriesStats: { 0: emptyStats(), 1: emptyStats(), 2: emptyStats(), 3: emptyStats() } as Record<Seat, PlayerSeriesStats>,
      irADosPending: [...state.activos],
      irADosCurrent: 0,
      resumenReady: new Set(),
    };

    this.games.set(room.id, session);
    return { state, ceremony };
  }

  getSession(roomId: string): GameSession | undefined {
    return this.games.get(roomId);
  }

  getSeatForUser(roomId: string, userId: string): Seat | undefined {
    return this.games.get(roomId)?.userIdToSeat.get(userId);
  }

  processAction(roomId: string, userId: string, event: GameEvent): GameState {
    const session = this.games.get(roomId);
    if (!session) throw new Error('Partida no encontrada');

    const { state, userIdToSeat } = session;
    const mySeat = userIdToSeat.get(userId);
    if (mySeat === undefined) throw new Error('No estás en esta partida');

    // Validate seat ownership for seat-specific actions
    if ('seat' in event) {
      if ((event as any).seat !== mySeat) {
        throw new Error('No puedes actuar por otro jugador');
      }
    }

    // ── Ir a dos phase: managed by server ──
    if (state.status === 'decidiendo_irados') {
      const currentDecider = session.irADosPending[session.irADosCurrent];
      if (currentDecider !== mySeat) {
        throw new Error('No es tu turno para decidir');
      }

      if (event.type === 'declareIrADos') {
        // Player declares ir a dos → dispatch to engine, goes to "jugando"
        let newState = dispatch(state, event);
        session.state = newState;
        return newState;
      }

      if (event.type === 'lockNoIrADos') {
        // Player passes → advance to next player
        session.irADosCurrent++;
        if (session.irADosCurrent >= session.irADosPending.length) {
          // All passed → dispatch lockNoIrADos to engine
          let newState = dispatch(state, { type: 'lockNoIrADos' });
          session.state = newState;
          return newState;
        }
        // More players to ask — state doesn't change in the engine
        return state;
      }

      // Allow cambiar7 during decidiendo_irados
      if (event.type === 'cambiar7') {
        let newState = dispatch(state, event);
        session.state = newState;
        return newState;
      }

      throw new Error('Acción no válida en fase de ir a dos');
    }

    // Validate turn for card-playing actions
    if (event.type === 'jugarCarta' && state.status === 'jugando') {
      if (state.turno !== mySeat) {
        throw new Error('No es tu turno');
      }
    }

    // Dispatch (throws GameError if invalid)
    let newState = dispatch(state, event);
    session.state = newState;

    // NOTE: trick resolution (resolverBaza) is NOT auto-dispatched here.
    // socketServer handles it with an intermediate broadcast + delay
    // so clients can see the full mesa before it clears.

    // Reset resumen ready tracking when entering resumen
    if (newState.status === 'resumen') {
      session.resumenReady = new Set();
    }

    // Save game result when series ends (detected after any action)
    if (newState.serieTerminada && newState.status === 'resumen' && !session.resultSaved) {
      session.resultSaved = true;
      this.saveGameResult(session, newState).catch(err =>
        console.error('Error guardando resultado de partida:', err)
      );
    }

    // Accumulate stats from current REO before starting a new round
    if (event.type === 'finalizarReo' && !newState.serieTerminada) {
      this.accumulateReoStats(session, state); // 'state' = pre-dispatch, still has reoLog
    }

    // Auto-start next round after finalizarReo (if series not over)
    if (event.type === 'finalizarReo' && !newState.serieTerminada) {
      // Advance dealer clockwise (skipping eliminated). startRound computes salidor from dealer.
      const eliminados = newState.eliminados ?? [];
      const dealerIdx = CLOCKWISE.indexOf(newState.dealer);
      let nextDealer = newState.dealer;
      for (let i = 1; i <= 4; i++) {
        const candidate = CLOCKWISE[(dealerIdx + i) % CLOCKWISE.length];
        if (!eliminados.includes(candidate)) {
          nextDealer = candidate;
          break;
        }
      }

      newState = dispatch(newState, { type: 'startRound', dealer: nextDealer });
      session.state = newState;

      // Reset ir-a-dos tracking for new round
      session.irADosPending = [...newState.activos];
      session.irADosCurrent = 0;
    }

    // After resetSerie, auto-start first round
    if (event.type === 'resetSerie') {
      session.resultSaved = false;
      session.startTime = new Date();
      session.seriesStats = { 0: emptyStats(), 1: emptyStats(), 2: emptyStats(), 3: emptyStats() } as Record<Seat, PlayerSeriesStats>;
      // Pick random dealer from alive seats only
      const aliveSeats = CLOCKWISE.filter(s => !(newState.eliminados ?? []).includes(s));
      const randDealer = aliveSeats[Math.floor(Math.random() * aliveSeats.length)];
      newState = dispatch(newState, { type: 'startRound', dealer: randDealer });
      session.state = newState;

      session.irADosPending = [...newState.activos];
      session.irADosCurrent = 0;
    }

    return newState;
  }

  /** Mark a seat as ready to close the resumen modal. Returns whether all are ready. */
  setResumenReady(roomId: string, seat: Seat): { allReady: boolean; state: GameState; advanceType?: 'reo' | 'serie' } {
    const session = this.games.get(roomId);
    if (!session) throw new Error('Partida no encontrada');
    if (session.state.status !== 'resumen') throw new Error('No estás en fase de resumen');

    session.resumenReady.add(seat);

    // Check if all non-eliminated active seats are ready
    const eliminados = session.state.eliminados ?? [];
    const relevantSeats = ([0, 1, 2, 3] as Seat[]).filter(s => !eliminados.includes(s));
    const allReady = relevantSeats.every(s => session.resumenReady.has(s));

    if (allReady) {
      // Auto-advance: finalizarReo or resetSerie
      const isSerie = session.state.serieTerminada;
      const actionType = isSerie ? 'resetSerie' : 'finalizarReo';
      const newState = this.processAction(roomId, session.seatToUserId[session.state.dealer], { type: actionType });
      return { allReady: true, state: newState, advanceType: isSerie ? 'serie' : 'reo' };
    }

    return { allReady: false, state: session.state };
  }

  needsTrickResolution(roomId: string): boolean {
    const session = this.games.get(roomId);
    if (!session) return false;
    const { state } = session;
    return state.status === 'jugando' && state.mesa.length === state.activos.length;
  }

  resolveTrick(roomId: string): void {
    const session = this.games.get(roomId);
    if (!session) return;
    const newState = dispatch(session.state, { type: 'resolverBaza' });
    session.state = newState;

    // Reset resumen ready tracking when entering resumen
    if (newState.status === 'resumen') {
      session.resumenReady = new Set();
    }

    // Save game result when series ends
    if (newState.serieTerminada && newState.status === 'resumen' && !session.resultSaved) {
      session.resultSaved = true;
      this.saveGameResult(session, newState).catch(err =>
        console.error('Error guardando resultado de partida:', err)
      );
    }
  }

  createPlayerView(roomId: string, userId: string, room?: Room): GameStateView {
    const session = this.games.get(roomId);
    if (!session) throw new Error('Partida no encontrada');

    const { state, userIdToSeat, playerNames } = session;
    const mySeat = userIdToSeat.get(userId);
    if (mySeat === undefined) throw new Error('No estás en esta partida');

    const otherPlayerCardCounts: Partial<Record<Seat, number>> = {};
    const puntos: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const playerConnected: Record<Seat, boolean> = { 0: true, 1: true, 2: true, 3: true };

    for (const s of [0, 1, 2, 3] as Seat[]) {
      puntos[s] = state.jugadores[s].puntos;
      if (s !== mySeat) {
        otherPlayerCardCounts[s] = state.jugadores[s].mano.length;
      }
    }

    // Populate connection status from room data
    if (room) {
      for (const p of room.players) {
        if (p.seat !== null) {
          playerConnected[p.seat] = p.connected;
        }
      }
    }

    // Override turno during ir-a-dos phase to show who's deciding
    let viewTurno = state.turno;
    if (state.status === 'decidiendo_irados' && session.irADosCurrent < session.irADosPending.length) {
      viewTurno = session.irADosPending[session.irADosCurrent];
    }

    return {
      status: state.status,
      dealer: state.dealer,
      activos: state.activos,
      turno: viewTurno,
      salidor: state.salidor,
      bazaN: state.bazaN,
      triunfo: state.triunfo,
      mesa: state.mesa,
      irADos: state.irADos,
      mySeat,
      myHand: [...state.jugadores[mySeat].mano],
      otherPlayerCardCounts,
      piedras: { ...state.piedras },
      puntos,
      bazasPorJugador: state.bazasPorJugador,
      reoLog: state.reoLog,
      perdedores: state.perdedores,
      seriePiedrasIniciales: state.seriePiedrasIniciales,
      serieTerminada: state.serieTerminada,
      eliminados: state.eliminados,
      ultimoGanadorBaza: state.ultimoGanadorBaza,
      cantesCantados: state.cantesCantados,
      cantesTuteCantado: state.cantesTuteCantado,
      playerNames,
      playerConnected,
      resumenReady: [...session.resumenReady],
      numPlayers: state.numPlayers,
      emptySeat: state.emptySeat,
    };
  }

  private accumulateReoStats(session: GameSession, state: GameState): void {
    for (const ev of state.reoLog) {
      switch (ev.t) {
        case 'resolverBaza':
          session.seriesStats[ev.ganador].bazasGanadas++;
          session.seriesStats[ev.ganador].totalPuntos += ev.puntos;
          break;
        case 'cante':
          if (ev.puntos === 20) session.seriesStats[ev.seat].cantes20++;
          else session.seriesStats[ev.seat].cantes40++;
          break;
        case 'tute':
          session.seriesStats[ev.seat].tutes++;
          break;
        case 'irADos':
          session.seriesStats[ev.seat].vecesIrADos++;
          break;
        case 'monte':
          for (const d of ev.deltas) {
            session.seriesStats[d.seat].totalPuntos += d.puntos;
          }
          break;
      }
    }
  }

  private async saveGameResult(session: GameSession, state: GameState): Promise<void> {
    // Accumulate stats from the final REO
    this.accumulateReoStats(session, state);

    // Only consider seats with real players (skip empty seat in 3p)
    const allSeats = [0, 1, 2, 3] as Seat[];
    const realSeats = allSeats.filter(s => session.seatToUserId[s] !== '');
    const eliminados = state.eliminados ?? [];
    const winners = realSeats.filter(s => !eliminados.includes(s) && state.piedras[s] > 0);
    const losers = realSeats.filter(s => !winners.includes(s));

    // Fetch current ELO for all real players
    const userIds = realSeats.map(s => session.seatToUserId[s]);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, elo: true },
    });
    const eloMap: Record<string, number> = {};
    for (const u of users) eloMap[u.id] = u.elo;

    // Calculate new ELOs
    const winnerAvgElo = winners.length > 0
      ? winners.reduce<number>((sum, s) => sum + eloMap[session.seatToUserId[s]], 0) / winners.length
      : 1000;
    const loserAvgElo = losers.length > 0
      ? losers.reduce<number>((sum, s) => sum + eloMap[session.seatToUserId[s]], 0) / losers.length
      : 1000;

    const newElos: Record<string, number> = {};
    for (const s of winners) {
      const uid = session.seatToUserId[s];
      newElos[uid] = calculateElo(eloMap[uid], loserAvgElo, true);
    }
    for (const s of losers) {
      const uid = session.seatToUserId[s];
      newElos[uid] = calculateElo(eloMap[uid], winnerAvgElo, false);
    }

    // Save everything in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.game.create({
        data: {
          roomName: session.roomName,
          piedrasCount: state.seriePiedrasIniciales,
          startedAt: session.startTime,
          players: {
            create: realSeats.map(seat => {
              const uid = session.seatToUserId[seat];
              const stats = session.seriesStats[seat];
              return {
                userId: uid,
                seat,
                finalPiedras: state.piedras[seat],
                isWinner: winners.includes(seat),
                totalPuntos: stats.totalPuntos,
                bazasGanadas: stats.bazasGanadas,
                cantes20: stats.cantes20,
                cantes40: stats.cantes40,
                tutes: stats.tutes,
                vecesIrADos: stats.vecesIrADos,
                eloBefore: eloMap[uid],
                eloAfter: newElos[uid],
              };
            }),
          },
        },
      });

      // Update each user's ELO (deduplicate in case of test scenarios)
      const uniqueUserIds = [...new Set(userIds)];
      for (const uid of uniqueUserIds) {
        await tx.user.update({
          where: { id: uid },
          data: { elo: newElos[uid] },
        });
      }
    });

    console.log(`Partida guardada: sala=${session.roomId}, ganadores=${
      winners.map(s => session.playerNames[s]).join(', ')
    }`);
  }

  deleteGame(roomId: string): void {
    this.games.delete(roomId);
  }
}
