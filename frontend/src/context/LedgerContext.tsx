import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api, type Ledger, type User } from "../lib/api";

export type LedgerDetails = Ledger & { members: User[] };

export type LedgerPermissions = {
  isOwner: boolean;
  isMember: boolean;
  canManage: boolean;
  canWrite: boolean;
};

export type LedgerContextValue = {
  ledger: LedgerDetails | null;
  loading: boolean;
  error: string;
  reload: () => void;
  permissions: LedgerPermissions;
};

const defaultPermissions: LedgerPermissions = {
  isOwner: false,
  isMember: false,
  canManage: false,
  canWrite: false,
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({
  children,
  ledgerId: requestedLedgerId,
}: {
  children: ReactNode;
  ledgerId?: string;
}) {
  const { ledgerId: routeLedgerId } = useParams<{ ledgerId: string }>();
  const ledgerId = requestedLedgerId ?? routeLedgerId;
  const [ledger, setLedger] = useState<LedgerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!ledgerId) {
      setLedger(null);
      setError("Buku tidak ditemukan.");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    api
      .ledger(ledgerId)
      .then((result) => {
        if (!cancelled) setLedger(result);
      })
      .catch(() => {
        if (!cancelled) {
          setLedger(null);
          setError("Buku tidak dapat dimuat atau kamu tidak memiliki akses.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ledgerId, revision]);

  const permissions: LedgerPermissions = useMemo(() => {
    if (!ledger) return defaultPermissions;
    return {
      isOwner: ledger.role === "owner",
      isMember: true,
      canManage: ledger.role === "owner",
      canWrite: true,
    };
  }, [ledger]);

  const value = useMemo(
    () => ({
      ledger,
      loading,
      error,
      reload: () => setRevision((current) => current + 1),
      permissions,
    }),
    [ledger, loading, error, permissions],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const value = useContext(LedgerContext);
  if (!value) throw new Error("useLedger must be used inside LedgerProvider");
  return value;
}
