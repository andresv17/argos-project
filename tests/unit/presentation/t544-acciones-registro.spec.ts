/**
 * T544 [US2] interfaz de edición y borrado de registros (REQ-BOR-001, REQ-BOR-002, REQ-BOR-003): diálogo de confirmación de borrado,
 * mensaje del 409 de SUPERSEDED y acciones de edición y borrado solo en registros vigentes y solo con el permiso de la matriz.
 * Presentación pura: la validación real es del servidor (ERR-ACC-FORBIDDEN, ERR-REC-SUPERSEDED-IMMUTABLE).
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeleteRecordDialog } from '../../../src/presentation/web/components/RecordActions.tsx';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { ApiProblem, catalogProblem, toProblem } from '../../../src/presentation/web/api.ts';
import { RECORD_MODULES, deleteRecord, updateRecord, type RecordModule } from '../../../src/presentation/web/records.ts';
import { canDeleteRecord, canEditRecord, recordActionMessage, recordInitialValues, recordLabel } from '../../../src/presentation/web/record-actions.ts';
import type { PetDashboardView } from '../../../src/presentation/web/view-model.ts';
import { dashboardAs, MATRIX, type Role } from './rebanada6-fixtures.ts';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const TS = '2026-11-05T12:00:00.000Z';

/** Ficha con un registro vigente de cada módulo y la vacuna Rabia anterior reemplazada (fixture de la rebanada 6). */
function dashboardWithRecords(role: Role): PetDashboardView {
  const base = dashboardAs(role);
  const petId = base.profile.id;
  return {
    ...base,
    weights: [{ record: { id: 'w1', petId, recordedAt: '2026-10-01', weightKg: 12, notes: null, createdAt: TS }, deltaKg: null, deltaPercent: null }],
    bodyMeasurements: [{ id: 'm1', petId, recordedAt: '2026-10-02', neckCm: 30, chestCm: 50, backLengthCm: 40, waistCm: 45, notes: null, createdAt: TS }],
    dewormings: [],
    medicalVisits: [{ id: 'c1', petId, visitDate: '2026-10-03', reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCentral', observations: null, createdAt: TS }],
    customParameters: [{ id: 'p1', petId, recordedAt: '2026-10-04', category: 'ALLERGY', title: 'Polen', description: 'Estornudos', notes: null, symptomType: null, severity: null, createdAt: TS }],
  } as unknown as PetDashboardView;
}
const render = (role: Role, tab: RecordModule): string =>
  renderToStaticMarkup(h(PetDashboard, { dashboard: dashboardWithRecords(role), activeTab: tab, onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop, onEditRecord: asyncNoop, onDeleteRecord: asyncNoop }));
const buttons = (markup: string): string[] => [...markup.matchAll(/<button[^>]*aria-label="((?:Editar|Eliminar) [^"]+)"/g)].map((m) => m[1]!);

describe('T544 permisos de las acciones por módulo (REQ-RBAC-001)', () => {
  it('[REQ-BOR-003] editar sigue los permisos de escritura de cada módulo y borrar los de borrado, para los 4 roles', () => {
    const modules = RECORD_MODULES.map((m) => m.id);
    const observed = Object.fromEntries((['OWNER', 'ADMIN', 'CAREGIVER', 'READER'] as const).map((role) => [role, { edit: modules.filter((m) => canEditRecord(m, MATRIX[role])), remove: modules.filter((m) => canDeleteRecord(m, MATRIX[role])) }]));
    expect(observed).toEqual({
      OWNER: { edit: modules, remove: modules },
      ADMIN: { edit: modules, remove: modules },
      CAREGIVER: { edit: ['weights', 'measurements', 'vaccinations', 'dewormings'], remove: [] },
      READER: { edit: [], remove: [] },
    });
  });
});

describe('T544 acciones solo en registros vigentes (REQ-BOR-002)', () => {
  it('[REQ-BOR-002] el Propietario ve Editar y Eliminar en cada registro vigente de los 6 módulos', () => {
    const labels = Object.fromEntries(RECORD_MODULES.map((m) => [m.id, buttons(render('OWNER', m.id))]));
    expect(labels).toEqual({
      weights: ['Editar peso del 2026-10-01', 'Eliminar peso del 2026-10-01'],
      measurements: ['Editar medidas del 2026-10-02', 'Eliminar medidas del 2026-10-02'],
      vaccinations: ['Editar vacuna Rabia del 2026-10-01', 'Eliminar vacuna Rabia del 2026-10-01'],
      dewormings: [],
      visits: ['Editar consulta del 2026-10-03', 'Eliminar consulta del 2026-10-03'],
      customParameters: ['Editar parámetro Polen del 2026-10-04', 'Eliminar parámetro Polen del 2026-10-04'],
    });
  });

  it('[REQ-BOR-002] los registros del acordeón «Registros anteriores» (SUPERSEDED) no llevan ninguna acción', () => {
    const markup = render('OWNER', 'vaccinations');
    const accordion = /<details[^>]*>\s*<summary[^>]*>[^<]*Registros anteriores[^<]*<\/summary>([\s\S]*?)<\/details>/.exec(markup)![1]!;
    expect([accordion.includes('data-alert-status="SUPERSEDED"'), buttons(accordion), accordion.includes('>Editar<'), accordion.includes('>Eliminar<')]).toEqual([true, [], false, false]);
    expect(buttons(markup).filter((b) => b.includes('2025-10-01'))).toEqual([]);
  });

  it('[REQ-BOR-003][REQ-RBAC-001] el Cuidador edita pero no borra; no ve acciones en consultas ni parámetros; el Lector no ve ninguna', () => {
    expect([buttons(render('CAREGIVER', 'weights')), buttons(render('CAREGIVER', 'vaccinations')), buttons(render('CAREGIVER', 'visits')), buttons(render('CAREGIVER', 'customParameters'))]).toEqual([
      ['Editar peso del 2026-10-01'],
      ['Editar vacuna Rabia del 2026-10-01'],
      [],
      [],
    ]);
    expect(RECORD_MODULES.flatMap((m) => buttons(render('READER', m.id)))).toEqual([]);
  });

  it('[REQ-BOR-003] sin manejadores (onEditRecord/onDeleteRecord) la ficha no muestra acciones', () => {
    const markup = renderToStaticMarkup(h(PetDashboard, { dashboard: dashboardWithRecords('OWNER'), activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect(buttons(markup)).toEqual([]);
  });
});

describe('T544 diálogo de confirmación de borrado (REQ-BOR-001)', () => {
  const dialog = renderToStaticMarkup(h(DeleteRecordDialog, { label: 'peso del 2026-10-01', onConfirm: noop, onCancel: noop }));
  const text = dialog.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('[REQ-BOR-001] es un alertdialog con título, aviso de borrado definitivo y los botones «Eliminar definitivamente» y «Cancelar»', () => {
    expect(dialog).toContain('role="alertdialog"');
    expect(dialog).toMatch(/aria-labelledby="[^"]+"/);
    expect(dialog).toMatch(/aria-describedby="[^"]+"/);
    expect(text).toContain('Eliminar peso del 2026-10-01');
    expect(text).toContain('Se eliminará de forma definitiva');
    expect(text).toContain('No se puede deshacer');
    expect([...dialog.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])).toEqual(['Eliminar definitivamente', 'Cancelar']);
  });

  it('[REQ-BOR-001] no pide escribir el nombre (eso es de la mascota): un solo paso de confirmación', () => {
    expect(dialog).not.toContain('<input');
  });
});

describe('T544 mensaje del 409 de SUPERSEDED y de los demás errores (REQ-BOR-002)', () => {
  it('[ERR-REC-SUPERSEDED-IMMUTABLE] el 409 se muestra con el texto del catálogo: «Reemplazada por registro posterior…»', () => {
    const message = recordActionMessage(new ApiProblem(catalogProblem('ERR-REC-SUPERSEDED-IMMUTABLE')));
    expect(message).toContain('Reemplazada por registro posterior');
    expect(message).toContain('no se puede modificar');
  });

  it('[ERR-REC-CONFLICT][REQ-BOR-005] el 409 de revisión desactualizada se muestra como «El registro cambió; recarga y vuelve a intentarlo» y no como error inesperado', () => {
    const body = { type: 'urn:argos:error:ERR-REC-CONFLICT', code: 'ERR-REC-CONFLICT', title: 'Registro modificado por otra persona', status: 409, detail: 'x', invariantRef: 'INV-REG-003' };
    expect(toProblem(body).code).toBe('ERR-REC-CONFLICT');
    expect(recordActionMessage(new ApiProblem(toProblem(body)))).toContain('El registro cambió; recarga y vuelve a intentarlo');
  });

  it('[ERR-ACC-FORBIDDEN][ERR-INTERNAL-UNEXPECTED] un 403 usa su texto y un error ajeno a la API cae en el error inesperado', () => {
    expect(recordActionMessage(new ApiProblem(catalogProblem('ERR-ACC-FORBIDDEN')))).toContain('tu rol no permite');
    expect(recordActionMessage(new TypeError('boom'))).toBe(recordActionMessage(new ApiProblem(catalogProblem('ERR-INTERNAL-UNEXPECTED'))));
  });
});

describe('T544 valores iniciales y rótulos de edición', () => {
  it('[REQ-BOR-003] los valores iniciales del formulario salen del registro como texto, sin id, petId, createdAt ni revision, y los nulos quedan vacíos', () => {
    expect(recordInitialValues('weights', { id: 'w1', petId: 'p', recordedAt: '2026-10-01', weightKg: 12.5, notes: null, createdAt: TS, revision: 3 })).toEqual({ recordedAt: '2026-10-01', weightKg: '12.5', notes: '' });
    expect(recordInitialValues('vaccinations', { id: 'v', petId: 'p', category: 'VACCINE', vaccineName: 'Rabia', appliedAt: '2026-10-01', nextBoosterAt: null, batchOrClinic: 'L1', veterinarianName: null, veterinarianLicense: null, notes: null, createdAt: TS })).toEqual({
      vaccineName: 'Rabia',
      appliedAt: '2026-10-01',
      nextBoosterAt: '',
      batchOrClinic: 'L1',
      notes: '',
    });
  });

  it('[REQ-BOR-001] el rótulo nombra el módulo, el dato y la fecha para el lector de pantalla', () => {
    expect([
      recordLabel('weights', { recordedAt: '2026-10-01' }),
      recordLabel('vaccinations', { vaccineName: 'Rabia', appliedAt: '2026-10-01' }),
      recordLabel('dewormings', { productBrand: 'Drontal', appliedAt: '2026-09-01' }),
      recordLabel('visits', { visitDate: '2026-10-03' }),
    ]).toEqual(['peso del 2026-10-01', 'vacuna Rabia del 2026-10-01', 'desparasitación Drontal del 2026-09-01', 'consulta del 2026-10-03']);
  });
});

describe('T544 llamadas del cliente (PATCH y DELETE del registro)', () => {
  function fake() {
    const calls: Array<{ method: string; url: string; init: unknown }> = [];
    const respond = (method: string) => async (url: string, init: unknown) => {
      calls.push({ method, url, init });
      return { data: {}, response: new Response(null, { status: 200 }) };
    };
    return { calls, api: { PATCH: respond('PATCH'), DELETE: respond('DELETE') } as never };
  }

  it('[REQ-BOR-003] updateRecord manda PATCH a la colección del módulo con `collection` en el cuerpo y la cabecera CSRF', async () => {
    const { calls, api } = fake();
    await updateRecord(api, 'customParameters', 'pet-1', 'rec-1', { title: 'Nuevo' }, 0);
    await updateRecord(api, 'measurements', 'pet-1', 'rec-2', { neckCm: 31 }, 4);
    // D-16 A: la revisión leída viaja entre comillas en If-Match.
    expect(calls).toEqual([
      { method: 'PATCH', url: '/pets/{petId}/records/{collection}/{recordId}', init: { params: { header: { 'X-Argos-Request': '1' }, path: { petId: 'pet-1', collection: 'custom-parameters', recordId: 'rec-1' } }, headers: { 'If-Match': '"0"' }, body: { collection: 'custom-parameters', title: 'Nuevo' } } },
      { method: 'PATCH', url: '/pets/{petId}/records/{collection}/{recordId}', init: { params: { header: { 'X-Argos-Request': '1' }, path: { petId: 'pet-1', collection: 'measurements', recordId: 'rec-2' } }, headers: { 'If-Match': '"4"' }, body: { collection: 'measurements', neckCm: 31 } } },
    ]);
  });

  it('[REQ-BOR-001] deleteRecord manda DELETE con la cabecera CSRF', async () => {
    const { calls, api } = fake();
    await deleteRecord(api, 'visits', 'pet-1', 'rec-3');
    expect(calls).toEqual([{ method: 'DELETE', url: '/pets/{petId}/records/{collection}/{recordId}', init: { params: { header: { 'X-Argos-Request': '1' }, path: { petId: 'pet-1', collection: 'visits', recordId: 'rec-3' } } } }]);
  });
});
