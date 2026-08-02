"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = api.getToken();
    router.replace(token ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div className="container" style={{ paddingTop: 120, textAlign: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>Loading...</p>
    </div>
  );
}
