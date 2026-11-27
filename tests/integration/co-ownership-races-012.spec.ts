import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import { OWNERSHIP_LOCK_TIMEOUT_MS } from '../../src/domain/platform/feature-012-limits.ts';
import { ANDRES, CARLOS, HAS_POSTGRES, MARIA, PET, RACE_FACTORIES, cases, codeOf, coOwnerRows, makeCoOwners, principalOf, requestRows, unshare, usernameOf, type RaceEngine, type Row } from '../fixtures/co-ownership-012.ts';

/**
 * T1615 (Feature 012, Bloque A, #22; PRUEBAS ROJAS hasta T1616 y T1622; `/keymaker`): carreras de salida, sucesión y supresión de cuenta, en los tres motores: memoria (serial), SQLite con DOS conexiones al mismo
 * archivo (`BEGIN IMMEDIATE` real) y PostgreSQL 17 con DOS sesiones (`SELECT … FOR UPDATE`; se OMITE sin `TEST_DATABASE_URL`). Cada prueba exige el INVARIANTE (resultado equivalente a ALGÚN orden serial, `owner_user_id` nunca
 * apunta a quien salió, nunca queda una mascota viva sin propietario `ACTIVE`), no un orden concreto.
 *
 * Combinaciones de SC-012-095 cubiertas aquí: `LEAVE` del principal vs `LEAVE` del único co-propietario, `LEAVE` vs supresión de cuenta, aceptación vs supresión del principal, designación vs `LEAVE` del designado, supresión
 * simultánea de principal y co-propietario y solicitud aprobada vs `LEAVE`. NO cubiertas (sus casos de uso no existen hasta los bloques de disputa, T1627 y la cola de `/admin`): `END_CO_OWNERSHIP` vs `LEAVE`,
 * apertura de disputa por ausencia vs `LEAVE` y `ADD_CO_OWNER(claimant)` vs `LEAVE`; se piden al escribir las pruebas rojas de esos casos de uso.
 *
 * @implements REQ-OWN12-006, REQ-OWN12-011, INV-OWN12-003, INV-OWN12-007, NFR-012-008, EDGE-012-051, EDGE-012-052
 * Cubre SC-012-071, SC-012-076, SC-012-094, SC-012-095.
 */
let engine: RaceEngine | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const NOW = '2026-11-26T11:00:00.000Z';
const active = (rows: Row[]): string[] => rows.filter((r) => r['status'] === 'ACTIVE').map((r) => r['userId'] as string);
const seeded = (race: RaceEngine) => ({ deps: race.a, run: <T>(work: (r: RepositorySet) => Promise<T>): Promise<T> => race.a.uow.runInTransaction(work), setNow: (iso: string) => race.setNow(iso) });

/** Invariante común: si la mascota existe, su principal existe, está vivo y no figura como LEFT/PROMOTED-fuera. */
async function assertSerialInvariant(race: RaceEngine): Promise<void> {
  const principal = await principalOf(seeded(race), PET);
  if (principal === null) return; // mascota eliminada (REQ-PET-004)
  const rows = await coOwnerRows(seeded(race), PET);
  expect(rows.filter((r) => r['userId'] === principal && r['status'] === 'LEFT')).toEqual([]);
  expect(active(rows)).not.toContain(principal);
}

