import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { Button, Alert, LiveRegion, Icon, LoadingState } from "../components/ui";

const QUICK_PROMPTS = [
  "Berapa total belanja bulan ini?",
  "Apa kategori dengan pengeluaran terbesar?",
  "Berapa rata-rata belanja harianku?",
  "Bandingkan belanja bulan ini vs bulan lalu.",
];

type ThreadInfo = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

export function ChatPage() {
  const { session, setSession } = useSession();
  const [thread, setThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<
    {
      role: "user" | "assistant";
      content: string;
      verified?: boolean;
      blocks?: { title: string; columns: string[]; rows: string[][] }[];
    }[]
  >([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Load or persist active thread
  useEffect(() => {
    let cancelled = false;
    const initChat = async () => {
      try {
        setInitialLoading(true);
        const { threads } = await api.chatThreads();
        const savedId = localStorage.getItem("ib_chat_thread_id");
        let activeThread: ThreadInfo | undefined =
          threads.find((t) => t.id === savedId) || threads[0];

        if (!activeThread) {
          activeThread = await api.createChatThread();
        }

        if (cancelled) return;
        setThread(activeThread);
        localStorage.setItem("ib_chat_thread_id", activeThread.id);

        // Load existing messages for this thread
        const msgData = await api.chatMessages(activeThread.id);
        if (cancelled) return;
        setMessages(
          msgData.messages.map((m) => ({
            role: m.role,
            content: m.content,
            verified: m.verified,
            blocks: m.blocks,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Tidak dapat memuat percakapan Tanya AI.",
          );
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };

    if (session?.ai_notice_acknowledged) {
      void initChat();
    } else {
      setInitialLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [session?.ai_notice_acknowledged]);

  const handleNewThread = async () => {
    try {
      setBusy(true);
      setError("");
      const newTh = await api.createChatThread();
      setThread(newTh);
      setMessages([]);
      localStorage.setItem("ib_chat_thread_id", newTh.id);
      setAnnouncement("Percakapan baru telah dimulai.");
    } catch {
      setError("Gagal membuat percakapan baru.");
    } finally {
      setBusy(false);
    }
  };

  const acknowledge = async () => {
    await api.ackAiNotice();
    setSession({ ...session!, ai_notice_acknowledged: true });
  };

  const send = async (event?: FormEvent, promptText?: string) => {
    if (event) event.preventDefault();
    const textToSend = (promptText || content).trim();
    if (!thread || !textToSend || busy) return;

    setContent("");
    setMessages((current) => [...current, { role: "user", content: textToSend }]);
    setBusy(true);
    setError("");

    try {
      const answer = await api.sendChat(thread.id, textToSend);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: answer.content,
          verified: answer.verified,
          blocks: answer.blocks,
        },
      ]);
      setAnnouncement(`Jawaban AI: ${answer.content}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Tanya AI sedang tidak tersedia.";
      setError(msg);
      setAnnouncement(`Terjadi kesalahan: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  if (!session?.ai_notice_acknowledged) {
    return (
      <section className="chat-page">
        <p className="eyebrow">TANYA AI</p>
        <h1>Angka dari datamu.</h1>
        <p className="muted">
          Tanya AI hanya membaca ringkasan pengeluaran. AI ini beroperasi dalam mode read-only dan
          tidak dapat mengubah data apapun. Persetujuanmu diperlukan sebelum memulai.
        </p>
        <Button variant="primary" onClick={acknowledge}>
          Saya mengerti dan setuju
        </Button>
      </section>
    );
  }

  return (
    <section className="chat-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TANYA AI · READ-ONLY</p>
          <h1>Teman melihat pola.</h1>
        </div>
        <Button
          variant="secondary"
          className="small-button"
          onClick={handleNewThread}
          disabled={busy || initialLoading}
        >
          <Icon name="plus" size={14} />
          <span>Baru</span>
        </Button>
      </div>

      <LiveRegion message={announcement} level="polite" />

      {/* Suggested Quick Prompts */}
      {messages.length === 0 && !initialLoading && (
        <div className="quick-prompts-container" role="region" aria-label="Saran pertanyaan">
          <small className="muted font-semibold block mb-2">Coba tanyakan:</small>
          <div className="quick-prompts-grid">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="quick-prompt-chip"
                onClick={() => send(undefined, prompt)}
                disabled={busy}
              >
                <span>{prompt}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-log" role="log" aria-label="Riwayat percakapan AI">
        {initialLoading ? (
          <LoadingState label="Memuat riwayat percakapan…" />
        ) : messages.length === 0 ? (
          <p className="muted chat-empty">
            Mulai percakapan dengan AI. Tanyakan rincian atau perbandingan dari data pengeluaranmu.
          </p>
        ) : (
          messages.map((message, index) => (
            <article
              className={`chat-bubble ${message.role}`}
              key={`${message.role}-${index}`}
            >
              <p>{message.content}</p>

              {message.role === "assistant" && message.verified && (
                <div className="mt-2">
                  <span className="status-badge status-confirmed">
                    <Icon name="check" size={12} />
                    <span>Terverifikasi dari data aplikasi</span>
                  </span>
                </div>
              )}

              {message.blocks?.map((block) => (
                <div key={block.title} className="table-responsive mt-3">
                  <table>
                    <caption>{block.title}</caption>
                    <thead>
                      <tr>
                        {block.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </article>
          ))
        )}
        {busy && (
          <article className="chat-bubble assistant">
            <span className="button-loading-content">
              <span className="spinner" aria-hidden="true" />
              <span>AI sedang berpikir…</span>
            </span>
          </article>
        )}
      </div>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mt-3">
          {error}
        </Alert>
      )}

      <form className="chat-form" onSubmit={(e) => send(e)}>
        <label className="sr-only" htmlFor="chat-input">
          Pertanyaan untuk AI
        </label>
        <input
          id="chat-input"
          value={content}
          maxLength={500}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tanyakan pola pengeluaranmu…"
          disabled={busy || initialLoading}
        />
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={busy || initialLoading || !content.trim()}
        >
          Kirim
        </Button>
      </form>
    </section>
  );
}
