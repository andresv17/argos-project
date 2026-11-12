/**
 * Rutas `pets` y `records` del OpenAPI. Todas exigen sesión. Un `petId` con formato inválido no existe: el caso de
 * uso responde ERR-PET-NOT-FOUND (404), que es el estado que declara el OpenAPI para estas rutas.
 * `GET /pets?q=` aplica la búsqueda sin mayúsculas ni tildes de REQ-PET-005 (D-03).
 *
 * @implements REQ-REC2-003, REQ-PET-001, REQ-PET-002, REQ-PET-003, REQ-PET-004, REQ-PET-005, REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006
 */

import type { FastifyInstance } from 'fastify';
import { jsonBody, petListQuery } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext, UseCases } from './use-cases.ts';

type PetParams = { Params: { petId: string } };
type RecordParams = { Params: { petId: string; recordId: string } };

/** Ruta de cada módulo de registros y su caso de uso. */
const RECORD_ROUTES = [
  ['weights', 'addWeight'],
  ['measurements', 'addBodyMeasurement'],
  ['vaccinations', 'addVaccination'],
  ['dewormings', 'addDeworming'],
  ['visits', 'addMedicalVisit'],
  ['custom-parameters', 'addCustomParameter'],
] as const satisfies ReadonlyArray<readonly [string, keyof UseCases]>;

/** @implements REQ-PET-001, REQ-PET-003, REQ-PET-004, REQ-PET-005, REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006 */
export function registerPetRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.get('/api/pets', { onRequest }, async (request) => useCases.listMyPets.execute(request.userId, petListQuery(request.query)));

  app.post('/api/pets', { onRequest }, async (request, reply) => reply.status(201).send(await useCases.registerPet.execute(request.userId, jsonBody(request.body))));

  app.patch<PetParams>('/api/pets/:petId', { onRequest }, async (request) =>
    useCases.updatePet.execute(request.userId, request.params.petId, jsonBody(request.body)),
  );

  app.delete<PetParams>('/api/pets/:petId', { onRequest }, async (request, reply) => {
    await useCases.deletePet.execute(request.userId, request.params.petId);
    return reply.status(204).send();
  });

  app.get<PetParams>('/api/pets/:petId/dashboard', { onRequest }, async (request) =>
    useCases.petDashboard.execute(request.userId, request.params.petId),
  );

  // REQ-REC2-003: edición y borrado de registros; por ahora solo vacunas (T260-T263 completan los demás módulos).
  app.patch<RecordParams>('/api/pets/:petId/records/vaccinations/:recordId', { onRequest }, async (request) =>
    useCases.updateVaccination.execute(request.userId, request.params.petId, request.params.recordId, jsonBody(request.body)),
  );
  app.delete<RecordParams>('/api/pets/:petId/records/vaccinations/:recordId', { onRequest }, async (request, reply) => {
    await useCases.deleteVaccination.execute(request.userId, request.params.petId, request.params.recordId);
    return reply.status(204).send();
  });

  for (const [path, useCase] of RECORD_ROUTES) {
    app.post<PetParams>(`/api/pets/:petId/records/${path}`, { onRequest }, async (request, reply) => {
      return reply.status(201).send(await useCases[useCase].execute(request.userId, request.params.petId, jsonBody(request.body)));
    });
  }
}
