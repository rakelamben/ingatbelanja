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
      expect(screen.getByDisplayValue("Superindo Test")).toBeTruthy();
    });

    // Check issues displayed
    expect(screen.getByText("Jumlah harga item tidak cocok dengan total struk.")).toBeTruthy();
    expect(screen.getByText("Kamera kurang fokus saat pengambilan foto.")).toBeTruthy();

    // Check line items rendered
    expect(screen.getByDisplayValue("Beras 5kg")).toBeTruthy();

    // Check disparity callout (45.000 vs 50.000)
    expect(screen.getByText(/berbeda dari total transaksi/i)).toBeTruthy();

    // Check photo preview
    const img = screen.getByAltText(/foto struk/i);
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("/api/v1/receipts/rcpt-123/image/processed");
  });

  it("prefills empty receipt fields and line items from the OCR candidate", async () => {
    vi.mocked(api.receipt).mockResolvedValueOnce({
      ...mockReceipt,
      merchant_name: null,
      purchased_on: null,
      total_minor: null,
      items: [],
      extraction_candidate: {
        merchant: "Toko Hasil OCR",
        merchant_line_ids: ["r1"],
        merchant_confidence: 0.96,
        purchased_on: "2026-11-25",
        date_line_ids: ["r2"],
        date_confidence: 0.93,
        currency: "IDR",
        total_minor: 50000,
        total_line_ids: ["r4"],
        total_confidence: 0.98,
        items: [
          {
            name: "Beras 5kg",
            qty_milli: 1000,
            unit_price_minor: null,
            amount_minor: 50000,
            line_ids: ["r3"],
            confidence: 0.91,
          },
        ],
        issues: [],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Toko Hasil OCR")).toBeTruthy();
      expect(screen.getByDisplayValue("Beras 5kg")).toBeTruthy();
    });

    expect(screen.getByLabelText<HTMLInputElement>(/tanggal transaksi/i).value).toBe(
      "2026-11-25",
    );
    expect(screen.getByLabelText<HTMLSelectElement>("Kategori").value).toBe("cat-1");
    expect(screen.getAllByDisplayValue("50000")).toHaveLength(2);
  });

  it("keeps persisted receipt fields and line items authoritative over OCR candidate", async () => {
    vi.mocked(api.receipt).mockResolvedValueOnce({
      ...mockReceipt,
      extraction_candidate: {
        merchant: "Toko OCR Berbeda",
        merchant_line_ids: ["r1"],
        merchant_confidence: 0.9,
        purchased_on: "2026-11-01",
        date_line_ids: ["r2"],
        date_confidence: 0.9,
        currency: "USD",
        total_minor: 99999,
        total_line_ids: ["r4"],
        total_confidence: 0.9,
        items: [
          {
            name: "Item OCR",
            qty_milli: 1000,
            unit_price_minor: null,
            amount_minor: 99999,
            line_ids: ["r3"],
            confidence: 0.9,
          },
        ],
        issues: [],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Superindo Test")).toBeTruthy();
      expect(screen.getByDisplayValue("Beras 5kg")).toBeTruthy();
    });

    expect(screen.queryByDisplayValue("Toko OCR Berbeda")).toBeNull();
    expect(screen.queryByDisplayValue("Item OCR")).toBeNull();
  });

  it("closes only the selected quality issue", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Kamera kurang fokus saat pengambilan foto.")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Tutup catatan Foto Buram" }));

    expect(screen.queryByText("Kamera kurang fokus saat pengambilan foto.")).toBeNull();
    expect(screen.getByText("Jumlah harga item tidak cocok dengan total struk.")).toBeTruthy();
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
      expect(screen.getByDisplayValue("Superindo Test")).toBeTruthy();
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
      expect(screen.getByDisplayValue("Superindo Test")).toBeTruthy();
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
      expect(screen.getByDisplayValue("Superindo Test")).toBeTruthy();
    });

    expect(screen.getByText(/konversi valuta asing \(usd → idr\)/i)).toBeTruthy();
  });
});
