import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import { ApiError } from "../lib/api";
import { Button, Alert, Icon } from "../components/ui";

export function AccountPage() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Tidak dapat keluar saat ini.");
    } finally {
      setBusy(false);
    }
  };

  const displayName = session?.user.display_name || session?.user.username || "Pengguna";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <section className="account-page">

      <article className="w-full flex flex-row items-center gap-3 bg-olive-200 px-4 py-4 rounded-md mb-4">
        <span className="account-avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <strong className="text-xl">{displayName}</strong>
        </div>
      </article>

      {error && (
        <Alert variant="error" onDismiss={() => setError("")} className="mb-4">
          {error}
        </Alert>
      )}

      <Button
        variant="danger"
        className="account-logout"
        type="button"
        onClick={signOut}
        loading={busy}
      >
        <Icon name="logout" size={18} />
        <span>{busy ? "Keluar…" : "Keluar dari akun"}</span>
      </Button>
    </section>
  );
}
