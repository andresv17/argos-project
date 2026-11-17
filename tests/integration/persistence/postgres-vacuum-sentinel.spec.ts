/**
 * T473b (REQ-PG-015, REQ-PG-011, SC-CLD-019): prueba con centinela contra PostgreSQL 17 real.
 * Demuestra el EFECTO del flujo vacuum-argos.yml, no solo el proceso: un usuario con correo centinela se elimina con
 * `argos_app` y, tras la misma secuencia de VACUUM (SQL compartido en scripts/vacuum-argos.sql) ejecutada con el rol
 * propietario `argos_migrator`, el centinela ya no aparece en las páginas del heap ni de los índices (pageinspect) y el
 * tamaño físico de la relación (pg_relation_size) refleja la compactación.
 * Se OMITE con motivo explícito si falta TEST_DATABASE_URL (igual que los demás postgres-*.spec.ts). Requiere superusuario
 * (CREATE DATABASE, CREATE ROLE, CREATE EXTENSION pageinspect: la extensión existe SOLO en la base efímera de esta prueba).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
// Esquema vigente: el baseline y la 0002 (columna `revision` de los 6 registros, T540; los repositorios la leen y la escriben desde T614).
const BASELINE = ['0001_baseline.sql', '0002_record_revision.sql']
  .map((name) => readFileSync(new URL(`../../../src/infrastructure/persistence/postgres/migrations/${name}`, import.meta.url), 'utf8'))
  .join('\n');
const SHARED_SQL = readFileSync(new URL('../../../scripts/vacuum-argos.sql', import.meta.url), 'utf8');

/** Secciones `-- @sql <nombre>` del SQL compartido (el flujo las extrae con awk; aquí con el mismo criterio). */
function seccion(nombre: string): string {
  const out: string[] = [];
  let dentro = false;
  for (const linea of SHARED_SQL.split('\n')) {
    const m = /^--\s+@sql\s+(\S+)\s*$/.exec(linea);
    if (m !== null) {
      dentro = m[1] === nombre;
      continue;
    }
    if (dentro) out.push(linea);
  }
  const texto = out.join('\n').trim();
  if (texto === '') throw new Error(`Sección @sql ${nombre} ausente en scripts/vacuum-argos.sql`);
  return texto;
}

type Modo = 'full' | 'simple';
const OPCIONES_FULL = '-c lock_timeout=3s -c statement_timeout=120s'; // mismo PGOPTIONS del flujo
const OPCIONES_SIMPLE = '-c statement_timeout=120s';
/** PG <= 15: "only table owner can vacuum it"; PG >= 16 (Neon/17): "permission denied to vacuum \"t\", skipping it". */
const SIN_PRIVILEGIO = /only table owner|permission denied to vacuum/i;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function urlPara(base: string, usuario: string, clave: string, baseDatos: string): string {
  const u = new URL(base);
  u.username = usuario;
  u.password = clave;
  u.pathname = `/${baseDatos}`;
  return u.toString();
}

async function conectar(url: string, options?: string): Promise<{ client: pg.Client; notices: string[] }> {
  const client = new pg.Client({ connectionString: url, options });
  const notices: string[] = [];
  client.on('notice', (n) => notices.push(n.message ?? ''));
  client.on('error', () => undefined); // un cierre forzado al borrar la base efímera no debe tumbar la corrida
  await client.connect();
  return { client, notices };
}

