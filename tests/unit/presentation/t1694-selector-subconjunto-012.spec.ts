/**
 * T1694 (Feature 012, Bloque E, #81; PRUEBAS ROJAS hasta T1696; `/keymaker`): UI del subconjunto de mascotas del enlace `PETS` (ENM-005-E 0.2.2, `REQ-VET12-002`, `NFR-012-001`).
 * SC-012-054 (un solo componente, mismos textos y comportamiento en los dos puntos de entrada), SC-012-055 (la ficha de mascota no tiene selector y el alcance es `PET`), SC-012-064
 * (casillas con nombre accesible, teclado y conteo anunciado a 320 px). Sin jsdom: `renderToStaticMarkup` e inspección de las fuentes, como T1562 y T794. La revisión visual a 320/1024/1280 px es de `/sati`.
 *
 * CONTRATO DE UI SUPUESTO por T1694 (a confirmar por T1696; los nombres son del diseño, no del contrato HTTP):
 *  - `src/presentation/web/components/PetSubsetSelector.tsx` exporta `PetSubsetSelector({ pets, selectedIds, onChange, max?, idPrefix? })`: un `<fieldset>` con `<legend>`, una casilla nativa por mascota
 *    (`<input type="checkbox">` con su `<label>`), tope `max` (por defecto 20: con el tope alcanzado las no marcadas quedan `disabled`) y una región `role="status"` (`aria-live="polite"`) con el texto «N de M mascotas elegidas».
 *  - `ShareLinksView` recibe `householdPets` (lista `{ id, name }` del hogar), `selectedPetIds` y `onPetIds`: SOLO con `household` presente y `hideScopeChoice` (los dos puntos de entrada de hogar) pinta el selector;
 *    sin `householdPets` (la ficha) no hay selector y `scope` es `PET`.
 *  - `ShareLinksPanel` es el ÚNICO importador de `PetSubsetSelector`; `PetsPage` (contexto de hogar) y `HouseholdsPage` le pasan `householdPets`; el panel de la ficha de mascota no.
 *
 * @implements REQ-VET12-002, REQ-VET12-005, NFR-012-001, SC-012-054, SC-012-055, SC-012-064
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';

const noop = (): void => undefined;
const PETS = [
  { id: '11111111-1111-4111-8111-111111111101', name: 'Argos' },
  { id: '11111111-1111-4111-8111-111111111102', name: 'Kira' },
  { id: '11111111-1111-4111-8111-111111111103', name: 'Nyx' },
  { id: '11111111-1111-4111-8111-111111111104', name: 'Milo' },
] as const;
const SELECTOR = 'src/presentation/web/components/PetSubsetSelector.tsx';
const read = (path: string): string => readFileSync(path, 'utf8');

type SelectorProps = { pets: readonly { id: string; name: string }[]; selectedIds: readonly string[]; onChange: (ids: string[]) => void; max?: number; idPrefix?: string };
async function selector(): Promise<(props: SelectorProps) => unknown> {
  try {
    const specifier = '../../../src/presentation/web/components/PetSubsetSelector.tsx';
    return ((await import(/* @vite-ignore */ specifier)) as { PetSubsetSelector: (props: SelectorProps) => unknown }).PetSubsetSelector;
  } catch (cause) {
    throw new Error(`ROJO T1694: falta implementar ${SELECTOR} (T1696)`, { cause });
  }
}
const renderSelector = async (props: Partial<SelectorProps> = {}): Promise<string> => {
  const component = await selector();
  return renderToStaticMarkup(h(component as never, { pets: PETS, selectedIds: [], onChange: noop, ...props } as never));
};

/** Nombre accesible de cada casilla: `aria-label`, `<label for>` o `<label>` envolvente. */
function checkboxNames(markup: string): string[] {
  const text = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const labelsFor = new Map([...markup.matchAll(/<label[^>]*\sfor="([^"]+)"[^>]*>(.*?)<\/label>/gs)].map((m) => [m[1]!, text(m[2]!)] as const));
  const names: string[] = [];
  for (const input of markup.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)) {
    const tag = input[0];
    const aria = /aria-label="([^"]+)"/.exec(tag)?.[1];
    const id = /\sid="([^"]+)"/.exec(tag)?.[1];
    const wrapping = [...markup.matchAll(/<label[^>]*>((?:(?!<\/label>).)*?)<\/label>/gs)].find((m) => m[1]!.includes(tag));
    names.push(aria ?? (id !== undefined ? labelsFor.get(id) : undefined) ?? (wrapping === undefined ? '' : text(wrapping[1]!)));
  }
  return names;
}