for (const factory of RACE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1615 carreras de co-propiedad (${factory.name})`, { timeout: 90_000 }, () => {
    it('[SC-012-095][INV-OWN12-007] LEAVE del principal || LEAVE del único co-propietario: equivale a un orden serial (uno sale y el otro queda como ÚLTIMO propietario: ERR-OWN12-LAST-OWNER) y la mascota nunca queda sin propietario', async () => {
      engine = await factory.make();
      await makeCoOwners(seeded(engine), [MARIA]);
      const [first, second] = await Promise.all([codeOf(cases(engine.a).leave(ANDRES, PET)), codeOf(engine.b((deps) => cases(deps).leave(MARIA, PET)))]);
      expect([first, second].sort()).toEqual(['ERR-OWN12-LAST-OWNER', 'OK']);
      const principal = await principalOf(seeded(engine), PET);
      expect([ANDRES, MARIA]).toContain(principal);
      await assertSerialInvariant(engine);
    });

    it('[SC-012-095] LEAVE del principal || supresión de cuenta del único co-propietario: o el principal sale primero (MARIA hereda y su supresión elimina la mascota) o la supresión llega primero (el principal queda solo y recibe ERR-OWN12-LAST-OWNER)', async () => {
      engine = await factory.make();
      await makeCoOwners(seeded(engine), [MARIA]);
      await unshare(engine.a);
      const [leave, erase] = await Promise.all([codeOf(cases(engine.a).leave(ANDRES, PET)), codeOf(engine.b((deps) => cases(deps).erase(MARIA)))]);
      expect(erase).toBe('OK');
      expect(['OK', 'ERR-OWN12-LAST-OWNER']).toContain(leave);
      const principal = await principalOf(seeded(engine), PET);
      if (leave === 'OK') expect(principal).toBeNull(); // ANDRES salió primero, MARIA heredó y su supresión la dejó como último propietario: REQ-PET-004 elimina la mascota
      else expect(principal).toBe(ANDRES); // la supresión llegó primero: ANDRES quedó solo y no pudo salir
    });

    it('[SC-012-095][REQ-PET-004] supresión simultánea de principal y co-propietario: el resultado es el de un orden serial (la mascota termina eliminada como último propietario) y ninguna de las dos cuentas deja ID huérfano', async () => {
      engine = await factory.make();
      await makeCoOwners(seeded(engine), [MARIA]);
      await unshare(engine.a);
      const [one, two] = await Promise.all([codeOf(cases(engine.a).erase(ANDRES)), codeOf(engine.b((deps) => cases(deps).erase(MARIA)))]);
      expect([one, two]).toEqual(['OK', 'OK']);
      expect(await principalOf(seeded(engine), PET)).toBeNull();
      expect(JSON.stringify(await coOwnerRows(seeded(engine), PET))).not.toMatch(new RegExp(`${ANDRES}|${MARIA}`));
    });

    it('[SC-012-095] aceptación de la invitación || supresión del principal (sin otro co-propietario): o la aceptación gana (el invitado hereda) o la supresión gana (la invitación queda CANCELLED y no hay mascota); nunca un ACTIVE sobre una mascota inexistente', async () => {
      engine = await factory.make();
      engine.setNow(NOW);
      await unshare(engine.a);
      await cases(engine.a).invite(ANDRES, PET, usernameOf(MARIA));
      const invitation = (await coOwnerRows(seeded(engine), PET)).find((r) => r['userId'] === MARIA && r['status'] === 'INVITED')!;
      const [accepted, erased] = await Promise.all([codeOf(cases(engine.a).accept(MARIA, invitation['id'] as string)), codeOf(engine.b((deps) => cases(deps).erase(ANDRES)))]);
      expect(erased).toBe('OK');
      const principal = await principalOf(seeded(engine), PET);
      if (accepted === 'OK') expect(principal).toBe(MARIA);
      else {
        expect(principal).toBeNull();
        expect(accepted).not.toBe('OK');
      }
    });

    it('[SC-012-095][SC-012-094] designación vs LEAVE del designado: el principal sale designando a B mientras B sale: en cualquier orden el principal final es C (el otro co-propietario), nunca B ni A', async () => {
      engine = await factory.make();
      await makeCoOwners(seeded(engine), [MARIA, CARLOS]);
      const [byPrincipal, byDesignated] = await Promise.all([codeOf(cases(engine.a).leave(ANDRES, PET, MARIA)), codeOf(engine.b((deps) => cases(deps).leave(MARIA, PET)))]);
      expect([byPrincipal, byDesignated]).toEqual(['OK', 'OK']);
      expect(await principalOf(seeded(engine), PET)).toBe(CARLOS);
      await assertSerialInvariant(engine);
    });

    it('[SC-012-095][REQ-OWN12-004] solicitud aprobada || LEAVE del aprobador: o se ejecuta y luego el sucesor la revierte por salida, o queda EXPIRED/STALE; en ambos órdenes el principal final es A y la solicitud no deja efecto parcial', async () => {
      engine = await factory.make();
      await makeCoOwners(seeded(engine), [MARIA]);
      const request = await cases(engine.a).request(ANDRES, PET, { action: 'CHANGE_PRINCIPAL', targetUserId: MARIA });
      const [approve, leave] = await Promise.all([codeOf(cases(engine.a).approve(MARIA, request.id)), codeOf(engine.b((deps) => cases(deps).leave(MARIA, PET)))]);
      expect(['OK', 'ERR-OWN12-STALE', 'ERR-OWN12-LAST-OWNER']).toContain(approve);
      expect(['OK', 'ERR-OWN12-LAST-OWNER']).toContain(leave);
      expect([ANDRES, MARIA]).toContain(await principalOf(seeded(engine), PET));
      await assertSerialInvariant(engine);
      const stored = (await requestRows(seeded(engine), PET)).find((r) => r['id'] === request.id)!;
      expect(['APPROVED', 'EXPIRED']).toContain(stored['status']);
    });
  });
}

describe.skipIf(!HAS_POSTGRES)('T1615 lock_timeout por mascota (PostgreSQL con dos sesiones)', { timeout: 120_000 }, () => {
  it('[REQ-OWN12-011][NFR-012-008] una sesión que retiene el bloqueo de la mascota más allá de OWNERSHIP_LOCK_TIMEOUT_MS hace que LEAVE de la otra termine en ERR-OWN12-RETRYABLE (503) sin escritura parcial', async () => {
    const factory = RACE_FACTORIES.find((f) => f.name === 'PostgreSQL')!;
    engine = await factory.make();
    await makeCoOwners(seeded(engine), [MARIA]);
    const holder = engine.holdingA((deps) => cases(deps).leave(MARIA, PET));
    await holder.entered;
    const before = JSON.stringify([await principalOf(seeded(engine), PET)]);
    const started = Date.now();
    expect(await codeOf(engine.b((deps) => cases(deps).leave(ANDRES, PET)))).toBe('ERR-OWN12-RETRYABLE');
    expect(Date.now() - started).toBeGreaterThanOrEqual(OWNERSHIP_LOCK_TIMEOUT_MS - 50);
    expect(JSON.stringify([await principalOf(seeded(engine), PET)])).toBe(before);
    holder.release();
    await holder.result;
  });
});
