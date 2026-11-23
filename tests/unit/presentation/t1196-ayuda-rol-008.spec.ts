import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { can, type PetAction } from '../../../src/domain/access/rbac.ts';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';
import { HouseholdCard, RoleOnJoinSelect } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';
import { HOUSEHOLD_LINK_NOTICE, READ_ONLY_ACTIONS, ROLE_HELP, roleHelpText } from '../../../src/presentation/web/role-help.ts';
import { ME, household } from './presentation-fixtures.ts';

/**
 * T1196 (008, bloque K, `[GH:#25]`): la ayuda de rol (Cuidador y Lector) y el aviso de hogar del enlace veterinario salen de un catálogo cerrado cuyas frases se comparan con
 * `can(rol, acción)` real (EDGE-008-048): si la matriz de REQ-RBAC-001 cambia, estas pruebas fallan antes de que la ayuda mienta. Textos aprobados por Neo (D8-13).
 * REQ-ROL8-001, REQ-ROL8-002, REQ-ROL8-003, EDGE-008-048, EDGE-008-049, ADR-008-13; SC-008-056, SC-008-057, SC-008-058.
 */
const noop = (): void => undefined;

/** Las 15 acciones de la matriz, leídas del fuente de `rbac.ts` (no copiadas): si se añade una, entra aquí sola. */
const MATRIX_SOURCE = readFileSync('src/domain/access/rbac.ts', 'utf8');
const MATRIX_BODY = MATRIX_SOURCE.slice(MATRIX_SOURCE.indexOf('const RBAC_MATRIX'), MATRIX_SOURCE.indexOf('export function can'));
const ALL_ACTIONS = [...MATRIX_BODY.matchAll(/^\s{2}([A-Z_]+): \[/gm)].map((m) => m[1]) as PetAction[];

const props = (over: Partial<ShareLinksViewProps>): ShareLinksViewProps =>
  ({
    petName: 'Luna', household: { petCount: 3 }, canCreateLinks: true, now: '2026-11-18T12:00:00.000Z', scope: 'PET', expiresInDays: 7, includeMicrochip: false, includeClinicalFiles: false,
    busy: false, error: null, created: null, copyStatus: 'IDLE', list: null, confirmRevokeId: null, notice: null,
    onScope: noop, onExpiry: noop, onMicrochip: noop, onClinicalFiles: noop, onCreate: noop, onCancel: noop, onCopy: noop, onDone: noop, onAskRevoke: noop, onConfirmRevoke: noop, onCancelRevoke: noop, onPreview: noop,
    ...over,
  }) as ShareLinksViewProps;
const share = (over: Partial<ShareLinksViewProps>): string => renderToStaticMarkup(h(ShareLinksView, props(over)));

describe('ayuda de rol derivada de can() (T1196)', () => {
  it('[GH:#25][REQ-ROL8-003][EDGE-008-048] la lista de acciones leída del fuente de la matriz es la completa (15) y can() sigue concediendo exactamente lo que el catálogo conoce', () => {
    expect(ALL_ACTIONS).toHaveLength(15);
    expect(ALL_ACTIONS).toEqual(expect.arrayContaining(['EDIT_PET_BASICS', 'CREATE_SHARE_LINK', 'MANAGE_HOUSEHOLD_MEMBERS', 'WRITE_MEDIA', 'READ_MEDIA', 'EXPORT_IMPORT_BACKUP']));
  });

  it('[GH:#25][REQ-ROL8-001][EDGE-008-048][SC-008-056] Cuidador: lo que la frase afirma lo permite can(), lo que niega lo niega, y todo lo demás que permite es solo lectura', () => {
    const help = ROLE_HELP.CAREGIVER;
    expect(help.allows.map((a) => [a.action, can('CAREGIVER', a.action)])).toEqual([['WRITE_WEIGHTS_AND_MEASUREMENTS', true], ['WRITE_HEALTH_EVENTS', true], ['WRITE_MEDIA', true]]);
    expect(help.denies.map((a) => [a.action, can('CAREGIVER', a.action)])).toEqual([['EDIT_PET_BASICS', false], ['MANAGE_HOUSEHOLD_MEMBERS', false], ['CREATE_SHARE_LINK', false]]);
    const mentioned = new Set<string>([...help.allows, ...help.denies].map((m) => m.action));
    const allowedByMatrix = ALL_ACTIONS.filter((a) => can('CAREGIVER', a));
    // Si la matriz concede una acción nueva al Cuidador que ni la frase ni «solo lectura» cubren, la ayuda estaría incompleta: falla aquí.
    expect(allowedByMatrix.filter((a) => !mentioned.has(a) && !(READ_ONLY_ACTIONS as readonly string[]).includes(a))).toEqual([]);
    expect(allowedByMatrix.filter((a) => mentioned.has(a)).sort()).toEqual(help.allows.map((a) => a.action).sort());
  });

  it('[GH:#25][REQ-ROL8-001][EDGE-008-048][SC-008-056] Lector: solo las acciones de solo lectura están permitidas; todo lo demás, que la frase llama «registrar» o «editar», está negado', () => {
    const allowed = ALL_ACTIONS.filter((a) => can('READER', a)).sort();
    expect(allowed).toEqual([...READ_ONLY_ACTIONS].sort());
    expect(ROLE_HELP.READER.denies.every((d) => !can('READER', d.action))).toBe(true);
    expect(ROLE_HELP.READER.allows).toEqual([]);
  });

  it('[GH:#25][REQ-ROL8-001][EDGE-008-048] cada acción citada aparece nombrada en la frase de su rol con el fragmento exacto, y las frases son las aprobadas por Neo (D8-13)', () => {
    for (const role of ['CAREGIVER', 'READER'] as const) {
      for (const mention of [...ROLE_HELP[role].allows, ...ROLE_HELP[role].denies]) expect(ROLE_HELP[role].text, `${role}:${mention.action}`).toContain(mention.fragment);
    }
    expect(roleHelpText('CAREGIVER')).toBe('Puede registrar pesos, medidas, eventos sanitarios y subir archivos y fotos. No puede editar el perfil de la mascota, invitar personas ni crear enlaces para el veterinario.');
    expect(roleHelpText('READER')).toBe('Solo puede consultar. No puede registrar ni editar nada.');
    expect(roleHelpText('ADMIN')).toBeNull();
  });

  it('[GH:#25][REQ-ROL8-003][EDGE-008-048] fijado de la matriz: Propietario y ADMIN conservan crear enlaces; Cuidador y Lector no (si cambia, la ayuda y el aviso hay que revisarlos)', () => {
    expect(['OWNER', 'ADMIN', 'CAREGIVER', 'READER'].map((r) => can(r as 'OWNER', 'CREATE_SHARE_LINK'))).toEqual([true, true, false, false]);
    expect(['OWNER', 'ADMIN', 'CAREGIVER', 'READER'].map((r) => can(r as 'OWNER', 'EDIT_PET_BASICS'))).toEqual([true, true, false, false]);
    expect(['OWNER', 'ADMIN', 'CAREGIVER', 'READER'].map((r) => can(r as 'OWNER', 'MANAGE_HOUSEHOLD_MEMBERS'))).toEqual([true, true, false, false]);
  });
});

describe('ayuda de rol en el selector y en la lista de miembros (T1197)', () => {
  const select = (value: string): string => renderToStaticMarkup(h(RoleOnJoinSelect, { householdId: 'h1', value, onChange: noop, errors: {} }));

  it('[GH:#25][REQ-ROL8-001][SC-008-056] el selector de invitación muestra la frase del rol elegido asociada con aria-describedby; el Administrador no muestra frase', () => {
    const caregiver = select('CAREGIVER');
    expect(caregiver).toContain(ROLE_HELP.CAREGIVER.text);
    expect(caregiver).toMatch(/<select[^>]*aria-describedby="invite-h1-roleOnJoin-help"/);
    expect(caregiver).toContain('id="invite-h1-roleOnJoin-help"');
    expect(select('READER')).toContain(ROLE_HELP.READER.text);
    expect(select('ADMIN')).not.toContain('Puede');
    expect(select('ADMIN')).not.toContain('aria-describedby');
  });

  it('[GH:#25][REQ-ROL8-001][SC-008-056] la lista de miembros pone la frase bajo cada Cuidador y Lector, no bajo el Administrador, y el selector de rol la referencia', () => {
    const markup = renderToStaticMarkup(h(HouseholdCard, { view: household('OWNER'), myUserId: ME, onMemberAction: noop, onDelete: noop, inviteForm: null, onChangeRole: noop }));
    expect(markup.split(ROLE_HELP.CAREGIVER.text).length - 1).toBe(1);
    expect(markup).not.toContain(ROLE_HELP.READER.text);
    expect(markup).toMatch(/data-role-help="CAREGIVER"/);
    expect(markup).not.toMatch(/data-role-help="ADMIN"/);
    expect(markup).toMatch(/<select[^>]*aria-describedby="member-[^"]+-role-help"/);
  });

  it('[GH:#25][REQ-ROL8-001][H-T1197-S1] el selector «Rol de <miembro>» mide al menos 44 px (min-h-11), no 40', () => {
    const markup = renderToStaticMarkup(h(HouseholdCard, { view: household('OWNER'), myUserId: ME, onMemberAction: noop, onDelete: noop, inviteForm: null, onChangeRole: noop }));
    const selects = [...markup.matchAll(/<select[^>]*aria-label="Rol de [^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(selects.length).toBeGreaterThan(0);
    for (const tag of selects) {
      expect(tag).toMatch(/class="[^"]*\bmin-h-11\b/);
      expect(tag).not.toMatch(/\bmin-h-10\b/);
    }
  });
});

describe('aviso de hogar en el diálogo de crear enlace (T1196/T1197)', () => {
  it('[GH:#25][REQ-ROL8-002][EDGE-008-049][SC-008-057] quien puede crear enlaces ve el aviso aprobado junto a la elección de alcance, asociado al grupo por aria-describedby', () => {
    const markup = share({ canCreateLinks: true });
    expect(markup).toContain(HOUSEHOLD_LINK_NOTICE);
    expect(HOUSEHOLD_LINK_NOTICE).toBe('Para compartir más de una mascota en un mismo enlace, agrúpalas en un hogar. Un enlace de hogar incluye solo las mascotas asignadas a ese hogar que sean tuyas.');
    expect(markup).toMatch(/<fieldset[^>]*aria-describedby="share-household-hint"/);
    expect(markup).toContain('id="share-household-hint"');
  });

  it('[GH:#25][REQ-ROL8-002][EDGE-008-049][SC-008-058] sin permiso para crear enlaces (Cuidador, Lector) el aviso no existe en el marcado; tampoco por omisión', () => {
    expect(share({ canCreateLinks: false })).not.toContain('agrúpalas en un hogar');
    expect(share({ canCreateLinks: false })).not.toContain('share-household-hint');
    const { canCreateLinks: _omitted, ...withoutProp } = props({});
    expect(renderToStaticMarkup(h(ShareLinksView, withoutProp as ShareLinksViewProps))).not.toContain('agrúpalas en un hogar');
  });

  it('[GH:#25][REQ-ROL8-002][EDGE-008-049] el aviso no promete mascotas ajenas: solo «asignadas a ese hogar» y «que sean tuyas»', () => {
    expect(HOUSEHOLD_LINK_NOTICE).toMatch(/solo las mascotas asignadas a ese hogar que sean tuyas/);
    expect(HOUSEHOLD_LINK_NOTICE).not.toMatch(/todas las mascotas|de otros|de los demás|ajenas/i);
  });
});
