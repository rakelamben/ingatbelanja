import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { formatMinorMoney } from "../lib/money";
import {
  Button,
  Alert,
  StatusBadge,
  EmptyState,
  LoadingState,
  Icon,
} from "../components/ui";

const ISSUE_LABELS: Record<string, { label: string; desc: string }> = {
  BLURRY: { label: "Foto Buram", desc: "Kamera kurang fokus saat pengambilan foto." },
  LOW_RESOLUTION: { label: "Resolusi Rendah", desc: "Ukuran gambar terlalu kecil." },
  CROPPED: { label: "Teks Terpotong", desc: "Sebagian pinggiran struk terpotong." },
  GLARE: { label: "Pantulan Cahaya", desc: "Kilauan cahaya menutupi angka atau tulisan." },
  LOW_CONTRAST: { label: "Kontras Rendah", desc: "Teks terlalu pudar untuk dibaca." },
  TOTAL_MISMATCH: {
    label: "Selisih Total & Rincian",
    desc: "Jumlah harga item tidak cocok dengan total struk.",
  },
  DATE_MISSING: { label: "Tanggal Belum Terdeteksi", desc: "Perlu konfirmasi tanggal manual." },
  MERCHANT_MISSING: { label: "Merchant Belum Terdeteksi", desc: "Perlu konfirmasi nama toko." },
  CURRENCY_AMBIGUOUS: {
    label: "Mata Uang Ambigu",
    desc: "Mata uang perlu ditentukan secara manual.",
  },
  FX_RATE_NEEDED: { label: "Perlu Kurs Konversi", desc: "Transaksi dalam mata uang asing." },
};

