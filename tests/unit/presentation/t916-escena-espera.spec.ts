/**
 * T916 (006, Fase 11): espera visible y relectura automática al vencer el enfriamiento de intentos. «Espera {t} para volver a intentarlo» (segundos < 60, minutos hacia
 * arriba < 3600, horas hacia arriba), ambos botones deshabilitados, una sola relectura a los `t + 1` s, temporizador cancelado al desmontar y `429` con `Retry-After`.
 * REQ-ESC6-019, REQ-ESC6-034; SC-ESC6-114, SC-ESC6-115. Temporizadores simulados y 0 llamadas de red.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { scheduleCooldownRefresh, sceneProblemMessage, sceneUpdateState, sceneWaitText } from '../../../src/presentation/web/scene-view.ts';
import type { Scheduler } from '../../../src/presentation/web/access-renewer.ts';
import { HOUSEHOLD_ID, sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
const TEXTS: ReadonlyArray<readonly [number, string]> = [
  [45, 'Espera 45 s para volver a intentarlo'],
  [61, 'Espera 2 min para volver a intentarlo'],
  [3599, 'Espera 60 min para volver a intentarlo'],
  [3601, 'Espera 2 h para volver a intentarlo'],
];
const waiting = (retryAfterSeconds: number) => sceneView({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED', actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'COOLDOWN', retryAfterSeconds } });
const html = (view: ReturnType<typeof sceneView>): string => renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'e', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view, status: 'READY', error: null, busy: false, onUpdate: noop, onRegenerate: noop }));
/** Atributos del botón sin la clase (Tailwind lleva «disabled:opacity-60»). */
const buttons = (markup: string): string[] => (markup.match(/<button[^>]*>[^<]*<\/button>/g) ?? []).map((b) => b.replace(/class="[^"]*"/, ''));

function fakeScheduler() {
  const pending: Array<{ run: () => void; ms: number; live: boolean }> = [];
  const scheduler: Scheduler = {
    after(run, ms) {
      const entry = { run, ms, live: true };
      pending.push(entry);
      return () => {
        entry.live = false;
      };
    },
  };
  return { scheduler, pending, fire: () => pending.filter((p) => p.live).forEach((p) => p.run()) };
}

describe('T916 texto de espera (SC-ESC6-114)', () => {
  it.each(TEXTS)('[SC-ESC6-114] retryAfterSeconds = %i: el texto es «%s»', (seconds, text) => {
    expect(sceneWaitText(seconds)).toBe(text);
    expect(sceneUpdateState(waiting(seconds))).toEqual({ disabled: true, reason: text });
  });

  it('[SC-ESC6-114] los límites 59, 60, 3600 y 86400 se redondean hacia arriba por unidad', () => {
    expect([sceneWaitText(1), sceneWaitText(59), sceneWaitText(60), sceneWaitText(3600), sceneWaitText(86_400)]).toEqual([
      'Espera 1 s para volver a intentarlo',
      'Espera 59 s para volver a intentarlo',
      'Espera 1 min para volver a intentarlo',
      'Espera 1 h para volver a intentarlo',
      'Espera 24 h para volver a intentarlo',
    ]);
  });

  it.each(TEXTS)('[SC-ESC6-114] con retryAfterSeconds = %i el bloque muestra «%s» y ambos botones quedan deshabilitados', (seconds, text) => {
    const markup = html(waiting(seconds));
    expect(markup).toContain(text);
    const found = buttons(markup);
    expect(found).toHaveLength(2);
    expect(found.every((b) => /\sdisabled(=|\s|>)/.test(b))).toBe(true);
  });

  it('[SC-ESC6-114] con canRegenerate verdadero pero con espera vigente el botón «Regenerar escena desde cero» sigue deshabilitado', () => {
    const view = sceneView({ actions: { canUpdate: false, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES', retryAfterSeconds: 30 } });
    const markup = html(view);
    expect(buttons(markup).every((b) => /\sdisabled(=|\s|>)/.test(b))).toBe(true);
    expect(markup).toContain('Espera 30 s para volver a intentarlo');
  });

  it('[SC-ESC6-114] sin retryAfterSeconds (null o ausente) no hay texto de espera y COOLDOWN usa un texto neutro', () => {
    expect(html(sceneView())).not.toContain('Espera ');
    const reason = sceneUpdateState(sceneView({ actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'COOLDOWN' } })).reason ?? '';
    expect(reason).not.toMatch(/\d/);
    expect(reason.length).toBeGreaterThan(10);
  });

  it('[SC-ESC6-114] la cadena «Hubo demasiados intentos seguidos» no existe en src/presentation/web/ (0 apariciones)', () => {
    for (const file of ['scene-view.ts', 'components/SceneBlock.tsx', 'scene-api.ts']) expect(readFileSync(`src/presentation/web/${file}`, 'utf8')).not.toContain('Hubo demasiados intentos seguidos');
    expect(sceneProblemMessage('ERR-RATE-LIMITED')).not.toContain('Hubo demasiados intentos seguidos');
  });

  it('[SC-ESC6-115] un 429 con Retry-After: 30 muestra «Espera 30 s para volver a intentarlo»', () => {
    expect(sceneProblemMessage('ERR-RATE-LIMITED', 30)).toBe('Espera 30 s para volver a intentarlo');
  });
});

describe('T916 relectura única al vencer la espera (SC-ESC6-115)', () => {
  it('[SC-ESC6-115] con retryAfterSeconds = 60 la relectura se programa a los 61 s y se ejecuta exactamente una vez', () => {
    const f = fakeScheduler();
    let reads = 0;
    scheduleCooldownRefresh({ seconds: 60, scheduler: f.scheduler, reload: () => { reads += 1; } });
    expect(f.pending.map((p) => p.ms)).toEqual([61_000]);
    expect(reads).toBe(0);
    f.fire();
    expect(reads).toBe(1);
  });

  it('[SC-ESC6-115] un Retry-After de 30 programa 1 relectura a los 31 s', () => {
    const f = fakeScheduler();
    scheduleCooldownRefresh({ seconds: 30, scheduler: f.scheduler, reload: noop });
    expect(f.pending.map((p) => p.ms)).toEqual([31_000]);
  });

  it('[SC-ESC6-115] al desmontar se cancela el temporizador y hay 0 lecturas posteriores', () => {
    const f = fakeScheduler();
    let reads = 0;
    const cancel = scheduleCooldownRefresh({ seconds: 60, scheduler: f.scheduler, reload: () => { reads += 1; } });
    cancel();
    f.fire();
    expect(reads).toBe(0);
  });

  it('[SC-ESC6-115] el contenedor SceneBlock usa el temporizador y lo devuelve como limpieza del efecto', () => {
    const source = readFileSync('src/presentation/web/components/SceneBlock.tsx', 'utf8');
    expect(source).toMatch(/return scheduleCooldownRefresh\(\{ seconds: [^}]*scheduler: browserScheduler/);
    expect(source).toMatch(/retryAfterSeconds/);
  });
});
