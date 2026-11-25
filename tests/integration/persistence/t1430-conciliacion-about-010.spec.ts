/**
 * T1430 (Feature 010, Bloque E, [GH:#33]; H-ARCH-ACE-KEY): la conciliación diaria (REQ-GCS-006) incluye `about/` en la MISMA rutina, con ventana de 15 min. El objeto referenciado por
 * `about_content.photo_object_key` o por una fila de la cola nunca se encola; un objeto de `about/` sin referencia y con más de 15 min se encola con DELETE y se borra. Memoria y SQLite.
 *
 * @implements REQ-ACE10-002, INV-ACE10-001, INV-ARC-003, REQ-GCS-006
 */
import { afterEach, describe, expect, it } from 'vitest';
import { runMediaQueueMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { jpegWithExif } from '../../fixtures/about-fixtures.ts';
import { createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
async function eachEngine(run: (engine: MediaEngine) => Promise<void>): Promise<void> {
  for (const engine of await createMediaEngines(null)) {
    open.push(engine);
    await run(engine);
  }
}

const NOW = '2026-11-25T12:00:00.000Z';
const MINUTE = 60_000;
const ADMIN_ID = 'ad000000-0000-4000-8000-000000000001';
const objectId = (n: number): string => `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const aboutKey = (n: number): string => `about/photo/${objectId(n)}`;
const put = (e: MediaEngine, key: string) => e.storage.inner.put(key, jpegWithExif(), 'image/jpeg');
const advance = (e: MediaEngine, ms: number): void => {
  const next = new Date(Date.parse(e.clock.nowIsoTimestamp()) + ms).toISOString();
  e.clock.setClock(next.slice(0, 10), next);
};

describe('T1430 conciliación de about/ en la rutina existente (H-ARCH-ACE-KEY, REQ-GCS-006)', () => {
  it('un objeto de about/ sin referencia con más de 15 min se encola con DELETE y se borra; con menos de 15 min no se toca', async () => {
    await eachEngine(async (e) => {
      e.clock.setClock(NOW.slice(0, 10), NOW);
      await put(e, aboutKey(1));
      advance(e, 15 * MINUTE + 1000);
      await put(e, aboutKey(2)); // recién subido
      const result = await runMediaQueueMaintenance(e.deps);
      expect([result.reconciled, result.deleted]).toEqual([1, 1]);
      expect(await e.storage.keys('about/')).toEqual([aboutKey(2)]);
    });
  });

  it('el objeto referenciado por about_content.photo_object_key o por una fila de la cola nunca se encola; el reemplazado sí', async () => {
    await eachEngine(async (e) => {
      e.clock.setClock(NOW.slice(0, 10), NOW);
      await e.run((r) => r.aboutContent.replace({ bodyMarkdown: '', photoObjectKey: aboutKey(1), photoAlt: '', updatedAt: NOW, updatedBy: ADMIN_ID }, 0));
      await put(e, aboutKey(1));
      await put(e, aboutKey(2));
      await e.run((r) => r.mediaQueue.enqueue(aboutKey(2), 'INTENT', e.clock.nowIsoTimestamp()));
      await put(e, aboutKey(3)); // sin referencia
      advance(e, 20 * MINUTE);
      const result = await runMediaQueueMaintenance(e.deps);
      expect(result.reconciled).toBe(1);
      expect((await e.storage.keys('about/')).sort()).toEqual([aboutKey(1), aboutKey(2)]);
      expect((await e.run((r) => r.aboutContent.get()))?.photoObjectKey).toBe(aboutKey(1));
    });
  });
});
