import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation, useSearchParams, useParams } from "react-router-dom";
import { ApiError, api, type Receipt, type RecentExpenseItem } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath, receiptDetailPath, scanReturnState } from "../lib/routes";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusBadge,
  Icon,
  Button,
} from "../components/ui";
import { RecentExpenses } from "../components/RecentExpenses";

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
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  //cosmetic
  const [activeGroup, setActiveGroup] = useState("merchant");

  // URL query as source of initial search value
  const initialQuery = params.get("q") ?? "";
  const [searchVal, setSearchVal] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  ///by merchant
  const [items, setItems] = useState<Receipt[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadTrigger, setReloadTrigger] = useState(0);

  //by items
  const [expenseItems, setExpenseItems] = useState<RecentExpenseItem[]>([]);
  const { ledgerId } = useParams();
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsLoadingMore, setItemsLoadingMore] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [itemsReloadTrigger, setItemsReloadTrigger] = useState(0);
  const itemsLoadingMoreRef = useRef(false);
  const activeLedgerIdRef = useRef(ledgerId);
  activeLedgerIdRef.current = ledgerId;



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
        setParams({ q: searchVal.trim() }, { replace: true, state: location.state });
      } else {
        setParams({}, { replace: true, state: location.state });
      }
    }, 280);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [location.state, searchVal, setParams]);

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

  
  ///load by item
  useEffect(() => {
    if (!ledger?.id) return;

    let cancelled = false;
    itemsLoadingMoreRef.current = false;
    setItemsLoadingMore(false);
    setExpenseItems([]);
    setNextCursor(null);
    setItemsError("");
    setItemsLoading(true);
    api
      .recentExpenseItems(ledger.id, 20, undefined, debouncedQuery)
      .then((data) => {
        if (cancelled) return;
        setExpenseItems(data.items);
        setNextCursor(data.next_cursor);
      })
      .catch((cause) => {
        if (!cancelled) {
          setItemsError(
            cause instanceof ApiError
              ? cause.message
              : "Tidak dapat memuat riwayat pengeluaran.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemsReloadTrigger, ledger?.id, debouncedQuery]);

  const loadNextItems = useCallback(async () => {
    if (!ledger?.id || !nextCursor || itemsLoadingMoreRef.current) return;

    const requestedLedgerId = ledger?.id;
    itemsLoadingMoreRef.current = true;
    setItemsLoadingMore(true);
    setItemsError("");
    try {
      const data = await api.recentExpenseItems(requestedLedgerId, 20, nextCursor);
      if (activeLedgerIdRef.current !== requestedLedgerId) return;
      setExpenseItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !existingIds.has(item.id))];
      });
      setNextCursor(data.next_cursor);
    } catch (cause) {
      if (activeLedgerIdRef.current === requestedLedgerId) {
        setItemsError(
          cause instanceof ApiError
            ? cause.message
            : "Tidak dapat memuat riwayat pengeluaran.",
        );
      }
    } finally {
      if (activeLedgerIdRef.current === requestedLedgerId) {
        itemsLoadingMoreRef.current = false;
        setItemsLoadingMore(false);
      }
    }
  }, [ledger?.id, nextCursor]);

  const retryItems = useCallback(() => {
    if (nextCursor) {
      void loadNextItems();
    } else {
      setItemsReloadTrigger((current) => current + 1);
    }
  }, [loadNextItems, nextCursor]);


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
    <section className="">


      <label className="flex flex-row items-center gap-3 px-4 py-3 bg-olive-200 rounded-md mb-2" htmlFor="history-search">
        <Icon name="search" size={18} />
        <input
          id="history-search"
          value={searchVal}
          onChange={(event) => setSearchVal(event.target.value)}
          placeholder="Cari merchant atau catatan belanja…"
          aria-label="Cari riwayat pengeluaran"
          className="bg-transparent border-0 outline-0 w-full"
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

      <div className="flex flex-row w-full justify-between gap-2 mb-2">
        <div onClick={() => setActiveGroup("merchant")} className={`${activeGroup == "merchant" ? "bg-(--color-accent) text-white" : "bg-olive-200 text-black"} w-full py-2 px-2 text-center  rounded-md`}>
          Lihat Merchant
        </div>
        <div onClick={() => setActiveGroup("item")} className={`${activeGroup == "item" ? "bg-(--color-accent) text-white" : "bg-olive-200 text-black"} w-full py-2 px-2 text-center  rounded-md`}>
          Lihat Item
        </div>
      </div>

      {activeGroup === "merchant" ? (
        <>
          {error ? (
            <ErrorState
              title="Gagal memuat riwayat"
              message={error}
              onRetry={() => setReloadTrigger((prev) => prev + 1)}
            />
          ) : loading ? (
            <LoadingState label="Memuat riwayat belanja…" />
          ) : items.length ? (
            <div className="flex flex-col bg-white divide-y divide-gray-100 rounded-lg overflow-hidden">
              {items.map((item) => (
                <Link
                  to={receiptDetailPath(ledger.id, item.id)}
                  className="home-expense-card flex flex-row gap-4 items-center justify-between px-4 py-3"
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
                  </span>
                  <strong className="receipt-total">
                    {item.status !== "confirmed" ? (
                      <StatusBadge status={item.status} />
                    ) : (
                      <p>{money(item.total_ledger_minor ?? item.total_minor, item.currency)}</p>
                    )}
                  </strong>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title={debouncedQuery ? "Tidak ada hasil pencarian" : "Belum ada catatan"}
              icon="receipt"
              action={
                <Link
                  className="primary-button"
                  to={ledgerPath(ledger.id, "scan")}
                  state={scanReturnState(`${location.pathname}${location.search}`)}
                >
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
        </>
      ) : (
        <RecentExpenses
          ledgerId={ledger.id}
          items={expenseItems}
          loading={itemsLoading}
          formatAmount={money}
          error={itemsError}
          onRetry={retryItems}
          groupByMonth
          showAllLink={false}
          hasMore={Boolean(nextCursor)}
          loadingMore={itemsLoadingMore}
          onLoadMore={loadNextItems}
        />
      )}

    </section>
  );
}
