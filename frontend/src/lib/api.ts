export type User = { id: string; username: string; display_name: string | null };
export type Session = { user: User; csrf_token: string; personal_ledger_id: string; ai_notice_acknowledged: boolean };
export type Ledger = { id: string; name: string; type: "personal" | "tracker"; currency: string; role: "owner" | "member"; member_count: number, sum_spend: number};
export type LedgerInvite = {
  id: string;
  code: string;
  created_at?: string;
  expires_at: string;
  max_uses: number;
  use_count?: number;
  revoked_at?: string | null;
};
export type Receipt = { id: string; status: string; merchant_name: string | null; purchased_on: string | null; currency: string; total_minor: number | null; total_ledger_minor: number | null; created_by?: string; updated_at: string };
export type ReceiptUpload = {
  id: string;
  ledger_id: string;
  status: string;
  source: "photo";
  created_at: string;
};
export type RecentExpenseItem = {
  id: string;
  receipt_id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  created_at: string;
  purchased_on: string | null;
  amount_minor: number | null;
  amount_ledger_minor: number | null;
  currency: string;
  ledger_currency: string;
};
export type Summary = { total_minor: number; count: number; by_category: { name: string; amount_minor: number; share_bp: number }[]; by_day: { date: string; amount_minor: number }[]; top_merchants: { name: string; amount_minor: number; count: number }[]; compare: { diff_minor: number; pct_bp: number | null }; currency: string };

export type ReceiptItem = {
  id?: string;
  name: string;
  qty_milli: number;
  unit_price_minor?: number | null;
  amount_minor: number;
  category_id?: string | null;
  category_name?: string | null;
};

export type ReceiptExtractionCandidate = {
  merchant: string | null;
  merchant_line_ids: string[];
  merchant_confidence: number | null;
  purchased_on: string | null;
  date_line_ids: string[];
  date_confidence: number | null;
  currency: string;
  total_minor: number | null;
  total_line_ids: string[];
  total_confidence: number | null;
  items: {
    name: string;
    qty_milli: number;
    unit_price_minor: number | null;
    amount_minor: number;
    line_ids: string[];
    confidence: number | null;
  }[];
  issues: string[];
};

export type ReceiptDetail = {
  id: string;
  ledger_id: string;
  status: "confirmed" | "processing" | "failed" | "needs_review" | string;
  source: "photo" | "manual";
  merchant_name: string | null;
  purchased_on: string | null;
  currency: string;
  total_minor: number | null;
  total_ledger_minor: number | null;
  fx_rate: string | null;
  fx_date: string | null;
  fx_source: string | null;
  issues: string[];
  note: string | null;
  created_by: { id: string; username: string; display_name: string | null };
  created_at: string;
  updated_at: string;
  items: ReceiptItem[];
  extraction_candidate?: ReceiptExtractionCandidate | null;
};

export type Category = {
  id: string;
  name: string;
  is_system: boolean;
  ledger_id: string | null;
};
export type Currency = {
  code: string;
  name: string;
  symbol: string;
  minor_unit: number;
};
export type ManualReceiptPayload = {
  purchased_on: string;
  currency: string;
  amount_minor: number;
  merchant_name?: string;
  note?: string;
  fx_rate?: string;
  items: {
    name: string;
    qty_milli: number;
    unit_price_minor: number | null;
    amount_minor: number;
    category_id: string | null;
  }[];
};
export type ManualReceiptResponse = {
  id: string;
  ledger_id: string;
  status: "confirmed";
  merchant: string;
  purchased_on: string;
  currency: string;
  total_minor: number;
  total_ledger_minor: number;
  fx_rate: string;
  fx_date: string;
  fx_source: string;
  items: {
    id: string;
    name: string;
    category_id: string | null;
    amount_minor: number;
    amount_ledger_minor: number;
  }[];
};

