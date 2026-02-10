import type { GameState, GameEvent, Seat, GameStateView, Room } from '@shared/types';
import { initGame } from '@engine/tuteInit';
import { dispatch } from '@engine/tuteReducer';

const CLOCKWISE: Seat[] = [0, 3, 2, 1];

interface GameSession {
  roomId: string;
  state: GameState;
  seatToUserId: Record<Seat, string>;
  userIdToSeat: Map<string, Seat>;
  playerNames: Record<Seat, string>;

  // Ir-a-dos phase tracking (server manages per-player turns)
  irADosPending: Seat[];    // active players who haven't decided yet
  irADosCurrent: number;    // index into irADosPending for who decides next
}

export class GameManager {
  private games = new Map<string, GameSession>();

  createGame(room: Room): GameState {
    if (room.players.length !== 4) {
      throw new Error('Se necesitan exactamente 4 jugadores');
    }

    const dealer = (Math.floor(Math.random() * 4)) as Seat;
    let state = initGame(room.piedras, dealer);

    // Start first round
    state = dispatch(state, { type: 'startRound' });

    const seatToUserId = {} as Record<Seat, string>;
    const userIdToSeat = new Map<string, Seat>();
    const playerNames = {} as Record<Seat, string>;

    for (const p of room.players) {
      const seat = p.seat as Seat;
      seatToUserId[seat] = p.userId;
      userIdToSeat.set(p.userId, seat);
      playerNames[seat] = p.username;
    }

    const session: GameSession = {
      roomId: room.id, state, seatToUserId, userIdToSeat, playerNames,
      irADosPending: [...state.activos],
      irADosCurrent: 0,
    };

    this.games.set(room.id, session);
    return state;
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

    // Auto-resolve trick when all active players have played
    if (newState.status === 'jugando' && newState.mesa.length === newState.activos.length) {
      newState = dispatch(newState, { type: 'resolverBaza' });
      session.state = newState;
    }

    // Auto-start next round after finalizarReo (if series not over)
    if (event.type === 'finalizarReo' && !newState.serieTerminada) {
      // Rotate dealer clockwise, skipping eliminated
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
      const randDealer = CLOCKWISE[Math.floor(Math.random() * 4)];
      newState = dispatch(newState, { type: 'startRound', dealer: randDealer });
      session.state = newState;

      session.irADosPending = [...newState.activos];
      session.irADosCurrent = 0;
    }

    return newState;
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
    };
  }

  deleteGame(roomId: string): void {
    this.games.delete(roomId);
  }
}
