/**
 * Cliente HTTP del Modo Cuidador (Feature 012, Bloque C, #26; T1656; `care.openapi.yaml`). `fetch` propio, como `co-ownership-api.ts`: las formas de las respuestas se declaran aquí (la capa de
 * presentación solo admite módulos concretos de `generated/`). Toda petición lleva `X-Argos-Request` y notifica la actividad (INV-AUTH2-002). El texto de un error sale de su código: la interfaz NO
 * repite datos del servidor (ni la dosis de una fila sustituida) y un 404 de cuidado es siempre «no encontrada».
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-008, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';

export type CareKind = 'MEDICATION' | 'MEAL' | 'WALK' | 'OTHER';
export type DoseUnit = 'MG' | 'MCG' | 'ML' | 'IU' | 'TABLET' | 'DROP';
export type OccurrenceState = 'PENDING' | 'DONE' | 'SKIPPED' | 'OVERDUE';
export type CaregiverLevel = 'VIEW_ONLY' | 'BASIC_LOG';

export interface CareRoutineView {
  readonly id: string;
  readonly seriesId: string;
  readonly kind: CareKind;
  readonly title: string;
  readonly instructions: string;
  readonly doseAmount: number | null;
  readonly doseUnit: DoseUnit | null;
  readonly timesOfDay: readonly string[];
  readonly daysOfWeek: readonly number[];
  readonly startDate: string;
  readonly endDate: string | null;
  readonly ongoing: boolean;
  readonly active: boolean;
  readonly effectiveTo: string | null;
  readonly version: number;
}
export interface CareLogEntryView {
  readonly id: string;
  readonly status: 'DONE' | 'SKIPPED';
  readonly late: boolean;
  readonly performedAt: string;
  readonly performedByDisplayName: string | null;
  readonly performedByMe: boolean;
  readonly note: string;
  readonly revertedAt: string | null;
}
export interface CareOccurrenceView {
  readonly routineId: string;
  readonly kind: CareKind;
  readonly title: string;
  readonly doseAmount: number | null;
  readonly doseUnit: DoseUnit | null;
  readonly instructions: string | null;
  readonly occurrenceDate: string;
  readonly occurrenceTime: string;
  readonly state: OccurrenceState;
  readonly logEntry: CareLogEntryView | null;
}
export interface CareTodayView {
  readonly date: string;
  readonly timezone: string;
  readonly graceMinutes: number;
  readonly items: readonly CareOccurrenceView[];
}
export interface MyCareAccessView {
  readonly petId: string;
  readonly caregiver: boolean;
  readonly level: CaregiverLevel | null;
  readonly defaultedToViewOnly: boolean;
  readonly careUntil: string | null;
  readonly canViewRoutines: boolean;
  readonly canLogCare: boolean;
  readonly canManageRoutines: boolean;
  readonly clinicalPermissionsUnchanged: boolean;
}
export interface CaregiverAccessView {
  readonly userId: string;
  readonly username: string;
  readonly level: CaregiverLevel;
  readonly careUntil: string | null;
  readonly expired: boolean;
  readonly version: number;
}
export interface RoutineInput {
  readonly kind?: CareKind;
  readonly title: string;
  readonly instructions: string;
  readonly doseAmount: number | null;
  readonly doseUnit: DoseUnit | null;
  readonly timesOfDay: readonly string[];
  readonly daysOfWeek: readonly number[];
  readonly startDate: string;
  readonly endDate: string | null;
  readonly ongoing: boolean;
  readonly confirmHighDose?: boolean;
  readonly expectedVersion?: number;
}
export interface RoutineWriteResult {
  readonly routine: CareRoutineView;
  readonly versioned: boolean;
}
export interface ConflictInfo {
  readonly performedByDisplayName: string;
  readonly performedAt: string;
  readonly status: 'DONE' | 'SKIPPED';
}

export const UNEXPECTED_CARE_CODE = 'ERR-INTERNAL-UNEXPECTED';
export class CareApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly field: string | null = null,
    public readonly existing: ConflictInfo | null = null,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = 'CareApiError';
  }
}

/** Texto de la interfaz por código; lo desconocido cae al genérico (sin detalle del servidor, sin datos de filas ajenas). */
export function careProblemMessage(code: string, field: string | null = null, retryAfterSeconds: number | null = null): string {
  switch (code) {
    case 'ERR-ACC-FORBIDDEN':
      return 'Tu acceso actual no permite esta acción. Si crees que es un error, pídele al propietario que revise tu nivel.';
    case 'ERR-PET-NOT-FOUND':
      return 'No encontramos eso o ya no tienes acceso.';
    case 'ERR-RATE-LIMITED': {
      const minutes = retryAfterSeconds === null ? null : Math.max(1, Math.ceil(retryAfterSeconds / 60));
      return `Hiciste muchos cambios seguidos. ${minutes === null ? 'Espera un momento' : `Espera unos ${minutes} min`} e inténtalo de nuevo.`;
    }
    case 'ERR-CAR12-ROUTINE-STALE':
      return 'Esta rutina cambió mientras la editabas, o ya no está vigente. Recargamos la lista: revisa la dosis y el horario antes de guardar de nuevo.';
    case 'ERR-CAR12-ROUTINE-LIMIT':
      return 'La mascota ya tiene el máximo de 20 rutinas activas. Desactiva alguna para crear otra.';
    case 'ERR-CAR12-OUT-OF-WINDOW':
      return 'Solo se pueden registrar las últimas 24 horas, y una toma futura no se registra como hecha.';
    case 'ERR-CAR12-ALREADY-LOGGED':
      return 'Esa ocurrencia ya fue registrada.';
    case 'ERR-SCHEMA-VALIDATION-FAILED':
      return field === 'confirmHighDose'
        ? 'La dosis escrita es mayor de lo habitual. Confírmala marcando la casilla si es la indicada por tu veterinario.'
        : field === 'note'
          ? 'Escribe una nota (hasta 140 caracteres): al omitir una medicina es obligatoria.'
          : field === 'reason'
            ? 'Escribe el motivo de la reversión (obligatorio pasados 10 minutos).'
            : 'Revisa los datos: no se pudo enviar tal como está.';
    default:
      return 'No pudimos completar la acción. Inténtalo de nuevo.';
  }
}

