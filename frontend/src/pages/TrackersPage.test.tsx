import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { TrackersPage } from "./TrackersPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledgers: vi.fn(),
      joinTracker: vi.fn(),
    },
  };
});

function renderTrackers(initialEntry = "/app/books") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/app/books" element={<TrackersPage />} />
        <Route path="/app/books/:ledgerId" element={<p>Joined book page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TrackersPage join flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ledgers).mockResolvedValue({
      ledgers: [
        {
          id: "ledger-personal",
          name: "Dompet Pribadi",
          type: "personal",
          currency: "IDR",
          role: "owner",
          member_count: 1,
          sum_spend: 0,
        },
      ],
    });
  });

  it("opens Gabung Buku modal, submits invite code, and navigates to joined ledger", async () => {
    vi.mocked(api.joinTracker).mockResolvedValue({ ledger_id: "ledger-shared" });

    renderTrackers();

    const joinBtn = await screen.findByRole("button", { name: /gabung buku/i });
    fireEvent.click(joinBtn);

    const dialog = screen.getByRole("dialog", { name: "Gabung buku bersama" });
    expect(dialog).toBeTruthy();

    const input = screen.getByLabelText("Kode Undangan");
    fireEvent.change(input, { target: { value: "abcd1234ef" } });
    fireEvent.click(screen.getByRole("button", { name: "Gabung" }));

    await waitFor(() => {
      expect(api.joinTracker).toHaveBeenCalledWith("ABCD1234EF");
    });
    expect(await screen.findByText("Joined book page")).toBeTruthy();
  });

  it("auto-opens join modal when ?join=CODE query parameter is present", async () => {
    renderTrackers("/app/books?join=INVITE777");

    await screen.findByText("Dompet Pribadi");
    const input = (await screen.findByLabelText("Kode Undangan")) as HTMLInputElement;
    expect(input.value).toBe("INVITE777");
  });
});
