/**
 * T1696 (Feature 012, Bloque E, #81; `/keymaker`; lote de corrección tras `/oracle`, MEDIA-1; ENM-005-E 0.2.2 annex §3.2, §4 y §5.3): el selector del subconjunto incluye las mascotas
 * co-poseídas (titular principal o co-propietario ACTIVE), no solo `ownerUserId === usuario`. Sin jsdom.
 *
 * @implements REQ-VET12-002, INV-VET12-001
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdDetailView } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';
import { eligibleSharePets, loadCoOwnedPetIds } from '../../../src/presentation/web/share-eligible-pets.ts';

const src = (file: string): string => readFileSync(file, 'utf8');
const ME = 'u-me';
const OTHER = 'u-other';
const profile = (id: string, name: string, ownerUserId: string) => ({ profile: { id, name, ownerUserId } });

describe('MEDIA-1 el selector incluye las mascotas co-poseídas (annex §4, §5.3)', () => {
  const ownership = (principal: string, coOwners: ReadonlyArray<{ userId: string; status: string }>) => ({ petId: 'x', ownershipVersion: 1, principal: { userId: principal, username: 'p' }, coOwners: coOwners.map((c, i) => ({ id: `c${i}`, username: 'u', expiresAt: '', joinedAt: null, ...c })), promotionNotice: { pending: false } });

  it('[§4] co-propietario ACTIVE entra; INVITED, LEFT o un tercero sin fila no entran; no se consulta lo que ya es mío como principal', async () => {
    const getOwnership = vi.fn(async (petId: string) => {
      if (petId === 'co-active') return ownership(OTHER, [{ userId: ME, status: 'ACTIVE' }]);
      if (petId === 'co-invited') return ownership(OTHER, [{ userId: ME, status: 'INVITED' }]);
      if (petId === 'co-left') return ownership(OTHER, [{ userId: ME, status: 'LEFT' }]);
      throw new Error('404');
    });
    const ids = await loadCoOwnedPetIds({ getOwnership } as never, ME, ['mine', 'co-active', 'co-invited', 'co-left', 'stranger'], new Set(['mine']));
    expect([...ids]).toEqual(['co-active']);
    expect(getOwnership).not.toHaveBeenCalledWith('mine');
  });

  it('[§3.2] eligibleSharePets = principales propias + co-poseídas, en el orden del hogar, solo {id, name}', () => {
    const cards = [profile('a', 'Argos', ME), profile('b', 'Bruno', OTHER), profile('c', 'Coco', OTHER)];
    expect(eligibleSharePets(cards as never, ME, new Set(['c']))).toEqual([{ id: 'a', name: 'Argos' }, { id: 'c', name: 'Coco' }]);
    expect(eligibleSharePets(cards as never, ME, new Set())).toEqual([{ id: 'a', name: 'Argos' }]);
  });

  it('[UI] Hogares → Compartir: un co-propietario ACTIVE no principal ve su mascota co-poseída en el selector', () => {
    const view = { household: { id: 'h1', name: 'Hogar Z' }, members: [], myRole: 'ADMIN', isHouseholdOwner: false } as never;
    const pets = [profile('p-co', 'Coco', OTHER), profile('p-other', 'Ajena', OTHER)];
    const markup = renderToStaticMarkup(h(MemoryRouter, null, h(HouseholdDetailView, { view, tab: 'compartir', onTab: () => undefined, myUserId: ME, pets: pets as never, failed: false, coOwnedPetIds: new Set(['p-co']), children: null } as never)));
    expect(markup).toContain('Todas las mascotas del hogar (1)');
    expect(markup).toContain('Solo algunas mascotas');
    expect(markup).not.toContain('Para compartir con tu veterinario, asigna al hogar al menos una mascota tuya.');
  });

  it('[UI] sin co-poseídas, con solo mascotas ajenas, no hay selector (comportamiento de antes)', () => {
    const view = { household: { id: 'h1', name: 'Hogar Z' }, members: [], myRole: 'ADMIN', isHouseholdOwner: false } as never;
    const markup = renderToStaticMarkup(h(MemoryRouter, null, h(HouseholdDetailView, { view, tab: 'compartir', onTab: () => undefined, myUserId: ME, pets: [profile('p', 'Ajena', OTHER)] as never, failed: false, children: null } as never)));
    expect(markup).not.toContain('Solo algunas mascotas');
    expect(markup).toContain('Para compartir con tu veterinario, asigna al hogar al menos una mascota tuya.');
  });

  it('[UI] PetsPage ya no filtra por ownerUserId === usuario: usa eligibleSharePets y loadCoOwnedPetIds', () => {
    const code = src('src/presentation/web/pages/PetsPage.tsx');
    expect(code).toContain('eligibleSharePets');
    expect(code).toContain('loadCoOwnedPetIds');
    expect(code).not.toMatch(/const sharePets = [^\n]*ownerUserId === user\.id/);
    const hh = src('src/presentation/web/pages/HouseholdsPage.tsx');
    expect(hh).toContain('eligibleSharePets');
    expect(hh).toContain('loadCoOwnedPetIds');
  });
});
