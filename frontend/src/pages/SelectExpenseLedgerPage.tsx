import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, type Ledger } from "../lib/api";
import { ledgerPath } from "../lib/routes";
import { Alert, EmptyState, Icon, LoadingState } from "../components/ui";
import { SiLibraryBooks } from '@sargamicons/react/line';



export function SelectExpenseLedgerPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .ledgers()
      .then(({ ledgers: availableLedgers }) => {
        if (!cancelled) setLedgers(availableLedgers);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Daftar buku tidak dapat dimuat.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingState label="Memuat buku pengeluaran…" />;
  if (error) {
    return (
      <section className="select-expense-ledger-page">
        <Alert variant="error">{error}</Alert>
      </section>
    );
  }
  if (!ledgers.length) {
    return (
      <EmptyState
        title="Belum ada buku"
        icon="alert"
        action={
          <Link className="small-button" to="/app/books/create">
            Buat buku
          </Link>
        }
      >
        Buat atau ikuti buku pengeluaran sebelum mencatat transaksi.
      </EmptyState>
    );
  }

  return (
    <section className="">
      {/* <Link className="back-link" to="/home">
        <Icon name="arrow-left" size={16} />
        <span>Kembali ke Beranda</span>
      </Link> */}
      <p className="font-bold text-xl mb-2">Pilih Buku Pengeluaran</p>
      <div className="flex flex-col divide-y divide-olive-300">
        {ledgers.map((ledger) => (
          <Link
            key={ledger.id}
            className="px-5 py-5 bg-white flex flex-row gap-4"
            to={ledgerPath(ledger.id, "scan")}
          >
            <span className="tracker-symbol" aria-hidden="true">
              <SiLibraryBooks />
            </span>
            <span className="tracker-card-main">
              <strong>{ledger.name}</strong>
              <small>
                {ledger.type === "tracker" ? "Buku bersama" : "Buku pribadi"} · {ledger.currency}
              </small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
