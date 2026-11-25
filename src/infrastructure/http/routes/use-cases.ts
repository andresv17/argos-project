/**
 * Casos de uso que sirve la API, construidos una vez con las dependencias de aplicación.
 *
 * @implements INV-ARCH-004
 */

import { GetAdminAboutUseCase, GetPublicAboutPhotoUseCase, GetPublicAboutUseCase, PutAboutPhotoUseCase, UpdateAboutTextUseCase } from '../../../application/use-cases/about-use-cases.ts';
import {
  ChangeAdminDelegateRoleUseCase,
  DisableAdminDelegateUseCase,
  InviteAdminDelegateUseCase,
  ListAdminDelegatesUseCase,
  ReactivateAdminDelegateUseCase,
  ReinviteAdminDelegateUseCase,
  type AdminDelegateLimits,
} from '../../../application/use-cases/admin-delegate-use-cases.ts';
import { AuthenticateAdminUseCase, CompleteAdminGoogleLoginUseCase, EndAdminSessionUseCase, StartAdminGoogleLoginUseCase } from '../../../application/use-cases/admin-use-cases.ts';
import { ListAdminParametersUseCase, ResetAdminSceneQuotaUseCase, UpdateAdminParameterUseCase } from '../../../application/use-cases/admin-parameter-use-cases.ts';
import { CountPendingRegistrationsUseCase, DecideRegistrationUseCase, ListPendingRegistrationsUseCase } from '../../../application/use-cases/admin-registration-use-cases.ts';
import { ChangePasswordUseCase, DeleteAccountUseCase, UpdateProfileUseCase } from '../../../application/use-cases/account-use-cases.ts';
import { DeleteAccountWithGoogleUseCase, StartAccountDeletionReauthUseCase } from '../../../application/use-cases/account-google-deletion-use-cases.ts';
import { DeleteAvatarUseCase, GetAvatarUseCase, PutAvatarUseCase } from '../../../application/use-cases/avatar-use-cases.ts';
import { AssignPetToHouseholdUseCase, ListPetAssignmentsUseCase, UnassignPetFromHouseholdUseCase } from '../../../application/use-cases/assignment-use-cases.ts';
import { AuthenticateRequestUseCase, GetCurrentSessionUseCase, LoginUseCase, LogoutUseCase, RegisterUserUseCase } from '../../../application/use-cases/auth-use-cases.ts';
import { ChooseGoogleUsernameUseCase, CompleteGoogleLoginUseCase, StartGoogleLinkUseCase, StartGoogleLoginUseCase } from '../../../application/use-cases/google-auth-use-cases.ts';
import { ExportBackupUseCase, ImportBackupUseCase, PreviewBackupImportUseCase } from '../../../application/use-cases/backup-use-cases.ts';
import {
  CancelHouseholdInvitationUseCase,
  ChangeMemberRoleUseCase,
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
  SearchInviteesUseCase,
  TransferHouseholdOwnershipUseCase,
} from '../../../application/use-cases/household-use-cases.ts';
import { DeleteMediaUseCase, GetAlbumLimitsUseCase, GetMediaAccessUseCase, ListMediaUseCase, UploadMediaUseCase } from '../../../application/use-cases/media-use-cases.ts';
import { GetSceneNoticeUseCase, GrantSceneConsentUseCase, RevokeSceneConsentUseCase } from '../../../application/use-cases/scene-consent-use-cases.ts';
import { DeleteHouseholdPhotoUseCase, GetHouseholdPhotoUseCase, PutHouseholdPhotoUseCase } from '../../../application/use-cases/scene-photo-use-cases.ts';
import { GetSceneImageUseCase, GetSceneUseCase, RequestSceneGenerationUseCase } from '../../../application/use-cases/scene-use-cases.ts';
import { CreateShareLinkUseCase, ListShareLinksUseCase, RevokeShareLinkUseCase } from '../../../application/use-cases/share-link-use-cases.ts';
import { GetSharedFileUseCase, GetSharedSummaryUseCase, PreviewClinicalSummaryUseCase } from '../../../application/use-cases/shared-view-use-cases.ts';
import { TransferPetOwnershipUseCase } from '../../../application/use-cases/ownership-use-cases.ts';
import { DeletePetUseCase, GetPetDashboardUseCase, ListMyPetsUseCase, RegisterPetUseCase, UpdatePetUseCase } from '../../../application/use-cases/pet-use-cases.ts';
import {
  AddBodyMeasurementUseCase,
  AddCustomParameterUseCase,
  AddDewormingUseCase,
  AddMedicalVisitUseCase,
  AddVaccinationUseCase,
  AddWeightRecordUseCase,
  DeleteRecordUseCase,
  UpdateRecordUseCase,
} from '../../../application/use-cases/record-use-cases.ts';
import { ADMIN_DELEGATE_ACTIVE_LIMIT, ADMIN_DELEGATE_INVITATION_TTL_HOURS, ADMIN_DELEGATE_ROW_LIMIT } from '../../config/app-config.ts';
import { INVITEE_SEARCH_LIMITS } from '../../config/invitee-search-config.ts';
import { InviteeSearchRateLimiter } from '../invitee-search-rate-limit.ts';
import type { ApplicationDeps } from '../../../application/use-cases/use-case-support.ts';

