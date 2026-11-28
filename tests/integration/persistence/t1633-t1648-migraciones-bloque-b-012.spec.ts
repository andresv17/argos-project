import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1633 y T1648 (Feature 012, Bloque B, #23): migraciones SQLite 0036 (`dispute_evidence`, `ip_rate_events`) y 0037 (`admin_identities.person_id`, columnas `*_admin_id` / `*_person_id` de `owner_requests`).
 * La paridad estática con PostgreSQL 0032 y 0033 vive en `schema-parity.spec.ts`.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-005, REQ-CHP12-008, REQ-CHP12-009, INV-CHP12-004, INV-CHP12-005, INV-CHP12-006, NFR-012-006
 */
const NOW = '2026-11-27T10:00:00.000Z';
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const open = () => openSqliteDatabase(IN_MEMORY_DATABASE);

function seedRequest(db: ReturnType<typeof open>, id: string): void {
  db.prepare("INSERT INTO owner_requests (id, action, pet_version, status, created_at, expires_at, dispute_reason, chip_hmac, chip_last4) VALUES (?, 'CHIP_DISPUTE', 1, 'UNDER_REVIEW', ?, ?, 'CHIP_APPROPRIATION', 'h', '1234')").run(id, NOW, NOW);
}
function seedAdmin(db: ReturnType<typeof open>, id: string, email: string, personId: string | null): void {
  db.prepare("INSERT INTO admin_identities (admin_id, provider, provider_subject, email, created_at, person_id) VALUES (?, 'GOOGLE', ?, ?, ?, ?)").run(id, `sub-${id}`, email, NOW, personId);
}

describe('T1633 [INV-CHP12-004][INV-CHP12-005] migración 0036 (dispute_evidence, ip_rate_events)', () => {
  it('dispute_evidence: tipos cerrados, FK RESTRICT (el expediente no se borra con evidencia) y clave de objeto única', () => {
    const db = open();
    seedRequest(db, ID(1));
    const insert = db.prepare('INSERT INTO dispute_evidence (id, request_id, object_key, content_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run(ID(10), ID(1), 'claims/a/b', 'application/pdf', 10, NOW);
    expect(() => insert.run(ID(11), ID(1), 'claims/a/c', 'text/html', 10, NOW)).toThrow(/CHECK constraint failed/);
    expect(() => insert.run(ID(12), ID(1), 'claims/a/d', 'image/png', 0, NOW)).toThrow(/CHECK constraint failed/);
    expect(() => insert.run(ID(13), ID(1), 'claims/a/b', 'image/png', 5, NOW)).toThrow(/UNIQUE constraint failed/);
    expect(() => insert.run(ID(14), ID(99), 'claims/a/e', 'image/png', 5, NOW)).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => db.prepare('DELETE FROM owner_requests WHERE id = ?').run(ID(1))).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare('DELETE FROM dispute_evidence WHERE id = ?').run(ID(10));
    db.prepare('DELETE FROM owner_requests WHERE id = ?').run(ID(1));
    expect(db.prepare('SELECT count(*) FROM owner_requests').pluck().get()).toBe(0);
    db.close();
  });

  it('ip_rate_events: ámbitos CHIP_LOOKUP y CHIP_MULTIPART, sin FK a users y con el contador global ip_hmac = "*"', () => {
    const db = open();
    const insert = db.prepare('INSERT INTO ip_rate_events (id, scope, ip_hmac, occurred_at) VALUES (?, ?, ?, ?)');
    insert.run(ID(20), 'CHIP_LOOKUP', 'abc', NOW);
    insert.run(ID(21), 'CHIP_MULTIPART', '*', NOW);
    expect(() => insert.run(ID(22), 'OTRO', 'abc', NOW)).toThrow(/CHECK constraint failed/);
    expect(() => insert.run(ID(23), 'CHIP_LOOKUP', '', NOW)).toThrow(/CHECK constraint failed/);
    expect(db.prepare("SELECT count(*) FROM pragma_foreign_key_list('ip_rate_events')").pluck().get()).toBe(0);
    db.close();
  });

  it('no toca pets_microchip_global', () => {
    const db = open();
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'pets_microchip_global'").pluck().get()).toMatch(/UNIQUE INDEX pets_microchip_global ON pets \(microchip_id\) WHERE microchip_id IS NOT NULL/);
    db.close();
  });
});

describe('T1648 [REQ-CHP12-009][INV-CHP12-006] migración 0037 (person_id y columnas de administrador)', () => {
  it('admin_identities.person_id: NULL permitido, 8..64 de [A-Za-z0-9_-] y UNIQUE parcial', () => {
    const db = open();
    seedAdmin(db, ID(30), 'a@x.test', null);
    seedAdmin(db, ID(31), 'b@x.test', null);
    seedAdmin(db, ID(32), 'c@x.test', 'persona_0001');
    expect(() => seedAdmin(db, ID(33), 'd@x.test', 'persona_0001')).toThrow(/UNIQUE constraint failed/);
    expect(() => seedAdmin(db, ID(34), 'e@x.test', 'corto')).toThrow(/CHECK constraint failed/);
    expect(() => seedAdmin(db, ID(35), 'f@x.test', 'x'.repeat(65))).toThrow(/CHECK constraint failed/);
    expect(() => seedAdmin(db, ID(36), 'g@x.test', 'tiene espacio 1')).toThrow(/CHECK constraint failed/);
    expect(() => seedAdmin(db, ID(37), 'h@x.test', 'correo@x.test1')).toThrow(/CHECK constraint failed/);
    db.close();
  });

  it('owner_requests: *_admin_id con FK RESTRICT a admin_identities, *_person_id sin FK y columnas de tiempo', () => {
    const db = open();
    seedAdmin(db, ID(40), 'op@x.test', 'persona_0040');
    seedRequest(db, ID(41));
    db.prepare("UPDATE owner_requests SET resolved_by_admin_id = ?, resolved_by_person_id = 'persona_0040', second_approved_at = ? WHERE id = ?").run(ID(40), NOW, ID(41));
    expect(() => db.prepare('UPDATE owner_requests SET second_approver_admin_id = ? WHERE id = ?').run(ID(98), ID(41))).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => db.prepare('DELETE FROM admin_identities WHERE admin_id = ?').run(ID(40))).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare("UPDATE owner_requests SET second_approver_person_id = 'persona_sin_fk' WHERE id = ?").run(ID(41));
    expect(() => db.prepare("UPDATE owner_requests SET second_approver_person_id = 'corto' WHERE id = ?").run(ID(41))).toThrow(/CHECK constraint failed/);
    const fks = db.prepare("SELECT \"from\" AS col, on_delete AS action FROM pragma_foreign_key_list('owner_requests') WHERE \"table\" = 'admin_identities' ORDER BY col").all();
    expect(fks).toEqual([{ col: 'resolved_by_admin_id', action: 'RESTRICT' }, { col: 'second_approver_admin_id', action: 'RESTRICT' }]);
    db.close();
  });
});
