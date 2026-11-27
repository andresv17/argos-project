/**
 * Rutas del Modo Cuidador (Feature 012, Bloque C, #26; T1656; `contracts/openapi/care.openapi.yaml`): rutinas (`/pets/{petId}/care/routines`), pendientes del día
 * (`/pets/{petId}/care/today`, `/households/{householdId}/care/today`), registro de cumplimiento (`/pets/{petId}/care/log`, `.../{entryId}/revert`) y niveles de cuidador
 * (`/pets/{petId}/care/access`). Toda ruta exige sesión (CSRF antes, en el plugin global); la potestad y el 404 uniforme los resuelve el caso de uso (orden D-A).
 * TODA respuesta autenticada lleva `Cache-Control: private, no-store` y `Vary: Cookie` (T-C13). Tres cubos de límite en esta capa (R-3, H-C1): 120/h registros, 60/h rutinas y niveles, 30/h
 * reversiones; el exceso es `429 ERR-RATE-LIMITED` con `Retry-After`, y el cupo se consume tras la potestad (gancho `afterAuthorization` del caso de uso). Los casos de uso no llevan contador.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-006, REQ-CAR12-008, SC-012-025, SC-012-026, SC-012-030, ERR-RATE-LIMITED
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { DomainError } from '../../../generated/index.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { CareRateLimiter, CareRateScope } from '../care-rate-limit.ts';
import { jsonBody } from '../request-input.ts';
import type { RouteContext } from './use-cases.ts';

type PetParams = { Params: { petId: string } };
type RoutineParams = { Params: { petId: string; routineId: string } };
type EntryParams = { Params: { petId: string; entryId: string } };
type AccessParams = { Params: { petId: string; userId: string } };
type HouseholdParams = { Params: { householdId: string } };

const invalid = (field: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', undefined, field);

/** Cuerpo JSON de objeto; ausente o de otro tipo es 422 (los campos los valida el caso de uso). */
function objectBody(raw: unknown, optional = false): Record<string, unknown> {
  const body = jsonBody(raw);
  if (body === undefined && optional) return {};
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('body');
  return body as Record<string, unknown>;
}

function booleanQuery(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw invalid(field);
}

