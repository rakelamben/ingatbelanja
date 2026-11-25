import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { Button, Field, Alert } from "../components/ui";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useSession();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  const from = new URLSearchParams(location.search).get("from");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Mohon isi semua bidang yang diperlukan.");
      usernameRef.current?.focus();
      return;
    }

    if (isRegister && password.length < 10) {
      setError("Password minimal 10 karakter.");
      return;
    }

    setBusy(true);
    try {
      const session = isRegister
        ? await api.register(username, password, displayName || undefined)
        : await api.login(username, password);
      setSession(session);
      navigate(from?.startsWith("/app") ? from : "/app", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Tidak dapat terhubung ke server. Periksa koneksi internetmu.";
      setError(message);
      window.setTimeout(() => errorRef.current?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="my-auto" aria-labelledby="auth-title">
      <p className="text-xl font-bold">{isRegister ? "Buat Akun" : "Masuk ke Akun"}</p>
      {/* <p className="muted">
        {isRegister
          ? "Simpan pengeluaran tanpa kehilangan konteks."
          : "Lanjutkan dari tempat terakhir kamu berhenti."}
      </p> */}

      {error && (
        <div ref={errorRef} tabIndex={-1} style={{ outline: "none", marginTop: "1rem" }}>
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}

      <form onSubmit={submit} className="auth-form" noValidate>
        {isRegister && (
          <Field
            id="auth-display-name"
            label="Nama tampilan"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            placeholder="Contoh: Budi Santoso"
          />
        )}
        <Field
          ref={usernameRef}
          id="auth-username"
          label="Username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder="Username"
        />
        <Field
          id="auth-password"
          label="Password"
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? "new-password" : "current-password"}
          help="Minimal 10 karakter."
          placeholder="***********"
        />
        <Button type="submit" variant="primary" loading={busy}>
          {isRegister ? "Buat akun" : "Masuk"}
        </Button>
      </form>

      <p className="auth-switch">
        {isRegister ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
        <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Masuk" : "Daftar"}</Link>
      </p>
    </section>
  );
}
