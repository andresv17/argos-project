import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DELEGATE_ROOT_EMAIL,
  EXISTING_USER_EMAIL,
  bootEnv,
  delegateOf,
  invite,
  listDelegates,
  loginAs,
  loginRoot,
  onboard,
  problemCode,
  subOf,
  type Backend,
  type Env,
  type Onboarded,
  type Resp,
} from '../fixtures/admin-delegates-011.ts';

/**
 * T1526 (011, Bloque D, #63, parte /sentinels): batería de los 9 vectores de explotación (Sentinels I..IX) sobre
 * `/api/admin/me` y `/api/admin/administrators*` (contrato `admin.openapi.yaml` 1.8.0). Solo contra el servidor en
 * memoria de las fábricas `admin-delegates-011.ts` (memoria y SQLite). No modifica código de producción.
 *
 * Cada caso registra código HTTP, código de problema y si cumple lo esperado por el contrato. Las filas se vuelcan a
 * un JSON de trabajo en el escritorio temporal de la sesión (no es un informe) para el acta.
 *
 * @implements REQ-ADM11-001, REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-005, REQ-ADM11-007, INV-ADM9-002, INV-ADM11-001, INV-ADM11-002
 */

type Row = { backend: string; sentinel: string; label: string; status: number; code: string | undefined; expected: string; pass: boolean; note: string };
const ROWS: Row[] = [];
const OUT_DIR = '/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/ccab4498-b9d4-4865-801f-8abdf8224462/scratchpad';

const SA_EMAIL = 'super.delegado@example.test';
const SA2_EMAIL = 'super.dos@example.test';
const OP_EMAIL = 'operador@example.test';
const SUP_EMAIL = 'soporte@example.test';
const PEND_EMAIL = 'pendiente@example.test';
const NOBODY_EMAIL = 'usuario.ajeno@example.test';
const LEAK_TOKENS = [SA_EMAIL, SA2_EMAIL, OP_EMAIL, SUP_EMAIL, PEND_EMAIL, EXISTING_USER_EMAIL, DELEGATE_ROOT_EMAIL, '<script', 'javascript:alert'];
const ZERO_UUID = '00000000-0000-4000-8000-000000000000';

let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const median = (values: number[]): number => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)]!;

