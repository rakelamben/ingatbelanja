import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SiAddCircle, SiRemove } from "@sargamicons/react/fill";
import { useLedger } from "../context/LedgerContext";
import { useLedgerSelection } from "../context/LedgerSelectionContext";
import { api, type RecentExpenseItem, type Summary } from "../lib/api";
import { ledgerPath, scanReturnState } from "../lib/routes";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import { LedgerSwitcher } from "../components/LedgerSwitcher";
import { RecentExpenses } from "../components/RecentExpenses";

const formatMoney = (amount: number | null, currency: string) => {
  if (amount == null) return "—";
  const formatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amount / 10 ** fractionDigits).replace(/[\u00a0\u202f]/g, "");
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export function HomePage() {
  const location = useLocation();
  const { ledger, loading: ledgerLoading, error: ledgerError } = useLedger();
  const { setHomeLedgerId } = useLedgerSelection();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<RecentExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const period = currentMonth();

  useEffect(() => {
    if (!ledger) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      api.summary(ledger.id, period),
      api.recentExpenseItems(ledger.id),
    ])
      .then(([summaryData, itemData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setItems(itemData.items);
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat memuat ringkasan dan riwayat pengeluaran.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledger, period, reloadTrigger]);

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
            Lihat daftar buku
          </Link>
        }
      >
        {ledgerError || "Buku aktif tidak dapat dimuat."}
      </EmptyState>
    );
  }

  const latestItem = items[0];
  const latestAmount = latestItem?.amount_ledger_minor ?? latestItem?.amount_minor ?? null;
  const latestCurrency =
    latestItem?.amount_ledger_minor != null
      ? ledger.currency
      : (latestItem?.currency ?? ledger.currency);

  return (
    <div className="dashboard pt-3">
      <section className="text-sm bg-(--color-primary) overflow-hidden rounded-lg flex-col">
        
        <div className="px-1 bg-(--color-accent) py-1 text-white">
          <LedgerSwitcher
            activeId={ledger.id}
            variant="home"
            onChange={setHomeLedgerId}
          />
        </div>
        <div className="welcome-content px-5 mt-4 mb-5">
          <h1 className="text-white font-bold text-4xl" aria-live="polite">
            {loading
              ? "Memuat…"
              : formatMoney(summary?.total_minor ?? null, summary?.currency ?? ledger.currency)}
          </h1>
          <div className="flex flex-row mt-2 items-center justify-between">
            <p className="text-sm text-white">Total Pengeluaran</p>
            <div className="flex flex-row">
              <div className="bg-white/10 py-1 pl-2 p-1 rounded-full text-xs flex flex-row text-white items-center gap-1">
                <p className="text-xs">Terakhir</p>
                <div className="bg-white/10 py-1 px-2 rounded-full text-xs flex flex-row items-center gap-1">
                  <SiRemove aria-hidden="true" />
                  <span>{loading ? "…" : formatMoney(latestAmount, latestCurrency)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full my-3">
        <Link
          to={ledgerPath(ledger.id, "scan")}
          state={scanReturnState(`${location.pathname}${location.search}`)}
          className="flex rounded-full flex-row gap-2 items-center bg-[#EFEFE7] px-3 py-2 w-full"
        >
          <SiAddCircle className="text-xl" aria-hidden="true" />
          <span className="font-bold">Tambah Pengeluaran</span>
        </Link>
      </div>

      {error && (
        <ErrorState
          title="Gagal memuat Beranda"
          message={error}
          onRetry={() => setReloadTrigger((previous) => previous + 1)}
        />
      )}

      <div className="flex flex-row mt-4 justify-between items-center w-full mb-4">
        <h2 className="font-bold">Riwayat Pengeluaran</h2>
          <Link
            to={ledgerPath(ledger.id, "history")}
            className="font-bold underline decoration-(--color-accent)"
          >
            Lihat semua
          </Link>
      </div>

      <RecentExpenses
        ledgerId={ledger.id}
        items={items}
        loading={loading}
        formatAmount={formatMoney}
      />
    </div>
  );
}
