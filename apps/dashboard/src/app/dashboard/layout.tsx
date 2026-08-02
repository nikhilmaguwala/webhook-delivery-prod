"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api, type Organization, type User } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api.getToken()) {
      router.replace("/login");
      return;
    }

    api.me()
      .then((data) => {
        setUser(data.user);
        setOrgs(data.organizations);
      })
      .catch(() => {
        api.setToken(null);
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  function logout() {
    api.setToken(null);
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 80, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  const orgId = orgs[0]?.organizationId;

  return (
    <div className="container">
      <nav className="nav">
        <Link href="/dashboard" className="nav-brand">Webhook Delivery</Link>
        <div className="nav-links">
          <Link href="/dashboard" className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}>Projects</Link>
          {orgId && (
            <Link href={`/dashboard/audit?org=${orgId}`} className={`nav-link ${pathname.includes("/audit") ? "active" : ""}`}>Audit Logs</Link>
          )}
        </div>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{user?.name}</span>
        <button className="btn btn-secondary btn-sm" onClick={logout}>Sign out</button>
      </nav>
      {children}
    </div>
  );
}
