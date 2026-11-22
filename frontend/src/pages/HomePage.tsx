import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  SiApple,
  SiBriefcaseMedical,
  SiBus,
  SiCreditCard,
  SiGrid,
  SiWallet,
  SiAirplaneAlt,
} from "@sargamicons/react/fill";

<SiAirplaneAlt />
import {
  SiAddCircle,
  SiChevronRightAlt,
  SiRemove,
} from "@sargamicons/react/fill";
import { useLedger } from "../context/LedgerContext";
import { api, type RecentExpenseItem, type Summary } from "../lib/api";
import { ledgerPath, receiptReviewPath } from "../lib/routes";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import { LedgerSwitcher } from "../components/LedgerSwitcher";

const categoryIcons: Record<string, [typeof SiGrid, string]> = {
  makanan: [SiApple, "bg-orange-500"],
  hiburan: [SiAirplaneAlt, "bg-blue-500"],
  transportasi: [SiBus, "bg-indigo-500"],
  belanja: [SiWallet, "bg-pink-500"],
  tagihan: [SiCreditCard, "bg-emerald-400"],
  kesehatan: [SiBriefcaseMedical, "bg-olive-500"],
};

const formatMoney = (amount: number | null, currency: string) => {
  if (amount == null) return "—";
  const formatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amount / 10 ** fractionDigits).replace(/[\u00a0\u202f]/g, "");
};

const formatAddedAt = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export function HomePage() {
  const { ledger, loading: ledgerLoading, error: ledgerError } = useLedger();
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
    <div className="dashboard">
      <section className="text-sm bg-(--color-primary) overflow-hidden rounded-lg flex-col">
        
        <div className="px-1 bg-(--color-accent) py-1 text-white"><LedgerSwitcher activeId={ledger.id}/></div>
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

      <section className="w-full px-1 mt-6 mb-3">
        <div className="flex flex-row justify-between items-center w-full mb-4">
          <h2 className="font-bold">Riwayat Pengeluaran</h2>
          <Link
            to={ledgerPath(ledger.id, "history")}
            className="font-bold underline decoration-(--color-accent)"
          >
            Lihat semua
          </Link>
        </div>

        {loading ? (
          <LoadingState label="Memuat riwayat pengeluaran…" />
        ) : items.length === 0 ? (
          <p className="muted text-sm text-center py-4">Belum ada pengeluaran yang tercatat.</p>
        ) : (
          <div className="flex flex-col bg-white divide-y divide-gray-100 rounded-lg">
            {items.map((item) => {
              const categoryKey = item.category_name?.trim().toLocaleLowerCase("id-ID") ?? "";
              const [CategoryIcon, categoryColor] = categoryIcons[categoryKey] ?? [
                SiGrid,
                "bg-slate-500",
              ];
              const itemName = item.name.trim() || item.category_name?.trim() || "Pengeluaran";
              const amount = item.amount_ledger_minor ?? item.amount_minor;
              const currency =
                item.amount_ledger_minor != null ? item.ledger_currency : item.currency;

              return (
                <Link
                  key={item.id}
                  to={`${receiptReviewPath(ledger.id, item.receipt_id)}?item=${encodeURIComponent(item.id)}`}
                  className="home-expense-card flex flex-row gap-4 items-center justify-between px-4 py-3"
                >
                  <span className="flex flex-row items-center gap-4 min-w-0">
                    <span
                      className={`home-expense-category-icon w-8 h-8 rounded-full ${categoryColor} text-white grid place-items-center`}
                      aria-hidden="true"
                    >
                      <CategoryIcon width={18} height={18}/>
                    </span>
                    <span className="home-expense-description flex flex-col items-start">
                      <strong className="font-semibold text-md">{itemName}</strong>
                      <small className="text-xs">{formatAddedAt(item.created_at)}</small>
                    </span>
                  </span>
                  <span className="flex flex-row items-center gap-4">
                    <span className="flex flex-row items-center text-sm">
                      <SiRemove aria-hidden="true" />
                      <span className="font-semibold text-(--color-accent)">
                        {formatMoney(amount, currency)}
                      </span>
                    </span>
                    <SiChevronRightAlt aria-hidden="true" className="text-black/40"/>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
