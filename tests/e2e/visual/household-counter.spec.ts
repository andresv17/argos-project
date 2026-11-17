/**
 * E2E del contador de hogares (hallazgo 6-B de Neo): al crear un hogar, el contador de "Hogares" del
 * encabezado se actualiza sin recargar la página y el hogar aparece en la lista de la pantalla. Con tres navegadores
 * (propietaria, CAREGIVER y READER) los contadores de Hogares y de invitaciones pendientes siguen a cada persona
 * cuando acepta, rechaza, es expulsada o abandona (REQ-HOUSE2-004, INV-ACC2-001, SC-017).
 */
import { expect, test } from '@playwright/test';
import { apiCall, registerViaApi } from './e2e-support.ts';

test.describe('contador de hogares (tests/e2e/visual)', () => {
  test('[REQ-HOUSE-001][REQ-UI-006] crear un hogar actualiza el contador de Hogares sin recargar y lo lista', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await registerViaApi(context.request, 'contador.e2e', 'Contador', 'ContadorClave2026!');
    await page.goto('/households');
    const counter = page.locator('[data-household-count]');
    await expect(counter).toHaveAttribute('data-household-count', '0');
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });

    await page.getByLabel('Nombre del nuevo hogar').fill('Casa Contador');
    await page.getByRole('button', { name: 'Crear hogar' }).click();

    await expect(page.getByRole('heading', { name: /Casa Contador/, level: 3 })).toBeVisible();
    await expect(counter).toHaveAttribute('data-household-count', '1');
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);

    await page.getByRole('link', { name: /Mascotas/ }).click();
    await expect(page.getByRole('tab', { name: 'Casa Contador' })).toBeVisible();
    await context.close();
  });

  test('[REQ-HOUSE2-004][INV-ACC2-001][SC-017] tres navegadores por rol: los contadores de hogares e invitaciones de propietaria, CAREGIVER y READER cambian al aceptar, rechazar y ser expulsado', async ({ browser }) => {
    const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext()];
    const [owner, caregiver, reader] = contexts as [(typeof contexts)[0], (typeof contexts)[0], (typeof contexts)[0]];
    const [ownerPage, caregiverPage, readerPage] = await Promise.all(contexts.map((context) => context.newPage()));
    const households = (page: NonNullable<typeof ownerPage>) => page.locator('[data-household-count]');
    const pending = (page: NonNullable<typeof ownerPage>) => page.locator('[data-pending-invitations]');
    try {
      await registerViaApi(owner.request, 'duena.e2e', 'Dueña', 'DuenaClave2026!');
      await registerViaApi(caregiver.request, 'cuidador.e2e', 'Cuidador', 'CuidadorClave2026!');
      await registerViaApi(reader.request, 'lector.e2e', 'Lector', 'LectorClave2026!');
      const created = await apiCall<{ household: { id: string } }>(owner.request, 'POST', '/households', { name: 'Casa Tres' });
      const householdId = created.body.household.id;
      expect((await apiCall(owner.request, 'POST', `/households/${householdId}/invitations`, { username: 'cuidador.e2e', roleOnJoin: 'CAREGIVER' })).status).toBe(202);
      expect((await apiCall(owner.request, 'POST', `/households/${householdId}/invitations`, { username: 'lector.e2e', roleOnJoin: 'READER' })).status).toBe(202);

      await Promise.all([ownerPage!.goto('/households'), caregiverPage!.goto('/households'), readerPage!.goto('/households')]);
      await expect(households(ownerPage!)).toHaveAttribute('data-household-count', '1');
      await expect(pending(ownerPage!)).toHaveAttribute('data-pending-invitations', '0');
      for (const page of [caregiverPage!, readerPage!]) {
        await expect(households(page)).toHaveAttribute('data-household-count', '0');
        await expect(pending(page)).toHaveAttribute('data-pending-invitations', '1');
      }

      await caregiverPage!.getByRole('button', { name: 'Aceptar' }).click();
      await expect(households(caregiverPage!)).toHaveAttribute('data-household-count', '1');
      await expect(pending(caregiverPage!)).toHaveAttribute('data-pending-invitations', '0');
      await readerPage!.getByRole('button', { name: 'Rechazar' }).click();
      await expect(pending(readerPage!)).toHaveAttribute('data-pending-invitations', '0');
      await expect(households(readerPage!)).toHaveAttribute('data-household-count', '0');

      const members = await apiCall<{ members: Array<{ membership: { userId: string; username: string } }> }>(owner.request, 'GET', `/households/${householdId}`);
      const caregiverId = members.body.members.find((m) => m.membership.username === 'cuidador.e2e')?.membership.userId;
      expect((await apiCall(owner.request, 'DELETE', `/households/${householdId}/members/${caregiverId}`)).status).toBe(204);
      await caregiverPage!.reload();
      await expect(households(caregiverPage!)).toHaveAttribute('data-household-count', '0');
      await expect(caregiverPage!.getByText('Aún no perteneces a ningún hogar.')).toBeVisible();
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
