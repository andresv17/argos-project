/**
 * T604 [US2] interfaz de importación (SC-CAT-031, D-15 A; REQ-IMP-001): con `mediaToDeleteCount` > 0 la vista previa muestra «Los archivos y
 * fotos no van en el respaldo y se eliminarán: N elementos» y exige una confirmación explícita (casilla) antes de habilitar «Importar respaldo»;
 * con 0 (o sin el campo, respuestas anteriores a la 004) no hay aviso ni casilla.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { canImportBackup, MediaDeletionConfirm, PreviewSummary } from '../../../src/presentation/web/pages/BackupPage.tsx';

const preview = (mediaToDeleteCount?: number) =>
  ({
    sourceSchemaVersion: '3.1.0',
    fileDigest: 'x',
    counts: { pets: 2, weights: 0, bodyMeasurements: 0, vaccinations: 0, dewormings: 0, medicalVisits: 0, customParameters: 0 },
    collisions: { petsReplacedCount: 2, sameIdPetsCount: 2 },
    affectedSharedPets: { petsCount: 0, householdsCount: 0 },
    ...(mediaToDeleteCount === undefined ? {} : { mediaToDeleteCount }),
  }) as never;

describe('T604 aviso de eliminación de medios en la importación (D-15 A)', () => {
  it('[SC-CAT-031][REQ-IMP-001] con N > 0 la vista previa muestra el aviso con el recuento (singular y plural)', () => {
    expect(renderToStaticMarkup(h(PreviewSummary, { preview: preview(3) }))).toContain('Los archivos y fotos no van en el respaldo y se eliminarán: 3 elementos');
    expect(renderToStaticMarkup(h(PreviewSummary, { preview: preview(1) }))).toContain('Los archivos y fotos no van en el respaldo y se eliminarán: 1 elemento');
  });

  it('[SC-CAT-031] con 0 o sin el campo no hay aviso', () => {
    expect(renderToStaticMarkup(h(PreviewSummary, { preview: preview(0) }))).not.toContain('no van en el respaldo');
    expect(renderToStaticMarkup(h(PreviewSummary, { preview: preview() }))).not.toContain('no van en el respaldo');
  });

  it('[SC-CAT-031] la casilla de confirmación existe solo con N > 0 y refleja si está marcada', () => {
    const unchecked = renderToStaticMarkup(h(MediaDeletionConfirm, { count: 3, checked: false, onChange: () => undefined }));
    expect(unchecked).toContain('type="checkbox"');
    expect(unchecked).not.toContain('checked=""');
    expect(unchecked).toContain('Entiendo que se eliminarán 3 elementos');
    expect(renderToStaticMarkup(h(MediaDeletionConfirm, { count: 3, checked: true, onChange: () => undefined }))).toContain('checked=""');
    expect(renderToStaticMarkup(h(MediaDeletionConfirm, { count: 0, checked: false, onChange: () => undefined }))).toBe('');
  });

  it('[SC-CAT-031][D-15 A] «Importar respaldo» no se habilita con N > 0 sin la confirmación; con N = 0 basta el archivo', () => {
    const file = new File(['{}'], 'respaldo.json');
    expect(canImportBackup({ file, busy: false, preview: preview(3), mediaConfirmed: false })).toBe(false);
    expect(canImportBackup({ file, busy: false, preview: preview(3), mediaConfirmed: true })).toBe(true);
    expect(canImportBackup({ file, busy: false, preview: preview(0), mediaConfirmed: false })).toBe(true);
    expect(canImportBackup({ file, busy: false, preview: null, mediaConfirmed: false })).toBe(true);
    expect(canImportBackup({ file: null, busy: false, preview: preview(0), mediaConfirmed: true })).toBe(false);
    expect(canImportBackup({ file, busy: true, preview: preview(0), mediaConfirmed: true })).toBe(false);
  });
});
