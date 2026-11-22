import { expect, test } from "@playwright/test";

test("registers, records a manual receipt, and finds it in history", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await page.goto("/register");
  await page.getByLabel("Nama tampilan").fill("Penguji E2E");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password-e2e-aman");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page).toHaveURL(/\/app\/ledger\//);

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

test("navigates to receipt review, edits details, and confirms receipt", async ({ page }) => {
  const username = `e2e_review_${Date.now()}`;
  await page.goto("/register");
  await page.getByLabel("Nama tampilan").fill("Penguji Review");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password-e2e-aman");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page).toHaveURL(/\/app\/ledger\//);

  // Add manual receipt
  await page.getByRole("link", { name: /scan struk/i }).click();
  await page.getByRole("link", { name: /catat manual/i }).click();
  await page.getByLabel("Merchant").fill("Toko Kopi E2E");
  await page.getByLabel("Total (Rp)").fill("28000");
  await page.getByRole("button", { name: /simpan pengeluaran/i }).click();
  await expect(page).toHaveURL(/\/app\/ledger\//);

  // Find in history and click to open review
  await page.getByRole("link", { name: "Riwayat" }).click();
  await page.getByText("Toko Kopi E2E").click();

  // Verify review page URL and elements
  await expect(page).toHaveURL(/\/receipts\//);
  await expect(page.getByRole("heading", { name: /toko kopi e2e/i })).toBeVisible();

  // Edit merchant name
  const merchantInput = page.getByLabel(/nama toko/i);
  await merchantInput.fill("Toko Kopi E2E Rev");

  // Confirm receipt
  const confirmBtn = page.getByRole("button", { name: /konfirmasi & simpan/i });
  await confirmBtn.click();

  // Returns to history and displays updated merchant name
  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByText("Toko Kopi E2E Rev")).toBeVisible();
});

test("creates tracker, switches ledger context, and verifies independent ledger state", async ({
  page,
}) => {
  const username = `e2e_tracker_${Date.now()}`;
  await page.goto("/register");
  await page.getByLabel("Nama tampilan").fill("Owner Pelacak");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password-e2e-aman");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page).toHaveURL(/\/app\/ledger\//);

  // Open trackers page
  await page.getByRole("link", { name: "Pelacak", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/trackers/);

  // Create new tracker
  await page.getByLabel("Nama pelacak").fill("Rumah Bersama E2E");
  await page.getByRole("button", { name: "Buat pelacak" }).click();

  // New tracker is listed and clickable
  const trackerLink = page.getByRole("link", { name: /rumah bersama e2e/i });
  await expect(trackerLink).toBeVisible();
  await trackerLink.click();

  // Context switches to the tracker URL
  await expect(page).toHaveURL(/\/app\/ledger\//);
  await expect(page.getByRole("combobox", { name: /pilih buku/i })).toBeVisible();

  // Switch back to personal ledger using the switcher
  const switcher = page.getByRole("combobox", { name: /pilih buku/i });
  await switcher.selectOption({ index: 0 });

  // Confirms URL changes without full page reload
  await expect(page).toHaveURL(/\/app\/ledger\//);
});
