import { afterEach, describe, expect, it } from 'vitest';
import { unshare } from '../../fixtures/co-ownership-012.ts';
import { ANDRES, BASE_URL, ENGINE_FACTORIES, KEY_B, LUCIA, MARIA, NOTICE, PET, PHONE_A, PHONE_L, PHONE_M, T0, accountPhone, cardRow, codeOf, consentRows, daysAfter, emergencyCases, emergencyDeps, hoursAfter, makeCoOwners, setPhoneOutOfBand, sha256, type Engine012 } from '../../fixtures/emergency-012.ts';

/**
 * T1674 (Feature 012, Bloque D, #32; PRUEBAS ROJAS hasta T1675; `/keymaker`): ficha QR por casos de uso sobre Memoria / SQLite / PostgreSQL real (se OMITE sin `TEST_DATABASE_URL`): token opaco y solo hash,
 * token devuelto una sola vez, 404 uniforme, regenerar/desactivar con aviso derivado a co-propietarios, guarda y caídas a `OFF` (`AUTO_GUARD_LOST`, `AUTO_PET_DECEASED`, `AUTO_NOTICE_CHANGED`),
 * consentimiento por mascota ligado a `phone_hmac`, máximo 2 teléfonos, espera de 90 días del aviso, rotación de `PHONE_HMAC_KEY`, reconciliación perezosa ordenada, `lastChange` (lista blanca),
 * `criticalAllergiesChange`, `last_scanned_at` y topes por usuario (20/h y 60/h). Fallan hoy porque `emergency-use-cases.ts` y los repositorios `emergencyCards`/`emergencyConsents` no existen (T1675).
 * Reloj: `T0` = 2026-11-26 11:00Z (lo deja `makeCoOwners`); MARIA es co-propietaria `ACTIVE`; LUCIA es ajena.
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-004, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-002, INV-QR12-003, INV-QR12-008
 * Cubre SC-012-041..052, SC-012-083..087, SC-012-106, SC-012-110, SC-012-121..125, SC-012-127.
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});
const NOT_FOUND = 'ERR-PET-NOT-FOUND';
const RATE = 'ERR-RATE-LIMITED';
const ON = { consentAccepted: true, noticeVersion: NOTICE };

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1674 ficha QR (${factory.name})`, { timeout: 120_000 }, () => {
    /** ANDRES principal + MARIA co-propietaria; `ANDRES` y `MARIA` con teléfono; ficha apagada. */
    const boot = async (withCoOwner = true, overrides: Parameters<typeof emergencyDeps>[1] = {}) => {
      engine = await factory.make();
      if (withCoOwner) await makeCoOwners(engine, [MARIA]);
      else engine.setNow(T0);
      const deps = emergencyDeps(engine, overrides);
      const use = emergencyCases(deps);
      return { e: engine, use, deps };
    };
    const auditCount = async (e: Engine012, type: string) => (await e.auditTypes(PET)).filter((t) => t === type).length;

    it('[SC-012-046] activar exige consentimiento y noticeVersion vigente (ERR-QR12-CONSENT-REQUIRED 422) y guarda: sin alergias ni teléfono visible, ERR-QR12-ACTIVATION-REQUIREMENTS; nada se escribe', async () => {
      const { e, use } = await boot();
      expect(await codeOf(use.activate(ANDRES, PET, { consentAccepted: false, noticeVersion: NOTICE }))).toBe('ERR-QR12-CONSENT-REQUIRED');
      expect(await codeOf(use.activate(ANDRES, PET, { consentAccepted: true, noticeVersion: '9.9.9' }))).toBe('ERR-QR12-CONSENT-REQUIRED');
      expect(await codeOf(use.activate(ANDRES, PET))).toBe('ERR-QR12-ACTIVATION-REQUIREMENTS');
      expect((await cardRow(e))?.['status'] ?? 'OFF').toBe('OFF');
      expect(await auditCount(e, 'EMERGENCY_CARD_ACTIVATED')).toBe(0);
    });

    it('[SC-012-052] el token se devuelve UNA sola vez y en BD solo queda su SHA-256 (64 hex); ni la lectura de estado, ni la fila, ni la auditoría lo contienen', async () => {
      const { e, use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Penicilina']);
      const result = await use.activate(ANDRES, PET);
      const token = result['token'] as string;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result['url']).toBe(`${BASE_URL}/e/${token}`);
      expect(result['status']).toBe('ON');
      expect(result['shownOnce']).toBe(true);
      expect(String(result['qrSvg']).startsWith('<svg')).toBe(true);
      const row = (await cardRow(e))!;
      expect(row['tokenHash']).toBe(sha256(token));
      expect(String(row['tokenHash'])).toHaveLength(64);
      expect(JSON.stringify(row)).not.toContain(token);
      expect(JSON.stringify(await use.status(ANDRES, PET))).not.toContain(token);
      expect(JSON.stringify(await use.status(ANDRES, PET))).not.toContain(sha256(token));
      expect(await e.auditTypes(PET)).toContain('EMERGENCY_CARD_ACTIVATED');
      expect(await codeOf(use.activate(ANDRES, PET))).toBe('ERR-QR12-ALREADY-ACTIVE');
    });

    it('[SC-012-051] la vista pública trae solo {petName, criticalAllergies, contactPhones}; token inexistente, mal formado, regenerado o desactivado dan el mismo ERR-PET-NOT-FOUND', async () => {
      const { use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Penicilina', 'Polen']);
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      const view = await use.publicView(token);
      expect(Object.keys(view).sort()).toEqual(['contactPhones', 'criticalAllergies', 'petName']);
      expect(view['criticalAllergies']).toEqual(['Penicilina', 'Polen']);
      expect(view['contactPhones']).toEqual([]);
      for (const bad of ['', 'x', token.slice(0, 42), `${token}x`, 'a'.repeat(200)]) expect(await codeOf(use.publicView(bad))).toBe(NOT_FOUND);
      const regenerated = (await use.regenerate(ANDRES, PET)) as { token: string };
      expect(regenerated.token).not.toBe(token);
      expect(await codeOf(use.publicView(token))).toBe(NOT_FOUND);
      expect((await use.publicView(regenerated.token))['petName']).toBe(view['petName']);
      await use.deactivate(ANDRES, PET);
      expect(await codeOf(use.publicView(regenerated.token))).toBe(NOT_FOUND);
    });

    it('[SC-012-110] petName con caracteres rechazados se emite sin ellos; si queda vacío, 404 uniforme', async () => {
      const { e, use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      await e.run(async (r) => {
        const pet = (await r.pets.findById(PET))!;
        await r.pets.save({ ...pet, name: 'Ar‮gos' });
      });
      expect((await use.publicView(token))['petName']).toBe('Argos');
      await e.run(async (r) => {
        const pet = (await r.pets.findById(PET))!;
        await r.pets.save({ ...pet, name: '‮​' });
      });
      expect(await codeOf(use.publicView(token))).toBe(NOT_FOUND);
    });

    it('[SC-012-083] regenerar y desactivar avisan a los co-propietarios sin cruce de identidad (lastChange.byMe) y auditan sin token ni teléfono', async () => {
      const { e, use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Penicilina']);
      await use.activate(ANDRES, PET);
      e.setNow(hoursAfter(T0, 1));
      await use.regenerate(ANDRES, PET);
      const seenByMaria = (await use.status(MARIA, PET))['lastChange'] as Record<string, unknown>;
      expect(seenByMaria).toEqual({ kind: 'REGENERATED', at: hoursAfter(T0, 1), byMe: false });
      expect((await use.status(ANDRES, PET))['lastChange']).toEqual({ kind: 'REGENERATED', at: hoursAfter(T0, 1), byMe: true });
      e.setNow(hoursAfter(T0, 2));
      await use.deactivate(MARIA, PET);
      expect((await use.status(ANDRES, PET))['lastChange']).toEqual({ kind: 'DEACTIVATED', at: hoursAfter(T0, 2), byMe: false });
      const types = await e.auditTypes(PET);
      expect(types).toEqual(expect.arrayContaining(['EMERGENCY_CARD_ACTIVATED', 'EMERGENCY_CARD_REGENERATED', 'EMERGENCY_CARD_DEACTIVATED']));
      const row = (await cardRow(e))!;
      expect(row['status']).toBe('OFF');
      expect(row['statusReason']).toBe('USER_DEACTIVATED');
      expect(row['tokenHash'] ?? null).toBeNull();
      expect(row['lastScannedAt'] ?? null).toBeNull();
    });

    it('[SC-012-083] quien no es titular (ajeno, ADMIN sin mascota) recibe 404 uniforme en TODAS las operaciones y no escribe nada', async () => {
      const { e, use } = await boot();
      for (const call of [use.status(LUCIA, PET), use.activate(LUCIA, PET), use.regenerate(LUCIA, PET), use.deactivate(LUCIA, PET), use.setConsent(LUCIA, PET, { visible: false }), use.updateAllergies(LUCIA, PET, ['x'])]) expect(await codeOf(call)).toBe(NOT_FOUND);
      expect(await codeOf(use.status(ANDRES, '00000000-0000-4000-8000-0000000fffff'))).toBe(NOT_FOUND);
      expect(await cardRow(e)).toBeNull();
      expect(await consentRows(e)).toEqual([]);
    });

    it('[SC-012-047] teléfono de cuenta: se normaliza a E.164, se rechaza lo inválido (ERR-QR12-PHONE-INVALID 422 sin eco) y null lo borra; el teléfono solo lo ve la propia cuenta', async () => {
      const { e, use } = await boot();
      expect((await use.updatePhone(ANDRES, '+57 (300) 111-2233'))['phone']).toBe(PHONE_A);
      expect(await accountPhone(e, ANDRES)).toBe(PHONE_A);
      expect(await codeOf(use.updatePhone(ANDRES, '12345'))).toBe('ERR-QR12-PHONE-INVALID');
      expect(await accountPhone(e, ANDRES)).toBe(PHONE_A);
      expect(JSON.stringify(await use.status(MARIA, PET))).not.toContain(PHONE_A);
      expect((await use.updatePhone(ANDRES, null))['phone']).toBeNull();
      expect(await accountPhone(e, ANDRES)).toBeNull();
    });

    it('[SC-012-048] alergias: reemplazo total normalizado, 422 ERR-SCHEMA-VALIDATION-FAILED sin eco ante texto rechazado y una auditoría PET_CRITICAL_ALLERGIES_UPDATED solo por cambio efectivo, sin contenido', async () => {
      const { e, use } = await boot();
      const view = await use.updateAllergies(MARIA, PET, [' Penicilina ', 'penicilina', 'Ácaros']);
      expect(view['criticalAllergies']).toEqual(['Penicilina', 'Ácaros']);
      expect(await auditCount(e, 'PET_CRITICAL_ALLERGIES_UPDATED')).toBe(1);
      await use.updateAllergies(ANDRES, PET, ['Penicilina', 'Ácaros']); // idempotente por contenido: sin cambio efectivo
      expect(await auditCount(e, 'PET_CRITICAL_ALLERGIES_UPDATED')).toBe(1);
      expect(await codeOf(use.updateAllergies(ANDRES, PET, ['Pen‮icilina']))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await codeOf(use.updateAllergies(ANDRES, PET, ['a', 'b', 'c', 'd', 'e', 'f']))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await auditCount(e, 'PET_CRITICAL_ALLERGIES_UPDATED')).toBe(1);
      expect((await use.status(ANDRES, PET))['criticalAllergiesChange']).toEqual({ at: T0, byMe: false });
    });

    it('[SC-012-084] consentimiento por mascota: exige teléfono en la cuenta y aviso vigente; guarda phone_hmac (HMAC, no el teléfono ni su SHA-256) y publica el número solo con opt-in', async () => {
      const { e, use } = await boot();
      expect(await codeOf(use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE }))).toBe('ERR-QR12-PHONE-INVALID');
      await use.updatePhone(ANDRES, PHONE_A);
      expect(await codeOf(use.setConsent(ANDRES, PET, { visible: true, noticeVersion: '9.9.9' }))).toBe('ERR-QR12-CONSENT-REQUIRED');
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      const rows = await consentRows(e);
      expect(rows).toHaveLength(1);
      expect(rows[0]!['userId']).toBe(ANDRES);
      expect(String(rows[0]!['phoneHmac'])).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]!['phoneHmac']).not.toBe(sha256(PHONE_A));
      expect(JSON.stringify(rows[0])).not.toContain(PHONE_A);
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      expect((await use.publicView(token))['contactPhones']).toEqual([{ phone: PHONE_A }]);
      expect(await e.auditTypes(PET)).toContain('EMERGENCY_PHONE_CONSENT_CHANGED');
    });

    it('[SC-012-085] máximo 2 teléfonos (principal primero, luego joined_at), deduplicados; el opt-in de un tercero sin ACTIVE no cuenta', async () => {
      const { use } = await boot(false);
      await makeCoOwners(engine!, [MARIA, LUCIA]);
      await use.updatePhone(ANDRES, PHONE_A);
      await use.updatePhone(MARIA, PHONE_M);
      await use.updatePhone(LUCIA, PHONE_L);
      for (const who of [LUCIA, MARIA, ANDRES]) await use.setConsent(who, PET, { visible: true, noticeVersion: NOTICE });
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      expect((await use.publicView(token))['contactPhones']).toEqual([{ phone: PHONE_A }, { phone: PHONE_M }]);
      expect((await use.status(ANDRES, PET))['visiblePhonesCount']).toBe(2);
    });

    it('[SC-012-086] cambiar o borrar users.phone invalida (borra) el consentimiento ligado a phone_hmac y la ficha sin otros requisitos cae a OFF (AUTO_GUARD_LOST) con aviso en la respuesta', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.activate(ANDRES, PET);
      const changed = await use.updatePhone(ANDRES, PHONE_M);
      expect(changed['emergencyCardsAutoDeactivated']).toBe(1);
      expect(await consentRows(e)).toEqual([]);
      const row = (await cardRow(e))!;
      expect([row['status'], row['statusReason'], row['consentedByUserId'] ?? null, row['tokenHash'] ?? null]).toEqual(['OFF', 'AUTO_GUARD_LOST', null, null]);
      expect(await auditCount(e, 'EMERGENCY_CARD_AUTO_DEACTIVATED')).toBe(1);
    });

    it('[SC-012-086] con alergias presentes, retirar el opt-in, borrar el teléfono o ser invalidado NO apaga la ficha; vaciar las alergias sin teléfono sí (cardAutoDeactivated)', async () => {
      const { e, use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.activate(ANDRES, PET);
      await use.setConsent(ANDRES, PET, { visible: false });
      expect(await consentRows(e)).toEqual([]);
      expect((await cardRow(e))!['status']).toBe('ON');
      const emptied = await use.updateAllergies(ANDRES, PET, []);
      expect(emptied['cardAutoDeactivated']).toBe(true);
      expect(((await cardRow(e))!)['statusReason']).toBe('AUTO_GUARD_LOST');
    });

    it('[SC-012-087] salir (LEFT) borra la fila de consentimiento del titular; reinvitar exige nuevo opt-in; la ficha sin requisitos cae a OFF', async () => {
      const { e, use } = await boot();
      await use.updatePhone(MARIA, PHONE_M);
      await use.setConsent(MARIA, PET, { visible: true, noticeVersion: NOTICE });
      await use.activate(ANDRES, PET);
      await use.coOwners.leave(MARIA, PET);
      expect(await consentRows(e)).toEqual([]);
      expect((await use.status(ANDRES, PET))['status']).toBe('OFF');
      expect(((await cardRow(e))!)['statusReason']).toBe('AUTO_GUARD_LOST');
    });

    it('[SC-012-087] eliminar la cuenta del titular es transaccional: borra su consentimiento, deja consented_by_user_id en NULL, apaga la ficha sin requisitos y seudonimiza los eventos EMERGENCY_*', async () => {
      const { e, use } = await boot();
      await use.updatePhone(MARIA, PHONE_M);
      await use.setConsent(MARIA, PET, { visible: true, noticeVersion: NOTICE });
      await use.activate(MARIA, PET, { ...ON, showMyPhone: true });
      expect(((await cardRow(e))!)['consentedByUserId']).toBe(MARIA);
      await unshare(e.deps); // el hogar compartido del estado canónico bloquea la supresión por la regla de 002 (ERR-ACCOUNT-OWNS-SHARED-PETS), ajena a la 012; precedente de co-ownership-erasure-012
      await use.coOwners.erase(MARIA);
      expect(await consentRows(e)).toEqual([]);
      const row = (await cardRow(e))!;
      expect([row['status'], row['statusReason'], row['consentedByUserId'] ?? null]).toEqual(['OFF', 'AUTO_GUARD_LOST', null]);
      expect(await auditCount(e, 'EMERGENCY_CARD_AUTO_DEACTIVATED')).toBe(1);
    });

    it('[SC-012-046] fallecimiento de la mascota: lectura pública falla cerrada y el estado reconcilia a OFF con AUTO_PET_DECEASED, borrando los consentimientos', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      await e.run(async (r) => {
        const pet = (await r.pets.findById(PET))!;
        await r.pets.save({ ...pet, lifeStatus: 'DECEASED', deceasedAt: '2026-11-20' });
      });
      expect(await codeOf(use.publicView(token))).toBe(NOT_FOUND);
      expect((await cardRow(e))!['status']).toBe('ON'); // la ruta pública NUNCA escribe
      const status = await use.status(ANDRES, PET);
      expect([status['status'], status['statusReason']]).toEqual(['OFF', 'AUTO_PET_DECEASED']);
      expect(await consentRows(e)).toEqual([]);
    });

    it('[SC-012-046] regenerar desde OFF exige guarda y un opt-in NUEVO (los consentimientos se borraron en el acto al pasar a OFF); showMyPhone lo registra en la misma operación', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.activate(ANDRES, PET);
      await use.deactivate(ANDRES, PET);
      expect(await consentRows(e)).toEqual([]);
      expect(await codeOf(use.regenerate(ANDRES, PET))).toBe('ERR-QR12-ACTIVATION-REQUIREMENTS');
      const again = (await use.regenerate(ANDRES, PET, { ...ON, showMyPhone: true })) as { token: string };
      expect((await use.publicView(again.token))['contactPhones']).toEqual([{ phone: PHONE_A }]);
      expect(await auditCount(e, 'EMERGENCY_CARD_ACTIVATED')).toBe(2);
    });

    it('[SC-012-122] aviso material (MINOR): el teléfono queda EN ESPERA (no se publica ni cuenta), la ficha con alergias sigue ON y se reconfirma con la versión vigente', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      const next = emergencyCases(emergencyDeps(e, { noticeVersion: '0.2.0', noticeEffectiveAt: hoursAfter(T0, 1) }));
      e.setNow(hoursAfter(T0, 2));
      expect((await next.publicView(token))['contactPhones']).toEqual([]);
      const waiting = await next.status(ANDRES, PET);
      expect([waiting['status'], waiting['myPhoneVisible'], waiting['myPhoneReconfirmRequired'], waiting['visiblePhonesCount']]).toEqual(['ON', false, true, 0]);
      expect((await consentRows(e))).toHaveLength(1);
      await next.setConsent(ANDRES, PET, { visible: true, noticeVersion: '0.2.0' });
      expect((await next.publicView(token))['contactPhones']).toEqual([{ phone: PHONE_A }]);
      expect((await next.status(ANDRES, PET))['myPhoneReconfirmRequired']).toBe(false);
    });

    it('[SC-012-122] aviso material sin alergias ni otro teléfono: la ficha cae a OFF con AUTO_NOTICE_CHANGED y la fila se borra; el PATCH editorial no exige nada', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.activate(ANDRES, PET);
      const patch = emergencyCases(emergencyDeps(e, { noticeVersion: '0.1.5', noticeEffectiveAt: hoursAfter(T0, 1) }));
      e.setNow(hoursAfter(T0, 2));
      expect((await patch.status(ANDRES, PET))['myPhoneReconfirmRequired']).toBe(false);
      const next = emergencyCases(emergencyDeps(e, { noticeVersion: '1.0.0', noticeEffectiveAt: hoursAfter(T0, 3) }));
      e.setNow(hoursAfter(T0, 4));
      const status = await next.status(ANDRES, PET);
      expect([status['status'], status['statusReason']]).toEqual(['OFF', 'AUTO_NOTICE_CHANGED']);
      expect(await consentRows(e)).toEqual([]);
    });

    it('[SC-012-122] la espera vence a los 90 días desde EMERGENCY_NOTICE_EFFECTIVE_AT: el mantenimiento borra la fila (evento de sistema) y reconcilia; a los 89 días se conserva', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      await use.activate(ANDRES, PET);
      const effective = hoursAfter(T0, 1);
      const next = emergencyCases(emergencyDeps(e, { noticeVersion: '0.2.0', noticeEffectiveAt: effective }));
      e.setNow(daysAfter(effective, 89));
      await next.maintenance();
      expect(await consentRows(e)).toHaveLength(1);
      e.setNow(daysAfter(effective, 91));
      await next.maintenance();
      expect(await consentRows(e)).toEqual([]);
      expect((await cardRow(e))!['status']).toBe('ON'); // sigue por las alergias
      expect(await auditCount(e, 'EMERGENCY_PHONE_CONSENT_CHANGED')).toBeGreaterThanOrEqual(2);
    });

    it('[SC-012-122] rotación de PHONE_HMAC_KEY: mientras el barrido no corre la fila con el HMAC viejo NO se publica; el barrido recalcula (el consentimiento se mantiene) o borra si falta el teléfono; nunca queda en espera', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.updatePhone(MARIA, PHONE_M);
      for (const who of [ANDRES, MARIA]) await use.setConsent(who, PET, { visible: true, noticeVersion: NOTICE });
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      const before = (await consentRows(e)).map((r) => r['phoneHmac']);
      const rotated = emergencyCases(emergencyDeps(e, { phoneHmacKey: KEY_B }));
      expect((await rotated.publicView(token))['contactPhones']).toEqual([]); // falla cerrada
      // El teléfono de MARIA desaparece fuera de banda (p. ej. dato corrupto): el barrido debe borrar su fila.
      await setPhoneOutOfBand(e, MARIA, null);
      await rotated.rotateKey();
      const rows = await consentRows(e);
      expect(rows.map((r) => r['userId'])).toEqual([ANDRES]);
      expect(rows[0]!['phoneHmac']).not.toBe(before[0]);
      expect((await rotated.publicView(token))['contactPhones']).toEqual([{ phone: PHONE_A }]);
      expect(await auditCount(e, 'EMERGENCY_PHONE_CONSENT_CHANGED')).toBeGreaterThanOrEqual(3);
      await rotated.rotateKey(); // idempotente
      expect(await consentRows(e)).toHaveLength(1);
    });

    it('[SC-012-123] reconciliación perezosa ordenada: el 404 uniforme va primero y no escribe; dos lecturas concurrentes emiten UN solo EMERGENCY_CARD_AUTO_DEACTIVATED', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.activate(ANDRES, PET);
      await setPhoneOutOfBand(e, ANDRES, null); // guarda rota fuera de banda
      expect(await codeOf(use.status(LUCIA, PET))).toBe(NOT_FOUND);
      expect((await cardRow(e))!['status']).toBe('ON');
      expect(await auditCount(e, 'EMERGENCY_CARD_AUTO_DEACTIVATED')).toBe(0);
      const [a, b] = await Promise.all([use.status(ANDRES, PET), use.status(MARIA, PET)]);
      expect([a['status'], b['status']]).toEqual(['OFF', 'OFF']);
      expect(await auditCount(e, 'EMERGENCY_CARD_AUTO_DEACTIVATED')).toBe(1);
    });

    it('[SC-012-124] historial: statusReason y lastChange duran 90 días; a los 91 días son null y la purga deja la fila sin historial', async () => {
      const { e, use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      await use.activate(ANDRES, PET);
      await use.deactivate(ANDRES, PET);
      e.setNow(daysAfter(T0, 89));
      const at89 = await use.status(ANDRES, PET);
      expect([at89['statusReason'], (at89['lastChange'] as { kind: string }).kind]).toEqual(['USER_DEACTIVATED', 'DEACTIVATED']);
      e.setNow(daysAfter(T0, 91));
      const at91 = await use.status(ANDRES, PET);
      expect([at91['statusReason'], at91['lastChange'], at91['criticalAllergiesChange']]).toEqual([null, null, null]);
      await use.maintenance();
      const row = (await cardRow(e))!;
      expect([row['statusReason'], row['statusChangedAt'], row['consentedByUserId'], row['activatedAt'], row['tokenRotatedAt'], row['consentNoticeVersion']].map((v) => v ?? null)).toEqual([null, null, null, null, null, null]);
    });

    it('[SC-012-050] last_scanned_at: solo marca de tiempo con granularidad de 60 min, sin IP; se pone a NULL al desactivar', async () => {
      const { e, use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      e.setNow('2026-11-26T11:42:00.000Z');
      await use.publicView(token);
      expect((await cardRow(e))!['lastScannedAt']).toBe('2026-11-26T11:00:00.000Z');
      e.setNow('2026-11-26T11:59:00.000Z');
      await use.publicView(token);
      expect((await cardRow(e))!['lastScannedAt']).toBe('2026-11-26T11:00:00.000Z');
      e.setNow('2026-11-26T12:00:00.000Z');
      await use.publicView(token);
      expect((await cardRow(e))!['lastScannedAt']).toBe('2026-11-26T12:00:00.000Z');
      expect(Object.keys((await cardRow(e))!).filter((k) => /ip|agent/i.test(k))).toEqual([]);
      await use.deactivate(ANDRES, PET);
      expect(((await cardRow(e))!)['lastScannedAt'] ?? null).toBeNull();
    });

    it('[SC-012-106] tope por usuario de 20 por hora (activar+regenerar+desactivar, también las peticiones que acaban en 404): la 21.ª da 429 ERR-RATE-LIMITED, no se registra ni prolonga la ventana, y se libera a la hora', async () => {
      const { e, use } = await boot();
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      await use.activate(ANDRES, PET);
      for (let i = 0; i < 9; i += 1) await use.regenerate(ANDRES, PET);
      for (let i = 0; i < 10; i += 1) expect(await codeOf(use.deactivate(ANDRES, '00000000-0000-4000-8000-0000000fffff'))).toBe(NOT_FOUND);
      expect(await codeOf(use.regenerate(ANDRES, PET))).toBe(RATE);
      expect(await codeOf(use.deactivate(ANDRES, PET))).toBe(RATE);
      expect(await e.run((r) => r.rateLimits.countSince('QR_CARD_MUTATION' as never, ANDRES, '2026-11-26T00:00:00.000Z'))).toBe(20);
      expect(await codeOf(use.regenerate(MARIA, PET))).not.toBe(RATE); // el tope es por usuario
      e.setNow(hoursAfter(T0, 1.01));
      expect(await codeOf(use.regenerate(ANDRES, PET))).toBe('OK');
    });

    it('[SC-012-106] tope por usuario de 60 por hora para consentimiento, alergias y teléfono (también ADMIN de hogar): la 61.ª da 429; el cubo de tarjeta es independiente', async () => {
      const { use } = await boot();
      for (let i = 0; i < 20; i += 1) await use.updateAllergies(ANDRES, PET, [`a${i}`]);
      for (let i = 0; i < 20; i += 1) await use.updatePhone(ANDRES, i % 2 === 0 ? PHONE_A : PHONE_M);
      for (let i = 0; i < 20; i += 1) await use.setConsent(ANDRES, PET, { visible: false });
      expect(await codeOf(use.updateAllergies(ANDRES, PET, ['x']))).toBe(RATE);
      expect(await codeOf(use.updatePhone(ANDRES, PHONE_A))).toBe(RATE);
      expect(await codeOf(use.setConsent(ANDRES, PET, { visible: false }))).toBe(RATE);
      expect(await codeOf(use.activate(ANDRES, PET))).not.toBe(RATE);
    });

    it('[SC-012-127] paridad: el mismo escenario deja filas equivalentes en los tres motores (sin token ni teléfono en claro en ninguna tabla de la ficha)', async () => {
      const { e, use } = await boot();
      await use.updatePhone(ANDRES, PHONE_A);
      await use.setConsent(ANDRES, PET, { visible: true, noticeVersion: NOTICE });
      await use.updateAllergies(ANDRES, PET, ['Polen']);
      const { token } = (await use.activate(ANDRES, PET)) as { token: string };
      const dump = JSON.stringify([await cardRow(e), await consentRows(e)]);
      expect(dump).not.toContain(token);
      expect(dump).not.toContain(PHONE_A);
      const row = (await cardRow(e))!;
      expect([row['status'], row['statusReason'] ?? null, row['consentNoticeVersion'], row['consentedByUserId'], row['version']]).toEqual(['ON', null, NOTICE, ANDRES, 1]);
    });
  });
}
