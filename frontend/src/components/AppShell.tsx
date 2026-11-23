import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import { useLedgerSelection } from "../context/LedgerSelectionContext";
import { ledgerPath } from "../lib/routes";
import { type ReactNode } from "react";
// import { Icon, type IconName } from "./ui";
import { SiHome } from '@sargamicons/react/line';
import { SiHome as SiHomeActive } from '@sargamicons/react/fill';
import { SiBarChart } from '@sargamicons/react/line';
import { SiBarChart as SiBarChartActive } from '@sargamicons/react/fill';
import { SiLibraryBooks } from '@sargamicons/react/line';
import { SiLibraryBooks as SiLibraryBooksActive } from '@sargamicons/react/fill';
import { SiAiChat } from '@sargamicons/react/line';
import { SiAiChat as SiAiChatActive } from '@sargamicons/react/fill';
import { SiChevronLeftAlt } from '@sargamicons/react/fill';
import { SiAdd } from '@sargamicons/react/fill';
import { SiClose } from '@sargamicons/react/fill';




type NavItemConfig = {
  suffix: string;
  label: string;
  icon: ReactNode;
  iconActive: ReactNode;
  to?: string;
  end?: boolean;
};

const links: NavItemConfig[] = [
  {
    suffix: "",
    label: "Beranda",
    icon: <SiHome />,
    iconActive: <SiHomeActive />,
    to: "/home",
    end: true,
  },
  {
    suffix: "",
    label: "Analytics",
    icon: <SiBarChart />,
    iconActive: <SiBarChartActive />,
    to: "/analytic",
    end: true,
  },
  {
    suffix: "scan",
    label: "Scan",
    icon: <SiAdd />,
    iconActive: <SiAdd />,
  },
  {
    suffix: "books",
    label: "Buku",
    icon: <SiLibraryBooks />,
    iconActive: <SiLibraryBooksActive />,
    to: "/app/books",
    end: true,
  },
  {
    suffix: "chat",
    label: "Tanya AI",
    icon: <SiAiChat />,
    iconActive: <SiAiChatActive />,
  },
];

type topBarElementProps = {
  title: string;
  button?: ReactNode | null;
  button2?: ReactNode | null;
}

export function AppShell() {
  const { session } = useSession();
  const { homeLedgerId, analyticLedgerId } = useLedgerSelection();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const routeLedgerId = path.match(/^\/app\/ledger\/([^/]+)/)?.[1];
  const ledgerId =
    routeLedgerId ?? (path === "/analytic" ? analyticLedgerId : homeLedgerId);

  const linksWithPaths = links.map((link) => ({
    ...link,
    to:
      link.label === "Scan"
        ? routeLedgerId
          ? ledgerPath(routeLedgerId, "scan")
          : "/app/scan"
        : link.to ?? (ledgerId ? ledgerPath(ledgerId, link.suffix) : "/app/books"),
  }));
      
      const initials = (session?.user.display_name || session?.user.username || "U")
      .slice(0, 1)
      .toUpperCase();
      
  const topBarElement:topBarElementProps = (() => {
    if (path.includes("/receipts/")) {
      return {
        title: "Detail Pengeluaran",
      }
    };
    if (path === "/app/books" || path === "/app/trackers") return {title: "Buku Pengeluaran"};
    if (/^\/app\/books\/[^/]+$/.test(path) && !path.endsWith("/create")) {
      return {
        title: "Detail Buku",
        button2: <Link to={"/app/books"}><SiChevronLeftAlt className="text-xl"/></Link>
      };
    }
    if (path === "/analytic" || path.endsWith("/analytics")) return {
      title: "Analitik",
    };
    if (path.endsWith("/history")) return {title: "Riwayat"};
    if (path.endsWith("/scan/capture")) return {title: "Ambil Foto Struk"};
    if (path === "/app/scan") return {
      title: "Tambah Pengeluaran",
      button2: (
        <button
          type="button"
          aria-label="Kembali"
          onClick={() => navigate("/home")}
        >
          <SiClose className="text-2xl" />
        </button>
      ),
    };
    if(/^\/app\/ledger\/[^/]+\/scan$/.test(path)) return {
      title: "Pilih Metode ",
      button2: (
        <button
          type="button"
          aria-label="Kembali"
          onClick={() => navigate("app/scan")}
        >
          <SiChevronLeftAlt className="text-2xl" />
        </button>
      ),
    }
    if (path.endsWith("/manual")) return {title: "Input Manual"};
    if (path.endsWith("/chat")) return {title: "Chatbot Insight"};
    if (path.endsWith("/budget")) return {title: "Anggaran"};
    if (path.endsWith("books/create")) return {title: "Personalisasi Buku", button2: <Link to={"/app/books"}><SiChevronLeftAlt className="text-xl"/></Link>};
    
    if (path === "/app/account") return {title: "Akun"};
    return {
      title: "Ingat Belanjaan",
      button: <button
            className="avatar"
            type="button"
            aria-label="Buka akun"
            onClick={() => navigate("/app/account")}
          >
            {initials}
          </button>
    };
  })();

  const hideBottomNav =
    path.endsWith("/history") ||
    path.endsWith("/books/create") ||
    /^\/app\/books\/[^/]+$/.test(path) ||
    path.endsWith("/manual") ||
    path.endsWith("/scan/capture") ||
    /\/receipts\/[^/]+$/.test(path) ||
    path.endsWith("/app/scan") ||
    /^\/app\/ledger\/[^/]+\/scan$/.test(path);

  return (
    <div className="app-frame bg-olive-100">
      <a className="skip-link" href="#main">
        Lompat ke konten utama
      </a>
      <header className="px-4 py-4 w-full z-50 fixed bg-inherit left-0 top-0 flex flex-row items-center justify-between">
        <div className="topbar-brand flex flex-row items-center gap-2">
          {topBarElement.button2 !== null && topBarElement.button2}
          <p className="font-bold text-2xl text-(--color-primary)">
            {topBarElement.title}
          </p>
        </div>
        {topBarElement.button}
      </header>
      <main id="main" tabIndex={-1} className="page-content pt-18">
        <Outlet />
      </main>
      {!hideBottomNav && (
        <nav className="bottom-nav bg-white px-3" aria-label="Navigasi utama">
          {linksWithPaths.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              end={link.end ?? link.suffix === ""}
              aria-label={link.label === "Scan" ? "Scan struk" : undefined}
              className={({ isActive }) => {
                let gaya = isActive ? "nav-item gap-1 active " : "nav-item gap-1 ";
                gaya +=
                  link.label === "Scan"
                    ? "outline-12 outline-white rounded-full mb-8 bg-transparent"
                    : "pt-3 pb-5";
                return gaya;
              }}
            >
              {({isActive}) => (
                <>
                  <span
                    className={link.label == "Scan" ? "text-3xl bg-(--color-primary) p-4 text-white" : "text-3xl "}
                    aria-hidden="true"
                  >
                    {isActive ? link.iconActive : link.icon}
                  </span>
                  {link.label !== "Scan" && (
                    <span className="text-xs font-semibold">{link.label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
