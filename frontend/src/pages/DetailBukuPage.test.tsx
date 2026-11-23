import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { SessionProvider } from "../context/SessionContext";
import { DetailBukuPage } from "./DetailBukuPage";
import { TrackersPage } from "./TrackersPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
      ledgers: vi.fn(),
      recentExpenseItems: vi.fn(),
    },
  };
});

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  private readonly callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  trigger() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

const book = {
  id: "ledger-trip",
  name: "Liburan",
  type: "tracker" as const,
  currency: "IDR",
  role: "owner" as const,
  member_count: 2,
  sum_spend: 125000,
};

const session = {
  user: { id: "user-1", username: "tester", display_name: "Test User" },
  csrf_token: "csrf",
  personal_ledger_id: "ledger-personal",
  ai_notice_acknowledged: true,
};

function renderBookRoutes() {
  return render(
    <SessionProvider initialSession={session}>
      <MemoryRouter initialEntries={["/app/books"]}>
        <Routes>
          <Route path="/app/books" element={<TrackersPage />} />
          <Route path="/app/books/:ledgerId" element={<DetailBukuPage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe("book details navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.mocked(api.ledgers).mockResolvedValue({ ledgers: [book] });
    vi.mocked(api.ledger).mockResolvedValue({
      ...book,
      members: [
        {
          id: "user-1",
          username: "tester",
          display_name: "Test User",
        },
        {
          id: "user-2",
          username: "friend",
          display_name: "Teman",
        },
      ],
    });
    vi.mocked(api.recentExpenseItems).mockResolvedValue({
      items: [],
      next_cursor: null,
    });
  });

  it("opens a book's detail page when its card is clicked", async () => {
    renderBookRoutes();

    const bookCard = await screen.findByRole("link", { name: /liburan/i });
    expect(bookCard.getAttribute("href")).toBe("/app/books/ledger-trip");
    fireEvent.click(bookCard);

    expect(await screen.findByRole("heading", { name: "Liburan" })).toBeTruthy();
    expect(screen.getByText(/125\.000/)).toBeTruthy();
    expect(screen.getByText("Teman")).toBeTruthy();
    expect(screen.queryByText("Test User")).toBeNull();
    expect(screen.getByText("Pengeluaran").parentElement?.parentElement?.className).toContain(
      "grid-cols-3",
    );
    expect(api.ledger).toHaveBeenCalledWith("ledger-trip");
  });

  it("uses two action columns for personal books without an invite action", async () => {
    const personalBook = { ...book, type: "personal" as const, member_count: 1 };
    vi.mocked(api.ledgers).mockResolvedValue({ ledgers: [personalBook] });
    vi.mocked(api.ledger).mockResolvedValue({
      ...personalBook,
      members: [
        {
          id: "user-1",
          username: "tester",
          display_name: "Test User",
        },
      ],
    });

    renderBookRoutes();
    fireEvent.click(await screen.findByRole("link", { name: /liburan/i }));

    expect(await screen.findByText("Pengeluaran")).toBeTruthy();
    expect(screen.queryByText("Undang teman")).toBeNull();
    expect(screen.getByText("Pengeluaran").parentElement?.parentElement?.className).toContain(
      "grid-cols-2",
    );
  });

  it("loads more expenses on scroll and groups them by purchase month", async () => {
    vi.mocked(api.recentExpenseItems)
      .mockResolvedValueOnce({
        items: [
          {
            id: "item-nov",
            receipt_id: "receipt-nov",
            category_id: "food",
            category_name: "Makanan",
            name: "Kopi November",
            created_at: "2026-11-20T12:30:00Z",
            purchased_on: "2026-11-20",
            amount_minor: 12500,
            amount_ledger_minor: 12500,
            currency: "IDR",
            ledger_currency: "IDR",
          },
        ],
        next_cursor: "cursor-nov",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "item-oct",
            receipt_id: "receipt-oct",
            category_id: "food",
            category_name: "Makanan",
            name: "Kopi Oktober",
            created_at: "2026-10-20T12:30:00Z",
            purchased_on: "2026-10-20",
            amount_minor: 9500,
            amount_ledger_minor: 9500,
            currency: "IDR",
            ledger_currency: "IDR",
          },
        ],
        next_cursor: null,
      });

    renderBookRoutes();
    fireEvent.click(await screen.findByRole("link", { name: /liburan/i }));
    expect(await screen.findByText("Kopi November")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();

    await waitFor(() => {
      expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0);
    });
    act(() => MockIntersectionObserver.instances[0].trigger());

    expect(await screen.findByText("Kopi Oktober")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeTruthy();
    expect(api.recentExpenseItems).toHaveBeenNthCalledWith(1, "ledger-trip", 20);
    expect(api.recentExpenseItems).toHaveBeenNthCalledWith(
      2,
      "ledger-trip",
      20,
      "cursor-nov",
    );
  });
});
