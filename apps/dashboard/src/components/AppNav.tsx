"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { BrandLogo, Icon } from "./Icon";
import { useDashboard } from "./DashboardContext";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, orgId } = useDashboard();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: "Projects", icon: "folder_open", match: pathname === "/dashboard" },
    ...(orgId
      ? [{ href: `/dashboard/audit?org=${orgId}`, label: "Audit Logs", icon: "history", match: pathname.includes("/audit") }]
      : []),
  ];

  function logout() {
    api.setToken(null);
    router.replace("/login");
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-left">
          <Link href="/dashboard" className="app-brand" onClick={() => setMenuOpen(false)}>
            <BrandLogo />
            Webhook Delivery
          </Link>

          <nav className={`app-nav ${menuOpen ? "open" : ""}`}>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`app-nav-link ${link.match ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="app-header-actions">
          <span className="user-name hide-mobile">{user?.name}</span>
          <span className="header-divider" />
          <button type="button" className="btn btn-secondary btn-sm hide-mobile" onClick={logout}>
            <Icon name="logout" size={18} />
            Sign out
          </button>
          <button
            type="button"
            className="nav-toggle"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
