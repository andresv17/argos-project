import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as V from '../../../src/generated/index.ts';

/**
 * Conexión del juego canónico de fixtures de la Feature 002 a las pruebas de contrato.
 * Fuente: specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json
 * Un caso `valid` debe validar; un caso `ERR-*` debe fallar con ese código.
 * No modifica contratos ni código de producción.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = resolve(import.meta.dirname, '../../..');
const SPEC = resolve(ROOT, 'specs/002-plataforma-v21/contracts');
const fx: any = JSON.parse(readFileSync(resolve(SPEC, 'examples/canonical-fixtures.json'), 'utf8'));
const catalog: Record<string, unknown> = JSON.parse(readFileSync(resolve(SPEC, 'errors/error-catalog.json'), 'utf8')).errors;
const medSchema: any = JSON.parse(readFileSync(resolve(SPEC, 'schemas/medical-records.schema.json'), 'utf8'));
const LIMITS: Record<string, { minKg: number; maxKg: number; decimals: number }> = medSchema.$defs.SpeciesWeightLimits.const;
const validators = V as unknown as Record<string, any>;
const FIELD = V.FIELD_ERROR_CODES as Record<string, Record<string, string>>;

const SCHEMA_ERR = 'ERR-SCHEMA-VALIDATION-FAILED';
const BACKUP_SCHEMAS = new Set(['BackupEnvelopeV3', 'BackupEnvelopeV2Legacy', 'BackupEnvelopeV1Legacy', 'BackupPetProfileV3']);
const MAX_DEPTH = 64; // supuesto del verificador de referencia; el contrato fija el límite exacto en el parser (no en el esquema)

function resolveCode(schema: string, errors: any[]): string {
  for (const e of errors ?? []) {
    const segs = String(e.instancePath).split('/').filter((s) => s !== '' && !/^\d+$/.test(s));
    const code = FIELD[schema]?.[segs[segs.length - 1] ?? ''];
    if (code) return code;
  }
  return BACKUP_SCHEMAS.has(schema) ? 'ERR-BACKUP-SCHEMA-INVALID' : SCHEMA_ERR;
}

/** Recorre JSON en bruto: profundidad máxima y claves duplicadas; lanza si está malformado. */
function scanJson(text: string): { maxDepth: number; dup: boolean } {
  let i = 0;
  let maxDepth = 0;
  let dup = false;
  const bad = () => new Error('malformed');
  const ws = () => { while (i < text.length && /\s/.test(text[i]!)) i++; };
  const str = (): string => {
    if (text[i] !== '"') throw bad();
    i++;
    let s = '';
    while (text[i] !== '"') {
      if (i >= text.length) throw bad();
      if (text[i] === '\\') { s += text[i]! + (text[i + 1] ?? ''); i += 2; } else s += text[i++];
    }
    i++;
    return s;
  };
  const val = (d: number): void => {
    ws();
    maxDepth = Math.max(maxDepth, d);
    const c = text[i];
    if (c === '{') {
      i++; ws();
      if (text[i] === '}') { i++; return; }
      const keys = new Set<string>();
      for (;;) {
        ws(); const k = str();
        if (keys.has(k)) dup = true;
        keys.add(k); ws();
        if (text[i++] !== ':') throw bad();
        val(d + 1); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i++] === '}') return;
        throw bad();
      }
    }
    if (c === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return; }
      for (;;) {
        val(d + 1); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i++] === ']') return;
        throw bad();
      }
    }
    if (c === '"') { str(); return; }
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?|^true|^false|^null/.exec(text.slice(i));
    if (!m) throw bad();
    i += m[0].length;
  };
  val(0); ws();
  if (i < text.length) throw bad();
  return { maxDepth, dup };
}

