/**
 * T585/T586 [US5] presentación del avatar (REQ-AVA-002, REQ-AVA-003, D-19 A, SC-ALM-018..020): prioridad avatar cargado > inicial; `avatarUrl` NUNCA se
 * renderiza como imagen (la CSP estricta lo impide) sino como enlace de texto «Ver enlace externo» (`rel="noopener noreferrer"`, pestaña nueva) en la ficha y
 * en el formulario; ayuda del campo `avatarUrl`. Render estático: el recortador (canvas, Chromium/WebKit) queda pendiente (ver informe).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AvatarExternalLink, PetAvatar } from '../../../src/presentation/web/components/PetAvatar.tsx';
import { PetCardList } from '../../../src/presentation/web/components/PetCards.tsx';
import { PetForm } from '../../../src/presentation/web/components/PetForm.tsx';
import { avatarImagePath, avatarVersionOf, externalAvatarLink, petInitials } from '../../../src/presentation/web/view-model.ts';
import { card, profile } from './presentation-fixtures.ts';

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const PET = '44444444-4444-4444-8444-444444444401';

describe('T585 funciones puras del avatar (view-model)', () => {
  it('[REQ-AVA-001] la imagen del avatar se pide al proxy de la misma origen con ?v=<avatarVersion>; sin versión no hay ruta', () => {
    expect([avatarImagePath(PET, 3), avatarImagePath(PET, null)]).toEqual([`/api/pets/${PET}/avatar?v=3`, null]);
  });

  it('[REQ-AVA-001] avatarVersionOf lee la versión del perfil y trata cualquier valor no entero positivo como ausente', () => {
    expect([avatarVersionOf({ avatarVersion: 2 }), avatarVersionOf({ avatarVersion: null }), avatarVersionOf({}), avatarVersionOf({ avatarVersion: 0 }), avatarVersionOf({ avatarVersion: '2' })]).toEqual([2, null, null, null, null]);
  });

  it('[REQ-AVA-003] externalAvatarLink acepta solo http(s) y descarta javascript:, data:, vacío y nulo', () => {
    expect([
      externalAvatarLink('https://img.example/a.png'),
      externalAvatarLink(' http://img.example/a.png '),
      externalAvatarLink('javascript:alert(1)'),
      externalAvatarLink('data:image/png;base64,AAAA'),
      externalAvatarLink(''),
      externalAvatarLink(null),
      externalAvatarLink(undefined),
    ]).toEqual(['https://img.example/a.png', 'http://img.example/a.png', null, null, null, null, null]);
  });
});

describe('T585 PetAvatar: prioridad avatar cargado > inicial y nunca avatarUrl como imagen (D-19 A)', () => {
  it('[SC-ALM-018] con avatarVersion muestra la imagen del proxy con alt vacío y carga diferida; sin avatarVersion muestra la inicial', () => {
    const withAvatar = html(h(PetAvatar, { name: 'Argos', petId: PET, avatarVersion: 2, colorToken: null, size: 64 }));
    const without = html(h(PetAvatar, { name: 'Argos', petId: PET, avatarVersion: null, colorToken: null, size: 64 }));
    expect(withAvatar).toContain(`<img src="/api/pets/${PET}/avatar?v=2"`);
    expect(withAvatar).toContain('loading="lazy"');
    expect(withAvatar).not.toContain('>A<');
    expect(without).not.toContain('<img');
    expect(without).toContain(`>${petInitials('Argos')}<`);
  });

  it('[SC-ALM-019] la tarjeta de mascota con avatarUrl http(s) y sin avatar cargado NO contiene ninguna <img> remota: muestra la inicial', () => {
    const remote = card('p1', 'Argos');
    const markup = html(h(PetCardList, { cards: [{ ...remote, profile: { ...remote.profile, avatarUrl: 'https://img.example/a.png' } }], activePetId: null, onSelect: noop }));
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('img.example');
    expect(markup).toContain(`>${petInitials('Argos')}<`);
  });

  it('[SC-ALM-018] la tarjeta de mascota con avatar cargado usa la imagen del proxy aunque exista avatarUrl', () => {
    const base = card('p1', 'Argos');
    const markup = html(h(PetCardList, { cards: [{ ...base, profile: { ...base.profile, id: PET, avatarUrl: 'https://img.example/a.png', avatarVersion: 5 } as never }], activePetId: null, onSelect: noop }));
    expect(markup).toContain(`/api/pets/${PET}/avatar?v=5`);
    expect(markup).not.toContain('img.example');
  });
});

describe('T586 enlace externo y ayuda del campo avatarUrl (REQ-AVA-003, SC-ALM-020)', () => {
  it('[SC-ALM-020] «Ver enlace externo» abre en pestaña nueva con rel noopener noreferrer y es texto (no imagen); con un valor no http(s) no se renderiza', () => {
    const link = html(h(AvatarExternalLink, { avatarUrl: 'https://img.example/a.png' }));
    expect(link).toContain('>Ver enlace externo</a>');
    expect(link).toContain('href="https://img.example/a.png"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).not.toContain('<img');
    expect(html(h(AvatarExternalLink, { avatarUrl: 'javascript:alert(1)' }))).toBe('');
    expect(html(h(AvatarExternalLink, { avatarUrl: null }))).toBe('');
  });

  it('[SC-ALM-020] el formulario de mascota explica que el avatarUrl no se muestra como imagen y ofrece el enlace cuando hay valor', () => {
    const editing = html(h(PetForm, { profile: { ...profile('p1', 'Argos'), avatarUrl: 'https://img.example/a.png' }, onSubmit: asyncNoop, onCancel: noop }));
    const creating = html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop }));
    expect(editing).toContain('no se muestra como imagen');
    expect(editing).toContain('Ver enlace externo');
    expect(creating).toContain('no se muestra como imagen');
    expect(creating).not.toContain('Ver enlace externo');
  });
});
