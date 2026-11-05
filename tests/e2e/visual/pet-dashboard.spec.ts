import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DeterministicIdAdapter,
  FixedClockAdapter,
} from '../../../src/infrastructure/adapters/deterministic-adapters.ts';
import { InMemoryTransactionalRepository } from '../../../src/infrastructure/storage/transactional-repository.ts';
import { ArgosPresentationController } from '../../../src/presentation/App.tsx';

const canonicalFixturesRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'contracts/examples/canonical-fixtures.json'), 'utf8')
);

function createPopulatedController(): ArgosPresentationController {
  const repo = new InMemoryTransactionalRepository();
  const clock = new FixedClockAdapter(
    canonicalFixturesRaw.referenceClock.todayIsoDate,
    canonicalFixturesRaw.referenceClock.nowIsoTimestamp
  );
  const idGen = new DeterministicIdAdapter();
  const controller = new ArgosPresentationController(repo, clock, idGen);
  controller.triggerImportBackup(JSON.stringify(canonicalFixturesRaw.validBackupEnvelope));
  return controller;
}

describe('E2E Visual & Functional Flow: 4-Pet Selector, Isolated Dashboards & Sanitary Traffic Light [REQ-UI-001..003, STATE-ALERT-001, STATE-PET-QUOTA-001]', () => {
  it('[REQ-UI-001][STATE-PET-QUOTA-001] renderiza las 4 mascotas en el selector rápido con indicador FULL_QUOTA (2/2 Perros, 2/2 Gatos)', () => {
    const controller = createPopulatedController();
    const html = controller.renderAppHtml(1280);

    expect(html).toContain('data-quota-state="FULL_QUOTA"');
    expect(html).toContain('data-dogs-quota="2/2"');
    expect(html).toContain('data-cats-quota="2/2"');
    expect(html).toContain('Cupo Completo (4/4)');
    expect(html).toContain('Argos');
    expect(html).toContain('Kira');
    expect(html).toContain('Nyx');
    expect(html).toContain('Milo');
  });

  it('[REQ-UI-002][REQ-PET-003] alterna entre mascotas mostrando exclusivamente los registros del activePetId y graficando evolución de peso en SVG', () => {
    const controller = createPopulatedController();

    // Mascota 1 por defecto: Argos (id 11111111-1111-4111-8111-111111111101)
    const argosHtml = controller.renderAppHtml(1280);
    expect(argosHtml).toContain('data-active-pet-id="11111111-1111-4111-8111-111111111101"');
    expect(argosHtml).toContain('Séxtuple Canina');
    expect(argosHtml).toContain('+0.45 kg');
    expect(argosHtml).toContain('<svg role="img" aria-label="Gráfica de evolución de peso en kilogramos"');
    // No debe mezclar registros de Nyx (Triple Felina) ni de Milo (Dra. Sofía Méndez)
    expect(argosHtml).not.toContain('Triple Felina');
    expect(argosHtml).not.toContain('Dra. Sofía Méndez');

    // Cambiar a Nyx (Gata con vacuna vencida OVERDUE)
    controller.selectPet('11111111-1111-4111-8111-111111111103');
    const nyxHtml = controller.renderAppHtml(1280);
    expect(nyxHtml).toContain('data-active-pet-id="11111111-1111-4111-8111-111111111103"');
    expect(nyxHtml).toContain('Triple Felina');
    expect(nyxHtml).not.toContain('Séxtuple Canina');
  });

  it('[REQ-UI-003][STATE-ALERT-001] muestra el semáforo visual exacto: DUE_SOON (WARNING_AMBER), OVERDUE (DANGER_RED) y UP_TO_DATE (SUCCESS_GREEN)', () => {
    const controller = createPopulatedController();

    // Argos tiene Séxtuple Canina a 7 días -> DUE_SOON / WARNING_AMBER
    const argosHtml = controller.renderAppHtml(1280);
    expect(argosHtml).toContain('data-alert-status="DUE_SOON"');
    expect(argosHtml).toContain('data-ui-badge="WARNING_AMBER"');
    expect(argosHtml).toContain('Próxima a vencer (7d restantes)');

    // Kira tiene NexGard Spectra a +26 días -> UP_TO_DATE / SUCCESS_GREEN
    controller.selectPet('11111111-1111-4111-8111-111111111102');
    const kiraHtml = controller.renderAppHtml(1280);
    expect(kiraHtml).toContain('data-alert-status="UP_TO_DATE"');
    expect(kiraHtml).toContain('data-ui-badge="SUCCESS_GREEN"');
    expect(kiraHtml).toContain('Al día (+26d)');

    // Nyx tiene Triple Felina vencida hace 35 días -> OVERDUE / DANGER_RED
    controller.selectPet('11111111-1111-4111-8111-111111111103');
    const nyxHtml = controller.renderAppHtml(1280);
    expect(nyxHtml).toContain('data-alert-status="OVERDUE"');
    expect(nyxHtml).toContain('data-ui-badge="DANGER_RED"');
    expect(nyxHtml).toContain('Vencida (35d de retraso)');
  });

  it('[REQ-BACKUP-001][REQ-BACKUP-002][STATE-BACKUP-001] exporta JSON e informa errores ERR-BACKUP-* en el modal manteniendo el estado intacto', () => {
    const controller = createPopulatedController();
    const exportedJson = controller.triggerExportBackup();
    expect(exportedJson).toContain('"schemaVersion": "1.0.0"');

    const ok = controller.triggerImportBackup('{ invalid json');
    expect(ok).toBe(false);
    expect(controller.getBackupState()).toBe('ROLLED_BACK');
    expect(controller.getLastBackupError()?.code).toBe('ERR-BACKUP-MALFORMED-JSON');

    const htmlAfterFailedImport = controller.renderAppHtml(1280);
    expect(htmlAfterFailedImport).toContain('data-error-code="ERR-BACKUP-MALFORMED-JSON"');
    expect(htmlAfterFailedImport).toContain('data-quota-state="FULL_QUOTA"');
  });
});
