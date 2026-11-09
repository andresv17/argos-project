/** Casos de prueba de `semgrep --test` para argos-no-process-env.yml (no es código de la aplicación). */
export function readPort(): string | undefined {
  // ruleid: argos-no-process-env-outside-config
  return process.env['PORT'];
}

export function readConfig(config: { readonly port: number }): number {
  // ok: argos-no-process-env-outside-config
  return config.port;
}
