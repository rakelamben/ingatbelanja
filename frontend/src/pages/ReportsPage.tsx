import { useEffect, useMemo, useRef, useState } from "react";
import type ApexCharts from "apexcharts";
import { Link } from "react-router-dom";
import { SiFilterList } from "@sargamicons/react/fill";
import { useLedger } from "../context/LedgerContext";
import { useLedgerSelection } from "../context/LedgerSelectionContext";
import { api, type RecentExpenseItem, type Summary } from "../lib/api";
import { ErrorState, EmptyState, LoadingState } from "../components/ui";
import { LedgerSwitcher } from "../components/LedgerSwitcher";
import { RecentExpenses } from "../components/RecentExpenses";

type CategorySlice = {
  name: string;
  amount_minor: number;
  share_bp: number;
};

const categoryColors = ["#4c721d", "#18352a", "#b98b3c", "#8b9b84"];

const money = (value: number | null, currency: string) => {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(value / (currency === "IDR" ? 1 : 100)).replace(/[\u00a0\u202f]/g, "");
};

const getCurrentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const formatPeriod = (period: string) =>
  new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${period}-01T00:00:00`));

function ApexChart({
  options,
  className,
  label,
  chartType,
}: {
  options: ApexCharts.ApexOptions;
  className: string;
  label: string;
  chartType: "donut" | "line";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartError, setChartError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let chart: ApexCharts | null = null;
    setChartError(false);

    const chartModule =
      chartType === "donut" ? import("apexcharts/donut") : import("apexcharts/line");

    chartModule
      .then(({ default: ApexChartsLibrary }) => {
        if (cancelled || !containerRef.current) return;
        chart = new ApexChartsLibrary(containerRef.current, options);
        return chart.render();
      })
      .catch(() => {
        if (!cancelled) setChartError(true);
      });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [chartType, options]);

  if (chartError) {
    return <p className="reports-empty-chart" role="alert">Grafik tidak dapat dimuat.</p>;
  }

  return <div ref={containerRef} className={className} role="img" aria-label={label} />;
}

export function ReportsPage() {
  const { ledger, loading: ledgerLoading, error: ledgerError } = useLedger();
  const { setAnalyticLedgerId } = useLedgerSelection();
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [recentItems, setRecentItems] = useState<RecentExpenseItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState("");
  const [recentReloadTrigger, setRecentReloadTrigger] = useState(0);
  const monthInputRef = useRef<HTMLInputElement>(null);

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
        if (!cancelled) setError("Tidak dapat memuat ringkasan laporan bulanan.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledger, period, reloadTrigger]);

  useEffect(() => {
    if (!ledger) return;
    let cancelled = false;
    setRecentLoading(true);
    setRecentError("");

    api
      .recentExpenseItems(ledger.id)
      .then((data) => {
        if (!cancelled) setRecentItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setRecentError("Tidak dapat memuat riwayat pengeluaran.");
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledger, recentReloadTrigger]);

  const categories = useMemo<CategorySlice[]>(() => {
    if (!summary) return [];

    const sorted = [...summary.by_category]
      .filter((category) => category.amount_minor > 0)
      .sort((a, b) => b.amount_minor - a.amount_minor);

    if (sorted.length <= 3) return sorted;

    const remaining = sorted.slice(3);
    return [
      ...sorted.slice(0, 3),
      {
        name: "Lainnya",
        amount_minor: remaining.reduce((total, category) => total + category.amount_minor, 0),
        share_bp: remaining.reduce((total, category) => total + category.share_bp, 0),
      },
    ];
  }, [summary]);

  const donutOptions = useMemo<ApexCharts.ApexOptions>(
    () => ({
      chart: {
        type: "donut",
        height: 280,
        toolbar: { show: false },
        fontFamily: "inherit",
        animations: { enabled: true, speed: 250 },
      },
      series: categories.map((category) => category.amount_minor),
      labels: categories.map((category) => category.name),
      colors: categoryColors,
      dataLabels: { enabled: false },
      legend: { show: false },
      stroke: { width: 4, colors: ["#edf4e8"] },
      plotOptions: {
        pie: {
          expandOnClick: false,
          borderRadius: 8,
          donut: {
            size: "72%",
            labels: {
              show: false,
            },
          },
        },
      },
      tooltip: {
        y: {
          formatter: (value) =>
            value == null ? "—" : money(value, summary?.currency ?? "IDR"),
        },
      },
    }),
    [categories, summary],
  );

  const trendOptions = useMemo<ApexCharts.ApexOptions>(
    () => ({
      chart: {
        type: "line",
        height: 150,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: "inherit",
        animations: { enabled: true, speed: 250 },
      },
      series: [
        {
          name: "Pengeluaran",
          data:
            summary?.by_day.map((item) => ({
              x: new Date(`${item.date}T00:00:00`).getTime(),
              y: item.amount_minor,
            })) ?? [],
        },
      ],
      colors: [categoryColors[0]],
      stroke: { curve: "straight", width: 2 },
      markers: { size: 0, hover: { size: 5 } },
      dataLabels: { enabled: false },
      grid: { show: false, padding: { left: 8, right: 8 } },
      legend: { show: false },
      xaxis: {
        type: "datetime",
        tickAmount: 2,
        labels: { datetimeUTC: false, format: "dd" },
        axisBorder: { show: true },
        axisTicks: { show: true },
      },
      yaxis: { show: false },
      tooltip: {
        x: { format: "dd" },
        y: {
          formatter: (value) =>
            value == null ? "—" : money(value, summary?.currency ?? "IDR"),
        },
      },
    }),
    [summary],
  );

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
        {ledgerError || "Pilih buku untuk melihat laporan."}
      </EmptyState>
    );
  }

  const openMonthPicker = () => {
    const input = monthInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  };

  const hasCategoryData = categories.length > 0;
  const trendData = summary?.by_day.filter((item) => item.amount_minor > 0) ?? [];
  const averagePerTransaction =
    summary && summary.count > 0
      ? money(summary.total_minor / summary.count, summary.currency)
      : "—";
  const monthlyChange = summary?.compare.pct_bp;
  const monthlyChangeLabel =
    monthlyChange == null
      ? "—"
      : `${monthlyChange > 0 ? "+" : ""}${(monthlyChange / 100).toFixed(1)}%`;
  const monthlyChangeDirection =
    monthlyChange == null
      ? "Belum ada data bulan lalu"
      : `${monthlyChange > 0 ? "Naik" : monthlyChange < 0 ? "Turun" : "Tidak berubah"} ${money(
          Math.abs(summary?.compare.diff_minor ?? 0),
          summary?.currency ?? ledger.currency,
        )} dari bulan lalu`;

  return (
    <section className="reports-page">
      <div>
        <LedgerSwitcher
          activeId={ledger.id}
          variant="analytics"
          onChange={setAnalyticLedgerId}
          className="reports-ledger-selector bg-olive-300 rounded-t-lg"
        />

        <div className="reports-period-row px-5 bg-olive-200 py-2 rounded-b-lg">
          <p className="reports-period-label text-md font-bold">{formatPeriod(period)}</p>
          <button
            className="date-picker"
            type="button"
            aria-label="Buka filter tanggal"
            title="Pilih bulan laporan"
            onClick={openMonthPicker}
          >
            <SiFilterList aria-hidden="true" />
          </button>
          <input
            ref={monthInputRef}
            className="sr-only"
            type="month"
            value={period}
            onChange={(event) => event.target.value && setPeriod(event.target.value)}
            aria-label="Pilih bulan laporan"
            tabIndex={-1}
          />
        </div>
      </div>
      <section className="reports-spending-card bg-slate-200 text-xl font-bold space-y-2">
        <h2 className="">Pengeluaranmu</h2>
        {error ? (
          <ErrorState
            title="Gagal memuat laporan"
            message={error}
            onRetry={() => setReloadTrigger((previous) => previous + 1)}
          />
        ) : loading || !summary ? (
          <LoadingState label="Memuat ringkasan laporan bulanan…" />
        ) : hasCategoryData ? (
          <div className="mx-auto">
            <div className="reports-donut-wrap">
              <ApexChart
                options={donutOptions}
                className="reports-donut-chart"
                label={`Diagram donat pengeluaran berdasarkan kategori. Total ${money(
                  summary.total_minor,
                  summary.currency,
                )}`}
                chartType="donut"
              />
              <div className="reports-donut-center" aria-hidden="true">
                <span>Total</span>
                <strong>{money(summary.total_minor, summary.currency)}</strong>
              </div>
            </div>
            <ul className="reports-category-legend mt-4" aria-label="Kategori pengeluaran">
              {categories.map((category, index) => (
                <li key={category.name}>
                  <span
                    className="reports-category-dot"
                    style={{ backgroundColor: categoryColors[index] }}
                    aria-hidden="true"
                  />
                  <span className="reports-category-name">{category.name}</span>
                  <span className="reports-category-percent">
                    {Math.round(category.share_bp / 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="reports-empty-chart">
            Belum ada kategori pengeluaran pada periode ini.
          </p>
        )}
      </section>

      {!error && !loading && summary && (
        <>
          <section className="reports-transaction-summary" aria-label="Ringkasan transaksi">
            <article className="reports-metric-card">
              <small className="text-sm">Jumlah transaksi</small>
              <strong className="text-xl">{summary.count}</strong>
              <span className="text-sm">transaksi bulan ini</span>
            </article>
            <article className="reports-metric-card">
              <small className="text-sm">Rata-rata per transaksi</small>
              <strong className="text-xl">{averagePerTransaction}</strong>
              <span className="text-sm">per transaksi</span>
            </article>
            <article className="reports-metric-card">
              <small className="text-sm">Dibanding bulan lalu</small>
              <strong className="text-xl">{monthlyChangeLabel}</strong>
              <span className="text-sm"> {monthlyChangeDirection}</span>
            </article>
          </section>

          <section className="reports-trend-section">
            <h2 className="text-xl font-bold">Tren pengeluaran</h2>
            {trendData.length > 0 ? (
              <ApexChart
                options={trendOptions}
                className="reports-trend-chart h-fit"
                label="Grafik tren pengeluaran harian"
                chartType="line"
              />
            ) : (
              <p className="reports-empty-chart">
                Belum ada tren pengeluaran pada periode ini.
              </p>
            )}
          </section>
        </>
      )}

      <RecentExpenses
        ledgerId={ledger.id}
        items={recentItems}
        loading={recentLoading}
        formatAmount={money}
        error={recentError}
        onRetry={() => setRecentReloadTrigger((previous) => previous + 1)}
      />
    </section>
  );
}
