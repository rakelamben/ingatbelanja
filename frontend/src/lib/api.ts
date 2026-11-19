export type User = { id: string; username: string; display_name: string | null };
export type Session = { user: User; csrf_token: string; personal_ledger_id: string; ai_notice_acknowledged: boolean };
export type Ledger = { id: string; name: string; type: "personal" | "tracker"; currency: string; role: "owner" | "member"; member_count: number };
export type Receipt = { id: string; status: string; merchant_name: string | null; purchased_on: string | null; currency: string; total_minor: number | null; total_ledger_minor: number | null; created_by?: string; updated_at: string };
export type Summary = { total_minor: number; count: number; by_category: { name: string; amount_minor: number; share_bp: number }[]; by_day: { date: string; amount_minor: number }[]; top_merchants: { name: string; amount_minor: number; count: number }[]; compare: { diff_minor: number; pct_bp: number | null }; currency: string };

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
  manualReceipt: (id: string, payload: unknown) => request<Receipt>(`/ledgers/${id}/receipts/manual`, { method: "POST", body: JSON.stringify(payload) }),
  uploadPhoto: async (id: string, file: File, note = "", isHandwritten = false) => {
    const form = new FormData(); form.append("file", file); if (note) form.append("note", note); form.append("is_handwritten", String(isHandwritten));
    return request<Receipt>(`/ledgers/${id}/receipts/photo`, { method: "POST", body: form, headers: { "Idempotency-Key": crypto.randomUUID() } });
  },
  receiptStatus: (id: string) => request<{ id: string; status: string; issues: string[]; updated_at: string }>(`/receipts/${id}/status`),
  createTracker: (name: string, currency: string) => request<Ledger>("/ledgers", { method: "POST", body: JSON.stringify({ name, currency }) }),
  joinTracker: (code: string) => request<{ ledger_id: string }>("/invites/join", { method: "POST", body: JSON.stringify({ code }) }),
  summary: (id: string, period: string) => request<Summary>(`/ledgers/${id}/reports/summary?period=${encodeURIComponent(period)}`),
  budgetStatus: (id: string, period: string) => request<{ limit_minor: number | null; spent_minor: number; ratio_bp: number | null; level: string }>(`/ledgers/${id}/budgets/status?period=${encodeURIComponent(period)}`),
  putBudget: (id: string, period: string, limit_minor: number) => request<{ limit_minor: number }>(`/ledgers/${id}/budgets/${period}`, { method: "PUT", body: JSON.stringify({ limit_minor }) }),
  activity: (id: string) => request<{ items: { action: string; entity_type: string; username: string; created_at: string }[] }>(`/ledgers/${id}/activity`),
  createChatThread: () => request<{ id: string; title: string }>("/chat/threads", { method: "POST" }),
  chatMessages: (id: string) => request<{ messages: { id: string; role: "user" | "assistant"; content: string; blocks?: { title: string; columns: string[]; rows: string[][] }[]; verified: boolean }[] }>(`/chat/threads/${id}/messages`),
  sendChat: (id: string, content: string) => request<{ id: string; content: string; blocks: { title: string; columns: string[]; rows: string[][] }[]; verified: boolean }>(`/chat/threads/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
};
