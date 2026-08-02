"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Organization, type User } from "@/lib/api";
import { AppNav } from "@/components/AppNav";
import { DashboardProvider } from "@/components/DashboardContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
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

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <DashboardProvider user={user} orgs={orgs}>
      <div className="app-shell">
        <AppNav />
        <main className="app-main">{children}</main>
      </div>
    </DashboardProvider>
  );
}
