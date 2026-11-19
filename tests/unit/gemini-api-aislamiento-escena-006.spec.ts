import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T889 (006, tramo `gemini-api`): aislamiento estático del driver local privado. `GEMINI_API_KEY` no existe en `terraform/`, workflows ni lock; `package.json` no cambia
 * ni declara SDK de IA; `process.env` solo se lee en `src/infrastructure/config/` (y en los lectores previos ya autorizados, nunca en el adaptador `gemini-api`).
 * REQ-ESC6-017, REQ-ESC6-037, REQ-ESC6-038; INV-ESC6-020; SC-ESC6-050, SC-ESC6-101.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '.terraform' || e.name === 'node_modules' ? [] : walk(join(dir, e.name))) : [join(dir, e.name)])) : [];
const ADAPTER_FILES = ['src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts', 'src/infrastructure/adapters/gemini-api-wire.ts'];

describe('aislamiento del driver gemini-api (REQ-ESC6-037, INV-ESC6-020, SC-ESC6-101)', () => {
  it('[REQ-ESC6-038][INV-ESC6-020] GEMINI_API_KEY y gemini-api no aparecen en terraform/, en los workflows ni en el lock', () => {
    const files = [...walk('terraform'), ...walk('.github/workflows'), 'package-lock.json'].filter((f) => !/\.(tfstate|png|zip)$/.test(f));
    expect(files.length).toBeGreaterThan(3);
    expect(files.filter((f) => /GEMINI_API_KEY|gemini-api/.test(read(f)))).toEqual([]);
  });

  it('[SC-ESC6-101] package.json no cambia respecto de HEAD y no declara dependencias de IA o de autenticación de Google', () => {
    const head = execFileSync('git', ['show', 'HEAD:package.json'], { cwd: root, encoding: 'utf8' });
    expect(read('package.json')).toBe(head);
    expect(/GEMINI_API_KEY|gemini-api/.test(read('package.json'))).toBe(false);
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /genai|generative-ai|vertex|aiplatform|openai|anthropic|google-auth-library/.test(n))).toEqual([]);
  });

  it('[INV-ARCH-006][REQ-ESC6-037] los archivos del adaptador gemini-api no leen process.env ni importan nada de config/ que lo haga', () => {
    for (const f of ADAPTER_FILES.filter((p) => existsSync(join(root, p)))) {
      const text = read(f);
      expect(/process\.env|import\.meta\.env/.test(text)).toBe(false);
      expect(/console\.(log|info|warn|error|debug)/.test(text)).toBe(false);
    }
  });

  it('[INV-ARCH-006][REQ-ESC6-037] GEMINI_API_KEY y ARGOS_SCENE_GEMINI_MODEL solo se nombran en src/ dentro de config/ (y en comentarios de composición)', () => {
    const offenders = walk('src')
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('src/generated') && !f.startsWith('src/infrastructure/config/'))
      .filter((f) => /process\.env\.(GEMINI_API_KEY|ARGOS_SCENE_GEMINI_MODEL)|process\.env\[['"](GEMINI_API_KEY|ARGOS_SCENE_GEMINI_MODEL)/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
