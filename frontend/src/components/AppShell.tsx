import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";
import { useEffect, type ReactNode } from "react";
// import { Icon, type IconName } from "./ui";
import { SiHome } from '@sargamicons/react/line';
import { SiHome as SiHomeActive } from '@sargamicons/react/fill';
import { SiBarChart } from '@sargamicons/react/line';
import { SiBarChart as SiBarChartActive } from '@sargamicons/react/fill';
import { SiBarcodeScan } from '@sargamicons/react/line';
import { SiBarcodeScan as SiBarcodeScanActive } from '@sargamicons/react/fill';
import { SiLibraryBooks } from '@sargamicons/react/line';
import { SiLibraryBooks as SiLibraryBooksActive } from '@sargamicons/react/fill';
import { SiAiChat } from '@sargamicons/react/line';
import { SiAiChat as SiAiChatActive } from '@sargamicons/react/fill';
import { SiFilterList } from '@sargamicons/react/fill';


type NavItemConfig = {
  suffix: string;
  label: string;
  icon: ReactNode;
  iconActive: ReactNode;
  to?: string;
  end?: boolean;
};

const links: NavItemConfig[] = [
  { suffix: "", label: "Beranda", icon: <SiHome />, iconActive: <SiHomeActive/>,  end: true },
  { suffix: "analytics", label: "Analytics", icon: <SiBarChart />, iconActive: <SiBarChartActive/> },
  { suffix: "scan", label: "Scan", icon: <SiBarcodeScan />, iconActive: <SiBarcodeScanActive/> },
  {
    suffix: "books",
    label: "Buku",
    icon: <SiLibraryBooks />,
    iconActive: <SiLibraryBooksActive/>,
    to: "/app/books",
    end: true,
  },
  { suffix: "chat", label: "Tanya AI", icon: <SiAiChat />, iconActive: <SiAiChatActive/> },
];

type topBarElementProps = {
  title: string;
  button?: ReactNode | null;
  button2?: ReactNode | null;
}

export function AppShell() {
  const { session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  
  const ledgerId = location.pathname.startsWith("/app/ledger/")
    ? location.pathname.split("/")[3]
    : (session?.personal_ledger_id ?? "");
    
  const linksWithPaths = links.map((link) => ({
    ...link,
    to:
      link.to ??
      (ledgerId
        ? `/app/ledger/${ledgerId}${link.suffix ? `/${link.suffix}` : ""}`
        : `/app${link.suffix ? `/${link.suffix}` : ""}`),
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
    if (path.endsWith("/analytics")) return {
      title: "Analitik",
      button: <button className="date-picker w-[44px] h-[44px] rounded-full bg-gray-300 grid place-items-center">
        <SiFilterList className="text-2xl"/>
      </button>
    };
    if (path.endsWith("/history")) return {title: "Riwayat"};
    if (path.endsWith("/scan")) return {title: "Scan Struk"};
    if (path.endsWith("/manual")) return {title: "Input Manual"};
    if (path.endsWith("/chat")) return {title: "Chatbot Insight"};
    if (path.endsWith("/budget")) return {title: "Anggaran"};
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

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main">
        Lompat ke konten utama
      </a>
      <header className="topbar px-3 pt-4">
        <div className="topbar-brand">
          <p className="topbar-title font-bold text-2xl text-(--color-primary)">
            {topBarElement.title}
          </p>
        </div>
        {topBarElement.button}
      </header>
      <main id="main" tabIndex={-1} className="page-content">
        <Outlet />
      </main>
      <nav className="bottom-nav bg-white px-3" aria-label="Navigasi utama">
        {linksWithPaths.map((link) => (
          <NavLink
            key={link.label}
            to={link.to}
            end={link.end ?? link.suffix === ""}
            aria-label={link.label === "Scan" ? "Scan struk" : undefined}
            className={({ isActive }) => {
              let active = isActive
              let isScan = link.label == "Scan"
              let gaya = ""

              if(active) {
                gaya = "nav-item gap-1 active "
              } else {
                gaya = "nav-item gap-1 "
              }

              if(!isScan) {
                gaya += "pt-3 pb-5"
              } else {
                gaya += "outline-10 outline-white rounded-full mb-8"
              }

              return gaya
            }}
            
          >
              {({isActive}) => (
                <>
                  <span
                    className={link.label == "Scan" ? "text-xl bg-(--color-primary) p-4 text-white" : "text-xl "}
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
    </div>
  );
}
