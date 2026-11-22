import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Ledger } from "../lib/api";
import { ledgerPath } from "../lib/routes";

export function LedgerSwitcher({ activeId }: { activeId?: string }) {
  const navigate = useNavigate();
  const [ledgers, setLedgers] = useState<Ledger[]>([]);

  useEffect(() => {
    api
      .ledgers()
      .then((result) => setLedgers(result.ledgers))
      .catch(() => setLedgers([]));
  }, []);

  return (
    <div className="ledger-switcher px-2 py-2">
      <select
        id="active-ledger-select"
        className="bg-(--color-surface)/20"
        value={activeId ?? ""}
        onChange={(event) => navigate(ledgerPath(event.target.value))}
        aria-label="Pilih buku aktif"
      >
        {ledgers.map((ledger) => (
          <option className="text-black" key={ledger.id} value={ledger.id}>
            {ledger.name}
          </option>
        ))}
      </select>
    </div>
  );
}
