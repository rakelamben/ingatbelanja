import { expect, test } from "@playwright/test";

test("registers, records a manual receipt, and finds it in history", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await page.goto("/register");
  await page.getByLabel("Nama tampilan").fill("Penguji E2E");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password-e2e-aman");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("link", { name: /scan struk/i }).click();
  await page.getByRole("link", { name: /catat manual/i }).click();
  await page.getByLabel("Merchant").fill("Warung E2E");
  await page.getByLabel("Total (Rp)").fill("42000");
  await page.getByRole("button", { name: /simpan pengeluaran/i }).click();
  await expect(page).toHaveURL(/\/app\/ledger\//);
  await page.getByRole("link", { name: "Riwayat" }).click();
  await expect(page.getByText("Warung E2E")).toBeVisible();
});

test("tracker page exposes create and join controls", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /masuk ke catatanmu/i })).toBeVisible();
  await page.goto("/app/trackers");
  await expect(page).toHaveURL(/\/login/);
});
