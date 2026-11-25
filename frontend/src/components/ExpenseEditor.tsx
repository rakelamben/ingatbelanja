import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  type Category,
  type Currency,
  type ReceiptItem,
} from "../lib/api";
import { formatMinorMoney, majorInputToMinor, minorToMajorInput } from "../lib/money";
import { Alert, Button, Field, Icon, SelectField } from "./ui";

type ExpenseEditorProps = {
  merchantName: string;
  onMerchantNameChange: (value: string) => void;
  purchasedOn: string;
  onPurchasedOnChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  totalMinor: number | null;
  onTotalMinorChange: (value: number | null) => void;
  note: string;
  onNoteChange: (value: string) => void;
  fxRate: string;
  onFxRateChange: (value: string) => void;
  items: ReceiptItem[];
  onAddItem: () => void;
  onUpdateItem: (index: number, patch: Partial<ReceiptItem>) => void;
  onRemoveItem: (index: number) => void;
  categories: Category[];
  currencies: Currency[];
  ledgerCurrency: string;
  ledgerMinorUnit: number;
  canCreateCategory: boolean;
  onCreateCategory: (name: string) => Promise<Category>;
  fxRateRequired?: boolean;
  selectedItemId?: string | null;
  fxDate?: string | null;
  fxSource?: string | null;
  readOnly?: boolean;
};

