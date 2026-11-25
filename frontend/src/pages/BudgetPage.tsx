import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { Alert, Button, EmptyState, LoadingState } from "../components/ui";

const localDate = (daysToAdd = 2) => {
  const target = new Date();
  target.setDate(target.getDate() + daysToAdd);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

function formatMoney(amount: number, currency: string) {
  const minorUnit = currency === "IDR" ? 0 : 2;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: minorUnit,
  }).format(amount / 10 ** minorUnit);
}

function formatDateLabel(dateStr: string) {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function BudgetPage() {
  const { ledger, loading: ledgerLoading, permissions } = useLedger();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = searchParams.get("edit") === "1" || searchParams.get("edit") === "true";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [limit, setLimit] = useState("");
  const [usePeriod, setUsePeriod] = useState(false);
  const [limitPeriod, setLimitPeriod] = useState(() => localDate(2));
  const [previousPeriod, setPreviousPeriod] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const minEndDate = localDate(1);

  useEffect(() => {
    let cancelled = false;
    if (ledgerLoading) return;
    if (!ledger) {
      setLoading(false);
      return;
    }

    setLoading(true);
    api
      .budgetStatus(ledger.id)
      .then((data) => {
        if (cancelled) return;
        if (data.limit_minor != null) {
          setLimit(String(data.limit_minor));
          setPreviousPeriod(data.period);
          if (data.period === "CUSTOM" && data.end_date) {
            setUsePeriod(true);
            setLimitPeriod(data.end_date >= minEndDate ? data.end_date : minEndDate);
          } else {
            setUsePeriod(false);
          }
        }
      })
      .catch(() => {
        if (!cancelled && isEdit) {
          setError("Tidak dapat memuat data anggaran saat ini.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledger, ledgerLoading, isEdit, minEndDate]);

  if (ledgerLoading || loading) {
    return <LoadingState label="Memuat data anggaran…" />;
  }

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

  if (ledger.type !== "tracker") {
    return (
      <EmptyState
        title="Anggaran tidak tersedia"
        icon="alert"
        action={
          <Link className="small-button" to={`/app/books/${encodeURIComponent(ledger.id)}`}>
            Kembali ke detail buku
          </Link>
        }
      >
        Fitur anggaran hanya tersedia untuk buku bersama (tracker).
      </EmptyState>
    );
  }

  if (!permissions.isOwner) {
    return (
      <EmptyState
        title="Akses terbatas"
        icon="alert"
        action={
          <Link className="small-button" to={`/app/books/${encodeURIComponent(ledger.id)}`}>
            Kembali ke detail buku
          </Link>
        }
      >
        Hanya pemilik buku yang dapat mengatur anggaran.
      </EmptyState>
    );
  }

  const parsedLimit = Number(limit);
  const minLimit = ledger.sum_spend + 100_000;

  const handleNextFromLimit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!limit.trim() || !Number.isInteger(parsedLimit) || parsedLimit < minLimit) {
      setError(
        `Nominal limit minimal ${formatMoney(minLimit, ledger.currency)} (lebih dari 100.000 dari pengeluaran saat ini).`,
      );
      return;
    }
    setStep(2);
  };

  const handleNextFromPeriod = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (usePeriod && (!limitPeriod || limitPeriod < minEndDate)) {
      setError("Pilih tanggal berakhir minimal besok.");
      return;
    }
    setStep(3);
  };

  const handleConfirm = async () => {
    setError("");
    setBusy(true);
    const targetPeriod = usePeriod ? "CUSTOM" : "ALL";
    const dates = usePeriod
      ? { start_date: localDate(0), end_date: limitPeriod }
      : undefined;

    try {
      await api.putBudget(ledger.id, targetPeriod, parsedLimit, dates);
      if (
        previousPeriod &&
        previousPeriod !== targetPeriod &&
        (previousPeriod === "CUSTOM" || previousPeriod === "ALL")
      ) {
        await api.deleteBudget(ledger.id, previousPeriod).catch(() => {});
      }
      navigate(`/app/books/${encodeURIComponent(ledger.id)}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Anggaran gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="budget-page">

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mt-3 mb-4">
          {error}
        </Alert>
      )}

      {step === 1 && (
        <form onSubmit={handleNextFromLimit} noValidate>
          <p className="text-xl">
            Berapa limit pengeluaran anda di Buku{" "}
            <strong className="capitalize">{ledger.name}</strong> ?
          </p>

          <div className="mt-4">
            <label htmlFor="budget-limit" className="sr-only">
              Nominal limit pengeluaran
            </label>
            <input
              id="budget-limit"
              type="number"
              required
              min={minLimit}
              step="1"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder={`Minimal ${minLimit}`}
              className="bg-transparent border-2 border-(--color-accent) px-4 py-3 rounded-md w-full"
            />
            <p className="text-sm mt-2 opacity-75">
              Pengeluaran buku saat ini <strong>{formatMoney(ledger.sum_spend, ledger.currency)}</strong>
              {" · "}Minimal limit <strong>{formatMoney(minLimit, ledger.currency)}</strong>
            </p>
            <Button type="submit" variant="primary" className="mt-8 w-full">
              Lanjut
            </Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleNextFromPeriod}>
          <p className="text-xl font-bold">Kapan limit pengeluaran berakhir?</p>
          <p className="text-md mt-1">Tenang saja, tanggal ini bisa diubah kapan pun.</p>

          <div className="flex flex-col px-5 py-5 bg-olive-200 rounded-md mt-4">
            <label className="flex flex-row items-center justify-between cursor-pointer">
              <span>Atur waktu limit berakhir</span>
              <input
                type="checkbox"
                checked={usePeriod}
                onChange={(e) => setUsePeriod(e.target.checked)}
              />
            </label>

            {usePeriod && (
              <div className="mt-3">
                <label htmlFor="budget-end-date" className="block text-sm mb-1 opacity-80">
                  Berlaku mulai hari ini hingga tanggal:
                </label>
                <input
                  id="budget-end-date"
                  type="date"
                  min={minEndDate}
                  required
                  value={limitPeriod}
                  onChange={(event) => setLimitPeriod(event.target.value)}
                  className="py-3 px-4 bg-olive-300 rounded-md w-full"
                />
              </div>
            )}
          </div>

          <div className="flex flex-row gap-3 mt-8">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setError("");
                setStep(1);
              }}
            >
              Kembali
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Lanjut
            </Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div>
          <p className="text-xl font-bold">Konfirmasi Anggaran</p>
          <p className="text-md mt-1 opacity-80">
            Periksa kembali nominal limit dan periode sebelum menyimpan.
          </p>

          <div className="bg-white rounded-lg p-5 mt-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-sm opacity-75">Buku</span>
              <strong className="capitalize">{ledger.name}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm opacity-75">Nominal Limit</span>
              <strong>{formatMoney(parsedLimit, ledger.currency)}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm opacity-75">Periode</span>
              <strong>
                {usePeriod
                  ? `Hingga ${formatDateLabel(limitPeriod)}`
                  : "Tanpa batas waktu"}
              </strong>
            </div>
          </div>

          <div className="flex flex-row gap-3 mt-8">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                setError("");
                setStep(2);
              }}
            >
              Kembali
            </Button>
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={busy}
              disabled={busy}
              onClick={handleConfirm}
            >
              {isEdit || previousPeriod ? "Perbarui Target" : "Buat Target"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
