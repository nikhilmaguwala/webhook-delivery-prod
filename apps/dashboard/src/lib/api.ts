const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Organization {
  organizationId: string;
  role: string;
  orgName: string;
  orgSlug: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  organizationId: string;
  createdAt: string;
  access?: string;
  shared?: boolean;
}

export interface Endpoint {
  id: string;
  url: string;
  description: string | null;
  status: "healthy" | "degraded" | "unhealthy" | "disabled";
  enabled: boolean;
  consecutiveFailures: number;
  avgResponseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  secret?: string;
}

export interface Delivery {
  id: string;
  status: string;
  attemptCount: number;
  lastResponseStatus: number | null;
  lastResponseTimeMs: number | null;
  lastError: string | null;
  isReplay: boolean;
  deliveredAt: string | null;
  createdAt: string;
  eventType: string;
  eventId: string;
  endpointUrl: string;
  endpointId: string;
}

export interface Analytics {
  period_days: number;
  summary: {
    total: number;
    delivered: number;
    failed: number;
    pending: number;
    success_rate: number;
    avg_response_time_ms: number;
  };
  daily: Array<{
    date: string;
    total: number;
    delivered: number;
    failed: number;
    avg_response_time_ms: number;
  }>;
  endpoint_health: Endpoint[];
}

export interface ProjectTeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "creator" | "admin" | "member";
  source: string;
  joinedAt: string;
  is_you: boolean;
  can_remove: boolean;
  can_change_role: boolean;
}

export interface ProjectAccessInfo {
  role: "creator" | "admin" | "member";
  can_manage: boolean;
  can_manage_members: boolean;
  is_creator: boolean;
}

export interface ProjectInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invite_url: string;
  expired: boolean;
}

