/**
 * T724 [REQ-PRM-002][REQ-ALB5-005][SC-005-004][SC-005-034] composición de producción: `createProductionApp` conecta el puerto de parámetros de plataforma
 * (repositorio SQL + caché) al caso de uso: `album/limits` informa el valor de la fila `album.max_photos_per_pet` (10 sembrado; 12 editado) y cae al defecto 10
 * con un valor ilegible. Cada arranque tiene su propia caché por instancia (D5-07).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { createProductionApp } from '../../../src/infrastructure/http/server.ts';
import { activateInFile } from '../../fixtures/active-accounts.ts';
import { openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

const CSRF = { 'x-argos-request': '1' };
let dir = '';
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'argos-t724-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function limits(path: string, petId: string): Promise<unknown> {
  const app = await createProductionApp(loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: path, ARGOS_MEDIA_DRIVER: 'memory' }), false);
  try {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: CSRF, payload: { username: 'luna.t724', password: 'Clave2026x!' } });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    return (await app.inject({ method: 'GET', url: `/api/pets/${petId}/album/limits`, headers: { cookie } })).json();
  } finally {
    await app.close();
  }
}

describe('T724 composición de parámetros de plataforma en createProductionApp', () => {
  it('[SC-005-004][SC-005-034] limits sigue la fila: 10 sembrado, 12 editado y 10 con un valor ilegible', async () => {
    const path = join(dir, 'argos.sqlite');
    const first = await createProductionApp(loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: path, ARGOS_MEDIA_DRIVER: 'memory' }), false);
    const register = await first.inject({ method: 'POST', url: '/api/auth/register', headers: CSRF, payload: { adultDeclaration: true, username: 'luna.t724', displayName: 'Luna T724', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' } });
    expect(register.statusCode).toBe(201);
    await activateInFile(path, 'luna.t724'); // 009 (T1246): el alta nace PENDING y sin sesión; el arnés T1244 la activa
    const login = await first.inject({ method: 'POST', url: '/api/auth/login', headers: CSRF, payload: { username: 'luna.t724', password: 'Clave2026x!' } });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const pet = await first.inject({ method: 'POST', url: '/api/pets', headers: { ...CSRF, cookie }, payload: { name: 'Nube', species: 'CANINE', breed: 'Mestiza', birthDate: '2020-05-01', sex: 'MALE', avatarUrl: null } });
    expect(pet.statusCode).toBe(201);
    const petId = (pet.json() as { id: string }).id;
    await first.close();

    expect(await limits(path, petId)).toEqual({ photoCount: 0, maxPhotosPerPet: 10 });
    const db = openSqliteDatabase(path);
    db.prepare("UPDATE platform_parameters SET value = '12' WHERE key = 'album.max_photos_per_pet'").run();
    expect(await limits(path, petId)).toEqual({ photoCount: 0, maxPhotosPerPet: 12 });
    db.prepare("UPDATE platform_parameters SET value = 'abc' WHERE key = 'album.max_photos_per_pet'").run();
    db.close();
    expect(await limits(path, petId)).toEqual({ photoCount: 0, maxPhotosPerPet: 10 });
  });
});
