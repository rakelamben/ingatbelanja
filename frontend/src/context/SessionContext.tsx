import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { api, type Session } from "../lib/api";

type SessionContextValue = { session: Session | null; setSession: (session: Session | null) => void; logout: () => Promise<void> };
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ initialSession, children }: { initialSession: Session | null; children: ReactNode }) {
  const [session, setSession] = useState(initialSession);
  const value = useMemo(() => ({ session, setSession, logout: async () => { await api.logout(); setSession(null); } }), [session]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
