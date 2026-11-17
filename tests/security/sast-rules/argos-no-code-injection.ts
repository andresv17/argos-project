/** Casos de prueba de `semgrep --test` para argos-no-code-injection.yml (no es código de la aplicación). */
export function dynamicCode(source: string): unknown[] {
  return [
    // ruleid: argos-no-dynamic-code
    eval(source),
    // ruleid: argos-no-dynamic-code
    new Function(source),
  ];
}

