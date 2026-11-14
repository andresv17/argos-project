/**
 * Rutas `backup` del OpenAPI (T279, Rebanada 5):
 * - `POST /api/backup/export`: sobre 3.0.0 del usuario como archivo descargable y el token de confirmación efímero en la
 *   cabecera `X-Argos-Confirmation-Token` (nunca dentro del archivo). Cambia estado (token, cupo), por eso es POST con
 *   `X-Argos-Request` (CSRF, `onRequest` global antes que la sesión y que el cuerpo).
 * - `POST /api/backup/import/preview`: bytes crudos a STATE-BACKUP-001 en modo PREVIEW; no persiste nada.
 * - `POST /api/backup/import`: bytes crudos en modo IMPORT; exige `X-Argos-Import-Confirm` con el `fileDigest`.
 * El límite del cuerpo deja llegar 10 MB + 1 byte para que lo rechace la máquina. Todas las respuestas, también las de
 * error, llevan `Cache-Control: no-store` (llevan datos personales o un token). Los errores llevan `finalState`.
 *
 * @implements REQ-BACKUP2-001, REQ-BACKUP2-002, REQ-RBAC-001, INV-BACKUP-001, ERR-AUTH-CSRF-REJECTED, ERR-RATE-LIMITED
 */

import type { FastifyInstance } from 'fastify';
import { CONFIRMATION_TOKEN_HEADER, MAX_IMPORT_BYTES } from '../../../application/use-cases/backup-use-cases.ts';
import { rawBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import { BACKUP_IMPORT_PATH } from '../plugins/problem-details.ts';
import type { RouteContext } from './use-cases.ts';

const BACKUP_PATH_PREFIX = '/api/backup/';
const IMPORT_CONFIRM_HEADER = 'x-argos-import-confirm';

/** @implements REQ-BACKUP2-001, REQ-BACKUP2-002, INV-BACKUP-001 */
export function registerBackupRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);
  const bodyLimit = MAX_IMPORT_BYTES + 1;

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith(BACKUP_PATH_PREFIX)) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.post('/api/backup/export', { onRequest }, async (request, reply) => {
    const { json, fileName, headers } = await useCases.exportBackup.execute(request.userId);
    return reply
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .header(CONFIRMATION_TOKEN_HEADER, headers[CONFIRMATION_TOKEN_HEADER])
      .type('application/json; charset=utf-8')
      .send(json);
  });

  app.post(`${BACKUP_IMPORT_PATH}/preview`, { onRequest, bodyLimit }, async (request) =>
    useCases.previewBackupImport.execute(request.userId, rawBody(request.body)),
  );

  app.post(BACKUP_IMPORT_PATH, { onRequest, bodyLimit }, async (request) => {
    const confirmation = request.headers[IMPORT_CONFIRM_HEADER];
    return useCases.importBackup.execute(request.userId, rawBody(request.body), typeof confirmation === 'string' ? confirmation : null);
  });
}
