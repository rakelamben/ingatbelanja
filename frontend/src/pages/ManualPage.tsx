import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  type Category,
  type Currency,
  type ReceiptItem,
} from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath } from "../lib/routes";
import { ExpenseEditor } from "../components/ExpenseEditor";
import { Alert, Button, EmptyState, Icon, LoadingState } from "../components/ui";

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const newItem = (): ReceiptItem => ({
  name: "",
  qty_milli: 1000,
  unit_price_minor: null,
  amount_minor: 0,
  category_id: null,
});

export function ManualPage() {
  const { ledger, permissions } = useLedger();
  const navigate = useNavigate();
  const [merchantName, setMerchantName] = useState("");
  const [purchasedOn, setPurchasedOn] = useState(localDate);
  const [currency, setCurrency] = useState(ledger?.currency ?? "IDR");
  const [totalMinor, setTotalMinor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([newItem()]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ledger) return;
    let cancelled = false;
    setCurrency(ledger.currency);
    setLoading(true);
    Promise.all([api.categories(ledger.id), api.currencies()])
      .then(([categoryData, currencyData]) => {
        if (cancelled) return;
        setCategories(categoryData.categories);
        setCurrencies(currencyData.currencies);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Data form tidak dapat dimuat.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ledger]);

  const updateItem = (index: number, patch: Partial<ReceiptItem>) => {
    setItems((previous) =>
      previous.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const createCategory = async (name: string) => {
    if (!ledger) throw new Error("Buku tidak ditemukan.");
    const category = await api.createCategory(ledger.id, name);
    setCategories((previous) => [...previous, category]);
    return category;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ledger) return;
    setError("");

    if (totalMinor == null || totalMinor <= 0) {
      setError("Total pengeluaran harus lebih dari nol.");
      return;
    }
    if (!items.length || items.some((item) => !item.name.trim())) {
      setError("Isi nama untuk setiap item atau hapus item yang kosong.");
      return;
    }
    if (items.some((item) => !Number.isSafeInteger(item.amount_minor) || item.amount_minor < 0)) {
      setError("Subtotal item tidak valid untuk mata uang yang dipilih.");
      return;
    }

    setBusy(true);
    try {
      await api.manualReceipt(ledger.id, {
        purchased_on: purchasedOn,
        currency,
        amount_minor: totalMinor,
        merchant_name: merchantName.trim() || undefined,
        note: note.trim() || undefined,
        fx_rate: fxRate.trim() || undefined,
        items: items.map((item) => ({
          name: item.name.trim(),
          qty_milli: item.qty_milli,
          unit_price_minor: item.unit_price_minor ?? null,
          amount_minor: item.amount_minor,
          category_id: item.category_id ?? null,
        })),
      });
      navigate(ledgerPath(ledger.id, "history"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Catatan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const isDirty =
    merchantName.trim() !== "" ||
    totalMinor !== null ||
    note.trim() !== "" ||
    items.some((i) => i.name.trim() !== "" || (i.amount_minor != null && i.amount_minor > 0));

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isDirty && typeof window !== "undefined" && !window.confirm("Perubahan belum disimpan. Yakin ingin kembali?")) {
      e.preventDefault();
    }
  };

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
        Pilih buku aktif terlebih dahulu untuk mencatat pengeluaran.
      </EmptyState>
    );
  }

  if (loading) return <LoadingState label="Memuat form pengeluaran…" />;

  const ledgerMinorUnit =
    currencies.find((item) => item.code === ledger.currency)?.minor_unit ?? 0;

  return (
    <section className="manual-page">
      <Link
        className="back-link"
        to={ledgerPath(ledger.id, "scan")}
        onClick={handleBack}
      >
        <Icon name="arrow-left" size={16} />
        <span>Kembali ke pilihan input</span>
      </Link>
      <p className="eyebrow">CATAT PENGELUARAN</p>
      <h1>Isi rincian belanja.</h1>
      <p className="muted">
        Form ini juga digunakan untuk memeriksa hasil scan struk. Pengeluaran disimpan ke buku{" "}
        <strong>{ledger.name}</strong>.
      </p>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mt-4">
          {error}
        </Alert>
      )}

      <form className="expense-entry-form" onSubmit={submit}>
        <ExpenseEditor
          merchantName={merchantName}
          onMerchantNameChange={setMerchantName}
          purchasedOn={purchasedOn}
          onPurchasedOnChange={setPurchasedOn}
          currency={currency}
          onCurrencyChange={setCurrency}
          totalMinor={totalMinor}
          onTotalMinorChange={setTotalMinor}
          note={note}
          onNoteChange={setNote}
          fxRate={fxRate}
          onFxRateChange={setFxRate}
          items={items}
          onAddItem={() => setItems((previous) => [...previous, newItem()])}
          onUpdateItem={updateItem}
          onRemoveItem={(index) =>
            setItems((previous) => previous.filter((_, currentIndex) => currentIndex !== index))
          }
          categories={categories}
          currencies={currencies}
          ledgerCurrency={ledger.currency}
          ledgerMinorUnit={ledgerMinorUnit}
          canCreateCategory={permissions.canManage}
          onCreateCategory={createCategory}
          fxRateRequired={false}
        />
        <Button type="submit" variant="primary" loading={busy} disabled={busy}>
          Simpan pengeluaran
        </Button>
      </form>
    </section>
  );
}
