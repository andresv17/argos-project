import { describe, expect, it } from 'vitest';
import { can, type RbacRole } from '../../src/domain/access/rbac.ts';

/**
 * T271 / D-T271-2 (decisión de Neo, opción b): matriz pura can(rol, 'EXPORT_IMPORT_BACKUP') para los 4 roles vigentes
 * (REQ-RBAC-001, tabla §5.2: exportar e importar el respaldo propio lo permiten los 4 roles). Sin firmas inventadas
 * en los casos de uso; un rol desconocido queda denegado.
 *
 * @implements REQ-RBAC-001, REQ-BACKUP2-001, INV-ACC2-001
 */
describe('matriz EXPORT_IMPORT_BACKUP (REQ-RBAC-001)', () => {
  it.each([
    ['OWNER', true],
    ['ADMIN', true],
    ['CAREGIVER', true],
    ['READER', true],
  ] as const)('[REQ-RBAC-001] %s → %s', (role, expected) => {
    expect(can(role, 'EXPORT_IMPORT_BACKUP')).toBe(expected);
  });

  it('[REQ-RBAC-001][INV-ACC2-001] un rol desconocido queda denegado', () => {
    expect(can('SIN_ACCION_EXPORT' as unknown as RbacRole, 'EXPORT_IMPORT_BACKUP')).toBe(false);
  });
});
