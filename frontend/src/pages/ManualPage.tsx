import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath } from "../lib/routes";
import { Button, Field, Alert, EmptyState, Icon } from "../components/ui";

export function ManualPage() {
  const { ledger } = useLedger();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ledger) return;
    setError("");
    setBusy(true);

    try {
      await api.manualReceipt(ledger.id, {
        purchased_on: date,
        amount_minor: Number(amount),
        merchant_name: merchant.trim() || undefined,
      });
      navigate(ledgerPath(ledger.id, "history"));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Catatan gagal disimpan.";
      setError(message);
      window.setTimeout(() => errorRef.current?.focus(), 50);
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
        Pilih buku aktif terlebih dahulu untuk mencatat pengeluaran.
      </EmptyState>
    );
  }

  return (
    <section className="manual-page">
      <Link className="back-link" to={ledgerPath(ledger.id)}>
        <Icon name="arrow-left" size={16} />
        <span>Kembali ke Beranda</span>
      </Link>
      <p className="eyebrow">CATAT MANUAL</p>
      <h1>Tanpa foto pun bisa.</h1>
      <p className="muted">Jalur manual selalu tersedia dan langsung tersimpan ke pembukuan.</p>

      {error && (
        <div ref={errorRef} tabIndex={-1} style={{ outline: "none", marginTop: "1rem" }}>
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}

      <form className="manual-form" onSubmit={submit}>
        <Field
          id="manual-merchant"
          label="Merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Contoh: Pasar Minggu, Toko Berkah"
          help="Nama toko atau tempat transaksi."
        />
        <Field
          id="manual-date"
          label="Tanggal"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          id="manual-amount"
          label="Total (Rp)"
          type="number"
          inputMode="numeric"
          required
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Contoh: 42000"
          help="Nominal pengeluaran dalam Rupiah."
        />
        <Button type="submit" variant="primary" loading={busy}>
          Simpan pengeluaran
        </Button>
      </form>
    </section>
  );
}