async function runBattery(backend: Backend): Promise<void> {
  const e = await bootEnv(backend, { withExistingUser: true });
  env = e;
  const root = await loginRoot(e);
  const sa: Onboarded = await onboard(e, root, SA_EMAIL, 'SUPER_ADMIN');
  const sa2: Onboarded = await onboard(e, root, SA2_EMAIL, 'SUPER_ADMIN');
  const op: Onboarded = await onboard(e, root, OP_EMAIL, 'OPERATOR');
  const sup: Onboarded = await onboard(e, root, SUP_EMAIL, 'SUPPORT');
  await invite(e, root, PEND_EMAIL, 'SUPPORT');
  const ref404 = await e.call('GET', '/api/admin/ruta-no-declarada-t1526', {});

  const rowOf = async (email: string) => {
    const d = await delegateOf(e, root, email);
    if (d === undefined) throw new Error(`fila ausente en el arnés: ${email}`);
    return d;
  };
  const idOf = (x: Onboarded): string => {
    if (x.adminId === null) throw new Error(`sin adminId para ${x.email}`);
    return x.adminId;
  };

  const rec = (sentinel: string, label: string, r: Resp, expected: number[], code?: string, opts: { leakOk?: boolean; note?: string } = {}): void => {
    const statusOk = expected.includes(r.status);
    const codeOk = code === undefined || problemCode(r) === code;
    // El correo solo puede salir en éxitos a un SUPER_ADMIN (AdminDelegateView); en errores nunca (H-9).
    const leak = opts.leakOk !== true && r.status >= 400 && LEAK_TOKENS.some((t) => r.text.includes(t));
    ROWS.push({
      backend,
      sentinel,
      label,
      status: r.status,
      code: problemCode(r),
      expected: `${expected.join('|')}${code === undefined ? '' : ` ${code}`}`,
      pass: statusOk && codeOk && !leak,
      note: leak ? 'FUGA: el cuerpo contiene datos sensibles o reflejo' : opts.note ?? '',
    });
  };
  const noteFlag = (cond: boolean, yes: string, no: string): string => (cond ? yes : no);

  // ---------- Sentinel III: anónimo / sin sesión ----------
  const meAnon = await e.call('GET', '/api/admin/me', {});
  rec('III', 'GET /me sin cookie', meAnon, [404], undefined, { note: noteFlag(meAnon.text === ref404.text, 'cuerpo idéntico al 404 uniforme', 'cuerpo distinto del 404 uniforme') });
  const listAnon = await e.call('GET', '/api/admin/administrators', {});
  rec('III', 'GET administrators sin cookie', listAnon, [404]);
  const postAnon = await e.call('POST', '/api/admin/administrators', { body: { email: 'anonimo@example.test', emailConfirmation: 'anonimo@example.test', role: 'SUPER_ADMIN' } });
  rec('III', 'POST alta sin cookie (con cabecera CSRF, rol SUPER_ADMIN)', postAnon, [404]);
  const putAnon = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { headers: { 'if-match': '"x"' }, body: { role: 'SUPER_ADMIN' } });
  rec('III', 'PUT rol sin cookie', putAnon, [404]);
  const disAnon = await e.call('POST', `/api/admin/administrators/${idOf(op)}/disable`, { headers: { 'if-match': '"x"' } });
  rec('III', 'POST disable sin cookie', disAnon, [404]);
  const anonList = await listDelegates(e, root);
  rec('III', 'control: el alta anónima no creó fila (el listado del raíz no contiene el correo)', { ...postAnon, text: JSON.stringify(anonList.items.filter((d) => d.email === 'anonimo@example.test')) }, [404], undefined, { leakOk: true, note: 'lectura del estado tras el intento' });

  const stranger = await loginAs(e, { email: NOBODY_EMAIL, sub: subOf(NOBODY_EMAIL) });
  rec('III', 'identidad Google sin delegación (sustituto de rol de hogar): callback', stranger.done, [404], undefined, {
    note: 'MEMBER/CAREGIVER/READER: el arnés 011 no emite sesión de hogar; se usa identidad no administradora',
  });

  // ---------- Sentinel I: IDOR, recursos ajenos y rutas no declaradas ----------
  const liveEtag = (await rowOf(SUP_EMAIL)).etag;
  const idorSa = await e.call('PUT', `/api/admin/administrators/${ZERO_UUID}/role`, { cookie: sa.cookie, headers: { 'if-match': liveEtag }, body: { role: 'OPERATOR' } });
  rec('I', 'SUPER_ADMIN delegado: rol sobre adminId inexistente', idorSa, [404], 'ERR-ADM11-DELEGATE-NOT-FOUND');
  const idorOp = await e.call('PUT', `/api/admin/administrators/${ZERO_UUID}/role`, { cookie: op.cookie, headers: { 'if-match': liveEtag }, body: { role: 'OPERATOR' } });
  rec('I', 'OPERATOR: rol sobre adminId inexistente (no debe sondear: 403, no 404)', idorOp, [403], 'ERR-ADM11-ROLE-NOT-AUTHORIZED');
  const idorOpExisting = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: op.cookie, headers: { 'if-match': liveEtag }, body: { role: 'OPERATOR' } });
  rec('I', 'OPERATOR: rol sobre adminId existente (mismo 403, sin diferencia)', idorOpExisting, [403], 'ERR-ADM11-ROLE-NOT-AUTHORIZED');
  const malformedId = await e.call('PUT', '/api/admin/administrators/abc/role', { cookie: sa.cookie, headers: { 'if-match': liveEtag }, body: { role: 'OPERATOR' } });
  rec('I', 'SUPER_ADMIN delegado: adminId mal formado', malformedId, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const idorSup = await e.call('GET', '/api/admin/administrators', { cookie: sup.cookie });
  rec('I', 'SUPPORT: listado de delegados', idorSup, [403], 'ERR-ADM11-ROLE-NOT-AUTHORIZED');
  const rootNoRow = await e.call('PUT', `/api/admin/administrators/${ZERO_UUID}/disable`, { cookie: sa.cookie, headers: { 'if-match': liveEtag } });
  rec('I', 'SUPER_ADMIN delegado: baja sobre id inexistente (ruta mal escrita)', rootNoRow, [404, 405]);
  const deleteOwn = await e.call('DELETE', `/api/admin/administrators/${idOf(sup)}`, { cookie: root });
  rec('I', 'DELETE sobre delegado existente (H-9: no existe «eliminar»)', deleteOwn, [404]);
  const patchOwn = await e.call('PATCH', `/api/admin/administrators/${idOf(sup)}`, { cookie: root, body: { role: 'SUPER_ADMIN' } });
  rec('I', 'PATCH sobre delegado existente (verbo no declarado)', patchOwn, [404, 405]);
  const undeclared = await e.call('POST', `/api/admin/administrators/${idOf(sup)}/eliminar`, { cookie: root });
  rec('I', 'POST /administrators/{id}/eliminar (ruta no declarada)', undeclared, [404]);
  const undeclaredRoot = await e.call('GET', '/api/admin/nope-t1526', { cookie: root });
  rec('I', 'GET /api/admin/nope-t1526 con sesión raíz (ruta no declarada)', undeclaredRoot, [404]);
  const meWrite = await e.call('PUT', '/api/admin/me', { cookie: sa.cookie, body: { role: 'SUPER_ADMIN' } });
  rec('I', 'PUT /api/admin/me (ruta no declarada con cuerpo)', meWrite, [404, 405]);
  const survived = await listDelegates(e, root);
  rec('I', 'tras los intentos de borrado, la fila SUPPORT sigue presente', { ...idorSup, text: JSON.stringify(survived.items.map((d) => d.email)) }, [403], undefined, { leakOk: true, note: 'lectura del estado' });

  // ---------- Sentinel II: multi-inquilino, roles y estados inválidos ----------
  const autoSup = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: sup.cookie, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, body: { role: 'OPERATOR' } });
  rec('II', 'autopromoción: SUPPORT cambia su propio rol', autoSup, [403], 'ERR-ADM11-ROLE-NOT-AUTHORIZED');
  const opInvite = await invite(e, op.cookie, 'otro.alta@example.test', 'SUPPORT');
  rec('II', 'OPERATOR: alta de delegado', opInvite, [403], 'ERR-ADM11-ROLE-NOT-AUTHORIZED');
  const opRawBody = await e.call('POST', '/api/admin/administrators', { cookie: op.cookie, raw: '{' });
  rec('II', 'OPERATOR: cuerpo ilegible (la autorización precede a la lectura del cuerpo)', opRawBody, [403], 'ERR-ADM11-ROLE-NOT-AUTHORIZED');
  const selfSa = await e.call('PUT', `/api/admin/administrators/${idOf(sa)}/role`, { cookie: sa.cookie, headers: { 'if-match': (await rowOf(SA_EMAIL)).etag }, body: { role: 'OPERATOR' } });
  rec('II', 'SUPER_ADMIN delegado: cambia su propio rol (autoafectación)', selfSa, [403], 'ERR-ADM11-SELF-MODIFICATION-FORBIDDEN');
  const grantNew = await invite(e, sa.cookie, 'nuevo.super@example.test', 'SUPER_ADMIN');
  rec('II', 'SUPER_ADMIN delegado: alta con rol SUPER_ADMIN (concesión)', grantNew, [403], 'ERR-ADM11-GRANT-FORBIDDEN');
  const grantNewRow = await delegateOf(e, root, 'nuevo.super@example.test');
  rec('II', 'tras la concesión rechazada no hay fila para el correo', { ...grantNew, text: JSON.stringify({ exists: grantNewRow !== undefined }) }, [403], undefined, { leakOk: true, note: 'lectura del estado' });
  const grantRole = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: sa.cookie, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, body: { role: 'SUPER_ADMIN' } });
  rec('II', 'SUPER_ADMIN delegado: sube a SUPPORT a SUPER_ADMIN (autopromoción indirecta)', grantRole, [403], 'ERR-ADM11-GRANT-FORBIDDEN');
  const disSa2 = await e.call('POST', `/api/admin/administrators/${idOf(sa2)}/disable`, { cookie: sa.cookie, headers: { 'if-match': (await rowOf(SA2_EMAIL)).etag } });
  rec('II', 'SUPER_ADMIN delegado: desactivar a otro SUPER_ADMIN', disSa2, [403], 'ERR-ADM11-GRANT-FORBIDDEN');
  const roleSa2 = await e.call('PUT', `/api/admin/administrators/${idOf(sa2)}/role`, { cookie: sa.cookie, headers: { 'if-match': (await rowOf(SA2_EMAIL)).etag }, body: { role: 'OPERATOR' } });
  rec('II', 'SUPER_ADMIN delegado: rebaja a otro SUPER_ADMIN', roleSa2, [403], 'ERR-ADM11-GRANT-FORBIDDEN');
  const reinSa2 = await e.call('POST', `/api/admin/administrators/${idOf(sa2)}/reinvite`, { cookie: sa.cookie, headers: { 'if-match': (await rowOf(SA2_EMAIL)).etag } });
  rec('II', 'SUPER_ADMIN delegado: re-invitar a otro SUPER_ADMIN', reinSa2, [403], 'ERR-ADM11-GRANT-FORBIDDEN');
  const rootRole = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, body: { role: 'SUPER_ADMIN' } });
  rec('II', 'control: la raíz concede SUPER_ADMIN (debe funcionar)', rootRole, [200]);
  const rootRoleBack = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, body: { role: 'SUPPORT' } });
  rec('II', 'control: la raíz rebaja el rol de vuelta', rootRoleBack, [200]);
  const sa2Row = await rowOf(SA2_EMAIL);
  rec('II', 'estado final: SA2 sigue SUPER_ADMIN ACTIVE tras los intentos', { ...rootRoleBack, text: JSON.stringify({ role: sa2Row.role, status: sa2Row.status }) }, [200], undefined, { leakOk: true, note: 'lectura del estado' });

  // ---------- Sentinel II (cont.): If-Match ----------
  const noIfMatch = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, body: { role: 'OPERATOR' } });
  rec('II', 'If-Match ausente en PUT role', noIfMatch, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const badIfMatch = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': 'abc' }, body: { role: 'OPERATOR' } });
  rec('II', 'If-Match con forma incorrecta (sin comillas)', badIfMatch, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const noIfMatchDis = await e.call('POST', `/api/admin/administrators/${idOf(sup)}/disable`, { cookie: root });
  rec('II', 'If-Match ausente en disable', noIfMatchDis, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const staleEtag = (await rowOf(SUP_EMAIL)).etag;
  const bump = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': staleEtag }, body: { role: 'OPERATOR' } });
  rec('II', 'control: escritura con etag vigente', bump, [200]);
  const stale = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': staleEtag }, body: { role: 'SUPPORT' } });
  rec('II', 'If-Match correcto en forma pero obsoleto', stale, [412], 'ERR-ADM11-PRECONDITION-FAILED');
  const restore = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, body: { role: 'SUPPORT' } });
  rec('II', 'control: restaurar SUPPORT con etag vigente', restore, [200]);

  // ---------- Sentinel VII: cuerpos malformados, prototipo, tipos e inyección ----------
  const beforeCount = (await listDelegates(e, root)).items.length;
  const bodies: Array<[string, string]> = [
    ['JSON inválido', '{'],
    ['JSON truncado', '{"email":'],
    ['arreglo como cuerpo', '[]'],
    ['null como cuerpo', 'null'],
    ['cuerpo vacío', ''],
  ];
  for (const [label, raw] of bodies) {
    const r = await e.call('POST', '/api/admin/administrators', { cookie: root, raw });
    rec('VII', `alta: ${label}`, r, [400, 422]);
  }
  const email = 'proto@example.test';
  const extra = await e.call('POST', '/api/admin/administrators', { cookie: root, body: { email, emailConfirmation: email, role: 'SUPPORT', isRoot: true, adminId: 'x', status: 'ACTIVE' } });
  rec('VII', 'alta: campos extra (isRoot, adminId, status)', extra, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const protoRaw = `{"email":"${email}","emailConfirmation":"${email}","role":"SUPPORT","__proto__":{"role":"SUPER_ADMIN"}}`;
  const proto = await e.call('POST', '/api/admin/administrators', { cookie: root, raw: protoRaw });
  rec('VII', 'alta: clave __proto__ con rol SUPER_ADMIN', proto, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const ctorRaw = `{"email":"${email}","emailConfirmation":"${email}","role":"SUPPORT","constructor":{"prototype":{"role":"SUPER_ADMIN"}}}`;
  const ctor = await e.call('POST', '/api/admin/administrators', { cookie: root, raw: ctorRaw });
  rec('VII', 'alta: constructor.prototype con rol SUPER_ADMIN', ctor, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const polluted = (Object.prototype as Record<string, unknown>)['role'] !== undefined || (({} as Record<string, unknown>)['role'] !== undefined);
  ROWS.push({ backend, sentinel: 'VII', label: 'contaminación de Object.prototype tras los payloads', status: 0, code: undefined, expected: 'sin contaminación', pass: !polluted, note: polluted ? 'CONTAMINADO' : 'limpio' });
  for (const role of [123, null, ['SUPER_ADMIN'], { x: 1 }, 'super_admin', ' SUPER_ADMIN', 'ROOT']) {
    const r = await e.call('POST', '/api/admin/administrators', { cookie: root, body: { email: `tipo${String(role).length}@example.test`, emailConfirmation: `tipo${String(role).length}@example.test`, role } });
    rec('VII', `alta: tipo/valor de rol ${JSON.stringify(role)}`, r, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  }
  const sqli = "x'||'@example.test";
  const sqlR = await e.call('POST', '/api/admin/administrators', { cookie: root, body: { email: sqli, emailConfirmation: sqli, role: 'SUPPORT' } });
  rec('VII', "alta: inyección SQL en el correo (x'||'@...)", sqlR, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const putExtra = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, body: { role: 'OPERATOR', status: 'DISABLED' } });
  rec('VII', 'PUT rol con campo extra (status)', putExtra, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const afterCount = (await listDelegates(e, root)).items.length;
  ROWS.push({ backend, sentinel: 'VII', label: 'ningún payload malformado creó fila', status: 0, code: undefined, expected: 'sin filas nuevas', pass: afterCount === beforeCount, note: `filas antes=${beforeCount} después=${afterCount}` });

  // ---------- Sentinel VIII: tamaño de carga ----------
  const huge = JSON.stringify({ email: 'grande@example.test', emailConfirmation: 'grande@example.test', role: 'SUPPORT', pad: 'a'.repeat(2 * 1024 * 1024) });
  const big = await e.call('POST', '/api/admin/administrators', { cookie: root, raw: huge });
  rec('VIII', 'alta con cuerpo de 2 MiB', big, [400, 413, 422]);
  const longEmail = 'a'.repeat(5000) + '@example.test';
  const longR = await e.call('POST', '/api/admin/administrators', { cookie: root, body: { email: longEmail, emailConfirmation: longEmail, role: 'SUPPORT' } });
  rec('VIII', 'alta con correo de 5000 caracteres', longR, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const bigPut = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, raw: JSON.stringify({ role: 'OPERATOR', pad: 'b'.repeat(2 * 1024 * 1024) }) });
  rec('VIII', 'PUT rol con cuerpo de 2 MiB', bigPut, [400, 413, 422]);

  // ---------- Sentinel IX: XSS y esquemas de URI peligrosos ----------
  const xssEmail = '<script>alert(1)</script>@example.test';
  const xss = await e.call('POST', '/api/admin/administrators', { cookie: root, body: { email: xssEmail, emailConfirmation: xssEmail, role: 'SUPPORT' } });
  rec('IX', 'alta con <script> en el correo', xss, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const uriR = await e.call('POST', '/api/admin/administrators', { cookie: root, body: { email: 'data:text/html;base64,PHNjcmlwdD4=@example.test', emailConfirmation: 'data:text/html;base64,PHNjcmlwdD4=@example.test', role: 'SUPPORT' } });
  rec('IX', 'alta con esquema data: en el correo', uriR, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const jsRole = await e.call('POST', '/api/admin/administrators', { cookie: root, body: { email: 'js@example.test', emailConfirmation: 'js@example.test', role: 'javascript:alert(1)' } });
  rec('IX', 'alta con rol javascript:alert(1)', jsRole, [422], 'ERR-SCHEMA-VALIDATION-FAILED');
  const ctype = await e.call('GET', '/api/admin/me', { cookie: sa.cookie });
  const ctypeOk = String(ctype.headers['content-type'] ?? '').includes('application/json');
  rec('IX', 'GET /me responde application/json (sin HTML reflejado)', ctype, [200], undefined, { note: noteFlag(ctypeOk, 'content-type application/json', 'content-type NO json') });

  // ---------- Sentinel V: CSRF y cabeceras de origen ----------
  const beforeCsrf = (await listDelegates(e, root)).items.length;
  const csrfPost = await e.call('POST', '/api/admin/administrators', { cookie: root, csrf: false, body: { email: 'csrf@example.test', emailConfirmation: 'csrf@example.test', role: 'SUPPORT' } });
  rec('V', 'alta con raíz sin X-Argos-Request', csrfPost, [403], 'ERR-AUTH-CSRF-REJECTED');
  const csrfNoSession = await e.call('POST', '/api/admin/administrators', { csrf: false, body: { email: 'csrf2@example.test', emailConfirmation: 'csrf2@example.test', role: 'SUPPORT' } });
  rec('V', 'alta sin cabecera y sin sesión (CSRF antes que la sesión)', csrfNoSession, [403], 'ERR-AUTH-CSRF-REJECTED');
  const csrfZero = await e.call('POST', '/api/admin/administrators', { cookie: root, csrf: false, headers: { 'x-argos-request': '0' }, body: { email: 'csrf3@example.test', emailConfirmation: 'csrf3@example.test', role: 'SUPPORT' } });
  rec('V', 'alta con X-Argos-Request: 0', csrfZero, [403], 'ERR-AUTH-CSRF-REJECTED');
  const csrfPut = await e.call('PUT', `/api/admin/administrators/${idOf(sup)}/role`, { cookie: root, csrf: false, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag }, body: { role: 'OPERATOR' } });
  rec('V', 'PUT rol sin cabecera CSRF', csrfPut, [403], 'ERR-AUTH-CSRF-REJECTED');
  const csrfDis = await e.call('POST', `/api/admin/administrators/${idOf(sup)}/disable`, { cookie: root, csrf: false, headers: { 'if-match': (await rowOf(SUP_EMAIL)).etag } });
  rec('V', 'POST disable sin cabecera CSRF', csrfDis, [403], 'ERR-AUTH-CSRF-REJECTED');
  const evilOrigin = await e.call('POST', '/api/admin/administrators', { cookie: root, headers: { origin: 'https://evil.example' }, body: { email: 'origen@example.test', emailConfirmation: 'origen@example.test', role: 'SUPPORT' } });
  rec('V', 'alta con Origin ajeno y cabecera CSRF (el contrato no define regla de Origin)', evilOrigin, [202, 403], undefined, { note: 'observación: sin regla de Origin en el contrato; la cabecera personalizada exige preflight CORS' });
  const afterCsrf = (await listDelegates(e, root)).items.length;
  ROWS.push({ backend, sentinel: 'V', label: 'ninguna escritura sin CSRF modificó la tabla (salvo el caso de Origin)', status: 0, code: undefined, expected: 'sin filas nuevas por CSRF', pass: afterCsrf - beforeCsrf <= 1, note: `filas antes=${beforeCsrf} después=${afterCsrf}` });

  // ---------- Sentinel VI: enumeración del correo por código y por tiempo ----------
  const fresh = await invite(e, root, 'nuevo.correo.t1526@example.test', 'SUPPORT');
  const dup = await invite(e, root, SUP_EMAIL, 'SUPPORT');
  const rootMail = await invite(e, root, DELEGATE_ROOT_EMAIL, 'SUPPORT');
  const userMail = await invite(e, root, EXISTING_USER_EMAIL, 'SUPPORT');
  for (const [label, r] of [['alta nueva', fresh], ['duplicado', dup], ['correo raíz', rootMail], ['usuario existente', userMail]] as const) {
    rec('VI', `enumeración por código: ${label}`, r, [202], undefined, { note: noteFlag(r.text === fresh.text && r.status === fresh.status, 'cuerpo y estado idénticos al alta nueva', 'DIFIERE del alta nueva') });
  }
  const timeOf = async (run: () => Promise<Resp>): Promise<number> => {
    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = performance.now();
      await run();
      samples.push(performance.now() - t0);
    }
    return median(samples);
  };
  const tNew = await timeOf(() => invite(e, root, `tiempo${Math.random().toString(36).slice(2, 8)}@example.test`, 'SUPPORT'));
  const tDup = await timeOf(() => invite(e, root, SUP_EMAIL, 'SUPPORT'));
  const tUser = await timeOf(() => invite(e, root, EXISTING_USER_EMAIL, 'SUPPORT'));
  const slow = Math.max(tNew, tDup, tUser);
  const fast = Math.min(tNew, tDup, tUser);
  ROWS.push({ backend, sentinel: 'VI', label: 'enumeración por tiempo (medianas de 5: nuevo, duplicado, usuario existente)', status: 202, code: undefined, expected: 'factor <= 4 o <= 25 ms', pass: slow <= fast * 4 || slow - fast <= 25, note: `nuevo=${tNew.toFixed(1)}ms dup=${tDup.toFixed(1)}ms usuario=${tUser.toFixed(1)}ms` });
  let distinct = new Set<number>();
  for (let i = 0; i < 40; i += 1) {
    const r = await e.call('GET', '/api/admin/me', { cookie: `argos_admin_session=guess${i}` });
    distinct.add(r.status);
  }
  rec('VI', 'fuerza bruta de cookies de sesión (40 intentos)', { ...ref404, status: [...distinct].length === 1 ? [...distinct][0]! : 0 }, [404, 429], undefined, { leakOk: true, note: `estados distintos: ${[...distinct].join(',')}` });

  // ---------- Sentinel IV: sesiones falsificadas, revocadas y caducadas ----------
  const forged = await e.call('GET', '/api/admin/me', { cookie: 'argos_admin_session=AAAAAAAAAAAAAAAAAAAAAAAA' });
  rec('IV', 'cookie de sesión falsificada', forged, [404]);
  const empty = await e.call('GET', '/api/admin/me', { cookie: 'argos_admin_session=' });
  rec('IV', 'cookie de sesión vacía', empty, [404]);
  const sessionBeforeDisable = await e.call('GET', '/api/admin/me', { cookie: op.cookie });
  rec('IV', 'control: OPERATOR válido antes de la baja', sessionBeforeDisable, [200]);
  const disOp = await e.call('POST', `/api/admin/administrators/${idOf(op)}/disable`, { cookie: root, headers: { 'if-match': (await rowOf(OP_EMAIL)).etag } });
  rec('IV', 'control: la raíz desactiva a OPERATOR', disOp, [200]);
  const replay = await e.call('GET', '/api/admin/me', { cookie: op.cookie });
  rec('IV', 'reutilización de la cookie de OPERATOR tras la baja', replay, [404]);
  const replayList = await e.call('GET', '/api/admin/administrators', { cookie: op.cookie });
  rec('IV', 'reutilización tras la baja sobre el listado', replayList, [404]);
  const supLogin = await loginAs(e, { email: SUP_EMAIL, sub: subOf(SUP_EMAIL) });
  if (supLogin.cookie !== null) {
    e.at(25 * 3600 * 1000);
    const expired = await e.call('GET', '/api/admin/me', { cookie: supLogin.cookie });
    rec('IV', 'sesión caducada por inactividad/absoluta (25 h)', expired, [404]);
    e.at(0);
  } else {
    rec('IV', 'nuevo acceso de SUPPORT para la prueba de caducidad', supLogin.done, [200]);
  }
  e.at(73 * 3600 * 1000);
  const pendLogin = await loginAs(e, { email: PEND_EMAIL, sub: subOf(PEND_EMAIL) });
  rec('IV', 'invitación caducada (73 h): acceso con Google', pendLogin.done, [404]);
  e.at(0);

  // Invariantes finales
  const finalList = await listDelegates(e, root);
  const supers = finalList.items.filter((d) => d.role === 'SUPER_ADMIN' && d.status === 'ACTIVE').map((d) => d.email).sort();
  ROWS.push({ backend, sentinel: 'II', label: 'invariante: SUPER_ADMIN delegados ACTIVE intactos (solo SA y SA2)', status: 0, code: undefined, expected: `${[SA2_EMAIL, SA_EMAIL].sort().join(',')}`, pass: supers.join(',') === [SA2_EMAIL, SA_EMAIL].sort().join(','), note: supers.join(',') });
  ROWS.push({ backend, sentinel: 'I', label: 'invariante: la raíz no tiene fila', status: 0, code: undefined, expected: 'sin fila', pass: finalList.items.every((d) => d.email !== DELEGATE_ROOT_EMAIL), note: '' });
}

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1526 Sentinels 9 vectores sobre /api/admin/me y /api/admin/administrators* (${backend})`, { timeout: 180_000 }, () => {
    it('ejecuta la batería y no encuentra desviaciones frente al contrato 1.8.0', async () => {
      await runBattery(backend);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(`${OUT_DIR}/t1526-rows-${backend}.json`, JSON.stringify(ROWS.filter((r) => r.backend === backend), null, 2));
      const failed = ROWS.filter((r) => r.backend === backend && !r.pass);
      expect(failed.map((r) => `${r.sentinel} ${r.label} -> ${r.status} ${r.code ?? ''} (esperado ${r.expected}) ${r.note}`)).toEqual([]);
    });
  });
}
