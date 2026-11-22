import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Summary } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath } from "../lib/routes";
import { EmptyState, LoadingState, ErrorState, Icon } from "../components/ui";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(value / (currency === "IDR" ? 1 : 100));

export function ReportsPage() {
  const { ledger } = useLedger();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    if (!ledger) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .summary(ledger.id, period)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Tidak dapat memuat ringkasan laporan bulanan.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledger, period, reloadTrigger]);

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
        Pilih buku aktif terlebih dahulu untuk melihat laporan.
      </EmptyState>
    );
  }

  const max = summary?.by_day?.length
    ? Math.max(...summary.by_day.map((item) => item.amount_minor), 1)
    : 1;

  // Highlights for mobile
  const peakDay = summary?.by_day?.length
    ? [...summary.by_day].sort((a, b) => b.amount_minor - a.amount_minor)[0]
    : null;
  const activeDays = summary?.by_day?.filter((d) => d.amount_minor > 0).length || 1;
  const avgDaily = summary ? Math.round(summary.total_minor / Math.max(activeDays, 1)) : 0;

  return (
    <section className="reports-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">RINGKASAN BULAN {period}</p>
          <h1>Lihat polanya.</h1>
        </div>
        <div className="reports-heading-controls">
          <input
            type="month"
            className="month-picker-input"
            value={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)}
            aria-label="Pilih bulan laporan"
          />
          <Link className="small-button" to={ledgerPath(ledger.id, "budget")}>
            <Icon name="calendar" size={16} />
            <span>Anggaran</span>
          </Link>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Gagal memuat laporan"
          message={error}
          onRetry={() => setReloadTrigger((prev) => prev + 1)}
        />
      ) : loading || !summary ? (
        <LoadingState label="Memuat ringkasan laporan bulanan…" />
      ) : (
        <>
          <div className="summary-cards">
            <article>
              <small>Total belanja bulan ini</small>
              <strong>{money(summary.total_minor, summary.currency)}</strong>
            </article>
            <article>
              <small>Jumlah struk</small>
              <strong>{summary.count} transaksi</strong>
            </article>
            <article>
              <small>Perubahan vs bulan lalu</small>
              <strong>
                {summary.compare.pct_bp == null
                  ? "—"
                  : `${(summary.compare.pct_bp / 100).toFixed(1)}%`}
              </strong>
            </article>
          </div>

          {/* Quick Highlights */}
          {summary.total_minor > 0 && (
            <div className="report-highlights-grid">
              <div className="report-highlight-card">
                <small>Pengeluaran Harian Tertinggi</small>
                <strong>
                  {peakDay ? money(peakDay.amount_minor, summary.currency) : "—"}
                </strong>
                <span className="text-xs muted">
                  {peakDay ? `Pada tanggal ${peakDay.date}` : ""}
                </span>
              </div>
              <div className="report-highlight-card">
                <small>Rata-rata Hari Belanja</small>
                <strong>{money(avgDaily, summary.currency)}</strong>
                <span className="text-xs muted">Dari {activeDays} hari transaksi aktif</span>
              </div>
            </div>
          )}

          {/* Daily Chart with responsive horizontal scroll */}
          <section className="chart-card">
            <div className="flex justify-between items-center mb-2">
              <h2>Pengeluaran per hari</h2>
              <small className="muted text-xs">Geser jika layar sempit →</small>
            </div>

            <div className="chart-scroll-wrap">
              <div className="day-bars" role="img" aria-label="Grafik pengeluaran harian">
                {summary.by_day.map((item) => (
                  <div className="day-bar-wrap" key={item.date}>
                    <span
                      className="day-bar"
                      style={{ height: `${Math.max(8, (item.amount_minor / max) * 100)}%` }}
                      title={`${item.date}: ${money(item.amount_minor, summary.currency)}`}
                    />
                    <small>{item.date.slice(-2)}</small>
                  </div>
                ))}
              </div>
            </div>

            <ul className="sr-only">
              {summary.by_day.map((item) => (
                <li key={item.date}>
                  {item.date}: {money(item.amount_minor, summary.currency)}
                </li>
              ))}
            </ul>
          </section>

          {/* Top Merchants */}
          {summary.top_merchants && summary.top_merchants.length > 0 && (
            <section className="chart-card">
              <h2>Toko / Merchant Terbanyak</h2>
              <div className="table-responsive">
                {summary.top_merchants.map((m) => (
                  <div className="category-line" key={m.name}>
                    <span>{m.name}</span>
                    <strong>{money(m.amount_minor, summary.currency)}</strong>
                    <span className="category-share">{m.count}x</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Categories */}
          <section className="chart-card">
            <h2>Per kategori pengeluaran</h2>
            {summary.by_category.length ? (
              <div className="table-responsive">
                {summary.by_category.map((item) => (
                  <div className="category-line" key={item.name}>
                    <span>{item.name}</span>
                    <strong>{money(item.amount_minor, summary.currency)}</strong>
                    <span className="category-share">{(item.share_bp / 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Belum ada kategori yang tercatat bulan ini.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
