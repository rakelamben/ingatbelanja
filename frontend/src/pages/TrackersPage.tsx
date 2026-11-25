import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Ledger } from "../lib/api";
import { Alert, Icon, LoadingState } from "../components/ui";
import { SiSearch } from '@sargamicons/react/line';
import { SiAddCircle } from '@sargamicons/react/fill';




export function TrackersPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const money = (value: number | null, currency: string) => {
    if (value == null) return "—";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(value / (currency === "IDR" ? 1 : 100)).replace(/[\u00a0\u202f]/g, "");
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .ledgers()
      .then((data) => {
        if (!cancelled) setLedgers(data.ledgers);
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat memuat daftar pelacak.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="trackers-page">
      

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mt-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <LoadingState label="Memuat daftar buku…" />
      ) : (
        <div className="w-full">
          {ledgers.length === 0 ? (
            <p className="muted text-sm text-center py-2">
              Belum ada buku. Kamu bisa membuat atau bergabung dengan buku bersama di bawah ini.
            </p>
          ) : (
            <>
            <div className="flex flex-row items-center gap-2 bg-olive-200 px-4 py-3 mb-4 rounded-md">
              <div><SiSearch className="text-xl text-olive-600"/></div>
              <input type="text" placeholder="Cari Buku" className="bg-transparent text-lg w-full pl-1"/>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full">
            {ledgers.map((ledger) => (
                  <Link
                    className="flex flex-col bg-white px-4 py-4 rounded-lg"
                    to={`/app/books/${encodeURIComponent(ledger.id)}`}
                    key={ledger.id}
                  >
                    <div className="tracker-symbol mb-3" aria-hidden="true">
                      <Icon name="tracker" size={20} />
                    </div>
                    <div className="flex flex-col capitalize">
                      <p className="text-lg font-bold text-black/50">{ledger.name}</p>
                      <p className="text-md font-bold">
                        {/* {ledger.type === "tracker"
                          ? `${ledger.member_count} anggota · `
                          : "Buku pribadi · "} */}
                        {money(ledger.sum_spend, ledger?.currency ?? "IDR")}
                      </p>
                    </div>
                  </Link>
            ))}
            <Link
                  className="flex flex-col items-center justify-center gap-2 bg-(--color-accent)/20 px-4 py-4 rounded-lg"
                  to="/app/books/create"
                  >
                      <SiAddCircle className="text-4xl"/>
                      <p className="text-lg font-bold">Buat Buku</p>

                  </Link>
            </div>
            </>
          )}
        </div>
      )}

      {/* <div className="tracker-forms">
        <form className="compact-form" onSubmit={create}>
          <h2>Buat pelacak baru</h2>
          <Field
            id="tracker-create-name"
            label="Nama pelacak"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Rumah, Liburan, Kantor"
            help="Nama kelompok atau tujuan pelacakan."
          />
          <SelectField
            id="tracker-create-currency"
            label="Mata uang"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="IDR">IDR (Rupiah)</option>
            <option value="USD">USD (Dolar AS)</option>
            <option value="SGD">SGD (Dolar Singapura)</option>
          </SelectField>
          <Button type="submit" variant="primary" loading={creating}>
            Buat pelacak
          </Button>
        </form>

        <form className="compact-form" onSubmit={join}>
          <h2>Gabung dengan kode</h2>
          <Field
            id="tracker-join-code"
            label="Kode undangan"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={16}
            placeholder="Contoh: ABCD1234EFGH"
            help="Masukkan 16 digit kode dari pemilik buku."
          />
          <Button type="submit" variant="secondary" loading={joining}>
            Gabung ke pelacak
          </Button>
        </form>
      </div> */}
    </section>
  );
}
