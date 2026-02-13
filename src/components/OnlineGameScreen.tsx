import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Carta, MesaVisual } from '../ui/Primitives';
import { puedeJugar } from '../engine/tuteLogic';
import type { Card, Palo, Seat } from '../engine/tuteTypes';
import type { GameStateView } from '@shared/types';

const CLOCKWISE: Seat[] = [0, 3, 2, 1];

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

/**
 * Visual mapping: me at bottom, clockwise to the RIGHT.
 * bottom=me → right=next clockwise → top=across → left=previous clockwise
 */
function getVisualSeats(mySeat: Seat): { bottom: Seat; right: Seat; top: Seat; left: Seat } {
  const idx = CLOCKWISE.indexOf(mySeat);
  return {
    bottom: CLOCKWISE[idx],
    right: CLOCKWISE[(idx + 1) % 4],
    top: CLOCKWISE[(idx + 2) % 4],
    left: CLOCKWISE[(idx + 3) % 4],
  };
}

/** Rotate mesa seats so that mySeat cards appear at bottom visually */
function rotateMesa(mesa: { seat: Seat; card: Card }[], mySeat: Seat) {
  const myIdx = CLOCKWISE.indexOf(mySeat);
  return mesa.map(entry => {
    const entryIdx = CLOCKWISE.indexOf(entry.seat);
    const offset = (entryIdx - myIdx + 4) % 4;
    const visualSeat = CLOCKWISE[offset];
    return { seat: visualSeat, card: entry.card };
  });
}

