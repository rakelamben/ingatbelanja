import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Ledger } from "../lib/api";

export function LedgerSwitcher({ activeId }: { activeId?: string }) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  useEffect(() => { api.ledgers().then((result) => setLedgers(result.ledgers)).catch(() => setLedgers([])); }, []);
  return <label className="ledger-switcher">Buku aktif<select value={activeId ?? ""} onChange={(event) => { window.location.href = `/app/ledger/${event.target.value}`; }} aria-label="Pilih buku">
    {ledgers.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.name} · {ledger.currency}</option>)}
  </select><Link to="/app/trackers">Kelola buku</Link></label>;
}