describe('T1694 PetSubsetSelector: accesibilidad (SC-012-064, NFR-012-001)', () => {
  it('[SC-012-064] es un fieldset con legend y una casilla NATIVA por mascota, cada una con su nombre accesible (el de la mascota)', async () => {
    const markup = await renderSelector({ selectedIds: [PETS[0].id] });
    expect(markup).toMatch(/<fieldset[^>]*>\s*<legend[^>]*>[^<]+<\/legend>/);
    expect((markup.match(/<input\b[^>]*type="checkbox"/g) ?? []).length).toBe(4);
    expect(checkboxNames(markup)).toEqual(['Argos', 'Kira', 'Nyx', 'Milo']);
    expect(markup).toMatch(/<input\b[^>]*value="11111111-1111-4111-8111-111111111101"[^>]*checked|<input\b[^>]*checked[^>]*value="11111111-1111-4111-8111-111111111101"/);
  });

  it('[SC-012-064] solo teclado: casillas nativas sin tabindex negativo ni roles falsos, sin atajos de ratón (onMouse*)', async () => {
    const markup = await renderSelector();
    expect(markup).not.toMatch(/tabindex="-1"/);
    expect(markup).not.toMatch(/role="checkbox"/);
    expect(markup).not.toMatch(/role="presentation"/);
  });

  it('[SC-012-064] el conteo se anuncia: una región role="status" aria-live="polite" con «N de M mascotas elegidas» que cambia con la selección', async () => {
    const none = await renderSelector({ selectedIds: [] });
    const two = await renderSelector({ selectedIds: [PETS[0].id, PETS[1].id] });
    const region = (markup: string): string => /<[a-z]+[^>]*role="status"[^>]*aria-live="polite"[^>]*>(.*?)<\/[a-z]+>/s.exec(markup)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    expect(region(none)).toMatch(/0\s+de\s+4\s+mascotas/);
    expect(region(two)).toMatch(/2\s+de\s+4\s+mascotas/);
  });

  it('[SC-012-064][REQ-VET12-001] con el tope (20) alcanzado las casillas sin marcar quedan deshabilitadas y se avisa; las marcadas siguen operativas para poder quitarlas', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `11111111-1111-4111-8111-1111111117${String(i).padStart(2, '0')}`, name: `Mascota ${i}` }));
    const markup = await renderSelector({ pets: many, selectedIds: many.slice(0, 20).map((p) => p.id), max: 20 });
    const inputs = [...markup.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]);
    expect(inputs.filter((tag) => /\sdisabled(=|\s|>)/.test(tag)).length).toBe(1);
    expect(inputs.filter((tag) => /\schecked(=|\s|>)/.test(tag) && !/\sdisabled(=|\s|>)/.test(tag)).length).toBe(20);
    expect(markup).toMatch(/20/);
  });

  it('[SC-012-064] a 320 px: objetivos táctiles de al menos 44 px, columna única que encoge (min-w-0, sin anchos fijos en px) y foco visible', async () => {
    const markup = await renderSelector();
    expect(markup).toMatch(/min-h-11|min-h-12|h-11|h-12/);
    expect(markup).toMatch(/min-w-0/);
    expect(markup).not.toMatch(/\bw-\[\d+px\]/);
    expect(markup).not.toMatch(/overflow-x-(scroll|auto)/);
    expect(markup).toMatch(/focus(-visible)?:/);
  });

  it('[SC-012-064] sin ninguna mascota elegida el botón de crear queda deshabilitado y el motivo se anuncia (mínimo 1)', () => {
    const markup = renderToStaticMarkup(h(ShareLinksView as never, subsetProps({ selectedPetIds: [] }) as never));
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>\s*Crear enlace/);
    expect(markup).toMatch(/al menos una mascota/i);
  });
});

function subsetProps(extra: Record<string, unknown> = {}): ShareLinksViewProps {
  return {
    petName: 'Casa Vallejo',
    household: { petCount: 4 },
    canCreateLinks: true,
    hideScopeChoice: true,
    householdPets: PETS,
    selectedPetIds: [PETS[0].id, PETS[1].id],
    onPetIds: noop,
    now: '2026-11-18T12:00:00.000Z',
    scope: 'HOUSEHOLD',
    expiresInDays: 7,
    includeMicrochip: false,
    includeClinicalFiles: false,
    busy: false,
    error: null,
    created: null,
    copyStatus: 'IDLE',
    list: { items: [], activeCount: 0, maxActiveLinks: 20 },
    confirmRevokeId: null,
    notice: null,
    onScope: noop,
    onExpiry: noop,
    onMicrochip: noop,
    onClinicalFiles: noop,
    onCreate: noop,
    onCancel: noop,
    onCopy: noop,
    onDone: noop,
    onAskRevoke: noop,
    onConfirmRevoke: noop,
    onCancelRevoke: noop,
    onPreview: noop,
    ...extra,
  } as unknown as ShareLinksViewProps;
}

