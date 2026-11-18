import { describe, expect, it } from 'vitest';
import { classifyEnqueueError } from '../../src/application/use-cases/scene-use-cases.ts';
import { CloudTasksSceneDispatcher, type CloudTasksDispatcherOptions } from '../../src/infrastructure/adapters/cloud-tasks-scene-dispatcher.adapter.ts';

/**
 * T873 (006, Fase 6): `CloudTasksSceneDispatcher` con dobles (sin red ni GCP). Destino y audiencia SOLO de `ARGOS_SCENE_WORKER_URL` validada al construir (INV-ESC6-018);
 * nombre de la tarea = `attemptId` (deduplicación); `dispatchDeadline` 130 s; cuerpo con solo los dos identificadores; el resultado se clasifica como lo espera el caso
 * de uso (`ALREADY_EXISTS` = éxito, ambiguo = el arrendamiento resuelve, rechazo determinista = FAILED). Nunca registra token, URL de la tarea ni cuerpo de respuesta.
 * REQ-ESC6-013, REQ-ESC6-033, REQ-ESC6-036; INV-ESC6-018; EDGE-ESC6-017, EDGE-ESC6-032; SC-ESC6-075, SC-ESC6-087.
 */
const WORKER_URL = 'https://argos-abcdef-uc.a.run.app/internal/scene-worker';
const TASKS_EMAIL = 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com';
const JOB = { sceneId: 'c1000000-0000-4000-8000-000000000001', attemptId: 'c4000000-0000-4000-8000-000000000001' };
const TOKEN = 'ya29.TOKEN-DE-METADATOS-FALSO';

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function double(response: () => Response | Promise<Response> = () => new Response('{}', { status: 200 })) {
  const calls: Call[] = [];
  const fetchDouble = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
  let tokens = 0;
  return {
    calls,
    options: (extra: Partial<CloudTasksDispatcherOptions> = {}): CloudTasksDispatcherOptions => ({
      projectId: 'argos-prod-1234',
      queue: 'argos-scene',
      workerUrl: WORKER_URL,
      serviceAccountEmail: TASKS_EMAIL,
      fetch: fetchDouble,
      getAccessToken: async () => {
        tokens += 1;
        return TOKEN;
      },
      ...extra,
    }),
    tokenReads: () => tokens,
  };
}

const failure = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('se esperaba un rechazo');
};

