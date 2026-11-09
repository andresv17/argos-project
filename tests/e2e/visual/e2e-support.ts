/**
 * Soporte común de los E2E de TASK-114: altas por la API real (misma sesión que el navegador, con la cabecera CSRF)
 * y la auditoría de accesibilidad con `@axe-core/playwright` a 320, 1024 y 1280 px (REQ-UI-004). No hay reglas
 * propias: se usan las de axe-core con las etiquetas WCAG 2.1 A/AA y solo se filtra por impacto.
 *
 * @implements REQ-UI-004
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const VIEWPORT_WIDTHS = [320, 1024, 1280] as const;
const CSRF = { 'X-Argos-Request': '1' } as const;

/** Fecha YYYY-MM-DD en America/Bogota (la zona del servidor de desarrollo) desplazada `days` días desde hoy. */
export function isoDateFromToday(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const shifted = new Date(`${today}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** POST a la API con la cabecera CSRF; falla la prueba si la respuesta no es la esperada. */
export async function apiPost<T = Record<string, unknown>>(request: APIRequestContext, path: string, data: unknown, expected = 201): Promise<T> {
  const response = await request.post(`/api${path}`, { headers: CSRF, data });
  expect(response.status(), `POST /api${path}: ${await response.text()}`).toBe(expected);
  return (await response.json()) as T;
}

/** Registra al usuario desde el contexto del navegador: la cookie de sesión queda en ese contexto (REQ-AUTH-001). */
export async function registerViaApi(request: APIRequestContext, username: string, displayName: string, password: string): Promise<void> {
  await apiPost(request, '/auth/register', { username, displayName, password });
}

export async function createPetViaApi(request: APIRequestContext, name: string, species: 'DOG' | 'CAT', birthDate = '2020-05-01'): Promise<string> {
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
