import { afterEach, describe, expect, it } from 'vitest';
import type { UserAccount } from '../../src/application/ports/repositories.port.ts';
import type { AuthIdentityRecord, OAuthFlowStateRecord } from '../../src/application/ports/auth-identity.port.ts';
import type { ContractSuiteOptions, UnitOfWorkFactory } from './repository-contract-suite.ts';
import { fixtures } from './application-harness.ts';
import { hashOneTimeToken } from '../../src/domain/auth/one-time-token.ts';

/**
 * Suite de contratos de los repositorios del acceso con Google (T1117; Feature 008, [GH:#16]; REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-VIN8-003, EDGE-008-023,
 * EDGE-008-036, H-8-04): `authIdentities`, `oauthFlows` y las operaciones de correo verificado de `users`. La ejecutan memoria, SQLite y PostgreSQL.
 * Cada prueba parte de una unidad de trabajo vacía.
 */
const account = (user: object, over: Partial<UserAccount> = {}): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: 'h-x', ...over }) as UserAccount;
const ANDRES = account(fixtures.users[0], { email: 'andres@example.test' });
const MARIA = account(fixtures.users[1], { email: 'ANDRES@example.test' });
const OTRO = account({ id: 'a0000000-0000-4000-8000-0000000000f3', username: 'otro', displayName: 'Otro', createdAt: '2026-11-01T00:00:00.000Z' }, { email: 'otro@example.test' });
const NOW = '2026-11-21T12:00:00.000Z';
const LATER = '2026-11-21T12:15:00.000Z';
const identity = (sub: string, userId: string): AuthIdentityRecord => ({ provider: 'GOOGLE', providerSubject: sub, userId, createdAt: NOW });
/** SHA-256 hex de 64 caracteres (la forma de `sessions.token_hash`). */
const ORIGIN_HASH = hashOneTimeToken('sesion-de-origen');
const hash = (n: string) => hashOneTimeToken(n.repeat(43));
const authorization = (n: string, over: Partial<OAuthFlowStateRecord> = {}): OAuthFlowStateRecord => ({
  tokenHash: hash(n), phase: 'AUTHORIZATION', intent: 'LOGIN', state: `state-${n}`, nonce: `nonce-${n}`, codeVerifier: `verifier-${n}`, userId: null,
  originSessionHash: null, pendingSubject: null, pendingEmail: null, createdAt: NOW, expiresAt: LATER, consumedAt: null, ...over,
});

async function rejects(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise;
  } catch {
    return true;
  }
  return false;
}

