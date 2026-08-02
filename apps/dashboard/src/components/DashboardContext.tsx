"use client";

import { createContext, useContext } from "react";
import type { Organization, User } from "@/lib/api";

interface DashboardContextValue {
  user: User | null;
  orgs: Organization[];
  orgId: string | null;
  canCreateProject: boolean;
}

const DashboardContext = createContext<DashboardContextValue>({
  user: null,
  orgs: [],
  orgId: null,
  canCreateProject: false,
});

export function DashboardProvider({
  user,
  orgs,
  children,
}: {
  user: User | null;
  orgs: Organization[];
  children: React.ReactNode;
}) {
  const org = orgs[0];
  const canCreateProject = org?.role === "owner" || org?.role === "admin";

  return (
    <DashboardContext.Provider
      value={{
        user,
        orgs,
        orgId: org?.organizationId ?? null,
        canCreateProject,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
