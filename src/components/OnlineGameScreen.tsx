import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Carta, MesaVisual, PanelTriunfo } from '../ui/Primitives';
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
          min-height: 100svh; display: grid; grid-template-columns: minmax(0, 1fr) 280px;
          gap: 12px; padding: 12px; box-sizing: border-box; max-width: 1800px; margin: 0 auto; color: #fff;
        }
        .og-board { display: flex; flex-direction: column; gap: 12px; }
        .og-mesaBox { margin: 0 auto; width: calc(var(--card-w) * 5.2); height: calc(var(--card-h) * 3.2);
          border-radius: 12px; background: rgba(0,0,0,0.2); box-shadow: 0 10px 30px rgba(0,0,0,.25) inset; overflow: hidden; }
        .og-sidebar { background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; padding: 12px; }
        .og-pill { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.12); margin-bottom: 8px; }
        .og-pill.loser { border-color: #ff6b6b; background: rgba(255,60,60,0.18); }
        .og-pill.eliminated { opacity: 0.45; border-color: #666; }
        .og-pill.stoneOut { border-color: #ff4d4d; box-shadow: 0 0 0 3px rgba(255,77,77,0.55); }
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
          .og-page { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="og-page">
        <div className="og-board">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Tute Parrillano Online</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                {gs.status === 'decidiendo_irados' ? '🗳 Decidiendo IR A LOS DOS...' :
                  gs.status === 'jugando' ? `⏳ Turno de ${gs.playerNames[gs.turno]}` :
                    gs.status === 'resumen' ? '🏁 Resumen del REO' : gs.status}
              </span>
              <button
                onClick={() => {
                  if (window.confirm('Si abandonas la partida, los demás jugadores te esperarán. ¿Seguro que quieres salir?')) {
                    leaveRoom().then(onLeave);
                  }
                }}
                style={{
                  background: 'rgba(255,60,60,0.25)', color: '#fff', padding: '4px 12px',
                  borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
                  border: '1px solid rgba(255,60,60,0.5)',
                }}
              >
                Abandonar
              </button>
              {isHost && (
                <button
                  onClick={() => {
                    if (window.confirm('Esto terminará la partida para TODOS los jugadores y eliminará la sala. ¿Continuar?')) {
                      deleteRoom().then(onLeave);
                    }
                  }}
                  style={{
                    background: 'rgba(255,30,30,0.4)', color: '#ff6b6b', padding: '4px 12px',
                    borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
                    border: '1px solid rgba(255,60,60,0.7)', fontWeight: 700,
                  }}
                >
                  Terminar partida
                </button>
              )}
            </div>
          </div>

          <PanelTriunfo triunfo={gs.triunfo} />

          {/* Board: 4 corners */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr auto 1fr',
            gap: 12, alignItems: 'center', justifyItems: 'center',
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
              <div className={`og-mesaBox${anuncio ? ` anuncio-${anuncio.tipo === 'cante' ? 'activo' : anuncio.tipo}` : ''}`} style={{ position: 'relative' }}>
                <MesaVisual mesa={rotateMesa(gs.mesa, mySeat)} />
                {anuncio && (
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
          <div style={{
            display: 'flex', justifyContent: 'center', flexWrap: 'nowrap',
            gap: 6, minHeight: 'var(--card-h)', overflow: 'hidden',
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

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
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
            {/* Phrase selector */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  sendPhrase(e.target.value);
                  e.target.value = '';
                }
              }}
              style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 13,
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

          {/* My bazas */}
          {gs.activos.includes(mySeat) && (
            <div>
              <h3 style={{ margin: '12px 0 6px' }}>Mis bazas</h3>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: 64,
                overflowX: 'auto', overflowY: 'hidden', padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'rgba(0,0,0,0.2)',
              }}>
                {myBazas.length === 0 ? (
                  <span style={{ opacity: 0.7 }}>Aún no has ganado ninguna baza</span>
                ) : myBazas.map((baza, idx) => {
                  const pts = baza.reduce((s, c) => s + cardPts(c), 0);
                  return (
                    <div key={idx} title={`Baza ${idx + 1} - ${pts} pts`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 10px', borderRadius: 999,
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)',
                    }}>
                      <span style={{ fontSize: 12, opacity: 0.9 }}>B{idx + 1}</span>
                      {baza.map((c, j) => <Carta key={j} carta={c} mini style={{ width: 32, margin: 2 }} />)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <aside className="og-sidebar">
          <h3 style={{ marginTop: 0 }}>Puntos</h3>
          {([0, 1, 2, 3] as Seat[]).map(s => (
            <div key={s} className={`og-pill ${gs.perdedores.includes(s) ? 'loser' : ''} ${gs.eliminados.includes(s) ? 'eliminated' : ''}`}>
              <strong>{gs.playerNames[s]}{s === mySeat ? ' (tú)' : ''}:</strong> {gs.puntos[s]}
              {gs.dealer === s && <span style={{ marginLeft: 8, opacity: 0.8 }}>(dealer)</span>}
            </div>
          ))}

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Piedras</h4>
          {([0, 1, 2, 3] as Seat[]).map(s => {
            const val = gs.piedras[s];
            const isElim = gs.eliminados.includes(s);
            return (
              <div key={s} className={`og-pill ${val <= 0 ? 'stoneOut' : ''} ${isElim ? 'eliminated' : ''}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  <strong>{gs.playerNames[s]}:</strong> {val} {val > 0 ? '●'.repeat(Math.min(val, 12)) : '—'}
                  {isElim && <span style={{ marginLeft: 8, color: '#ff6b6b' }}>(Eliminado)</span>}
                </span>
              </div>
            );
          })}

        </aside>
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
    padding: '8px 16px', borderRadius: 6, fontSize: '0.9rem', cursor: 'pointer',
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

  return (
    <div style={{ textAlign: 'center', minWidth: 200, opacity: isConnected ? 1 : 0.5 }}>
      <div className="playerHeaderLine">
        <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
          {name} {isMe && '(tú)'}
        </span>
        {isDealer && <span className="badge badge--dealer">🎴 Reparte</span>}
        {isSolo && <span className="badge badge--solo">🥇 Va solo</span>}
        {isEliminated && <span className="badge badge--eliminated">Eliminado</span>}
        {!isConnected && !isMe && (
          <span className="badge" style={{ background: 'rgba(255,165,0,0.3)', borderColor: 'rgba(255,165,0,0.6)', color: '#ffaa33' }}>
            Desconectado
          </span>
        )}
        {!isActive && !isDealer && !isEliminated && isConnected && <span style={{ opacity: 0.7 }}>(No juega)</span>}
      </div>

      {!isMe && isActive && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', minHeight: 'var(--card-h)' }}>
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
