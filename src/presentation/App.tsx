/**
 * Root Presentation Controller and Accessible Application View (App.tsx).
 * Consumes exclusively Application Layer Use Cases and Generated Contract Types [INV-ARCH-004].
 * Prohibits direct business logic or date arithmetic in presentation components.
 *
 * @implements REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-004, REQ-PET-003, REQ-BACKUP-001, REQ-BACKUP-002, STATE-ALERT-001, STATE-PET-QUOTA-001, STATE-BACKUP-001, INV-ARCH-004
 */

import type { ClockPort } from '../application/ports/clock.port.ts';
import type { IdGeneratorPort } from '../application/ports/id-generator.port.ts';
import type { StorageRepositoryPort } from '../application/ports/storage-repository.port.ts';
import {
  ExportBackupUseCase,
  ImportBackupUseCase,
} from '../application/use-cases/backup-use-cases.ts';
import {
  GetPetDashboardUseCase,
  ListPetsOverviewUseCase,
  RegisterPetUseCase,
  UpdatePetUseCase,
} from '../application/use-cases/pet-use-cases.ts';
import {
  AddBodyMeasurementUseCase,
  AddCustomParameterUseCase,
  AddDewormingUseCase,
  AddMedicalVisitUseCase,
  AddVaccinationUseCase,
  AddWeightRecordUseCase,
} from '../application/use-cases/record-use-cases.ts';
import {
  DomainError,
  type BackupTransactionState,
  type PetDashboardView,
  type PetListOverview,
  type ProblemDetails,
} from '../generated/index.ts';
import { renderBackupModalHtml } from './components/BackupModal.tsx';
import {
  renderPetDashboardHtml,
  type ClinicalModuleTab,
} from './components/PetDashboard.tsx';
import { renderPetSelectorBarHtml } from './components/PetSelectorBar.tsx';

/**
 * Deterministic Presentation Controller orchestrating UI state exclusively via Application Use Cases.
 *
 * @implements REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-004, INV-ARCH-004
 */
export class ArgosPresentationController {
  public readonly registerPet: RegisterPetUseCase;
  public readonly updatePet: UpdatePetUseCase;
  public readonly getDashboard: GetPetDashboardUseCase;
  public readonly listOverview: ListPetsOverviewUseCase;
  public readonly addWeight: AddWeightRecordUseCase;
  public readonly addMeasurement: AddBodyMeasurementUseCase;
  public readonly addVaccination: AddVaccinationUseCase;
  public readonly addDeworming: AddDewormingUseCase;
  public readonly addVisit: AddMedicalVisitUseCase;
  public readonly addCustomParam: AddCustomParameterUseCase;
  public readonly exportBackup: ExportBackupUseCase;
  public readonly importBackup: ImportBackupUseCase;

  private activePetId: string | null = null;
  private activeModuleTab: ClinicalModuleTab = 'WEIGHTS';
  private lastExportedJson: string | null = null;
  private lastBackupError: ProblemDetails | null = null;

  constructor(
    repository: StorageRepositoryPort,
    clock: ClockPort,
    idGenerator: IdGeneratorPort
  ) {
    this.registerPet = new RegisterPetUseCase(repository, clock, idGenerator);
    this.updatePet = new UpdatePetUseCase(repository, clock);
    this.getDashboard = new GetPetDashboardUseCase(repository, clock);
    this.listOverview = new ListPetsOverviewUseCase(repository, clock);
    this.addWeight = new AddWeightRecordUseCase(repository, clock, idGenerator);
    this.addMeasurement = new AddBodyMeasurementUseCase(repository, clock, idGenerator);
    this.addVaccination = new AddVaccinationUseCase(repository, clock, idGenerator);
    this.addDeworming = new AddDewormingUseCase(repository, clock, idGenerator);
    this.addVisit = new AddMedicalVisitUseCase(repository, clock, idGenerator);
    this.addCustomParam = new AddCustomParameterUseCase(repository, clock, idGenerator);
    this.exportBackup = new ExportBackupUseCase(repository, clock);
    this.importBackup = new ImportBackupUseCase(repository, clock);
  }

  public selectPet(petId: string): void {
    // Verify existence through use case before switching active tab
    this.getDashboard.execute(petId);
    this.activePetId = petId;
  }

  public selectModuleTab(tab: ClinicalModuleTab): void {
    this.activeModuleTab = tab;
  }

  public getActivePetId(): string | null {
    const overview = this.listOverview.execute();
    if (this.activePetId && overview.pets.some((p) => p.profile.id === this.activePetId)) {
      return this.activePetId;
    }
    const firstId = overview.pets[0]?.profile.id ?? null;
    this.activePetId = firstId;
    return firstId;
  }

  public triggerExportBackup(): string {
    const { jsonString } = this.exportBackup.execute();
    this.lastExportedJson = jsonString;
    this.lastBackupError = null;
    return jsonString;
  }

  public triggerImportBackup(rawJson: string): boolean {
    try {
      this.importBackup.execute(rawJson);
      this.lastBackupError = null;
      const overview = this.listOverview.execute();
      this.activePetId = overview.pets[0]?.profile.id ?? null;
      return true;
    } catch (err) {
      if (err instanceof DomainError) {
        this.lastBackupError = err.toProblemDetails();
      }
      return false;
    }
  }

  public getBackupState(): BackupTransactionState {
    return this.importBackup.getState();
  }

  public getLastBackupError(): ProblemDetails | null {
    return this.lastBackupError;
  }

  /**
   * Renders the full responsive, WCAG 2.1 AA compliant HTML document/view for the current state.
   *
   * @implements REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-004
   */
  public renderAppHtml(viewportWidth = 1280): string {
    const overview: PetListOverview = this.listOverview.execute();
    const resolvedPetId = this.getActivePetId();
    const layoutClass = viewportWidth < 640 ? 'mobile-single-column' : 'desktop-multi-column';

    const selectorHtml = renderPetSelectorBarHtml({
      overview,
      activePetId: resolvedPetId ?? '',
    });

    let dashboardHtml = `<div class="p-6 text-slate-800">No hay mascotas registradas.</div>`;
    if (resolvedPetId) {
      const dashboardData: PetDashboardView = this.getDashboard.execute(resolvedPetId);
      dashboardHtml = renderPetDashboardHtml(dashboardData, this.activeModuleTab);
    }

    const backupHtml = renderBackupModalHtml({
      transactionState: this.importBackup.getState(),
      lastExportedJson: this.lastExportedJson,
      lastError: this.lastBackupError,
    });

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Argos — Expediente Clínico y Biométrico de Mascotas</title>
</head>
<body class="bg-slate-100 text-slate-900 min-h-screen ${layoutClass}" data-viewport-width="${viewportWidth}">
  <header class="bg-slate-900 text-white px-6 py-4">
    <h1 class="text-xl font-bold">Argos — Pet Health &amp; Biometric Tracker</h1>
  </header>
  ${selectorHtml}
  <main id="main-content" class="max-w-7xl mx-auto p-4 sm:p-6">
    ${dashboardHtml}
    ${backupHtml}
  </main>
</body>
</html>`;
  }
}