const decimalsOk = (w: number, d: number) => Math.abs(Math.round(w * 10 ** d) / 10 ** d - w) < 1e-12;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const RULES: Record<string, (r: any, c: any) => string | null> = {
  sessionExpired: (r, c) => {
    const now = Date.parse(r.now);
    return now >= Date.parse(c.input.idleExpiresAt) || now >= Date.parse(c.input.absoluteExpiresAt) ? 'ERR-AUTH-UNAUTHENTICATED' : null;
  },
  confirmMismatch: (_r, c) => (c.input.password !== c.input.confirmPassword ? SCHEMA_ERR : null),
  usernameTaken: (r, c) => (r.existing.includes(c.input.username) ? 'ERR-AUTH-USERNAME-TAKEN' : null),
  tokenAbsentOrMalformed: (_r, c) => (validators['validateConfirmationToken']!(c.input.backupConfirmationToken ?? null) ? null : 'ERR-ACCOUNT-CONFIRMATION-MISMATCH'),
  futureBirthDate: (r, c) => (c.input.birthDate > r.today ? 'ERR-PET-FUTURE-BIRTHDATE' : null),
  birthAfterOldestRecord: (r, c) => (c.input.birthDate > r.oldestRecordDate ? 'ERR-PET-BIRTHDATE-AFTER-RECORDS' : null),
  microchipDuplicate: (r, c) => (c.input.microchipId && r.ownerPetMicrochips.includes(c.input.microchipId) ? 'ERR-PET-MICROCHIP-DUPLICATE' : null),
  weightBySpecies: (r) => {
    const l = LIMITS[r.species]!;
    return r.weightKg >= l.minKg && r.weightKg <= l.maxKg && decimalsOk(r.weightKg, l.decimals) ? null : 'ERR-REC-WEIGHT-OUT-OF-RANGE';
  },
  nextAfterApplied: (r, c) => (r.next > r.applied ? null : c.schema === 'CreateDewormingInput' ? 'ERR-REC-INVALID-NEXT-DOSE-DATE' : 'ERR-REC-INVALID-BOOSTER-DATE'),
  futureEvent: (r) => (r.eventDate > r.today ? 'ERR-REC-FUTURE-EVENT-DATE' : null),
  beforeBirth: (r) => (r.eventDate < r.birthDate ? 'ERR-REC-DATE-BEFORE-BIRTH' : null),
  supersededImmutable: (r) => {
    const vs: any[] = fx.entities.records.vaccinations;
    const a = vs.find((x) => x.id === r.targetRecordId);
    const b = vs.find((x) => x.id === r.newerRecordId);
    return a && b && a.petId === b.petId && a.vaccineName.trim().toLowerCase() === b.vaccineName.trim().toLowerCase() && b.appliedAt > a.appliedAt
      ? 'ERR-REC-SUPERSEDED-IMMUTABLE' : null;
  },
  versionUnsupported: (r, c) => (r.supported.includes(c.input.schemaVersion) ? null : 'ERR-BACKUP-VERSION-UNSUPPORTED'),
  referentialIntegrity: (_r, c) => {
    const ids = new Set<string>(c.input.pets.map((p: any) => p.id));
    return (Object.values(c.input.records).flat() as any[]).every((x) => ids.has(x.petId)) ? null : 'ERR-BACKUP-REFERENTIAL-INTEGRITY';
  },
  foreignPetId: (r, c) => (c.input.pets.some((p: any) => r.foreignPetIds.includes(p.id)) ? 'ERR-BACKUP-REFERENTIAL-INTEGRITY' : null),
  machineGuard: (r, c) => {
    const txt = readFileSync(resolve(SPEC, 'state-machines', r.machine), 'utf8');
    return txt.includes(`"${r.transition}"`) && txt.includes(c.expected) ? c.expected : null;
  },
  catalogOnly: (_r, c) => (catalog[c.expected] ? c.expected : null),
};

/** Resultado observado: 'valid', 'invalid' (solo Problem Details) o un código ERR-*. */
function evaluate(c: any): string {
  const layer: string = c.layer ?? 'SCHEMA';
  if (layer === 'PARSER') {
    if (c.generate?.kind === 'oversizeBytes') return c.generate.bytes > 10 * 1024 * 1024 ? 'ERR-BACKUP-PAYLOAD-TOO-LARGE' : 'valid';
    const text: string = c.generate?.kind === 'deepNesting' ? '{"a":'.repeat(c.generate.depth) + '1' + '}'.repeat(c.generate.depth) : c.rawJson;
    let s: { maxDepth: number; dup: boolean };
    try { s = scanJson(text); } catch { return 'ERR-BACKUP-MALFORMED-JSON'; }
    return s.dup || s.maxDepth > MAX_DEPTH ? 'ERR-BACKUP-SCHEMA-INVALID' : 'valid';
  }
  const input = c.rawJson !== undefined ? JSON.parse(c.rawJson) : c.input;
  const cc = { ...c, input };
  const fn = validators[`validate${c.schema}`];
  if (!fn) throw new Error(`sin validador validate${c.schema}`);
  const ok: boolean = fn(input);
  if (layer === 'DISPATCH') return RULES[c.rule.kind]!(c.rule, cc) ?? 'valid';
  if (layer === 'SCHEMA') return ok ? 'valid' : c.expected === 'invalid' ? 'invalid' : resolveCode(c.schema, fn.errors);
  if (!ok) throw new Error(`DOMAIN: el esquema rechaza la forma: ${JSON.stringify(fn.errors?.[0])}`);
  return RULES[c.rule.kind]!(c.rule, cc) ?? 'valid';
}

