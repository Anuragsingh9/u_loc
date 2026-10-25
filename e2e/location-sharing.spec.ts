import { test, expect } from '@playwright/test';

test.describe('Real-Time Location Sharing Application', () => {
  test('User Consent and Privacy Flow', async ({ page }) => {
    await page.goto('/');

    // Hero title is visible
    await expect(page.locator('.share-hero-title')).toContainText('Share Your Location');

    // Clicking Start Sharing opens the Consent Dialog
    await page.click('button:has-text("Start Sharing")');
    const dialog = page.locator('.consent-dialog');
    await expect(dialog).toBeVisible();

    // Verify privacy assurances
    await expect(dialog).toContainText('Location Sharing Consent');
    await expect(dialog).toContainText('not stored permanently');
    await expect(dialog).toContainText('stop sharing at any time');

    // Canceling consent dismisses dialog and returns to idle
    await page.click('button:has-text("Cancel")');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.share-hero-title')).toBeVisible();

    // Agreeing advances to pairing code entry
    await page.click('button:has-text("Start Sharing")');
    await page.click('button:has-text("I Agree")');
    await expect(page.locator('.share-code-header')).toContainText('Enter Pairing Code');
    await expect(page.locator('.code-input')).toBeVisible();
  });

  test('Admin Authentication Guard & Login', async ({ page }) => {
    // Attempting direct access to dashboard without auth redirects to login
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/.*\/admin/);

    // Invalid password shows error
    await page.fill('#admin-password', 'wrong-password');
    await page.click('button:has-text("Log In")');
    await expect(page.locator('.login-error')).toBeVisible();

    // Valid login redirects to dashboard
    await page.fill('#admin-password', 'admin-test-password-2026');
    await page.click('button:has-text("Log In")');
    await expect(page).toHaveURL(/.*\/admin\/dashboard/);
    await expect(page.locator('.dashboard-title')).toContainText('Dashboard');
  });

  test('End-to-End Session Creation, Sharer Connection, and Stop Sharing', async ({ browser }) => {
    // Context 1: Admin
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await adminPage.goto('/admin');
    await adminPage.fill('#admin-password', 'admin-test-password-2026');
    await adminPage.click('button:has-text("Log In")');
    await expect(adminPage).toHaveURL(/.*\/admin\/dashboard/);

    // Create a new session
    await adminPage.click('button:has-text("+ New Session")');
    await adminPage.fill('#session-label', 'E2E Fleet Vehicle');
    await adminPage.click('button:has-text("Create Session")');

    // Verify session card created
    const sessionCard = adminPage.locator('.session-card').first();
    await expect(sessionCard).toBeVisible();
    await expect(sessionCard).toContainText('E2E Fleet Vehicle');

    // Get pairing code
    const pairingCodeElement = sessionCard.locator('.pairing-code .font-mono');
    await expect(pairingCodeElement).toBeVisible();
    const pairingCode = (await pairingCodeElement.innerText()).trim();
    expect(pairingCode).toMatch(/^[A-Z0-9]{6}$/);

    // Context 2: Sharer (with mocked Geolocation)
    const sharerContext = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 },
    });
    const sharerPage = await sharerContext.newPage();

    await sharerPage.goto('/');
    await sharerPage.click('button:has-text("Start Sharing")');
    await sharerPage.click('button:has-text("I Agree")');

    // Enter the generated pairing code
    await sharerPage.fill('.code-input', pairingCode);
    await sharerPage.click('button:has-text("Connect")');

    // Sharer enters sharing state
    const stopBtn = sharerPage.locator('button:has-text("Stop Sharing")');
    await expect(stopBtn).toBeVisible({ timeout: 10000 });
    await expect(sharerPage.locator('.map-container')).toBeVisible();

    // In Admin dashboard, verify status changes to connected/sharing
    await expect(sessionCard.locator('.badge:has-text("connected")')).toBeVisible({ timeout: 10000 });

    // Expand session map in admin view
    await sessionCard.locator('.session-card-top').click();
    await expect(sessionCard.locator('.map-container')).toBeVisible();

    // Sharer stops sharing (session remains active in admin dashboard)
    await stopBtn.click();
    await expect(sharerPage.locator('.share-state--stopped')).toBeVisible();
    await expect(sharerPage.locator('.share-hero-title')).toContainText('Sharing Stopped');

    // Verify session remains active in admin dashboard unless admin deletes it
    await expect(sessionCard).toBeVisible();

    // Admin explicitly deletes / cancels the session
    adminPage.once('dialog', (dialog) => dialog.accept());
    await sessionCard.locator('button:has-text("End Session")').click();
    await expect(adminPage.locator('.session-card')).toHaveCount(0);

    await adminContext.close();
    await sharerContext.close();
  });
});