export function ReceiptReviewPage() {
  const { ledgerId, receiptId } = useParams<{ ledgerId: string; receiptId: string }>();
  const { ledger, permissions } = useLedger();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedItemId = searchParams.get("item");

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form Fields
  const [merchantName, setMerchantName] = useState("");
  const [purchasedOn, setPurchasedOn] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [totalMinor, setTotalMinor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([]);

  // Action states
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false);

  // Initial load
  useEffect(() => {
    if (!receiptId || !ledgerId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      api.receipt(receiptId),
      api.categories(ledgerId),
      api.currencies(),
    ])
      .then(([rcpt, catData, currencyData]) => {
        if (cancelled) return;
        setReceipt(rcpt);
        setCategories(catData.categories);
        setCurrencies(currencyData.currencies);
        populateForm(rcpt);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Tidak dapat memuat detail struk.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [receiptId, ledgerId]);

  // Polling if receipt is processing
  useEffect(() => {
    if (!receiptId || !receipt || receipt.status !== "processing") return;
    const interval = window.setInterval(async () => {
      try {
        const status = await api.receiptStatus(receiptId);
        if (status.status !== "processing") {
          clearInterval(interval);
          const updated = await api.receipt(receiptId);
          setReceipt(updated);
          populateForm(updated);
        }
      } catch {
        // keep polling
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [receiptId, receipt?.status]);

  useEffect(() => {
    if (!selectedItemId || !receipt?.items.some((item) => item.id === selectedItemId)) return;
    document
      .getElementById(`receipt-item-${selectedItemId}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [receipt, selectedItemId]);

  const populateForm = (data: ReceiptDetail) => {
    setMerchantName(data.merchant_name || "");
    setPurchasedOn(data.purchased_on || new Date().toISOString().slice(0, 10));
    setCurrency(data.currency || "IDR");
    setTotalMinor(data.total_minor);
    setNote(data.note || "");
    setFxRate(data.fx_rate || "");
    setItems(data.items.length ? data.items : []);
  };

  // Check dirty state
  const isDirty = (() => {
    if (!receipt) return false;
    if ((receipt.merchant_name || "") !== merchantName.trim()) return true;
    if ((receipt.purchased_on || "") !== purchasedOn) return true;
    if ((receipt.currency || "IDR") !== currency) return true;
    if (receipt.total_minor !== totalMinor) return true;
    if ((receipt.note || "") !== note.trim()) return true;
    if ((receipt.fx_rate || "") !== fxRate.trim()) return true;
    if (receipt.items.length !== items.length) return true;
    for (let i = 0; i < items.length; i++) {
      const orig = receipt.items[i];
      const cur = items[i];
      if (!orig) return true;
      if (orig.name !== cur.name) return true;
      if (orig.amount_minor !== cur.amount_minor) return true;
      if ((orig.unit_price_minor ?? null) !== (cur.unit_price_minor ?? null)) return true;
      if (orig.category_id !== cur.category_id) return true;
      if (orig.qty_milli !== cur.qty_milli) return true;
    }
    return false;
  })();

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

  // Add Item
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        name: "",
        qty_milli: 1000,
        amount_minor: 0,
        category_id: categories.length ? categories[0].id : null,
      },
    ]);
  };

  // Update Item
  const handleUpdateItem = (index: number, patch: Partial<ReceiptItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  // Remove Item
  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateCategory = async (name: string) => {
    if (!ledgerId) throw new Error("Buku tidak ditemukan.");
    const category = await api.createCategory(ledgerId, name);
    setCategories((prev) => [...prev, category]);
    return category;
  };

  // Save changes (Patch)
  const saveChanges = async (): Promise<ReceiptDetail | null> => {
    if (!receipt || !receiptId) return null;
    setSaving(true);
    setError("");
    setSuccessMsg("");

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
      setSuccessMsg("Perubahan berhasil disimpan.");
      return updated;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan perubahan struk.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Confirm Receipt
  const handleConfirm = async () => {
    if (!receipt || !receiptId || !ledgerId) return;
    if (
      !purchasedOn ||
      totalMinor == null ||
      totalMinor <= 0 ||
      !items.length ||
      items.some((item) => !item.name.trim()) ||
      (currency !== ledger?.currency && !fxRate.trim())
    ) {
      setError("Lengkapi tanggal, total, item, dan kurs valuta sebelum mengonfirmasi.");
      return;
    }
    setConfirming(true);
    setError("");

    try {
      // If dirty, save first
      if (isDirty) {
        const saved = await saveChanges();
        if (!saved) {
          setConfirming(false);
          return;
        }
      }

      await api.confirmReceipt(receiptId);
      navigate(ledgerPath(ledgerId, "history"), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Gagal mengonfirmasi struk. Pastikan total dan tanggal terisi.",
      );
    } finally {
      setConfirming(false);
    }
  };

  // Reprocess Receipt
  const handleReprocess = async () => {
    if (!receiptId) return;
    setReprocessing(true);
    setError("");

    try {
      await api.reprocessReceipt(receiptId);
      setReceipt((prev) => (prev ? { ...prev, status: "processing" } : null));
      setSuccessMsg("Struk dikirim ulang untuk diproses OCR.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tidak dapat memproses ulang foto.");
    } finally {
      setReprocessing(false);
    }
  };

  // Delete Receipt
  const handleDelete = async () => {
    if (!receiptId || !ledgerId) return;
    if (!window.confirm("Apakah kamu yakin ingin menghapus catatan pengeluaran ini?")) return;

    try {
      await api.deleteReceipt(receiptId);
      navigate(ledgerPath(ledgerId, "history"), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus struk.");
    }
  };

  if (loading) {
    return <LoadingState label="Memuat rincian dan foto struk…" />;
  }

  if (error && !receipt) {
    return (
      <EmptyState
        title="Catatan tidak ditemukan"
        icon="alert"
        action={
          <Link
            className="small-button"
            to={ledger ? ledgerPath(ledger.id, "history") : "/app"}
          >
            Kembali ke Riwayat
          </Link>
        }
      >
        {error}
      </EmptyState>
    );
  }

  if (!receipt) return null;

  const isConfirmed = receipt.status === "confirmed";
  const isPhoto = receipt.source === "photo";
  const ledgerMinorUnit =
    currencies.find((item) => item.code === ledger?.currency)?.minor_unit ?? 0;

  return (
    <section className="receipt-review-page">
      <Link
        className="back-link"
        to={ledger ? ledgerPath(ledger.id, "history") : "/app"}
        onClick={handleBack}
      >
        <Icon name="arrow-left" size={16} />
        <span>Kembali ke Riwayat</span>
      </Link>

      <div className="review-header">
        <div>
          <p className="eyebrow">
            {isConfirmed ? "RINCIAN PENGELUARAN" : "TINJAU & KOREKSI STRUK"}
          </p>
          <h1>{merchantName || "Struk Belanja"}</h1>
        </div>
        <div className="review-badge-group">
          <StatusBadge status={receipt.status} />
        </div>
      </div>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mb-4">
          {error}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" onDismiss={() => setSuccessMsg("")} className="mb-4">
          {successMsg}
        </Alert>
      )}

      {/* Quality Issues Section */}
      {receipt.issues && receipt.issues.length > 0 && (
        <div className="review-issues-card" role="region" aria-label="Catatan kualitas foto">
          <div className="review-issues-title">
            <Icon name="alert" size={18} />
            <strong>Catatan Kualitas & Verifikasi</strong>
          </div>
          <div className="issue-tags">
            {receipt.issues.map((issue) => {
              const meta = ISSUE_LABELS[issue] || { label: issue, desc: "Periksa kembali data ini." };
              return (
                <div key={issue} className="issue-tag" title={meta.desc}>
                  <span className="issue-name">{meta.label}</span>
                  <small className="issue-desc">{meta.desc}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="review-layout">
        {/* Left Column: Photo Preview */}
        {isPhoto && (
          <aside className="review-photo-column">
            <div className="review-photo-card">
              <div className="photo-header">
                <strong>Foto Struk Asli</strong>
                <button
                  type="button"
                  className="ghost-button photo-zoom-btn"
                  onClick={() => setIsPhotoZoomed(!isPhotoZoomed)}
                  aria-label={isPhotoZoomed ? "Kecilkan foto" : "Perbesar foto"}
                >
                  <Icon name="search" size={16} />
                  <span>{isPhotoZoomed ? "Kecilkan" : "Perbesar"}</span>
                </button>
              </div>

              <div
                className={`photo-container ${isPhotoZoomed ? "zoomed" : ""}`}
                onClick={() => setIsPhotoZoomed(!isPhotoZoomed)}
              >
                <img
                  src={api.receiptImageUrl(receipt.id, "processed")}
                  alt="Foto struk yang diunggah"
                  loading="lazy"
                  onError={(e) => {
                    // Try original if processed fails
                    const target = e.currentTarget;
                    if (!target.src.includes("original")) {
                      target.src = api.receiptImageUrl(receipt.id, "original");
                    }
                  }}
                />
              </div>

              <div className="photo-actions">
                <Button
                  variant="secondary"
                  className="w-full text-xs"
                  onClick={handleReprocess}
                  loading={reprocessing}
                >
                  <Icon name="history" size={16} />
                  <span>Proses Ulang OCR</span>
                </Button>
                {ledger && (
                  <Link
                    to={ledgerPath(ledger.id, "scan")}
                    className="secondary-button w-full text-xs"
                  >
                    <Icon name="upload" size={16} />
                    <span>Foto Ulang Struk</span>
                  </Link>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Right Column: Shared Expense Editor */}
        <form
          className="review-form-column"
          onSubmit={(event) => {
            event.preventDefault();
            void handleConfirm();
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
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            categories={categories}
            currencies={currencies}
            ledgerCurrency={ledger?.currency || "IDR"}
            ledgerMinorUnit={ledgerMinorUnit}
            canCreateCategory={permissions.canManage}
            onCreateCategory={handleCreateCategory}
            selectedItemId={selectedItemId}
            fxDate={receipt.fx_date}
            fxSource={receipt.fx_source}
          />

          {/* Action Bar */}
          <div className="review-actions-bar">
            <Button
              type="submit"
              variant="primary"
              loading={confirming}
              className="confirm-btn"
            >
              <Icon name="check" size={18} />
              <span>Konfirmasi & Simpan</span>
            </Button>

            {isDirty && (
              <Button
                variant="secondary"
                onClick={saveChanges}
                loading={saving}
              >
                Simpan Draft
              </Button>
            )}

            <Button
              variant="danger"
              onClick={handleDelete}
              className="ml-auto"
            >
              Hapus Transaksi
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