function MinorAmountField({
  id,
  label,
  value,
  minorUnit,
  onChange,
  disabled = false,
  required = false,
}: {
  id: string;
  label: string;
  value: number | null;
  minorUnit: number;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [input, setInput] = useState(minorToMajorInput(value, minorUnit));
  const lastValue = useRef(value);
  const lastUnit = useRef(minorUnit);
  const pattern =
    minorUnit > 0 ? `\\d+(\\.\\d{1,${minorUnit}})?` : "\\d+";

  useEffect(() => {
    if (value !== lastValue.current || minorUnit !== lastUnit.current) {
      setInput(minorToMajorInput(value, minorUnit));
      lastValue.current = value;
      lastUnit.current = minorUnit;
    }
  }, [value, minorUnit]);

  return (
    <Field
      id={id}
      label={label}
      type="text"
      inputMode="decimal"
      pattern={pattern}
      required={required}
      disabled={disabled}
      value={input}
      onChange={(event) => {
        const nextValue = event.target.value;
        setInput(nextValue);
        const parsed = majorInputToMinor(nextValue, minorUnit);
        if (!nextValue.trim()) {
          lastValue.current = null;
          onChange(null);
        } else if (parsed !== null) {
          lastValue.current = parsed;
          onChange(parsed);
        }
      }}
    />
  );
}

export function ExpenseEditor({
  merchantName,
  onMerchantNameChange,
  purchasedOn,
  onPurchasedOnChange,
  currency,
  onCurrencyChange,
  totalMinor,
  onTotalMinorChange,
  note,
  onNoteChange,
  fxRate,
  onFxRateChange,
  items,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  categories,
  currencies,
  ledgerCurrency,
  ledgerMinorUnit,
  canCreateCategory,
  onCreateCategory,
  fxRateRequired = true,
  selectedItemId = null,
  fxDate = null,
  fxSource = null,
  readOnly = false,
}: ExpenseEditorProps) {
  const currencyInfo = currencies.find((item) => item.code === currency);
  const currencyMinorUnit = currencyInfo?.minor_unit ?? 0;
  const sumItems = items.reduce((sum, item) => sum + (Number(item.amount_minor) || 0), 0);
  const hasDiscrepancy = items.length > 0 && totalMinor != null && totalMinor !== sumItems;
  const foreignCurrency = currency !== ledgerCurrency;
  const [creatingCategoryFor, setCreatingCategoryFor] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const createCategory = async (index: number) => {
    setCategoryError("");
    setCreatingCategory(true);
    try {
      const category = await onCreateCategory(categoryName.trim());
      onUpdateItem(index, { category_id: category.id });
      setCategoryName("");
      setCreatingCategoryFor(null);
    } catch (error) {
      setCategoryError(
        error instanceof ApiError ? error.message : "Kategori baru tidak dapat disimpan.",
      );
    } finally {
      setCreatingCategory(false);
    }
  };

  return (
    <>
      <div className="review-section-card">
        <div className="review-grid-2">
          <Field
            id="expense-merchant"
            label="Nama Toko / Merchant"
            value={merchantName}
            disabled={readOnly}
            onChange={(event) => onMerchantNameChange(event.target.value)}
            placeholder="Contoh: Superindo, Indomaret"
          />
          <Field
            id="expense-date"
            label="Tanggal Transaksi"
            type="date"
            required
            value={purchasedOn}
            disabled={readOnly}
            onChange={(event) => onPurchasedOnChange(event.target.value)}
          />
        </div>
        <div className="review-grid-2">
          <SelectField
            id="expense-currency"
            label="Mata Uang"
            required
            value={currency}
            disabled={readOnly}
            onChange={(event) => onCurrencyChange(event.target.value)}
          >
            {currencies.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} ({item.name})
              </option>
            ))}
          </SelectField>
          <MinorAmountField
            id="expense-total"
            label={`Total Transaksi (${currency})`}
            value={totalMinor}
            minorUnit={currencyMinorUnit}
            onChange={onTotalMinorChange}
            disabled={readOnly}
            required
          />
        </div>
        <label className="ui-field-group" htmlFor="expense-note">
          <span className="ui-field-label">Catatan Tambahan</span>
          <textarea
            id="expense-note"
            className="ui-input"
            maxLength={1000}
            rows={3}
            value={note}
            disabled={readOnly}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Catatan belanja, keperluan kerja, dsb."
          />
        </label>
      </div>

      {foreignCurrency && (
        <div className="review-section-card fx-card" role="region" aria-label="Panel Konversi Valuta">
          <div className="fx-header">
            <Icon name="chart" size={18} />
            <strong>Konversi Valuta Asing ({currency} → {ledgerCurrency})</strong>
          </div>
          <p className="muted text-xs">
            Masukkan kurs 1 {currency} dalam {ledgerCurrency}. Kurs ini digunakan untuk total dan
            setiap item.
          </p>
          <div className="review-grid-2 mt-2">
            <Field
              id="expense-fx-rate"
              label={`Kurs 1 ${currency} dalam ${ledgerCurrency}`}
              value={fxRate}
              disabled={readOnly}
              onChange={(event) => onFxRateChange(event.target.value)}
              placeholder="Contoh: 15500"
              required={fxRateRequired}
              help={fxDate ? `Sumber kurs: ${fxSource || "Sistem"} (${fxDate})` : undefined}
            />
            <div className="fx-converted-box">
              <small>Estimasi Total Buku</small>
              <strong>
                {totalMinor == null || !fxRate || !Number.isFinite(Number(fxRate))
                  ? "—"
                  : formatMinorMoney(
                      Math.round(
                        (totalMinor / 10 ** currencyMinorUnit) *
                          Number(fxRate) *
                          10 ** ledgerMinorUnit,
                      ),
                      ledgerCurrency,
                      ledgerMinorUnit,
                    )}
              </strong>
            </div>
          </div>
        </div>
      )}

      <div className="review-section-card">
        <div className="items-header">
          <div>
            <h2>Rincian Item Belanja ({items.length})</h2>
            <small className="muted">
              {readOnly
                ? "Rincian barang pada pengeluaran ini."
                : "Periksa nama barang, kuantitas, harga, dan kategorinya."}
            </small>
          </div>
          {!readOnly && (
            <Button type="button" variant="secondary" className="text-xs" onClick={onAddItem}>
              <Icon name="plus" size={14} />
              <span>Tambah Item</span>
            </Button>
          )}
        </div>

        {hasDiscrepancy && (
          <div className="discrepancy-callout" role="alert">
            <Icon name="alert" size={18} />
            <div className="discrepancy-text">
              <span>
                Jumlah rincian ({formatMinorMoney(sumItems, currency, currencyMinorUnit)}) berbeda
                dari total transaksi (
                {formatMinorMoney(totalMinor, currency, currencyMinorUnit)}).
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="text-link text-xs ml-2"
                  onClick={() => onTotalMinorChange(sumItems)}
                >
                  Gunakan total rincian
                </button>
              )}
            </div>
          </div>
        )}

        <div className="items-list">
          {items.length === 0 ? (
            <p className="muted text-sm text-center py-4">
              {readOnly
                ? "Belum ada rincian item."
                : 'Belum ada rincian item. Klik "Tambah Item" untuk mencatat per barang.'}
            </p>
          ) : (
            items.map((item, index) => (
              <div
                className={`item-row-card${selectedItemId === item.id ? " is-selected" : ""}`}
                id={item.id ? `receipt-item-${item.id}` : undefined}
                key={item.id || index}
              >
                <div className="item-row-main">
                  <Field
                    id={`expense-item-name-${index}`}
                    label="Nama Barang"
                    required
                    value={item.name}
                    disabled={readOnly}
                    onChange={(event) => onUpdateItem(index, { name: event.target.value })}
                    placeholder="Nama barang"
                  />
                </div>
                <div className="item-row-side">
                  <div className="item-col-qty">
                    <Field
                      id={`expense-item-qty-${index}`}
                      label="Qty"
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                      value={item.qty_milli / 1000}
                      disabled={readOnly}
                      onChange={(event) =>
                        onUpdateItem(index, {
                          qty_milli: Math.max(1, Math.round(Number(event.target.value) * 1000)),
                        })
                      }
                    />
                  </div>
                  <div className="item-col-price">
                    <MinorAmountField
                      id={`expense-item-unit-${index}`}
                      label={`Harga Satuan (${currency})`}
                      value={item.unit_price_minor ?? null}
                      minorUnit={currencyMinorUnit}
                      disabled={readOnly}
                      onChange={(value) =>
                        onUpdateItem(index, { unit_price_minor: value })
                      }
                    />
                  </div>
                  <div className="item-col-price">
                    <MinorAmountField
                      id={`expense-item-amount-${index}`}
                      label={`Subtotal (${currency})`}
                      value={item.amount_minor}
                      minorUnit={currencyMinorUnit}
                      disabled={readOnly}
                      onChange={(value) =>
                        onUpdateItem(index, { amount_minor: value ?? 0 })
                      }
                      required
                    />
                  </div>
                  <div className="item-col-cat">
                    <SelectField
                      id={`expense-item-category-${index}`}
                      label="Kategori"
                      value={item.category_id || ""}
                      disabled={readOnly}
                      onChange={(event) =>
                        onUpdateItem(index, { category_id: event.target.value || null })
                      }
                    >
                      <option value="">(Belum kategori)</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </SelectField>
                    {!readOnly && canCreateCategory && creatingCategoryFor === index ? (
                      <div className="category-create-row">
                        <Field
                          id={`expense-category-name-${index}`}
                          label="Nama kategori baru"
                          maxLength={50}
                          value={categoryName}
                          onChange={(event) => setCategoryName(event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!categoryName.trim() || creatingCategory}
                          loading={creatingCategory}
                          onClick={() => void createCategory(index)}
                        >
                          Buat
                        </Button>
                      </div>
                    ) : !readOnly && canCreateCategory ? (
                      <button
                        type="button"
                        className="text-link text-xs"
                        onClick={() => {
                          setCategoryError("");
                          setCreatingCategoryFor(index);
                        }}
                      >
                        Buat kategori
                      </button>
                    ) : null}
                  </div>
                  {!readOnly && (
                    <div className="item-col-action">
                      <button
                        type="button"
                        className="ghost-button item-delete-btn"
                        onClick={() => onRemoveItem(index)}
                        aria-label={`Hapus ${item.name || "item"}`}
                      >
                        <Icon name="close" size={16} />
                        <span className="item-delete-label">Hapus</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {categoryError && (
          <Alert variant="error" onDismiss={() => setCategoryError("")} className="mt-3">
            {categoryError}
          </Alert>
        )}
      </div>
    </>
  );
}
