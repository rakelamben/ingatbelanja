import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HistoryExpenseDetailPage } from "./HistoryExpenseDetailPage";
import { api, type ReceiptDetail } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
      receipt: vi.fn(),
      categories: vi.fn(),
      currencies: vi.fn(),
      patchReceipt: vi.fn(),
      createCategory: vi.fn(),
    },
  };
});

const mockReceipt: ReceiptDetail = {
  id: "rcpt-1",
  ledger_id: "ledger-main",
  status: "confirmed",
  source: "manual",
  merchant_name: "Superindo",
  purchased_on: "2026-11-20",
  currency: "IDR",
  total_minor: 75000,
  total_ledger_minor: 75000,
  fx_rate: null,
  fx_date: null,
  fx_source: null,
  issues: [],
  note: "Belanja mingguan",
  created_by: { id: "user-1", username: "tester", display_name: "Tester" },
  created_at: "2026-11-20T00:00:00Z",
  updated_at: "2026-11-20T00:00:00Z",
  items: [
    {
      id: "item-1",
      name: "Beras",
      qty_milli: 1000,
      unit_price_minor: 75000,
      amount_minor: 75000,
      category_id: "category-1",
      category_name: "Makanan",
    },
  ],
};

describe("HistoryExpenseDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledger).mockResolvedValue({
      id: "ledger-main",
      name: "Buku Utama",
      type: "personal",
      currency: "IDR",
      role: "owner",
      member_count: 1,
      sum_spend: 0,
      members: [],
    });
    vi.mocked(api.receipt).mockResolvedValue(mockReceipt);
    vi.mocked(api.categories).mockResolvedValue({
      categories: [
        { id: "category-1", name: "Makanan", is_system: true, ledger_id: null },
      ],
    });
    vi.mocked(api.currencies).mockResolvedValue({
      currencies: [{ code: "IDR", name: "Rupiah", symbol: "Rp", minor_unit: 0 }],
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter
        initialEntries={["/app/ledger/ledger-main/receipts/rcpt-1/detail"]}
      >
        <Routes>
          <Route
            path="/app/ledger/:ledgerId/receipts/:receiptId/detail"
            element={
              <LedgerProvider>
                <HistoryExpenseDetailPage />
              </LedgerProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("starts read-only and cancel restores values without showing a toast", async () => {
    renderPage();

    const merchantField = await screen.findByLabelText<HTMLInputElement>(
      "Nama Toko / Merchant",
    );
    expect(merchantField.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Tambah Item" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Tambah Item" })).toBeTruthy();
    fireEvent.change(merchantField, { target: { value: "Toko Baru" } });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(merchantField.value).toBe("Superindo");
    expect(merchantField.disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    expect(api.patchReceipt).not.toHaveBeenCalled();
  });

  it("saves edits, returns to read-only, and shows a success toast", async () => {
    vi.mocked(api.patchReceipt).mockImplementation(async (_receiptId, payload) => ({
      ...mockReceipt,
      merchant_name: payload.merchant_name ?? null,
      updated_at: "2026-11-21T00:00:00Z",
    }));

    renderPage();
    const merchantField = await screen.findByLabelText<HTMLInputElement>(
      "Nama Toko / Merchant",
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(merchantField, { target: { value: "Toko Baru" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Pengeluaran berhasil diperbarui.",
    );
    await waitFor(() => {
      expect(merchantField.value).toBe("Toko Baru");
      expect(merchantField.disabled).toBe(true);
    });
    expect(api.patchReceipt).toHaveBeenCalledWith(
      "rcpt-1",
      expect.objectContaining({ merchant_name: "Toko Baru" }),
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });
});
