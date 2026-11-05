import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) {
    const filePath = fileURLToPath(url);
    const source = readFileSync(filePath, 'utf8');
    // Delegate to Node's native TypeScript stripper by treating .tsx as module-typescript
    return nextLoad(url, { ...context, format: 'module-typescript', source });
  }
  return nextLoad(url, context);
}
