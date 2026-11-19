import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";

function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          IngatBelanjaan
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          Fondasi aplikasi siap digunakan.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">
          Tahap berikutnya akan menambahkan buku pengeluaran, scan struk, dan pelacak bersama.
        </p>
        <div className="mt-8 inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
          Backend dan frontend terhubung melalui Vite proxy.
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
