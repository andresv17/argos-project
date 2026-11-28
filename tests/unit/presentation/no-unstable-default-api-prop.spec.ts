/**
 * Regresión de producción (2026-11-28): ningún componente React en `src/presentation/web/` puede declarar
 * `api = create...Api()` como valor por defecto en los parámetros del componente, porque crea una referencia nueva
 * en cada render y dispara bucles infinitos en `useCallback(..., [api])` + `useEffect(..., [refresh])` que saturan
 * el navegador y la API. Debe memoizarse con `useMemo(() => apiProp ?? create...Api(), [apiProp])`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsxFiles(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('estabilidad de clientes API por defecto en componentes React (sin bucles infinitos)', () => {
  it('ningún componente en src/presentation/web/ instancia create*Api() como valor por defecto de props', () => {
    const files = listTsxFiles('src/presentation/web');
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (/=\s*create[A-Za-z0-9]*Api\s*\(/.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('OwnersPanel, OwnershipInbox y ShareLinksPanel memoizan el cliente API con useMemo', () => {
    const coOwners = readFileSync('src/presentation/web/components/CoOwners.tsx', 'utf8');
    const shareLinks = readFileSync('src/presentation/web/components/ShareLinks.tsx', 'utf8');
    expect(coOwners.match(/useMemo\(\(\) => apiProp \?\? createCoOwnershipApi\(\), \[apiProp\]\)/g)).toHaveLength(2);
    expect(shareLinks.match(/useMemo\(\(\) => apiProp \?\? createShareApi\(\), \[apiProp\]\)/g)).toHaveLength(1);
  });
});
