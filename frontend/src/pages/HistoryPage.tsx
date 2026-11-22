import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Receipt } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath, receiptReviewPath } from "../lib/routes";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusBadge,
  Icon,
  Button,
} from "../components/ui";

const money = (amount: number | null, currency: string) =>
  amount == null
    ? "Belum ada total"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "IDR" ? 0 : 2,
      }).format(amount / (currency === "IDR" ? 1 : 100));

export function HistoryPage() {
  const { ledger, loading: ledgerLoading, error: ledgerError } = useLedger();
  const [params, setParams] = useSearchParams();

  // URL query as source of initial search value
  const initialQuery = params.get("q") ?? "";
  const [searchVal, setSearchVal] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  const [items, setItems] = useState<Receipt[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Debounce user input by 280ms
  const debounceTimer = useRef<number | null>(null);
  useEffect(() => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      setDebouncedQuery(searchVal.trim());
      // Update URL query cleanly
      if (searchVal.trim()) {
        setParams({ q: searchVal.trim() }, { replace: true });
      } else {
        setParams({}, { replace: true });
      }
    }, 280);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [searchVal, setParams]);

  // Load receipts with cancellation for in-flight stale requests
  useEffect(() => {
    if (!ledger) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .receipts(ledger.id, debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : "")
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
          setCursor(data.next_cursor);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Tidak dapat memuat daftar riwayat. Periksa koneksi internetmu.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledger, debouncedQuery, reloadTrigger]);

  const handleLoadMore = () => {
    if (!ledger || !cursor || loadingMore) return;
    setLoadingMore(true);
    api
      .receipts(ledger.id, `?cursor=${encodeURIComponent(cursor)}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ""}`)
      .then((data) => {
        setItems((current) => [...current, ...data.items]);
        setCursor(data.next_cursor);
      })
      .finally(() => setLoadingMore(false));
  };

  if (ledgerLoading) {
    return <LoadingState label="Memuat buku…" />;
  }

  if (ledgerError || !ledger) {
    return (
      <EmptyState
        title="Buku tidak tersedia"
        icon="alert"
        action={
          <Link className="small-button" to="/app/books">
            Buka daftar buku
          </Link>
        }
      >
        {ledgerError || "Buku ini tidak dapat dibuka atau kamu belum memiliki izin."}
      </EmptyState>
    );
  }

  return (
    <section className="history-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{ledger.name.toUpperCase()}</p>
          <h1>Riwayat belanja</h1>
        </div>
        <Link className="small-button" to={ledgerPath(ledger.id, "scan")}>
          <Icon name="plus" size={16} />
          <span>Tambah</span>
        </Link>
      </div>

      <label className="search-box" htmlFor="history-search">
        <Icon name="search" size={18} />
        <input
          id="history-search"
          value={searchVal}
          onChange={(event) => setSearchVal(event.target.value)}
          placeholder="Cari merchant atau catatan belanja…"
          aria-label="Cari riwayat pengeluaran"
        />
        {searchVal && (
          <button
            type="button"
            className="ghost-button p-1"
            onClick={() => setSearchVal("")}
            aria-label="Hapus kata kunci pencarian"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </label>

      {error ? (
        <ErrorState
          title="Gagal memuat riwayat"
          message={error}
          onRetry={() => setReloadTrigger((prev) => prev + 1)}
        />
      ) : loading ? (
        <LoadingState label="Memuat riwayat belanja…" />
      ) : items.length ? (
        <div className="receipt-list">
          {items.map((item) => (
            <Link
              to={receiptReviewPath(ledger.id, item.id)}
              className="receipt-row"
              key={item.id}
            >
              <span className="receipt-date">
                {item.purchased_on
                  ? new Date(item.purchased_on).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                    })
                  : "—"}
              </span>
              <span className="receipt-main">
                <strong>{item.merchant_name || "Tanpa nama merchant"}</strong>
                <small>
                  <StatusBadge status={item.status} />
                </small>
              </span>
              <strong className="receipt-total">
                {money(item.total_ledger_minor ?? item.total_minor, item.currency)}
              </strong>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title={debouncedQuery ? "Tidak ada hasil pencarian" : "Belum ada catatan"}
          icon="receipt"
          action={
            <Link className="primary-button" to={ledgerPath(ledger.id, "scan")}>
              Tambah pengeluaran
            </Link>
          }
        >
          {debouncedQuery
            ? `Tidak ada transaksi yang cocok dengan kata kunci "${debouncedQuery}".`
            : "Foto struk atau catat manual pengeluaranmu untuk mulai memantau."}
        </EmptyState>
      )}

      {cursor && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={handleLoadMore}
          loading={loadingMore}
        >
          Muat lebih banyak
        </Button>
      )}
    </section>
  );
}
