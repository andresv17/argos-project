import { afterEach, describe, expect, it } from 'vitest';
import { AddWeightRecordUseCase } from '../../src/application/use-cases/record-use-cases.ts';
import { CreateShareLinkUseCase } from '../../src/application/use-cases/share-link-use-cases.ts';
import { GetSharedSummaryUseCase } from '../../src/application/use-cases/shared-view-use-cases.ts';
import { ANDRES, CARE_ENGINE_FACTORIES, EARLY, HOUSEHOLD_ID, LUCIA, MARIA, MEAL, MED, NOW, PET, accessRows, careCases, codeOf, logRows, routineRows, type CareEngine } from '../fixtures/care-012.ts';
import { KEY } from '../fixtures/share-harness.ts';
import { ANDRES_PETS } from '../fixtures/application-harness.ts';

/**
 * T1654 (Feature 012, Bloque C, #26; PRUEBAS ROJAS hasta T1655; `/keymaker`): integración y paridad Memoria / SQLite / PostgreSQL del cuidado por casos de uso (el servidor autoriza, no la UI): rutinas, tope de 20 y de 100 filas,
 * UNIQUE por ocurrencia de la serie lógica, reintento del mismo autor (200) y de otro usuario (409), 403 en servidor para `VIEW_ONLY`/sin nivel/`ADMIN`/`READER`, 201 en eventos clínicos heredados, reversión, ventana,
 * `careUntil` inclusivo, paginación con cursor atado, ausencia de cuidado en el enlace público y regresión sin cuidadores. PostgreSQL real se OMITE sin `TEST_DATABASE_URL`.
 * Fallan hoy porque `care-routine-use-cases.ts`, `care-log-use-cases.ts` y los repositorios `careRoutines`/`careLog`/`caregiverAccess` no existen (T1655). Reloj: jueves 2026-11-26 10:00 Bogotá = 15:00Z.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-002, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-007, REQ-CAR12-009, REQ-VET12-008, INV-VET12-004
 * Cubre SC-012-029, SC-012-030, SC-012-031, SC-012-032, SC-012-037, SC-012-038, SC-012-039, SC-012-040, SC-012-077 (paridad); además SC-012-025, SC-012-026, SC-012-033, SC-012-034, SC-012-036, SC-012-088.
 */
let engine: CareEngine | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

/** Otra mascota de ANDRES (titular): el cursor de ARGOS no vale en ella (LUNA es de MARIA: ANDRES recibiría 403 antes de llegar al cursor). */
const OTHER_OWN_PET = ANDRES_PETS.find((p) => p.id !== PET)!.id;
const FORBIDDEN = 'ERR-ACC-FORBIDDEN';
const INVALID = 'ERR-SCHEMA-VALIDATION-FAILED';
/** Desenvuelve `{ entry, created }` (F4): la entrada del registro. */
const ok = (result: unknown): Record<string, unknown> => (result as { entry: Record<string, unknown> }).entry;
const created = (result: unknown): boolean => (result as { created: boolean }).created;
const occ = (routineId: string, time = '09:00', status = 'DONE', extra: Record<string, unknown> = {}) => ({ routineId, occurrenceDate: '2026-11-26', occurrenceTime: time, status, ...extra });

