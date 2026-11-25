import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  SiApple,
  SiBriefcaseMedical,
  SiBus,
  SiChevronRightAlt,
  SiCreditCard,
  SiGrid,
  SiRemove,
  SiWallet,
  SiAirplaneAlt,
} from "@sargamicons/react/fill";
import { ErrorState, LoadingState } from "./ui";
import { receiptReviewPath, receiptDetailPath } from "../lib/routes";
import type { RecentExpenseItem } from "../lib/api";

const categoryIcons: Record<string, [typeof SiGrid, string]> = {
  makanan: [SiApple, "bg-orange-500"],
  hiburan: [SiAirplaneAlt, "bg-blue-500"],
  transportasi: [SiBus, "bg-indigo-500"],
  belanja: [SiWallet, "bg-pink-500"],
  tagihan: [SiCreditCard, "bg-emerald-400"],
  kesehatan: [SiBriefcaseMedical, "bg-olive-500"],
};

const formatAddedAt = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const formatPurchaseDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));

function monthForItem(item: RecentExpenseItem) {
  const date = item.purchased_on || item.created_at.slice(0, 10);
  const match = /^(\d{4}-\d{2})/.exec(date);
  return match?.[1] ?? "unknown";
}

function purchaseDateForItem(item: RecentExpenseItem) {
  return item.purchased_on || item.created_at.slice(0, 10);
}

function monthLabel(month: string) {
  if (month === "unknown") return "Tanggal tidak diketahui";
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

type RecentExpensesProps = {
  ledgerId: string;
  items: RecentExpenseItem[];
  loading: boolean;
  formatAmount: (amount: number | null, currency: string) => string;
  error?: string;
  onRetry?: () => void;
  groupByMonth?: boolean;
  showAllLink?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export function RecentExpenses({
  ledgerId,
  items,
  loading,
  formatAmount,
  error = "",
  onRetry,
  groupByMonth = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: RecentExpensesProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (
      !groupByMonth ||
      !hasMore ||
      !onLoadMore ||
      loadingMore ||
      error ||
      !sentinel
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, groupByMonth, hasMore, loadingMore, onLoadMore]);

  const groups = groupByMonth
    ? items.reduce<Map<string, RecentExpenseItem[]>>((result, item) => {
        const month = monthForItem(item);
        const group = result.get(month) ?? [];
        group.push(item);
        result.set(month, group);
        return result;
      }, new Map())
    : null;

  const renderItem = (item: RecentExpenseItem) => {
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
        to={receiptDetailPath(ledgerId, item.receipt_id)}
        className="home-expense-card flex flex-row gap-4 items-center justify-between px-4 py-3"
      >
        <span className="flex flex-row items-center gap-4 min-w-0">
          <span
            className={`home-expense-category-icon w-8 h-8 rounded-full ${categoryColor} text-white grid place-items-center`}
            aria-hidden="true"
          >
            <CategoryIcon width={18} height={18} />
          </span>
          <span className="home-expense-description flex flex-col items-start">
            <strong className="font-semibold text-md">{itemName}</strong>
            <small className="text-xs">
              {groupByMonth && item.purchased_on
                ? formatPurchaseDate(item.purchased_on)
                : formatAddedAt(item.created_at)}
            </small>
          </span>
        </span>
        <span className="flex flex-row items-center gap-4">
          <span className="flex flex-row items-center text-sm">
            <SiRemove aria-hidden="true" />
            <span className="font-semibold text-(--color-accent)">
              {formatAmount(amount, currency)}
            </span>
          </span>
          <SiChevronRightAlt aria-hidden="true" className="text-black/40" />
        </span>
      </Link>
    );
  };

  return (
    <section className="w-full px-1 mt-2 mb-3">
      

      {error && items.length === 0 ? (
        <ErrorState title="Gagal memuat riwayat" message={error} onRetry={onRetry} />
      ) : loading ? (
        <LoadingState label="Memuat riwayat pengeluaran…" />
      ) : items.length === 0 ? (
        <p className="muted text-sm text-center py-4">Belum ada pengeluaran yang tercatat.</p>
      ) : (
        <div className="flex flex-col bg-white divide-y divide-gray-100 rounded-lg overflow-hidden">
          {groups
            ? [...groups.entries()]
                .sort(([left], [right]) => {
                  if (left === "unknown") return 1;
                  if (right === "unknown") return -1;
                  return right.localeCompare(left);
                })
                .map(([month, monthItems]) => (
                  <section key={month}>
                    <h3 className="bg-white px-4 py-4 text-sm font-bold capitalize">
                      {monthLabel(month)}
                    </h3>
                    {[...monthItems]
                      .sort((left, right) =>
                        purchaseDateForItem(right).localeCompare(purchaseDateForItem(left)),
                      )
                      .map(renderItem)}
                  </section>
                ))
            : items.map(renderItem)}
        </div>
      )}
      {error && items.length > 0 && (
        <ErrorState title="Gagal memuat riwayat" message={error} onRetry={onRetry} />
      )}
      {loadingMore && <LoadingState label="Memuat pengeluaran berikutnya…" />}
      {groupByMonth && hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-1" />}
    </section>
  );
}
