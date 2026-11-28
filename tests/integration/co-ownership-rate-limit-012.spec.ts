import { afterEach, describe, expect, it } from 'vitest';
import { ANDRES, CARLOS, ENGINE_FACTORIES, MARIA, PET, cases, codeOf, makeCoOwners, requestRows, unshare, usernameOf, type Engine012 } from '../fixtures/co-ownership-012.ts';

/**
 * B-4 (Feature 012, Bloque B; `/keymaker`): ámbitos propios de límite de frecuencia de la co-propiedad (migraciones 0035 SQLite / 0031 PostgreSQL). `CO_OWNER_INVITE` cuenta TODO intento de invitar
 * (H-02) y `OWNER_REQUEST` cuenta crear, aprobar y rechazar (H-10); ninguno comparte el ámbito `INVITE` de los hogares. Un tercero (404 uniforme) no consume cupo.
 *
 * @implements REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004, ERR-RATE-LIMITED
 * Cubre SC-012-075, H-02, H-10.
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const NOW = '2026-11-26T10:00:00.000Z';
const EPOCH = '1970-01-01T00:00:00.000Z';
const count = (e: Engine012, scope: 'INVITE' | 'CO_OWNER_INVITE' | 'OWNER_REQUEST', user: string): Promise<number> => e.run((r) => r.rateLimits.countSince(scope, user, EPOCH));

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`B-4 límites propios de co-propiedad (${factory.name})`, { timeout: 60_000 }, () => {
    it('[H-02][SC-012-075] el intento 6 de invitar en el día da 429 uniforme (inexistente, existente o ya propietario cuentan igual), registra en CO_OWNER_INVITE y no toca el ámbito INVITE de hogares', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps);
      engine.setNow(NOW);
      const targets = ['zz.nadie.uno', usernameOf(MARIA), 'zz.nadie.dos', usernameOf(ANDRES), 'zz.nadie.tres'];
      for (const target of targets) await codeOf(use.invite(ANDRES, PET, target));
      expect(await count(engine, 'CO_OWNER_INVITE', ANDRES)).toBe(5);
      expect(await codeOf(use.invite(ANDRES, PET, 'zz.nadie.cuatro'))).toBe('ERR-RATE-LIMITED');
      expect(await codeOf(use.invite(ANDRES, PET, usernameOf(CARLOS)))).toBe('ERR-RATE-LIMITED');
      expect(await count(engine, 'CO_OWNER_INVITE', ANDRES)).toBe(5); // el 429 no prolonga la ventana
      expect(await count(engine, 'INVITE', ANDRES)).toBe(0);
      engine.setNow('2026-11-27T10:00:01.000Z');
      expect(await codeOf(use.invite(ANDRES, PET, 'zz.nadie.cinco'))).toBe('OK');
    });

    it('[H-10] un tercero que invita recibe 404 sin consumir cupo en CO_OWNER_INVITE', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps);
      engine.setNow(NOW);
      for (let i = 0; i < 7; i += 1) expect(await codeOf(use.invite(CARLOS, PET, usernameOf(MARIA)))).toBe('ERR-PET-NOT-FOUND');
      expect(await count(engine, 'CO_OWNER_INVITE', CARLOS)).toBe(0);
    });

    it('[H-10] crear, aprobar y rechazar solicitudes cuentan en OWNER_REQUEST: el intento 11 del día da 429; un tercero recibe 404 sin consumir', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      engine.setNow(NOW);
      const first = await use.request(ANDRES, PET, { action: 'DELETE_PET' });
      expect(await count(engine, 'OWNER_REQUEST', ANDRES)).toBe(1);
      await use.reject(MARIA, first.id);
      expect(await count(engine, 'OWNER_REQUEST', MARIA)).toBe(1);
      expect(await codeOf(use.approve(CARLOS, first.id))).toBe('ERR-PET-NOT-FOUND');
      expect(await count(engine, 'OWNER_REQUEST', CARLOS)).toBe(0);
      for (let i = 1; i < 10; i += 1) await codeOf(use.request(ANDRES, PET, { action: 'DELETE_PET' }));
      expect(await count(engine, 'OWNER_REQUEST', ANDRES)).toBe(10);
      const before = (await requestRows(engine, PET)).length;
      expect(await codeOf(use.request(ANDRES, PET, { action: 'DELETE_PET' }))).toBe('ERR-RATE-LIMITED');
      expect((await requestRows(engine, PET)).length).toBe(before);
      expect(await count(engine, 'OWNER_REQUEST', ANDRES)).toBe(10);
      expect(await count(engine, 'INVITE', ANDRES)).toBe(0);
    });
  });
}
