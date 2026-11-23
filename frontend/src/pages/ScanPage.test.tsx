import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";
import { ScanPage } from "./ScanPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
    },
  };
});

describe("ScanPage input choices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledger).mockResolvedValue({
      id: "ledger-1",
      name: "Buku Rumah",
      type: "personal",
      currency: "IDR",
      role: "owner",
      member_count: 1,
      sum_spend: 0,
      members: [],
    });
  });

  it("opens camera/gallery capture or the manual form for the active book", async () => {
    render(
      <MemoryRouter initialEntries={["/app/ledger/ledger-1/scan"]}>
        <Routes>
          <Route
            path="/app/ledger/:ledgerId"
            element={
              <LedgerProvider>
                <Outlet />
              </LedgerProvider>
            }
          >
            <Route path="scan" element={<ScanPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      (await screen.findByRole("link", { name: /ambil foto struk/i })).getAttribute("href"),
    ).toBe("/app/ledger/ledger-1/scan/capture");
    expect(
      screen.getByRole("link", { name: /isi form manual/i }).getAttribute("href"),
    ).toBe("/app/ledger/ledger-1/manual");
    expect(
      screen.getByRole("link", { name: /kembali ke beranda/i }).getAttribute("href"),
    ).toBe("/app/ledger/ledger-1");
  });
});
