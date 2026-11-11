/**
 * Sesión por cookie: `argos_session` HttpOnly, SameSite=Strict, Path=/,
 * Max-Age de 24 h (el tope absoluto de la sesión) y `Secure` según `COOKIE_SECURE`. Las rutas protegidas resuelven el usuario en `onRequest`
 * (después de CSRF y antes de leer el cuerpo); sin sesión vigente (revocada, inactiva 30 min o pasadas 24 h),
 * ERR-AUTH-UNAUTHENTICATED (401) sin escribir nada. Una petición con sesión vigente renueva `lastActivityAt`
 * (INV-AUTH2-002); las rechazadas antes de este gancho (CSRF) no la renuevan.
 *
 * @implements REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002, INV-AUTH-003
 */

import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import type { AuthenticateRequestUseCase } from '../../../application/use-cases/auth-use-cases.ts';
import { SESSION_ABSOLUTE_TTL_HOURS } from '../../../domain/auth/auth-policies.ts';

export const SESSION_COOKIE = 'argos_session';
export const SESSION_MAX_AGE_SECONDS = SESSION_ABSOLUTE_TTL_HOURS * 60 * 60;

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario autenticado; solo en rutas con `requireSession`. */
    userId: string;
  }
}

export const sessionTokenOf = (request: FastifyRequest): string | null => request.cookies[SESSION_COOKIE] ?? null;

/** @implements REQ-AUTH-004 */
export function requireSession(authenticate: AuthenticateRequestUseCase): onRequestAsyncHookHandler {
  return async (request) => {
    request.userId = await authenticate.execute(sessionTokenOf(request));
  };
}

/** @implements REQ-AUTH2-002, INV-AUTH-003 */
export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_MAX_AGE_SECONDS, secure });
}

/** @implements REQ-AUTH-003 */
export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', path: '/', secure });
}
