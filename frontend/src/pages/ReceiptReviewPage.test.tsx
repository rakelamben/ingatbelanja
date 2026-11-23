import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, Outlet } from "react-router-dom";
import { ReceiptReviewPage } from "./ReceiptReviewPage";
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
      confirmReceipt: vi.fn(),
      deleteReceipt: vi.fn(),
      reprocessReceipt: vi.fn(),
      receiptImageUrl: vi.fn((id, kind) => `/api/v1/receipts/${id}/image/${kind}`),
    },
  };
});

const mockReceipt: ReceiptDetail = {
  id: "rcpt-123",
  ledger_id: "ledger-abc",
  status: "needs_review",
  source: "photo",
  merchant_name: "Superindo Test",
  purchased_on: "2026-11-20",
  currency: "IDR",
  total_minor: 50000,
  total_ledger_minor: 50000,
  fx_rate: null,
  fx_date: null,
  fx_source: null,
  issues: ["TOTAL_MISMATCH", "BLURRY"],
  note: "Belanja mingguan",
  created_by: { id: "user-1", username: "tester", display_name: "Tester" },
  created_at: "2026-11-20T00:00:00Z",
  updated_at: "2026-11-20T00:00:00Z",
  items: [
    {
      id: "item-1",
      name: "Beras 5kg",
      qty_milli: 1000,
      unit_price_minor: 45000,
      amount_minor: 45000,
      category_id: "cat-1",
      category_name: "Makanan",
    },
  ],
};

describe("ReceiptReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledger).mockResolvedValue({
      id: "ledger-abc",
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
        { id: "cat-1", name: "Makanan", is_system: true, ledger_id: null },
        { id: "cat-2", name: "Transport", is_system: true, ledger_id: null },
      ],
    });
    vi.mocked(api.currencies).mockResolvedValue({
      currencies: [
        { code: "IDR", name: "Rupiah", symbol: "Rp", minor_unit: 0 },
        { code: "USD", name: "Dolar AS", symbol: "$", minor_unit: 2 },
      ],
    });
  });

  function renderPage(initialEntry = "/app/ledger/ledger-abc/receipts/rcpt-123") {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/app/ledger/:ledgerId"
            element={
              <LedgerProvider>
                <Outlet />
              </LedgerProvider>
            }
          >
            <Route
              path="receipts/:receiptId"
              element={<ReceiptReviewPage />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders receipt details, quality issues, and photo preview", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Superindo Test" })).toBeTruthy();
    });

    // Check issues displayed
    expect(screen.getByText("Selisih Total & Rincian")).toBeTruthy();
    expect(screen.getByText("Foto Buram")).toBeTruthy();

    // Check line items rendered
    expect(screen.getByDisplayValue("Beras 5kg")).toBeTruthy();

    // Check disparity callout (45.000 vs 50.000)
    expect(screen.getByText(/berbeda dari total transaksi/i)).toBeTruthy();

    // Check photo preview
    const img = screen.getByAltText(/foto struk/i);
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("/api/v1/receipts/rcpt-123/image/processed");
  });

  it("highlights the item selected from the home feed", async () => {
    renderPage("/app/ledger/ledger-abc/receipts/rcpt-123?item=item-1");

    await waitFor(() => {
      expect(document.getElementById("receipt-item-item-1")?.classList.contains("is-selected")).toBe(
        true,
      );
    });
  });

  it("allows adding a new item and synchronizing total", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Superindo Test" })).toBeTruthy();
    });

    const addItemBtn = screen.getByRole("button", { name: /tambah item/i });
    fireEvent.click(addItemBtn);

    // Now there should be 2 items
    expect(screen.getByText(/rincian item belanja \(2\)/i)).toBeTruthy();

    // Synchronize total with items sum
    const syncBtn = screen.getByRole("button", { name: /gunakan total rincian/i });
    fireEvent.click(syncBtn);

    // Total input should be updated to 45000
    const totalInput = screen.getByLabelText(/total transaksi \(idr\)/i);
    expect((totalInput as HTMLInputElement).value).toBe("45000");
  });

  it("calls confirmReceipt when confirming receipt", async () => {
    vi.mocked(api.confirmReceipt).mockResolvedValue({
      id: "rcpt-123",
      status: "confirmed",
      updated_at: "2026-11-20T01:00:00Z",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Superindo Test" })).toBeTruthy();
    });

    const confirmBtn = screen.getByRole("button", { name: /konfirmasi & simpan/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.confirmReceipt).toHaveBeenCalledWith("rcpt-123");
    });
  });

  it("renders FX panel when currency is foreign", async () => {
    vi.mocked(api.receipt).mockResolvedValue({
      ...mockReceipt,
      currency: "USD",
      total_minor: 1500,
      fx_rate: "16000",
      fx_date: "2026-11-20",
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Superindo Test" })).toBeTruthy();
    });

    expect(screen.getByText(/konversi valuta asing \(usd → idr\)/i)).toBeTruthy();
  });
});
