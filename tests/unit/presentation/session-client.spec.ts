import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CATALOG } from '../../../src/generated/errors/error-codes.ts';
import { createWebApi } from '../../../src/presentation/web/api.ts';
import { LoginPage, RegisterPage } from '../../../src/presentation/web/pages/AuthPages.tsx';
import { SessionProvider } from '../../../src/presentation/web/session.tsx';
import { humanSchemaMessage } from '../../../src/presentation/web/schema-messages.ts';
import { validateInput } from '../../../src/presentation/web/validation.ts';

/** T221: cliente web mínimo de la Rebanada 1 (REQ-UI-005, REQ-AUTH-004, INV-ARCH-003). */
const WEB = 'src/presentation/web';
const filesOf = (dir: string): string[] => readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? filesOf(join(dir, e)) : /\.(?:ts|tsx)$/.test(e) ? [join(dir, e)] : []));
const sources = filesOf(WEB).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
/** Módulos de presentación con temporizador autorizado (T288 debounce de búsqueda; T293 aviso previo de expiración). */
const TIMER_MODULES = ['use-debounced-value.ts', 'idle-notice.ts'] as const;
const msg = (code: keyof typeof ERROR_CATALOG): string => ERROR_CATALOG[code].detailTemplate;
const registration = { username: 'nueva.usuaria', displayName: 'Nueva', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' };

describe('registro con la política de contraseña nueva (REQ-UI-005)', () => {
  it('[REQ-UI-005][ERR-AUTH-WEAK-PASSWORD] el registro valida en cliente la política de la 002 con los límites y el mensaje del catálogo 3.0.0', () => {
    for (const password of ['corta', 'sinmayuscula1!', 'SinNumero!!!!', 'SinSimbolo2026', `A1!${'x'.repeat(126)}`]) {
      expect(validateInput('RegisterUserInput', { ...registration, password }), password).toEqual({ password: msg('ERR-AUTH-WEAK-PASSWORD') });
    }
    expect(msg('ERR-AUTH-WEAK-PASSWORD')).toContain('entre 10 y 128');
    expect(validateInput('RegisterUserInput', registration)).toEqual({});
  });

  it('[REQ-LOG-002][SC-CAT-017] el registro acepta mayúsculas y no exige dígitos en el usuario; con espacios, @ o fuera de [A-Za-z0-9._-] se rechaza en cliente', () => {
    for (const username of ['Nueva.Usuaria', 'Andres', 'MARIA_V']) expect(validateInput('RegisterUserInput', { ...registration, username }), username).toEqual({});
    for (const username of ['and res', 'a@b', 'ab', 'Andrés']) expect(validateInput('RegisterUserInput', { ...registration, username }), username).toEqual({ username: humanSchemaMessage('username') });
  });

  it('[REQ-LOG-001] el inicio de sesión acepta un usuario o un correo de hasta 254 caracteres y recorta espacios; vacío se rechaza', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.com`;
    expect(email.length).toBeLessThanOrEqual(254);
    for (const username of ['andres', 'Ana@Ejemplo.com', ' ana@x.com ', email]) expect(validateInput('LoginInput', { username, password: 'x' }), username).toEqual({});
    expect(validateInput('LoginInput', { username: '', password: 'x' })).toEqual({ username: humanSchemaMessage('username') });
    expect(validateInput('LoginInput', { username: 'x'.repeat(255), password: 'x' })).toEqual({ username: humanSchemaMessage('username') });
  });

  it('[REQ-LOG-001][SC-CAT-030] la pantalla de inicio de sesión rotula el campo «Usuario o correo» y muestra «Si no puedes entrar con tu correo, usa tu usuario.» sin distinguir causas', () => {
    const markup = renderToStaticMarkup(h(MemoryRouter, null, h(SessionProvider, { api: createWebApi(), children: h(LoginPage) })));
    expect(markup.includes('Usuario o correo')).toBe(true);
    expect(markup.includes('Si no puedes entrar con tu correo, usa tu usuario.')).toBe(true);
    expect(markup.includes('id="login-username"')).toBe(true);
    expect(markup.includes('Usuario</label>')).toBe(false);
  });

  it('[REQ-UI-005][ERR-SCHEMA-VALIDATION-FAILED] la confirmación ausente o un correo inválido se rechazan en cliente sin normalizar', () => {
    expect(validateInput('RegisterUserInput', { username: 'nueva', displayName: 'Nueva', password: 'Clave2026x!' })).toEqual({ confirmPassword: humanSchemaMessage('confirmPassword') });
    expect(validateInput('RegisterUserInput', { ...registration, email: 'no-es-correo' })).toEqual({ email: humanSchemaMessage('email') });
    expect(validateInput('RegisterUserInput', { ...registration, email: 'nueva@example.com' })).toEqual({});
  });

  it('[REQ-UI-005][REQ-AUTH2-001] la pantalla de registro pide usuario, nombre, correo opcional, contraseña con la política nueva y su confirmación', () => {
    const markup = renderToStaticMarkup(h(MemoryRouter, null, h(SessionProvider, { api: createWebApi(), children: h(RegisterPage) })));
    expect(markup.includes('minúsculas')).toBe(false);
    for (const text of ['Usuario (letras, números, . _ -)', 'Nombre visible', 'Correo (opcional)', 'Contraseña (10 a 128, con mayúscula, número y símbolo)', 'Confirmar contraseña']) {
      expect(markup.includes(text), text).toBe(true);
    }
    expect(['register-email', 'register-password', 'register-confirmPassword'].map((id) => markup.includes(`id="${id}"`))).toEqual([true, true, true]);
    expect(markup.includes('8 a 128')).toBe(false);
  });
});

describe('sesión de la SPA al arrancar (REQ-AUTH-004, INV-ARCH-003)', () => {
  it('[REQ-AUTH-004] la SPA consulta GET /auth/me una sola vez al montar la sesión, solo en session.tsx, y la dependencia del efecto es el cliente', () => {
    const calls = sources.flatMap(({ file, text }) => (text.match(/\.GET\('\/auth\/me'/g) ?? []).map(() => file));
    expect(calls).toEqual([join(WEB, 'session.tsx')]);
    const session = sources.find((s) => s.file.endsWith('session.tsx'))!.text;
    expect(session).toMatch(/useEffect\(\(\) => \{[\s\S]*?GET\('\/auth\/me'\)[\s\S]*?\}, \[api\]\);/);
  });

  it('[REQ-AUTH-004][INV-AUTH2-002] ninguna petición autenticada en segundo plano: sin temporizadores, sin sondeo y sin renovar al recuperar el foco o la conexión', () => {
    const background = /\bsetInterval\b|\bsetTimeout\b|requestIdleCallback|\bEventSource\b|\bWebSocket\b|addEventListener\(\s*['"](?:focus|visibilitychange|online|pageshow)['"]|navigator\.serviceWorker|sendBeacon/;
    // Enmienda T288/T293 (autorizada por Neo): el retardo de 300 ms de la búsqueda y el aviso previo de expiración son los únicos
    // temporizadores permitidos y no tocan la API (se comprueba abajo); cualquier otro uso sigue prohibido.
    expect(sources.filter(({ file, text }) => !TIMER_MODULES.some((m) => file.endsWith(m)) && background.test(text)).map(({ file }) => file)).toEqual([]);
    expect(sources.filter(({ file, text }) => TIMER_MODULES.some((m) => file.endsWith(m)) && /\bfetch\b|\bapi\b|unwrap|\.(?:GET|POST|PUT|PATCH|DELETE)\(/.test(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))).map(({ file }) => file)).toEqual([]);
  });

  it('[REQ-UI-005][INV-ARCH-003] la sesión usa el contrato 3.0.0: el usuario es UserSelfProfile y el registro envía RegisterUserInput', () => {
    const session = sources.find((s) => s.file.endsWith('session.tsx'))!.text;
    expect(session).toContain("Schemas['UserSelfProfile']");
    expect(session).toContain("Schemas['RegisterUserInput']");
    expect(session).not.toContain("Schemas['UserPublicProfile']");
  });
});
