import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HistoryPage } from "./HistoryPage";
import { api } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
      receipts: vi.fn(),
    },
  };
});

describe("HistoryPage (Sprint D)", () => {
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
    vi.mocked(api.receipts).mockResolvedValue({
      items: [
        {
          id: "rcpt-1",
          status: "confirmed",
          merchant_name: "Superindo Karawaci",
          purchased_on: "2026-11-20",
          currency: "IDR",
          total_minor: 75000,
          total_ledger_minor: 75000,
          updated_at: "2026-11-20T00:00:00Z",
        },
      ],
      next_cursor: null,
    });
  });

  function renderHistory() {
    return render(
      <MemoryRouter initialEntries={["/app/ledger/ledger-main/history"]}>
        <Routes>
          <Route
            path="/app/ledger/:ledgerId/history"
            element={
              <LedgerProvider>
                <HistoryPage />
              </LedgerProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders transaction history and links to expense details", async () => {
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("Superindo Karawaci")).toBeTruthy();
    });

    const link = screen.getByRole("link", { name: /superindo karawaci/i });
    expect(link.getAttribute("href")).toBe("/app/ledger/ledger-main/receipts/rcpt-1/detail");
    expect(screen.getByRole("link", { name: /kembali ke beranda/i }).getAttribute("href")).toBe(
      "/home",
    );
  });

  it("debounces search input and requests filtered receipts", async () => {
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("Superindo Karawaci")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/cari merchant/i);
    fireEvent.change(searchInput, { target: { value: "Apotek" } });

    // Immediately after typing, receipts is not yet called with Apotek
    expect(api.receipts).not.toHaveBeenCalledWith("ledger-main", "?q=Apotek");

    // After debounce timeout, receipts is queried with debounced query
    await waitFor(
      () => {
        expect(api.receipts).toHaveBeenCalledWith("ledger-main", "?q=Apotek");
      },
      { timeout: 1000 },
    );
  });

  it("displays ErrorState with retry button when fetch fails", async () => {
    vi.mocked(api.receipts).mockRejectedValueOnce(new Error("Network failed"));

    renderHistory();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /gagal memuat riwayat/i })).toBeTruthy();
    });

    const retryBtn = screen.getByRole("button", { name: /coba lagi/i });
    expect(retryBtn).toBeTruthy();

    vi.mocked(api.receipts).mockResolvedValueOnce({
      items: [
        {
          id: "rcpt-2",
          status: "confirmed",
          merchant_name: "Warung Sukses",
          purchased_on: "2026-11-20",
          currency: "IDR",
          total_minor: 15000,
          total_ledger_minor: 15000,
          updated_at: "2026-11-20T00:00:00Z",
        },
      ],
      next_cursor: null,
    });

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("Warung Sukses")).toBeTruthy();
    });
  });
});
