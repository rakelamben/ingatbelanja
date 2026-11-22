import { describe, expect, it } from "vitest";
import { ledgerPath, receiptReviewPath } from "./routes";

describe("ledger routes", () => {
  it("builds canonical paths for the active ledger", () => {
    expect(ledgerPath("ledger-1")).toBe("/app/ledger/ledger-1");
    expect(ledgerPath("ledger-1", "history")).toBe("/app/ledger/ledger-1/history");
    expect(ledgerPath("ledger-1", "scan")).toBe("/app/ledger/ledger-1/scan");
  });

  it("builds canonical path for receipt review", () => {
    expect(receiptReviewPath("ledger-1", "rcpt-42")).toBe(
      "/app/ledger/ledger-1/receipts/rcpt-42",
    );
  });
});
