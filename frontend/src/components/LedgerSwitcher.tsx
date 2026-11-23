import { useEffect, useState } from "react";
import { api, type Ledger } from "../lib/api";

type LedgerSwitcherProps = {
  activeId: string;
  variant: "home" | "analytics";
  onChange: (ledgerId: string) => void;
  className?: string;
};

export function LedgerSwitcher({ activeId, variant, onChange, className }: LedgerSwitcherProps) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .ledgers()
      .then((result) => {
        if (!cancelled) setLedgers(result.ledgers);
      })
      .catch(() => {
        if (!cancelled) setError("Daftar buku tidak dapat dimuat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={["ledger-switcher", `ledger-switcher--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      <select
        id={`active-ledger-select-${variant}`}
        value={activeId}
        onChange={(event) => onChange(event.target.value)}
        aria-label={variant === "home" ? "Pilih buku untuk beranda" : "Pilih buku untuk analitik"}
        disabled={loading || Boolean(error) || ledgers.length === 0}
      >
        {ledgers.length === 0 && <option value="">Tidak ada buku tersedia</option>}
        {ledgers.map((ledger) => (
          <option className="text-black" key={ledger.id} value={ledger.id}>
            {ledger.name}
          </option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