describe.skipIf(!TEST_DATABASE_URL)(
  'T473b centinela de VACUUM contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)',
  () => {
    const sufijo = randomUUID().replace(/-/g, '').slice(0, 10);
    const dbNombre = `argos_vac_${sufijo}`;
    const claveApp = `a${randomUUID()}`;
    const claveMig = `m${randomUUID()}`;
    // H-O-T473b-3: roles de clúster con sufijo único por corrida, creados y borrados SOLO por esta prueba (nunca se toca un rol ajeno).
    const rolApp = `argos_app_${sufijo}`;
    const rolMig = `argos_migrator_${sufijo}`;
    let rolesCreados: string[] = [];
    let admin: pg.Client;
    let su: pg.Client; // superusuario dentro de la base efímera (pageinspect)
    let urlApp = '';
    let urlMig = '';

    async function ejecutarSecuencia(modo: Modo): Promise<{ notices: string[]; estado: pg.QueryResult }> {
      const { client, notices } = await conectar(urlMig, modo === 'full' ? OPCIONES_FULL : OPCIONES_SIMPLE);
      try {
        const tablas = (await client.query<{ tabla: string }>(seccion('listar_tablas'))).rows.map((r) => r.tabla);
        expect(tablas.length).toBeGreaterThan(0);
        const sentencia = seccion(modo === 'full' ? 'vacuum_full' : 'vacuum_simple');
        const intentos = modo === 'full' ? 3 : 1;
        for (const t of tablas) {
          for (let i = 1; ; i++) {
            try {
              await client.query(`${sentencia} ${t}`);
              if (modo === 'full') await client.query(`${seccion('vacuum_tras_full')} ${t}`); // H-K-T473-5 (opción A)
              break;
            } catch (e) {
              if (i >= intentos) throw e;
              await sleep(100);
            }
          }
        }
        const estado = await client.query(seccion('estado'));
        return { notices, estado };
      } finally {
        await client.end();
      }
    }

    /** Páginas (heap o índice) cuyo contenido crudo contiene el centinela. Lee la página completa, también el espacio libre. */
    async function paginasConCentinela(relacion: string, centinela: string): Promise<number[]> {
      const r = await su.query<{ n: number }>(
        `SELECT n FROM generate_series(0, GREATEST(pg_relation_size($1::text::regclass) / 8192 - 1, -1)) AS n
          WHERE position(convert_to($2::text, 'UTF8') IN get_raw_page($1::text, n::int)) > 0`,
        [relacion, centinela],
      );
      return r.rows.map((x) => x.n);
    }
    /** Tuplas direccionables (heap_page_items) que aún contienen el centinela: la fila muerta o viva visible a pageinspect. */
    async function tuplasDireccionablesConCentinela(centinela: string): Promise<number> {
      const r = await su.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM generate_series(0, GREATEST(pg_relation_size('users'::regclass) / 8192 - 1, -1)) AS b,
                LATERAL heap_page_items(get_raw_page('users', b::int)) AS i
          WHERE i.lp_len > 0 AND position(convert_to($1::text, 'UTF8') IN i.t_data) > 0`,
        [centinela],
      );
      return Number(r.rows[0]?.n);
    }
    // users_pkey no se inspecciona: el centinela es username/email (id es otro UUID), por lo que no puede contenerlo (H-O-T473b-2).
    const heapYIndices = ['users', 'users_username_key'] as const;
    async function centinelaEnRelaciones(centinela: string): Promise<Record<string, number[]>> {
      const out: Record<string, number[]> = {};
      for (const rel of heapYIndices) out[rel] = await paginasConCentinela(rel, centinela);
      return out;
    }
    const tamano = async (rel: string): Promise<number> => Number((await su.query<{ s: string }>('SELECT pg_relation_size($1::text::regclass)::text AS s', [rel])).rows[0]?.s);

    async function sembrar(relleno = 40): Promise<{ centinela: string; app: pg.Client }> {
      await su.query('TRUNCATE users CASCADE');
      await su.query('ALTER TABLE users SET (autovacuum_enabled = false)');
      const centinela = `centinela-${randomUUID()}`;
      const { client: app } = await conectar(urlApp);
      const insertar = (id: string, username: string, email: string): Promise<pg.QueryResult> =>
        app.query('INSERT INTO users (id, username, password_hash, data, email) VALUES ($1, $2, $3, $4::jsonb, $5)', [
          id,
          username,
          'hash-sintetico',
          JSON.stringify({ displayName: username }),
          email,
        ]);
      // Relleno que conserva viva la página (el VACUUM simple no puede truncar un archivo con filas vivas).
      await app.query(
        `INSERT INTO users (id, username, password_hash, data, email)
         SELECT gen_random_uuid()::text, 'relleno-' || g || '-' || gen_random_uuid()::text, 'hash-sintetico', '{"displayName":"relleno"}'::jsonb,
                'relleno-' || g || '@vacuum.example.test'
           FROM generate_series(1, $1::int) AS g`,
        [relleno],
      );
      await insertar(randomUUID(), centinela, `${centinela}@vacuum.example.test`);
      return { centinela, app };
    }

    beforeAll(async () => {
      admin = (await conectar(TEST_DATABASE_URL!)).client;
      await admin.query(`CREATE DATABASE ${dbNombre}`);
      const baseSu = (await admin.query<{ u: string }>('SELECT current_user AS u')).rows[0]!.u;
      expect(baseSu).not.toBe('');
      const suUrl = new URL(TEST_DATABASE_URL!);
      suUrl.pathname = `/${dbNombre}`;
      su = (await conectar(suUrl.toString())).client;
      // Roles de la prueba (de clúster): solo se crean si no existen (nunca ALTER sobre un rol ajeno) y se registran para borrarlos.
      for (const [rol, clave] of [[rolApp, claveApp], [rolMig, claveMig]] as const) {
        const existe = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [rol])).rowCount === 1;
        if (existe) throw new Error(`El rol ${rol} ya existe: la prueba no toca roles que no creó`);
        await admin.query(`CREATE ROLE ${rol} LOGIN PASSWORD '${clave}'`);
        rolesCreados.push(rol);
      }
      await su.query(BASELINE);
      await su.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
      await su.query(`GRANT USAGE ON SCHEMA public TO ${rolApp}, ${rolMig}`);
      const tablas = (await su.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows;
      for (const { tablename } of tablas) await su.query(`ALTER TABLE ${tablename} OWNER TO ${rolMig}`);
      await su.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${rolApp}`);
      await su.query('CREATE EXTENSION pageinspect');
      urlApp = urlPara(TEST_DATABASE_URL!, rolApp, claveApp, dbNombre);
      urlMig = urlPara(TEST_DATABASE_URL!, rolMig, claveMig, dbNombre);
    }, 60_000);

    afterAll(async () => {
      await su?.end();
      if (admin !== undefined) {
        await admin.query(`DROP DATABASE IF EXISTS ${dbNombre} WITH (FORCE)`);
        for (const rol of rolesCreados) await admin.query(`DROP ROLE IF EXISTS ${rol}`).catch(() => undefined);
        await admin.end();
      }
    });

    it('argos_app no es propietario: su VACUUM emite "only table owner" y no limpia nada (motivo de REQ-PG-015)', async () => {
      const { centinela, app } = await sembrar();
      const notices: string[] = [];
      app.on('notice', (n) => notices.push(n.message ?? ''));
      await app.query('DELETE FROM users WHERE email = $1', [`${centinela}@vacuum.example.test`]);
      await app.query('VACUUM (ANALYZE) users');
      await app.end();
      expect(notices.join('\n')).toMatch(SIN_PRIVILEGIO);
      const antes = await centinelaEnRelaciones(centinela);
      expect(antes['users']?.length).toBeGreaterThan(0); // la fila muerta sigue en el heap
    }, 60_000);

    it('línea base: tras el DELETE por argos_app y SIN vaciar, el centinela sigue en heap e índice', async () => {
      const { centinela, app } = await sembrar();
      const antesDelDelete = await centinelaEnRelaciones(centinela);
      expect(antesDelDelete['users']?.length).toBeGreaterThan(0);
      expect(antesDelDelete['users_username_key']?.length).toBeGreaterThan(0);
      const borrado = await app.query('DELETE FROM users WHERE email = $1', [`${centinela}@vacuum.example.test`]);
      await app.end();
      expect(borrado.rowCount).toBe(1);
      const vivas = Number((await su.query<{ n: string }>('SELECT count(*)::text AS n FROM users WHERE email = $1', [`${centinela}@vacuum.example.test`])).rows[0]?.n);
      expect(vivas).toBe(0);
      const despues = await centinelaEnRelaciones(centinela);
      expect(despues['users']?.length).toBeGreaterThan(0);
      expect(despues['users_username_key']?.length).toBeGreaterThan(0);
    }, 60_000);

    it('disparo manual VACUUM (FULL, ANALYZE) por argos_migrator: el centinela desaparece del heap y de los índices; pg_relation_size se compacta', async () => {
      const { centinela, app } = await sembrar(3000); // relleno que ocupa varias páginas: el FULL debe compactarlas
      await app.query('DELETE FROM users WHERE email = $1 OR email LIKE $2', [`${centinela}@vacuum.example.test`, 'relleno-%@vacuum.example.test']);
      await app.end();
      const tamanoAntes = await tamano('users');
      expect(tamanoAntes).toBeGreaterThan(8192 * 4); // premisa: la tabla ocupaba varias páginas antes de vaciar
      const { notices, estado } = await ejecutarSecuencia('full');
      expect(notices.join('\n')).not.toMatch(SIN_PRIVILEGIO);
      const despues = await centinelaEnRelaciones(centinela);
      expect(despues).toEqual({ users: [], users_username_key: [] });
      expect(await tamano('users')).toBeLessThan(tamanoAntes); // H-O-T473b-1: compactación demostrada, no solo "no creció"
      expect(estado.rowCount).toBeGreaterThan(0);
    }, 120_000);

    it('H-O-T473-3: tras el VACUUM del cron, last_vacuum se rellena (relectura una vez tras sleep 2 antes de fallar) y ninguna tabla supera 10 días', async () => {
      const { centinela, app } = await sembrar();
      await app.query('DELETE FROM users WHERE email = $1', [`${centinela}@vacuum.example.test`]);
      await app.end();
      await ejecutarSecuencia('simple');
      const { client } = await conectar(urlMig);
      try {
        let vencidas = (await client.query<{ relname: string }>(seccion('vencidas'))).rows.map((r) => r.relname);
        if (vencidas.length > 0) {
          await sleep(2000); // las estadísticas se vuelcan de forma asíncrona: una sola relectura antes de decidir el fallo
          vencidas = (await client.query<{ relname: string }>(seccion('vencidas'))).rows.map((r) => r.relname);
        }
        expect(vencidas).toEqual([]);
      } finally {
        await client.end();
      }
    }, 120_000);

    it('hecho de PostgreSQL 17 (H-K-T473-5): VACUUM (FULL, ANALYZE) NO actualiza last_vacuum aunque se relea tras sleep 2', async () => {
      const sonda = `sonda_${sufijo}`;
      await su.query(`CREATE TABLE ${sonda} (a int)`);
      await su.query(`ALTER TABLE ${sonda} OWNER TO ${rolMig}`);
      const { client } = await conectar(urlMig, OPCIONES_FULL);
      try {
        await client.query(`${seccion('vacuum_full')} public.${sonda}`);
        const leer = async (): Promise<{ lv: string | null; la: string | null }> => {
          const r = await client.query<{ lv: string | null; la: string | null }>(
            'SELECT last_vacuum::text AS lv, last_analyze::text AS la FROM pg_stat_user_tables WHERE relname = $1',
            [sonda],
          );
          return r.rows[0] ?? { lv: null, la: null };
        };
        await sleep(2000);
        const tras = await leer();
        expect(tras.lv).toBeNull(); // si PostgreSQL lo corrigiera, esta prueba avisa y el flujo podría simplificarse
        expect(typeof tras.la).toBe('string'); // ANALYZE sí queda registrado
      } finally {
        await client.end();
        await su.query(`DROP TABLE ${sonda}`);
      }
    }, 60_000);

    it('H-K-T473-5 opción A: la secuencia manual (FULL y luego VACUUM (ANALYZE) por tabla) deja last_vacuum no nulo en todas las tablas, sin tabla vencida', async () => {
      const { centinela, app } = await sembrar();
      await app.query('DELETE FROM users WHERE email = $1', [`${centinela}@vacuum.example.test`]);
      await app.end();
      expect(seccion('vacuum_tras_full')).toBe('VACUUM (ANALYZE)');
      await ejecutarSecuencia('full');
      const { client } = await conectar(urlMig);
      try {
        const leerVencidas = async (): Promise<string[]> => (await client.query<{ relname: string }>(seccion('vencidas'))).rows.map((r) => r.relname);
        let vencidas = await leerVencidas();
        if (vencidas.length > 0) {
          await sleep(2000);
          vencidas = await leerVencidas();
        }
        expect(vencidas).toEqual([]);
        const nulos = await client.query("SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' AND last_vacuum IS NULL");
        expect(nulos.rows).toEqual([]);
      } finally {
        await client.end();
      }
      // El centinela sigue ausente tras la secuencia completa (el VACUUM simple posterior no lo reintroduce).
      expect(await centinelaEnRelaciones(centinela)).toEqual({ users: [], users_username_key: [] });
    }, 120_000);

    it('cron VACUUM (ANALYZE) por argos_migrator: elimina la tupla muerta (lógico) pero el centinela sigue físicamente en heap e índice, por eso el disparo manual NO baja a simple', async () => {
      const { centinela, app } = await sembrar();
      await app.query('DELETE FROM users WHERE email = $1', [`${centinela}@vacuum.example.test`]);
      await app.end();
      expect(await tuplasDireccionablesConCentinela(centinela)).toBe(1); // fila muerta aún direccionable
      const { notices } = await ejecutarSecuencia('simple');
      expect(notices.join('\n')).not.toMatch(SIN_PRIVILEGIO);
      expect(await tuplasDireccionablesConCentinela(centinela)).toBe(0); // el VACUUM simple sí recupera la tupla
      const despues = await centinelaEnRelaciones(centinela);
      // Efecto físico observado en PostgreSQL 17: los bytes permanecen en el espacio libre de la página del heap y del índice.
      // Decisión de REQ-PG-015: el disparo manual debe seguir siendo VACUUM (FULL, ANALYZE) (modo por defecto "full").
      expect(despues['users']?.length).toBeGreaterThan(0);
      expect(despues['users_username_key']?.length).toBeGreaterThan(0);
    }, 120_000);
  },
);
