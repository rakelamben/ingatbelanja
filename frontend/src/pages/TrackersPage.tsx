import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api, type Ledger } from "../lib/api";
import { Alert, Button, Icon, LoadingState } from "../components/ui";
import { SiSearch } from '@sargamicons/react/line';
import { SiAddCircle, SiLink } from '@sargamicons/react/fill';

export function TrackersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [joinOpen, setJoinOpen] = useState(() => Boolean(searchParams.get("join")));
  const [joinCode, setJoinCode] = useState(() => (searchParams.get("join") ?? "").toUpperCase());
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState("");

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

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) {
      setJoinError("Masukkan kode undangan terlebih dahulu.");
      return;
    }
    setJoinBusy(true);
    setJoinError("");
    try {
      const res = await api.joinTracker(cleaned);
      setJoinOpen(false);
      setJoinCode("");
      if (searchParams.has("join")) {
        setSearchParams({}, { replace: true });
      }
      navigate(`/app/books/${encodeURIComponent(res.ledger_id)}`);
    } catch (cause) {
      setJoinError(
        cause instanceof ApiError
          ? cause.message
          : "Kode undangan tidak valid atau gagal bergabung.",
      );
    } finally {
      setJoinBusy(false);
    }
  };

  const filteredLedgers = search.trim()
    ? ledgers.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
    : ledgers;

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
            <div className="flex flex-row items-center gap-2 bg-olive-200 px-4 py-3 mb-4 rounded-md">
              <div><SiSearch className="text-xl text-olive-600" /></div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari Buku"
                aria-label="Cari buku"
                className="bg-transparent text-lg w-full pl-1 outline-0"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 w-full">
            {filteredLedgers.map((ledger) => (
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
                    {money(ledger.sum_spend, ledger?.currency ?? "IDR")}
                  </p>
                </div>
              </Link>
            ))}
            <Link
              className="flex flex-col items-center justify-center gap-2 bg-(--color-accent)/20 px-4 py-4 rounded-lg"
              to="/app/books/create"
            >
              <SiAddCircle className="text-4xl" />
              <p className="text-lg font-bold">Buat Buku</p>
            </Link>
            <button
              type="button"
              onClick={() => {
                setJoinError("");
                setJoinOpen(true);
              }}
              className="flex flex-col items-center justify-center gap-2 bg-olive-200 px-4 py-4 rounded-lg"
            >
              <SiLink className="text-4xl" />
              <p className="text-lg font-bold">Gabung Buku</p>
            </button>
          </div>
        </div>
      )}

      {joinOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gabung buku bersama"
        >
          <form onSubmit={handleJoin} className="bg-white rounded-lg w-full max-w-md p-5 shadow-lg">
            <h2 className="text-lg font-bold">Gabung Buku Bersama</h2>
            <p className="text-sm opacity-75 mt-1">
              Masukkan kode undangan yang diberikan oleh pemilik buku tracker.
            </p>

            {joinError && (
              <Alert variant="error" onDismiss={() => setJoinError("")} className="mt-3">
                {joinError}
              </Alert>
            )}

            <div className="mt-4">
              <label htmlFor="join-code" className="block text-sm font-medium mb-1">
                Kode Undangan
              </label>
              <input
                id="join-code"
                type="text"
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Contoh: ABCD1234EF"
                className="bg-transparent border-2 border-(--color-accent) px-4 py-3 rounded-md w-full tracking-wider uppercase"
              />
            </div>

            <div className="flex flex-row gap-2 mt-5">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={joinBusy}
                onClick={() => {
                  setJoinOpen(false);
                  if (searchParams.has("join")) {
                    setSearchParams({}, { replace: true });
                  }
                }}
              >
                Tutup
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-1"
                loading={joinBusy}
                disabled={joinBusy}
              >
                Gabung
              </Button>
            </div>
          </form>
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