export function OnlineGameScreen({ onLeave }: { onLeave: () => void }) {
  const { gameState, sendAction, sendPhrase, phraseEvent, leaveRoom, deleteRoom, currentRoom } = useSocket();
  const { user } = useAuth();
  const isHost = currentRoom?.hostUserId === user?.id;
  const [error, setError] = useState('');
  const [errorTimer, setErrorTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [handScale, setHandScale] = useState(1);
  const [showBazas, setShowBazas] = useState(false);

  // ── Trick winner overlay: detect when mesa is full (all active played) ──
  const [trickWinner, setTrickWinner] = useState<Seat | null>(null);

  useEffect(() => {
    if (!gameState) return;
    const { mesa, activos } = gameState;
    // Mesa is full = all active players have played → server will resolve after 1.5s
    if (mesa.length > 0 && mesa.length === activos.length) {
      // Find who wins this trick from the mesa cards
      const log = gameState.reoLog as any[];
      // The winner will be set after resolution; for now show the last card's seat
      setTrickWinner(null); // Will be set when resolved state arrives
    } else if (mesa.length === 0 && gameState.ultimoGanadorBaza !== null) {
      // Resolution arrived — show winner briefly
      setTrickWinner(gameState.ultimoGanadorBaza);
      const timer = setTimeout(() => setTrickWinner(null), 800);
      return () => clearTimeout(timer);
    }
  }, [gameState?.mesa.length, gameState?.ultimoGanadorBaza]);

  const recalcHandScale = useCallback(() => {
    const el = handRef.current;
    if (!el) return;
    const containerW = el.parentElement?.clientWidth ?? el.clientWidth;
    const neededW = el.scrollWidth;
    if (neededW > containerW && containerW > 0) {
      setHandScale(Math.max(0.65, containerW / neededW));
    } else {
      setHandScale(1);
    }
  }, []);

  if (!gameState) {
    return (
      <div className="mode-screen" style={{ gap: 24 }}>
        <p>Cargando partida...</p>
      </div>
    );
  }

  const gs = gameState;
  const mySeat = gs.mySeat;
  const isMyTurn = gs.turno === mySeat;
  const visual = getVisualSeats(mySeat);

  // === Anuncio visual (cantes, tute, ir a los dos, tirárselas) ===
  const [anuncio, setAnuncio] = useState<{ texto: string; tipo: 'cante' | 'tute' | 'irados' | 'tirarselas' } | null>(null);
  const anuncioLogLen = useRef(0);

  // === Bocadillos ===
  const [bocadillos, setBocadillos] = useState<Record<Seat, { texto: string; key: number } | null>>({
    0: null, 1: null, 2: null, 3: null,
  } as Record<Seat, { texto: string; key: number } | null>);
  const bocadilloKeyRef = useRef(0);
  const bocadilloLogLenRef = useRef(0);

  function mostrarBocadillo(seat: Seat, texto: string) {
    bocadilloKeyRef.current++;
    const key = bocadilloKeyRef.current;
    setBocadillos(prev => ({ ...prev, [seat]: { texto, key } }));
    setTimeout(() => {
      setBocadillos(prev => prev[seat]?.key === key ? { ...prev, [seat]: null } : prev);
    }, 3500);
  }

  // Detect anuncio from reoLog
  useEffect(() => {
    const log = gs.reoLog;
    const prevLen = anuncioLogLen.current;
    anuncioLogLen.current = log.length;
    if (log.length <= prevLen) return;
    for (let i = prevLen; i < log.length; i++) {
      const e = log[i] as any;
      if (e.t === 'tute') {
        const kind = e.kind === 'reyes' ? '4 Reyes' : '4 Caballos';
        setAnuncio({ texto: `${gs.playerNames[e.seat]} canta TUTE (${kind})`, tipo: 'tute' });
        return;
      }
      if (e.t === 'cante') {
        setAnuncio({ texto: `${gs.playerNames[e.seat]} canta ${e.palo} (${e.puntos})`, tipo: 'cante' });
        return;
      }
      if (e.t === 'irADos') {
        setAnuncio({ texto: `${gs.playerNames[e.seat]} va a los dos!`, tipo: 'irados' });
        return;
      }
      if (e.t === 'tirarselas') {
        setAnuncio({ texto: `${gs.playerNames[e.seat]} se las tira!`, tipo: 'tirarselas' });
        return;
      }
    }
  }, [gs.reoLog]);

  // Auto-hide anuncio
  useEffect(() => {
    if (!anuncio) return;
    const t = setTimeout(() => setAnuncio(null), 2000);
    return () => clearTimeout(t);
  }, [anuncio]);

  // Bocadillos from reoLog events (cantes, tute, tirárselas)
  useEffect(() => {
    const log = gs.reoLog;
    const prevLen = bocadilloLogLenRef.current;
    bocadilloLogLenRef.current = log.length;
    if (log.length <= prevLen) return;
    for (let i = prevLen; i < log.length; i++) {
      const e = log[i] as any;
      if (e.t === 'tirarselas' && typeof e.seat === 'number') {
        mostrarBocadillo(e.seat as Seat, 'Me rindo...');
      }
      if (e.t === 'tute' && typeof e.seat === 'number') {
        const frase = e.kind === 'caballos' ? '¡Cuatro caballos! ¡TUTE!' : '¡Cuatro reyes! ¡TUTE!';
        mostrarBocadillo(e.seat as Seat, frase);
      }
      if (e.t === 'cante' && typeof e.seat === 'number') {
        const singer = e.seat as Seat;
        if (e.palo === gs.triunfo?.palo) {
          mostrarBocadillo(singer, '¡Las cuacuá!');
        } else if (e.palo === 'bastos') {
          mostrarBocadillo(singer, '¡En bastos!');
        } else if (e.palo === 'copas') {
          mostrarBocadillo(singer, '¡En copas!');
        } else if (e.palo === 'espadas') {
          mostrarBocadillo(singer, '¡En espadas!');
        } else {
          mostrarBocadillo(singer, '¡En oros!');
        }
        // A rival reacts
        const rivales = ([0, 1, 2, 3] as Seat[]).filter(s => s !== singer && gs.activos.includes(s));
        if (rivales.length > 0) {
          const rival = rivales[Math.floor(Math.random() * rivales.length)];
          setTimeout(() => mostrarBocadillo(rival, FRASE_RIVAL_CANTE), 800);
        }
      }
    }
  }, [gs.reoLog]);

  // Bocadillos from socket (phrase selector - broadcast to all)
  useEffect(() => {
    if (!phraseEvent) return;
    mostrarBocadillo(phraseEvent.seat, phraseEvent.texto);
  }, [phraseEvent]);

  // Auto-scale hand to fit container
  useEffect(() => {
    recalcHandScale();
    window.addEventListener('resize', recalcHandScale);
    return () => window.removeEventListener('resize', recalcHandScale);
  }, [recalcHandScale, gs.myHand.length]);

  function showError(msg: string) {
    setError(msg);
    if (errorTimer) clearTimeout(errorTimer);
    setErrorTimer(setTimeout(() => setError(''), 4000));
  }

  async function handleAction(action: any) {
    try {
      setError('');
      await sendAction(action);
    } catch (e: any) {
      showError(e.message);
    }
  }

  function isLegal(card: Card): boolean {
    if (gs.status !== 'jugando') return false;
    if (!isMyTurn) return false;
    if (!gs.activos.includes(mySeat)) return false;
    const triunfoPalo = gs.triunfo?.palo as Palo;
    return puedeJugar(card, gs.myHand, gs.mesa, triunfoPalo);
  }

  function getAvailableCantes(): { palo: Palo; puntos: 20 | 40 }[] {
    if (gs.status !== 'jugando') return [];
    if (gs.ultimoGanadorBaza !== mySeat) return [];
    if (gs.mesa.length > 0) return [];
    const cantes: { palo: Palo; puntos: 20 | 40 }[] = [];
    for (const p of ['oros', 'copas', 'espadas', 'bastos'] as Palo[]) {
      if (gs.cantesCantados[mySeat][p]) continue;
      const has12 = gs.myHand.some(c => c.palo === p && c.num === 12);
      const has11 = gs.myHand.some(c => c.palo === p && c.num === 11);
      if (has12 && has11) {
        cantes.push({ palo: p, puntos: (gs.triunfo?.palo === p ? 40 : 20) as 20 | 40 });
      }
    }
    return cantes;
  }

  function canTute(): boolean {
    if (gs.status !== 'jugando') return false;
    if (gs.ultimoGanadorBaza !== mySeat) return false;
    if (gs.cantesTuteCantado[mySeat]) return false;
    const reyes = gs.myHand.filter(c => c.num === 12).length;
    const caballos = gs.myHand.filter(c => c.num === 11).length;
    return reyes === 4 || caballos === 4;
  }

  function canCambiar7(): boolean {
    if (gs.status !== 'decidiendo_irados' && gs.status !== 'jugando') return false;
    if (gs.bazaN > 0) return false;
    if (!gs.triunfo || gs.triunfo.num === 7) return false;
    if (!gs.activos.includes(mySeat)) return false;
    return gs.myHand.some(c => c.palo === gs.triunfo!.palo && c.num === 7);
  }

  function cardPts(c: Card): number {
    return c.num === 1 ? 11 : c.num === 3 ? 10 : c.num === 12 ? 4 : c.num === 11 ? 3 : c.num === 10 ? 2 : 0;
  }

  const cantes = getAvailableCantes();
  const myBazas = gs.bazasPorJugador[mySeat] || [];

  return (
    <>
      <style>{`
        :root {
          --card-w: clamp(76px, 3vw, 132px);
          --card-h: calc(var(--card-w) * 1.25);
          --npc-card-w: 51px;
          --mesa-card-w: calc(var(--card-w) * 0.85);
          --mesa-card-h: calc(var(--mesa-card-w) * 1.45);
        }
        body { margin:0; background: radial-gradient(1400px 900px at 20% 10%, #2e7d32 0%, #1b5e20 60%, #0f3f14 100%);
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
        #root { max-width: none; padding: 0; width: 100%; }
        .og-page {
          min-height: 100svh; display: flex; flex-direction: column; gap: 8px;
          padding: 8px; box-sizing: border-box; max-width: 1200px; margin: 0 auto; color: #fff;
        }
        .og-board { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .og-mesaBox { margin: 0 auto; width: calc(var(--card-w) * 5.2); height: calc(var(--card-h) * 3.2);
          border-radius: 12px; background: rgba(0,0,0,0.2); box-shadow: 0 10px 30px rgba(0,0,0,.25) inset; overflow: hidden; }
        .og-piedras-float {
          position: fixed; bottom: 12px; right: 12px; z-index: 50;
          background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.2);
          border-radius: 10px; padding: 8px 12px; backdrop-filter: blur(8px);
        }
        .playerHeaderLine { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.18); }
        .badge--dealer { background: linear-gradient(180deg, #ffd54f, #ffb300); color: #3b2b00; border-color: rgba(255,255,255,0.35); }
        .badge--solo { background: rgba(0,200,120,0.25); border-color: rgba(0,255,180,0.35); }
        .badge--eliminated { background: rgba(255,60,60,0.25); border-color: rgba(255,60,60,0.5); color: #ff6b6b; }
        .og-mesaBox.anuncio-activo {
          box-shadow: 0 0 12px 4px rgba(0, 255, 120, 0.5), 0 0 30px 8px rgba(0, 255, 120, 0.25), 0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(0, 255, 120, 0.7);
          transition: box-shadow 0.3s ease, border 0.3s ease;
        }
        .og-mesaBox.anuncio-tute {
          box-shadow: 0 0 16px 6px rgba(255, 215, 0, 0.6), 0 0 40px 12px rgba(255, 215, 0, 0.3), 0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(255, 215, 0, 0.8);
        }
        .og-mesaBox.anuncio-irados {
          box-shadow: 0 0 12px 4px rgba(255, 140, 0, 0.5), 0 0 30px 8px rgba(255, 140, 0, 0.25), 0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(255, 140, 0, 0.7);
        }
        .og-mesaBox.anuncio-tirarselas {
          box-shadow: 0 0 12px 4px rgba(255, 60, 60, 0.5), 0 0 30px 8px rgba(255, 60, 60, 0.25), 0 10px 30px rgba(0,0,0,.25) inset;
          border: 2px solid rgba(255, 60, 60, 0.7);
        }
        @keyframes anuncio-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .anuncio-overlay {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          padding: 10px 24px; border-radius: 10px; font-weight: 700; font-size: 18px;
          text-align: center; white-space: nowrap; pointer-events: none;
          animation: anuncio-in 250ms ease-out both;
        }
        .anuncio-overlay.cante {
          background: rgba(0, 80, 40, 0.85); color: #66ffaa;
          border: 2px solid rgba(0, 255, 120, 0.6); text-shadow: 0 0 12px rgba(0, 255, 120, 0.5);
        }
        .anuncio-overlay.tute {
          background: rgba(80, 60, 0, 0.9); color: #ffd700;
          border: 2px solid rgba(255, 215, 0, 0.7); text-shadow: 0 0 16px rgba(255, 215, 0, 0.6); font-size: 26px;
        }
        .anuncio-overlay.irados {
          background: rgba(80, 40, 0, 0.9); color: #ffaa33;
          border: 2px solid rgba(255, 140, 0, 0.6); text-shadow: 0 0 12px rgba(255, 140, 0, 0.5);
        }
        .anuncio-overlay.tirarselas {
          background: rgba(100, 10, 10, 0.9); color: #ff6b6b;
          border: 2px solid rgba(255, 60, 60, 0.7); text-shadow: 0 0 12px rgba(255, 60, 60, 0.5);
        }
        @keyframes bocadillo-in {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes bocadillo-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        .og-bocadillo {
          position: absolute; z-index: 10; padding: 8px 14px; border-radius: 14px;
          background: rgba(255,255,255,0.95); color: #222; font-size: 13px; font-weight: 600;
          box-shadow: 0 2px 12px rgba(0,0,0,0.3); white-space: nowrap; pointer-events: none;
          animation: bocadillo-in 300ms ease-out both;
        }
        .og-bocadillo::after {
          content: ''; position: absolute; width: 0; height: 0;
          border-left: 8px solid transparent; border-right: 8px solid transparent;
        }
        .og-bocadillo--above { left: 50%; transform: translateX(-50%); bottom: calc(100% + 6px); }
        .og-bocadillo--above::after { top: 100%; left: 50%; transform: translateX(-50%); border-top: 8px solid rgba(255,255,255,0.95); }
        .og-bocadillo--below { left: 50%; transform: translateX(-50%); top: calc(100% + 6px); }
        .og-bocadillo--below::after { bottom: 100%; left: 50%; transform: translateX(-50%); border-bottom: 8px solid rgba(255,255,255,0.95); }
        @media (max-width: 900px) {
          .og-piedras-float { bottom: 8px; right: 8px; padding: 6px 10px; }
        }
        @media (max-width: 600px) {
          :root {
            --card-w: clamp(56px, 14vw, 80px);
            --npc-card-w: 38px;
          }
          .og-mesaBox {
            width: calc(var(--card-w) * 4.5) !important;
            height: calc(var(--card-h) * 2.8) !important;
          }
          .og-bocadillo { font-size: 11px; padding: 6px 10px; white-space: normal; max-width: 200px; text-align: center; }
          .anuncio-overlay { font-size: 14px !important; padding: 8px 16px !important; white-space: normal !important; max-width: 80% !important; }
          .badge { font-size: 10px; padding: 1px 6px; gap: 4px; }
          .playerHeaderLine { gap: 4px; flex-wrap: wrap; }
        }
        @media (max-width: 400px) {
          :root {
            --card-w: clamp(48px, 16vw, 64px);
            --npc-card-w: 32px;
          }
          .og-page { padding: 4px; gap: 4px; }
          .og-mesaBox {
            width: calc(var(--card-w) * 4) !important;
            height: calc(var(--card-h) * 2.5) !important;
          }
          .og-bocadillo { max-width: 160px; font-size: 10px; padding: 4px 8px; }
          .anuncio-overlay { font-size: 12px !important; padding: 6px 12px !important; }
          .badge { font-size: 9px; }
          .og-piedras-float { font-size: 0.65rem; padding: 5px 8px; bottom: 6px; right: 6px; }
        }
      `}</style>

      <div className="og-page">
        <div className="og-board">
          {/* Header compacto */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {gs.triunfo && (
                <Carta carta={gs.triunfo} legal={false} style={{ width: 'clamp(28px, 6vw, 40px)', margin: 0, flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.85rem)', opacity: 0.7 }}>
                  Triunfo: <b>{gs.triunfo ? gs.triunfo.palo : '—'}</b>
                </div>
                <div style={{ fontSize: 'clamp(0.65rem, 2vw, 0.8rem)', opacity: 0.6 }}>
                  {gs.status === 'decidiendo_irados' ? 'Decidiendo IR A DOS...' :
                    gs.status === 'jugando' ? `Turno: ${gs.playerNames[gs.turno]}` :
                      gs.status === 'resumen' ? 'Resumen del REO' : gs.status}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => {
                  if (window.confirm('Si abandonas la partida, los demás jugadores te esperarán. ¿Seguro que quieres salir?')) {
                    leaveRoom().then(onLeave);
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
              {isHost && (
                <button
                  onClick={() => {
                    if (window.confirm('Esto terminará la partida para TODOS los jugadores y eliminará la sala. ¿Continuar?')) {
                      deleteRoom().then(onLeave);
                    }
                  }}
                  style={{
                    background: 'rgba(255,30,30,0.4)', color: '#ff6b6b', padding: '3px 10px',
                    borderRadius: 6, cursor: 'pointer', fontSize: 'clamp(0.65rem, 2vw, 0.8rem)',
                    border: '1px solid rgba(255,60,60,0.7)', fontWeight: 700,
                  }}
                >
                  Terminar
                </button>
              )}
            </div>
          </div>

          {/* Board: 4 corners */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto auto',
            gap: 'clamp(2px, 1vw, 8px)', alignItems: 'center', justifyItems: 'center',
          }}>
            {/* Top player */}
            <div style={{ gridColumn: '2', gridRow: '1', position: 'relative' }}>
              <OnlinePlayerBox gs={gs} seat={visual.top} mySeat={mySeat} />
              {bocadillos[visual.top] && (
                <div className="og-bocadillo og-bocadillo--below" key={bocadillos[visual.top]!.key}>{bocadillos[visual.top]!.texto}</div>
              )}
            </div>
            {/* Left player */}
            <div style={{ gridColumn: '1', gridRow: '2', position: 'relative' }}>
              <OnlinePlayerBox gs={gs} seat={visual.left} mySeat={mySeat} />
              {bocadillos[visual.left] && (
                <div className="og-bocadillo og-bocadillo--above" key={bocadillos[visual.left]!.key}>{bocadillos[visual.left]!.texto}</div>
              )}
            </div>
            {/* Mesa */}
            <div style={{ gridColumn: '2', gridRow: '2' }}>
              <div className={`og-mesaBox${anuncio ? ` anuncio-${anuncio.tipo === 'cante' ? 'activo' : anuncio.tipo}` : ''}${trickWinner !== null ? ' anuncio-activo' : ''}`} style={{ position: 'relative' }}>
                <MesaVisual mesa={rotateMesa(gs.mesa, mySeat)} />
                {trickWinner !== null && (
                  <div className="anuncio-overlay cante" key={`baza-${gs.bazaN}`}>
                    {gs.playerNames[trickWinner]} gana la baza
                  </div>
                )}
                {anuncio && trickWinner === null && (
                  <div className={`anuncio-overlay ${anuncio.tipo}`} key={anuncio.texto}>
                    {anuncio.texto}
                  </div>
                )}
              </div>
            </div>
            {/* Right player */}
            <div style={{ gridColumn: '3', gridRow: '2', position: 'relative' }}>
              <OnlinePlayerBox gs={gs} seat={visual.right} mySeat={mySeat} />
              {bocadillos[visual.right] && (
                <div className="og-bocadillo og-bocadillo--above" key={bocadillos[visual.right]!.key}>{bocadillos[visual.right]!.texto}</div>
              )}
            </div>
            {/* Bottom player (me) */}
            <div style={{ gridColumn: '2', gridRow: '3', position: 'relative' }}>
              <OnlinePlayerBox gs={gs} seat={visual.bottom} mySeat={mySeat} />
              {bocadillos[visual.bottom] && (
                <div className="og-bocadillo og-bocadillo--above" key={bocadillos[visual.bottom]!.key}>{bocadillos[visual.bottom]!.texto}</div>
              )}
            </div>
          </div>

          {/* My hand */}
          <div style={{ overflow: 'hidden', minHeight: 'var(--card-h)' }}>
            <div ref={handRef} style={{
              display: 'flex', justifyContent: 'center', flexWrap: 'nowrap',
              gap: 6,
              transform: handScale < 1 ? `scale(${handScale})` : undefined,
              transformOrigin: 'center bottom',
            }}>
              {gs.myHand.length === 0 ? (
                <span style={{ opacity: 0.5, alignSelf: 'center' }}>Sin cartas</span>
              ) : gs.myHand.map(card => {
                const legal = isLegal(card);
                return (
                  <Carta key={`${card.palo}-${card.num}`} carta={card} legal={legal}
                    onClick={() => { if (legal) handleAction({ type: 'jugarCarta', seat: mySeat, card }); }} />
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            {gs.status === 'decidiendo_irados' && gs.activos.includes(mySeat) && isMyTurn && (
              <>
                <button style={btnStyle()} onClick={() => handleAction({ type: 'declareIrADos', seat: mySeat })}>Ir a los dos</button>
                <button style={btnStyle()} onClick={() => handleAction({ type: 'lockNoIrADos' })}>Pasar</button>
              </>
            )}
            {canCambiar7() && (
              <button style={btnStyle()} onClick={() => handleAction({ type: 'cambiar7', seat: mySeat })}>Cambiar 7</button>
            )}
            {cantes.map(c => (
              <button key={c.palo} style={btnStyle()} onClick={() => handleAction({ type: 'cantar', seat: mySeat, palo: c.palo, puntos: c.puntos })}>
                Cantar {c.palo} ({c.puntos})
              </button>
            ))}
            {canTute() && (
              <button style={btnStyle('rgba(255,200,0,0.3)')} onClick={() => handleAction({ type: 'cantarTute', seat: mySeat })}>Cantar TUTE</button>
            )}
            {gs.status === 'jugando' && isMyTurn && gs.mesa.length === 0 && gs.bazaN > 0 && (
              <button style={btnStyle('rgba(255,60,60,0.25)')} onClick={() => handleAction({ type: 'tirarselas', seat: mySeat })}>Tirárselas</button>
            )}
            {gs.activos.includes(mySeat) && (
              <button style={btnStyle()} onClick={() => setShowBazas(true)}>
                Bazas ({myBazas.length})
              </button>
            )}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  sendPhrase(e.target.value);
                  e.target.value = '';
                }
              }}
              style={{
                padding: 'clamp(4px, 1.5vw, 6px) clamp(6px, 2vw, 10px)', borderRadius: 6,
                fontSize: 'clamp(11px, 2.5vw, 13px)',
                background: 'rgba(255,255,255,0.12)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer',
                maxWidth: 200,
              }}
              title="Elige una frase para tu bocadillo"
            >
              <option value="" disabled>Decir algo...</option>
              <option value="Tengo salida" style={{ color: '#111' }}>Tengo salida</option>
              {FRASES_RANDOM.map((f, i) => (
                <option key={i} value={f} style={{ color: '#111' }}>{f}</option>
              ))}
            </select>
            {gs.status === 'resumen' && !gs.serieTerminada && (
              <button style={btnStyle()} onClick={() => handleAction({ type: 'finalizarReo' })}>Siguiente ronda</button>
            )}
            {gs.serieTerminada && (
              <button style={btnStyle()} onClick={() => handleAction({ type: 'resetSerie' })}>Nueva serie</button>
            )}
          </div>

          {/* Bazas modal */}
          {showBazas && (
            <BazasModal gs={gs} mySeat={mySeat} onClose={() => setShowBazas(false)} />
          )}
        </div>

        </div>

      {/* Floating piedras panel — bottom right */}
      <div className="og-piedras-float">
        <div style={{ fontWeight: 700, fontSize: '0.75rem', opacity: 0.8, marginBottom: 4 }}>Piedras</div>
        {([0, 1, 2, 3] as Seat[]).map(s => {
          const val = gs.piedras[s];
          const isElim = gs.eliminados.includes(s);
          return (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 'clamp(0.65rem, 2vw, 0.8rem)',
              opacity: isElim ? 0.4 : 1,
              color: val <= 0 ? '#ff6b6b' : '#fff',
            }}>
              <span style={{ fontWeight: s === mySeat ? 700 : 400 }}>
                {gs.playerNames[s]}{s === mySeat ? '*' : ''}:
              </span>
              <span>{val > 0 ? '●'.repeat(Math.min(val, 12)) : '—'}</span>
            </div>
          );
        })}
      </div>

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 24px', borderRadius: 8,
          background: 'rgba(255,60,60,0.9)', color: '#fff', fontSize: '0.9rem',
          zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {error}
        </div>
      )}

      {gs.status === 'resumen' && <ResumenModal gs={gs} onAction={handleAction} />}
    </>
  );
}

function btnStyle(bg?: string): React.CSSProperties {
  return {
    padding: 'clamp(6px, 1.5vw, 8px) clamp(10px, 2.5vw, 16px)', borderRadius: 6,
    fontSize: 'clamp(11px, 2.5vw, 14px)', cursor: 'pointer',
    background: bg || 'rgba(255,255,255,0.12)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)', fontWeight: 600,
  };
}

function OnlinePlayerBox({ gs, seat, mySeat }: { gs: GameStateView; seat: Seat; mySeat: Seat }) {
  const isMe = seat === mySeat;
  const name = gs.playerNames[seat] || `J${seat + 1}`;
  const isActive = gs.activos.includes(seat);
  const isEliminated = gs.eliminados.includes(seat);
  const isTurn = gs.turno === seat;
  const isDealer = gs.dealer === seat;
  const isSolo = gs.irADos === seat;
  const isConnected = gs.playerConnected?.[seat] ?? true;
  const cardCount = isMe ? gs.myHand.length : (gs.otherPlayerCardCounts[seat] ?? 0);
  const puntos = gs.puntos[seat];
  const isLoser = gs.perdedores.includes(seat);

  return (
    <div style={{ textAlign: 'center', minWidth: 'clamp(80px, 22vw, 200px)', opacity: isConnected ? 1 : 0.5 }}>
      <div className="playerHeaderLine">
        <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
          {name} {isMe && '(tú)'}
        </span>
        <span className={`badge ${isLoser ? 'badge--loser' : ''}`} style={isLoser ? { background: 'rgba(255,60,60,0.3)', borderColor: 'rgba(255,60,60,0.6)', color: '#ff6b6b' } : {}}>
          {puntos} pts
        </span>
        {isDealer && <span className="badge badge--dealer">🎴</span>}
        {isSolo && <span className="badge badge--solo">Solo</span>}
        {isEliminated && <span className="badge badge--eliminated">Eliminado</span>}
        {!isConnected && !isMe && (
          <span className="badge" style={{ background: 'rgba(255,165,0,0.3)', borderColor: 'rgba(255,165,0,0.6)', color: '#ffaa33' }}>
            Desc.
          </span>
        )}
        {!isActive && !isDealer && !isEliminated && isConnected && <span style={{ opacity: 0.7, fontSize: '0.75em' }}>(No juega)</span>}
      </div>

      {!isMe && isActive && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(2px, 1vw, 6px)', justifyContent: 'center', minHeight: 'var(--card-h)' }}>
          {Array.from({ length: cardCount }).map((_, i) => (
            <Carta key={i} tapada style={{ width: 'var(--npc-card-w)' }} />
          ))}
        </div>
      )}

      {isTurn && isActive && isConnected && (
        <div style={{
          marginTop: 4, padding: '2px 10px', borderRadius: 999, display: 'inline-block',
          background: 'rgba(255,220,60,0.2)', border: '1px solid rgba(255,220,60,0.4)',
          fontSize: '0.75rem', fontWeight: 700, color: '#ffd740',
        }}>
          ⏳ {isMe ? 'Tu turno' : 'Su turno'}
        </div>
      )}
      {isTurn && isActive && !isConnected && (
        <div style={{
          marginTop: 4, padding: '2px 10px', borderRadius: 999, display: 'inline-block',
          background: 'rgba(255,165,0,0.2)', border: '1px solid rgba(255,165,0,0.4)',
          fontSize: '0.75rem', fontWeight: 700, color: '#ffaa33',
        }}>
          Esperando reconexión...
        </div>
      )}
    </div>
  );
}

function bazaCardPts(c: Card): number {
  const m: Record<number, number> = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };
  return m[c.num] ?? 0;
}

function BazasModal({ gs, mySeat, onClose }: { gs: GameStateView; mySeat: Seat; onClose: () => void }) {
  const myBazas = gs.bazasPorJugador[mySeat] || [];
  const myTotal = myBazas.flat().reduce((s, c) => s + bazaCardPts(c), 0);

  // Teammate bazas (when someone goes ir a dos)
  let teammate: Seat | null = null;
  let teamBazas: Card[][] = [];
  if (gs.irADos !== null && gs.irADos !== mySeat && gs.activos.includes(mySeat)) {
    const solo = gs.irADos as Seat;
    teammate = gs.activos.find(s => s !== solo && s !== mySeat) ?? null;
    if (teammate !== null) {
      teamBazas = gs.bazasPorJugador[teammate] || [];
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
            <h3 style={{ margin: '16px 0 8px' }}>Bazas de {gs.playerNames[teammate]} ({teamBazas.length})</h3>
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

function ResumenModal({ gs, onAction }: { gs: GameStateView; onAction: (a: any) => void }) {
  const activeSeats = new Set<number>(gs.activos);
  const turnos: Record<number, any[]> = {};

  for (const e of gs.reoLog as any[]) {
    let key: number;
    if (e?.turno === undefined || e?.turno === null) {
      if (e?.t === 'cambio7' || e?.t === 'irADos' || e?.t === 'startRound') key = -1;
      else continue;
    } else {
      key = Number(e.turno);
      if (!Number.isFinite(key)) continue;
    }
    if (!turnos[key]) turnos[key] = [];
    turnos[key].push(e);
  }
  const orden = Object.keys(turnos).map(Number).sort((a, b) => a - b);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99998,
    }}>
      <div style={{
        width: 'min(900px, 90vw)', maxHeight: '90vh', overflowY: 'auto',
        background: '#13381f', padding: 20, borderRadius: 12, color: 'white',
        border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 10px 60px rgba(0,0,0,0.65)',
      }}>
        <h2 style={{ marginTop: 0 }}>Resumen del REO</h2>

        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Turno</th>
              <th style={thStyle}>Acciones</th>
              {([0, 1, 2, 3] as Seat[]).map(s => (
                <th key={s} style={thStyle}>{gs.playerNames[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orden.map(t => {
              const eventos = turnos[t]!.filter((e: any) =>
                typeof e?.seat === 'number' ? activeSeats.has(e.seat) : true
              );
              const jugadas: Record<number, string | null> = { 0: null, 1: null, 2: null, 3: null };
              const acciones: string[] = [];
              let ganadorTurno: number | null = null;

              for (const e of eventos) {
                if (e.t === 'jugar') jugadas[e.seat] = `${e.carta.palo[0].toUpperCase()}-${e.carta.num}`;
                else if (e.t === 'cambio7') acciones.push(`${gs.playerNames[e.seat]} cambia 7`);
                else if (e.t === 'irADos') acciones.push(`${gs.playerNames[e.seat]} va a los dos`);
                else if (e.t === 'cante') acciones.push(`${gs.playerNames[e.seat]} canta ${e.palo} (${e.puntos})`);
                else if (e.t === 'tute') acciones.push(`${gs.playerNames[e.seat]} canta TUTE`);
                else if (e.t === 'tirarselas') acciones.push(`${gs.playerNames[e.seat]} se las tira`);
                else if (e.t === 'resolverBaza') {
                  ganadorTurno = e.ganador;
                  acciones.push(`Gana ${gs.playerNames[e.ganador]} (+${e.puntos})`);
                }
              }

              return (
                <tr key={t}>
                  <td style={tdStyle}>{t === -1 ? 'Inicio' : t + 1}</td>
                  <td style={tdStyle}>{acciones.join(' | ')}</td>
                  {([0, 1, 2, 3] as Seat[]).map(s => (
                    <td key={s} style={{
                      ...tdStyle,
                      background: ganadorTurno === s ? 'rgba(0,200,120,0.35)' :
                        gs.perdedores.includes(s) ? 'rgba(255,0,0,0.35)' : 'transparent',
                    }}>{jugadas[s] || ''}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            {gs.perdedores.length > 0 && (
              <div style={{ color: '#ff6b6b' }}>Perdedores: {gs.perdedores.map(s => gs.playerNames[s]).join(', ')}</div>
            )}
            {gs.serieTerminada && (
              <div style={{ color: '#ffcc00', fontWeight: 'bold', marginTop: 4 }}>Serie terminada</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {!gs.serieTerminada && (
              <button onClick={() => onAction({ type: 'finalizarReo' })}
                style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                Siguiente ronda
              </button>
            )}
            {gs.serieTerminada && (
              <button onClick={() => onAction({ type: 'resetSerie' })}
                style={{ padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                Nueva serie
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { borderBottom: '1px solid #fff', padding: 6 };
const tdStyle: React.CSSProperties = { padding: 6, borderBottom: '1px solid #444' };
