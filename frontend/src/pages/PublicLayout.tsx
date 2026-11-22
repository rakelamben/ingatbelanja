import { Outlet } from "react-router-dom";

export function PublicLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Lompat ke konten utama
      </a>
      <main id="main" tabIndex={-1} className="public-shell">
        <div className="brand-mark">
          <span>IB</span>
          <div>
            <p className="eyebrow">INGATBELANJAAN</p>
            <p className="brand-subtitle">Pengeluaran, lebih mudah diingat.</p>
          </div>
        </div>
        <Outlet />
      </main>
    </>
  );
}
