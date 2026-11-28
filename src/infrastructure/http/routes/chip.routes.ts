/**
 * Rutas de reclamación y disputa de microchip (Feature 012, Bloque B, #23, T1636; `contracts/openapi/chip-claim.openapi.yaml`):
 * POST /chip-claims (202 uniforme `ChipRequestAccepted`), POST /chip-disputes (multipart, 202 uniforme) y GET /chip-requests («mis solicitudes», paginado por cursor).
 * - SIN ORÁCULO (INV-CHP12-003): el caso de uso responde `{ accepted: true }` para toda clase de chip; aquí se serializa SIEMPRE como `{ status: 'RECEIVED' }` con `Cache-Control: private, no-store`.
 * - `ip` y `trustProxyHops` viajan al caso de uso para los contadores por IP (REQ-CHP12-005); los casos de uso nunca leen cabeceras.
 * - Orden de `/chip-disputes` (iteración 0.3): CSRF -> sesión -> cabeceras y tope (422 tipo, 411 sin `Content-Length`/chunked, 413 por `Content-Length`; ninguno cuenta) -> contador multipart (429 uniforme)
 *   -> lectura -> forma (422) -> saneo profundo y antimalware (422; 503 si el antimalware no está) -> contadores de chip y escritura (caso de uso).
 *
 * @implements REQ-CHP12-003, REQ-CHP12-004, REQ-CHP12-005, REQ-CHP12-008, INV-CHP12-003, ERR-SCHEMA-VALIDATION-FAILED
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../../../generated/index.ts';
import { DomainError as DomainErrorV31 } from '../../../generated/v31/index.ts';
import { CHIP_DISPUTE_BODY_MAX_BYTES } from '../../../domain/platform/feature-012-limits.ts';
import type { ChipRequestItem } from '../../../application/use-cases/chip-claim-use-cases.ts';
import { hasForeignOrigin } from './admin.routes.ts';
import { multipartBoundary, parseDisputeForm } from '../multipart-form.ts';
import { PROBLEM_CONTENT_TYPE, requestPath } from '../plugins/problem-details.ts';
import { jsonBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

export interface ChipRoutesOptions {
  /** Saltos de proxy de confianza (`ARGOS_TRUST_PROXY_HOPS`) para derivar la IP efectiva de los contadores. */
  readonly trustProxyHops: number;
}

const RECEIVED = Object.freeze({ status: 'RECEIVED' as const });
const CLAIM_FIELDS: readonly string[] = ['microchipId', 'message'];

const noStore = (reply: FastifyReply): FastifyReply => reply.header('cache-control', 'private, no-store');

/** Cursor opaco `createdAt|id` ligado al usuario autenticado; otro usuario o cualquier alteración = 422 uniforme. */
const cursorOf = (userId: string, row: { readonly createdAt: string; readonly id: string }): string => Buffer.from(`${userId}|${row.createdAt}|${row.id}`, 'utf8').toString('base64url');
function decodeCursor(userId: string, cursor: unknown): { readonly createdAt: string; readonly id: string } | null {
  if (cursor === undefined) return null;
  const fail = new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Cursor no válido.', 'cursor');
  if (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 256) throw fail;
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (parts.length !== 3 || parts[0] !== userId) throw fail;
  return { createdAt: parts[1]!, id: parts[2]! };
}

/** Respuesta 411 genérica de la plataforma (sin esquema ni código propios; trinity B-N12). */
function lengthRequired(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.status(411).type(PROBLEM_CONTENT_TYPE).send({ type: 'about:blank', title: 'Length Required', status: 411, instance: requestPath(request) });
}

/** @implements REQ-CHP12-003, REQ-CHP12-004, REQ-CHP12-005, INV-CHP12-003 */
export function registerChipRoutes(app: FastifyInstance, { useCases }: RouteContext, { trustProxyHops }: ChipRoutesOptions): void {
  const onRequest = requireSession(useCases.authenticate);
  const contextOf = (request: FastifyRequest) => ({ ip: request.ip, trustProxyHops });

  app.post('/api/chip-claims', { onRequest }, async (request, reply) => {
    const raw = jsonBody(request.body);
    const body = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const extra = Object.keys(body).find((key) => !CLAIM_FIELDS.includes(key));
    if (extra !== undefined) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'El cuerpo contiene campos no permitidos.', extra);
    await useCases.createChipClaim.execute(request.userId, { microchipId: body['microchipId'], message: body['message'] }, contextOf(request));
    return noStore(reply).status(202).send(RECEIVED);
  });

  // Cabeceras y tope ANTES de leer el cuerpo (trinity M-1): ni el 411 ni el 413 por `Content-Length` consumen el contador multipart; el tipo inválido tampoco.
  const gate = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    if (multipartBoundary(request.headers['content-type']) === null) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Se esperaba multipart/form-data.', 'content-type');
    const length = request.headers['content-length'];
    if (request.headers['transfer-encoding'] !== undefined || typeof length !== 'string' || !/^[0-9]+$/.test(length)) return lengthRequired(request, reply);
    if (Number(length) > CHIP_DISPUTE_BODY_MAX_BYTES) throw new DomainErrorV31('ERR-MEDIA-TOO-LARGE');
    await useCases.consumeChipMultipart.execute(request.userId, contextOf(request)); // 429 uniforme antes de parsear
    return undefined;
  };

  // Origen ajeno en la apertura de disputa: 403 `ERR-AUTH-CSRF-REJECTED` tras la sesión y ANTES de leer cabeceras multipart o cuerpo, sin contar (S-01).
  const ownOrigin = async (request: FastifyRequest): Promise<void> => {
    if (hasForeignOrigin(request)) throw new DomainError('ERR-AUTH-CSRF-REJECTED', undefined, 'Origin');
  };

  app.post('/api/chip-disputes', { onRequest: [onRequest, ownOrigin, gate], bodyLimit: CHIP_DISPUTE_BODY_MAX_BYTES }, async (request, reply) => {
    const boundary = multipartBoundary(request.headers['content-type'])!;
    const body = request.body instanceof Uint8Array ? request.body : new Uint8Array();
    const form = parseDisputeForm(body, boundary);
    const evidence = await useCases.prepareDisputeEvidence(form.files.map((file) => ({ declaredContentType: file.declaredContentType, bytes: file.bytes })));
    await useCases.openChipDispute.execute(request.userId, { microchipId: form.microchipId, evidence }, contextOf(request));
    return noStore(reply).status(202).send(RECEIVED);
  });

  app.get<{ Querystring: { limit?: unknown; cursor?: unknown } }>('/api/chip-requests', { onRequest }, async (request, reply) => {
    const { limit: rawLimit, cursor, ...rest } = request.query;
    const unknown = Object.keys(rest)[0];
    if (unknown !== undefined) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `Parámetro de consulta no permitido: ${unknown}.`, unknown);
    const limit = rawLimit === undefined ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'limit debe estar entre 1 y 100.', 'limit');
    const after = decodeCursor(request.userId, cursor);
    const all: ChipRequestItem[] = [...(await useCases.listMyChipRequests.execute(request.userId))].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
    const rows = after === null ? all : all.filter((r) => r.createdAt < after.createdAt || (r.createdAt === after.createdAt && r.id < after.id));
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return noStore(reply).status(200).send({ items, nextCursor: rows.length > limit && last !== undefined ? cursorOf(request.userId, last) : null });
  });
}
