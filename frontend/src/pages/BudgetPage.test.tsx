import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";
import { BudgetPage } from "./BudgetPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
      budgetStatus: vi.fn(),
      putBudget: vi.fn(),
      deleteBudget: vi.fn(),
    },
  };
});

const trackerOwner = {
  id: "ledger-trip",
  name: "Liburan",
  type: "tracker" as const,
  currency: "IDR",
  role: "owner" as const,
  member_count: 2,
  sum_spend: 125000,
  members: [],
};

function renderBudgetPage(initialEntry = "/app/ledger/ledger-trip/budget") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/app/ledger/:ledgerId/budget"
          element={
            <LedgerProvider>
              <BudgetPage />
            </LedgerProvider>
          }
        />
        <Route path="/app/books/:ledgerId" element={<p>Book detail page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BudgetPage wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledger).mockResolvedValue(trackerOwner);
    vi.mocked(api.budgetStatus).mockResolvedValue({
      period: "2026-11",
      start_date: null,
      end_date: null,
      limit_minor: null,
      spent_minor: 0,
      ratio_bp: null,
      level: "normal",
    });
    vi.mocked(api.putBudget).mockResolvedValue({
      id: "b-1",
      period: "CUSTOM",
      limit_minor: 500000,
      start_date: "2026-11-25",
      end_date: "2026-11-30",
    });
  });

  it("completes 3-step budget creation with custom end date and returns to book detail", async () => {
    renderBudgetPage();

    const input = await screen.findByLabelText("Nominal limit pengeluaran");
    fireEvent.change(input, { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText(/Kapan limit pengeluaran berakhir/i)).toBeTruthy();
    const toggle = screen.getByRole("checkbox");
    fireEvent.click(toggle);

    const dateInput = screen.getByLabelText(/Berlaku mulai hari ini hingga tanggal/i);
    fireEvent.change(dateInput, { target: { value: "2026-11-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText("Konfirmasi Target Anggaran")).toBeTruthy();
    expect(screen.getByText(/500\.000/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buat Target" }));

    await waitFor(() => {
      expect(api.putBudget).toHaveBeenCalledWith(
        "ledger-trip",
        "CUSTOM",
        500000,
        expect.objectContaining({ end_date: "2026-11-30" }),
      );
    });
    expect(await screen.findByText("Book detail page")).toBeTruthy();
  });

  it("pre-fills existing budget in edit mode", async () => {
    vi.mocked(api.budgetStatus).mockResolvedValue({
      period: "CUSTOM",
      start_date: "2026-11-25",
      end_date: "2026-11-30",
      limit_minor: 750000,
      spent_minor: 100000,
      ratio_bp: 1333,
      level: "normal",
    });

    renderBudgetPage("/app/ledger/ledger-trip/budget?edit=1");

    const input = (await screen.findByLabelText("Nominal limit pengeluaran")) as HTMLInputElement;
    expect(input.value).toBe("750000");

    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    const toggle = (await screen.findByRole("checkbox")) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(await screen.findByRole("button", { name: "Perbarui Target" })).toBeTruthy();
  });

  it("blocks non-owner members and personal ledgers", async () => {
    vi.mocked(api.ledger).mockResolvedValueOnce({ ...trackerOwner, role: "member" });
    const { unmount } = renderBudgetPage();
    expect(await screen.findByText(/Hanya pemilik buku yang dapat mengatur anggaran/i)).toBeTruthy();
    unmount();

    vi.mocked(api.ledger).mockResolvedValueOnce({ ...trackerOwner, type: "personal" });
    renderBudgetPage();
    expect(await screen.findByText(/Fitur anggaran hanya tersedia untuk buku bersama/i)).toBeTruthy();
  });

  it("validates minimum limit is at least 100.000 above current spend", async () => {
    renderBudgetPage();

    const input = await screen.findByLabelText("Nominal limit pengeluaran");
    fireEvent.change(input, { target: { value: "200000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText(/Nominal limit minimal/i)).toBeTruthy();
    expect(screen.queryByText(/Kapan limit pengeluaran berakhir/i)).toBeNull();
  });
});
