import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";
import { HomePage } from "./HomePage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
      summary: vi.fn(),
      recentExpenseItems: vi.fn(),
    },
  };
});

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledger).mockResolvedValue({
      id: "ledger-home",
      name: "Buku Rumah",
      type: "personal",
      currency: "IDR",
      role: "owner",
      member_count: 1,
      members: [],
    });
    vi.mocked(api.summary).mockResolvedValue({
      total_minor: 450000,
      count: 3,
      by_category: [],
      by_day: [],
      top_merchants: [],
      compare: { diff_minor: 0, pct_bp: 0 },
      currency: "IDR",
    });
    vi.mocked(api.recentExpenseItems).mockResolvedValue({
      items: [
        {
          id: "item-new",
          receipt_id: "receipt-new",
          category_id: "system-food",
          category_name: "Makanan",
          name: "",
          created_at: "2026-11-20T12:30:00Z",
          amount_minor: 125000,
          amount_ledger_minor: 125000,
          currency: "IDR",
          ledger_currency: "IDR",
        },
      ],
    });
  });

  function renderHome() {
    return render(
      <MemoryRouter initialEntries={["/app/ledger/ledger-home"]}>
        <Routes>
          <Route
            path="/app/ledger/:ledgerId"
            element={
              <LedgerProvider>
                <HomePage />
              </LedgerProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders the monthly total and recent input, falling back to category name", async () => {
    renderHome();

    expect(await screen.findByText("Buku Rumah")).toBeTruthy();
    expect(await screen.findByText("Makanan")).toBeTruthy();
    expect(screen.getByText("Total Pengeluaran")).toBeTruthy();
    expect(screen.getAllByText(/125\.000/)).toHaveLength(2);
    expect(screen.getByRole("heading", { name: /450\.000/ })).toBeTruthy();
    expect(api.recentExpenseItems).toHaveBeenCalledWith("ledger-home");
  });

  it("links a recent item to its receipt and passes the selected item id", async () => {
    renderHome();

    const itemLink = await screen.findByRole("link", { name: /makanan/i });
    expect(itemLink.getAttribute("href")).toBe(
      "/app/ledger/ledger-home/receipts/receipt-new?item=item-new",
    );
    expect(itemLink.className).toContain("gap-4");
    expect(itemLink.querySelectorAll("svg")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Lihat semua" }).getAttribute("href")).toBe(
      "/app/ledger/ledger-home/history",
    );
  });
});
