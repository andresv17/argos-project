/**
 * T1676 [GH:#32] UI de la ficha QR de emergencia (REQ-QR12-001, REQ-QR12-002, REQ-QR12-004, REQ-QR12-005, REQ-QR12-006, REQ-QR12-009, REQ-QR12-010; SC-012-042, SC-012-051, SC-012-128).
 * Render estático de los componentes puros, contrato de textos literales y cliente HTTP con `fetch` simulado.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountPhoneSectionView } from '../../../src/presentation/web/components/AccountPhone.tsx';
import { EmergencyCardView, EmergencyPrintSheet, type EmergencyCardViewProps } from '../../../src/presentation/web/components/EmergencyCard.tsx';
import { CriticalAllergiesEditorView } from '../../../src/presentation/web/components/EmergencyAllergies.tsx';
import { EmergencyPublicDocument } from '../../../src/presentation/web/pages/EmergencyPublicPage.tsx';
import { EmergencyApiError, createEmergencyApi, emergencyProblemMessage, fetchEmergencyPublic, type EmergencyCardOwnerView } from '../../../src/presentation/web/emergency-api.ts';
import { EMERGENCY_NOTICE_VERSION, EMERGENCY_TEXTS, phoneOptInLabel, publicHeading } from '../../../src/presentation/web/emergency-texts.ts';
import { allergiesFromText, allergiesToText, autoOffNotice, isSafeQrSvg, otherOwnerNotice } from '../../../src/presentation/web/emergency-view.ts';
import type { EmergencyCardOwnerView as GeneratedOwnerView, EmergencyCardPublicView as GeneratedPublicView, EmergencyCardActivationResult as GeneratedActivation } from '../../../src/generated/v38/schemas/types.ts';
import type { EmergencyActivationResult, EmergencyPublicView } from '../../../src/presentation/web/emergency-api.ts';

const schema = JSON.parse(readFileSync('specs/012-multiduenio-microchip-cuidador/contracts/schemas/emergency-card.schema.json', 'utf8')) as {
  'x-sdd-constants': { TEXTS: { value: Record<string, string> }; EMERGENCY_NOTICE_VERSION: { value: string } };
};

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** La SPA solo lee: los tipos locales (arreglos de solo lectura) deben aceptar los generados. */
const accepts = (owner: GeneratedOwnerView, pub: GeneratedPublicView, issued: GeneratedActivation): [EmergencyCardOwnerView, EmergencyPublicView, EmergencyActivationResult] => [owner, pub, issued];
const ownerShape: Same<EmergencyCardOwnerView, GeneratedOwnerView> = true;
const noop = (): void => undefined;
const ownerView = (over: Partial<EmergencyCardOwnerView> = {}): EmergencyCardOwnerView => ({
  petId: '5a5a5a5a-0000-4000-8000-000000000001', status: 'OFF', statusReason: null, guardSatisfied: false, myPhoneVisible: false, myPhoneReconfirmRequired: false, visiblePhonesCount: 0,
  criticalAllergiesCount: 0, lastScannedAt: null, lastChange: null, criticalAllergiesChange: null, noticeVersion: null, ...over,
});
function cardMarkup(over: Partial<EmergencyCardViewProps> = {}): string {
  const props: EmergencyCardViewProps = {
    petName: 'Luna', status: ownerView(), hasPhone: true, busy: false, error: null, issued: null, consent: false, showMyPhone: false, formOpen: false, confirmDeactivate: false,
    onConsent: noop, onShowMyPhone: noop, onOpenForm: noop, onSubmitForm: noop, onCancelForm: noop, onDownloadSvg: noop, onDownloadPng: noop, onPrint: noop, onDismissIssued: noop,
    onAskDeactivate: noop, onConfirmDeactivate: noop, onCancelDeactivate: noop, onReconfirmPhone: noop, onRemovePhone: noop, ...over,
  };
  return renderToStaticMarkup(h(EmergencyCardView, props));
}
const response = (status: number, body?: unknown): Response => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('T1676 textos literales del contrato (REQ-QR12-002, REQ-QR12-004, REQ-QR12-006)', () => {
  it('[SC-012-128] los textos de la SPA son idénticos a x-sdd-constants.TEXTS y a la versión vigente del aviso', () => {
    const { version, ...rest } = EMERGENCY_TEXTS;
    const contract = schema['x-sdd-constants'].TEXTS.value;
    expect(rest).toEqual({
      allergiesEditorHelp: contract.allergiesEditorHelp, activationNotice: contract.activationNotice, phoneOptInLabel: contract.phoneOptInLabel, publicHeading: contract.publicHeading,
      publicNoAllergies: contract.publicNoAllergies, publicFooter: contract.publicFooter, printSheetCaption: contract.printSheetCaption,
    });
    expect([version, EMERGENCY_NOTICE_VERSION]).toEqual([contract.version, schema['x-sdd-constants'].EMERGENCY_NOTICE_VERSION.value]);
  });

  it('[REQ-QR12-006] los marcadores se sustituyen sin interpretar el nombre como patrón de reemplazo', () => {
    expect(publicHeading('Luna')).toBe('Ficha de emergencia de Luna');
    expect(phoneOptInLabel('Luna')).toBe('Mostrar mi teléfono en la ficha QR de Luna');
    expect(publicHeading('A$&B')).toBe('Ficha de emergencia de A$&B');
  });

  it('[REQ-QR12-005] los tipos locales aceptan los generados (comprobación de compilación)', () => {
    expect([typeof accepts, ownerShape]).toEqual(['function', true]);
  });
});

