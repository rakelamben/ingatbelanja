import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LedgerProvider } from "../context/LedgerContext";
import { LedgerSelectionProvider, useLedgerSelection } from "../context/LedgerSelectionContext";
import { SessionProvider } from "../context/SessionContext";
import { api, type Session } from "../lib/api";
import { ReportsPage } from "./ReportsPage";

const apexChartMock = vi.hoisted(() => ({
  create: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("apexcharts/donut", () => ({
  default: class MockApexCharts {
    constructor(_element: HTMLElement, options: unknown) {
      apexChartMock.create(options);
    }

    render() {
      apexChartMock.render();
      return Promise.resolve(this);
    }

    destroy() {
      apexChartMock.destroy();
    }
  },
}));

vi.mock("apexcharts/line", () => ({
  default: class MockApexCharts {
    constructor(_element: HTMLElement, options: unknown) {
      apexChartMock.create(options);
    }

    render() {
      apexChartMock.render();
      return Promise.resolve(this);
    }

    destroy() {
      apexChartMock.destroy();
    }
  },
}));

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

describe("ReportsPage", () => {
  const session: Session = {
    user: { id: "user-1", username: "tester", display_name: "Tester" },
    csrf_token: "csrf",
    personal_ledger_id: "ledger-home",
    ai_notice_acknowledged: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    apexChartMock.create.mockClear();
    vi.mocked(api.ledgers).mockResolvedValue({
      ledgers: [
        {
          id: "ledger-home",
          name: "Buku Rumah",
          type: "personal",
          currency: "IDR",
          role: "owner",
          member_count: 1,
        },
        {
          id: "ledger-analytic",
          name: "Buku Analitik",
          type: "tracker",
          currency: "IDR",
          role: "member",
          member_count: 2,
        },
      ],
    });
    vi.mocked(api.ledger).mockImplementation(async (id) => ({
      id,
      name: id === "ledger-analytic" ? "Buku Analitik" : "Buku Rumah",
      type: id === "ledger-analytic" ? "tracker" : "personal",
      currency: "IDR",
      role: id === "ledger-analytic" ? "member" : "owner",
      member_count: 1,
      members: [],
    }));
    vi.mocked(api.summary).mockResolvedValue({
      total_minor: 45000,
      count: 1,
      by_category: [],
      by_day: [],
      top_merchants: [],
      compare: { diff_minor: 0, pct_bp: 0 },
      currency: "IDR",
    });
    vi.mocked(api.recentExpenseItems).mockResolvedValue({ items: [] });
  });

  function AnalyticsRoute() {
    const { analyticLedgerId } = useLedgerSelection();
    return (
      <LedgerProvider key={analyticLedgerId} ledgerId={analyticLedgerId}>
        <ReportsPage />
      </LedgerProvider>
    );
  }

  it("uses its own ledger selection for analytics data", async () => {
    render(
      <SessionProvider initialSession={session}>
        <LedgerSelectionProvider>
          <MemoryRouter initialEntries={["/analytic"]}>
            <Routes>
              <Route path="/analytic" element={<AnalyticsRoute />} />
            </Routes>
          </MemoryRouter>
        </LedgerSelectionProvider>
      </SessionProvider>,
    );

    const switcher = await screen.findByRole("combobox", { name: "Pilih buku untuk analitik" });
    await waitFor(() => expect((switcher as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(switcher, { target: { value: "ledger-analytic" } });

    await waitFor(() => {
      expect(api.summary).toHaveBeenLastCalledWith("ledger-analytic", expect.any(String));
    });
    expect(await screen.findByText("Buku Analitik")).toBeTruthy();
  });

  it("renders real category and daily data in ApexCharts", async () => {
    vi.mocked(api.recentExpenseItems).mockResolvedValueOnce({
      items: [
        {
          id: "item-1",
          receipt_id: "receipt-1",
          category_id: "food",
          category_name: "Makanan",
          name: "Kopi",
          created_at: "2026-11-20T12:30:00Z",
          purchased_on: "2026-11-20",
          amount_minor: 12500,
          amount_ledger_minor: 12500,
          currency: "IDR",
          ledger_currency: "IDR",
        },
      ],
      next_cursor: null,
    });
    vi.mocked(api.summary).mockResolvedValueOnce({
      total_minor: 150000,
      count: 5,
      by_category: [
        { name: "Makanan", amount_minor: 60000, share_bp: 4000 },
        { name: "Transportasi", amount_minor: 30000, share_bp: 2000 },
        { name: "Tagihan", amount_minor: 20000, share_bp: 1333 },
        { name: "Belanja", amount_minor: 15000, share_bp: 1000 },
        { name: "Hiburan", amount_minor: 15000, share_bp: 1000 },
      ],
      by_day: [
        { date: "2026-11-02", amount_minor: 60000 },
        { date: "2026-11-03", amount_minor: 90000 },
      ],
      top_merchants: [],
      compare: { diff_minor: 25000, pct_bp: 2000 },
      currency: "IDR",
    });

    render(
      <SessionProvider initialSession={session}>
        <LedgerSelectionProvider>
          <MemoryRouter initialEntries={["/analytic"]}>
            <Routes>
              <Route path="/analytic" element={<AnalyticsRoute />} />
            </Routes>
          </MemoryRouter>
        </LedgerSelectionProvider>
      </SessionProvider>,
    );

    expect(await screen.findByRole("img", { name: /diagram donat/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /grafik tren pengeluaran harian/i })).toBeTruthy();
    expect(screen.getByText("Lainnya")).toBeTruthy();
    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByText(/Rp\s?150\.000/)).toBeTruthy();
    expect(screen.getByText("Jumlah transaksi")).toBeTruthy();
    expect(screen.getByText("Rata-rata per transaksi")).toBeTruthy();
    expect(screen.getByText(/Rp\s?30\.000/)).toBeTruthy();
    expect(screen.getByText("+20.0%")).toBeTruthy();
    expect(await screen.findByText("Kopi")).toBeTruthy();

    await waitFor(() => expect(apexChartMock.create).toHaveBeenCalledTimes(2));
    expect(apexChartMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        chart: expect.objectContaining({ type: "donut" }),
        labels: ["Makanan", "Transportasi", "Tagihan", "Lainnya"],
        series: [60000, 30000, 20000, 30000],
      }),
    );
  });

  it("uses the date button's month picker to reload the selected period", async () => {
    render(
      <SessionProvider initialSession={session}>
        <LedgerSelectionProvider>
          <MemoryRouter initialEntries={["/analytic"]}>
            <Routes>
              <Route path="/analytic" element={<AnalyticsRoute />} />
            </Routes>
          </MemoryRouter>
        </LedgerSelectionProvider>
      </SessionProvider>,
    );

    const filterButton = await screen.findByRole("button", { name: "Buka filter tanggal" });
    const monthInput = screen.getByLabelText("Pilih bulan laporan");
    const showPicker = vi.fn();
    Object.defineProperty(monthInput, "showPicker", { configurable: true, value: showPicker });
    fireEvent.click(filterButton);
    expect(showPicker).toHaveBeenCalledOnce();

    fireEvent.change(monthInput, { target: { value: "2026-10" } });

    expect(await screen.findByText("Oktober 2026")).toBeTruthy();
    await waitFor(() => {
      expect(api.summary).toHaveBeenLastCalledWith("ledger-home", "2026-10");
    });
  });
});
