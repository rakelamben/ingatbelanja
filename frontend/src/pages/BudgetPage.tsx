import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath } from "../lib/routes";
import { Button, Field, Alert, EmptyState, LoadingState, Icon } from "../components/ui";

export function BudgetPage() {
  const { ledger } = useLedger();
  const period = new Date().toISOString().slice(0, 7);
  const [status, setStatus] = useState<{
    limit_minor: number | null;
    spent_minor: number;
    ratio_bp: number | null;
    level: string;
  } | null>(null);
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!ledger) return;
    setLoading(true);
    api
      .budgetStatus(ledger.id, period)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat memuat status anggaran.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledger, period]);

  const refresh = async () => {
    if (!ledger) return;
    try {
      const data = await api.budgetStatus(ledger.id, period);
      setStatus(data);
    } catch {
      setError("Gagal memperbarui status anggaran.");
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!ledger) return;
    setError("");
    setBusy(true);

    try {
      await api.putBudget(ledger.id, period, Number(limit));
      setLimit("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Anggaran gagal disimpan.");
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
        Pilih buku aktif terlebih dahulu untuk mengatur anggaran.
      </EmptyState>
    );
  }

  if (loading) {
    return <LoadingState label="Memuat status anggaran…" />;
  }

  const ratio = Math.min(status?.ratio_bp ?? 0, 10000);

  return (
    <section className="budget-page">
      <Link className="back-link" to={ledgerPath(ledger.id, "analytics")}>
        <Icon name="arrow-left" size={16} />
        <span>Kembali ke Analytics</span>
      </Link>
      <p className="eyebrow">ANGGARAN BULAN {period}</p>
      <h1>Jaga ritmemu.</h1>
      <p className="muted">Tetapkan batas agar pengeluaran tetap terkendali dan terasa ringan.</p>

      {status && (
        <article className={`budget-meter ${status.level}`}>
          <div className="budget-meter-head">
            <span>Terpakai</span>
            <strong>
              {status.spent_minor.toLocaleString("id-ID")} /{" "}
              {(status.limit_minor ?? 0).toLocaleString("id-ID")}
            </strong>
          </div>
          <div
            className="meter-track"
            role="progressbar"
            aria-valuenow={ratio / 100}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Persentase pemakaian anggaran"
          >
            <span style={{ width: `${ratio / 100}%` }} />
          </div>
          <p>
            {status.limit_minor == null
              ? "Belum ada batas anggaran yang ditetapkan."
              : status.level === "over"
                ? "Anggaran sudah terlampaui. Kurangi pengeluaran baru."
                : status.level === "warning"
                  ? "Peringatan: Kamu sudah mencapai lebih dari 80% anggaran."
                  : "Pengeluaran masih dalam batas aman anggaran."}
          </p>
        </article>
      )}

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mt-4">
          {error}
        </Alert>
      )}

      <form className="compact-form" onSubmit={save}>
        <h2>Atur batas bulanan</h2>
        <Field
          id="budget-limit"
          label="Batas dalam minor unit (Rp)"
          type="number"
          required
          min="0"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Contoh: 2500000"
          help="Masukkan batas total pengeluaran untuk bulan ini."
        />
        <Button type="submit" variant="primary" loading={busy}>
          Simpan batas anggaran
        </Button>
      </form>
    </section>
  );
}