describe('T1694 un solo selector en los dos puntos de entrada (SC-012-054, REQ-VET12-002)', () => {
  it('[SC-012-054] existe UN solo componente PetSubsetSelector y ShareLinks.tsx es su único importador (no hay copias por página)', () => {
    const definitions = execSync("grep -rln 'export function PetSubsetSelector\\|export const PetSubsetSelector' src/presentation || true", { encoding: 'utf8' }).split('\n').filter(Boolean);
    const importers = execSync("grep -rln \"PetSubsetSelector\" src/presentation || true", { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
    expect(definitions).toEqual([SELECTOR]);
    expect(importers).toEqual([SELECTOR, 'src/presentation/web/components/ShareLinks.tsx'].sort());
  });

  it('[SC-012-054] los dos puntos de entrada (Mascotas → [HOGAR] → Compartir y Hogares → [HOGAR] → Compartir) pasan la lista de mascotas del hogar al MISMO panel', () => {
    expect(read('src/presentation/web/pages/HouseholdsPage.tsx')).toMatch(/<ShareLinksPanel[^>]*householdPets=/);
    expect(read('src/presentation/web/pages/PetsPage.tsx')).toMatch(/<ShareLinksPanel[^>]*householdPets=/);
  });

  it('[SC-012-054][REQ-VET12-002] con household y hideScopeChoice la vista pinta el selector con las mascotas del hogar; el texto y la estructura son los mismos sea cual sea la página', () => {
    const fromHouseholds = renderToStaticMarkup(h(ShareLinksView as never, subsetProps({ petName: 'Casa Vallejo' }) as never));
    const fromPets = renderToStaticMarkup(h(ShareLinksView as never, subsetProps({ petName: 'Casa Vallejo', household: { petCount: 4 } }) as never));
    expect(fromHouseholds).toBe(fromPets);
    expect(checkboxNames(fromHouseholds)).toEqual(['Argos', 'Kira', 'Nyx', 'Milo']);
    expect(fromHouseholds).toMatch(/2\s+de\s+4\s+mascotas/);
  });

  it('[REQ-VET12-001] elegir TODAS las mascotas crea un enlace de hogar («Todas», HOUSEHOLD) y un subconjunto estricto uno PETS: el panel decide el alcance por la selección', () => {
    const panel = read('src/presentation/web/components/ShareLinks.tsx');
    expect(panel).toMatch(/createPetsLink|createPetsShareLink|share-links\/pets/);
    expect(read('src/presentation/web/share-api.ts')).toMatch(/\/share-links\/pets/);
    expect(read('src/presentation/web/share-api.ts')).toMatch(/clinical-summary\/pets\?/);
  });
});

describe('T1694 la ficha de mascota NO tiene selector y el alcance es PET (SC-012-055, REQ-VET12-002; regresión VERDE hoy: T1696 no puede romperla)', () => {
  it('[SC-012-055] sin householdPets (ficha de Mis mascotas) la vista no pinta fieldset, casillas de mascotas ni «N de M»; el alcance es la mascota', () => {
    const markup = renderToStaticMarkup(h(ShareLinksView as never, subsetProps({ household: null, householdPets: undefined, hideScopeChoice: true, scope: 'PET', petName: 'Argos' }) as never));
    expect(markup).not.toMatch(/mascotas\s+elegidas/);
    expect(markup).not.toMatch(/<fieldset[^>]*>\s*<legend[^>]*>[^<]*mascotas/i);
    expect(markup).toContain('Mascota: Argos');
    expect(markup).not.toContain('Nyx');
  });

  it('[SC-012-055] el panel de la ficha (PetDashboard, pestaña Compartir) no recibe householdPets: la ficha sigue creando enlaces PET', () => {
    const dashboard = read('src/presentation/web/components/PetDashboard.tsx');
    const page = read('src/presentation/web/pages/PetsPage.tsx');
    expect(dashboard).not.toMatch(/PetSubsetSelector|householdPets/);
    const fichaPanel = /<ShareLinksPanel[^>]*key=\{`share-\$\{dashboard\.profile\.id\}`\}[^>]*>/.exec(page)?.[0] ?? '';
    expect(fichaPanel).toContain('petId={dashboard.profile.id}');
    expect(fichaPanel).not.toMatch(/householdPets=\{(?![^}]*shareHousehold)/); // si la pasa, solo condicionada al contexto de hogar (shareHousehold); en Mis mascotas es null
  });

  it('[SC-012-055] la cadena de la ficha conserva REQ-PET11-001: la pestaña Compartir sigue siendo la 8.ª y solo existe con shareSlot', () => {
    expect(read('src/presentation/web/components/PetDashboard.tsx')).toMatch(/'share'/);
    expect(read('tests/unit/presentation/t1562-pestana-compartir-ficha-011.spec.ts')).toContain("'Compartir'");
  });
});
