import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, type Ledger } from "../lib/api";
import { ledgerPath } from "../lib/routes";
import { Button, Field, SelectField, Alert, Icon, LoadingState } from "../components/ui";

export function TrackersPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const refresh = async () => {
    try {
      const data = await api.ledgers();
      setLedgers(data.ledgers);
    } catch {
      setError("Tidak dapat memuat daftar pelacak.");
    }
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

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      await api.createTracker(name, currency);
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pelacak gagal dibuat.");
    } finally {
      setCreating(false);
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setJoining(true);
    try {
      await api.joinTracker(code);
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kode undangan tidak valid.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <section className="trackers-page">
      <p className="eyebrow">RUANG BERSAMA</p>
      <h1>Pelacak belanja.</h1>
      <p className="muted">Bagikan satu buku bersama tanpa kehilangan kendali atas data pribadi.</p>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mt-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <LoadingState label="Memuat daftar pelacak…" />
      ) : (
        <div className="tracker-list">
          {ledgers.filter((ledger) => ledger.type === "tracker").length === 0 ? (
            <p className="muted text-sm text-center py-2">
              Belum ada ruang pelacak bersama. Buat atau gabung di bawah ini.
            </p>
          ) : (
            ledgers
              .filter((ledger) => ledger.type === "tracker")
              .map((ledger) => (
                <Link className="tracker-card" to={ledgerPath(ledger.id)} key={ledger.id}>
                  <span className="tracker-symbol" aria-hidden="true">
                    <Icon name="tracker" size={20} />
                  </span>
                  <span>
                    <strong>{ledger.name}</strong>
                    <small>
                      {ledger.member_count} anggota · {ledger.currency}
                    </small>
                  </span>
                  <span className="arrow" aria-hidden="true">
                    <Icon name="arrow-right" size={16} />
                  </span>
                </Link>
              ))
          )}
        </div>
      )}

      <div className="tracker-forms">
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
      </div>
    </section>
  );
}