export function defineAuthIdentityRepositoryContractSuite(adapterName: string, createUnitOfWork: UnitOfWorkFactory, options: ContractSuiteOptions = {}): void {
  describe(`suite de contratos del acceso con Google (${adapterName})`, () => {
    if (options.dispose) afterEach(async () => options.dispose!());

    const prepare = async () => {
      const uow = await createUnitOfWork();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert({ ...MARIA, email: 'maria@example.test' });
        await r.users.insert(OTRO);
      });
      return uow;
    };

    it('[REQ-SSO8-001] insertIfAbsent inserta la identidad y la devuelve por (provider, sub) y por usuario; un sub desconocido da null', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        const inserted = await r.authIdentities.insertIfAbsent(identity('sub-1', ANDRES.id));
        return [inserted, await r.authIdentities.findBySubject('GOOGLE', 'sub-1'), await r.authIdentities.findBySubject('GOOGLE', 'sub-2'), await r.authIdentities.listByUser(ANDRES.id), await r.authIdentities.listByUser(MARIA.id)];
      });
      expect(result).toEqual([true, identity('sub-1', ANDRES.id), null, [identity('sub-1', ANDRES.id)], []]);
    });

    it('[REQ-SSO8-001, EDGE-008-002] insertIfAbsent es atómico sobre (provider, sub): el segundo intento devuelve false y la identidad sigue siendo de la primera cuenta', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        const first = await r.authIdentities.insertIfAbsent(identity('sub-1', ANDRES.id));
        const second = await r.authIdentities.insertIfAbsent(identity('sub-1', MARIA.id));
        return [first, second, await r.authIdentities.findBySubject('GOOGLE', 'sub-1')];
      });
      expect(result).toEqual([true, false, identity('sub-1', ANDRES.id)]);
    });

    it('[REQ-SSO8-001] una identidad de un usuario inexistente se rechaza (clave foránea)', async () => {
      const uow = await prepare();
      expect(await rejects(uow.runInTransaction((r) => r.authIdentities.insertIfAbsent(identity('sub-1', 'a0000000-0000-4000-8000-0000000000aa'))))).toBe(true);
    });

    it('[H-8-04] borrar la cuenta elimina sus identidades y sus estados del flujo, y countReferences los cuenta', async () => {
      const uow = await prepare();
      const before = await uow.runInTransaction(async (r) => {
        await r.authIdentities.insertIfAbsent(identity('sub-1', ANDRES.id));
        await r.oauthFlows.insert(authorization('a', { intent: 'LINK', userId: ANDRES.id, originSessionHash: ORIGIN_HASH }));
        await r.oauthFlows.insert(authorization('b'));
        return r.users.countReferences(ANDRES.id);
      });
      const baseline = await uow.runInTransaction((r) => r.users.countReferences(MARIA.id));
      expect([before, baseline]).toEqual([3, 1]);
      const after = await uow.runInTransaction(async (r) => {
        await r.users.delete(ANDRES.id);
        return [await r.users.countReferences(ANDRES.id), await r.authIdentities.findBySubject('GOOGLE', 'sub-1'), await r.oauthFlows.findByTokenHash(hash('a')), await r.oauthFlows.findByTokenHash(hash('b'))];
      });
      expect(after[0]).toBe(0);
      expect(after[1]).toBeNull();
      expect(after[2]).toBeNull();
      expect(after[3]).toEqual(authorization('b'));
    });

    it('[REQ-SSO8-004] el estado del flujo se guarda y se lee tal cual en las dos fases (AUTHORIZATION con PKCE, USERNAME con la identidad pendiente)', async () => {
      const uow = await prepare();
      const username = authorization('u', { phase: 'USERNAME', state: null, nonce: null, codeVerifier: null, pendingSubject: 'sub-9', pendingEmail: 'nuevo@example.test' });
      const link = authorization('l', { intent: 'LINK', userId: MARIA.id, originSessionHash: ORIGIN_HASH });
      const found = await uow.runInTransaction(async (r) => {
        await r.oauthFlows.insert(authorization('a'));
        await r.oauthFlows.insert(username);
        await r.oauthFlows.insert(link);
        return [await r.oauthFlows.findByTokenHash(hash('a')), await r.oauthFlows.findByTokenHash(hash('u')), await r.oauthFlows.findByTokenHash(hash('l')), await r.oauthFlows.findByTokenHash(hash('z'))];
      });
      expect(found).toEqual([authorization('a'), username, link, null]);
    });

    it('[REQ-SSO8-004] un identificador repetido o una fila con forma incoherente se rechazan', async () => {
      const uow = await prepare();
      await uow.runInTransaction((r) => r.oauthFlows.insert(authorization('a')));
      expect(await rejects(uow.runInTransaction((r) => r.oauthFlows.insert(authorization('a', { state: 'otro' }))))).toBe(true);
      expect(await rejects(uow.runInTransaction((r) => r.oauthFlows.insert(authorization('b', { state: null }))))).toBe(true);
      expect(await rejects(uow.runInTransaction((r) => r.oauthFlows.insert(authorization('c', { intent: 'LINK' }))))).toBe(true);
      // [REQ-VIN8-004] [INV-VIN8-005] LINK sin hash de la sesión de origen, hash en LOGIN o hash de longitud distinta de 64: la BD (y la memoria) los rechazan.
      expect(await rejects(uow.runInTransaction((r) => r.oauthFlows.insert(authorization('d', { intent: 'LINK', userId: ANDRES.id }))))).toBe(true);
      expect(await rejects(uow.runInTransaction((r) => r.oauthFlows.insert(authorization('e', { originSessionHash: ORIGIN_HASH }))))).toBe(true);
      expect(await rejects(uow.runInTransaction((r) => r.oauthFlows.insert(authorization('f', { intent: 'LINK', userId: ANDRES.id, originSessionHash: 'corto' }))))).toBe(true);
    });

    it('[REQ-SSO8-004, SC-008-005] consume es un compare-and-set: el primero gana, el segundo (state reutilizado) recibe null y la fila queda marcada', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        await r.oauthFlows.insert(authorization('a'));
        const first = await r.oauthFlows.consume(hash('a'), '2026-11-21T12:05:00.000Z', 'AUTHORIZATION');
        const second = await r.oauthFlows.consume(hash('a'), '2026-11-21T12:06:00.000Z', 'AUTHORIZATION');
        return [first, second, await r.oauthFlows.findByTokenHash(hash('a'))];
      });
      const consumed = authorization('a', { consumedAt: '2026-11-21T12:05:00.000Z' });
      expect(result).toEqual([consumed, null, consumed]);
    });

    it('[REQ-SSO8-004, EDGE-008-007] consume no usa una fila vencida (exactamente en expires_at ya no vale), de otra fase o inexistente, y no la marca', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        await r.oauthFlows.insert(authorization('a'));
        const last = await r.oauthFlows.consume(hash('a'), '2026-11-21T12:14:59.999Z', 'USERNAME');
        const wrongPhase = await r.oauthFlows.findByTokenHash(hash('a'));
        const atExpiry = await r.oauthFlows.consume(hash('a'), LATER, 'AUTHORIZATION');
        const missing = await r.oauthFlows.consume(hash('z'), NOW, 'AUTHORIZATION');
        return [last, wrongPhase, atExpiry, missing, await r.oauthFlows.consume(hash('a'), '2026-11-21T12:14:59.999Z', 'AUTHORIZATION')];
      });
      expect(result).toEqual([null, authorization('a'), null, null, authorization('a', { consumedAt: '2026-11-21T12:14:59.999Z' })]);
    });

    it('[REQ-SSO8-004] purgeExpired borra solo las filas con expires_at <= ahora y devuelve el conteo', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        await r.oauthFlows.insert(authorization('a', { createdAt: '2026-11-21T11:00:00.000Z', expiresAt: '2026-11-21T11:15:00.000Z' }));
        await r.oauthFlows.insert(authorization('b', { createdAt: '2026-11-21T11:50:00.000Z', expiresAt: NOW }));
        await r.oauthFlows.insert(authorization('c'));
        const purged = await r.oauthFlows.purgeExpired(NOW);
        return [purged, await r.oauthFlows.findByTokenHash(hash('a')), await r.oauthFlows.findByTokenHash(hash('b')), await r.oauthFlows.findByTokenHash(hash('c'))];
      });
      expect(result).toEqual([2, null, null, authorization('c')]);
    });

    it('[REQ-SSO8-003, EDGE-008-036] una cuenta sin correo verificado no trae emailVerifiedAt; insertar con emailVerifiedAt lo conserva y update no lo toca', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        const legacy = await r.users.findById(ANDRES.id);
        const born = account({ id: 'a0000000-0000-4000-8000-0000000000f4', username: 'nacida', displayName: 'Nacida', createdAt: NOW }, { email: 'nacida@example.test', emailVerifiedAt: NOW });
        await r.users.insert(born);
        await r.users.update({ ...born, timezone: 'America/Lima' });
        return [legacy, await r.users.findById(born.id)];
      });
      expect(result[0]).toEqual(ANDRES);
      expect((result[0] as UserAccount).emailVerifiedAt).toBeUndefined();
      expect(result[1]).toMatchObject({ emailVerifiedAt: NOW, timezone: 'America/Lima', email: 'nacida@example.test' });
    });

    it('[REQ-VIN8-003] findVerifiedByEmail devuelve solo al titular verificado (sin distinguir mayúsculas); un correo verificado tiene un solo titular', async () => {
      const uow = await prepare();
      const verified = account({ id: 'a0000000-0000-4000-8000-0000000000f5', username: 'google', displayName: 'Google', createdAt: NOW }, { email: 'Titular@Example.test', emailVerifiedAt: NOW });
      const result = await uow.runInTransaction(async (r) => {
        await r.users.insert(verified);
        return [await r.users.findVerifiedByEmail('titular@example.test'), await r.users.findVerifiedByEmail('andres@example.test'), await r.users.findVerifiedByEmail('nadie@example.test')];
      });
      expect(result[0]).toMatchObject({ id: verified.id, emailVerifiedAt: NOW });
      expect(result[1]).toBeNull();
      expect(result[2]).toBeNull();
      const clash = account({ id: 'a0000000-0000-4000-8000-0000000000f6', username: 'clon', displayName: 'Clon', createdAt: NOW }, { email: 'titular@example.test', emailVerifiedAt: NOW });
      expect(await rejects(uow.runInTransaction((r) => r.users.insert(clash)))).toBe(true);
    });

    it('[D8-14, EDGE-008-023] releaseUnverifiedEmail anula el correo de TODAS las cuentas sin verificar (sin distinguir mayúsculas), conserva usuario y contraseña, y no toca la verificada', async () => {
      const uow = await prepare();
      await uow.runInTransaction((r) => r.users.insert(account({ id: 'a0000000-0000-4000-8000-0000000000f7', username: 'verificada', displayName: 'V', createdAt: NOW }, { email: 'compartido@example.test', emailVerifiedAt: NOW })));
      await uow.runInTransaction(async (r) => {
        await r.users.update({ ...ANDRES, email: 'Compartido@example.test' });
        await r.users.update({ ...OTRO, email: 'compartido@example.test' });
      });
      const result = await uow.runInTransaction(async (r) => {
        const released = await r.users.releaseUnverifiedEmail('compartido@example.test');
        return [released, await r.users.findById(ANDRES.id), await r.users.findById(OTRO.id), await r.users.findById('a0000000-0000-4000-8000-0000000000f7'), await r.users.releaseUnverifiedEmail('compartido@example.test')];
      });
      expect(result[0]).toBe(2);
      expect(result[1]).toEqual({ ...ANDRES, email: null });
      expect(result[2]).toEqual({ ...OTRO, email: null });
      expect(result[3]).toMatchObject({ email: 'compartido@example.test', emailVerifiedAt: NOW });
      expect(result[4]).toBe(0);
    });
  });
}
