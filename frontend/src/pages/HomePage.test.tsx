import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, type Session } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";
import { LedgerSelectionProvider, useLedgerSelection } from "../context/LedgerSelectionContext";
import { SessionProvider } from "../context/SessionContext";
import { HomePage } from "./HomePage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledgers: vi.fn(),
      ledger: vi.fn(),
      summary: vi.fn(),
      recentExpenseItems: vi.fn(),
    },
  };
});

describe("HomePage", () => {
  const session: Session = {
    user: { id: "user-1", username: "tester", display_name: "Tester" },
    csrf_token: "csrf",
    personal_ledger_id: "ledger-home",
    ai_notice_acknowledged: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledgers).mockResolvedValue({
      ledgers: [
        {
          id: "ledger-home",
          name: "Buku Rumah",
          type: "personal",
          currency: "IDR",
          role: "owner",
          member_count: 1,
          sum_spend: 0,
        },
        {
          id: "ledger-shared",
          name: "Buku Bersama",
          type: "tracker",
          currency: "IDR",
          role: "member",
          member_count: 2,
          sum_spend: 0,
        },
      ],
    });
    vi.mocked(api.ledger).mockImplementation(async (id) => ({
      id,
      name: id === "ledger-shared" ? "Buku Bersama" : "Buku Rumah",
      type: id === "ledger-shared" ? "tracker" : "personal",
      currency: "IDR",
      role: id === "ledger-shared" ? "member" : "owner",
      member_count: 1,
      sum_spend: 0,
      members: [],
    }));
    vi.mocked(api.summary).mockImplementation(async (id) => ({
      total_minor: id === "ledger-shared" ? 88000 : 450000,
      count: 3,
      by_category: [],
      by_day: [],
      top_merchants: [],
      compare: { diff_minor: 0, pct_bp: 0 },
      currency: "IDR",
    }));
    vi.mocked(api.recentExpenseItems).mockResolvedValue({
      items: [
        {
          id: "item-new",
          receipt_id: "receipt-new",
          category_id: "system-food",
          category_name: "Makanan",
          name: "",
          created_at: "2026-11-20T12:30:00Z",
          purchased_on: "2026-11-20",
          amount_minor: 125000,
          amount_ledger_minor: 125000,
          currency: "IDR",
          ledger_currency: "IDR",
        },
      ],
      next_cursor: null,
    });
  });

  function HomeRoute() {
    const { homeLedgerId } = useLedgerSelection();
    return (
      <LedgerProvider key={homeLedgerId} ledgerId={homeLedgerId}>
        <HomePage />
      </LedgerProvider>
    );
  }

  function renderHome() {
    return render(
      <SessionProvider initialSession={session}>
        <LedgerSelectionProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <Routes>
              <Route path="/home" element={<HomeRoute />} />
            </Routes>
          </MemoryRouter>
        </LedgerSelectionProvider>
      </SessionProvider>,
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

  it("keeps the home URL stable and uses the selected ledger for contextual links", async () => {
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

  it("switches the ledger used for Home data without leaving /home", async () => {
    renderHome();

    const switcher = await screen.findByRole("combobox", { name: "Pilih buku untuk beranda" });
    await waitFor(() => expect((switcher as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(switcher, { target: { value: "ledger-shared" } });

    expect(await screen.findByText("Buku Bersama")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: /88\.000/ })).toBeTruthy();
    expect(api.summary).toHaveBeenLastCalledWith("ledger-shared", expect.any(String));
    expect(screen.getByRole("combobox", { name: "Pilih buku untuk beranda" })).toBeTruthy();
  });
});
