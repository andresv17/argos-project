/**
 * T916 (006, Fase 11): espera visible y contador regresivo en vivo (1 s) y relectura automática al llegar a 0. «Espera {t} para volver a intentarlo» (segundos < 60, minutos hacia
 * arriba < 3600, horas hacia arriba), el botón único deshabilitado, cuenta atrás cada segundo, una sola relectura al llegar a 0, temporizador cancelado al desmontar y `429` con `Retry-After`.
 * REQ-ESC6-019, REQ-ESC6-034; SC-ESC6-114, SC-ESC6-115. Temporizadores simulados y 0 llamadas de red.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { cooldownStep, startCooldownCountdown, sceneGenerateState, sceneProblemMessage, sceneWaitText } from '../../../src/presentation/web/scene-view.ts';
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
const html = (view: ReturnType<typeof sceneView>): string => renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'e', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view, status: 'READY', error: null, busy: false, onRegenerate: noop }));
/** Atributos del botón sin la clase (Tailwind lleva «disabled:opacity-60»). */
const buttons = (markup: string): string[] => (markup.match(/<button[^>]*>[^<]*<\/button>/g) ?? []).map((b) => b.replace(/class="[^"]*"/, ''));

describe('T916 texto de espera (SC-ESC6-114)', () => {
  it.each(TEXTS)('[SC-ESC6-114] retryAfterSeconds = %i: el texto es «%s»', (seconds, text) => {
    expect(sceneWaitText(seconds)).toBe(text);
    expect(sceneGenerateState(waiting(seconds))).toMatchObject({ disabled: true, reason: text });
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

  it.each(TEXTS)('[SC-ESC6-114] con retryAfterSeconds = %i el bloque muestra «%s» y el botón único queda deshabilitado', (seconds, text) => {
    const markup = html(waiting(seconds));
    expect(markup).toContain(text);
    const found = buttons(markup);
    expect(found).toHaveLength(1);
    expect(found.every((b) => /\sdisabled(=|\s|>)/.test(b))).toBe(true);
  });

  it('[SC-ESC6-114] con canRegenerate verdadero pero con espera vigente el botón único sigue deshabilitado', () => {
    const view = sceneView({ actions: { canUpdate: false, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES', retryAfterSeconds: 30 } });
    const markup = html(view);
    expect(buttons(markup).every((b) => /\sdisabled(=|\s|>)/.test(b))).toBe(true);
    expect(markup).toContain('Espera 30 s para volver a intentarlo');
  });

  it('[SC-ESC6-114] sin retryAfterSeconds (null o ausente) no hay texto de espera y COOLDOWN usa un texto neutro', () => {
    expect(html(sceneView())).not.toContain('Espera ');
    const reason = sceneGenerateState(sceneView({ actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'COOLDOWN' } })).reason ?? '';
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

describe('T916 contador regresivo en vivo (SC-ESC6-115)', () => {
  /** Programador manual: ejecuta SOLO la entrada viva más antigua y la marca consumida (cada `after` es de un solo disparo). */
  function stepper() {
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
    const tick = (): void => {
      const next = pending.find((p) => p.live);
      if (next === undefined) return;
      next.live = false;
      next.run();
    };
    return { scheduler, pending, tick, liveCount: () => pending.filter((p) => p.live).length };
  }

  it('[SC-ESC6-115] cooldownStep puro: con N > 0 devuelve el texto de N y el siguiente N - 1; con 0 pide el refresco', () => {
    expect(cooldownStep(59)).toEqual({ text: 'Espera 59 s para volver a intentarlo', next: 58, refresh: false });
    expect(cooldownStep(1)).toEqual({ text: 'Espera 1 s para volver a intentarlo', next: 0, refresh: false });
    expect(cooldownStep(0)).toEqual({ text: null, next: null, refresh: true });
    expect(cooldownStep(-3)).toEqual({ text: null, next: null, refresh: true });
    expect(cooldownStep(61)).toEqual({ text: 'Espera 2 min para volver a intentarlo', next: 60, refresh: false });
  });

  it('[SC-ESC6-115] startCooldownCountdown con 3 s: ticks de 1000 ms con 2, 1 y 0, y un solo refresco al llegar a 0', () => {
    const f = stepper();
    const ticks: number[] = [];
    let expired = 0;
    startCooldownCountdown({ seconds: 3, scheduler: f.scheduler, onTick: (n) => ticks.push(n), onExpire: () => { expired += 1; } });
    expect(f.pending.map((p) => p.ms)).toEqual([1000]);
    f.tick();
    f.tick();
    expect(ticks).toEqual([2, 1]);
    expect(expired).toBe(0);
    f.tick();
    expect(ticks).toEqual([2, 1, 0]);
    expect(expired).toBe(1);
    expect(f.liveCount()).toBe(0);
    f.tick();
    expect(expired).toBe(1);
  });

  it('[SC-ESC6-115] con 60 s el texto sigue la secuencia 60 s -> «Espera 59 s…» -> «Espera 58 s…» a 1 s por tick', () => {
    const f = stepper();
    const texts: string[] = [];
    startCooldownCountdown({ seconds: 60, scheduler: f.scheduler, onTick: (n) => texts.push(sceneWaitText(n)), onExpire: noop });
    f.tick();
    f.tick();
    expect(texts).toEqual(['Espera 59 s para volver a intentarlo', 'Espera 58 s para volver a intentarlo']);
  });

  it('[SC-ESC6-115] al cancelar (desmontar o recargar) no queda temporizador vivo y no hay más ticks ni refresco', () => {
    const f = stepper();
    let calls = 0;
    const cancel = startCooldownCountdown({ seconds: 5, scheduler: f.scheduler, onTick: () => { calls += 1; }, onExpire: () => { calls += 1; } });
    f.tick();
    expect(calls).toBe(1);
    cancel();
    expect(f.liveCount()).toBe(0);
    f.tick();
    expect(calls).toBe(1);
  });

  it('[SC-ESC6-115] con seconds <= 0 dispara el refresco sin programar ticks', () => {
    const f = stepper();
    let expired = 0;
    startCooldownCountdown({ seconds: 0, scheduler: f.scheduler, onTick: noop, onExpire: () => { expired += 1; } });
    expect(f.pending).toHaveLength(0);
    expect(expired).toBe(1);
  });

  it('[SC-ESC6-115] el contenedor SceneBlock usa startCooldownCountdown, devuelve su cancelación como limpieza y relee al vencer', () => {
    const source = readFileSync('src/presentation/web/components/SceneBlock.tsx', 'utf8');
    expect(source).toMatch(/return startCooldownCountdown\(\{ seconds: [^}]*scheduler: browserScheduler/);
    expect(source).toMatch(/onExpire: [^}]*reload\(\)/);
    expect(source).toMatch(/retryAfterSeconds/);
    expect(source).not.toContain('scheduleCooldownRefresh');
  });

  it('[SC-ESC6-115][NFR-ESC6-004] el texto del contador no se anuncia cada segundo: el motivo (aria-describedby) no es una región aria-live', () => {
    const markup = html(waiting(45));
    const reason = markup.match(/<p id="e-reason"[^>]*>/)?.[0] ?? '';
    expect(reason).not.toBe('');
    expect(reason).not.toContain('aria-live');
    expect(reason).not.toContain('role=');
    expect(readFileSync('src/presentation/web/components/SceneBlock.tsx', 'utf8').match(/aria-live="/g)).toHaveLength(1);
  });

  it('[SC-ESC6-115] SceneBlockView con waitSeconds = 58 muestra «Espera 58 s…» en vez del valor de la vista (45)', () => {
    const markup = renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'e', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view: waiting(45), status: 'READY', error: null, busy: false, onRegenerate: noop, waitSeconds: 58 }));
    expect(markup).toContain('Espera 58 s para volver a intentarlo');
    expect(markup).not.toContain('Espera 45 s');
  });
});