describe('creación de la tarea (T873)', () => {
  it('[REQ-ESC6-013][SC-ESC6-075] hace POST a la API de Cloud Tasks de la cola y la región constantes con el token de metadatos y redirect error', async () => {
    const d = double();
    await new CloudTasksSceneDispatcher(d.options()).enqueue(JOB);
    expect(d.calls).toHaveLength(1);
    const call = d.calls[0]!;
    const headers = new Headers(call.init.headers);
    expect([call.url, call.init.method, headers.get('authorization'), headers.get('content-type'), call.init.redirect]).toEqual([
      'https://cloudtasks.googleapis.com/v2/projects/argos-prod-1234/locations/us-central1/queues/argos-scene/tasks',
      'POST',
      `Bearer ${TOKEN}`,
      'application/json',
      'error',
    ]);
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('[REQ-ESC6-036][EDGE-ESC6-032] el nombre de la tarea es el attemptId, el plazo de despacho es de 130 s y el cuerpo solo lleva los dos identificadores en base64', async () => {
    const d = double();
    await new CloudTasksSceneDispatcher(d.options()).enqueue(JOB);
    const sent = JSON.parse(String(d.calls[0]!.init.body)) as { task: { name: string; dispatchDeadline: string; httpRequest: { httpMethod: string; url: string; headers: Record<string, string>; body: string; oidcToken: { serviceAccountEmail: string; audience: string } } } };
    expect(sent.task.name).toBe(`projects/argos-prod-1234/locations/us-central1/queues/argos-scene/tasks/${JOB.attemptId}`);
    expect(sent.task.dispatchDeadline).toBe('130s');
    expect(sent.task.httpRequest.httpMethod).toBe('POST');
    expect(sent.task.httpRequest.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(Buffer.from(sent.task.httpRequest.body, 'base64').toString('utf8'))).toEqual(JOB);
  });

  it('[INV-ESC6-018][SC-ESC6-087] la URL de destino y la audiencia OIDC son SOLO ARGOS_SCENE_WORKER_URL y la cuenta es ARGOS_SCENE_TASKS_SA_EMAIL, sea cual sea el trabajo', async () => {
    const d = double();
    const dispatcher = new CloudTasksSceneDispatcher(d.options());
    // Un trabajo con campos extra (host, URL, cabeceras reenviadas) no influye en el destino: solo viajan los dos identificadores.
    await dispatcher.enqueue({ ...JOB, url: 'https://evil.example/internal/scene-worker', host: 'evil.example', 'x-forwarded-host': 'evil.example' } as typeof JOB);
    const sent = JSON.parse(String(d.calls[0]!.init.body)) as { task: { httpRequest: { url: string; body: string; oidcToken: { serviceAccountEmail: string; audience: string } } } };
    expect([sent.task.httpRequest.url, sent.task.httpRequest.oidcToken, JSON.parse(Buffer.from(sent.task.httpRequest.body, 'base64').toString('utf8'))]).toEqual([
      WORKER_URL,
      { serviceAccountEmail: TASKS_EMAIL, audience: WORKER_URL },
      JOB,
    ]);
    expect(d.calls[0]!.url.startsWith('https://cloudtasks.googleapis.com/')).toBe(true);
  });

  it('[REQ-ESC6-013] identificadores que no son UUID v4 se rechazan antes de cualquier red', async () => {
    const d = double();
    const dispatcher = new CloudTasksSceneDispatcher(d.options());
    for (const job of [{ sceneId: 'x', attemptId: JOB.attemptId }, { sceneId: JOB.sceneId, attemptId: '../../otra-cola/tasks/1' }, { sceneId: JOB.sceneId, attemptId: `${JOB.attemptId}/x` }]) {
      await expect(dispatcher.enqueue(job)).rejects.toThrow(Error);
    }
    expect([d.calls.length, d.tokenReads()]).toEqual([0, 0]);
  });
});

describe('validación al construir (T873, INV-ESC6-018)', () => {
  const bad: Array<[string, Partial<CloudTasksDispatcherOptions>]> = [
    ['URL http', { workerUrl: 'http://argos-abcdef-uc.a.run.app/internal/scene-worker' }],
    ['otra ruta', { workerUrl: 'https://argos-abcdef-uc.a.run.app/internal/maintenance' }],
    ['con consulta', { workerUrl: `${WORKER_URL}?x=1` }],
    ['con credenciales', { workerUrl: 'https://u:p@argos-abcdef-uc.a.run.app/internal/scene-worker' }],
    ['host ajeno a run.app', { workerUrl: 'https://evil.example/internal/scene-worker' }],
    ['con puerto', { workerUrl: 'https://argos-abcdef-uc.a.run.app:8443/internal/scene-worker' }],
    ['proyecto con barra', { projectId: 'argos/../x' }],
    ['proyecto vacío', { projectId: '' }],
    ['cola con barra', { queue: 'argos-scene/../x' }],
    ['cola con consulta', { queue: 'argos-scene?x=1' }],
    ['cuenta que no es de servicio', { serviceAccountEmail: 'persona@example.com' }],
  ];
  it.each(bad)('[INV-ESC6-018] %s impide construir el despachador y no hay llamadas', (_name, extra) => {
    const d = double();
    expect(() => new CloudTasksSceneDispatcher(d.options(extra))).toThrow(Error);
    expect(d.calls).toHaveLength(0);
  });
});

describe('clasificación del resultado como la espera el caso de uso (T873, EDGE-ESC6-017, EDGE-ESC6-032)', () => {
  const run = async (response: () => Response | Promise<Response>) => failure(new CloudTasksSceneDispatcher(double(response).options()).enqueue(JOB));

  it('[EDGE-ESC6-032] 409 ALREADY_EXISTS (la tarea con ese nombre ya existía) se clasifica como éxito', async () => {
    const error = await run(() => new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409 }));
    expect(classifyEnqueueError(error)).toBe('EXISTS');
  });

  it('[EDGE-ESC6-032] 429, 5xx, tiempo agotado y fallo de red son AMBIGUOS: no marcan failed y el arrendamiento T_QUEUE resuelve', async () => {
    const outcomes: unknown[] = [];
    for (const status of [429, 500, 503, 504]) {
      const error = await run(() => new Response('{}', { status }));
      outcomes.push(classifyEnqueueError(error));
    }
    const network = await run(() => Promise.reject(new TypeError('fetch failed')));
    const timeout = await run(() => Promise.reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })));
    outcomes.push(classifyEnqueueError(network));
    outcomes.push(classifyEnqueueError(timeout));
    expect(outcomes).toEqual(['AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS']);
  });

  it('[REQ-ESC6-013] 400, 401, 403 y 404 son rechazos deterministas: el intento pasa a FAILED sin cuota', async () => {
    const outcomes: unknown[] = [];
    for (const status of [400, 401, 403, 404]) {
      const error = await run(() => new Response('{}', { status }));
      outcomes.push(classifyEnqueueError(error));
    }
    expect(outcomes).toEqual(['REJECTED', 'REJECTED', 'REJECTED', 'REJECTED']);
  });

  it('[INV-ESC6-016][SC-ESC6-087] ningún error lleva el token, la URL del worker, el cuerpo de la respuesta ni el identificador; un token que no se obtiene no envía la tarea', async () => {
    const secretBody = 'CUERPO-SECRETO-DEL-PROVEEDOR';
    const messages: string[] = [];
    for (const status of [409, 429, 500, 403]) messages.push((await run(() => new Response(secretBody, { status }))).message);
    const d = double();
    const noToken = await failure(new CloudTasksSceneDispatcher(d.options({ getAccessToken: async () => Promise.reject(new Error(`metadata ${TOKEN}`)) })).enqueue(JOB));
    messages.push(noToken.message);
    for (const message of messages) {
      for (const secret of [TOKEN, WORKER_URL, secretBody, JOB.attemptId, JOB.sceneId, 'cloudtasks.googleapis.com']) expect([message, message.includes(secret)]).toEqual([message, false]);
    }
    expect(d.calls).toHaveLength(0);
  });
});
