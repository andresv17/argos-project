/**
 * Planificador real del navegador para la renovación proactiva de la URL firmada (SC-ALM-032, REQ-ARC-003; T581). Es el tercer módulo de presentación
 * con temporizadores autorizado por Neo: solo envuelve `setTimeout`/`clearTimeout` y el reloj `Date.now`; la regla (80 %, reintento único, stop cancela)
 * vive en `access-renewer.ts`, que es puro.
 *
 * @implements REQ-ARC-003
 */
import type { Scheduler } from './access-renewer.ts';

export const browserScheduler: Scheduler = {
  after(run, ms) {
    // nosemgrep: tests.security.sast-rules.argos-no-entropy-outside-adapters
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/** Reloj y planificador reales que `MediaPanel` entrega al renovador. */
export const browserRenewal: { readonly now: () => number; readonly scheduler: Scheduler } = {
  // nosemgrep: tests.security.sast-rules.argos-no-entropy-outside-adapters
  now: () => Date.now(),
  scheduler: browserScheduler,
};
