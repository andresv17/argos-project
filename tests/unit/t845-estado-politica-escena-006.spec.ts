import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, STATE_SCENE_001, STATE_SCENE_001_STATES } from '../../src/generated/v34/index.ts';
import type { SceneErrorCode } from '../../src/generated/v34/schemas/types.ts';
import { HTTP_SCENE_ERROR_CODES, SCENE_STATE_ERROR_CODES, deriveStatus, isHttpSceneError, isSceneStateErrorCode, transitionScene, type DeriveStatusInput, type SceneState } from '../../src/domain/scene/scene-state.ts';
import { canGenerateScene, canManageHouseholdPhoto, canReadScene } from '../../src/domain/scene/scene-policy.ts';
import { readFileSync } from 'node:fs';
import { can, petPermissionsFor } from '../../src/domain/access/rbac.ts';

/**
 * T845 (006, Fase 5): `scene-state` (STATE-SCENE-001, `deriveStatus` sin proyección persistida), `scene-policy` (D6-10 = B: propietario y ADMIN actúan; lectura por
 * REQ-ESC6-020; sin ampliar `PetAction` ni `RBAC_MATRIX`) y los errores `SCENE_STATE` que no son HTTP.
 * REQ-ESC6-003, REQ-ESC6-020; INV-ESC6-007; STATE-SCENE-001; ERR-SCENE-GENERATION-FAILED, ERR-SCENE-GENERATION-TIMEOUT, ERR-SCENE-INVALID-IMAGE,
 * ERR-SCENE-LEASE-EXPIRED; EDGE-ESC6-004; SC-ESC6-026, SC-ESC6-049, SC-ESC6-086, SC-ESC6-089, SC-ESC6-090.
 */
const NOW = '2026-11-05T12:00:00.000Z';
const base: DeriveStatusInput = {
  now: NOW,
  runState: null,
  leaseExpiresAt: null,
  hasImage: false,
  imageFingerprint: null,
  imageDegraded: false,
  fingerprintNow: 'F1',
  hasInputs: false,
  failedAttemptFingerprint: null,
  lastErrorCode: null,
};
const derive = (patch: Partial<DeriveStatusInput>) => deriveStatus({ ...base, ...patch });

describe('transitionScene (T845): máquina cerrada STATE-SCENE-001', () => {
  const ALLOWED: ReadonlyArray<[SceneState, string, SceneState]> = [
    ['idle', 'INPUT_CHANGED', 'outdated'],
    ['outdated', 'REQUEST', 'generating'],
    ['generating', 'PUBLISHED', 'ready'],
    ['generating', 'FAILED', 'failed'],
    ['generating', 'PUBLISHED_WITH_NEWER_INPUT', 'outdated'],
    ['generating', 'CANCELLED', 'outdated'],
    ['ready', 'INPUT_CHANGED', 'outdated'],
    ['failed', 'RETRY', 'generating'],
    ['failed', 'INPUT_CHANGED', 'outdated'],
  ];

  it.each(ALLOWED)('[REQ-ESC6-003] %s --%s--> %s es válida', (from, event, to) => {
    expect(transitionScene(from, event)).toEqual({ ok: true, to });
  });

  it('[REQ-ESC6-003] las 8 parejas (from, to) del contrato generado son las únicas; cualquier otra se rechaza (outdated->ready, idle->generating, ready->generating)', () => {
    const pairs = new Set(STATE_SCENE_001.transitions.map((t) => `${t.from}>${t.to}`));
    expect(pairs.size).toBe(8);
    for (const from of STATE_SCENE_001_STATES) {
      for (const to of STATE_SCENE_001_STATES) {
        const reachable = ALLOWED.some(([f, , t]) => f === from && t === to);
        expect(reachable).toBe(pairs.has(`${from}>${to}`));
      }
    }
    expect(transitionScene('outdated', 'PUBLISHED')).toEqual({ ok: false });
    expect(transitionScene('idle', 'REQUEST')).toEqual({ ok: false });
    expect(transitionScene('ready', 'REQUEST')).toEqual({ ok: false });
    expect(transitionScene('ready', 'NO_EXISTE')).toEqual({ ok: false });
  });
});

