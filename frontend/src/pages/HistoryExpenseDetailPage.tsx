import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  type Category,
  type Currency,
  type ReceiptDetail,
  type ReceiptItem,
} from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath } from "../lib/routes";
import { ExpenseEditor } from "../components/ExpenseEditor";
import { Alert, Button, EmptyState, Icon, LoadingState, StatusBadge } from "../components/ui";

export function HistoryExpenseDetailPage() {
  const { ledgerId, receiptId } = useParams<{ ledgerId: string; receiptId: string }>();
  const { ledger, permissions } = useLedger();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [merchantName, setMerchantName] = useState("");
  const [purchasedOn, setPurchasedOn] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [totalMinor, setTotalMinor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const populateForm = useCallback((data: ReceiptDetail) => {
    setMerchantName(data.merchant_name || "");
    setPurchasedOn(data.purchased_on || "");
    setCurrency(data.currency || "IDR");
    setTotalMinor(data.total_minor);
    setNote(data.note || "");
    setFxRate(data.fx_rate || "");
    setItems(data.items);
  }, []);

  useEffect(() => {
    if (!ledgerId || !receiptId) {
      setError("Detail pengeluaran tidak ditemukan.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([api.receipt(receiptId), api.categories(ledgerId), api.currencies()])
      .then(([detail, categoryData, currencyData]) => {
        if (cancelled) return;
        setReceipt(detail);
        setCategories(categoryData.categories);
        setCurrencies(currencyData.currencies);
        populateForm(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Tidak dapat memuat detail pengeluaran.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledgerId, populateForm, receiptId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const updateItem = (index: number, patch: Partial<ReceiptItem>) => {
    setItems((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const createCategory = async (name: string) => {
    if (!ledgerId) throw new Error("Buku tidak ditemukan.");
    const category = await api.createCategory(ledgerId, name);
    setCategories((current) => [...current, category]);
    return category;
  };

  const saveChanges = async () => {
    if (!receipt || !receiptId) return;
    setSaving(true);
    setError("");

    try {
      const updated = await api.patchReceipt(receiptId, {
        expected_updated_at: receipt.updated_at,
        merchant_name: merchantName.trim() || null,
        purchased_on: purchasedOn || null,
        currency,
        total_minor: totalMinor,
        note: note.trim() || null,
        fx_rate: fxRate.trim() || null,
        items: items.map((item) => ({
          id: item.id,
          name: item.name.trim() || "Item",
          qty_milli: item.qty_milli || 1000,
          unit_price_minor: item.unit_price_minor ?? null,
          amount_minor: Number(item.amount_minor) || 0,
          category_id: item.category_id || null,
        })),
      });

      setReceipt(updated);
      populateForm(updated);
      setEditing(false);
      setToastMessage("Pengeluaran berhasil diperbarui.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan perubahan pengeluaran.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    if (receipt) populateForm(receipt);
    setEditing(false);
    setError("");
    setToastMessage("");
  };

  if (loading) return <LoadingState label="Memuat detail pengeluaran…" />;

  const historyPath = ledger ? ledgerPath(ledger.id, "history") : "/app";
  if (!receipt) {
    return (
      <EmptyState
        title="Detail pengeluaran tidak tersedia"
        icon="alert"
        action={
          <Link className="small-button" to={historyPath}>
            Kembali ke Riwayat
          </Link>
        }
      >
        {error || "Catatan pengeluaran tidak dapat dimuat."}
      </EmptyState>
    );
  }

  const ledgerMinorUnit =
    currencies.find((item) => item.code === ledger?.currency)?.minor_unit ?? 0;

  return (
    <section className="receipt-review-page pb-6">

      <div className="flex flex-row mb-4 intems-center justify-between">
        <StatusBadge status={receipt.status} />
        {permissions.canWrite && !editing && (
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setToastMessage("");
              setEditing(true);
            }}
          >
            <Icon name="pencil" size={16} />
            <span>Edit</span>
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mb-4">
          {error}
        </Alert>
      )}

      <form
        className="review-form-column"
        onSubmit={(event) => {
          event.preventDefault();
          void saveChanges();
        }}
      >
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
          onAddItem={() =>
            setItems((current) => [
              ...current,
              {
                name: "",
                qty_milli: 1000,
                unit_price_minor: null,
                amount_minor: 0,
                category_id: categories[0]?.id ?? null,
              },
            ])
          }
          onUpdateItem={updateItem}
          onRemoveItem={(index) =>
            setItems((current) => current.filter((_, currentIndex) => currentIndex !== index))
          }
          categories={categories}
          currencies={currencies}
          ledgerCurrency={ledger?.currency || "IDR"}
          ledgerMinorUnit={ledgerMinorUnit}
          canCreateCategory={permissions.canManage}
          onCreateCategory={createCategory}
          fxDate={receipt.fx_date}
          fxSource={receipt.fx_source}
          readOnly={!editing}
        />

        {editing && (
          <div className="review-actions-bar">
            <Button type="submit" variant="primary" loading={saving}>
              <Icon name="check" size={18} />
              <span>Simpan</span>
            </Button>
            <Button variant="secondary" disabled={saving} onClick={cancelEditing}>
              Batal
            </Button>
          </div>
        )}
      </form>

      {toastMessage && (
        <div className="expense-detail-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </section>
  );
}
