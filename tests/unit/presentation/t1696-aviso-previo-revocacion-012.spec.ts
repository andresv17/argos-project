/**
 * T1696 (Feature 012, Bloque E, #81; `/keymaker`; lote de corrección tras `/oracle`, ALTA-1; ENM-005-E 0.2.2 annex §5.1 y §9(q), condición de `D-1 = (a)` de Neo): aviso previo CON confirmación en los
 * cuatro flujos que revocan un enlace `PETS` (desasignar una mascota, salir del hogar, ceder el principal / salir de la co-propiedad, degradar un rol); sin enlaces afectados no se avisa y la
 * acción sigue directa. Sin jsdom: lógica pura + render estático + lectura de fuente de los puntos de cableado.
 *
 * @implements REQ-VET12-007, D-1, PN-08, EDGE-012-077
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PetsRevocationConfirm } from '../../../src/presentation/web/components/PetsRevocationConfirm.tsx';
import {
  PETS_ACTION_REVOCATION_NOTICE,
  guardPetsRevocation,
  hasActivePetsLinks,
  roleChangeCanRevokePetsLinks,
} from '../../../src/presentation/web/pets-link-notice.ts';
import { createShareApi } from '../../../src/presentation/web/share-api.ts';

const src = (file: string): string => readFileSync(file, 'utf8');
const link = (status: string): { status: string } => ({ status });

describe('ALTA-1 decisión de avisar (sin enlaces afectados no se avisa)', () => {
  it('[§5.1] solo cuentan los enlaces ACTIVE; vacío, REVOKED o EXPIRED no avisan', () => {
    expect(hasActivePetsLinks([])).toBe(false);
    expect(hasActivePetsLinks([link('REVOKED'), link('EXPIRED')])).toBe(false);
    expect(hasActivePetsLinks([link('REVOKED'), link('ACTIVE')])).toBe(true);
  });

  it('[§5.1] sin enlaces activos la acción corre directa y NO se pide confirmación', async () => {
    const proceed = vi.fn();
    const ask = vi.fn();
    await guardPetsRevocation(async () => [link('REVOKED')], proceed, ask);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it('[§5.1, D-1 (a)] con un enlace activo NO ejecuta la acción: pide confirmación y solo la ejecuta al confirmar', async () => {
    const proceed = vi.fn();
    const ask = vi.fn();
    await guardPetsRevocation(async () => [link('ACTIVE')], proceed, ask);
    expect(proceed).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledTimes(1);
    ask.mock.calls[0]?.[0]();
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('[§5.1] si la consulta de enlaces falla, la acción no se bloquea (salir o desasignar nunca queda atrapado por el aviso)', async () => {
    const proceed = vi.fn();
    const ask = vi.fn();
    await guardPetsRevocation(async () => { throw new Error('x'); }, proceed, ask);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it('[§5.1 fila 3] solo la degradación (a un rol distinto de ADMIN) puede revocar; conservar ADMIN no avisa', () => {
    expect(roleChangeCanRevokePetsLinks('READER')).toBe(true);
    expect(roleChangeCanRevokePetsLinks('CAREGIVER')).toBe(true);
    expect(roleChangeCanRevokePetsLinks('ADMIN')).toBe(false);
  });
});

describe('ALTA-1 el aviso: neutro, revocación entera, con confirmar y cancelar', () => {
  it('[PN-08 (a), D-1 (a)] el texto dice que el enlace afectado se revoca ENTERO, para todas sus mascotas, y que se necesita uno nuevo', () => {
    expect(PETS_ACTION_REVOCATION_NOTICE).toMatch(/revoca entero/i);
    expect(PETS_ACTION_REVOCATION_NOTICE).toMatch(/todas las mascotas/i);
    expect(PETS_ACTION_REVOCATION_NOTICE).toMatch(/enlace nuevo/i);
  });

  it('[a11y] es un alertdialog con el texto, «Continuar» y «Cancelar»', () => {
    const markup = renderToStaticMarkup(h(PetsRevocationConfirm, { id: 'x', confirmLabel: 'Salir del hogar', onConfirm: () => undefined, onCancel: () => undefined }));
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain(PETS_ACTION_REVOCATION_NOTICE);
    expect(markup).toContain('Salir del hogar');
    expect(markup).toContain('Cancelar');
  });
});

describe('ALTA-1 consulta de enlaces por mascota (listPetPetsShareLinks) en el cliente', () => {
  it('[§5.3] listPetPets llama GET /api/pets/{id}/share-links/pets', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ items: [], activeCount: 0, maxActiveLinks: 20 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const api = createShareApi(fetchImpl);
    const result = await api.listPetPets('pet-1');
    expect(calls).toEqual(['/api/pets/pet-1/share-links/pets']);
    expect(result.items).toEqual([]);
  });
});

describe('ALTA-1 cableado en los cuatro flujos (la acción pasa por el aviso)', () => {
  it('[desasignar] PetAssignments consulta los enlaces de la mascota ANTES de DELETE assignments y muestra el aviso', () => {
    const code = src('src/presentation/web/components/PetAssignments.tsx');
    expect(code).toContain('guardPetsRevocation');
    expect(code).toContain('listPetPets');
    expect(code).toContain('PetsRevocationConfirm');
    expect(code.indexOf('guardPetsRevocation')).toBeLessThan(code.indexOf("api.DELETE('/pets/{petId}/assignments/{householdId}'"));
  });

  it('[salir del hogar y expulsar] HouseholdsPage guarda onMemberAction con la lista de enlaces del hogar', () => {
    const code = src('src/presentation/web/pages/HouseholdsPage.tsx');
    expect(code).toContain('listPets(householdId)');
    expect(code.slice(code.indexOf('const withPetsNotice'), code.indexOf('const onMemberAction'))).toContain('guardPetsRevocation');
    const handler = code.slice(code.indexOf('const onMemberAction'), code.indexOf('const onChangeRole'));
    expect(handler).toContain('withPetsNotice');
    expect(handler).toContain("api.DELETE('/households/{householdId}/members/{userId}'");
  });

  it('[degradar un rol] onChangeRole solo avisa si el nuevo rol puede revocar (roleChangeCanRevokePetsLinks) y confirma antes del PATCH', () => {
    const code = src('src/presentation/web/pages/HouseholdsPage.tsx');
    const handler = code.slice(code.indexOf('const onChangeRole'), code.indexOf('const confirmTransfer'));
    expect(handler).toContain('roleChangeCanRevokePetsLinks');
    expect(handler).toContain('withPetsNotice');
    expect(handler.indexOf('withPetsNotice')).toBeLessThan(handler.indexOf("api.PATCH('/households/{householdId}/members/{userId}'") + 1000);
    expect(code).toContain('PetsRevocationConfirm');
  });

  it('[ceder el principal y salir de la co-propiedad] OwnersPanel guarda «Pasar el principal» y la confirmación de salida con los enlaces de la mascota', () => {
    const code = src('src/presentation/web/components/CoOwners.tsx');
    expect(code).toContain('listPetPets');
    expect(code).toContain('PetsRevocationConfirm');
    expect((code.match(/guardPetsRevocation/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(code.indexOf('guardPetsRevocation')).toBeLessThan(code.indexOf("action: 'CHANGE_PRINCIPAL'"));
  });
});