describe('deriveStatus (T845): tabla de verdad de las siete reglas (data-model.md §4)', () => {
  it('[SC-ESC6-086] regla 1: generating con arrendamiento vigente (lease > now) es generating', () => {
    expect(derive({ runState: 'generating', leaseExpiresAt: '2026-11-05T12:00:00.001Z' })).toMatchObject({ status: 'generating', lastError: null, leaseExpired: false });
  });

  it('[SC-ESC6-086][EDGE-ESC6-026] regla 2: generating con lease <= now es failed con ERR-SCENE-LEASE-EXPIRED y pide materializar el vencimiento', () => {
    expect(derive({ runState: 'generating', leaseExpiresAt: NOW })).toEqual({ status: 'failed', lastError: 'ERR-SCENE-LEASE-EXPIRED', leaseExpired: true });
    expect(derive({ runState: 'generating', leaseExpiresAt: '2026-11-05T11:00:00.000Z' }).leaseExpired).toBe(true);
  });

  it('[SC-ESC6-086] regla 3: failed sigue failed con su código, salvo que la huella actual difiera de la del intento fallido (failed -> outdated, EDGE-ESC6-014)', () => {
    const failed = { runState: 'failed' as const, lastErrorCode: 'ERR-SCENE-GENERATION-TIMEOUT' as SceneErrorCode, failedAttemptFingerprint: 'F1', fingerprintNow: 'F1', hasInputs: true };
    expect(derive(failed)).toEqual({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-TIMEOUT', leaseExpired: false });
    expect(derive({ ...failed, fingerprintNow: 'F2' })).toEqual({ status: 'outdated', lastError: null, leaseExpired: false });
  });

  it('[SC-ESC6-086][EDGE-ESC6-028] regla 4: imagen degradada nunca es ready, aunque la huella coincida', () => {
    expect(derive({ hasImage: true, imageFingerprint: 'F1', imageDegraded: true, hasInputs: true }).status).toBe('outdated');
  });

  it('[SC-ESC6-086] regla 5: hay imagen y la huella actual es la de la imagen: ready', () => {
    expect(derive({ hasImage: true, imageFingerprint: 'F1', hasInputs: true })).toEqual({ status: 'ready', lastError: null, leaseExpired: false });
  });

  it('[SC-ESC6-086] regla 6: hay entradas y no hay imagen, o la huella difiere de la de la imagen: outdated', () => {
    expect(derive({ hasInputs: true }).status).toBe('outdated');
    expect(derive({ hasImage: true, imageFingerprint: 'F0', hasInputs: true }).status).toBe('outdated');
  });

  it('[SC-ESC6-086][REQ-ESC6-003] regla 7: sin imagen y sin entradas es idle; sin entradas con imagen distinta (retirada por D6-17) es outdated solo si hay entradas', () => {
    expect(derive({}).status).toBe('idle');
    expect(derive({ hasImage: true, imageFingerprint: 'F0', hasInputs: false }).status).toBe('outdated');
  });

  it('[SC-ESC6-086] la precedencia es estricta: lease vencido gana a failed, y failed gana a ready', () => {
    expect(derive({ runState: 'generating', leaseExpiresAt: NOW, hasImage: true, imageFingerprint: 'F1' }).status).toBe('failed');
    expect(derive({ runState: 'failed', lastErrorCode: 'ERR-SCENE-INVALID-IMAGE', failedAttemptFingerprint: 'F1', hasImage: true, imageFingerprint: 'F1' }).status).toBe('failed');
  });

  it('[EDGE-ESC6-004] un failed sin código persistido muestra el código genérico ERR-SCENE-GENERATION-FAILED', () => {
    expect(derive({ runState: 'failed', failedAttemptFingerprint: 'F1' })).toMatchObject({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED' });
  });

  it('[REQ-ESC6-003] es pura: misma entrada, misma salida', () => {
    const input = { ...base, runState: 'failed' as const, failedAttemptFingerprint: 'F1' };
    expect(deriveStatus(input)).toEqual(deriveStatus(input));
  });
});

describe('errores SCENE_STATE (T845): solo viajan en SceneView.lastError, no son HTTP (SC-ESC6-090)', () => {
  it('[SC-ESC6-090] los 4 códigos con surface SCENE_STATE del catálogo son exactamente SCENE_STATE_ERROR_CODES (una sola fuente)', () => {
    const fromCatalog = Object.entries(ERROR_CATALOG).filter(([, e]) => 'surface' in e && e.surface === 'SCENE_STATE').map(([code]) => code).sort();
    expect([...SCENE_STATE_ERROR_CODES].sort()).toEqual(fromCatalog);
    expect(fromCatalog).toEqual(['ERR-SCENE-GENERATION-FAILED', 'ERR-SCENE-GENERATION-TIMEOUT', 'ERR-SCENE-INVALID-IMAGE', 'ERR-SCENE-LEASE-EXPIRED']);
  });

  it('[SC-ESC6-090] los códigos HTTP de la escena son los otros tres y ningún código es ambas cosas', () => {
    expect([...HTTP_SCENE_ERROR_CODES].sort()).toEqual(['ERR-SCENE-CONSENT-REQUIRED', 'ERR-SCENE-NOTICE-OUTDATED', 'ERR-SCENE-QUOTA-EXCEEDED']);
    for (const code of SCENE_STATE_ERROR_CODES) expect([isSceneStateErrorCode(code), isHttpSceneError(code)]).toEqual([true, false]);
    for (const code of HTTP_SCENE_ERROR_CODES) expect([isSceneStateErrorCode(code), isHttpSceneError(code)]).toEqual([false, true]);
    expect([isSceneStateErrorCode('ERR-PET-NOT-FOUND'), isHttpSceneError('ERR-PET-NOT-FOUND')]).toEqual([false, false]);
  });
});

describe('scene-policy (T845): D6-10 = B, alcance de hogar', () => {
  it('[SC-ESC6-089][SC-ESC6-049] canGenerateScene y canManageHouseholdPhoto son verdaderos solo para el propietario y ADMIN', () => {
    expect(['OWNER', 'ADMIN', 'CAREGIVER', 'READER', null].map((r) => canGenerateScene(r as never))).toEqual([true, true, false, false, false]);
    expect(['OWNER', 'ADMIN', 'CAREGIVER', 'READER', null].map((r) => canManageHouseholdPhoto(r as never))).toEqual([true, true, false, false, false]);
  });

  it('[REQ-ESC6-020] canReadScene es verdadero para todo miembro ACTIVE (OWNER, ADMIN, CAREGIVER, READER) y falso sin membresía', () => {
    expect(['OWNER', 'ADMIN', 'CAREGIVER', 'READER', null].map((r) => canReadScene(r as never))).toEqual([true, true, true, true, false]);
  });

  it('[INV-ESC6-007][SC-ESC6-026] un rol desconocido o ausente no concede nada (404 sin revelar lo decide el caso de uso con canReadScene = false)', () => {
    expect([canReadScene(undefined as never), canGenerateScene('OTRO' as never)]).toEqual([false, false]);
  });

  it('[SC-ESC6-089] la política no amplía PetAction ni RBAC_MATRIX: rbac.ts no menciona la escena y los 9 PetPermissions de 002 siguen siendo 9', () => {
    expect(/scene/i.test(readFileSync('src/domain/access/rbac.ts', 'utf8'))).toBe(false);
    expect(Object.keys(petPermissionsFor('OWNER'))).toHaveLength(9);
    expect(can('OWNER', 'EDIT_PET_BASICS')).toBe(true);
  });
});
