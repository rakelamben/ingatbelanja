import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { Button, Alert, LiveRegion, Icon, LoadingState } from "../components/ui";
import { SiMoreVert } from '@sargamicons/react/fill';
import { SiDownRight } from '@sargamicons/react/fill';
import { SiLibraryBooks } from '@sargamicons/react/line';
import { DropdownMenu } from "../components/DropdownMenu";




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
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
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
        const { threads: fetchedThreads } = await api.chatThreads();
        let threadList: ThreadInfo[] = fetchedThreads;
        const savedId = localStorage.getItem("ib_chat_thread_id");
        let activeThread: ThreadInfo | undefined =
          threadList.find((t) => t.id === savedId) || threadList[0];

        if (!activeThread) {
          activeThread = await api.createChatThread();
          threadList = [activeThread];
        }

        if (cancelled) return;
        setThreads(threadList);
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

  const handleSelectThread = async (threadId: string) => {
    const selected = threads.find((item) => item.id === threadId);
    if (!selected || selected.id === thread?.id || busy) return;

    setThread(selected);
    localStorage.setItem("ib_chat_thread_id", selected.id);
    setError("");
    setBusy(true);

    try {
      const msgData = await api.chatMessages(selected.id);
      setMessages(
        msgData.messages.map((m) => ({
          role: m.role,
          content: m.content,
          verified: m.verified,
          blocks: m.blocks,
        })),
      );
      setAnnouncement(`Percakapan aktif: ${selected.title}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Tidak dapat memuat pesan percakapan.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleNewThread = async () => {
    try {
      setBusy(true);
      setError("");
      const newTh = await api.createChatThread();
      setThreads((current) => [newTh, ...current]);
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

  const handleDeleteThread = async () => {
    if (!thread) return;
    if (!window.confirm("Hapus percakapan ini? Riwayat pesan tidak bisa dikembalikan.")) return;

    try {
      setBusy(true);
      setError("");
      const deletedId = thread.id;
      const remaining = threads.filter((item) => item.id !== deletedId);

      if (remaining.length > 0) {
        const nextThread = remaining[0];
        setThreads(remaining);
        setThread(nextThread);
        localStorage.setItem("ib_chat_thread_id", nextThread.id);
        const msgData = await api.chatMessages(nextThread.id);
        setMessages(
          msgData.messages.map((m) => ({
            role: m.role,
            content: m.content,
            verified: m.verified,
            blocks: m.blocks,
          })),
        );
      } else {
        // `send` butuh thread aktif, jadi langsung buat yang baru
        const newTh = await api.createChatThread();
        setThreads([newTh]);
        setThread(newTh);
        setMessages([]);
        localStorage.setItem("ib_chat_thread_id", newTh.id);
      }
      setAnnouncement("Percakapan telah dihapus.");
    } catch {
      setError("Gagal menghapus percakapan.");
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
      if (thread.title === "Percakapan baru") {
        const nextTitle = textToSend.slice(0, 60);
        setThread((current) => (current ? { ...current, title: nextTitle } : current));
        setThreads((current) =>
          current.map((item) =>
            item.id === thread.id ? { ...item, title: nextTitle } : item,
          ),
        );
      }
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
    <section className="fixed inset-0 flex flex-col pt-14">
      <div className="shrink-0 flex flex-row w-full items-center gap-2 px-4 py-3">
        {/* <Button
          variant="secondary"
          className="small-button"
          onClick={handleNewThread}
          disabled={busy || initialLoading}
        >
          <SiMoreVert className="text-xl" />
        </Button> */}
        <DropdownMenu
          label="Menu percakapan"
          disabled={busy || initialLoading}
          trigger={<SiMoreVert className="text-2xl" />}
          items={[
            { label: "Percakapan baru", onSelect: handleNewThread },
            {
              label: "Hapus percakapan ini",
              onSelect: handleDeleteThread,
              danger: true,
              disabled: !thread,
            },
          ]}
        />
        <select
          aria-label="Pilih percakapan"
          className="w-full px-4 py-3 bg-olive-200 rounded-md"
          value={thread?.id ?? ""}
          disabled={busy || initialLoading || threads.length === 0}
          onChange={(event) => {
            void handleSelectThread(event.target.value);
          }}
        >
          {threads.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title || "Percakapan baru"}
            </option>
          ))}
        </select>
      </div>

      <LiveRegion message={announcement} level="polite" />

      {/* Suggested Quick Prompts */}


      <div className="flex-1 space-y-4 min-h-0 overflow-y-auto px-4 py-4" role="log" aria-label="Riwayat percakapan AI">
        {initialLoading ? (
          <LoadingState label="Memuat riwayat percakapan…" />
        ) : messages.length === 0 ? (
          <p className="text-center my-auto px-8">
            Mulai percakapan dengan AI. Tanyakan rincian atau perbandingan dari data pengeluaranmu.
          </p>
        ) : (
          messages.map((message, index) => (
            <article
              className={`chat-bubble ${message.role} gap-6`}
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

      <div className="shrink-0 w-full min-w-0">
        {messages.length === 0 && !initialLoading && (
          <div className="flex flex-row items-center gap-4 overflow-auto px-4">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="bg-olive-200 px-4 py-2 rounded-full whitespace-nowrap"
                onClick={() => send(undefined, prompt)}
                disabled={busy}
              >
                <span>{prompt}</span>
              </button>
            ))}
          </div>
        )}
        <form className="px-4 py-4 w-full flex flex-row gap-2 justify-between" onSubmit={(e) => send(e)}>
          <input
            id="chat-input"
            value={content}
            maxLength={500}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tanyakan pola pengeluaranmu…"
            disabled={busy || initialLoading}
            className="bg-olive-200 px-3 py-3 w-full h-full rounded-md"
          />
          <div
            className="bg-olive-300  px-4 rounded-md grid place-items-center"
          >
            <SiLibraryBooks className="text-2xl" />
          </div>
          <button
            type="submit"
            className="bg-(--color-accent) px-4 rounded-md text-white"
            disabled={busy || initialLoading || !content.trim()}
          >
            <SiDownRight className="text-2xl" />
          </button>
        </form>
      </div>
    </section>
  );
}