export interface CareApi {
  myAccess(petId: string): Promise<MyCareAccessView>;
  today(petId: string): Promise<CareTodayView>;
  listRoutines(petId: string): Promise<CareRoutineView[]>;
  createRoutine(petId: string, input: RoutineInput): Promise<CareRoutineView>;
  updateRoutine(petId: string, routineId: string, input: RoutineInput): Promise<RoutineWriteResult>;
  deactivateRoutine(petId: string, routineId: string, expectedVersion: number): Promise<CareRoutineView>;
  logEntry(petId: string, body: { routineId: string; occurrenceDate: string; occurrenceTime: string; status: 'DONE' | 'SKIPPED'; note?: string }): Promise<{ entry: CareLogEntryView; created: boolean }>;
  revertEntry(petId: string, entryId: string, reason?: string): Promise<CareLogEntryView>;
  listAccess(petId: string): Promise<CaregiverAccessView[]>;
  setAccess(petId: string, userId: string, body: { level: CaregiverLevel; careUntil: string | null; expectedVersion?: number }): Promise<CaregiverAccessView>;
  removeAccess(petId: string, userId: string): Promise<void>;
}

export function createCareApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): CareApi {
  async function send(path: string, method: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { 'X-Argos-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new CareApiError(UNEXPECTED_CARE_CODE, 0);
    }
    if (!response.ok) {
      let code = UNEXPECTED_CARE_CODE;
      let field: string | null = null;
      let existing: ConflictInfo | null = null;
      try {
        const problem = (await response.json()) as { code?: unknown; field?: unknown; existing?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
        if (typeof problem.field === 'string') field = problem.field;
        if (typeof problem.existing === 'object' && problem.existing !== null) existing = problem.existing as ConflictInfo;
      } catch {
        // cuerpo no JSON: error del transporte
      }
      const retry = Number(response.headers.get('retry-after'));
      throw new CareApiError(code, response.status, field, existing, Number.isFinite(retry) && retry > 0 ? retry : null);
    }
    notifyActivity();
    return response;
  }
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const enc = encodeURIComponent;
  const care = (petId: string): string => `/pets/${enc(petId)}/care`;
  return {
    async myAccess(petId) {
      return json<MyCareAccessView>(await send(`${care(petId)}/access/me`, 'GET'));
    },
    async today(petId) {
      return json<CareTodayView>(await send(`${care(petId)}/today`, 'GET'));
    },
    async listRoutines(petId) {
      return (await json<{ items: CareRoutineView[] }>(await send(`${care(petId)}/routines`, 'GET'))).items;
    },
    async createRoutine(petId, input) {
      return json<CareRoutineView>(await send(`${care(petId)}/routines`, 'POST', input));
    },
    async updateRoutine(petId, routineId, input) {
      return json<RoutineWriteResult>(await send(`${care(petId)}/routines/${enc(routineId)}`, 'PATCH', input));
    },
    async deactivateRoutine(petId, routineId, expectedVersion) {
      return json<CareRoutineView>(await send(`${care(petId)}/routines/${enc(routineId)}/deactivate`, 'POST', { expectedVersion }));
    },
    async logEntry(petId, body) {
      const response = await send(`${care(petId)}/log`, 'POST', body);
      return { entry: await json<CareLogEntryView>(response), created: response.status === 201 };
    },
    async revertEntry(petId, entryId, reason) {
      return json<CareLogEntryView>(await send(`${care(petId)}/log/${enc(entryId)}/revert`, 'POST', reason === undefined ? {} : { reason }));
    },
    async listAccess(petId) {
      return (await json<{ items: CaregiverAccessView[] }>(await send(`${care(petId)}/access`, 'GET'))).items;
    },
    async setAccess(petId, userId, body) {
      return json<CaregiverAccessView>(await send(`${care(petId)}/access/${enc(userId)}`, 'PUT', body));
    },
    async removeAccess(petId, userId) {
      await send(`${care(petId)}/access/${enc(userId)}`, 'DELETE');
    },
  };
}
