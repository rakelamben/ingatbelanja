import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionProvider } from "./SessionContext";
import { LedgerSelectionProvider, useLedgerSelection } from "./LedgerSelectionContext";

function SelectionProbe() {
  const { homeLedgerId, setHomeLedgerId, analyticLedgerId, setAnalyticLedgerId } =
    useLedgerSelection();

  return (
    <>
      <output>{`home:${homeLedgerId}`}</output>
      <output>{`analytic:${analyticLedgerId}`}</output>
      <button onClick={() => setHomeLedgerId("ledger-home-2")}>Ubah buku Home</button>
      <button onClick={() => setAnalyticLedgerId("ledger-analytic-2")}>
        Ubah buku analitik
      </button>
    </>
  );
}

describe("LedgerSelectionProvider", () => {
  it("keeps Home and analytics ledger selections independent", () => {
    render(
      <SessionProvider
        initialSession={{
          user: { id: "user-1", username: "tester", display_name: "Tester" },
          csrf_token: "csrf",
          personal_ledger_id: "ledger-personal",
          ai_notice_acknowledged: true,
        }}
      >
        <LedgerSelectionProvider>
          <SelectionProbe />
        </LedgerSelectionProvider>
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ubah buku Home" }));

    expect(screen.getByText("home:ledger-home-2")).toBeTruthy();
    expect(screen.getByText("analytic:ledger-personal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ubah buku analitik" }));

    expect(screen.getByText("home:ledger-home-2")).toBeTruthy();
    expect(screen.getByText("analytic:ledger-analytic-2")).toBeTruthy();
  });
});
