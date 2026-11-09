import { describe, expect, it } from 'vitest';
import { STATE_ALERT_001 } from '../../../src/generated/machines/sanitary-alert.machine.ts';
import {
  alertBadge,
  alertCounters,
  canDeleteHousehold,
  contextOptions,
  formatAge,
  invitationsLabel,
  isDeleteConfirmed,
  memberActions,
  nextFocusIndex,
  OWNER_COLORS,
  OWNER_TEXT_COLOR,
  ownerBadge,
  petActions,
  routeRedirect,
  weightChart,
  weightRows,
} from '../../../src/presentation/web/view-model.ts';
import { alert, card, household, INVITEE, ME, OTHER, weight } from './presentation-fixtures.ts';

/** Contraste WCAG 2.1 entre dos colores #rrggbb. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('TASK-112: modelo de presentación puro', () => {
  it('[STATE-ALERT-001][REQ-UI-003] cada estado de la máquina se mapea 1:1 a su uiBadge del contrato y a Rojo, Ámbar, Verde o Gris', () => {
    const cases = [
      alert('OVERDUE', -3, 'Vencida', 'DANGER_RED'),
      alert('DUE_SOON', 0, 'Próxima a vencer (<= 15 días)', 'WARNING_AMBER'),
      alert('UP_TO_DATE', 40, 'Al día', 'SUCCESS_GREEN'),
      alert('SUPERSEDED', -100, 'Histórico reemplazado', 'NEUTRAL_GRAY'),
    ].map(alertBadge);
    expect(cases.map((b) => [b.status, b.uiBadge, b.color, b.text])).toEqual([
      ['OVERDUE', 'DANGER_RED', 'Rojo', 'Vencida · 3 días de retraso'],
      ['DUE_SOON', 'WARNING_AMBER', 'Ámbar', 'Próxima a vencer (<= 15 días) · vence hoy'],
      ['UP_TO_DATE', 'SUCCESS_GREEN', 'Verde', 'Al día · 40 días restantes'],
      ['SUPERSEDED', 'NEUTRAL_GRAY', 'Gris', 'Histórico reemplazado · reemplazada por un registro posterior'],
    ]);
    expect(cases.map((b) => b.uiBadge)).toEqual(cases.map((b) => STATE_ALERT_001.states[b.status].uiBadge));
  });

  it('[REQ-UI-003] los días restantes y de retraso usan singular y plural según la API', () => {
    expect([alertBadge(alert('OVERDUE', -1, 'Vencida', 'DANGER_RED')).text, alertBadge(alert('DUE_SOON', 1, 'Próxima', 'WARNING_AMBER')).text]).toEqual([
      'Vencida · 1 día de retraso',
      'Próxima · 1 día restante',
    ]);
  });

  it('[REQ-UI-001] la tarjeta muestra el contador de alertas OVERDUE y DUE_SOON y la edad de la API', () => {
    const c = card('p1', 'Argos');
    expect([alertCounters(c.alertsSummary), formatAge(c.computedAge), formatAge({ years: 1, months: 1, totalDays: 400 })]).toEqual([
      '1 vencidas · 2 próximas',
      '6 años, 6 meses',
      '1 año, 1 mes',
    ]);
  });

  it('[REQ-UI-007] fuera de hogar (colorToken null) no hay insignia de color pero sí el nombre del dueño en texto', () => {
    expect(ownerBadge({ userId: ME, displayName: 'Andrés', colorToken: null })).toEqual({ text: 'Dueño: Andrés', style: null });
  });

  it('[REQ-UI-007] en hogar cada OWNER_COLOR_n tiene fondo propio con texto blanco y contraste >= 4.5:1', () => {
    const badges = (Object.keys(OWNER_COLORS) as Array<keyof typeof OWNER_COLORS>).map((token) => ownerBadge({ userId: OTHER, displayName: 'María', colorToken: token }));
    const ratios = Object.values(OWNER_COLORS).map((hex) => contrast(hex, OWNER_TEXT_COLOR));
    expect([badges.length, new Set(Object.values(OWNER_COLORS)).size, badges.every((b) => b.text === 'Dueño: María' && b.style?.color === '#ffffff'), ratios.every((r) => r >= 4.5)]).toEqual([
      8,
      8,
      true,
      true,
    ]);
  });

  it('[REQ-UI-007] una mascota ajena (canEdit false) se marca "Solo lectura" y sin acciones de edición', () => {
    expect([petActions({ canEdit: false }), petActions({ canEdit: true })]).toEqual([
      { canEdit: false, readOnlyLabel: 'Solo lectura' },
      { canEdit: true, readOnlyLabel: null },
    ]);
  });

  it('[REQ-UI-002] la tabla de peso muestra variación absoluta y porcentual de la API con signo, y — sin medición anterior', () => {
    const rows = weightRows([weight('w3', '2026-03-10', 33, 0.6, 1.85), weight('w2', '2026-02-10', 32.4, -0.45, -1.37), weight('w1', '2026-01-10', 32.85, null, null)]);
    expect(rows.map((r) => [r.date, r.weight, r.deltaKg, r.deltaPercent])).toEqual([
      ['2026-03-10', '33.00 kg', '+0.60 kg', '+1.85 %'],
      ['2026-02-10', '32.40 kg', '−0.45 kg', '−1.37 %'],
      ['2026-01-10', '32.85 kg', '—', '—'],
    ]);
  });

  it('[REQ-UI-002] el gráfico SVG es determinista: orden cronológico, escala lineal y mismo SVG para el mismo input', () => {
    const entries = [weight('w3', '2026-03-10', 34, 2, 6.25), weight('w2', '2026-02-10', 32, -1, -3.03), weight('w1', '2026-01-10', 33, null, null)];
    const chart = weightChart(entries, 600, 220, 32);
    expect([chart.path, chart.points.map((p) => p.label), chart.minLabel, chart.maxLabel, weightChart(entries, 600, 220, 32)]).toEqual([
      'M32 110 L300 188 L568 32',
      ['2026-01-10: 33.00 kg', '2026-02-10: 32.00 kg', '2026-03-10: 34.00 kg'],
      '32.00 kg',
      '34.00 kg',
      chart,
    ]);
  });

  it('[REQ-UI-002] una sola medición o pesos iguales quedan centrados y sin división por cero', () => {
    expect([weightChart([weight('w1', '2026-01-10', 30, null, null)]).path, weightChart([weight('b', '2026-02-10', 30, 0, 0), weight('a', '2026-01-10', 30, null, null)]).path]).toEqual([
      'M300 110',
      'M32 110 L568 110',
    ]);
  });

  it('[REQ-UI-001] el teclado sigue WAI-ARIA APG: flechas con ciclo, Inicio y Fin; otras teclas no navegan', () => {
    expect(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'a'].map((k) => nextFocusIndex(k, 0, 3))).toEqual([1, 1, 2, 2, 0, 2, null]);
    expect([nextFocusIndex('ArrowRight', 2, 3), nextFocusIndex('Home', 0, 0)]).toEqual([0, null]);
  });

  it('[REQ-UI-001] el selector de contexto ofrece "Mis mascotas" y después cada hogar ACTIVE devuelto por la API', () => {
    expect(contextOptions([household('OWNER')]).map((o) => [o.id, o.label, o.context.kind])).toEqual([
      ['mine', 'Mis mascotas', 'MINE'],
      [household('OWNER').household.id, 'Casa', 'HOUSEHOLD'],
    ]);
  });

  it('[REQ-UI-005] las rutas protegidas redirigen a /login sin sesión y las públicas a / con sesión', () => {
    expect([routeRedirect(false, '/'), routeRedirect(false, '/households'), routeRedirect(false, '/login'), routeRedirect(true, '/login'), routeRedirect(true, '/register'), routeRedirect(true, '/backup')]).toEqual([
      '/login',
      '/login',
      null,
      '/',
      '/',
      null,
    ]);
  });

  it('[REQ-UI-006] el OWNER puede cancelar invitaciones, retirar miembros y eliminar; el MEMBER solo abandonar', () => {
    const owner = household('OWNER');
    const memberView = household('MEMBER');
    expect([
      owner.members.map((m) => memberActions(owner, m, ME)),
      memberView.members.map((m) => memberActions(memberView, m, OTHER)),
      canDeleteHousehold(owner),
      canDeleteHousehold(memberView),
      owner.members.map((m) => m.user.id),
    ]).toEqual([[[], ['REMOVE'], ['CANCEL_INVITATION']], [[], ['LEAVE']], true, false, [ME, OTHER, INVITEE]]);
  });

  it('[REQ-UI-006] el contador de invitaciones pendientes usa singular y plural', () => {
    expect([invitationsLabel(0), invitationsLabel(1), invitationsLabel(3)]).toEqual(['0 invitaciones pendientes', '1 invitación pendiente', '3 invitaciones pendientes']);
  });

  it('[REQ-PET-004] la eliminación exige escribir exactamente el nombre de la mascota', () => {
    expect([isDeleteConfirmed('Argos', 'Argos'), isDeleteConfirmed('argos', 'Argos'), isDeleteConfirmed('', 'Argos'), isDeleteConfirmed('Argos ', 'Argos')]).toEqual([true, false, false, false]);
  });
});
