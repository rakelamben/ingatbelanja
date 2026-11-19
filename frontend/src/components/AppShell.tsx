import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";

const links = [
  { to: "/app", label: "Beranda", icon: "⌂", end: true },
  { to: "/app/history", label: "Riwayat", icon: "◷" },
  { to: "/app/scan", label: "Scan", icon: "+" },
  { to: "/app/trackers", label: "Pelacak", icon: "◎" },
  { to: "/app/account", label: "Akun", icon: "○" },
  { to: "/app/chat", label: "Tanya AI", icon: "✦" },
];

export function AppShell() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const initials = (session?.user.display_name || session?.user.username || "U").slice(0, 1).toUpperCase();
  return <div className="app-frame">
    <header className="topbar">
      <div><p className="eyebrow">INGATBELANJAAN</p><p className="topbar-title">Halo, {session?.user.display_name || session?.user.username}</p></div>
      <button className="avatar" aria-label="Buka akun" onClick={() => navigate("/app/account")}>{initials}</button>
    </header>
    <main className="page-content"><Outlet /></main>
    <nav className="bottom-nav" aria-label="Navigasi utama">
      {links.map((link) => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <span className={link.label === "Scan" ? "scan-icon" : "nav-icon"} aria-hidden="true">{link.icon}</span><span>{link.label}</span>
      </NavLink>)}
      <button className="nav-item nav-logout" onClick={async () => { await logout(); navigate("/login"); }}><span className="nav-icon" aria-hidden="true">↗</span><span>Keluar</span></button>
    </nav>
  </div>;
}
