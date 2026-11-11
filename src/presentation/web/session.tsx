/**
 * Sesión de la SPA (STATE-AUTH-SESSION-001 visto desde el cliente): usuario actual de `GET /auth/me`,
 * registro, login y logout por la API. La cookie `argos_session` es HttpOnly; la SPA nunca la lee.
 *
 * Al arrancar consulta `GET /auth/me` una sola vez (la recarga conserva la sesión mientras sea vigente). No hay sondeo,
 * temporizadores ni renovación al recuperar el foco: solo la acción de la persona produce peticiones autenticadas, y
 * cada una renueva la inactividad de 30 min en el servidor (INV-AUTH2-002).
 *
 * @implements REQ-UI-005, REQ-AUTH2-001, REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002, INV-ARCH-003
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiProblem, CSRF_PARAMS, unwrap, type ApiClient } from './api.ts';
import type { Schemas } from './view-model.ts';

export type UserSelfProfile = Schemas['UserSelfProfile'];
export type SessionStatus = 'LOADING' | 'ANONYMOUS' | 'AUTHENTICATED';

export interface SessionState {
  readonly status: SessionStatus;
  readonly user: UserSelfProfile | null;
  readonly api: ApiClient;
  register(input: Schemas['RegisterUserInput']): Promise<void>;
  login(input: Schemas['LoginInput']): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ api, children }: { readonly api: ApiClient; readonly children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<UserSelfProfile | null>(null);
  const [status, setStatus] = useState<SessionStatus>('LOADING');

  useEffect(() => {
    let cancelled = false;
    unwrap(api.GET('/auth/me'))
      .then((session) => {
        if (cancelled) return;
        setUser(session.user);
        setStatus('AUTHENTICATED');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('ANONYMOUS');
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const register = useCallback(
    async (input: Schemas['RegisterUserInput']) => {
      const session = await unwrap(api.POST('/auth/register', { params: CSRF_PARAMS, body: input }));
      setUser(session.user);
      setStatus('AUTHENTICATED');
    },
    [api],
  );

  const login = useCallback(
    async (input: Schemas['LoginInput']) => {
      const session = await unwrap(api.POST('/auth/login', { params: CSRF_PARAMS, body: input }));
      setUser(session.user);
      setStatus('AUTHENTICATED');
    },
    [api],
  );

  const logout = useCallback(async () => {
    try {
      await unwrap(api.POST('/auth/logout', { params: CSRF_PARAMS }));
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
    }
    setUser(null);
    setStatus('ANONYMOUS');
  }, [api]);

  const value = useMemo<SessionState>(() => ({ status, user, api, register, login, logout }), [status, user, api, register, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession fuera de SessionProvider');
  return value;
}
