import { describe, expect, it } from "vitest";
import { suggestReceiptCategoryId } from "./receiptCategorySuggestion";

const categories = [
  { id: "food", name: "Makanan", is_system: true, ledger_id: null },
  { id: "transport", name: "Transportasi", is_system: true, ledger_id: null },
  { id: "shopping", name: "Belanja", is_system: true, ledger_id: null },
];

describe("suggestReceiptCategoryId", () => {
  it("suggests a matching system category using known item terms", () => {
    expect(suggestReceiptCategoryId("Beras 5kg", categories)).toBe("food");
    expect(suggestReceiptCategoryId("Bensin Pertalite", categories)).toBe("transport");
    expect(suggestReceiptCategoryId("Sabun Mandi", categories)).toBe("shopping");
  });

  it("leaves ambiguous items uncategorized", () => {
    expect(suggestReceiptCategoryId("Barang lainnya", categories)).toBeNull();
    expect(suggestReceiptCategoryId("Beras 5kg", [])).toBeNull();
  });
});
