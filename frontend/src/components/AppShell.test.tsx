import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LedgerSelectionProvider } from "../context/LedgerSelectionContext";
import { SessionProvider } from "../context/SessionContext";
import { AppShell } from "./AppShell";

const session = {
  user: { id: "user-1", username: "tester", display_name: "Tester" },
  csrf_token: "csrf",
  personal_ledger_id: "ledger-personal",
  ai_notice_acknowledged: true,
};

function renderShell(path: string, history?: string[]) {
  return render(
    <SessionProvider initialSession={session}>
      <MemoryRouter initialEntries={history ?? [path]}>
        <Routes>
          <Route
            element={
              <LedgerSelectionProvider>
                <AppShell />
              </LedgerSelectionProvider>
            }
          >
            <Route path="/home" element={<p>Home content</p>} />
            <Route path="/analytic" element={<p>Analytics content</p>} />
            <Route path="/app/books" element={<p>Books content</p>} />
            <Route path="/app/books/create" element={<p>Create book content</p>} />
            <Route path="/app/scan" element={<p>Select book content</p>} />
            <Route
              path="/app/ledger/:ledgerId/scan"
              element={<p>Scan content</p>}
            />
            <Route
              path="/app/books/:ledgerId"
              element={<p>Book detail content</p>}
            />
            <Route
              path="/app/ledger/:ledgerId/history"
              element={<p>History content</p>}
            />
            <Route
              path="/app/ledger/:ledgerId/manual"
              element={<p>Manual content</p>}
            />
            <Route
              path="/app/ledger/:ledgerId/scan/capture"
              element={<p>Capture content</p>}
            />
            <Route
              path="/app/ledger/:ledgerId/receipts/:receiptId"
              element={<p>Receipt detail content</p>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe("AppShell navigation", () => {
  it("uses stable Home and analytics destinations", () => {
    renderShell("/home");

    expect(screen.getByRole("link", { name: /beranda/i }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: /analytics/i }).getAttribute("href")).toBe(
      "/analytic",
    );
    expect(screen.getByRole("link", { name: /scan struk/i }).getAttribute("href")).toBe(
      "/app/scan",
    );
  });

  it("hides bottom navigation when contextual Scan page is opened", () => {
    renderShell("/app/ledger/ledger-personal/scan");

    expect(screen.getByText("Scan content")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
  });

  it("uses browser history when the Scan back button is clicked", () => {
    renderShell("/app/scan", [
      "/home",
      "/app/scan",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
    expect(screen.getByText("Home content")).toBeTruthy();
  });

  it("hides the bottom navigation on contextual history pages", () => {
    renderShell("/app/ledger/ledger-personal/history");

    expect(screen.getByText("History content")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
  });

  it("shows the bottom navigation on the books page", () => {
    renderShell("/app/books");

    expect(screen.getByText("Books content")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Navigasi utama" })).toBeTruthy();
  });

  it("hides the bottom navigation on a book detail page", () => {
    renderShell("/app/books/ledger-1");

    expect(screen.getByText("Book detail content")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
  });

  it("hides the bottom navigation on manual, capture, and receipt review forms", () => {
    const { unmount: unmount1 } = renderShell("/app/ledger/ledger-personal/manual");
    expect(screen.getByText("Manual content")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
    unmount1();

    const { unmount: unmount2 } = renderShell("/app/ledger/ledger-personal/scan/capture");
    expect(screen.getByText("Capture content")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
    unmount2();

    const { unmount: unmount3 } = renderShell("/app/ledger/ledger-personal/receipts/rcpt-1");
    expect(screen.getByText("Receipt detail content")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Navigasi utama" })).toBeNull();
    unmount3();
  });
});
