import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/client';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export function AuthForm({ onBack }: { onBack: () => void }) {
  // Check URL for reset token
  const params = new URLSearchParams(window.location.search);
  const resetTokenFromUrl = params.get('resetToken');

  const [mode, setMode] = useState<Mode>(resetTokenFromUrl ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken] = useState(resetTokenFromUrl || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, register } = useAuth();

  // Clean URL when entering reset mode
  useEffect(() => {
    if (resetTokenFromUrl) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register') {
        if (!username.trim() || username.length < 3) {
          setError('El nombre de usuario debe tener al menos 3 caracteres');
          setSubmitting(false);
          return;
        }
        await register(email, username, password);
      } else if (mode === 'forgot') {
        const result = await api.forgotPassword({ email });
        setSuccess(result.message);
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          setError('Las contraseñas no coinciden');
          setSubmitting(false);
          return;
        }
        await api.resetPassword({ token: resetToken, password });
        setSuccess('Contraseña actualizada. Ahora puedes iniciar sesión.');
        setTimeout(() => {
          setMode('login');
          setSuccess('');
          setPassword('');
          setConfirmPassword('');
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
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

  const linkBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#66ffaa',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: 0,
  };

  const titles: Record<Mode, string> = {
    login: 'Iniciar Sesión',
    register: 'Registrarse',
    forgot: 'Recuperar Contraseña',
    reset: 'Nueva Contraseña',
  };

  const subtitles: Record<Mode, string> = {
    login: 'Accede a tu cuenta para jugar online',
    register: 'Crea una cuenta para jugar con amigos',
    forgot: 'Introduce tu email para recibir un enlace de recuperación',
    reset: 'Establece tu nueva contraseña',
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
          {titles[mode]}
        </h1>
        <p style={{ opacity: 0.8, margin: '0 0 24px', textAlign: 'center', fontSize: '0.95rem' }}>
          {subtitles[mode]}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email field (login, register, forgot) */}
          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
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
          )}

          {/* Username field (register only) */}
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
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          )}

          {/* Password field (login, register, reset) */}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem' }}>
                {mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}
              </label>
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
          )}

          {/* Confirm password (reset only) */}
          {mode === 'reset' && (
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem' }}>Confirmar contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
                placeholder="Repite la contraseña"
              />
            </div>
          )}

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

          {success && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(60,255,120,0.15)',
              border: '1px solid rgba(60,255,120,0.4)',
              color: '#66ffaa',
              fontSize: '0.9rem',
            }}>
              {success}
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
            {submitting ? 'Procesando...'
              : mode === 'login' ? 'Entrar'
              : mode === 'register' ? 'Crear cuenta'
              : mode === 'forgot' ? 'Enviar enlace'
              : 'Cambiar contraseña'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {mode === 'login' && (
            <>
              <button onClick={() => switchMode('forgot')} style={linkBtnStyle}>
                ¿Olvidaste tu contraseña?
              </button>
              <button onClick={() => switchMode('register')} style={linkBtnStyle}>
                ¿No tienes cuenta? Regístrate
              </button>
            </>
          )}
          {mode === 'register' && (
            <button onClick={() => switchMode('login')} style={linkBtnStyle}>
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button onClick={() => switchMode('login')} style={linkBtnStyle}>
              Volver a iniciar sesión
            </button>
          )}
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
