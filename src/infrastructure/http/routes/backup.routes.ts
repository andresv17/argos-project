/**
 * Rutas `backup` del OpenAPI. La exportación devuelve el sobre 2.0.0 del usuario como archivo descargable; la
 * importación pasa los bytes crudos a STATE-BACKUP-001 (≤ 10 MB; el límite del cuerpo deja llegar 10 MB + 1 byte
 * para que lo rechace la máquina). Los errores llevan `finalState`.
 *
 * @implements REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001
 */

import type { FastifyInstance } from 'fastify';
import { MAX_IMPORT_BYTES } from '../../../application/use-cases/backup-use-cases.ts';
import { rawBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import { BACKUP_IMPORT_PATH } from '../plugins/problem-details.ts';
import type { RouteContext } from './use-cases.ts';

/** @implements REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001 */
export function registerBackupRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.get('/api/backup/export', { onRequest }, async (request, reply) => {
    const { json, fileName } = await useCases.exportBackup.execute(request.userId);
    return reply.header('content-disposition', `attachment; filename="${fileName}"`).type('application/json; charset=utf-8').send(json);
  });

  app.post(BACKUP_IMPORT_PATH, { onRequest, bodyLimit: MAX_IMPORT_BYTES + 1 }, async (request) =>
    useCases.importBackup.execute(request.userId, rawBody(request.body)),
  );
}