/** @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-006, ERR-RATE-LIMITED */
export function registerCareRoutes(app: FastifyInstance, { useCases }: RouteContext, limiter: CareRateLimiter): void {
  // Un plugin encapsulado: el gancho `onSend` de caché solo afecta a las rutas del cuidado.
  void app.register(async (scope) => {
    scope.addHook('onSend', async (_request, reply, payload) => {
      reply.header('cache-control', 'private, no-store');
      reply.header('vary', 'Cookie');
      return payload;
    });
    const onRequest = requireSession(useCases.authenticate);
    // R-3 (decisión de Neo 2026-11-27): el cupo se gasta DESPUÉS de sesión, CSRF y potestad; el caso de uso invoca este gancho justo tras la potestad (403 -> cupo -> 404 -> 422 -> 409), de modo que
    // un 403 no gasta cupo ni se ve precedido por un 429, y los 404/422 que ya superaron la potestad sí cuentan.
    const quota = (bucket: CareRateScope, request: FastifyRequest) => (): void => limiter.consume(bucket, request.userId);
    const read = { onRequest };
    const logWrite = read;
    const revertWrite = read;
    const routineWrite = read;

    scope.get<PetParams>('/api/pets/:petId/care/routines', read, async (request) => {
      const includeInactive = booleanQuery((request.query as Record<string, unknown>)['includeInactive'], 'includeInactive');
      return useCases.listCareRoutines.execute(request.userId, request.params.petId, includeInactive === undefined ? {} : { includeInactive });
    });

    scope.post<PetParams>('/api/pets/:petId/care/routines', routineWrite, async (request, reply) => {
      const result = await useCases.createCareRoutine.execute(request.userId, request.params.petId, objectBody(request.body), quota('ROUTINE', request));
      return reply.status(201).send(result);
    });

    scope.get<RoutineParams>('/api/pets/:petId/care/routines/:routineId', read, async (request) => useCases.getCareRoutine.execute(request.userId, request.params.petId, request.params.routineId));

    scope.patch<RoutineParams>('/api/pets/:petId/care/routines/:routineId', routineWrite, async (request, reply) => {
      const result = await useCases.updateCareRoutine.execute(request.userId, request.params.petId, request.params.routineId, objectBody(request.body), quota('ROUTINE', request));
      return reply.status(result['versioned'] === true ? 201 : 200).send(result);
    });

    scope.post<RoutineParams>('/api/pets/:petId/care/routines/:routineId/deactivate', routineWrite, async (request) =>
      useCases.deactivateCareRoutine.execute(request.userId, request.params.petId, request.params.routineId, objectBody(request.body), quota('ROUTINE', request)),
    );

    scope.get<PetParams>('/api/pets/:petId/care/today', read, async (request) => useCases.getPetCareToday.execute(request.userId, request.params.petId));

    scope.get<HouseholdParams>('/api/households/:householdId/care/today', read, async (request) => useCases.getHouseholdCareToday.execute(request.userId, request.params.householdId));

    scope.get<PetParams>('/api/pets/:petId/care/log', read, async (request) => {
      const query = request.query as Record<string, unknown>;
      const text = (name: string): string | undefined => {
        const value = query[name];
        if (value === undefined) return undefined;
        if (typeof value !== 'string') throw invalid(name);
        return value;
      };
      const limitText = text('limit');
      if (limitText !== undefined && !/^[0-9]{1,4}$/.test(limitText)) throw invalid('limit');
      const includeReverted = booleanQuery(query['includeReverted'], 'includeReverted');
      const cursor = text('cursor');
      const routineId = text('routineId');
      const from = text('from');
      const to = text('to');
      return useCases.listCareLog.execute(request.userId, request.params.petId, {
        ...(limitText === undefined ? {} : { limit: Number(limitText) }),
        ...(cursor === undefined ? {} : { cursor }),
        ...(routineId === undefined ? {} : { routineId }),
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(includeReverted === undefined ? {} : { includeReverted }),
      });
    });

    scope.post<PetParams>('/api/pets/:petId/care/log', logWrite, async (request, reply) => {
      const { entry, created } = await useCases.createCareLogEntry.execute(request.userId, request.params.petId, objectBody(request.body), quota('LOG', request));
      return reply.status(created ? 201 : 200).send(entry);
    });

    scope.post<EntryParams>('/api/pets/:petId/care/log/:entryId/revert', revertWrite, async (request) => {
      const { entry } = await useCases.revertCareLogEntry.execute(request.userId, request.params.petId, request.params.entryId, objectBody(request.body, true), quota('REVERT', request));
      return entry;
    });

    scope.get<PetParams>('/api/pets/:petId/care/access', read, async (request) => useCases.listCaregiverAccess.execute(request.userId, request.params.petId));

    scope.get<PetParams>('/api/pets/:petId/care/access/me', read, async (request) => useCases.getMyCareAccess.execute(request.userId, request.params.petId));

    scope.put<AccessParams>('/api/pets/:petId/care/access/:userId', routineWrite, async (request, reply) => {
      const { access, created } = await useCases.setCaregiverAccess.execute(request.userId, request.params.petId, request.params.userId, objectBody(request.body), quota('ROUTINE', request));
      return reply.status(created ? 201 : 200).send(access);
    });

    scope.delete<AccessParams>('/api/pets/:petId/care/access/:userId', routineWrite, async (request, reply) => {
      await useCases.removeCaregiverAccess.execute(request.userId, request.params.petId, request.params.userId, quota('ROUTINE', request));
      return reply.status(204).send();
    });
  });
}
