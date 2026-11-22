import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useParams,
  useRouteError,
} from "react-router-dom";
import "./styles/app.css";
import { AppShell } from "./components/AppShell";
import { LedgerProvider } from "./context/LedgerContext";
import { SessionProvider, useSession } from "./context/SessionContext";
import { api, type Session } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { HistoryPage } from "./pages/HistoryPage";
import { ManualPage } from "./pages/ManualPage";
import { ReportsPage } from "./pages/ReportsPage";
import { BudgetPage } from "./pages/BudgetPage";
import { ChatPage } from "./pages/ChatPage";
import { AccountPage } from "./pages/AccountPage";
import { PublicLayout } from "./pages/PublicLayout";
import { ScanPage } from "./pages/ScanPage";
import { TrackersPage } from "./pages/TrackersPage";
import { ReceiptReviewPage } from "./pages/ReceiptReviewPage";
import { reportWebVitals } from "./lib/metrics";
import { ledgerPath } from "./lib/routes";

async function rootLoader(): Promise<Session | null> {
  try {
    return await api.me();
  } catch {
    return null;
  }
}

function PublicRoute() {
  const { session } = useSession();
  return session ? <Navigate to="/app" replace /> : <Outlet />;
}

function ProtectedRoute() {
  const { session } = useSession();
  return session ? <Outlet /> : <Navigate to="/login?from=/app" replace />;
}

function RootError() {
  const error = useRouteError();
  return (
    <main className="error-page">
      <p className="eyebrow">TERJADI KESALAHAN</p>
      <h1>Halaman belum siap.</h1>
      <p className="muted">Coba muat ulang halaman ini.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>
        Muat ulang
      </button>
      <pre className="sr-only">{String(error)}</pre>
    </main>
  );
}

function Root() {
  return (
    <SessionProvider initialSession={router.state.loaderData?.root ?? null}>
      <RouterOutlet />
    </SessionProvider>
  );
}

function RouterOutlet() {
  return <Outlet />;
}

function HomeRedirect() {
  const { session } = useSession();
  const target = session?.personal_ledger_id
    ? `/app/ledger/${session.personal_ledger_id}`
    : "/app";
  return <Navigate to={target} replace />;
}

function LedgerRedirect({ suffix }: { suffix: string }) {
  const { session } = useSession();
  const target = session?.personal_ledger_id
    ? `/app/ledger/${session.personal_ledger_id}/${suffix}`
    : "/app";
  return <Navigate to={target} replace />;
}

function LegacyReportsRedirect() {
  const { ledgerId } = useParams();
  return <Navigate to={ledgerId ? ledgerPath(ledgerId, "analytics") : "/app"} replace />;
}

const router = createBrowserRouter([
  {
    id: "root",
    loader: rootLoader,
    errorElement: <RootError />,
    element: <Root />,
    children: [
      {
        element: <PublicRoute />,
        children: [
          {
            element: <PublicLayout />,
            children: [
              { path: "/login", element: <AuthPage mode="login" /> },
              { path: "/register", element: <AuthPage mode="register" /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "/app",
            element: <AppShell />,
            children: [
              { index: true, element: <HomeRedirect /> },
              {
                path: "/app/ledger/:ledgerId",
                element: (
                  <LedgerProvider>
                    <Outlet />
                  </LedgerProvider>
                ),
                children: [
                  { index: true, element: <HomePage /> },
                  { path: "/app/ledger/:ledgerId/history", element: <HistoryPage /> },
                  { path: "/app/ledger/:ledgerId/scan", element: <ScanPage /> },
                  { path: "/app/ledger/:ledgerId/manual", element: <ManualPage /> },
                  {
                    path: "/app/ledger/:ledgerId/receipts/:receiptId",
                    element: <ReceiptReviewPage />,
                  },
                  { path: "/app/ledger/:ledgerId/analytics", element: <ReportsPage /> },
                  { path: "/app/ledger/:ledgerId/reports", element: <LegacyReportsRedirect /> },
                  { path: "/app/ledger/:ledgerId/budget", element: <BudgetPage /> },
                  { path: "/app/ledger/:ledgerId/chat", element: <ChatPage /> },
                ],
              },
              { path: "/app/books", element: <TrackersPage /> },
              { path: "/app/trackers", element: <Navigate to="/app/books" replace /> },
              { path: "/app/account", element: <AccountPage /> },
              { path: "/app/history", element: <LedgerRedirect suffix="history" /> },
              { path: "/app/scan", element: <LedgerRedirect suffix="scan" /> },
              { path: "/app/manual", element: <LedgerRedirect suffix="manual" /> },
              { path: "/app/analytics", element: <LedgerRedirect suffix="analytics" /> },
              { path: "/app/reports", element: <LedgerRedirect suffix="analytics" /> },
              { path: "/app/budget", element: <LedgerRedirect suffix="budget" /> },
              { path: "/app/chat", element: <LedgerRedirect suffix="chat" /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/app" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

reportWebVitals();