export interface InvitationPreview {
  email: string;
  role: string;
  expired: boolean;
  accepted: boolean;
  has_account: boolean;
  project: {
    id: string;
    name: string;
    description: string | null;
  };
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("token", token);
      else localStorage.removeItem("token");
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("token");
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (auth) {
      const token = this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed: ${res.status}`);
    }

    return data as T;
  }

  register(email: string, password: string, name: string, organizationName?: string) {
    return this.request<{ token: string; user: User; organization: { id: string; name: string; slug: string } }>(
      "/v1/auth/register",
      { method: "POST", body: JSON.stringify({ email, password, name, organization_name: organizationName }) },
      false
    );
  }

  login(email: string, password: string) {
    return this.request<{ token: string; user: User }>(
      "/v1/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false
    );
  }

  me() {
    return this.request<{ user: User; organizations: Organization[] }>("/v1/auth/me");
  }

  listProjects() {
    return this.request<{ projects: Project[] }>("/v1/projects");
  }

  getProjects(orgId: string) {
    return this.request<{ projects: Project[] }>(`/v1/organizations/${orgId}/projects`);
  }

  createProject(orgId: string, name: string, description?: string) {
    return this.request<{ project: Project }>(`/v1/organizations/${orgId}/projects`, {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  }

  getInvitation(token: string) {
    return this.request<{ invitation: InvitationPreview }>(`/v1/invitations/${token}`, {}, false);
  }

  sendInviteOtp(token: string, options?: { resend?: boolean }) {
    return this.request<{
      message: string;
      email: string;
      delivered?: boolean;
      provider?: string;
      fallback_otp?: string;
      resent?: boolean;
    }>(`/v1/invitations/${token}/send-otp`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }, false);
  }

  verifyInviteOtp(token: string, otp: string) {
    return this.request<{ verified: boolean; verification_token: string; message: string }>(
      `/v1/invitations/${token}/verify-otp`,
      { method: "POST", body: JSON.stringify({ otp }) },
      false
    );
  }

  acceptInvitation(
    token: string,
    body?: { name?: string; password?: string; verification_token?: string }
  ) {
    return this.request<{ token: string; project_id: string; message: string }>(
      `/v1/invitations/${token}/accept`,
      { method: "POST", body: JSON.stringify(body ?? {}) },
      false
    );
  }

  inviteToProject(projectId: string, email: string, role: "admin" | "member" = "member") {
    return this.request<{
      invitation: { id: string; email: string; token: string; invite_url: string; expires_at?: string };
      message: string;
    }>(`/v1/projects/${projectId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  }

  getProjectAccess(projectId: string) {
    return this.request<{
      access: ProjectAccessInfo;
      roles: Record<string, string>;
    }>(`/v1/projects/${projectId}/access`);
  }

  getProjectMembers(projectId: string) {
    return this.request<{
      your_access: ProjectAccessInfo;
      roles: Record<string, string>;
      members: ProjectTeamMember[];
      invitations: ProjectInvitation[];
    }>(`/v1/projects/${projectId}/members`);
  }

  updateProjectMemberRole(projectId: string, memberUserId: string, role: "admin" | "member") {
    return this.request<{ member: { role: string } }>(`/v1/projects/${projectId}/members/${memberUserId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  }

  removeProjectMember(projectId: string, memberUserId: string) {
    return this.request<{ success: boolean; message: string }>(
      `/v1/projects/${projectId}/members/${memberUserId}`,
      { method: "DELETE" }
    );
  }

  revokeProjectInvitation(projectId: string, invitationId: string) {
    return this.request<{ success: boolean }>(
      `/v1/projects/${projectId}/invitations/${invitationId}`,
      { method: "DELETE" }
    );
  }

  getEndpoints(projectId: string) {
    return this.request<{ endpoints: Endpoint[] }>(`/v1/projects/${projectId}/endpoints`);
  }

  createEndpoint(projectId: string, url: string, description?: string) {
    return this.request<{ endpoint: Endpoint }>(`/v1/projects/${projectId}/endpoints`, {
      method: "POST",
      body: JSON.stringify({ url, description }),
    });
  }

  toggleEndpoint(endpointId: string, enabled: boolean) {
    return this.request<{ endpoint: Endpoint }>(`/v1/endpoints/${endpointId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  }

  getApiKeys(projectId: string) {
    return this.request<{ api_keys: Array<{ id: string; name: string; keyPrefix: string; createdAt: string; revokedAt: string | null }> }>(
      `/v1/projects/${projectId}/api-keys`
    );
  }

  createApiKey(projectId: string, name: string) {
    return this.request<{ api_key: { id: string; name: string; key: string }; message: string }>(
      `/v1/projects/${projectId}/api-keys`,
      { method: "POST", body: JSON.stringify({ name }) }
    );
  }

  revokeApiKey(keyId: string) {
    return this.request<{ success: boolean }>(`/v1/api-keys/${keyId}`, { method: "DELETE" });
  }

  getDeliveries(projectId: string, status?: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    return this.request<{ deliveries: Delivery[] }>(`/v1/projects/${projectId}/deliveries?${params}`);
  }

  getDelivery(deliveryId: string) {
    return this.request<{
      delivery: Record<string, unknown>;
      event: { id: string; event_type: string; payload: Record<string, unknown>; metadata: Record<string, unknown> | null; created_at: string };
      endpoint: { id: string; url: string; status: string };
      attempts: Array<Record<string, unknown>>;
      dead_letter: Record<string, unknown> | null;
    }>(`/v1/deliveries/${deliveryId}`);
  }

  replayDelivery(deliveryId: string) {
    return this.request<{ success: boolean }>(`/v1/deliveries/${deliveryId}/replay`, { method: "POST" });
  }

  getAnalytics(projectId: string, days = 7) {
    return this.request<Analytics>(`/v1/projects/${projectId}/analytics?days=${days}`);
  }

  getAuditLogs(orgId: string) {
    return this.request<{ audit_logs: Array<Record<string, unknown>> }>(`/v1/organizations/${orgId}/audit-logs`);
  }

  getEvents(projectId: string) {
    return this.request<{ events: Array<{ id: string; eventType: string; payload: Record<string, unknown>; createdAt: string }> }>(
      `/v1/projects/${projectId}/events`
    );
  }
}

export const api = new ApiClient();
