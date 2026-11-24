/**
 * Soporte común de los E2E de: altas por la API real (misma sesión que el navegador, con la cabecera CSRF)
 * y la auditoría de accesibilidad con `@axe-core/playwright` a 320, 1024 y 1280 px (REQ-UI-004). No hay reglas
 * propias: se usan las de axe-core con las etiquetas WCAG 2.1 A/AA y solo se filtra por impacto.
 *
 * @implements REQ-UI-004
 */
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { ScryptPasswordHasherAdapter } from '../../../src/infrastructure/adapters/scrypt-password-hasher.adapter.ts';
import { openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { activateInFile } from '../../fixtures/active-accounts.ts';

export const VIEWPORT_WIDTHS = [320, 1024, 1280] as const;
/** Anchos de la v2.1 (REQ-UI2-008, SC-005): se añade el de 768 px, donde cambia el app shell. */
export const VIEWPORT_WIDTHS_V21 = [320, 768, 1024, 1280] as const;
const CSRF = { 'X-Argos-Request': '1' } as const;

/** Fecha YYYY-MM-DD en America/Bogota (la zona del servidor de desarrollo) desplazada `days` días desde hoy. */
export function isoDateFromToday(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const shifted = new Date(`${today}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Escribe una fecha ISO en un `DateField` (007): el `fieldset` del campo (p. ej. `#weights-recordedAt`) contiene los segmentos «Día», «Mes» y «Año»; se teclean los
 * 8 dígitos seguidos sin Tab, de modo que el auto-avance es el único camino (REQ-FEC7-002).
 */
export async function typeDate(page: Page, field: Locator, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-');
  const first = field.getByLabel('Día');
  await first.click();
  await first.selectText(); // si «Día» ya tenía el foco, el clic no selecciona: así escribir siempre reemplaza
  await page.keyboard.type(`${day}${month}${year}`);
  await expect(field.getByLabel('Año')).toHaveValue(year!);
}

/** POST a la API con la cabecera CSRF; falla la prueba si la respuesta no es la esperada. */
export async function apiPost<T = Record<string, unknown>>(request: APIRequestContext, path: string, data: unknown, expected = 201): Promise<T> {
  const response = await request.post(`/api${path}`, { headers: CSRF, data });
  expect(response.status(), `POST /api${path}: ${await response.text()}`).toBe(expected);
  return (await response.json()) as T;
}

/** Respuesta de la API reducida a lo que comparan los E2E: estado HTTP, `code` del catálogo RFC 9457 (si es un problema) y cuerpo. */
export interface ApiOutcome<T = unknown> {
  readonly status: number;
  readonly code: string | null;
  readonly body: T;
}

/** Llamada a la API con la sesión del contexto; no afirma nada: la prueba compara `status` y `code`. Las escrituras llevan la cabecera CSRF. */
export async function apiCall<T = unknown>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<ApiOutcome<T>> {
  const response = await request.fetch(`/api${path}`, { method, headers: method === 'GET' ? {} : CSRF, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  const body = (text === '' ? null : JSON.parse(text)) as T;
  const code = typeof body === 'object' && body !== null && 'code' in body ? String((body as { code: unknown }).code) : null;
  return { status: response.status(), code, body };
}

/** Base SQLite del servidor E2E principal (la fija `playwright.config.ts` y los workers la heredan). */
export function e2eDatabasePath(): string {
  const path = process.env['ARGOS_E2E_DATABASE'];
  if (path === undefined) throw new Error('ARGOS_E2E_DATABASE no está definida: los E2E se ejecutan con playwright.config.ts');
  return path;
}

/**
 * Crea una cuenta `ACTIVE` por REPOSITORIO en el archivo SQLite del servidor (arnés de T1244, ADR-009-10) sin pasar por el registro: desde 009 el registro nace `PENDING` sin sesión
 * y además el límite de altas por IP (EDGE-009-040, 5 por instancia) impediría sembrar las decenas de cuentas de la suite. El hash es el scrypt real del adaptador de producción.
 */
export async function seedActiveAccount(databasePath: string, username: string, displayName: string, password: string): Promise<void> {
  const db = openSqliteDatabase(databasePath);
  try {
    const passwordHash = await new ScryptPasswordHasherAdapter().hash(password);
    await new SqliteUnitOfWork(db).runInTransaction((repositories) =>
      repositories.users.insert({
        id: randomUUID(),
        username,
        displayName,
        createdAt: new Date().toISOString(),
        email: null,
        preferredLanguage: 'es',
        timezone: 'America/Bogota',
        passwordHash,
      }),
    );
  } finally {
    db.close();
  }
}

/**
 * Deja al usuario con sesión en el contexto del navegador (REQ-AUTH2-001): cuenta `ACTIVE` sembrada por repositorio (`seedActiveAccount`) e inicio de sesión real por la API, de modo que la
 * cookie queda en ese contexto. `databasePath` es la base del servidor bajo prueba (por defecto, la del `webServer` principal). La contraseña debe cumplir INV-AUTH2-001.
 */
export async function registerViaApi(request: APIRequestContext, username: string, displayName: string, password: string, databasePath: string = e2eDatabasePath()): Promise<void> {
  await seedActiveAccount(databasePath, username, displayName, password);
  await apiPost(request, '/auth/login', { username, password }, 200);
}

/**
 * Tras registrarse por la interfaz (la SPA termina en `/solicitud-en-revision`, sin sesión), aprueba la cuenta por repositorio (helper de T1244, sin pasar por `/admin`) y entra por `/login`
 * como lo haría la persona: el resultado es la sesión abierta en `/`.
 */
export async function approveAndSignInViaUi(page: Page, username: string, password: string, databasePath: string = e2eDatabasePath()): Promise<void> {
  await expect(page).toHaveURL(/\/solicitud-en-revision$/);
  await activateInFile(databasePath, username);
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function createPetViaApi(request: APIRequestContext, name: string, species: 'DOG' | 'CAT' | 'CANINE' | 'FELINE', birthDate = '2020-05-01'): Promise<string> {
  const pet = await apiPost<{ id: string }>(request, '/pets', { name, species, breed: 'Mestiza', birthDate, sex: 'MALE', avatarUrl: null });
  return pet.id;
}

/** Id del hogar con ese nombre entre los hogares ACTIVE del usuario del contexto. */
export async function householdIdByName(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get('/api/households');
  const households = (await response.json()) as Array<{ household: { id: string; name: string } }>;
  return households.find((h) => h.household.name === name)!.household.id;
}

/**
 * axe-core (WCAG 2.1 A/AA) en los tres anchos. Devuelve las violaciones `critical`/`serious` y el desbordamiento
 * horizontal como texto legible; la prueba espera la lista vacía. Restaura el ancho de escritorio al terminar.
 */
export async function accessibilityFindings(page: Page, screen: string): Promise<string[]> {
  const findings: string[] = [];
  for (const width of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const violation of result.violations) {
      if (violation.impact === 'critical' || violation.impact === 'serious') {
        findings.push(`${screen}@${width}px ${violation.impact} ${violation.id}: ${violation.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      }
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
      findings.push(`${screen}@${width}px desbordamiento horizontal`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return findings;
}

/**
 * axe-core (WCAG 2.1 A/AA) en los anchos indicados (la Rebanada 6 usa `VIEWPORT_WIDTHS_V21`). Devuelve las violaciones `critical`/`serious` y el desbordamiento
 * horizontal como texto legible; la prueba espera la lista vacía. Restaura el ancho de escritorio al terminar.
 */
export async function accessibilityFindingsAt(page: Page, screen: string, widths: readonly number[]): Promise<string[]> {
  const findings: string[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const violation of result.violations) {
      if (violation.impact === 'critical' || violation.impact === 'serious') {
        findings.push(`${screen}@${width}px ${violation.impact} ${violation.id}: ${violation.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      }
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
      findings.push(`${screen}@${width}px desbordamiento horizontal`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return findings;
}

