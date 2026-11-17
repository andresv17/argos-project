import { describe, expect, it } from 'vitest';

// Matriz de permisos REQ-RBAC-001 (specs/002-plataforma-v21/spec.md, §5.2).
// Nombres de roles y acciones tomados de contracts/schemas/identity.schema.json (RbacRole, RbacAction).
// Orden de columnas: OWNER (Propietario Legal / propietario del hogar), ADMIN, CAREGIVER, READER.
// 11 acciones x 4 roles = 44 casos (SC-008).

type Outcome = 'permitido' | 'denegado';

interface MatrixRow {
  readonly id: string;
  readonly action: string;
  readonly outcomes: readonly [Outcome, Outcome, Outcome, Outcome];
}

const ROLES = ['OWNER', 'ADMIN', 'CAREGIVER', 'READER'] as const;

const MATRIX: readonly MatrixRow[] = [
  { id: 'M01', action: 'EDIT_PET_BASICS', outcomes: ['permitido', 'permitido', 'denegado', 'denegado'] },
  { id: 'M02', action: 'DELETE_PET', outcomes: ['permitido', 'denegado', 'denegado', 'denegado'] },
  { id: 'M03', action: 'WRITE_HEALTH_EVENTS', outcomes: ['permitido', 'permitido', 'permitido', 'denegado'] },
  { id: 'M04', action: 'DELETE_HEALTH_EVENTS', outcomes: ['permitido', 'permitido', 'denegado', 'denegado'] },
  {
    id: 'M05',
    action: 'WRITE_WEIGHTS_AND_MEASUREMENTS',
    outcomes: ['permitido', 'permitido', 'permitido', 'denegado'],
  },
  {
    id: 'M06',
    action: 'WRITE_APPOINTMENTS_AND_PARAMETERS',
    outcomes: ['permitido', 'permitido', 'denegado', 'denegado'],
  },
  { id: 'M07', action: 'DELETE_OTHER_RECORDS', outcomes: ['permitido', 'permitido', 'denegado', 'denegado'] },
  { id: 'M08', action: 'MANAGE_HOUSEHOLD_MEMBERS', outcomes: ['permitido', 'permitido', 'denegado', 'denegado'] },
  { id: 'M09', action: 'TRANSFER_PET_OWNERSHIP', outcomes: ['permitido', 'denegado', 'denegado', 'denegado'] },
  { id: 'M10', action: 'ASSIGN_PET_TO_HOUSEHOLDS', outcomes: ['permitido', 'denegado', 'denegado', 'denegado'] },
  { id: 'M11', action: 'EXPORT_IMPORT_BACKUP', outcomes: ['permitido', 'permitido', 'permitido', 'permitido'] },
];

// Expansión a 44 casos concretos: un caso por (fila de la matriz, rol).
const CASES: ReadonlyArray<readonly [string, string, string, Outcome]> = MATRIX.flatMap((row) =>
  ROLES.map((role, index) => [`${row.id}·${role}`, role, row.action, row.outcomes[index]!] as const),
);

describe('matriz de permisos can(rol efectivo, acción) (REQ-RBAC-001, SC-008, INV-ACC2-002)', () => {
  // La importación es dinámica dentro de cada caso para que cada celda falle por separado
  // mientras src/domain/access/rbac.ts no exista (y no quede el archivo entero sin ejecutarse).
  it.each(CASES)('[REQ-RBAC-001 · %s] can(%s, %s) es %s', async (_caseId, role, action, outcome) => {
    const { can } = await import('../../src/domain/access/rbac.ts');
    expect(can(role as never, action as never)).toBe(outcome === 'permitido');
  });
});