export type ReceiptPatchPayload = {
  expected_updated_at: string;
  merchant_name?: string | null;
  purchased_on?: string | null;
  currency?: string | null;
  total_minor?: number | null;
  tax_minor?: number | null;
  service_minor?: number | null;
  discount_minor?: number | null;
  note?: string | null;
  fx_rate?: string | null;
  items?: {
    id?: string;
    name: string;
    qty_milli?: number;
    unit_price_minor?: number | null;
    amount_minor: number;
    category_id?: string | null;
  }[];
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const API_PREFIX = "/api/v1";
let csrfToken = sessionStorage.getItem("ib_csrf") ?? "";

export function setCsrfToken(token: string) {
  csrfToken = token;
  sessionStorage.setItem("ib_csrf", token);
}

async function request<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (method !== "GET" && csrfToken) headers.set("X-CSRF-Token", csrfToken);
  try {
    const response = await fetch(`${API_PREFIX}${path}`, { ...options, headers, credentials: "include", signal: controller.signal });
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      throw new ApiError(response.status, data?.code ?? "REQUEST_FAILED", data?.detail ?? "Permintaan gagal.");
    }
    if (data?.csrf_token) setCsrfToken(data.csrf_token);
    return data as T;
  } catch (error) {
    if (method === "GET" && attempt === 0 && !(error instanceof ApiError)) return request<T>(path, options, 1);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  me: () => request<Session>("/auth/me"),
  login: (username: string, password: string) => request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string, display_name?: string) => request<Session>("/auth/register", { method: "POST", body: JSON.stringify({ username, password, display_name }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  ackAiNotice: () => request<void>("/auth/ack-ai-notice", { method: "POST" }),
  ledgers: () => request<{ ledgers: Ledger[] }>("/ledgers"),
  ledger: (id: string) => request<Ledger & { members: User[] }>(`/ledgers/${id}`),
  receipts: (id: string, query = "") => request<{ items: Receipt[]; next_cursor: string | null }>(`/ledgers/${id}/receipts${query}`),
  recentExpenseItems: (id: string, limit = 5, cursor?: string, key? : string) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    if (key) query.set("key", key);
    return request<{ items: RecentExpenseItem[]; next_cursor: string | null }>(
      `/ledgers/${id}/recent-items?${query.toString()}`,
    );
  },
  receipt: (receiptId: string) => request<ReceiptDetail>(`/receipts/${receiptId}`),
  patchReceipt: (receiptId: string, payload: ReceiptPatchPayload) => request<ReceiptDetail>(`/receipts/${receiptId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  confirmReceipt: (receiptId: string) => request<{ id: string; status: string; updated_at: string }>(`/receipts/${receiptId}/confirm`, { method: "POST" }),
  reprocessReceipt: (receiptId: string) => request<{ id: string; status: string }>(`/receipts/${receiptId}/reprocess`, { method: "POST" }),
  deleteReceipt: (receiptId: string) => request<void>(`/receipts/${receiptId}`, { method: "DELETE" }),
  categories: (ledgerId: string) => request<{ categories: Category[] }>(`/ledgers/${ledgerId}/categories`),
  createCategory: (ledgerId: string, name: string) =>
    request<Category>(`/ledgers/${ledgerId}/categories`, { method: "POST", body: JSON.stringify({ name }) }),
  currencies: () => request<{ currencies: Currency[] }>("/meta/currencies"),
  receiptImageUrl: (receiptId: string, kind: "original" | "processed" | "thumb" = "processed") => `${API_PREFIX}/receipts/${encodeURIComponent(receiptId)}/image/${kind}`,
  manualReceipt: (id: string, payload: ManualReceiptPayload) => request<ManualReceiptResponse>(`/ledgers/${id}/receipts/manual`, { method: "POST", body: JSON.stringify(payload) }),
  uploadPhoto: async (id: string, file: File, note = "", isHandwritten = false) => {
    const form = new FormData(); form.append("file", file); if (note) form.append("note", note); form.append("is_handwritten", String(isHandwritten));
    return request<ReceiptUpload>(`/ledgers/${id}/receipts/photo`, { method: "POST", body: form, headers: { "Idempotency-Key": crypto.randomUUID() } });
  },
  receiptStatus: (id: string) => request<{ id: string; status: string; issues: string[]; updated_at: string }>(`/receipts/${id}/status`),
  createTracker: (name: string, currency: string) => request<Ledger>("/ledgers", { method: "POST", body: JSON.stringify({ name, currency }) }),
  joinTracker: (code: string) => request<{ ledger_id: string }>("/invites/join", { method: "POST", body: JSON.stringify({ code }) }),
  listInvites: (ledgerId: string) =>
    request<{ invites: LedgerInvite[] }>(`/ledgers/${encodeURIComponent(ledgerId)}/invites`),
  createInvite: (
    ledgerId: string,
    payload: { expires_in_hours?: number; max_uses?: number } = {},
  ) =>
    request<LedgerInvite>(`/ledgers/${encodeURIComponent(ledgerId)}/invites`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  revokeInvite: (ledgerId: string, inviteId: string) =>
    request<void>(
      `/ledgers/${encodeURIComponent(ledgerId)}/invites/${encodeURIComponent(inviteId)}`,
      { method: "DELETE" },
    ),
  summary: (id: string, period: string) => request<Summary>(`/ledgers/${id}/reports/summary?period=${encodeURIComponent(period)}`),
  budgetStatus: (id: string, period?: string) =>
    request<{
      period: string;
      start_date: string | null;
      end_date: string | null;
      limit_minor: number | null;
      spent_minor: number;
      ratio_bp: number | null;
      level: string;
    }>(
      period
        ? `/ledgers/${id}/budgets/status?period=${encodeURIComponent(period)}`
        : `/ledgers/${id}/budgets/status`,
    ),
  listBudgets: (id: string) =>
    request<{
      budgets: {
        id: string;
        period: string;
        limit_minor: number;
        start_date: string | null;
        end_date: string | null;
        created_at: string;
        updated_at: string;
      }[];
    }>(`/ledgers/${id}/budgets`),
  putBudget: (
    id: string,
    period: string,
    limit_minor: number,
    dates?: { start_date?: string; end_date?: string },
  ) =>
    request<{
      id: string;
      period: string;
      limit_minor: number;
      start_date: string | null;
      end_date: string | null;
    }>(`/ledgers/${id}/budgets/${encodeURIComponent(period)}`, {
      method: "PUT",
      body: JSON.stringify({ limit_minor, ...dates }),
    }),
  deleteBudget: (id: string, period: string) =>
    request<void>(`/ledgers/${id}/budgets/${encodeURIComponent(period)}`, {
      method: "DELETE",
    }),
  activity: (id: string) => request<{ items: { action: string; entity_type: string; username: string; created_at: string }[] }>(`/ledgers/${id}/activity`),
  chatThreads: () => request<{ threads: { id: string; title: string; created_at: string; updated_at: string }[] }>("/chat/threads"),
  createChatThread: () => request<{ id: string; title: string }>("/chat/threads", { method: "POST" }),
  chatMessages: (id: string) => request<{ messages: { id: string; role: "user" | "assistant"; content: string; blocks?: { title: string; columns: string[]; rows: string[][] }[]; verified: boolean }[] }>(`/chat/threads/${id}/messages`),
  sendChat: (id: string, content: string, ledgerIds?: string[]) =>
    request<{
      id: string;
      content: string;
      blocks: { title: string; columns: string[]; rows: string[][] }[];
      verified: boolean;
    }>(`/chat/threads/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(
        ledgerIds ? { content, ledger_ids: ledgerIds } : { content },
      ),
    }),
};