const BLOCKS = ['userCases', 'petCases', 'householdCases', 'invitationCases', 'recordCases', 'backupCases', 'auditCases', 'errorCases'] as const;

describe('Fixtures canónicos 002 contra los validadores generados', () => {
  for (const block of BLOCKS) {
    describe(block, () => {
      for (const c of fx[block] as any[]) {
        const title = `${c.id} [${c.requirementId}] ${c.description} -> ${c.expected}`;
        it(title, () => {
          expect(evaluate(c)).toBe(c.expected);
        });
      }
    });
  }

  describe('auditCases: HMAC-SHA256 de los seudónimos', () => {
    for (const c of (fx.auditCases as any[]).filter((x) => x.rule?.kind === 'hmacOf')) {
      it(`${c.id} [${c.requirementId}] ${c.rule.field} coincide con HMAC-SHA256 del secreto de prueba`, () => {
        const h = createHmac('sha256', Buffer.from(fx.auditHmac.secretHexForTestsOnly, 'hex')).update(c.rule.message).digest('hex');
        expect(c.input[c.rule.field]).toBe(h);
      });
    }
  });

  describe('alertCases', () => {
    const evalAlert = (i: any) => {
      if (i.hasNewerRecordOfSameKey) return 'SUPERSEDED';
      if (i.targetDate === null) return null;
      const d = daysBetween(i.currentDate, i.targetDate);
      return d < 0 ? 'OVERDUE' : d <= 15 ? 'DUE_SOON' : 'UP_TO_DATE';
    };
    for (const c of fx.alertCases as any[]) {
      it(`${c.id} [${c.requirementId}] ${c.description}`, () => {
        expect(evalAlert(c.input)).toBe(c.expectedAlert);
      });
    }
  });

  describe('weightSeries', () => {
    (fx.weightSeries as any[]).forEach((s, k) => {
      it(`serie ${k} ${s.species} [${s.requirementId}] unidades enteras y deltas consistentes`, () => {
        s.points.forEach((p: any, i: number) => {
          expect(Number.isInteger(p.units)).toBe(true);
          expect(p.deltaUnits).toBe(i === 0 ? null : p.units - s.points[i - 1].units);
        });
      });
    });
  });

  describe('rbacMatrix', () => {
    it('REQ-RBAC-001 tiene 44 casos (11 acciones x 4 roles)', () => {
      expect(fx.rbacMatrix).toHaveLength(44);
    });
    for (const m of fx.rbacMatrix as any[]) {
      it(`${m.id} [${m.requirementId}] ${m.description}`, () => {
        expect(validators['validateRbacAction']!(m.action)).toBe(true);
        expect(validators['validateRbacRole']!(m.role)).toBe(true);
        expect(m.expected === 'valid').toBe(m.allowed);
        if (!m.allowed) expect(catalog[m.expected]).toMatchObject({ type: `urn:argos:error:${m.expected}`, status: expect.any(Number) });
      });
    }
  });

  describe('stateScenarios', () => {
    for (const s of fx.stateScenarios as any[]) {
      it(`${s.id} [${s.requirementId}] ${s.description}`, () => {
        const f = resolve(SPEC, 'state-machines', s.machine);
        const t = readFileSync(f, 'utf8');
        expect(t).toContain(s.requirementId);
        if (s.expected !== 'valid') {
          expect(catalog[s.expected]).toMatchObject({ type: `urn:argos:error:${s.expected}`, status: expect.any(Number) });
          if (s.machine !== 'auth-session.machine.json') expect(t).toContain(s.expected);
        }
      });
    }
  });

  describe('errorCases: cobertura del catálogo 3.0.0', () => {
    it('ERR-* cubre exactamente los 35 códigos vigentes y ninguno retirado', () => {
      const codes = (fx.errorCases as any[]).filter((c) => c.expected === 'valid').map((c) => c.requirementId);
      expect(new Set(codes).size).toBe(35);
      expect(Object.keys(catalog).sort()).toEqual([...codes].sort());
      const txt = JSON.stringify(fx);
      expect(txt).not.toContain('ERR-AUTH-USER-NOT-FOUND');
      expect(txt).not.toContain('ERR-HOUSE-MEMBER-ALREADY-EXISTS');
    });
    it('REQ-PET2-001 las mascotas de entities cubren las 8 especies', () => {
      expect(new Set((fx.entities.pets as any[]).map((p) => p.species)).size).toBe(8);
    });
  });
});
