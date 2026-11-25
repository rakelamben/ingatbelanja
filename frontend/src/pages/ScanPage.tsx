import { Link, useLocation } from "react-router-dom";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath } from "../lib/routes";
import { EmptyState } from "../components/ui";
import { SiAiScan, SiBallot } from "@sargamicons/react/fill";

export function ScanPage() {
  const { ledger } = useLedger();
  const location = useLocation();

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
        Pilih buku aktif terlebih dahulu untuk menambahkan pengeluaran.
      </EmptyState>
    );
  }

  return (
    <section className="scan-page">
      <div className="flex flex-col divide-y divide-gray-100 rounded-lg overflow-hidden">
        <Link
          to={ledgerPath(ledger.id, "scan/capture")}
          state={location.state}
          className="flex flex-row items-start gap-4 bg-white px-5 py-5"
        >
          <SiAiScan className="text-4xl" aria-hidden="true" />
          <div className="flex flex-col">
            <p className="font-bold text-xl capitalize">Ambil foto struk</p>
            <p>Pakai kamera atau pilih foto struk dari galeri.</p>
          </div>
        </Link>
        <Link
          to={ledgerPath(ledger.id, "manual")}
          state={location.state}
          className="flex flex-row items-start gap-4 bg-white px-5 py-5"
        >
          <SiBallot className="text-4xl" aria-hidden="true" />
          <div className="flex flex-col">
            <p className="font-bold text-xl capitalize">Isi form manual</p>
            <p>Masukkan total dan rincian item secara langsung.</p>
          </div>
        </Link>
      </div>
    </section>
  );
}
