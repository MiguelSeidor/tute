import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Carta, MesaVisual } from '../ui/Primitives';
import { puedeJugar } from '../engine/tuteLogic';
import type { Card, Palo, Seat } from '../engine/tuteTypes';
import type { GameStateView } from '@shared/types';
import { useCeremonyPhase, PALO_ICONS, PALO_LABELS, DEAL_DIRECTION, getVisualSlot, CLOCKWISE } from '../ui/DealerCeremony';
import { FRASE_RIVAL_CANTE } from '../ui/gameConstants';
import { ChatBar } from './ChatBar';
import { useCardImagePreload } from '../hooks/useCardImagePreload';
import { useAnuncio } from '../hooks/useAnuncio';
import { useBocadillos } from '../hooks/useBocadillos';
import { useDealingAnimation } from '../hooks/useDealingAnimation';
import '../ui/game.css';

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
  const { gameState, sendAction, sendPhrase, chatMessages, sendChat, setResumenReady, phraseEvent, leaveRoom, deleteRoom, currentRoom, ceremonyData, clearCeremony, dealingDealer, clearDealing } = useSocket();
  const { user } = useAuth();
  const isHost = currentRoom?.hostUserId === user?.id;
  const [error, setError] = useState('');
  const [errorTimer, setErrorTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [handScale, setHandScale] = useState(1);
  const [showBazas, setShowBazas] = useState(false);

  // ── Shared hooks ──
  useCardImagePreload();

  // ── Trick winner overlay: detect when mesa is full (all active played) ──
  const [trickWinner, setTrickWinner] = useState<Seat | null>(null);

  useEffect(() => {
    if (!gameState) return;
    const { mesa, activos } = gameState;
    // Mesa is full = all active players have played → server will resolve after 1.5s
    if (mesa.length > 0 && mesa.length === activos.length) {
      // Find who wins this trick from the mesa cards
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

  // Hook MUST be called before any conditional return (React rules of hooks)
  const mySeat = gameState?.mySeat ?? (0 as Seat);
  const cerPhase = useCeremonyPhase({
    active: !!ceremonyData,
    dealer: ceremonyData?.dealer ?? (0 as Seat),
    mySeat,
    onComplete: clearCeremony,
  });
  const reoDealCards = useDealingAnimation(dealingDealer, mySeat, clearDealing);

  if (!gameState) {
    return (
      <div className="mode-screen" style={{ gap: 24 }}>
        <p>Cargando partida...</p>
      </div>
    );
  }

  const gs = gameState;
  const isMyTurn = gs.turno === mySeat;
  const visual = getVisualSeats(mySeat);
  const hideCards = !!ceremonyData || dealingDealer !== null;

  // === Anuncio visual — handled by useAnuncio hook ===
  const anuncio = useAnuncio(gs.reoLog, (s: Seat) => gs.playerNames[s]);

  // === Bocadillos ===
  const { bocadillos, mostrarBocadillo } = useBocadillos(3500);
  const bocadilloLogLenRef = useRef(0);

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

  // Bocadillos from free chat
  const lastChatLenRef = useRef(0);
  useEffect(() => {
    if (chatMessages.length > lastChatLenRef.current) {
      const msg = chatMessages[chatMessages.length - 1];
      mostrarBocadillo(msg.seat, msg.texto);
    }
    lastChatLenRef.current = chatMessages.length;
  }, [chatMessages.length]);

  // Auto-scale hand to fit container
  useEffect(() => {
    recalcHandScale();
    window.addEventListener('resize', recalcHandScale);
    return () => window.removeEventListener('resize', recalcHandScale);
  }, [recalcHandScale, gs.myHand.length]);

  // REO dealing animation now handled by useDealingAnimation hook

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


  const cantes = getAvailableCantes();
  const myBazas = gs.bazasPorJugador[mySeat] || [];

  return (
    <>
      {/* CSS específico de layout online (el compartido está en game.css) */}
      <style>{`
        .og-page {
          min-height: 100svh; display: flex; flex-direction: column; gap: 8px;
          padding: 8px; box-sizing: border-box; max-width: 1200px; margin: 0 auto; color: #fff;
        }
        .og-board { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .og-hand-container img { transition: margin 0.2s; }
        @media (max-width: 600px) {
          .og-page { font-size: 13px; }
          .og-board { gap: 4px; }
          .og-hand-container img { margin: 2px !important; }
        }
        @media (max-width: 430px) {
          .og-page { padding: 4px; gap: 4px; font-size: 12px; min-height: auto; }
          .og-hand-container img { margin: 0px !important; }
        }
      `}</style>

      <div className="og-page">
        <div className="og-board">
          {/* Header compacto */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {gs.triunfo && !hideCards && (
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
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)', gridTemplateRows: 'auto auto auto',
            gap: 'clamp(2px, 1vw, 8px)', alignItems: 'center', justifyItems: 'center',
          }}>
            {/* Dynamic ceremony slide animation */}
            {ceremonyData && (() => {
              const dir = DEAL_DIRECTION[cerPhase.dealerSlot];
              return <style>{`@keyframes cer-slide { 0% { transform: translate(-50%,-50%); opacity: 1; } 100% { transform: translate(calc(-50% + ${dir.x}), calc(-50% + ${dir.y})); opacity: 0.2; } }`}</style>;
            })()}

            {/* Top player */}
            <div style={{ gridColumn: '2', gridRow: '1', position: 'relative' }}>
              {cerPhase.showBadges && ceremonyData && (() => {
                const seat = visual.top;
                const palo = ceremonyData.suitAssignments[seat];
                const isDealer = (cerPhase.phase === 'card_slide' || cerPhase.phase === 'dealing') && ceremonyData.dealer === seat;
                return (
                  <div className={`cer-badge${isDealer ? ' is-dealer' : ''}`} style={{ animationDelay: '300ms', bottom: 'auto', top: 'calc(100% + 4px)' }}>
                    <div className="cer-badge-name">{gs.playerNames[seat]}</div>
                    <div className="cer-badge-palo">{PALO_ICONS[palo]} {PALO_LABELS[palo]}</div>
                  </div>
                );
              })()}
              <OnlinePlayerBox gs={gs} seat={visual.top} mySeat={mySeat} hideCards={hideCards} />
              {bocadillos[visual.top] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[visual.top]!.key}>{bocadillos[visual.top]!.texto}</div>
              )}
            </div>
            {/* Left player */}
            <div style={{ gridColumn: '1', gridRow: '2', position: 'relative', justifySelf: 'end' }}>
              {cerPhase.showBadges && ceremonyData && (() => {
                const seat = visual.left;
                const palo = ceremonyData.suitAssignments[seat];
                const isDealer = (cerPhase.phase === 'card_slide' || cerPhase.phase === 'dealing') && ceremonyData.dealer === seat;
                return (
                  <div className={`cer-badge${isDealer ? ' is-dealer' : ''}`} style={{ animationDelay: '150ms' }}>
                    <div className="cer-badge-name">{gs.playerNames[seat]}</div>
                    <div className="cer-badge-palo">{PALO_ICONS[palo]} {PALO_LABELS[palo]}</div>
                  </div>
                );
              })()}
              <OnlinePlayerBox gs={gs} seat={visual.left} mySeat={mySeat} hideCards={hideCards} />
              {bocadillos[visual.left] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[visual.left]!.key}>{bocadillos[visual.left]!.texto}</div>
              )}
            </div>
            {/* Mesa */}
            <div style={{ gridColumn: '2', gridRow: '2', position: 'relative' }}>
              <div className={`mesaBox${anuncio ? ` anuncio-${anuncio.tipo === 'cante' ? 'activo' : anuncio.tipo}` : ''}${trickWinner !== null ? ' anuncio-activo' : ''}`} style={{ position: 'relative' }}>
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

              {/* Ceremony center elements */}
              {ceremonyData && cerPhase.phase === 'text' && (
                <div className="cer-title">¡A ver quién da!</div>
              )}
              {ceremonyData && cerPhase.phase === 'card_reveal' && (
                <div className="cer-card-center">
                  <img className="cer-card-img cer-card-reveal"
                    src={`/cartas/${ceremonyData.card.palo}_${ceremonyData.card.num}.png`}
                    alt={`${ceremonyData.card.num} de ${ceremonyData.card.palo}`} />
                </div>
              )}
              {ceremonyData && cerPhase.phase === 'card_slide' && (
                <div className="cer-card-center">
                  <img className="cer-card-img" style={{ animation: 'cer-slide 1.2s ease-in-out both' }}
                    src={`/cartas/${ceremonyData.card.palo}_${ceremonyData.card.num}.png`}
                    alt={`${ceremonyData.card.num} de ${ceremonyData.card.palo}`} />
                  <div className="cer-dealer-label">¡{gs.playerNames[ceremonyData.dealer]} da!</div>
                </div>
              )}
              {ceremonyData && cerPhase.phase === 'dealing' && (
                <>
                  {cerPhase.dealCards.map(dc => {
                    const dealerDir = DEAL_DIRECTION[cerPhase.dealerSlot];
                    const targetDir = DEAL_DIRECTION[dc.targetSlot];
                    return (
                      <img key={dc.id} className="cer-deal-card" src="/cartas/dorso.png" alt="carta"
                        style={{
                          '--deal-ox': dealerDir.x,
                          '--deal-oy': dealerDir.y,
                          '--deal-tx': targetDir.x,
                          '--deal-ty': targetDir.y,
                        } as React.CSSProperties} />
                    );
                  })}
                </>
              )}
              {/* REO dealing cards (inline, from dealer position) */}
              {dealingDealer !== null && reoDealCards.length > 0 && (
                <>
                  {reoDealCards.map(dc => {
                    const dealerSlot = getVisualSlot(dealingDealer, mySeat);
                    const dealerDir = DEAL_DIRECTION[dealerSlot];
                    const targetDir = DEAL_DIRECTION[dc.targetSlot];
                    return (
                      <img key={dc.id} className="cer-deal-card" src="/cartas/dorso.png" alt="carta"
                        style={{
                          '--deal-ox': dealerDir.x,
                          '--deal-oy': dealerDir.y,
                          '--deal-tx': targetDir.x,
                          '--deal-ty': targetDir.y,
                        } as React.CSSProperties} />
                    );
                  })}
                </>
              )}
            </div>
            {/* Right player */}
            <div style={{ gridColumn: '3', gridRow: '2', position: 'relative', justifySelf: 'start' }}>
              {cerPhase.showBadges && ceremonyData && (() => {
                const seat = visual.right;
                const palo = ceremonyData.suitAssignments[seat];
                const isDealer = (cerPhase.phase === 'card_slide' || cerPhase.phase === 'dealing') && ceremonyData.dealer === seat;
                return (
                  <div className={`cer-badge${isDealer ? ' is-dealer' : ''}`} style={{ animationDelay: '450ms' }}>
                    <div className="cer-badge-name">{gs.playerNames[seat]}</div>
                    <div className="cer-badge-palo">{PALO_ICONS[palo]} {PALO_LABELS[palo]}</div>
                  </div>
                );
              })()}
              <OnlinePlayerBox gs={gs} seat={visual.right} mySeat={mySeat} hideCards={hideCards} />
              {bocadillos[visual.right] && (
                <div className="bocadillo bocadillo--above" key={bocadillos[visual.right]!.key}>{bocadillos[visual.right]!.texto}</div>
              )}
            </div>
            {/* Bottom player (me) */}
            <div style={{ gridColumn: '2', gridRow: '3', position: 'relative' }}>
              {cerPhase.showBadges && ceremonyData && (() => {
                const seat = visual.bottom;
                const palo = ceremonyData.suitAssignments[seat];
                const isDealer = (cerPhase.phase === 'card_slide' || cerPhase.phase === 'dealing') && ceremonyData.dealer === seat;
                return (
                  <div className={`cer-badge${isDealer ? ' is-dealer' : ''}`}>
                    <div className="cer-badge-name">{gs.playerNames[seat]}</div>
                    <div className="cer-badge-palo">{PALO_ICONS[palo]} {PALO_LABELS[palo]}</div>
                  </div>
                );
              })()}
              <OnlinePlayerBox gs={gs} seat={visual.bottom} mySeat={mySeat} hideCards={hideCards} />
              {bocadillos[visual.bottom] && (
                <div className="bocadillo bocadillo--below" key={bocadillos[visual.bottom]!.key}>{bocadillos[visual.bottom]!.texto}</div>
              )}
            </div>
          </div>

          {/* My hand — hidden during ceremony/dealing */}
          {!hideCards && (
            <div className="og-hand-container" style={{ overflow: 'hidden', minHeight: 'var(--card-h)' }}>
              <div ref={handRef} style={{
                display: 'flex', justifyContent: 'center', flexWrap: 'nowrap',
                gap: 'clamp(2px, 1vw, 6px)',
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
          )}

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
            {gs.status === 'resumen' && !gs.serieTerminada && (
              <button style={btnStyle()} onClick={() => handleAction({ type: 'finalizarReo' })}>Siguiente ronda</button>
            )}
            {gs.serieTerminada && (
              <button style={btnStyle()} onClick={() => handleAction({ type: 'resetSerie' })}>Nueva serie</button>
            )}
          </div>

          <ChatBar
            onSendChat={sendChat}
            onSendPhrase={sendPhrase}
          />

          {/* Bazas modal */}
          {showBazas && (
            <BazasModal gs={gs} mySeat={mySeat} onClose={() => setShowBazas(false)} />
          )}
        </div>



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

      {gs.status === 'resumen' && <ResumenModal gs={gs} onReady={setResumenReady} />}

      {/* Ceremony backdrop */}
      {ceremonyData && cerPhase.phase !== 'done' && (
        <div className="cer-backdrop" />
      )}

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

function OnlinePlayerBox({ gs, seat, mySeat, hideCards = false }: { gs: GameStateView; seat: Seat; mySeat: Seat; hideCards?: boolean }) {
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
    <div style={{ textAlign: 'center', minWidth: 'clamp(60px, 18vw, 200px)', opacity: isConnected ? 1 : 0.5 }}>
      <div className={`playerHeaderLine${isSolo ? ' playerHeaderLine--solo' : ''}`}>
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
      <div className="piedras-dots" style={{
        opacity: isEliminated ? 0.4 : 1, lineHeight: 1,
        display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap',
      }}>
        {gs.piedras[seat] > 0
          ? Array.from({ length: Math.min(gs.piedras[seat], 12) }).map((_, i) => (
              <img key={i} src="/cartas/piedra.png" alt="piedra" style={{ width: 'clamp(10px, 2.5vw, 16px)', height: 'auto' }} />
            ))
          : <span style={{ color: '#ff6b6b', fontSize: 'clamp(8px, 2vw, 11px)' }}>✕</span>}
      </div>

      {!isMe && isActive && !hideCards && (
        <div style={{ display: 'flex', justifyContent: 'center', minHeight: 'calc(var(--npc-card-w) * 1.45)' }}>
          <div className="npc-card-fan">
            {Array.from({ length: cardCount }).map((_, i) => (
              <Carta key={i} tapada style={{ width: 'var(--npc-card-w)', margin: 0, borderRadius: 4 }} />
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: 4, padding: '2px 10px', borderRadius: 999, display: 'inline-block',
        fontSize: '0.75rem', fontWeight: 700,
        visibility: isTurn && isActive ? 'visible' : 'hidden',
        ...(isTurn && isActive && !isConnected
          ? { background: 'rgba(255,165,0,0.2)', border: '1px solid rgba(255,165,0,0.4)', color: '#ffaa33' }
          : { background: 'rgba(255,220,60,0.2)', border: '1px solid rgba(255,220,60,0.4)', color: '#ffd740' }),
      }}>
        {isTurn && isActive && !isConnected ? 'Esperando reconexión...' : `⏳ ${isMe ? 'Tu turno' : 'Su turno'}`}
      </div>
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

function ResumenModal({ gs, onReady }: { gs: GameStateView; onReady: () => void }) {
  const activeSeats = new Set<number>(gs.activos);
  const eliminados = gs.eliminados ?? [];
  const relevantSeats = ([0, 1, 2, 3] as Seat[]).filter(s => !eliminados.includes(s));
  const readySet = new Set(gs.resumenReady);
  const iAmReady = readySet.has(gs.mySeat);
  const readyCount = relevantSeats.filter(s => readySet.has(s)).length;
  const totalCount = relevantSeats.length;

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
    <div className="resumen-backdrop">
      <div className="resumen-panel">
        <h2 className="resumen-title">Resumen del REO</h2>

        <div style={{ overflowX: 'auto' }}>
        <table className="resumen-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Acciones</th>
              {([0, 1, 2, 3] as Seat[]).map(s => (
                <th key={s}>{gs.playerNames[s]}</th>
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
                else if (e.t === 'cambio7') acciones.push(`${gs.playerNames[e.seat as Seat]} cambia 7`);
                else if (e.t === 'irADos') acciones.push(`${gs.playerNames[e.seat as Seat]} va a dos`);
                else if (e.t === 'cante') acciones.push(`${gs.playerNames[e.seat as Seat]} canta ${e.palo} (${e.puntos})`);
                else if (e.t === 'tute') acciones.push(`${gs.playerNames[e.seat as Seat]} TUTE`);
                else if (e.t === 'tirarselas') acciones.push(`${gs.playerNames[e.seat as Seat]} se tira`);
                else if (e.t === 'resolverBaza') {
                  ganadorTurno = e.ganador;
                  acciones.push(`Gana ${gs.playerNames[e.ganador as Seat]} (+${e.puntos})`);
                }
                else if (e.t === 'monte') {
                  const parts = e.deltas.map((d: any) => `${gs.playerNames[d.seat as Seat]} +${d.puntos}`);
                  acciones.push(`Monte: ${parts.join(', ')}`);
                }
              }

              return (
                <tr key={t}>
                  <td>{t === -1 ? 'Ini' : t + 1}</td>
                  <td>{acciones.join(' | ')}</td>
                  {([0, 1, 2, 3] as Seat[]).map(s => (
                    <td key={s} style={{
                      background: ganadorTurno === s ? 'rgba(0,200,120,0.35)' :
                        gs.perdedores.includes(s) ? 'rgba(255,0,0,0.35)' : 'transparent',
                    }}>{jugadas[s] || ''}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, borderTop: '2px solid #fff' }}>
              <td></td>
              <td>Total</td>
              {([0, 1, 2, 3] as Seat[]).map(s => (
                <td key={s} style={{
                  background: gs.perdedores.includes(s) ? 'rgba(255,0,0,0.35)' : 'transparent',
                }}>{gs.puntos[s]} pts</td>
              ))}
            </tr>
          </tfoot>
        </table>
        </div>

        <div className="resumen-footer">
          <div>
            {gs.perdedores.length > 0 && (
              <div style={{ color: '#ff6b6b' }}>Perdedores: {gs.perdedores.map(s => gs.playerNames[s]).join(', ')}</div>
            )}
            {gs.serieTerminada && (
              <div style={{ color: '#ffcc00', fontWeight: 'bold', marginTop: 4 }}>Serie terminada</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            {/* Ready status per player */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {relevantSeats.map(s => (
                <span key={s} style={{
                  fontSize: 12, padding: '2px 8px', borderRadius: 999,
                  background: readySet.has(s) ? 'rgba(0,200,120,0.3)' : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${readySet.has(s) ? 'rgba(0,255,120,0.5)' : 'rgba(255,255,255,0.2)'}`,
                  color: readySet.has(s) ? '#aaffaa' : 'rgba(255,255,255,0.6)',
                }}>
                  {readySet.has(s) ? '\u2713' : '\u00B7'} {gs.playerNames[s]}
                </span>
              ))}
            </div>
            {/* Ready button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {iAmReady && (
                <span style={{ fontSize: 13, opacity: 0.7 }}>
                  Esperando ({readyCount}/{totalCount})...
                </span>
              )}
              <button
                onClick={onReady}
                disabled={iAmReady}
                style={{
                  padding: '8px 20px', borderRadius: 6, fontWeight: 600, cursor: iAmReady ? 'default' : 'pointer',
                  background: iAmReady ? 'rgba(0,200,120,0.3)' : undefined,
                  opacity: iAmReady ? 0.7 : 1,
                  border: iAmReady ? '1px solid rgba(0,255,120,0.4)' : undefined,
                  color: iAmReady ? '#aaffaa' : undefined,
                }}>
                {iAmReady ? 'Listo \u2713' : (gs.serieTerminada ? 'Listo (Nueva serie)' : 'Listo (Siguiente ronda)')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

