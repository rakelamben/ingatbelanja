import { expect, test } from "@playwright/test";

const MOBILE_VIEWPORTS = [
  { name: "320px (Compact Mobile)", width: 320, height: 568 },
  { name: "375px (Standard Mobile)", width: 375, height: 667 },
  { name: "390px (Modern Mobile)", width: 390, height: 844 },
];

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`Mobile Layout Audit - ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("public auth pages have no horizontal overflow and render cleanly", async ({ page }) => {
      // Login page
      await page.goto("/login");
      const loginOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(loginOverflow).toBeFalsy();
      await expect(page.getByRole("heading", { name: /masuk ke catatanmu/i })).toBeVisible();

      // Register page
      await page.goto("/register");
      const registerOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(registerOverflow).toBeFalsy();
      await expect(page.getByRole("heading", { name: /buat ruang untuk belanjamu/i })).toBeVisible();
    });

    test("app dashboard and navigation adapt cleanly without horizontal overflow", async ({
      page,
    }) => {
      const username = `mobi_${vp.width}_${Date.now()}`;
      await page.goto("/register");
      await page.getByLabel("Nama tampilan").fill(`Tester ${vp.width}`);
      await page.getByLabel("Username").fill(username);
      await page.getByLabel("Password").fill("password-mobile-aman");
      await page.getByRole("button", { name: "Buat akun" }).click();
      await expect(page).toHaveURL(/\/app\/ledger\//);

      // Verify no horizontal overflow on dashboard
      const dashboardOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(dashboardOverflow).toBeFalsy();

      // Verify bottom nav items fit comfortably
      const bottomNav = page.locator(".bottom-nav");
      await expect(bottomNav).toBeVisible();
      const navItems = page.locator(".bottom-nav .nav-item");
      await expect(navItems).toHaveCount(5);

      // Verify History page layout
      await page.getByRole("link", { name: "Riwayat", exact: true }).click();
      await expect(page).toHaveURL(/\/history/);
      const historyOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(historyOverflow).toBeFalsy();

      // Verify Scan page layout
      await page.getByRole("link", { name: "Scan", exact: true }).click();
      await expect(page).toHaveURL(/\/scan/);
      const scanOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(scanOverflow).toBeFalsy();

      // Verify Manual input page layout
      await page.getByRole("link", { name: /atau catat manual/i }).click();
      await expect(page).toHaveURL(/\/manual/);
      const manualOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(manualOverflow).toBeFalsy();

      // Add a receipt to test review and reports with real data
      await page.getByLabel("Merchant").fill("Superindo Mobile");
      await page.getByLabel("Total (Rp)").fill("85000");
      await page.getByRole("button", { name: /simpan pengeluaran/i }).click();
      await expect(page).toHaveURL(/\/app\/ledger\//);

      // Verify History receipt row layout
      await page.getByRole("link", { name: "Riwayat", exact: true }).click();
      const receiptRow = page.locator(".receipt-row").first();
      await expect(receiptRow).toBeVisible({ timeout: 10000 });

      // Open receipt review
      await receiptRow.click();
      await expect(page).toHaveURL(/\/receipts\//);
      const reviewOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(reviewOverflow).toBeFalsy();

      // Verify line items side layout width (category select is not crushed)
      const catSelect = page.locator(".item-col-cat select").first();
      if (await catSelect.isVisible()) {
        const catBox = await catSelect.boundingBox();
        expect(catBox).not.toBeNull();
        // Should have plenty of room (>120px) on mobile
        expect(catBox!.width).toBeGreaterThan(120);
      }

      // Verify Trackers page layout
      await page.getByRole("link", { name: "Pelacak", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/trackers/);
      const trackersOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(trackersOverflow).toBeFalsy();

      // Verify Chat page layout
      await page.getByRole("link", { name: "Tanya AI", exact: true }).click();
      await expect(page).toHaveURL(/\/chat/);
      // Agree to AI notice
      const agreeBtn = page.getByRole("button", { name: /saya mengerti dan setuju/i });
      if (await agreeBtn.isVisible()) {
        await agreeBtn.click();
      }
      const chatOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(chatOverflow).toBeFalsy();
    });
  });
}
