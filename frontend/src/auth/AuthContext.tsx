import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client';
import type { AuthResponse, MfaChallenge, User } from '../api/types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: User | null;
  sessionExpired: boolean;
  accountDeleted: boolean;
  login: (email: string, password: string) => Promise<MfaChallenge | null>;
  verifyMfa: (challengeId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Olvida la sesión local sin llamar al servidor tras suprimir la cuenta. */
  forgetSession: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  const applySession = useCallback((session: AuthResponse) => {
    setAccessToken(session.accessToken);
    setUserState(session.user);
    setStatus('authenticated');
    setSessionExpired(false);
    setAccountDeleted(false);
  }, []);

  const clearSession = useCallback((expired: boolean) => {
    setAccessToken(null);
    setUserState(null);
    setStatus('anonymous');
    setSessionExpired(expired);
  }, []);

  // Al cargar la aplicación se intenta recuperar la sesión desde la cookie HttpOnly.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (!active) return;
        if (session) applySession(session);
        else clearSession(false);
      })
      .catch(() => active && clearSession(false));
    return () => {
      active = false;
    };
  }, [applySession, clearSession]);

  useEffect(() => {
    setSessionExpiredHandler(() => clearSession(true));
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<AuthResponse | MfaChallenge>('/auth/login', { email, password });
      if ('mfaRequired' in result) return result;
      applySession(result);
      return null;
    },
    [applySession],
  );

  const verifyMfa = useCallback(
    async (challengeId: string, code: string) => {
      applySession(await api.post<AuthResponse>('/auth/login/mfa', { challengeId, code }));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearSession(false);
    }
  }, [clearSession]);

  const forgetSession = useCallback(() => {
    clearSession(false);
    setAccountDeleted(true);
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, sessionExpired, accountDeleted, login, verifyMfa, logout, forgetSession, setUser: setUserState }),
    [status, user, sessionExpired, accountDeleted, login, verifyMfa, logout, forgetSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
