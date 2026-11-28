/** Ayudas comunes de las pruebas unitarias del Bloque D (012, #32, T1674). Un `DomainError` se reconoce por forma (catálogo fusionado 012). */
export const isDomainError = (error: unknown): error is Error & { code: string; status: number } => error instanceof Error && error.name === 'DomainError' && typeof (error as { code?: unknown }).code === 'string';

/** Ejecuta `action` y devuelve el `DomainError` lanzado (falla si no lanza o si lanza otra cosa). */
export function domainErrorOf(action: () => unknown): Error & { code: string; status: number } {
  try {
    action();
  } catch (error) {
    if (isDomainError(error)) return error;
    throw error;
  }
  throw new Error('no lanzó ningún DomainError');
}

/** Garantiza que el error NO ecoa el valor rechazado ni en el mensaje ni en su serialización (422 sin eco, trinity T-07). */
export function expectNoEcho(error: Error, secret: string): void {
  const dump = `${error.message}|${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;
  if (dump.includes(secret)) throw new Error('el error ecoa el valor rechazado');
}
