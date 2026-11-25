import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatPage } from "./ChatPage";
import { api } from "../lib/api";
import { SessionProvider } from "../context/SessionContext";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      chatThreads: vi.fn(),
      chatMessages: vi.fn(),
      createChatThread: vi.fn(),
      sendChat: vi.fn(),
      ackAiNotice: vi.fn(),
      ledgers: vi.fn(),
    },
  };
});

const mockSession = {
  user: { id: "user-1", username: "tester", display_name: "Tester" },
  csrf_token: "csrf-test",
  personal_ledger_id: "ledger-personal",
  ai_notice_acknowledged: true,
};

describe("ChatPage (Sprint D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  it("loads existing thread and message history on mount", async () => {
    vi.mocked(api.chatThreads).mockResolvedValue({
      threads: [
        {
          id: "th-existing",
          title: "Percakapan Lama",
          created_at: "2026-11-20T00:00:00Z",
          updated_at: "2026-11-20T00:00:00Z",
        },
      ],
    });
    vi.mocked(api.chatMessages).mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "Berapa total belanja?",
          verified: false,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Total belanja adalah Rp 150.000.",
          verified: true,
        },
      ],
    });

    render(
      <SessionProvider initialSession={mockSession}>
        <ChatPage />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Berapa total belanja?")).toBeTruthy();
    });

    expect(screen.getByText("Total belanja adalah Rp 150.000.")).toBeTruthy();
    expect(screen.getByText("Terverifikasi dari data aplikasi")).toBeTruthy();
    expect(api.createChatThread).not.toHaveBeenCalled();
  });

  it("creates a new thread when user clicks Baru button", async () => {
    vi.mocked(api.chatThreads).mockResolvedValue({
      threads: [
        {
          id: "th-1",
          title: "Percakapan 1",
          created_at: "2026-11-20T00:00:00Z",
          updated_at: "2026-11-20T00:00:00Z",
        },
      ],
    });
    vi.mocked(api.chatMessages).mockResolvedValue({ messages: [] });
    vi.mocked(api.createChatThread).mockResolvedValue({
      id: "th-fresh",
      title: "Percakapan baru",
    });

    render(
      <SessionProvider initialSession={mockSession}>
        <ChatPage />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /baru/i })).toBeTruthy();
    });

    const newBtn = screen.getByRole("button", { name: /baru/i });
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(api.createChatThread).toHaveBeenCalledTimes(1);
    });
    expect(localStorage.getItem("ib_chat_thread_id")).toBe("th-fresh");
  });

  it("sends message and renders AI response with verified badge", async () => {
    vi.mocked(api.chatThreads).mockResolvedValue({
      threads: [{ id: "th-1", title: "Chat", created_at: "", updated_at: "" }],
    });
    vi.mocked(api.chatMessages).mockResolvedValue({ messages: [] });
    vi.mocked(api.sendChat).mockResolvedValue({
      id: "resp-1",
      content: "Pengeluaran terbesar di kategori Makanan.",
      verified: true,
      blocks: [],
    });

    render(
      <SessionProvider initialSession={mockSession}>
        <ChatPage />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/tanyakan pola pengeluaranmu/i)).toBeTruthy();
    });

    const input = screen.getByPlaceholderText(/tanyakan pola pengeluaranmu/i);
    fireEvent.change(input, { target: { value: "Kategori terbesar apa?" } });

    const sendBtn = screen.getByRole("button", { name: "Kirim" });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText("Pengeluaran terbesar di kategori Makanan.")).toBeTruthy();
    });

    expect(screen.getByText("Terverifikasi dari data aplikasi")).toBeTruthy();
  });

  it("lists session threads in the selector and switches active thread on change", async () => {
    vi.mocked(api.chatThreads).mockResolvedValueOnce({
      threads: [
        { id: "th-1", title: "Belanja Harian", created_at: "2026-11-25", updated_at: "2026-11-25" },
        { id: "th-2", title: "Liburan Bali", created_at: "2026-11-24", updated_at: "2026-11-24" },
      ],
    });
    vi.mocked(api.chatMessages)
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({
        messages: [
          {
            id: "m-2",
            role: "assistant",
            content: "Total pengeluaran Liburan Bali adalah Rp 500.000.",
            verified: true,
          },
        ],
      });

    render(
      <SessionProvider initialSession={mockSession}>
        <ChatPage />
      </SessionProvider>,
    );

    const select = (await screen.findByLabelText("Pilih percakapan")) as HTMLSelectElement;
    await waitFor(() => {
      expect(select.value).toBe("th-1");
    });
    expect(screen.getByRole("option", { name: "Belanja Harian" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Liburan Bali" })).toBeTruthy();

    fireEvent.change(select, { target: { value: "th-2" } });

    await waitFor(() => {
      expect(api.chatMessages).toHaveBeenCalledWith("th-2");
    });
    expect(
      await screen.findByText("Total pengeluaran Liburan Bali adalah Rp 500.000."),
    ).toBeTruthy();
    expect(select.value).toBe("th-2");
    expect(localStorage.getItem("ib_chat_thread_id")).toBe("th-2");
  });

  it("opens watched ledger checklist modal, locks personal ledger, and sends selected ledger_ids", async () => {
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
        {
          id: "ledger-trip",
          name: "Liburan",
          type: "tracker",
          currency: "IDR",
          role: "owner",
          member_count: 2,
          sum_spend: 50000,
        },
      ],
    });
    vi.mocked(api.chatThreads).mockResolvedValue({
      threads: [{ id: "th-1", title: "Chat", created_at: "2026-11-25", updated_at: "2026-11-25" }],
    });
    vi.mocked(api.chatMessages).mockResolvedValue({ messages: [] });
    vi.mocked(api.sendChat).mockResolvedValue({
      id: "m-1",
      content: "Total pengeluaran Liburan Rp 50.000.",
      blocks: [],
      verified: true,
    });

    render(
      <SessionProvider initialSession={mockSession}>
        <ChatPage />
      </SessionProvider>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Pilih buku yang dipantau" });
    expect(dialog).toBeTruthy();

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[0].disabled).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect(checkboxes[1].disabled).toBe(false);

    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    expect(screen.queryByRole("dialog")).toBeNull();

    const input = screen.getByPlaceholderText("Tanyakan pola pengeluaranmu…");
    fireEvent.change(input, { target: { value: "Berapa total belanja?" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));

    await waitFor(() => {
      expect(api.sendChat).toHaveBeenCalledWith(
        "th-1",
        "Berapa total belanja?",
        ["ledger-personal", "ledger-trip"],
      );
    });
  });
});
