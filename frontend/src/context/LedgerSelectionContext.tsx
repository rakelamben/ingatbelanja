import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useSession } from "./SessionContext";

type LedgerSelectionContextValue = {
  homeLedgerId: string;
  setHomeLedgerId: (ledgerId: string) => void;
  analyticLedgerId: string;
  setAnalyticLedgerId: (ledgerId: string) => void;
};

const LedgerSelectionContext = createContext<LedgerSelectionContextValue | null>(null);

export function LedgerSelectionProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const defaultLedgerId = session?.personal_ledger_id ?? "";
  const [homeLedgerId, setHomeLedgerId] = useState(defaultLedgerId);
  const [analyticLedgerId, setAnalyticLedgerId] = useState(defaultLedgerId);

  const value = useMemo(
    () => ({ homeLedgerId, setHomeLedgerId, analyticLedgerId, setAnalyticLedgerId }),
    [homeLedgerId, analyticLedgerId],
  );

  return (
    <LedgerSelectionContext.Provider value={value}>
      {children}
    </LedgerSelectionContext.Provider>
  );
}

export function useLedgerSelection() {
  const value = useContext(LedgerSelectionContext);
  if (!value) {
    throw new Error("useLedgerSelection must be used inside LedgerSelectionProvider");
  }
  return value;
}
