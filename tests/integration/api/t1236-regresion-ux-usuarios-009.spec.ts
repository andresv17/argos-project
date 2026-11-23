import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T1236 (Feature 009, Fase 3, #19): regresión de la UX de usuarios. REQ-ADM9-001, NFR-009-001; SC-009-010.
 * Inventario por búsqueda en `src/presentation/web/`: cero referencias NUEVAS al portal de administración (`/admin`, `admin.html`, `presentation/admin`) y la línea base
 * cerrada de la feature 008 (archivos que mencionan «Administrador» como ROL DE HOGAR) fija en exactamente tres archivos, ni más ni menos.
 * `T1236_WEB_ROOT` (solo pruebas) apunta el inventario a una copia contaminada para demostrar que la prueba falla (rojo) cuando el conjunto difiere.
 */

const REPO = resolve(import.meta.dirname, '../../..');
const WEB_ROOT = process.env['T1236_WEB_ROOT'] ?? join(REPO, 'src/presentation/web');
const ADMIN_ROLE_BASELINE_008 = ['HouseholdsPage.tsx', 'role-help.ts', 'view-model.ts'];
const PORTAL_REFERENCE = /\/admin|admin\.html|presentation\/admin/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css|html|json|svg)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

describe('T1236 [NFR-009-001] [SC-009-010] inventario de la aplicación de usuarios', () => {
  it('cero referencias a /admin, admin.html y presentation/admin en src/presentation/web', () => {
    const offenders = sourceFiles(WEB_ROOT)
      .filter((file) => PORTAL_REFERENCE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(WEB_ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('los archivos que mencionan «Administrador» son exactamente los 3 de la línea base 008 (rol de hogar)', () => {
    const mentioning = sourceFiles(WEB_ROOT)
      .filter((file) => /Administrador/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(file.lastIndexOf('/') + 1))
      .sort();
    expect(mentioning).toEqual(ADMIN_ROLE_BASELINE_008);
  });

  it('la entrada de la app de usuarios (index.html) no menciona el portal', () => {
    expect(readFileSync(join(REPO, 'index.html'), 'utf8')).not.toMatch(/admin/i);
  });
});
