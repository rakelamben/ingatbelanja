import { useCallback, useEffect, useState } from "react";
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
import { suggestReceiptCategoryId } from "../lib/receiptCategorySuggestion";
import {
  Button,
  Alert,
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
  ITEMS_NOT_DETECTED: {
    label: "Rincian Barang Belum Terdeteksi",
    desc: "Tambahkan atau periksa rincian barang sebelum menyimpan.",
  },
  LOW_OCR_CONF: {
    label: "Hasil OCR Kurang Jelas",
    desc: "Periksa kembali teks dan angka yang dikenali dari foto struk.",
  },
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

  const populateForm = useCallback(
    (data: ReceiptDetail, availableCategories: Category[], preserveEdits = false) => {
      const candidate = data.extraction_candidate;
      const candidateItems = (candidate?.items || []).map((item) => ({
        name: item.name,
        qty_milli: item.qty_milli || 1000,
        unit_price_minor: item.unit_price_minor ?? null,
        amount_minor: item.amount_minor,
        category_id: suggestReceiptCategoryId(item.name, availableCategories),
      }));

      if (preserveEdits) {
        setMerchantName((cur) => cur || data.merchant_name || candidate?.merchant || "");
        setPurchasedOn(
          (cur) => cur || data.purchased_on || candidate?.purchased_on || new Date().toISOString().slice(0, 10),
        );
        setCurrency((cur) => cur || data.currency || candidate?.currency || "IDR");
        setTotalMinor((cur) => cur ?? data.total_minor ?? candidate?.total_minor ?? null);
        setNote((cur) => cur || data.note || "");
        setFxRate((cur) => cur || data.fx_rate || "");
        setItems((cur) => (cur.length ? cur : data.items.length ? data.items : candidateItems));
        return;
      }

      setMerchantName(data.merchant_name || candidate?.merchant || "");
      setPurchasedOn(
        data.purchased_on || candidate?.purchased_on || new Date().toISOString().slice(0, 10),
      );
      setCurrency(data.currency || candidate?.currency || "IDR");
      setTotalMinor(data.total_minor ?? candidate?.total_minor ?? null);
      setNote(data.note || "");
      setFxRate(data.fx_rate || "");
      setItems(data.items.length ? data.items : candidateItems);
    },
    [],
  );

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
        populateForm(rcpt, catData.categories);
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
  }, [receiptId, ledgerId, populateForm]);

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
          populateForm(updated, categories, true);
        }
      } catch {
        // keep polling
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [receiptId, receipt?.status, categories, populateForm]);

  useEffect(() => {
    if (!selectedItemId || !receipt?.items.some((item) => item.id === selectedItemId)) return;
    document
      .getElementById(`receipt-item-${selectedItemId}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [receipt, selectedItemId]);

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
      populateForm(updated, categories);
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

  const isPhoto = receipt.source === "photo";
  const ledgerMinorUnit =
    currencies.find((item) => item.code === ledger?.currency)?.minor_unit ?? 0;

  return (
    <section className="receipt-review-page">
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
        <div className="">
          {receipt.issues.map((issue) => {
            const meta = ISSUE_LABELS[issue] || { label: issue, desc: "Periksa kembali data ini." };
            return (
              <div key={issue} className="flex flex-row items-center w-full justify-between px-3 bg-amber-200 py-2 rounded-md" title={meta.desc}>
                <p className="text-sm">{meta.desc}</p>
                <button
                  type="button"
                  className="close-btn"
                  aria-label={`Tutup catatan ${meta.label}`}
                  onClick={() =>
                    setReceipt((current) =>
                      current
                        ? {
                            ...current,
                            issues: current.issues.filter((currentIssue) => currentIssue !== issue),
                          }
                        : current,
                    )
                  }
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        {isPhoto && (
          <aside className="flex flex-col gap-2 ">

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

              <div className="flex flex-row gap-1 mb-5">
                <Button
                  variant="secondary"
                  className="w-full text-xs"
                  onClick={handleReprocess}
                  loading={reprocessing}
                >
                  <span>Scan Ulang</span>
                </Button>
                {ledger && (
                  <Link
                    to={ledgerPath(ledger.id, "scan")}
                    className="secondary-button w-full text-xs"
                  >
                    <span>Ambil Foto</span>
                  </Link>
                )}
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
