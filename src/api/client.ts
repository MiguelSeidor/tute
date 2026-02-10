import type { AuthResponse, ErrorResponse, RegisterRequest, LoginRequest, ForgotPasswordRequest, ResetPasswordRequest, User, RankingEntry, GameHistoryEntry, PlayerStats } from '@shared/types';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ErrorResponse = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(error.error || 'Error en la petición');
  }
  return response.json();
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<AuthResponse>(response);
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<AuthResponse>(response);
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getCurrentUser(): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include',
  });
  return handleResponse<{ user: User }>(response);
}

export async function forgotPassword(data: ForgotPasswordRequest): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<{ message: string }>(response);
}

export async function resetPassword(data: ResetPasswordRequest): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<{ message: string }>(response);
}

export async function getRanking(): Promise<{ ranking: RankingEntry[] }> {
  const response = await fetch(`${API_BASE}/stats/ranking`, { credentials: 'include' });
  return handleResponse<{ ranking: RankingEntry[] }>(response);
}

export async function getHistory(): Promise<{ games: GameHistoryEntry[] }> {
  const response = await fetch(`${API_BASE}/stats/history`, { credentials: 'include' });
  return handleResponse<{ games: GameHistoryEntry[] }>(response);
}

export async function getMyStats(): Promise<{ stats: PlayerStats }> {
  const response = await fetch(`${API_BASE}/stats/me`, { credentials: 'include' });
  return handleResponse<{ stats: PlayerStats }>(response);
}
