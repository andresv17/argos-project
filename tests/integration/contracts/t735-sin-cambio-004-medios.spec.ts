/**
 * T735 [US2] la 005 no cambia la matriz de permisos ni la cuota de 004 y no añade tipo ni fecha de examen (REQ-CLI5-002, REQ-CLI5-003; SC-005-008, SC-005-009, SC-005-011).
 * Solo lectura: compara el estado vigente con lo que fijan los contratos de 004 (`media.schema.json`, OpenAPI), la matriz RBAC, los valores por defecto de la cuota
 * y la tabla `pet_media` creada por la migración (SQLite). Cualquier cambio de estas piezas rompe esta prueba y exige la firma de Neo de la decisión correspondiente.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { can, type PetAction } from '../../../src/domain/access/rbac.ts';
import { APP_CONFIG_DEFAULTS } from '../../../src/infrastructure/config/app-config.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const MEDIA_SCHEMA = JSON.parse(read('specs/004-catalogos-registros-archivos/contracts/schemas/media.schema.json')) as { $defs: Record<string, { properties?: Record<string, unknown>; enum?: string[] }> };

describe('T735 matriz de permisos de medios de 004 sin cambio (REQ-CLI5-003, SC-005-009)', () => {
  it('[SC-005-009] leer: los cuatro roles; subir: propietario, administrador y cuidador; borrar: propietario y administrador (el Lector solo ve)', () => {
    const roles = ['OWNER', 'ADMIN', 'CAREGIVER', 'READER'] as const;
    const allowed = (action: PetAction) => roles.filter((role) => can(role, action));
    expect([allowed('READ_MEDIA'), allowed('WRITE_MEDIA'), allowed('DELETE_MEDIA')]).toEqual([['OWNER', 'ADMIN', 'CAREGIVER', 'READER'], ['OWNER', 'ADMIN', 'CAREGIVER'], ['OWNER', 'ADMIN']]);
  });
});

describe('T735 cuota de 004 sin cambio (REQ-CLI5-003, SC-005-008)', () => {
  it('[SC-005-008] la cuota por propietario sigue en 1 GiB, el máximo por archivo en 10 MiB y las subidas simultáneas en 4', () => {
    expect([APP_CONFIG_DEFAULTS.ARGOS_MEDIA_MAX_BYTES_PER_OWNER, APP_CONFIG_DEFAULTS.ARGOS_MEDIA_MAX_BYTES, APP_CONFIG_DEFAULTS.ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS]).toEqual(['1073741824', '10485760', '4']);
  });
});

describe('T735 sin tipo ni fecha de examen (REQ-CLI5-002, D5-04; SC-005-011)', () => {
  it('[SC-005-011] MediaItem de 004 conserva sus 7 propiedades y kind sigue siendo FILE o PHOTO; el OpenAPI de 004 no menciona examen', () => {
    expect(Object.keys(MEDIA_SCHEMA.$defs['MediaItem']!.properties!).sort()).toEqual(['createdAt', 'id', 'kind', 'mime', 'originalName', 'petId', 'sizeBytes']);
    expect(MEDIA_SCHEMA.$defs['MediaKind']!.enum).toEqual(['FILE', 'PHOTO']);
    expect(read('specs/004-catalogos-registros-archivos/contracts/openapi/pet-tracker-api.openapi.yaml')).not.toMatch(/examType|examDate|EXAM_RESULT|XRAY/i);
  });

  it('REQ-CLI5-002: sin tipo ni fecha de examen, el rótulo es el nombre original y la fecha es created_at (D5-04 firmada)', () => {
    const props = Object.keys(MEDIA_SCHEMA.$defs['MediaItem']!.properties!);
    expect(props).toContain('originalName');
    expect(props).toContain('createdAt');
    expect(props.filter((p) => /exam|type|tipo/i.test(p))).toEqual([]);
  });

  it('[SC-005-011] la tabla pet_media no tiene columnas de tipo ni de fecha de examen: solo las 7 de 004', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    try {
      const columns = (db.prepare('PRAGMA table_info(pet_media)').all() as Array<{ name: string }>).map((c) => c.name).sort();
      expect(columns).toEqual(['created_at', 'id', 'kind', 'mime', 'original_name', 'pet_id', 'size_bytes']);
    } finally {
      db.close();
    }
  });
});
