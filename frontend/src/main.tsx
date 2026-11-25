import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
  useRouteError,
} from "react-router-dom";
import "./styles/app.css";
import { AppShell } from "./components/AppShell";
import { LedgerProvider } from "./context/LedgerContext";
import { LedgerSelectionProvider, useLedgerSelection } from "./context/LedgerSelectionContext";
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
import { HistoryExpenseDetailPage } from "./pages/HistoryExpenseDetailPage";
import { reportWebVitals } from "./lib/metrics";
import { ledgerPath } from "./lib/routes";
import { PersonalisasiBukuPage } from "./pages/PersonalisasiBukuPage";
import { DetailBukuPage } from "./pages/DetailBukuPage";
import { SelectExpenseLedgerPage } from "./pages/SelectExpenseLedgerPage";
import { ReceiptCapturePage } from "./pages/ReceiptCapturePage";

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

function AppLayout() {
  return (
    <LedgerSelectionProvider>
      <AppShell />
    </LedgerSelectionProvider>
  );
}

function HomeRoute() {
  const { homeLedgerId } = useLedgerSelection();
  return (
    <LedgerProvider key={homeLedgerId} ledgerId={homeLedgerId}>
      <HomePage />
    </LedgerProvider>
  );
}

function AnalyticsRoute() {
  const { analyticLedgerId } = useLedgerSelection();
  return (
    <LedgerProvider key={analyticLedgerId} ledgerId={analyticLedgerId}>
      <ReportsPage />
    </LedgerProvider>
  );
}

function LegacyHomeRedirect() {
  const { ledgerId } = useParams<{ ledgerId: string }>();
  const { setHomeLedgerId } = useLedgerSelection();
  const navigate = useNavigate();

  useEffect(() => {
    if (ledgerId) setHomeLedgerId(ledgerId);
    navigate("/home", { replace: true });
  }, [ledgerId, navigate, setHomeLedgerId]);

  return null;
}

function LegacyAnalyticsRedirect() {
  const { ledgerId } = useParams<{ ledgerId: string }>();
  const { setAnalyticLedgerId } = useLedgerSelection();
  const navigate = useNavigate();

  useEffect(() => {
    if (ledgerId) setAnalyticLedgerId(ledgerId);
    navigate("/analytic", { replace: true });
  }, [ledgerId, navigate, setAnalyticLedgerId]);

  return null;
}

function ContextualLedgerRedirect({ suffix }: { suffix: string }) {
  const { homeLedgerId } = useLedgerSelection();
  return (
    <Navigate
      to={homeLedgerId ? ledgerPath(homeLedgerId, suffix) : "/app/books"}
      replace
    />
  );
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
            element: <AppLayout />,
            children: [
              { path: "/home", element: <HomeRoute /> },
              { path: "/analytic", element: <AnalyticsRoute /> },
              { path: "/app", element: <Navigate to="/home" replace /> },
              {
                path: "/app/ledger/:ledgerId",
                element: (
                  <LedgerProvider>
                    <Outlet />
                  </LedgerProvider>
                ),
                children: [
                  { index: true, element: <LegacyHomeRedirect /> },
                  { path: "/app/ledger/:ledgerId/history", element: <HistoryPage /> },
                  { path: "/app/ledger/:ledgerId/scan", element: <ScanPage /> },
                  { path: "/app/ledger/:ledgerId/scan/capture", element: <ReceiptCapturePage /> },
                  { path: "/app/ledger/:ledgerId/manual", element: <ManualPage /> },
                  {
                    path: "/app/ledger/:ledgerId/receipts/:receiptId/detail",
                    element: <HistoryExpenseDetailPage />,
                  },
                  {
                    path: "/app/ledger/:ledgerId/receipts/:receiptId",
                    element: <ReceiptReviewPage />,
                  },
                  { path: "/app/ledger/:ledgerId/analytics", element: <LegacyAnalyticsRedirect /> },
                  { path: "/app/ledger/:ledgerId/reports", element: <LegacyAnalyticsRedirect /> },
                  { path: "/app/ledger/:ledgerId/budget", element: <BudgetPage /> },
                  { path: "/app/ledger/:ledgerId/chat", element: <ChatPage /> },
                ],
              },
              { path: "/app/books", element: <TrackersPage /> },
              { path: "/app/books/create", element: <PersonalisasiBukuPage /> },
              { path: "/app/books/:ledgerId", element: <DetailBukuPage /> },
              { path: "/app/trackers", element: <Navigate to="/app/books" replace /> },
              { path: "/app/account", element: <AccountPage /> },
              { path: "/app/history", element: <ContextualLedgerRedirect suffix="history" /> },
              { path: "/app/scan", element: <SelectExpenseLedgerPage /> },
              { path: "/app/manual", element: <ContextualLedgerRedirect suffix="manual" /> },
              { path: "/app/analytics", element: <Navigate to="/analytic" replace /> },
              { path: "/app/reports", element: <Navigate to="/analytic" replace /> },
              { path: "/app/budget", element: <ContextualLedgerRedirect suffix="budget" /> },
              { path: "/app/chat", element: <ContextualLedgerRedirect suffix="chat" /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/home" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

reportWebVitals();
