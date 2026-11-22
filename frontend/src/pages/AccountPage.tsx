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
      <Link className="back-link" to="/app">
        <Icon name="arrow-left" size={16} />
        <span>Kembali ke Beranda</span>
      </Link>
      <p className="eyebrow">PENGATURAN AKUN</p>
      <h1>Akunmu.</h1>
      <p className="muted">Kelola sesi masuk dan preferensi IngatBelanjaan dari satu tempat.</p>

      <article className="account-card">
        <span className="account-avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <strong>{displayName}</strong>
          <small>@{session?.user.username}</small>
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
