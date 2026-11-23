export function minorToMajorInput(amountMinor: number | null | undefined, minorUnit: number) {
  if (amountMinor == null) return "";
  return (amountMinor / 10 ** minorUnit).toFixed(minorUnit);
}

export function majorInputToMinor(value: string, minorUnit: number): number | null {
  const normalized = value.trim();
  if (!normalized || !/^\d*(?:\.\d*)?$/.test(normalized)) return null;

  const [wholePart = "0", fractionPart = ""] = normalized.split(".");
  const allowedFraction = fractionPart.slice(0, minorUnit);
  if (fractionPart.slice(minorUnit).replace(/0/g, "")) return null;

  const scale = 10 ** minorUnit;
  const whole = Number(wholePart || "0");
  const fraction = Number(allowedFraction.padEnd(minorUnit, "0") || "0");
  const amountMinor = whole * scale + fraction;
  return Number.isSafeInteger(amountMinor) ? amountMinor : null;
}

export function formatMinorMoney(
  amountMinor: number | null,
  currency: string,
  minorUnit: number,
) {
  if (amountMinor == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  }).format(amountMinor / 10 ** minorUnit);
}
