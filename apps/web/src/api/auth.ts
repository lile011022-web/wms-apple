import { request } from './client';
import { authTokenStore } from './token-store';
import type { AuthSession, CurrentUser } from './types';

export async function login(payload: { email: string; password: string }) {
  const session = await request<AuthSession>('post', '/auth/login', { data: payload });
  authTokenStore.setTokens(session.tokens);
  return session;
}

export async function register(payload: { email: string; name: string; password: string }) {
  const session = await request<AuthSession>('post', '/auth/register', { data: payload });
  authTokenStore.setTokens(session.tokens);
  return session;
}

export async function refreshSession() {
  const refreshToken = authTokenStore.getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  const session = await request<AuthSession>('post', '/auth/refresh', {
    data: { refreshToken },
  });
  authTokenStore.setTokens(session.tokens);
  return session;
}

export async function logout() {
  void request<{ loggedOut: true }>('post', '/auth/logout').catch(() => undefined);
  authTokenStore.clear();
  if (typeof window !== 'undefined') {
    window.sessionStorage.clear();
  }
}

export function getCurrentUser() {
  return request<CurrentUser>('get', '/auth/me');
}
