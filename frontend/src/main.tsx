import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useRouteError } from "react-router-dom";
import "./styles/app.css";
import { AppShell } from "./components/AppShell";
import { SessionProvider, useSession } from "./context/SessionContext";
import { api, type Session } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { HistoryPage } from "./pages/HistoryPage";
import { ManualPage } from "./pages/ManualPage";
import { ReportsPage } from "./pages/ReportsPage";
import { BudgetPage } from "./pages/BudgetPage";
import { ChatPage } from "./pages/ChatPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { PublicLayout } from "./pages/PublicLayout";
import { ScanPage } from "./pages/ScanPage";
import { TrackersPage } from "./pages/TrackersPage";

async function rootLoader(): Promise<Session | null> { try { return await api.me(); } catch { return null; } }
function PublicRoute() { const { session } = useSession(); return session ? <Navigate to="/app" replace /> : <Outlet />; }
function ProtectedRoute() { const { session } = useSession(); return session ? <Outlet /> : <Navigate to="/login?from=/app" replace />; }
function RootError() { const error = useRouteError(); return <main className="error-page"><p className="eyebrow">TERJADI KESALAHAN</p><h1>Halaman belum siap.</h1><p className="muted">Coba muat ulang halaman ini.</p><button className="primary-button" onClick={() => window.location.reload()}>Muat ulang</button><pre className="sr-only">{String(error)}</pre></main>; }
function Root() { return <SessionProvider initialSession={router.state.loaderData?.root ?? null}><RouterOutlet /></SessionProvider>; }
function RouterOutlet() { return <Outlet />; }
const router = createBrowserRouter([{ id: "root", loader: rootLoader, errorElement: <RootError />, element: <Root />, children: [{ element: <PublicRoute />, children: [{ element: <PublicLayout />, children: [{ path: "/login", element: <AuthPage mode="login" /> }, { path: "/register", element: <AuthPage mode="register" /> }] }] }, { element: <ProtectedRoute />, children: [{ path: "/app", element: <AppShell />, children: [{ index: true, element: <HomePage /> }, { path: "history", element: <HistoryPage /> }, { path: "scan", element: <ScanPage /> }, { path: "manual", element: <ManualPage /> }, { path: "trackers", element: <TrackersPage /> }, { path: "reports", element: <ReportsPage /> }, { path: "budget", element: <BudgetPage /> }, { path: "chat", element: <ChatPage /> }, { path: "account", element: <PlaceholderPage title="Akun dan preferensi" description="Kelola profil, keamanan, dan persetujuan AI." /> }, { path: "ledger/:ledgerId", element: <HistoryPage /> }] }] }, { path: "*", element: <Navigate to="/app" replace /> }] }]);
createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
