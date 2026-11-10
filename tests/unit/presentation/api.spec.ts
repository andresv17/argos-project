import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG } from '../../../src/generated/errors/error-codes.ts';
import { ApiProblem, attachmentFileName, catalogProblem, CSRF_PARAMS, problemMessage, toProblem, unwrap } from '../../../src/presentation/web/api.ts';
import { importProblemText, importResultText } from '../../../src/presentation/web/pages/BackupPage.tsx';

const ok = (status: number): Response => new Response(null, { status });

describe('errores de la API en la SPA', () => {
  it('[ERR-INTERNAL-UNEXPECTED] una respuesta que no es del catálogo (p. ej. otro servicio en el puerto del proxy) se muestra como ERR-INTERNAL-UNEXPECTED', async () => {
    const foreign = { message: 'Unauthorized', messageId: 'auth.unauthorized', statusCode: 401 };
    expect(toProblem(foreign).code).toBe('ERR-INTERNAL-UNEXPECTED');
    await expect(unwrap(Promise.resolve({ error: foreign, response: new Response(null, { status: 401 }) }))).rejects.toMatchObject({ problem: { code: 'ERR-INTERNAL-UNEXPECTED' } });
  });

  it('[INV-AUTH-007] las operaciones mutantes envían X-Argos-Request: 1 con el cliente generado', () => {
    expect(CSRF_PARAMS).toEqual({ header: { 'X-Argos-Request': '1' } });
  });

  it('[REQ-UI-005][ERR-AUTH-INVALID-CREDENTIALS] el texto mostrado es el detailTemplate del catálogo para el código recibido', () => {
    const problem = { ...catalogProblem('ERR-AUTH-INVALID-CREDENTIALS'), detail: 'texto del servidor' };
    expect([problemMessage(problem), problemMessage({ ...problem, code: 'ERR-DESCONOCIDO' })]).toEqual([ERROR_CATALOG['ERR-AUTH-INVALID-CREDENTIALS'].detailTemplate, 'texto del servidor']);
  });

  it('[ERR-INTERNAL-UNEXPECTED] un cuerpo de error ajeno al catálogo se trata como ERR-INTERNAL-UNEXPECTED', () => {
    expect([toProblem('html').code, toProblem({ code: 'NOPE' }).code, toProblem(null).code, toProblem(catalogProblem('ERR-PET-NOT-FOUND')).code]).toEqual([
      'ERR-INTERNAL-UNEXPECTED',
      'ERR-INTERNAL-UNEXPECTED',
      'ERR-INTERNAL-UNEXPECTED',
      'ERR-PET-NOT-FOUND',
    ]);
  });

  it('[REQ-UI-005] unwrap devuelve data, lanza ApiProblem con el ProblemDetails y convierte el fallo de red en ERR-INTERNAL-UNEXPECTED', async () => {
    const data = await unwrap(Promise.resolve({ data: { x: 1 }, response: ok(200) }));
    const failed = await unwrap(Promise.resolve({ error: catalogProblem('ERR-ACC-FORBIDDEN'), response: ok(403) })).catch((e: unknown) => e);
    const network = await unwrap(Promise.reject(new TypeError('fetch failed'))).catch((e: unknown) => e);
    expect([data, failed instanceof ApiProblem && failed.problem.code, network instanceof ApiProblem && network.problem.code]).toEqual([{ x: 1 }, 'ERR-ACC-FORBIDDEN', 'ERR-INTERNAL-UNEXPECTED']);
  });

  it('[REQ-BACKUP-001] el nombre del archivo exportado sale de Content-Disposition', () => {
    expect([attachmentFileName('attachment; filename="argos-backup-2026-11-09.json"'), attachmentFileName(null)]).toEqual(['argos-backup-2026-11-09.json', 'argos-backup.json']);
  });

  it('[STATE-BACKUP-001][REQ-BACKUP-002] la importación muestra el resultado o el error con su finalState', () => {
    expect([
      importResultText({ finalState: 'COMPLETED', sourceSchemaVersion: '1.0.0', importedPetsCount: 2, importedRecordsCount: 7 }),
      importProblemText({ ...catalogProblem('ERR-BACKUP-MALFORMED-JSON'), finalState: 'ROLLED_BACK' }),
      importProblemText({ ...catalogProblem('ERR-INTERNAL-UNEXPECTED'), finalState: 'UNKNOWN' }),
    ]).toEqual([
      'Importación completada (versión 1.0.0): 2 mascotas y 7 registros.',
      `${ERROR_CATALOG['ERR-BACKUP-MALFORMED-JSON'].detailTemplate} No se modificó ningún dato.`,
      `${ERROR_CATALOG['ERR-INTERNAL-UNEXPECTED'].detailTemplate} Estado final desconocido: revisa tus datos.`,
    ]);
  });
});