for (const factory of CARE_ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1654 paridad de cuidado (${factory.name})`, { timeout: 60_000 }, () => {
    const boot = async (role?: 'ADMIN' | 'CAREGIVER' | 'READER' | 'MEMBER') => {
      engine = await factory.make(role);
      engine.setNow(EARLY); // R-1: el reloj solo avanza; effective_to >= effective_from
      return { use: careCases(engine.deps), engine };
    };
    const grant = (use: ReturnType<typeof careCases>, level: 'VIEW_ONLY' | 'BASIC_LOG', extra: Record<string, unknown> = {}) => use.setAccess(ANDRES, PET, MARIA, { level, ...extra });

    it('[SC-012-025][SC-012-026] un titular crea y lista una rutina de medicina; un CAREGIVER, un ADMIN, un MEMBER y un READER reciben 403 ERR-ACC-FORBIDDEN sin escribir (incluida medicación)', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string; seriesId: string; version: number; active: boolean };
      expect(routine.active).toBe(true);
      expect(((await use.listRoutines(ANDRES, PET)) as unknown as { items: Array<{ id: string }> }).items.map((r) => r.id)).toEqual([routine.id]);
      for (const role of ['CAREGIVER', 'ADMIN', 'READER', 'MEMBER'] as const) {
        const other = await factory.make(role);
        other.setNow(EARLY);
        expect(await codeOf(careCases(other.deps).createRoutine(MARIA, PET, MED))).toBe(FORBIDDEN);
        expect(await codeOf(careCases(other.deps).createRoutine(MARIA, PET, { ...MEAL }))).toBe(FORBIDDEN);
        expect(await routineRows(other)).toEqual([]);
        await other.dispose();
      }
      expect(await routineRows(e)).toHaveLength(1);
    });

    it('[SC-012-088] la captura de dosis se aplica en el servidor: TABLET 0,125, UNIT y una medicina sin fin no escriben; 600 MG exige confirmHighDose', async () => {
      const { use, engine: e } = await boot();
      expect(await codeOf(use.createRoutine(ANDRES, PET, { ...MED, doseUnit: 'TABLET', doseAmount: 0.125 }))).toBe(INVALID);
      expect(await codeOf(use.createRoutine(ANDRES, PET, { ...MED, doseUnit: 'UNIT', doseAmount: 5 }))).toBe(INVALID);
      expect(await codeOf(use.createRoutine(ANDRES, PET, { ...MED, endDate: undefined }))).toBe(INVALID);
      expect(await codeOf(use.createRoutine(ANDRES, PET, { ...MED, doseAmount: 600 }))).toBe(INVALID);
      expect(await routineRows(e)).toEqual([]);
      expect(await codeOf(use.createRoutine(ANDRES, PET, { ...MED, doseAmount: 600, confirmHighDose: true }))).toBe('OK');
      expect(await routineRows(e)).toHaveLength(1);
    });

    it('[SC-012-037] el tope de 20 rutinas ACTIVAS da 409 ERR-CAR12-ROUTINE-LIMIT; desactivar una libera cupo; las versiones sustituidas no cuentan', async () => {
      const { use, engine: e } = await boot();
      const created: Array<{ id: string; version: number }> = [];
      for (let i = 0; i < 20; i += 1) created.push((await use.createRoutine(ANDRES, PET, { ...MEAL, title: `Comida ${i}` })) as never);
      expect(await codeOf(use.createRoutine(ANDRES, PET, { ...MEAL, title: 'Comida 21' }))).toBe('ERR-CAR12-ROUTINE-LIMIT');
      expect(await routineRows(e)).toHaveLength(20);
      await use.deactivateRoutine(ANDRES, PET, created[0]!.id, created[0]!.version);
      expect(await codeOf(use.createRoutine(ANDRES, PET, { ...MEAL, title: 'Comida 21' }))).toBe('OK');
      expect(await codeOf(use.createRoutine(ANDRES, PET, MED))).toBe('ERR-CAR12-ROUTINE-LIMIT'); // 20 activas otra vez
    });

    it('[SC-012-037][m-1] el techo de 100 filas totales por mascota (activas + versiones) da ERR-CAR12-ROUTINE-LIMIT incluso al versionar una dosis', async () => {
      const { use, engine: e } = await boot();
      let current = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string; version: number };
      for (let i = 1; i < 100; i += 1) {
        const result = (await use.updateRoutine(ANDRES, PET, current.id, { doseAmount: 100 + i, expectedVersion: current.version })) as unknown as { routine: { id: string; version: number } };
        current = result.routine;
      }
      expect(await routineRows(e)).toHaveLength(100);
      // D-A (Neo): 422 antes que 409; una captura inválida con la mascota en el techo da 422, no LIMIT.
      expect(await codeOf(use.updateRoutine(ANDRES, PET, current.id, { doseAmount: 999, expectedVersion: current.version }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await codeOf(use.updateRoutine(ANDRES, PET, current.id, { doseAmount: 999, confirmHighDose: true, expectedVersion: current.version }))).toBe('ERR-CAR12-ROUTINE-LIMIT');
      // 422 también precede a STALE.
      expect(await codeOf(use.updateRoutine(ANDRES, PET, current.id, { doseAmount: 999, expectedVersion: current.version + 5 }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await routineRows(e)).toHaveLength(100);
    });

    it('[SC-012-025][H-C2] cambiar la dosis crea una versión nueva (misma serie, la anterior queda inactiva); una expectedVersion obsoleta o una fila ya sustituida da 409 ERR-CAR12-ROUTINE-STALE', async () => {
      const { use, engine: e } = await boot();
      const v1 = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string; seriesId: string; version: number };
      const result = (await use.updateRoutine(ANDRES, PET, v1.id, { doseAmount: 300, expectedVersion: v1.version })) as unknown as { versioned: boolean; supersededRoutineId: string; routine: { id: string; seriesId: string; doseAmount: number; supersedesRoutineId: string } };
      expect(result).toMatchObject({ versioned: true, supersededRoutineId: v1.id, routine: { seriesId: v1.seriesId, doseAmount: 300, supersedesRoutineId: v1.id } });
      const rows = await routineRows(e);
      expect(rows.map((r) => [r['id'], r['active']])).toEqual(expect.arrayContaining([[v1.id, false], [result.routine.id, true]]));
      expect(await codeOf(use.updateRoutine(ANDRES, PET, v1.id, { doseAmount: 400, expectedVersion: v1.version }))).toBe('ERR-CAR12-ROUTINE-STALE');
      expect(await codeOf(use.updateRoutine(ANDRES, PET, result.routine.id, { title: 'Otro', expectedVersion: 999 }))).toBe('ERR-CAR12-ROUTINE-STALE');
    });

    it('[SC-012-029] BASIC_LOG registra una toma: queda DONE con autor y hora del servidor (no del cliente) y late = false', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string };
      await grant(use, 'BASIC_LOG');
      engine!.setNow('2026-11-26T13:30:00.000Z'); // 08:30 Bogotá
      const entry = ok(await use.log(MARIA, PET, occ(routine.id, '08:00', 'DONE', { performedAt: '2020-01-01T00:00:00.000Z', performedByUserId: ANDRES, late: true })));
      expect(entry).toMatchObject({ status: 'DONE', late: false, performedByMe: true });
      const rows = await logRows(e);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ performedByUserId: MARIA, performedAt: '2026-11-26T13:30:00.000Z', status: 'DONE', late: false, occurrenceDate: '2026-11-26', occurrenceTime: '08:00' });
    });

    it('[SC-012-088][A-04] doseAmountAtTime y doseUnitAtTime salen de la versión que cubría la OCURRENCIA aunque se registre tras cambiar la dosis', async () => {
      const { use, engine: e } = await boot();
      const v1 = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string; version: number };
      await grant(use, 'BASIC_LOG');
      engine!.setNow('2026-11-26T13:30:00.000Z'); // 08:30: se cambia la dosis, la toma de las 08:00 queda cubierta por v1
      await use.updateRoutine(ANDRES, PET, v1.id, { doseAmount: 500, expectedVersion: v1.version });
      engine!.setNow('2026-11-26T13:45:00.000Z');
      expect(ok(await use.log(MARIA, PET, occ(v1.id, '08:00')))).toMatchObject({ doseAmountAtTime: 250, doseUnitAtTime: 'MG' });
      expect(await logRows(e)).toHaveLength(1);
    });

    it('[SC-012-030][SC-012-077][EDGE-012-049] VIEW_ONLY y sin nivel: 403 en servidor al registrar o revertir; un VIEW_ONLY sí registra un peso (201 heredado de CAREGIVER)', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string };
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '08:00')))).toBe(FORBIDDEN); // sin fila: VIEW_ONLY por defecto
      await grant(use, 'VIEW_ONLY');
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '08:00')))).toBe(FORBIDDEN);
      expect(await logRows(e)).toEqual([]);
      const seen = ((await use.householdToday(MARIA, HOUSEHOLD_ID)) as unknown as { pets: Array<{ petId: string; items: unknown[] }> }).pets;
      expect(seen.filter((p) => p.petId === PET)).toHaveLength(1); // R-8: el cuidador ve su mascota asignada en el hogar
      const mine = (await use.myAccess(MARIA, PET)) as unknown as Record<string, unknown>;
      expect(mine).toMatchObject({ caregiver: true, level: 'VIEW_ONLY', canViewRoutines: true, canLogCare: false, canManageRoutines: false, clinicalPermissionsUnchanged: true });
      const weight = await new AddWeightRecordUseCase(e.deps).execute(MARIA, PET, { recordedAt: '2026-11-05', weightKg: 33.1 });
      expect(weight.record.weightKg).toBe(33.1);
      expect(await codeOf(use.createRoutine(MARIA, PET, { ...MEAL }))).toBe(FORBIDDEN);
    });

    it('[SC-012-026][T-C5] ADMIN, MEMBER y READER del hogar no leen rutinas, pendientes ni historial (403) y el hogar les responde 200 con grupos vacíos; un ajeno recibe el 404 uniforme', async () => {
      for (const role of ['ADMIN', 'MEMBER', 'READER'] as const) {
        const { use } = await boot(role);
        await use.createRoutine(ANDRES, PET, MED);
        expect(await codeOf(use.listRoutines(MARIA, PET))).toBe(FORBIDDEN);
        expect(await codeOf(use.today(MARIA, PET))).toBe(FORBIDDEN);
        expect(await codeOf(use.history(MARIA, PET))).toBe(FORBIDDEN);
        expect(await codeOf(use.listAccess(MARIA, PET))).toBe(FORBIDDEN);
        expect(await codeOf(use.setAccess(MARIA, PET, MARIA, { level: 'BASIC_LOG' }))).toBe(FORBIDDEN); // el ADMIN no concede niveles (H-C3)
        const groups = ((await use.householdToday(MARIA, HOUSEHOLD_ID)) as unknown as { pets: Array<{ petId: string; items: unknown[] }> }).pets;
        expect(groups.filter((p) => p.petId === PET)).toEqual([]); // sin acceso de cuidado a ARGOS: no aparece (solo su propia mascota, con items vacío)
        expect(groups.every((p) => p.items.length === 0)).toBe(true);
        expect(await codeOf(use.today(LUCIA, PET))).toBe('ERR-PET-NOT-FOUND');
        await engine!.dispose();
        engine = null;
      }
    });

    it('[SC-012-026][R-8] un cuidador con acceso a una mascota sin rutinas la ve en el hogar con items vacío (el criterio es el acceso, no las rutinas)', async () => {
      const { use } = await boot();
      await grant(use, 'VIEW_ONLY');
      const result = (await use.householdToday(MARIA, HOUSEHOLD_ID)) as unknown as { pets: Array<{ petId: string; items: unknown[] }> };
      expect(result.pets.filter((p) => p.petId === PET)).toEqual([expect.objectContaining({ petId: PET, items: [] })]);
    });

    it('[SC-012-031] dos cuidadores sobre la misma toma: el segundo recibe 409 ERR-CAR12-ALREADY-LOGGED y NO queda una segunda fila', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string };
      await grant(use, 'BASIC_LOG');
      engine!.setNow('2026-11-26T13:30:00.000Z');
      await use.log(MARIA, PET, occ(routine.id, '08:00'));
      expect(await codeOf(use.log(ANDRES, PET, occ(routine.id, '08:00')))).toBe('ERR-CAR12-ALREADY-LOGGED');
      expect(await logRows(e)).toHaveLength(1);
    });

    it('[SC-012-032] el reintento del MISMO autor con el mismo status devuelve la fila existente (una sola fila); con otro status, 409; revertir libera la ocurrencia', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string };
      await grant(use, 'BASIC_LOG');
      engine!.setNow('2026-11-26T13:30:00.000Z');
      const firstResult = await use.log(MARIA, PET, occ(routine.id, '08:00'));
      const againResult = await use.log(MARIA, PET, occ(routine.id, '08:00'));
      const first = ok(firstResult);
      expect(created(firstResult)).toBe(true); // 201
      expect(created(againResult)).toBe(false); // 200: reintento del mismo autor
      expect(ok(againResult)['id']).toBe(first['id']);
      expect(await logRows(e)).toHaveLength(1);
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '08:00', 'SKIPPED', { note: 'No quiso' })))).toBe('ERR-CAR12-ALREADY-LOGGED');
      await use.revert(MARIA, PET, first['id'] as string);
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '08:00', 'SKIPPED', { note: 'No quiso' })))).toBe('OK');
      const rows = await logRows(e);
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r['revertedAt'] === null)).toHaveLength(1);
    });

    it('[SC-012-031][A-05] la unicidad es por SERIE lógica: tras un cambio de dosis la misma ocurrencia sigue registrada (409 al registrarla contra la versión nueva)', async () => {
      const { use, engine: e } = await boot();
      const v1 = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string; version: number };
      await grant(use, 'BASIC_LOG');
      engine!.setNow('2026-11-26T13:30:00.000Z');
      await use.log(MARIA, PET, occ(v1.id, '08:00'));
      const v2 = ((await use.updateRoutine(ANDRES, PET, v1.id, { doseAmount: 300, expectedVersion: v1.version })) as unknown as { routine: { id: string } }).routine;
      expect(await codeOf(use.log(ANDRES, PET, occ(v2.id, '08:00')))).toBe('ERR-CAR12-ALREADY-LOGGED');
      expect(await logRows(e)).toHaveLength(1);
    });

    it('[SC-012-034] ventana de registro en el servidor: más de 24 h atrás, DONE futuro más allá de 15 min y SKIPPED anticipado dan 422 ERR-CAR12-OUT-OF-WINDOW sin escribir; un routineId ajeno da el mismo 422 que uno inexistente', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, { ...MED, timesOfDay: ['08:00', '10:30', '12:00'], startDate: '2026-11-20' })) as unknown as { id: string };
      await grant(use, 'BASIC_LOG');
      engine!.setNow(NOW);
      const OUT = 'ERR-CAR12-OUT-OF-WINDOW';
      expect(await codeOf(use.log(MARIA, PET, { ...occ(routine.id, '08:00'), occurrenceDate: '2026-11-24' }))).toBe(OUT);
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '10:30')))).toBe(OUT); // DONE 30 min en el futuro
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '12:00', 'SKIPPED', { note: 'x' })))).toBe(OUT);
      expect(await codeOf(use.log(MARIA, PET, { ...occ(routine.id, '08:00'), occurrenceDate: '2026-11-27' }))).toBe(OUT);
      expect(await codeOf(use.log(MARIA, PET, occ('00000000-0000-4000-8000-0000000000ff', '08:00')))).toBe(INVALID);
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '08:07')))).toBe(INVALID); // hora que la rutina no tiene
      expect(await logRows(e)).toEqual([]);
    });

    it('[SC-012-033] el cuidador deshace lo suyo dentro de 10 min; después 403; un titular necesita revert_reason (422 sin él) y queda en la fila; un ADMIN no revierte', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string };
      await grant(use, 'BASIC_LOG');
      engine!.setNow('2026-11-26T13:30:00.000Z');
      const a = ok(await use.log(MARIA, PET, occ(routine.id, '08:00')));
      engine!.setNow('2026-11-26T13:35:00.000Z');
      expect(ok(await use.revert(MARIA, PET, a['id'] as string))['revertedAt']).toBe('2026-11-26T13:35:00.000Z');
      expect(ok(await use.revert(MARIA, PET, a['id'] as string))['revertedAt']).toBe('2026-11-26T13:35:00.000Z'); // R-8: revertir lo ya revertido es 200 idempotente
      engine!.setNow('2026-11-26T13:36:00.000Z');
      const b = ok(await use.log(MARIA, PET, occ(routine.id, '08:00')));
      engine!.setNow('2026-11-26T13:50:00.000Z'); // 14 min después
      expect(await codeOf(use.revert(MARIA, PET, b['id'] as string, { reason: 'ya pasó el plazo' }))).toBe(FORBIDDEN);
      expect(await codeOf(use.revert(ANDRES, PET, b['id'] as string))).toBe(INVALID);
      await use.revert(ANDRES, PET, b['id'] as string, { reason: 'Registrada por error' });
      expect((await logRows(e)).find((r) => r['id'] === b['id'])).toMatchObject({ revertReason: 'Registrada por error' });
      const adm = await factory.make('ADMIN');
      adm.setNow(NOW);
      expect(await codeOf(careCases(adm.deps).revert(MARIA, PET, b['id'] as string, { reason: 'x' }))).toBe(FORBIDDEN);
      await adm.dispose();
    });

    it('[SC-012-036][T-C3] careUntil inclusivo: BASIC_LOG hasta las 23:59:59 de Bogotá y a las 00:00:00 del día siguiente el servidor responde 403 al registrar y VIEW_ONLY en myAccess, sin cambiar permisos clínicos', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, { ...MED, timesOfDay: ['23:50'] })) as unknown as { id: string };
      await grant(use, 'BASIC_LOG', { careUntil: '2026-11-26' });
      engine!.setNow('2026-11-27T04:59:59.000Z');
      expect(await codeOf(use.log(MARIA, PET, occ(routine.id, '23:50')))).toBe('OK');
      engine!.setNow('2026-11-27T05:00:00.000Z');
      const mine = (await use.myAccess(MARIA, PET)) as unknown as Record<string, unknown>;
      expect(mine).toMatchObject({ level: 'VIEW_ONLY', defaultedToViewOnly: true, canLogCare: false });
      expect(await codeOf(use.revert(MARIA, PET, ((await logRows(e))[0]!['id']) as string))).toBe(FORBIDDEN);
      const weight = await new AddWeightRecordUseCase(e.deps).execute(MARIA, PET, { recordedAt: '2026-11-05', weightKg: 33.1 });
      expect(weight.record.weightKg).toBe(33.1);
    });

    it('[SC-012-036][T-C2][R-8] un nivel solo lo concede un titular a un CAREGIVER ACTIVE; el ADMIN no; un destino ajeno da 404 uniforme; un careUntil pasado da 422; una fila obsoleta da 409 ROUTINE-STALE; retirar es idempotente', async () => {
      const { use, engine: e } = await boot();
      expect(await codeOf(use.setAccess(ANDRES, PET, LUCIA, { level: 'BASIC_LOG' }))).toBe('ERR-PET-NOT-FOUND');
      const granted = (await grant(use, 'VIEW_ONLY')) as unknown as { created: boolean; access: { version: number } };
      expect(granted.created).toBe(true); // 201: concesión nueva
      expect(await codeOf(grant(use, 'BASIC_LOG'))).toBe('ERR-CAR12-ROUTINE-STALE'); // reemplazar exige expectedVersion
      const replaced = (await use.setAccess(ANDRES, PET, MARIA, { level: 'BASIC_LOG', expectedVersion: granted.access.version })) as unknown as { created: boolean };
      expect(replaced.created).toBe(false); // 200: reemplazo de nivel
      expect(await codeOf(grant(use, 'VIEW_ONLY', { careUntil: '2026-11-25', expectedVersion: 2 }))).toBe(INVALID); // careUntil pasado (hoy 2026-11-26): 422
      expect((await accessRows(e)).map((r) => [r['userId'], r['level']])).toEqual([[MARIA, 'BASIC_LOG']]);
      await use.removeAccess(ANDRES, PET, MARIA);
      await use.removeAccess(ANDRES, PET, MARIA);
      expect(await accessRows(e)).toEqual([]);
    });

    it('[SC-012-038][R-7] historial paginado: limit ≤ 100 (101 da 422), orden más recientes primero (INV-SORT-001), cursor estable sin repetidos ni huecos y atado a mascota y filtros (alterado, de otra mascota o con otros filtros: 422)', async () => {
      const { use } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, { ...MEAL, timesOfDay: ['06:00', '07:00', '08:00', '09:00'] })) as unknown as { id: string };
      const ids: string[] = [];
      const minutes = ['15:00', '15:01', '15:02', '15:03'];
      for (const [i, time] of ['06:00', '07:00', '08:00', '09:00'].entries()) {
        engine!.setNow(`2026-11-26T${minutes[i]}:00.000Z`); // performedAt distinto y creciente en cada registro
        ids.push(ok(await use.log(ANDRES, PET, occ(routine.id, time)))['id'] as string);
      }
      expect(await codeOf(use.history(ANDRES, PET, { limit: 101 }))).toBe(INVALID);
      const p1 = (await use.history(ANDRES, PET, { limit: 2 })) as unknown as { items: Array<{ id: string }>; nextCursor: string };
      const p2 = (await use.history(ANDRES, PET, { limit: 2, cursor: p1.nextCursor })) as unknown as { items: Array<{ id: string }>; nextCursor: string | null };
      expect([...p1.items, ...p2.items].map((i) => i.id)).toEqual([...ids].reverse()); // más recientes primero, sin repetidos ni huecos
      expect(p2.nextCursor).toBeNull();
      expect(await codeOf(use.history(ANDRES, PET, { limit: 2, cursor: `${p1.nextCursor}x` }))).toBe(INVALID);
      expect(await codeOf(use.history(ANDRES, PET, { limit: 2, cursor: p1.nextCursor, from: '2026-11-01' }))).toBe(INVALID);
      expect(await codeOf(use.history(ANDRES, OTHER_OWN_PET, { limit: 2, cursor: p1.nextCursor }))).toBe(INVALID); // cursor de otra mascota
    });

    it('[SC-012-039][REQ-VET12-008] el enlace público de veterinario no contiene rutinas, registros de cuidado ni sus notas', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, { ...MED, title: 'RUTINA-SECRETA-ZZ' })) as unknown as { id: string };
      engine!.setNow(NOW);
      await use.log(ANDRES, PET, occ(routine.id, '08:00', 'SKIPPED', { note: 'NOTA-SECRETA-ZZ' }));
      await new CreateShareLinkUseCase(e.deps).execute(ANDRES, { scope: 'PET', petId: PET }, KEY(1), { expiresInDays: 7 });
      const token = (e.deps.sharing as unknown as { tokens: { issued: string[] } }).tokens.issued.at(-1)!;
      const summary = await new GetSharedSummaryUseCase(e.deps).execute(token, '203.0.113.7');
      const text = JSON.stringify(summary);
      expect(text).toContain('Argos'); // control positivo (R-6): el resumen no está vacío
      expect(text).not.toContain('RUTINA-SECRETA-ZZ');
      expect(text).not.toContain('NOTA-SECRETA-ZZ');
      expect(text).not.toMatch(/care(Routine|Log)|caregiverAccess|pet_caregiver/i); // 'CAREGIVER_REPORTED_NOT_VERIFIED' (dataProvenance existente) no es cuidado
    });

    it('[SC-012-040] regresión sin cuidadores: un hogar sin niveles ni rutinas devuelve pendientes vacíos y lista de niveles vacía; el propietario conserva todo', async () => {
      const { use } = await boot();
      expect(await use.today(ANDRES, PET)).toMatchObject({ date: '2026-11-26', timezone: 'America/Bogota', graceMinutes: 60, items: [] });
      expect(await use.listAccess(ANDRES, PET)).toEqual({ items: [] });
      expect(await codeOf(use.householdToday(ANDRES, '00000000-0000-4000-8000-0000000000fe'))).toBe('ERR-HOUSE-NOT-FOUND'); // R-8
      expect(await use.myAccess(ANDRES, PET)).toMatchObject({ caregiver: false, canViewRoutines: true, canLogCare: true, canManageRoutines: true });
    });

    it('[SC-012-076][REQ-CAR12-009] al eliminar la cuenta del cuidador, sus registros quedan con autor NULL (FK SET NULL) y el titular ve «Usuario eliminado»', async () => {
      const { use, engine: e } = await boot();
      const routine = (await use.createRoutine(ANDRES, PET, MED)) as unknown as { id: string };
      await grant(use, 'BASIC_LOG');
      engine!.setNow('2026-11-26T13:30:00.000Z');
      await use.log(MARIA, PET, occ(routine.id, '08:00'));
      await e.run(async (r) => {
        for (const a of (await r.assignments.listByHousehold(HOUSEHOLD_ID)).filter((x) => x.assignedByUserId === MARIA)) await r.assignments.remove(a.petId, HOUSEHOLD_ID); // sus mascotas propias dejan de estar compartidas: si no, borrar la cuenta se bloquea
      });
      await use.erase(MARIA);
      const rows = await logRows(e);
      expect(rows).toHaveLength(1);
      expect(rows[0]!['performedByUserId']).toBeNull();
      expect(await accessRows(e)).toEqual([]);
      const page = (await use.history(ANDRES, PET)) as unknown as { items: Array<{ performedByDisplayName: string }> };
      expect(page.items[0]!.performedByDisplayName).toBe('Usuario eliminado');
    });
  });
}
