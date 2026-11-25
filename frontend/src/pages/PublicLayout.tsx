import { Outlet } from "react-router-dom";

export function PublicLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Lompat ke konten utama
      </a>
      <main id="main" tabIndex={-1} className="public-shell">
        <p className="font-bold text-2xl text-center text-(--color-primary)">
          IngatBelanjaan
        </p>
        <Outlet />
      </main>
    </>
  );
}
