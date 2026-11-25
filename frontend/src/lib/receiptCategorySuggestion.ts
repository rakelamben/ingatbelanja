import type { Category } from "./api";

const categoryRules = [
  {
    categories: ["makanan"],
    terms: [
      "beras",
      "nasi",
      "mie",
      "mi",
      "roti",
      "susu",
      "sayur",
      "buah",
      "daging",
      "telur",
      "ayam",
      "ikan",
      "biskuit",
      "snack",
    ],
  },
  {
    categories: ["transportasi", "transport"],
    terms: [
      "bensin",
      "bbm",
      "pertalite",
      "pertamax",
      "parkir",
      "tol",
      "bus",
      "kereta",
      "angkot",
      "taksi",
      "ojek",
    ],
  },
  {
    categories: ["tagihan"],
    terms: ["listrik", "pln", "pdam", "internet", "wifi", "pulsa", "token listrik"],
  },
  {
    categories: ["kesehatan"],
    terms: ["obat", "apotek", "vitamin", "klinik", "dokter", "rumah sakit"],
  },
  {
    categories: ["belanja"],
    terms: ["sabun", "shampoo", "sampo", "detergen", "deterjen", "tisu", "pasta gigi", "sikat gigi", "plastik", "baterai"],
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function suggestReceiptCategoryId(
  itemName: string,
  categories: Category[],
): string | null {
  const normalizedName = ` ${normalize(itemName)} `;
  if (!normalizedName.trim()) return null;

  for (const rule of categoryRules) {
    const category = categories.find((item) => rule.categories.includes(normalize(item.name)));
    if (
      category &&
      rule.terms.some((term) => normalizedName.includes(` ${normalize(term)} `))
    ) {
      return category.id;
    }
  }

  return null;
}
