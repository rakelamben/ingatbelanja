export function ledgerPath(ledgerId: string, suffix = "") {
  return `/app/ledger/${encodeURIComponent(ledgerId)}${suffix ? `/${suffix}` : ""}`;
}

export function receiptReviewPath(ledgerId: string, receiptId: string) {
  return `/app/ledger/${encodeURIComponent(ledgerId)}/receipts/${encodeURIComponent(receiptId)}`;
}

export function receiptDetailPath(ledgerId: string, receiptId: string) {
  return `${receiptReviewPath(ledgerId, receiptId)}/detail`;
}

export interface ScanLocationState {
  from?: string;
}

export function scanReturnState(from: string): ScanLocationState {
  return { from };
}

export function resolveScanBackTarget(state: unknown, fallback = "/app/scan"): string {
  const from = (state as ScanLocationState | null | undefined)?.from;
  if (
    typeof from === "string" &&
    from.startsWith("/") &&
    !/^\/app\/ledger\/[^/]+\/(scan(\/capture)?|manual)$/.test(from)
  ) {
    return from;
  }
  return fallback;
}

export function resolveExpenseCompleteTarget(state: unknown, fallback: string): string {
  const target = resolveScanBackTarget(state, fallback);
  return target === "/app/scan" ? "/home" : target;
}

