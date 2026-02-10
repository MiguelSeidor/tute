import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'register';

export function AuthForm({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!username.trim() || username.length < 3) {
          setError('El nombre de usuario debe tener al menos 3 caracteres');
          setSubmitting(false);
          return;
        }
        await register(email, username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setSubmitting(false);
    }
  };

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
        padding: 'clamp(24px, 4vw, 36px)',
        borderRadius: 16,
        border: '2px solid rgba(255,255,255,0.2)',
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <h1 style={{
          fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
          margin: '0 0 8px',
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}>
          {mode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
        </h1>
        <p style={{ opacity: 0.8, margin: '0 0 24px', textAlign: 'center', fontSize: '0.95rem' }}>
          {mode === 'login'
            ? 'Accede a tu cuenta para jugar online'
            : 'Crea una cuenta para jugar con amigos'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
              placeholder="tu@email.com"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem' }}>Nombre de usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                style={inputStyle}
                placeholder="Tu nombre en el juego"
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem' }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255,60,60,0.2)',
              border: '1px solid rgba(255,60,60,0.4)',
              color: '#ff6b6b',
              fontSize: '0.9rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mode-btn"
            style={{
              padding: '12px 24px',
              fontSize: '1.1rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.9rem' }}>
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#66ffaa',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: 0,
            }}
          >
            {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </div>

        <button
          onClick={onBack}
          className="mode-btn"
          style={{ marginTop: 16, padding: '10px 20px', fontSize: '0.95rem', width: '100%' }}
        >
          Volver
        </button>
      </div>
    </div>
  );
}
