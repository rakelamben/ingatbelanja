import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath, receiptReviewPath } from "../lib/routes";
import { Alert, EmptyState, Icon } from "../components/ui";

export function ScanPage() {
  const { ledger } = useLedger();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    if (!ledger) return;
    setBusy(true);
    setError("");
    setMessage("Menyimpan foto struk…");

    try {
      const receipt = await api.uploadPhoto(ledger.id, file);
      setMessage("Struk sedang diproses oleh AI…");
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const status = await api.receiptStatus(receipt.id);
        if (status.status !== "processing") {
          navigate(receiptReviewPath(ledger.id, receipt.id));
          return;
        }
      }
      // If polling times out, still take user to review draft
      navigate(receiptReviewPath(ledger.id, receipt.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Foto tidak dapat diproses.");
    } finally {
      setBusy(false);
    }
  };

  if (!ledger) {
    return (
      <EmptyState
        title="Buku tidak tersedia"
        icon="alert"
        action={
          <Link className="small-button" to="/app/books">
            Lihat daftar buku
          </Link>
        }
      >
        Pilih buku aktif terlebih dahulu untuk scan struk.
      </EmptyState>
    );
  }

  return (
    <section className="scan-page">
      <Link className="back-link" to={ledgerPath(ledger.id)}>
        <Icon name="arrow-left" size={16} />
        <span>Kembali ke Beranda</span>
      </Link>
      <p className="eyebrow">TAMBAH PENGELUARAN</p>
      <h1>Scan strukmu.</h1>
      <p className="muted">Foto yang terang dan lurus membantu hasil pembacaan lebih akurat.</p>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mt-4">
          {error}
        </Alert>
      )}

      <div className="scan-actions">
        <button
          className="scan-dropzone"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-label="Pilih foto struk untuk diunggah"
        >
          <span className="dropzone-icon" aria-hidden="true">
            <Icon name="upload" size={36} />
          </span>
          <strong>{busy ? message : "Pilih foto struk"}</strong>
          <small>JPG, PNG, atau WebP · maksimal 12 MB</small>
        </button>
        <input
          ref={input}
          id="receipt-file-input"
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])}
        />
        <Link className="manual-link" to={ledgerPath(ledger.id, "manual")}>
          <span>atau catat manual</span>
          <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </section>
  );
}
