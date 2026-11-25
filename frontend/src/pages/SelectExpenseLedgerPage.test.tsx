import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { api } from "../lib/api";
import { SelectExpenseLedgerPage } from "./SelectExpenseLedgerPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledgers: vi.fn(),
    },
  };
});

describe("SelectExpenseLedgerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a book choice before opening expense entry", async () => {
    vi.mocked(api.ledgers).mockResolvedValue({
      ledgers: [
        {
          id: "ledger-home",
          name: "Rumah",
          type: "personal",
          currency: "IDR",
          role: "owner",
          member_count: 1,
          sum_spend: 0,
        },
        {
          id: "ledger-trip",
          name: "Liburan",
          type: "tracker",
          currency: "USD",
          role: "member",
          member_count: 2,
          sum_spend: 0,
        },
      ],
    });

    render(
      <MemoryRouter>
        <SelectExpenseLedgerPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /rumah/i }).getAttribute("href")).toBe(
        "/app/ledger/ledger-home/scan",
      );
    });
    expect(screen.getByRole("link", { name: /liburan/i }).getAttribute("href")).toBe(
      "/app/ledger/ledger-trip/scan",
    );
  });
});