/** Cifras de los delegados de `/admin` (feature 011, INV-ARCH-006): viven solo en `app-config.ts` y la composición las inyecta a la capa de aplicación. */
const ADMIN_DELEGATE_LIMITS: AdminDelegateLimits = {
  activeLimit: ADMIN_DELEGATE_ACTIVE_LIMIT,
  invitationTtlHours: ADMIN_DELEGATE_INVITATION_TTL_HOURS,
  rowLimit: ADMIN_DELEGATE_ROW_LIMIT,
};

export function createUseCases(deps: ApplicationDeps) {
  return {
    register: new RegisterUserUseCase(deps),
    login: new LoginUseCase(deps),
    logout: new LogoutUseCase(deps),
    authenticate: new AuthenticateRequestUseCase(deps),
    currentSession: new GetCurrentSessionUseCase(deps),
    googleStart: new StartGoogleLoginUseCase(deps),
    googleComplete: new CompleteGoogleLoginUseCase(deps),
    googleChooseUsername: new ChooseGoogleUsernameUseCase(deps),
    googleLink: new StartGoogleLinkUseCase(deps),
    adminStart: new StartAdminGoogleLoginUseCase(deps),
    adminComplete: new CompleteAdminGoogleLoginUseCase(deps),
    adminAuthenticate: new AuthenticateAdminUseCase(deps),
    adminEnd: new EndAdminSessionUseCase(deps),
    adminListDelegates: new ListAdminDelegatesUseCase(deps, ADMIN_DELEGATE_LIMITS),
    adminInviteDelegate: new InviteAdminDelegateUseCase(deps, ADMIN_DELEGATE_LIMITS),
    adminChangeDelegateRole: new ChangeAdminDelegateRoleUseCase(deps, ADMIN_DELEGATE_LIMITS),
    adminDisableDelegate: new DisableAdminDelegateUseCase(deps, ADMIN_DELEGATE_LIMITS),
    adminReactivateDelegate: new ReactivateAdminDelegateUseCase(deps, ADMIN_DELEGATE_LIMITS),
    adminReinviteDelegate: new ReinviteAdminDelegateUseCase(deps, ADMIN_DELEGATE_LIMITS),
    adminPendingCount: new CountPendingRegistrationsUseCase(deps),
    adminListRegistrations: new ListPendingRegistrationsUseCase(deps),
    adminDecideRegistration: new DecideRegistrationUseCase(deps),
    adminListParameters: new ListAdminParametersUseCase(deps),
    adminUpdateParameter: new UpdateAdminParameterUseCase(deps),
    adminResetSceneQuota: new ResetAdminSceneQuotaUseCase(deps),
    getPublicAbout: new GetPublicAboutUseCase(deps),
    getPublicAboutPhoto: new GetPublicAboutPhotoUseCase(deps),
    getAdminAbout: new GetAdminAboutUseCase(deps),
    updateAboutText: new UpdateAboutTextUseCase(deps),
    putAboutPhoto: new PutAboutPhotoUseCase(deps),
    changePassword: new ChangePasswordUseCase(deps),
    updateProfile: new UpdateProfileUseCase(deps),
    deleteAccount: new DeleteAccountUseCase(deps),
    startAccountDeletionReauth: new StartAccountDeletionReauthUseCase(deps),
    deleteAccountWithGoogle: new DeleteAccountWithGoogleUseCase(deps),
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
    updateRecord: new UpdateRecordUseCase(deps),
    deleteRecord: new DeleteRecordUseCase(deps),
    createHousehold: new CreateHouseholdUseCase(deps),
    inviteMember: new InviteMemberUseCase(deps),
    cancelInvitation: new CancelHouseholdInvitationUseCase(deps),
    searchInvitees: new SearchInviteesUseCase(deps, new InviteeSearchRateLimiter(() => Date.parse(deps.clock.nowIsoTimestamp()), INVITEE_SEARCH_LIMITS)),
    listMyInvitations: new ListMyInvitationsUseCase(deps),
    respondInvitation: new RespondInvitationUseCase(deps),
    removeMember: new RemoveMemberUseCase(deps),
    changeMemberRole: new ChangeMemberRoleUseCase(deps),
    transferHouseholdOwnership: new TransferHouseholdOwnershipUseCase(deps),
    leaveHousehold: new LeaveHouseholdUseCase(deps),
    deleteHousehold: new DeleteHouseholdUseCase(deps),
    listMyHouseholds: new ListMyHouseholdsUseCase(deps),
    getHousehold: new GetHouseholdUseCase(deps),
    householdPets: new GetHouseholdPetsUseCase(deps),
    listPetAssignments: new ListPetAssignmentsUseCase(deps),
    assignPetToHousehold: new AssignPetToHouseholdUseCase(deps),
    unassignPetFromHousehold: new UnassignPetFromHouseholdUseCase(deps),
    transferPetOwnership: new TransferPetOwnershipUseCase(deps),
    exportBackup: new ExportBackupUseCase(deps),
    previewBackupImport: new PreviewBackupImportUseCase(deps),
    importBackup: new ImportBackupUseCase(deps),
    uploadMedia: new UploadMediaUseCase(deps),
    listMedia: new ListMediaUseCase(deps),
    albumLimits: new GetAlbumLimitsUseCase(deps),
    mediaAccess: new GetMediaAccessUseCase(deps),
    deleteMedia: new DeleteMediaUseCase(deps),
    putAvatar: new PutAvatarUseCase(deps),
    getAvatar: new GetAvatarUseCase(deps),
    deleteAvatar: new DeleteAvatarUseCase(deps),
    createShareLink: new CreateShareLinkUseCase(deps),
    listShareLinks: new ListShareLinksUseCase(deps),
    revokeShareLink: new RevokeShareLinkUseCase(deps),
    previewSummary: new PreviewClinicalSummaryUseCase(deps),
    sharedSummary: new GetSharedSummaryUseCase(deps),
    sharedFile: new GetSharedFileUseCase(deps),
    getScene: new GetSceneUseCase(deps),
    requestScene: new RequestSceneGenerationUseCase(deps),
    getSceneImage: new GetSceneImageUseCase(deps),
    putHouseholdPhoto: new PutHouseholdPhotoUseCase(deps),
    getHouseholdPhoto: new GetHouseholdPhotoUseCase(deps),
    deleteHouseholdPhoto: new DeleteHouseholdPhotoUseCase(deps),
    sceneNotice: new GetSceneNoticeUseCase(deps),
    grantSceneConsent: new GrantSceneConsentUseCase(deps),
    revokeSceneConsent: new RevokeSceneConsentUseCase(deps),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;

export interface RouteContext {
  readonly useCases: UseCases;
  readonly cookieSecure: boolean;
  /** Base pública de los enlaces, solo de configuración (REQ-TIP10-004, EDGE-010-012); nunca de la petición. */
  readonly publicBaseUrl: string;
}
