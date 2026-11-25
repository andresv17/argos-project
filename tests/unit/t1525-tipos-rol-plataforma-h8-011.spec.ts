import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): H-8 y `REQ-ADM11-002` (ex ADR-011-02): `PlatformRole` es un tipo NOMINAL (con marca) distinto del rol de hogar, en un módulo propio
 * de `src/domain/admin/` que no importa de `domain/access`; ningún módulo de hogar importa el rol de plataforma ni al revés; ningún valor coincide con `OWNER/ADMIN/CAREGIVER/READER`; y el rol nunca se
 * compara por subcadena. Es una prueba ESTÁTICA sobre el código fuente: falla ante importaciones cruzadas hogar/plataforma.
 *
 * @implements REQ-ADM11-002, INV-ADM11-001
 */
const ROOT = process.cwd();
const HOUSEHOLD_ROLES = ['OWNER', 'ADMIN', 'CAREGIVER', 'READER'];
const PLATFORM_ROLES = ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'];
const strip = (code: string): string => code.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function files(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel) : rel.endsWith('.ts') ? [rel] : [];
  });
}
const read = (rel: string): string => strip(readFileSync(join(ROOT, rel), 'utf8'));
const adminDomain = files('src/domain/admin');
const importsOf = (code: string): string[] => [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
const HOUSEHOLD_SIDE = [...files('src/domain/access'), ...files('src/domain/households'), ...files('src/domain/scene'), ...files('src/domain/sharing'), ...files('src/domain/pet'), ...files('src/domain/records')];

describe('T1525 separación nominal de roles de hogar y de plataforma (H-8)', () => {
  it('[REQ-ADM11-002] PlatformRole se declara en un módulo propio de src/domain/admin/ como tipo NOMINAL (con marca) sobre el conjunto cerrado SUPER_ADMIN | OPERATOR | SUPPORT', () => {
    const declaring = adminDomain.filter((file) => /export\s+type\s+PlatformRole\b/.test(read(file)));
    expect(declaring).toHaveLength(1);
    const code = read(declaring[0]!);
    expect(code).toMatch(/unique symbol|__brand|\bBrand</);
    for (const role of PLATFORM_ROLES) expect([role, code.includes(`'${role}'`)]).toEqual([role, true]);
  });

  it('[REQ-ADM11-002] ningún valor del rol de plataforma coincide con un rol de hogar y viceversa; el módulo de plataforma no nombra los roles de hogar', () => {
    expect(PLATFORM_ROLES.filter((role) => HOUSEHOLD_ROLES.includes(role))).toEqual([]);
    for (const file of adminDomain) {
      const code = read(file);
      for (const role of HOUSEHOLD_ROLES) expect([file, role, new RegExp(`['"]${role}['"]`).test(code)]).toEqual([file, role, false]);
    }
    expect(adminDomain.length).toBeGreaterThan(0);
  });

  it('[REQ-ADM11-002] el dominio de plataforma NO importa de domain/access ni de domain/households, y ningún módulo de hogar importa de domain/admin (importaciones cruzadas)', () => {
    expect(adminDomain.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of adminDomain) for (const spec of importsOf(read(file))) if (/\/(access|households|sharing)\//.test(spec) || /\/(access|households|sharing)$/.test(spec)) violations.push(`${file} -> ${spec}`);
    for (const file of HOUSEHOLD_SIDE) for (const spec of importsOf(read(file))) if (/\/admin\//.test(spec) || /\/admin$/.test(spec)) violations.push(`${file} -> ${spec}`);
    expect(violations).toEqual([]);
  });

  it('[REQ-ADM11-002] ninguna función de hogar lee PlatformRole ni al revés: ningún archivo de src/ nombra a la vez PlatformRole y un tipo de rol de hogar (can/EffectiveRole/MemberRole/SceneRole)', () => {
    const both: string[] = [];
    for (const file of files('src')) {
      if (file.startsWith('src/generated')) continue;
      const code = read(file);
      if (/\bPlatformRole\b/.test(code) && /\b(?:EffectiveRole|MemberRole|HouseholdRole|AssignableMemberRole|SceneRole|can)\b/.test(code)) both.push(file);
    }
    expect(both).toEqual([]);
    expect(files('src').some((file) => /\bPlatformRole\b/.test(read(file)))).toBe(true);
  });

  it('[REQ-ADM11-002][H-8] el rol de plataforma nunca se compara por subcadena: sin includes/startsWith/endsWith/indexOf/match/regex sobre un rol en el código de plataforma', () => {
    const platformCode = files('src').filter((file) => !file.startsWith('src/generated') && /\bPlatformRole\b/.test(read(file)));
    expect(platformCode.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const file of platformCode) {
      const code = read(file);
      if (/\brole\w*\s*\.\s*(?:includes|startsWith|endsWith|indexOf|match|search)\s*\(/i.test(code)) bad.push(`${file}: método de cadena sobre un rol`);
      if (/\/[^/\n]*(?:ADMIN|OPERATOR|SUPPORT)[^/\n]*\/[a-z]*\s*\.\s*test\s*\(\s*\w*role/i.test(code)) bad.push(`${file}: regex sobre un rol`);
    }
    expect(bad).toEqual([]);
  });
});
