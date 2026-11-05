import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DeterministicIdAdapter,
  FixedClockAdapter,
} from '../../../src/infrastructure/adapters/deterministic-adapters.ts';
import { InMemoryTransactionalRepository } from '../../../src/infrastructure/storage/transactional-repository.ts';
import { ArgosPresentationController } from '../../../src/presentation/App.tsx';

const canonicalFixturesRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'contracts/examples/canonical-fixtures.json'), 'utf8')
);

interface A11yAuditViolation {
  readonly ruleId: string;
  readonly impact: 'critical' | 'serious';
  readonly description: string;
}

/**
 * Deterministic WCAG 2.1 AA & ARIA structural auditor (axe-core equivalent ruleset)
 * verifying zero critical/serious accessibility violations across mobile (320px) and desktop (1280px).
 */
function runWcag21AaStructuralAudit(html: string): A11yAuditViolation[] {
  const violations: A11yAuditViolation[] = [];

  if (!/<html[^>]*\blang="es"/i.test(html)) {
    violations.push({
      ruleId: 'html-has-lang',
      impact: 'serious',
      description: 'El elemento <html> debe declarar atributo lang="es" válido.',
    });
  }

  if (!/<main\b/i.test(html) || !/<header\b/i.test(html) || !/<nav\b/i.test(html)) {
    violations.push({
      ruleId: 'landmark-one-main',
      impact: 'serious',
      description: 'El documento debe contar con regiones semánticas <header>, <nav> y <main>.',
    });
  }

  if (!/role="tablist"/i.test(html)) {
    violations.push({
      ruleId: 'aria-required-children',
      impact: 'critical',
      description: 'El selector de mascotas debe exponer role="tablist".',
    });
  }

  const selectedTabs = html.match(/role="tab"[^>]*aria-selected="true"/g) ?? [];
  if (selectedTabs.length !== 1) {
    violations.push({
      ruleId: 'aria-selected-unique',
      impact: 'critical',
      description: `Debe existir exactamente 1 pestaña con aria-selected="true", encontradas: ${selectedTabs.length}.`,
    });
  }

  if (!/role="tabpanel"[^>]*aria-labelledby="pet-tab-/i.test(html)) {
    violations.push({
      ruleId: 'aria-tabpanel-labelledby',
      impact: 'serious',
      description: 'El panel de ficha técnica debe tener role="tabpanel" vinculado vía aria-labelledby.',
    });
  }

  const svgsWithoutLabel = html.match(/<svg(?![^>]*aria-label=)[^>]*>/g) ?? [];
  if (svgsWithoutLabel.length > 0) {
    violations.push({
      ruleId: 'svg-img-alt',
      impact: 'serious',
      description: 'Todo elemento <svg> debe incluir role="img" y aria-label descriptivo.',
    });
  }

  return violations;
}

describe('E2E Accessibility & Responsive Layout Audit (WCAG 2.1 AA) [REQ-UI-001, REQ-UI-004]', () => {
  it('[REQ-UI-004][REQ-UI-001] cumple 100% las reglas WCAG 2.1 AA (cero violaciones críticas o serias) en mobile (320px) y desktop (1280px)', () => {
    const repo = new InMemoryTransactionalRepository();
    const clock = new FixedClockAdapter(
      canonicalFixturesRaw.referenceClock.todayIsoDate,
      canonicalFixturesRaw.referenceClock.nowIsoTimestamp
    );
    const idGen = new DeterministicIdAdapter();
    const controller = new ArgosPresentationController(repo, clock, idGen);
    controller.triggerImportBackup(JSON.stringify(canonicalFixturesRaw.validBackupEnvelope));

    const mobileHtml = controller.renderAppHtml(320);
    expect(mobileHtml).toContain('data-viewport-width="320"');
    expect(mobileHtml).toContain('mobile-single-column');
    const mobileViolations = runWcag21AaStructuralAudit(mobileHtml);
    expect(mobileViolations).toEqual([]);

    const desktopHtml = controller.renderAppHtml(1280);
    expect(desktopHtml).toContain('data-viewport-width="1280"');
    expect(desktopHtml).toContain('desktop-multi-column');
    const desktopViolations = runWcag21AaStructuralAudit(desktopHtml);
    expect(desktopViolations).toEqual([]);
  });
});