describe('T1676 panel «Ficha QR» (REQ-QR12-003, REQ-QR12-005, REQ-QR12-006, REQ-QR12-010)', () => {
  it('[REQ-QR12-003] con la ficha apagada ofrece activar y no ofrece desactivar ni regenerar', () => {
    const markup = cardMarkup();
    expect(markup).toContain('Ficha QR de emergencia');
    expect(markup).toContain('Activar ficha QR');
    expect(markup).not.toContain('Desactivar ficha QR');
    expect(markup).not.toContain('Generar un código nuevo');
  });

  it('[REQ-QR12-006] el formulario muestra el aviso literal, el opt-in del teléfono por mascota y el consentimiento sin marcar', () => {
    const markup = cardMarkup({ formOpen: true });
    expect(markup).toContain(EMERGENCY_TEXTS.activationNotice);
    expect(markup).toContain('Mostrar mi teléfono en la ficha QR de Luna');
    expect(markup).toMatch(/id="qr-consent"/);
    expect(markup).not.toMatch(/checked/);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it('[REQ-QR12-006] sin teléfono guardado el opt-in no aparece y se indica dónde agregarlo', () => {
    const markup = cardMarkup({ formOpen: true, hasPhone: false });
    expect(markup).not.toContain('qr-show-phone');
    expect(markup).toContain('Mi cuenta');
  });

  it('[REQ-QR12-003][REQ-QR12-005] tras activar ofrece SVG, PNG y A6 con el aviso de que el código se muestra una sola vez; con la ficha activa ofrece regenerar y desactivar', () => {
    const issued = { result: { petId: 'p', status: 'ON' as const, token: 'x'.repeat(43), url: 'https://x/e/' + 'x'.repeat(43), qrSvg: '<svg/>', noticeVersion: '0.1.0', activatedAt: '2026-11-27T10:00:00.000Z', shownOnce: true as const }, pngFailed: false };
    const markup = cardMarkup({ status: ownerView({ status: 'ON', guardSatisfied: true, criticalAllergiesCount: 1 }), issued });
    for (const label of ['Descargar SVG', 'Descargar PNG', 'Imprimir hoja A6', 'solo se muestra esta vez']) expect(markup).toContain(label);
    expect(markup).not.toContain('x'.repeat(43));
    const idle = cardMarkup({ status: ownerView({ status: 'ON', guardSatisfied: true, criticalAllergiesCount: 1 }) });
    expect(idle).toContain('Generar un código nuevo');
    expect(idle).toContain('Desactivar ficha QR');
  });

  it('[REQ-QR12-010] el apagado automático dice la causa y que el código anterior ya no funciona; el manual no es un aviso', () => {
    expect(autoOffNotice('AUTO_GUARD_LOST')).toContain('ya no hay alergias críticas ni teléfono visible');
    expect(autoOffNotice('AUTO_PET_DECEASED')).toContain('fallecida');
    expect(autoOffNotice('AUTO_NOTICE_CHANGED')).toContain('aviso cambió');
    expect(autoOffNotice('USER_DEACTIVATED')).toBeNull();
    expect(autoOffNotice(null)).toBeNull();
    const markup = cardMarkup({ status: ownerView({ statusReason: 'AUTO_GUARD_LOST' }) });
    expect(markup).toContain('La ficha se apagó sola');
  });

  it('[REQ-QR12-003] avisa que otro propietario cambió la ficha, sin mostrar quién', () => {
    const base = { kind: 'REGENERATED' as const, at: '2026-11-27T10:00:00.000Z' };
    expect(otherOwnerNotice({ lastChange: { ...base, byMe: false } })).toBe('Otro propietario generó un código nuevo: el anterior dejó de funcionar.');
    expect(otherOwnerNotice({ lastChange: { ...base, byMe: true } })).toBeNull();
    expect(otherOwnerNotice({ lastChange: null })).toBeNull();
  });

  it('[REQ-QR12-006] un teléfono en espera por cambio del aviso pide reconfirmar', () => {
    expect(cardMarkup({ status: ownerView({ status: 'ON', myPhoneReconfirmRequired: true }) })).toContain('Confirmar mi teléfono');
  });

  it('[REQ-QR12-005][SC-012-051] la hoja A6 lleva el nombre, la leyenda del contrato y el QR; el CSS lo imprime a 60 mm (mínimo 30 mm) en A6 y oculta el resto de la app', () => {
    const markup = renderToStaticMarkup(h(EmergencyPrintSheet, { petName: 'Luna', qrSrc: 'blob:x' }));
    expect(markup).toContain('Luna');
    expect(markup).toContain('Escanea para ver datos de emergencia');
    expect(markup).toContain('src="blob:x"');
    const css = readFileSync('src/presentation/web/styles.css', 'utf8');
    const width = /\.qr-a6__code\s*{[^}]*width:\s*(\d+)mm/.exec(css)?.[1];
    expect(Number(width)).toBeGreaterThanOrEqual(30);
    expect(css).toMatch(/@page qr-a6\s*{\s*size:\s*105mm 148mm;\s*margin:\s*0;\s*}/);
    expect(css).toMatch(/\.qr-a6\s*{\s*page:\s*qr-a6;\s*}/);
    expect(css).toMatch(/body\.printing-qr :not\(\.qr-a6[^{]*{\s*display:\s*none\s*!important/);
    expect(css).toMatch(/\.qr-a6\s*{\s*display:\s*none/);
  });
});

describe('T1676 alergias críticas y teléfono de la cuenta (REQ-QR12-001, REQ-QR12-002)', () => {
  it('[REQ-QR12-002] el editor muestra el texto de ayuda literal de /maggie m-6 y las líneas se convierten en lista', () => {
    const markup = renderToStaticMarkup(h(CriticalAllergiesEditorView, { text: 'Penicilina', busy: false, error: null, saved: null, onText: noop, onSave: noop }));
    expect(markup).toContain(schema['x-sdd-constants'].TEXTS.value.allergiesEditorHelp);
    expect(markup).toContain('Penicilina');
    expect(allergiesFromText(' Penicilina \r\n\n Látex\n')).toEqual(['Penicilina', 'Látex']);
    expect(allergiesToText(['A', 'B'])).toBe('A\nB');
  });

  it('[REQ-QR12-001] «Mi cuenta» tiene el campo de teléfono E.164 opcional y no repite el valor en un error', () => {
    const markup = renderToStaticMarkup(h(AccountPhoneSectionView, { value: '+573009998877', busy: false, error: emergencyProblemMessage(new EmergencyApiError('ERR-QR12-PHONE-INVALID', 422)), saved: null, onValue: noop, onSave: noop }));
    expect(markup).toContain('Teléfono de contacto');
    expect(markup).toContain('type="tel"');
    expect(markup).toContain('El teléfono no es válido');
    expect(markup.match(/\+573009998877/g)).toHaveLength(1); // solo el valor del campo: ni la ayuda ni el error lo repiten
    expect(emergencyProblemMessage(new EmergencyApiError('ERR-QR12-PHONE-INVALID', 422))).not.toContain('+573009998877');
  });

  it('[REQ-QR12-010] los códigos ERR-QR12-* tienen texto propio y lo desconocido cae al genérico', () => {
    for (const code of ['ERR-QR12-ACTIVATION-REQUIREMENTS', 'ERR-QR12-ALREADY-ACTIVE', 'ERR-QR12-PHONE-INVALID', 'ERR-QR12-CONSENT-REQUIRED', 'ERR-QR12-URL-TOO-LONG', 'ERR-RATE-LIMITED']) {
      expect(emergencyProblemMessage(new EmergencyApiError(code, 400))).not.toBe('No pudimos completar la acción. Inténtalo de nuevo.');
    }
    expect(emergencyProblemMessage(new EmergencyApiError('OTRO', 500))).toBe('No pudimos completar la acción. Inténtalo de nuevo.');
  });
});

describe('T1676 vista pública /e/:token (REQ-QR12-004, REQ-QR12-009, INV-QR12-002)', () => {
  const view = { petName: 'Luna', criticalAllergies: ['Penicilina', '<img src=x onerror=alert(1)>'], contactPhones: [{ phone: '+573001234567' }] };
  it('[SC-012-042] muestra encabezado, alergias, teléfono y pie del contrato como texto escapado, sin enlaces tel: ni HTML', () => {
    const markup = renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'READY', view } }));
    expect(markup).toContain('Ficha de emergencia de Luna');
    expect(markup).toContain('Penicilina');
    expect(markup).toContain('+573001234567');
    expect(markup).toContain(EMERGENCY_TEXTS.publicFooter);
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<img');
    expect(markup).not.toMatch(/<a[\s>]/);
  });

  it('[REQ-QR12-004] sin alergias muestra el texto literal y con 0 teléfonos lo dice', () => {
    const markup = renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'READY', view: { petName: 'Luna', criticalAllergies: [], contactPhones: [] } } }));
    expect(markup).toContain(EMERGENCY_TEXTS.publicNoAllergies);
    expect(markup).toContain('no dejó teléfonos');
  });

  it('[INV-QR12-002] inexistente, desactivada y demás fallos son la misma pantalla; el 429 y el error son distintos', () => {
    const notFound = renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'NOT_FOUND' } }));
    expect(notFound).toContain('Esta ficha no está disponible');
    expect(renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'RATE_LIMITED' } }))).toContain('Demasiados intentos');
    // BAJA-2 de /sati: LOADING y ERROR también llevan main y h1; ERROR ofrece reintento.
    const loading = renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'LOADING' } }));
    const failed = renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'ERROR' }, onRetry: noop }));
    for (const markup of [loading, failed]) expect(markup).toMatch(/<main[^>]*>[\s\S]*<h1[^>]*>[\s\S]*<\/h1>/);
    expect(failed).toContain('Reintentar');
    expect(renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'ERROR' } }))).not.toContain('Reintentar');
    expect(renderToStaticMarkup(h(EmergencyPublicDocument, { state: { kind: 'ERROR' } }))).toContain('No se pudo cargar');
  });

  it('[INV-QR12-002] la lectura pública no envía cookie, referente ni caché ni cabeceras propias, y 404/429 se traducen sin detalle', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const ok = await fetchEmergencyPublic('t'.repeat(43), (async (url: string, init: RequestInit) => (calls.push({ url, init }), response(200, view))) as unknown as typeof fetch);
    expect(ok.petName).toBe('Luna');
    expect(calls[0]?.url).toBe(`/api/emergency/${'t'.repeat(43)}`);
    expect(calls[0]?.init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    expect(calls[0]?.init.headers).toBeUndefined();
    await expect(fetchEmergencyPublic('x', (async () => response(404, { code: 'ERR-PET-NOT-FOUND' })) as unknown as typeof fetch)).rejects.toMatchObject({ status: 404 });
    await expect(fetchEmergencyPublic('x', (async () => response(429)) as unknown as typeof fetch)).rejects.toMatchObject({ status: 429 });
    await expect(fetchEmergencyPublic('x', (async () => { throw new Error('red'); }) as unknown as typeof fetch)).rejects.toMatchObject({ status: 0 });
  });
});

