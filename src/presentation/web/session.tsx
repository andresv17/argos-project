/**
 * Sesión de la SPA (STATE-AUTH-SESSION-001 visto desde el cliente): usuario actual de `GET /auth/me`,
 * registro, login y logout por la API. La cookie `argos_session` es HttpOnly; la SPA nunca la lee.
 *
 * Al arrancar consulta `GET /auth/me` una sola vez (la recarga conserva la sesión mientras sea vigente). No hay sondeo,
 * temporizadores ni renovación al recuperar el foco: solo la acción de la persona produce peticiones autenticadas, y
 * cada una renueva la inactividad de 30 min en el servidor (INV-AUTH2-002).
 *
 * @implements REQ-UI-005, REQ-SSO8-003, REQ-AUTH2-001, REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002, INV-ARCH-003
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiProblem, CSRF_PARAMS, unwrap, type ApiClient } from './api.ts';
import { authOutcome, type PendingAccountStatus } from './account-status.ts';
import { submitGoogleUsername } from './google-login.ts';
import type { Schemas } from './view-model.ts';

export type UserSelfProfile = Schemas['UserSelfProfile'];
export type SessionStatus = 'LOADING' | 'ANONYMOUS' | 'AUTHENTICATED';

export interface SessionState {
  readonly status: SessionStatus;
  readonly user: UserSelfProfile | null;
  /** Instantes de la sesión que entrega el servidor (`SessionView`), para el aviso previo de expiración. */
  readonly idleExpiresAt: string | null;
  readonly lastActivityAt: string | null;
  readonly api: ApiClient;
  /** Sustituye el perfil visible tras actualizarlo en `/account/profile`. */
  setUser(user: UserSelfProfile): void;
  /** Cierra la sesión local sin llamar a la API (la cuenta ya fue eliminada y la cookie expiró). */
  dropSession(): void;
  /** 009: devuelve `PENDING`/`REJECTED` (sin sesión, sin cookie) o `null` si la sesión quedó iniciada. */
  register(input: Schemas['RegisterUserInput']): Promise<PendingAccountStatus | null>;
  login(input: Schemas['LoginInput']): Promise<PendingAccountStatus | null>;
  /** Primer acceso con Google (008): crea la cuenta con el `username` elegido y deja la sesión iniciada. */
  chooseGoogleUsername(input: Schemas['GoogleChooseUsernameInput']): Promise<PendingAccountStatus | null>;
  logout(): Promise<void>;
}

export const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ api, children }: { readonly api: ApiClient; readonly children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<UserSelfProfile | null>(null);
  const [status, setStatus] = useState<SessionStatus>('LOADING');
  const [times, setTimes] = useState<{ readonly idleExpiresAt: string; readonly lastActivityAt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    unwrap(api.GET('/auth/me'))
      .then((session) => {
        if (cancelled) return;
        setUser(session.user);
        setTimes({ idleExpiresAt: session.idleExpiresAt, lastActivityAt: session.lastActivityAt });
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

  /** Solo una `SessionView` inicia sesión; `{ accountStatus }` (009) deja la SPA anónima. */
  const settle = useCallback((body: Schemas['SessionView'] | { readonly accountStatus: PendingAccountStatus }): PendingAccountStatus | null => {
    const outcome = authOutcome<Schemas['SessionView']>(body);
    if (outcome.kind === 'ACCOUNT_STATUS') return outcome.accountStatus;
    setUser(outcome.session.user);
    setTimes({ idleExpiresAt: outcome.session.idleExpiresAt, lastActivityAt: outcome.session.lastActivityAt });
    setStatus('AUTHENTICATED');
    return null;
  }, []);

  const register = useCallback(
    async (input: Schemas['RegisterUserInput']): Promise<PendingAccountStatus | null> => {
      return settle(await unwrap(api.POST('/auth/register', { params: CSRF_PARAMS, body: input })));
    },
    [api, settle],
  );

  const login = useCallback(
    async (input: Schemas['LoginInput']): Promise<PendingAccountStatus | null> => {
      return settle(await unwrap(api.POST('/auth/login', { params: CSRF_PARAMS, body: input })));
    },
    [api, settle],
  );

  const chooseGoogleUsername = useCallback(
    async (input: Schemas['GoogleChooseUsernameInput']): Promise<PendingAccountStatus | null> => {
      return settle(await submitGoogleUsername(api, input));
    },
    [api, settle],
  );

  const logout = useCallback(async () => {
    try {
      await unwrap(api.POST('/auth/logout', { params: CSRF_PARAMS }));
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
    }
    setUser(null);
    setTimes(null);
    setStatus('ANONYMOUS');
  }, [api]);

  const dropSession = useCallback(() => {
    setUser(null);
    setTimes(null);
    setStatus('ANONYMOUS');
  }, []);

  const value = useMemo<SessionState>(
    () => ({ status, user, idleExpiresAt: times?.idleExpiresAt ?? null, lastActivityAt: times?.lastActivityAt ?? null, api, setUser, dropSession, register, login, chooseGoogleUsername, logout }),
    [status, user, times, api, dropSession, register, login, chooseGoogleUsername, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession fuera de SessionProvider');
  return value;
}
