/**
 * Casos de uso que sirve la API, construidos una vez con las dependencias de aplicación (plan §3 y §4).
 *
 * @implements INV-ARCH-004
 */

import { AuthenticateRequestUseCase, GetCurrentSessionUseCase, LoginUseCase, LogoutUseCase, RegisterUserUseCase } from '../../../application/use-cases/auth-use-cases.ts';
import { ExportBackupUseCase, ImportBackupUseCase } from '../../../application/use-cases/backup-use-cases.ts';
import {
  CreateHouseholdUseCase,
  DeleteHouseholdUseCase,
  GetHouseholdPetsUseCase,
  GetHouseholdUseCase,
  InviteMemberUseCase,
  LeaveHouseholdUseCase,
  ListMyHouseholdsUseCase,
  ListMyInvitationsUseCase,
  RemoveMemberUseCase,
  RespondInvitationUseCase,
} from '../../../application/use-cases/household-use-cases.ts';
import { DeletePetUseCase, GetPetDashboardUseCase, ListMyPetsUseCase, RegisterPetUseCase, UpdatePetUseCase } from '../../../application/use-cases/pet-use-cases.ts';
import {
  AddBodyMeasurementUseCase,
  AddCustomParameterUseCase,
  AddDewormingUseCase,
  AddMedicalVisitUseCase,
  AddVaccinationUseCase,
  AddWeightRecordUseCase,
} from '../../../application/use-cases/record-use-cases.ts';
import type { ApplicationDeps } from '../../../application/use-cases/use-case-support.ts';

export function createUseCases(deps: ApplicationDeps) {
  return {
    register: new RegisterUserUseCase(deps),
    login: new LoginUseCase(deps),
    logout: new LogoutUseCase(deps),
    authenticate: new AuthenticateRequestUseCase(deps),
    currentSession: new GetCurrentSessionUseCase(deps),
    registerPet: new RegisterPetUseCase(deps),
    updatePet: new UpdatePetUseCase(deps),
    deletePet: new DeletePetUseCase(deps),
    listMyPets: new ListMyPetsUseCase(deps),
    petDashboard: new GetPetDashboardUseCase(deps),
    addWeight: new AddWeightRecordUseCase(deps),
    addBodyMeasurement: new AddBodyMeasurementUseCase(deps),
    addVaccination: new AddVaccinationUseCase(deps),
    addDeworming: new AddDewormingUseCase(deps),
    addMedicalVisit: new AddMedicalVisitUseCase(deps),
    addCustomParameter: new AddCustomParameterUseCase(deps),
    createHousehold: new CreateHouseholdUseCase(deps),
    inviteMember: new InviteMemberUseCase(deps),
    listMyInvitations: new ListMyInvitationsUseCase(deps),
    respondInvitation: new RespondInvitationUseCase(deps),
    removeMember: new RemoveMemberUseCase(deps),
    leaveHousehold: new LeaveHouseholdUseCase(deps),
    deleteHousehold: new DeleteHouseholdUseCase(deps),
    listMyHouseholds: new ListMyHouseholdsUseCase(deps),
    getHousehold: new GetHouseholdUseCase(deps),
    householdPets: new GetHouseholdPetsUseCase(deps),
    exportBackup: new ExportBackupUseCase(deps),
    importBackup: new ImportBackupUseCase(deps),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;

export interface RouteContext {
  readonly useCases: UseCases;
  readonly cookieSecure: boolean;
}