describe('T1676 cliente privado y SVG seguro (REQ-QR12-003, REQ-QR12-005, SVG_DELIVERY)', () => {
  it('[REQ-QR12-003] activa con la versión del aviso, envía la cabecera CSRF y usa las rutas del contrato', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => (calls.push({ url, init }), response(init.method === 'POST' && url.endsWith('/deactivate') ? 204 : 200, {}))) as unknown as typeof fetch;
    const api = createEmergencyApi(fake);
    await api.activate('p1', { consentAccepted: true, noticeVersion: EMERGENCY_NOTICE_VERSION, showMyPhone: true });
    await api.regenerate('p1', { consentAccepted: true, noticeVersion: EMERGENCY_NOTICE_VERSION });
    await api.setPhoneConsent('p1', { visible: false });
    await api.updateAllergies('p1', ['A']);
    await api.updatePhone(null);
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'POST /api/pets/p1/emergency-card/activate', 'POST /api/pets/p1/emergency-card/regenerate', 'PUT /api/pets/p1/emergency-card/phone-consent', 'PUT /api/pets/p1/critical-allergies', 'PUT /api/account/phone',
    ]);
    expect(calls[0]?.init.headers).toMatchObject({ 'X-Argos-Request': '1', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ consentAccepted: true, noticeVersion: '0.1.0', showMyPhone: true });
    expect(JSON.parse(String(calls[3]?.init.body))).toEqual({ criticalAllergies: ['A'] });
    expect(JSON.parse(String(calls[4]?.init.body))).toEqual({ phone: null });
  });

  it('[REQ-QR12-003] un error del servidor se convierte en su código sin conservar el cuerpo', async () => {
    const api = createEmergencyApi((async () => response(409, { code: 'ERR-QR12-ALREADY-ACTIVE', detail: 'secreto' })) as unknown as typeof fetch);
    await expect(api.activate('p1', { consentAccepted: true, noticeVersion: '0.1.0' })).rejects.toMatchObject({ code: 'ERR-QR12-ALREADY-ACTIVE', status: 409 });
  });

  it('[SVG_DELIVERY] solo acepta svg, rect y path sin scripts ni controladores', () => {
    const good = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" shape-rendering="crispEdges"><rect width="49" height="49" fill="#ffffff"/><path d="M4 4h1v1h-1z" fill="#000000"/></svg>';
    expect(isSafeQrSvg(good)).toBe(true);
    for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg><foreignObject/></svg>', '<svg><rect onload="x()"/></svg>', '<svg><image href="http://x"/></svg>', '<svg><text>hola</text></svg>', '<div/>', '<svg><!-- --></svg>']) {
      expect(isSafeQrSvg(bad)).toBe(false);
    }
  });

  it('[REQ-QR12-005] el código fuente de la SPA no usa innerHTML ni dangerouslySetInnerHTML para el SVG ni los datos de la ficha', () => {
    for (const file of ['components/EmergencyCard.tsx', 'components/EmergencyAllergies.tsx', 'components/AccountPhone.tsx', 'pages/EmergencyPublicPage.tsx', 'emergency-view.ts', 'emergency-api.ts']) {
      expect(readFileSync(`src/presentation/web/${file}`, 'utf8')).not.toMatch(/innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML/);
    }
  });

  it('[REQ-QR12-004] el shell /e/:token está fuera de la sesión (no pide /auth/me)', () => {
    const app = readFileSync('src/presentation/web/App.tsx', 'utf8');
    const before = app.slice(0, app.indexOf('<SessionProvider'));
    expect(before).toContain('path="/e/:token"');
  });
});
