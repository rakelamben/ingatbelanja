import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";
import { ManualPage } from "./ManualPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
      categories: vi.fn(),
      currencies: vi.fn(),
      createCategory: vi.fn(),
      manualReceipt: vi.fn(),
    },
  };
});

const ledger = {
  id: "ledger-1",
  name: "Buku Rumah",
  type: "personal" as const,
  currency: "IDR",
  role: "owner" as const,
  member_count: 1,
  sum_spend: 0,
  members: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/ledger/ledger-1/manual"]}>
      <Routes>
        <Route
          path="/app/ledger/:ledgerId"
          element={
            <LedgerProvider>
              <Outlet />
            </LedgerProvider>
          }
        >
          <Route path="manual" element={<ManualPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ManualPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledger).mockResolvedValue(ledger);
    vi.mocked(api.categories).mockResolvedValue({
      categories: [{ id: "system-food", name: "Makanan", is_system: true, ledger_id: null }],
    });
    vi.mocked(api.currencies).mockResolvedValue({
      currencies: [{ code: "IDR", name: "Rupiah", symbol: "Rp", minor_unit: 0 }],
    });
    vi.mocked(api.createCategory).mockResolvedValue({
      id: "category-custom",
      name: "Kebutuhan",
      is_system: false,
      ledger_id: "ledger-1",
    });
    vi.mocked(api.manualReceipt).mockResolvedValue({
      id: "receipt-1",
      ledger_id: "ledger-1",
      status: "confirmed",
      merchant: "Warung",
      purchased_on: "2026-11-20",
      currency: "IDR",
      total_minor: 12500,
      total_ledger_minor: 12500,
      fx_rate: "1",
      fx_date: "2026-11-20",
      fx_source: "none",
      items: [],
    });
  });

  it("submits a categorized line item to the ledger in the route context", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Nama Toko / Merchant"), {
      target: { value: "Warung" },
    });
    fireEvent.change(screen.getByLabelText(/total transaksi \(idr\)/i), {
      target: { value: "12500" },
    });
    fireEvent.change(screen.getByLabelText(/nama barang/i), {
      target: { value: "Nasi" },
    });
    fireEvent.change(screen.getByLabelText("Kategori"), {
      target: { value: "system-food" },
    });
    fireEvent.change(screen.getByLabelText(/subtotal \(idr\)/i), {
      target: { value: "12500" },
    });
    fireEvent.click(screen.getByRole("button", { name: /simpan pengeluaran/i }));

    await waitFor(() => {
      expect(api.manualReceipt).toHaveBeenCalledWith("ledger-1", {
        purchased_on: expect.any(String),
        currency: "IDR",
        amount_minor: 12500,
        merchant_name: "Warung",
        note: undefined,
        fx_rate: undefined,
        items: [
          {
            name: "Nasi",
            qty_milli: 1000,
            unit_price_minor: null,
            amount_minor: 12500,
            category_id: "system-food",
          },
        ],
      });
    });
  });

  it("creates a custom category inline and assigns it to the item", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /buat kategori/i }));
    fireEvent.change(screen.getByLabelText("Nama kategori baru"), {
      target: { value: "Kebutuhan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buat" }));

    await waitFor(() => {
      expect(api.createCategory).toHaveBeenCalledWith("ledger-1", "Kebutuhan");
      expect((screen.getByLabelText("Kategori") as HTMLSelectElement).value).toBe(
        "category-custom",
      );
    });
  });

  it("links back to the scan/input choices page", async () => {
    renderPage();
    expect(
      (await screen.findByRole("link", { name: /kembali ke pilihan input/i })).getAttribute(
        "href",
      ),
    ).toBe("/app/ledger/ledger-1/scan");
  });
});
