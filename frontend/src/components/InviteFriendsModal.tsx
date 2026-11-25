import { useEffect, useState } from "react";
import { ApiError, api, type LedgerInvite } from "../lib/api";
import { Alert, Button, LoadingState } from "./ui";

type InviteFriendsModalProps = {
  ledgerId: string;
  ledgerName: string;
  onClose: () => void;
};

function formatExpiry(expiresAt: string) {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return expiresAt;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function InviteFriendsModal({
  ledgerId,
  ledgerName,
  onClose,
}: InviteFriendsModalProps) {
  const [invites, setInvites] = useState<LedgerInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listInvites(ledgerId)
      .then((data) => {
        if (!cancelled) setInvites(data.invites);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof ApiError
              ? cause.message
              : "Tidak dapat memuat daftar kode undangan.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledgerId]);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const created = await api.createInvite(ledgerId);
      setInvites((current) => [{ ...created, use_count: 0 }, ...current]);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Gagal membuat kode undangan.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setRevokingId(inviteId);
    setError("");
    try {
      await api.revokeInvite(ledgerId, inviteId);
      setInvites((current) => current.filter((item) => item.id !== inviteId));
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Gagal mencabut kode undangan.",
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedId(key);
      window.setTimeout(() => {
        setCopiedId((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      setError("Gagal menyalin ke clipboard.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Undang teman"
    >
      <div className="bg-white rounded-lg w-full max-w-md p-5 shadow-lg">
        <h2 className="text-lg font-bold">Undang Teman ke {ledgerName}</h2>
        <p className="text-sm opacity-75 mt-1">
          Bagikan kode atau link undangan agar teman bisa bergabung ke buku bersama ini.
        </p>

        {error && (
          <Alert variant="error" onDismiss={() => setError("")} className="mt-3">
            {error}
          </Alert>
        )}

        <Button
          type="button"
          variant="primary"
          className="w-full mt-4"
          loading={creating}
          disabled={creating}
          onClick={handleCreate}
        >
          Buat Kode Undangan
        </Button>

        <div className="mt-4 max-h-64 overflow-y-auto">
          {loading ? (
            <LoadingState label="Memuat kode undangan…" />
          ) : invites.length === 0 ? (
            <p className="text-sm opacity-70 text-center py-4">
              Belum ada kode undangan aktif.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {invites.map((invite) => {
                const shareUrl = `${window.location.origin}/app/books?join=${encodeURIComponent(invite.code)}`;
                return (
                  <li key={invite.id} className="py-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-base font-bold tracking-wider bg-olive-200 px-2.5 py-1 rounded">
                        {invite.code}
                      </code>
                      <span className="text-xs opacity-70">
                        {invite.use_count ?? 0}/{invite.max_uses} dipakai · s/d{" "}
                        {formatExpiry(invite.expires_at)}
                      </span>
                    </div>
                    <div className="flex flex-row gap-2">
                      <button
                        type="button"
                        className="secondary-button flex-1 text-xs"
                        onClick={() => void handleCopy(`code-${invite.id}`, invite.code)}
                      >
                        {copiedId === `code-${invite.id}` ? "Tersalin" : "Salin Kode"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button flex-1 text-xs"
                        onClick={() => void handleCopy(`link-${invite.id}`, shareUrl)}
                      >
                        {copiedId === `link-${invite.id}` ? "Link Tersalin" : "Salin Link"}
                      </button>
                      <Button
                        type="button"
                        variant="danger"
                        className="text-xs"
                        loading={revokingId === invite.id}
                        disabled={revokingId === invite.id}
                        onClick={() => void handleRevoke(invite.id)}
                      >
                        Cabut
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full mt-4"
          onClick={onClose}
        >
          Tutup
        </Button>
      </div>
    </div>
  );
}
