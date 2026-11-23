import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdminServices } from '../../src/application/use-cases/use-case-support.ts';
import type { Api, ApiResponse } from '../integration/api/api-harness.ts';
import { GOOGLE_ADMIN_REDIRECT, GOOGLE_CODE, SequentialEntropy, fakeGoogleOidc, type FakeGoogleOidc } from './google-fixtures.ts';

/**
 * Dobles de la Feature 009, Fase 3 (#19, portal `/admin`): Google SIMULADO (ninguna red ni credencial), correos de ejemplo y la lista cerrada
 * de administradores como arreglo mutable (EDGE-009-047: quitar un correo de la lista revoca la sesión en la petición siguiente).
 */
export const ADMIN_EMAIL = 'admin.uno@example.test';
export const ADMIN_EMAIL_2 = 'admin.dos@example.test';
export const ADMIN_SUB = 'google-sub-admin-0001';
export const ADMIN_SUB_2 = 'google-sub-admin-0002';
export const ADMIN_SESSION_COOKIE = 'argos_admin_session';
export const ADMIN_OAUTH_COOKIE = 'argos_admin_oauth';
/** Cookie de sesión de administración con identificador opaco de 32 bytes (base64url, 43 caracteres). */
export const ADMIN_COOKIE_PATTERN = /^argos_admin_session=[A-Za-z0-9_-]{43}$/;
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Origen propio de las peticiones de la prueba (`app.inject` envía `Host: localhost:80`, que equivale a `http://localhost`). */
export const OWN_ORIGIN = 'http://localhost';

export interface AdminKit {
  readonly oidc: FakeGoogleOidc;
  /** Lista cerrada MUTABLE: la prueba la modifica para simular un cambio de configuración. */
  readonly emails: string[];
  readonly admin: AdminServices;
}

export function adminKit(emails: readonly string[] = [ADMIN_EMAIL]): AdminKit {
  const oidc = fakeGoogleOidc(GOOGLE_ADMIN_REDIRECT);
  oidc.identity = { sub: ADMIN_SUB, email: ADMIN_EMAIL };
  const list = [...emails];
  return { oidc, emails: list, admin: { oidc, entropy: new SequentialEntropy(), allowedEmails: list } };
}

/** Directorio de estáticos mínimo (como `dist/` de producción): solo `index.html`. */
export function staticRootWithIndex(): string {
  const dir = mkdtempSync(join(tmpdir(), 'argos-admin-static-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>ARGOS</title></head><body><div id="root"></div></body></html>');
  return dir;
}

export const setCookies = (r: ApiResponse): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
export const cookieNamed = (r: ApiResponse, name: string): string | undefined => setCookies(r).find((c) => c.startsWith(`${name}=`));
export const valueOf = (cookie: string | undefined): string => cookie!.split(';')[0]!.split('=')[1]!;
export const stateOfUrl = (url: string): string => new URL(url).searchParams.get('state')!;

export const adminStart = (a: Api, options: { ip?: string } = {}) => a.call('GET', '/api/admin/auth/google/start', { csrf: false, contract: false, ...options });
export const adminCallback = (a: Api, oauth: string | null, query: string, options: { ip?: string } = {}) =>
  a.call('GET', `/api/admin/auth/google/callback?${query}`, { csrf: false, contract: false, cookie: oauth === null ? null : `${ADMIN_OAUTH_COOKIE}=${oauth}`, ...options });

/** Flujo completo con Google simulado: devuelve la respuesta del callback y la cookie `argos_admin_session=...` (o `null` si no se emitió). */
export async function adminLogin(a: Api, options: { ip?: string } = {}): Promise<{ started: ApiResponse; done: ApiResponse; cookie: string | null }> {
  const started = await adminStart(a, options);
  const oauth = started.status === 302 ? valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE)) : null;
  const state = started.status === 302 ? stateOfUrl(started.headers['location'] as string) : 'x';
  const done = await adminCallback(a, oauth, `code=${GOOGLE_CODE}&state=${state}`, options);
  const session = cookieNamed(done, ADMIN_SESSION_COOKIE);
  return { started, done, cookie: session === undefined ? null : `${ADMIN_SESSION_COOKIE}=${valueOf(session)}` };
}

/** Todo lo observable de una respuesta salvo `date`: estado, cuerpo y cabeceras (EDGE-009-008: «cuerpo, cabeceras»). */
export const observable = (r: ApiResponse): { status: number; text: string; headers: Record<string, unknown> } => {
  const { date: _date, ...headers } = r.headers as Record<string, unknown>;
  return { status: r.status, text: r.text, headers };
};
