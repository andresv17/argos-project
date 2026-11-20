import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T880 (006, Fase 8): documentación operativa de la escena. El runbook vive en `terraform/README.md`; `claude/entorno-y-lecciones.md` recoge `N2-09` = B.
 * Pruebas estáticas sobre el texto. REQ-ESC6-022, REQ-ESC6-029; NFR-ESC6-002; SC-ESC6-051, SC-ESC6-088.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const seccion = (): string => {
  const t = read('terraform/README.md');
  const i = t.indexOf('## Escena del hogar (006): mantenimiento');
  expect(i).toBeGreaterThanOrEqual(0);
  const rest = t.slice(i + 3);
  const j = rest.indexOf('\n## ');
  return j < 0 ? rest : rest.slice(0, j);
};

describe('runbook de la escena (T880)', () => {
  it('[REQ-ESC6-022][SC-ESC6-051] declara que la foto del hogar y las escenas no viajan en el respaldo y que importar no restaura la escena', () => {
    const s = seccion();
    expect(/no viajan en el respaldo/.test(s) && /importar un respaldo no restaura la escena/.test(s)).toBe(true);
  });

  it('[REQ-ESC6-029][SC-ESC6-088] describe el borrado inmediato por media_deletion_queue, la fila INTENT previa al put y la conciliación de scenes/ y households/', () => {
    const s = seccion();
    for (const t of ['media_deletion_queue', 'INTENT', '`scenes/`', '`households/`', '/internal/maintenance', '15 min']) expect(s.includes(t)).toBe(true);
  });

  it('[NFR-ESC6-002] documenta la cola argos-scene, T_QUEUE, T_LEASE y el worker; y CI/CD sin driver real', () => {
    const s = seccion();
    for (const t of ['argos-scene', 'T_QUEUE', 'T_LEASE', '/internal/scene-worker', 'infraestructura.yml', 'deploy-argos.yml', 'ARGOS_SCENE_DRIVER=real', 'ARGOS_SCENE_DRIVER=fake', 'metadata server', 'Vertex AI']) expect(s.includes(t)).toBe(true);
    expect(/En producción[^.]*`ARGOS_SCENE_DRIVER=real`/.test(s) && /`ARGOS_SCENE_DRIVER=fake` es el valor de CI y desarrollo/.test(s)).toBe(true);
    expect(s.includes('SCENE_REAL_DRIVER_ACTIVATED` del código es `false`')).toBe(false);
    expect(/Los cambios de `terraform\/`.*no se aplican hasta que Neo/.test(s)).toBe(true);
  });

  it('[REQ-ESC6-022] declara la ventana residual de PITR', () => {
    expect(/Ventana residual de PITR/.test(seccion()) && seccion().includes('RR-06-07')).toBe(true);
  });

  it('[REQ-ESC6-022] claude/entorno-y-lecciones.md recoge N2-09 = B (PN-06 fuera de la 006) y la activación del driver real (T885)', () => {
    const e = read('claude/entorno-y-lecciones.md');
    expect(/`N2-09` = B/.test(e) && e.includes('PN-06') && e.includes('SCENE_REAL_DRIVER_ACTIVATED = true')).toBe(true);
  });
});
