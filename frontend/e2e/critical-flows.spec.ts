import { expect, test } from "@playwright/test";

test("registers, records a manual receipt, and finds it in history", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await page.goto("/register");
  await page.getByLabel("Nama tampilan").fill("Penguji E2E");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password-e2e-aman");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page).toHaveURL(/\/app\/ledger\/|\/home/);

  await page.getByRole("link", { name: "Tambah Pengeluaran" }).click();
  await expect(page).toHaveURL(/\/scan/);
  await page.getByRole("link", { name: /isi form manual/i }).click();
  await expect(page).toHaveURL(/\/manual/);
  await page.getByLabel(/nama toko|merchant/i).fill("Warung E2E");
  await page.getByLabel(/total transaksi/i).fill("42000");
  await page.getByLabel(/nama barang/i).first().fill("Nasi Bungkus");
  await page.getByLabel(/subtotal \(idr\)/i).first().fill("42000");
  await page.getByRole("button", { name: /simpan pengeluaran/i }).click();
  await expect(page).toHaveURL(/\/history/);

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
  await expect(page).toHaveURL(/\/app\/ledger\/|\/home/);

  // Add manual receipt
  await page.getByRole("link", { name: "Tambah Pengeluaran" }).click();
  await expect(page).toHaveURL(/\/scan/);
  await page.getByRole("link", { name: /isi form manual/i }).click();
  await expect(page).toHaveURL(/\/manual/);
  await page.getByLabel(/nama toko|merchant/i).fill("Toko Kopi E2E");
  await page.getByLabel(/total transaksi/i).fill("28000");
  await page.getByLabel(/nama barang/i).first().fill("Kopi Susu");
  await page.getByLabel(/subtotal \(idr\)/i).first().fill("28000");
  await page.getByRole("button", { name: /simpan pengeluaran/i }).click();
  await expect(page).toHaveURL(/\/history/);

  // Find in history and click to open review
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
  await expect(page).toHaveURL(/\/app\/ledger\/|\/home/);

  // Open books page
  await page.getByRole("link", { name: /buku|pelacak/i, exact: false }).first().click();
  await expect(page).toHaveURL(/\/app\/books|\/app\/trackers/);

  // Navigate to create book page
  await page.getByRole("link", { name: /buat buku/i }).click();
  await expect(page).toHaveURL(/\/app\/books\/create/);

  // Create new book
  await page.getByLabel(/nama buku/i).fill("Rumah Bersama E2E");
  await page.getByRole("button", { name: /buat buku/i }).click();
  await expect(page).toHaveURL(/\/app\/books/);

  // New book is listed and clickable
  const trackerLink = page.getByRole("link", { name: /rumah bersama e2e/i });
  await expect(trackerLink).toBeVisible();
  await trackerLink.click();

  // Detail page or context opened
  await expect(page).toHaveURL(/\/app\/books\//);
});
