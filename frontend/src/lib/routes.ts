export function ledgerPath(ledgerId: string, suffix = "") {
  return `/app/ledger/${encodeURIComponent(ledgerId)}${suffix ? `/${suffix}` : ""}`;
}

export function receiptReviewPath(ledgerId: string, receiptId: string) {
  return `/app/ledger/${encodeURIComponent(ledgerId)}/receipts/${encodeURIComponent(receiptId)}`;
}
