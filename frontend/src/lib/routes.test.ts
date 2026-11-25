import { describe, expect, it } from "vitest";
import {
  ledgerPath,
  receiptDetailPath,
  receiptReviewPath,
  resolveExpenseCompleteTarget,
  resolveScanBackTarget,
  scanReturnState,
} from "./routes";

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

  it("builds a separate canonical path for receipt details", () => {
    expect(receiptDetailPath("ledger-1", "rcpt-42")).toBe(
      "/app/ledger/ledger-1/receipts/rcpt-42/detail",
    );
  });

  it("resolves scan return target from state or uses fallback", () => {
    expect(resolveScanBackTarget(scanReturnState("/home"))).toBe("/home");
    expect(resolveScanBackTarget(scanReturnState("/app/scan"))).toBe("/app/scan");
    expect(resolveScanBackTarget(undefined, "/app/ledger/ledger-1/history")).toBe(
      "/app/ledger/ledger-1/history",
    );
    expect(
      resolveScanBackTarget(
        scanReturnState("/app/ledger/ledger-1/manual"),
        "/app/ledger/ledger-1/history",
      ),
    ).toBe("/app/ledger/ledger-1/history");
  });

  it("resolves expense completion/cancel target to /home when source is /app/scan", () => {
    expect(
      resolveExpenseCompleteTarget(
        scanReturnState("/app/scan"),
        "/app/ledger/ledger-1/history",
      ),
    ).toBe("/home");
    expect(
      resolveExpenseCompleteTarget(
        scanReturnState("/app/books/ledger-1"),
        "/app/ledger/ledger-1/history",
      ),
    ).toBe("/app/books/ledger-1");
    expect(
      resolveExpenseCompleteTarget(undefined, "/app/ledger/ledger-1/history"),
    ).toBe("/app/ledger/ledger-1/history");
  });
});
