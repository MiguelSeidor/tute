import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export function LobbyScreen({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const {
    connected, currentRoom, roomList,
    createRoom, joinRoom, leaveRoom, setReady, startGame, rejoinRoom, deleteRoom, refreshRoomList,
  } = useSocket();

  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [piedras, setPiedras] = useState<3 | 5>(5);
  const [error, setError] = useState('');

  // On mount, check if user has an active room to rejoin
  useEffect(() => {
    if (connected && !currentRoom) {
      rejoinRoom();
    }
  }, [connected]);

  if (!connected) {
    return (
      <div className="mode-screen" style={{ gap: 24 }}>
        <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>Conectando al servidor...</p>
      </div>
    );
  }

  // ── Inside a room ──
  if (currentRoom) {
    const isHost = currentRoom.hostUserId === user?.id;
    const me = currentRoom.players.find(p => p.userId === user?.id);
    const allReady = currentRoom.players.length === 4 && currentRoom.players.every(p => p.ready);

    return (
      <div className="mode-screen" style={{ gap: 0 }}>
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          padding: 'clamp(20px, 3vw, 32px)',
          borderRadius: 16,
          border: '2px solid rgba(255,255,255,0.2)',
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <h1 style={{
            fontSize: 'clamp(1.4rem, 3.5vw, 2rem)',
            margin: '0 0 4px',
            textAlign: 'center',
            textShadow: '0 2px 8px rgba(0,0,0,.4)',
          }}>
            {currentRoom.name}
          </h1>
          <p style={{ opacity: 0.7, margin: '0 0 20px', textAlign: 'center', fontSize: '0.9rem' }}>
            {currentRoom.piedras} piedras &middot; {currentRoom.players.length}/4 jugadores
          </p>

          {/* Player seats */}
          <style>{`@media (max-width: 500px) { .lobby-seats { grid-template-columns: 1fr !important; } }`}</style>
          <div className="lobby-seats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {([0, 1, 2, 3] as const).map(seat => {
              const player = currentRoom.players.find(p => p.seat === seat);
              const isMe = player?.userId === user?.id;
              const isRoomHost = player?.userId === currentRoom.hostUserId;
              return (
                <div key={seat} style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `2px solid ${player ? (player.ready ? 'rgba(100,255,150,0.5)' : 'rgba(255,200,60,0.4)') : 'rgba(255,255,255,0.15)'}`,
                  background: player
                    ? (player.ready ? 'rgba(100,255,150,0.1)' : 'rgba(255,200,60,0.08)')
                    : 'rgba(255,255,255,0.05)',
                  opacity: player ? 1 : 0.5,
                }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: 4 }}>
                    Asiento {seat + 1}
                  </div>
                  {player ? (
                    <>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                        {player.username}
                        {isMe && ' (tú)'}
                        {isRoomHost && ' ★'}
                      </div>
                      <div style={{ fontSize: '0.85rem', marginTop: 4, opacity: 0.8 }}>
                        {player.ready ? '✓ Listo' : '⏳ Esperando'}
                      </div>
                      {!player.connected && (
                        <div style={{ fontSize: '0.75rem', color: '#ff6b6b', marginTop: 2 }}>
                          Desconectado
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.9rem', opacity: 0.5 }}>Vacío</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="mode-btn"
              onClick={() => setReady(!me?.ready)}
              style={{ padding: '10px 20px', fontSize: '1rem' }}
            >
              {me?.ready ? 'No estoy listo' : 'Estoy listo'}
            </button>

            {isHost && (
              <button
                className="mode-btn"
                onClick={async () => {
                  try { await startGame(); } catch (e: any) { setError(e.message); }
                }}
                disabled={!allReady}
                style={{
                  padding: '10px 20px', fontSize: '1rem',
                  opacity: allReady ? 1 : 0.4,
                  cursor: allReady ? 'pointer' : 'not-allowed',
                }}
              >
                Iniciar partida
              </button>
            )}

            <button
              className="mode-btn"
              onClick={async () => { await leaveRoom(); }}
              style={{ padding: '10px 20px', fontSize: '0.95rem' }}
            >
              Salir de la sala
            </button>

            {isHost && (
              <button
                className="mode-btn"
                onClick={async () => {
                  if (window.confirm('¿Eliminar la sala? Todos los jugadores serán expulsados.')) {
                    try { await deleteRoom(); } catch (e: any) { setError(e.message); }
                  }
                }}
                style={{
                  padding: '10px 20px', fontSize: '0.95rem',
                  background: 'rgba(255,60,60,0.2)', border: '1px solid rgba(255,60,60,0.4)',
                  color: '#ff6b6b',
                }}
              >
                Eliminar sala
              </button>
            )}
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(255,60,60,0.2)', border: '1px solid rgba(255,60,60,0.4)',
              color: '#ff6b6b', fontSize: '0.9rem',
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Room list / lobby ──
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: '1rem',
    boxSizing: 'border-box',
  };

  return (
    <div className="mode-screen" style={{ gap: 0 }}>
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        padding: 'clamp(20px, 3vw, 32px)',
        borderRadius: 16,
        border: '2px solid rgba(255,255,255,0.2)',
        maxWidth: 520,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <h1 style={{
          fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
          margin: '0 0 4px',
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}>
          Lobby Online
        </h1>
        <p style={{ opacity: 0.7, margin: '0 0 20px', textAlign: 'center', fontSize: '0.9rem' }}>
          Hola, {user?.username}
        </p>

        {/* Create room form */}
        {showCreate ? (
          <div style={{
            padding: 16, borderRadius: 10, marginBottom: 16,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
          }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem' }}>Nombre de la sala</label>
              <input
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                placeholder="Mi sala"
                style={inputStyle}
                maxLength={30}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem' }}>Piedras</label>
              <select
                value={piedras}
                onChange={e => setPiedras(parseInt(e.target.value) as 3 | 5)}
                style={{ ...inputStyle, appearance: 'auto' }}
              >
                <option value={3}>3 piedras (rápida)</option>
                <option value={5}>5 piedras (estándar)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="mode-btn"
                onClick={async () => {
                  if (!roomName.trim()) return;
                  try {
                    setError('');
                    await createRoom(roomName.trim(), piedras);
                    setShowCreate(false);
                    setRoomName('');
                  } catch (e: any) { setError(e.message); }
                }}
                style={{ flex: 1, padding: '10px', fontSize: '0.95rem' }}
              >
                Crear
              </button>
              <button
                className="mode-btn"
                onClick={() => { setShowCreate(false); setError(''); }}
                style={{ flex: 1, padding: '10px', fontSize: '0.95rem' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className="mode-btn" onClick={() => setShowCreate(true)}
              style={{ flex: 1, padding: '10px 16px', fontSize: '0.95rem' }}>
              Crear Sala
            </button>
            <button className="mode-btn" onClick={refreshRoomList}
              style={{ flex: 1, padding: '10px 16px', fontSize: '0.95rem' }}>
              Actualizar
            </button>
          </div>
        )}

        {/* Room list */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '1rem', opacity: 0.8 }}>
            Salas disponibles
          </h3>
          {roomList.length === 0 ? (
            <p style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', padding: '20px 0' }}>
              No hay salas. Crea una.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {roomList.map(room => (
                <div key={room.id} style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{room.name}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                      {room.hostUsername} &middot; {room.playerCount}/4 &middot; {room.piedras}p
                    </div>
                  </div>
                  <button
                    className="mode-btn"
                    onClick={async () => {
                      try { setError(''); await joinRoom(room.id); } catch (e: any) { setError(e.message); }
                    }}
                    disabled={room.playerCount >= 4}
                    style={{
                      padding: '8px 16px', fontSize: '0.85rem',
                      opacity: room.playerCount >= 4 ? 0.4 : 1,
                    }}
                  >
                    Unirse
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,60,60,0.2)', border: '1px solid rgba(255,60,60,0.4)',
            color: '#ff6b6b', fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}

        <button
          className="mode-btn"
          onClick={onBack}
          style={{ width: '100%', padding: '10px 20px', fontSize: '0.95rem' }}
        >
          Volver
        </button>
      </div>
    </div>
  );
}
