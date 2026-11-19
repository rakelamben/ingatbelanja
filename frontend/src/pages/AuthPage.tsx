import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { useSession } from "../context/SessionContext";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register"; const navigate = useNavigate(); const location = useLocation(); const { setSession } = useSession();
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const from = new URLSearchParams(location.search).get("from");
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); setBusy(true); try { const session = isRegister ? await api.register(username, password, displayName || undefined) : await api.login(username, password); setSession(session); navigate(from?.startsWith("/app") ? from : "/app", { replace: true }); } catch (err) { setError(err instanceof ApiError ? err.message : "Tidak dapat terhubung ke server."); } finally { setBusy(false); } };
  return <section className="auth-card" aria-labelledby="auth-title"><p className="eyebrow">{isRegister ? "MULAI SEKARANG" : "SELAMAT DATANG KEMBALI"}</p><h1 id="auth-title">{isRegister ? "Buat ruang untuk belanjamu." : "Masuk ke catatanmu."}</h1><p className="muted">{isRegister ? "Simpan pengeluaran tanpa kehilangan konteks." : "Lanjutkan dari tempat terakhir kamu berhenti."}</p>
    <form onSubmit={submit} className="auth-form" noValidate>{isRegister && <label>Nama tampilan<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" /></label>}<label>Username<input required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label><label>Password<input required minLength={10} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} /><span className="field-help">Minimal 10 karakter.</span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "Memproses…" : isRegister ? "Buat akun" : "Masuk"}</button></form>
    <p className="auth-switch">{isRegister ? "Sudah punya akun?" : "Belum punya akun?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Masuk" : "Daftar"}</Link></p></section>;
}
