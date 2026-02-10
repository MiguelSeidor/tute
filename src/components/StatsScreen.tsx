import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/client';
import type { RankingEntry, GameHistoryEntry, PlayerStats } from '@shared/types';

type Tab = 'ranking' | 'stats' | 'history';

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('ranking');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (tab === 'ranking') {
      api.getRanking().then(r => setRanking(r.ranking)).finally(() => setLoading(false));
    } else if (tab === 'history') {
      api.getHistory().then(r => setHistory(r.games)).finally(() => setLoading(false));
    } else {
      api.getMyStats().then(r => setStats(r.stats)).finally(() => setLoading(false));
    }
  }, [tab]);

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
    fontSize: '0.95rem', border: 'none',
    background: tab === t ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
    color: tab === t ? '#fff' : 'rgba(255,255,255,0.6)',
  });

  return (
    <div className="mode-screen" style={{ gap: 0 }}>
      <div style={{
        background: 'rgba(0,0,0,0.3)', padding: 'clamp(20px, 3vw, 32px)', borderRadius: 16,
        border: '2px solid rgba(255,255,255,0.2)', maxWidth: 640, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <h1 style={{
          fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', margin: '0 0 20px', textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}>
          Ranking y Estadísticas
        </h1>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button style={tabStyle('ranking')} onClick={() => setTab('ranking')}>Ranking</button>
          <button style={tabStyle('stats')} onClick={() => setTab('stats')}>Mis estadísticas</button>
          <button style={tabStyle('history')} onClick={() => setTab('history')}>Historial</button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', opacity: 0.6 }}>Cargando...</p>
        ) : (
          <>
            {tab === 'ranking' && <RankingTab ranking={ranking} currentUserId={user?.id} />}
            {tab === 'stats' && <StatsTab stats={stats} />}
            {tab === 'history' && <HistoryTab games={history} />}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            className="mode-btn"
            onClick={onBack}
            style={{ flex: 1, padding: '10px 20px', fontSize: '0.95rem' }}
          >
            Volver
          </button>
          <button
            className="mode-btn"
            onClick={async () => {
              await fetch('/api/stats/dev/simulate', { method: 'POST', credentials: 'include' });
              setTab(t => t); // force re-render
              setLoading(true);
              if (tab === 'ranking') api.getRanking().then(r => setRanking(r.ranking)).finally(() => setLoading(false));
              else if (tab === 'history') api.getHistory().then(r => setHistory(r.games)).finally(() => setLoading(false));
              else api.getMyStats().then(r => setStats(r.stats)).finally(() => setLoading(false));
            }}
            style={{ padding: '10px 20px', fontSize: '0.85rem', opacity: 0.6 }}
          >
            Simular partida (dev)
          </button>
        </div>
      </div>
    </div>
  );
}

function RankingTab({ ranking, currentUserId }: { ranking: RankingEntry[]; currentUserId?: string }) {
  if (ranking.length === 0) {
    return <p style={{ textAlign: 'center', opacity: 0.5 }}>Aún no hay partidas registradas</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>Jugador</th>
            <th style={thStyle}>V</th>
            <th style={thStyle}>P</th>
            <th style={thStyle}>%</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r, i) => {
            const isMe = r.userId === currentUserId;
            return (
              <tr key={r.userId} style={{
                background: isMe ? 'rgba(100,255,150,0.15)' : 'transparent',
                fontWeight: isMe ? 700 : 400,
              }}>
                <td style={tdStyle}>{i + 1}</td>
                <td style={{ ...tdStyle, textAlign: 'left' }}>{r.username}{isMe ? ' (tú)' : ''}</td>
                <td style={tdStyle}>{r.wins}</td>
                <td style={tdStyle}>{r.gamesPlayed}</td>
                <td style={tdStyle}>{r.winRate}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatsTab({ stats }: { stats: PlayerStats | null }) {
  if (!stats) {
    return <p style={{ textAlign: 'center', opacity: 0.5 }}>No se pudieron cargar las estadísticas</p>;
  }

  if (stats.gamesPlayed === 0) {
    return <p style={{ textAlign: 'center', opacity: 0.5 }}>Aún no has jugado ninguna partida online</p>;
  }

  const cards = [
    { label: 'Partidas', value: stats.gamesPlayed },
    { label: 'Victorias', value: stats.wins },
    { label: 'Derrotas', value: stats.losses },
    { label: 'Win Rate', value: `${stats.winRate}%` },
    { label: 'Racha actual', value: stats.currentStreak },
    { label: 'Mejor racha', value: stats.bestStreak },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          padding: '16px 12px', borderRadius: 10, textAlign: 'center',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{c.value}</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 4 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ games }: { games: GameHistoryEntry[] }) {
  if (games.length === 0) {
    return <p style={{ textAlign: 'center', opacity: 0.5 }}>Aún no has jugado ninguna partida online</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
      {games.map(g => (
        <div key={g.id} style={{
          padding: '12px 14px', borderRadius: 10,
          background: g.myResult === 'win' ? 'rgba(100,255,150,0.08)' : 'rgba(255,60,60,0.08)',
          border: `1px solid ${g.myResult === 'win' ? 'rgba(100,255,150,0.3)' : 'rgba(255,60,60,0.3)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 700 }}>{g.roomName}</span>
            <span style={{
              fontSize: '0.8rem', padding: '2px 8px', borderRadius: 999, fontWeight: 600,
              background: g.myResult === 'win' ? 'rgba(100,255,150,0.2)' : 'rgba(255,60,60,0.2)',
              color: g.myResult === 'win' ? '#66ffaa' : '#ff6b6b',
            }}>
              {g.myResult === 'win' ? 'Victoria' : 'Derrota'}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
            {new Date(g.completedAt).toLocaleDateString('es-ES', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            {' · '}{g.piedrasCount} piedras
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: 4, opacity: 0.8 }}>
            {g.players.map(p => `${p.username}${p.isWinner ? ' ★' : ''}`).join(', ')}
          </div>
        </div>
      ))}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.3)',
  fontSize: '0.85rem', textAlign: 'center',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.1)',
  fontSize: '0.9rem', textAlign: 'center',
};
