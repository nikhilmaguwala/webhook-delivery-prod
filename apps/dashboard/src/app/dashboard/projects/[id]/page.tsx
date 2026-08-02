"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CopyButton, CopyableBlock } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { PaginatedTable, type PaginationMeta, type SortOrder } from "@/components/PaginatedTable";
import {
  api,
  type Analytics,
  type Delivery,
  type Endpoint,
  type EventRecord,
  type Project,
  type ProjectAccessInfo,
  type ProjectInvitation,
  type ProjectTeamMember,
} from "@/lib/api";

type Tab = "overview" | "endpoints" | "deliveries" | "events" | "api-keys" | "members";

type ListQueryState = {
  page: number;
  page_size: number;
  sort: string;
  order: SortOrder;
  status?: string;
  event_type?: string;
};

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    healthy: "badge-success",
    delivered: "badge-success",
    enabled: "badge-success",
    degraded: "badge-warning",
    pending: "badge-neutral",
    delivering: "badge-neutral",
    unhealthy: "badge-danger",
    failed: "badge-danger",
    dead_lettered: "badge-danger",
    disabled: "badge-danger",
  };
  return <span className={`badge ${map[status] || "badge-neutral"}`}>{status}</span>;
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    creator: "role-badge role-creator",
    admin: "role-badge role-admin",
    member: "role-badge role-member",
  };
  const labels: Record<string, string> = {
    creator: "Creator",
    admin: "Admin",
    member: "Member",
  };
  const icons: Record<string, string> = {
    creator: "verified",
    admin: "admin_panel_settings",
    member: "person",
  };
  return (
    <span className={map[role] || "role-badge role-member"}>
      <Icon name={icons[role] || "person"} size={14} />
      {labels[role] || role}
    </span>
  );
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [tab, setTab] = useState<Tab>("overview");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveryPagination, setDeliveryPagination] = useState<PaginationMeta | null>(null);
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliveryQuery, setDeliveryQuery] = useState<ListQueryState>({
    page: 1,
    page_size: 25,
    sort: "created_at",
    order: "desc",
    status: "",
  });
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const debouncedDeliverySearch = useDebouncedValue(deliverySearch);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventPagination, setEventPagination] = useState<PaginationMeta | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [eventQuery, setEventQuery] = useState<ListQueryState>({
    page: 1,
    page_size: 25,
    sort: "created_at",
    order: "desc",
  });
  const [eventsLoading, setEventsLoading] = useState(false);
  const debouncedEventSearch = useDebouncedValue(eventSearch);
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; keyPrefix: string; createdAt: string; revokedAt: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [newEndpointSecret, setNewEndpointSecret] = useState<string | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const [deliveryDetail, setDeliveryDetail] = useState<Record<string, unknown> | null>(null);
  const [members, setMembers] = useState<ProjectTeamMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [roleHelp, setRoleHelp] = useState<Record<string, string>>({});
  const [access, setAccess] = useState<ProjectAccessInfo | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    api.getProjectAccess(projectId).then((data) => setAccess(data.access)).catch(() => {});
    api.listProjects().then(({ projects }) => {
      const found = projects.find((p) => p.id === projectId);
      if (found) setProject(found);
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    loadTabData();
  }, [projectId, tab]);

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    try {
      const data = await api.getDeliveries(projectId, {
        page: deliveryQuery.page,
        page_size: deliveryQuery.page_size,
        search: debouncedDeliverySearch || undefined,
        sort: deliveryQuery.sort,
        order: deliveryQuery.order,
        status: deliveryQuery.status || undefined,
        event_type: deliveryQuery.event_type || undefined,
      });
      setDeliveries(data.deliveries);
      setDeliveryPagination(data.pagination);
    } finally {
      setDeliveriesLoading(false);
    }
  }, [projectId, deliveryQuery, debouncedDeliverySearch]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const data = await api.getEvents(projectId, {
        page: eventQuery.page,
        page_size: eventQuery.page_size,
        search: debouncedEventSearch || undefined,
        sort: eventQuery.sort,
        order: eventQuery.order,
        event_type: eventQuery.event_type || undefined,
      });
      setEvents(data.events);
      setEventPagination(data.pagination);
    } finally {
      setEventsLoading(false);
    }
  }, [projectId, eventQuery, debouncedEventSearch]);

  useEffect(() => {
    if (tab === "deliveries") loadDeliveries();
  }, [tab, loadDeliveries]);

  useEffect(() => {
    if (tab === "events") loadEvents();
  }, [tab, loadEvents]);

  function handleDeliverySort(column: string) {
    setDeliveryQuery((q) => ({
      ...q,
      page: 1,
      sort: column,
      order: q.sort === column && q.order === "desc" ? "asc" : "desc",
    }));
  }

  function handleEventSort(column: string) {
    setEventQuery((q) => ({
      ...q,
      page: 1,
      sort: column,
      order: q.sort === column && q.order === "desc" ? "asc" : "desc",
    }));
  }

  const canManage = access?.can_manage ?? false;

  async function loadTabData() {
    if (tab === "deliveries" || tab === "events") return;
    setLoading(true);
    try {
      if (tab === "overview") {
        const data = await api.getAnalytics(projectId);
        setAnalytics(data);
      } else if (tab === "endpoints") {
        const { endpoints: eps } = await api.getEndpoints(projectId);
        setEndpoints(eps);
      } else if (tab === "api-keys") {
        const { api_keys } = await api.getApiKeys(projectId);
        setApiKeys(api_keys);
      } else if (tab === "members") {
        const data = await api.getProjectMembers(projectId);
        setMembers(data.members);
        setInvitations(data.invitations);
        setRoleHelp(data.roles);
        setAccess(data.your_access);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addEndpoint(e: React.FormEvent) {
    e.preventDefault();
    const { endpoint } = await api.createEndpoint(projectId, newEndpointUrl);
    if (endpoint.secret) setNewEndpointSecret(endpoint.secret);
    setNewEndpointUrl("");
    loadTabData();
  }

  async function toggleEndpoint(id: string, enabled: boolean) {
    await api.toggleEndpoint(id, !enabled);
    loadTabData();
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const { api_key } = await api.createApiKey(projectId, newKeyName);
    setNewKeyValue(api_key.key);
    setNewKeyName("");
    loadTabData();
  }

  async function viewDelivery(id: string) {
    setSelectedDelivery(id);
    const detail = await api.getDelivery(id);
    setDeliveryDetail(detail as unknown as Record<string, unknown>);
  }

  async function replayDelivery(id: string) {
    await api.replayDelivery(id);
    alert("Delivery replay queued");
    loadDeliveries();
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const { invitation } = await api.inviteToProject(projectId, inviteEmail, inviteRole);
      setInviteUrl(invitation.invite_url);
      setInviteEmail("");
      loadTabData();
    } finally {
      setInviting(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "dashboard" },
    { id: "endpoints", label: "Endpoints", icon: "hub" },
    { id: "deliveries", label: "Deliveries", icon: "local_shipping" },
    { id: "events", label: "Events", icon: "event" },
    { id: "api-keys", label: "API Keys", icon: "key" },
    { id: "members", label: "Members", icon: "group" },
  ];

  return (
    <>
      <div className="project-header-bar">
        <div className="project-header-top">
          <div className="project-header-title">
            <Link href="/dashboard" className="back-link" aria-label="Back to projects">
              <Icon name="arrow_back" size={20} />
            </Link>
            <div>
              <h1>{project?.name || "Project"}</h1>
              {project?.slug && <span className="mono project-slug" style={{ fontSize: 13 }}>{project.slug}</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {access && <RoleBadge role={access.role} />}
            <span className="mono" style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{projectId.slice(0, 8)}…</span>
            <CopyButton text={projectId} label="Copy ID" />
          </div>
        </div>

        <div className="project-tabs-wrap">
          <div className="tabs tabs-in-header">
            {tabs.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={18} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!canManage && access && (
        <div className="callout callout-info" style={{ marginBottom: 20 }}>
          <strong>View-only access.</strong> You are a <RoleBadge role={access.role} /> on this project. Contact an admin to change settings or invite others.
        </div>
      )}

      {loading && tab !== "deliveries" && tab !== "events" ? (
        <div className="loading-inline">
          <div className="spinner" />
          <span>Loading...</span>
        </div>
      ) : (
        <>
          {tab === "overview" && analytics && (
            <>
              <div className="grid-4" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                  <div className="stat-value">{analytics.summary.total}</div>
                  <div className="stat-label">Total Deliveries</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: "var(--success)" }}>{analytics.summary.success_rate}%</div>
                  <div className="stat-label">Success Rate</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{analytics.summary.avg_response_time_ms}ms</div>
                  <div className="stat-label">Avg Response Time</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: "var(--warning)" }}>{analytics.summary.pending}</div>
                  <div className="stat-label">Pending</div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 16 }}>Endpoint Health</h3>
                {analytics.endpoint_health.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>No endpoints configured</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>URL</th>
                        <th>Status</th>
                        <th>Avg Response</th>
                        <th>Failures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.endpoint_health.map((ep) => (
                        <tr key={ep.id} className={ep.enabled === false ? "row-disabled" : undefined}>
                          <td className="mono" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{ep.url}</td>
                          <td><StatusBadge status={ep.enabled === false ? "disabled" : ep.status} /></td>
                          <td>{ep.avgResponseTimeMs ? `${ep.avgResponseTimeMs}ms` : "—"}</td>
                          <td>{ep.consecutiveFailures}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {tab === "endpoints" && (
            <div className="card">
              {newEndpointSecret && (
                <div className="secret-banner">
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>Save your signing secret — it won&apos;t be shown again:</p>
                  <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>
                    Use this on <strong>your server</strong> to verify incoming webhooks. It is not used when sending events to our API — that uses your API key.
                  </p>
                  <CopyableBlock value={newEndpointSecret} />
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setNewEndpointSecret(null)}>
                    <Icon name="close" size={16} />
                    Dismiss
                  </button>
                </div>
              )}
              <form onSubmit={addEndpoint} className="form-row">
                <input className="input" placeholder="https://your-app.com/webhooks" value={newEndpointUrl} onChange={(e) => setNewEndpointUrl(e.target.value)} required disabled={!canManage} />
                {canManage && (
                  <button className="btn btn-primary" type="submit">
                    <Icon name="add" size={18} />
                    Add Endpoint
                  </button>
                )}
              </form>
              <table className="table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Enabled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((ep) => (
                    <tr key={ep.id} className={ep.enabled ? undefined : "row-disabled"}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ep.url}</span>
                          <CopyButton text={ep.url} label="Copy" />
                        </div>
                      </td>
                      <td><StatusBadge status={ep.enabled ? ep.status : "disabled"} /></td>
                      <td>
                        {ep.enabled ? (
                          <span style={{ color: "var(--success)" }}>Enabled</span>
                        ) : (
                          <span className="text-danger">Disabled</span>
                        )}
                      </td>
                      <td>
                        {canManage ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleEndpoint(ep.id, ep.enabled)}>
                            <Icon name={ep.enabled ? "pause_circle" : "play_circle"} size={16} />
                            {ep.enabled ? "Disable" : "Enable"}
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "deliveries" && (
            <div className="card">
              <PaginatedTable
                columns={[
                  {
                    id: "event_type",
                    label: "Event",
                    sortable: true,
                    render: (d) => <span className="mono">{d.eventType}</span>,
                  },
                  {
                    id: "endpoint_url",
                    label: "Endpoint",
                    sortable: true,
                    className: "mono",
                    render: (d) => (
                      <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                        {d.endpointUrl}
                      </span>
                    ),
                  },
                  {
                    id: "status",
                    label: "Status",
                    sortable: true,
                    render: (d) => <StatusBadge status={d.status} />,
                  },
                  {
                    id: "attempt_count",
                    label: "Attempts",
                    sortable: true,
                    render: (d) => d.attemptCount,
                  },
                  {
                    id: "last_response_status",
                    label: "Response",
                    sortable: true,
                    render: (d) => d.lastResponseStatus ?? "—",
                  },
                  {
                    id: "last_response_time_ms",
                    label: "Time",
                    sortable: true,
                    render: (d) => (d.lastResponseTimeMs ? `${d.lastResponseTimeMs}ms` : "—"),
                  },
                  {
                    id: "actions",
                    label: "Actions",
                    render: (d) => (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => viewDelivery(d.id)}>
                          <Icon name="search" size={16} />
                          Inspect
                        </button>
                        {canManage && (
                          <button className="btn btn-secondary btn-sm" onClick={() => replayDelivery(d.id)}>
                            <Icon name="replay" size={16} />
                            Replay
                          </button>
                        )}
                      </div>
                    ),
                  },
                ]}
                rows={deliveries}
                rowKey={(d) => d.id}
                pagination={deliveryPagination}
                loading={deliveriesLoading}
                emptyTitle="No deliveries found"
                emptyDescription={
                  deliverySearch || deliveryQuery.status
                    ? "Try adjusting your search or filters."
                    : "Deliveries appear here when events are sent to your endpoints."
                }
                searchValue={deliverySearch}
                searchPlaceholder="Search event type, endpoint, ID, error…"
                onSearchChange={(value) => {
                  setDeliverySearch(value);
                  setDeliveryQuery((q) => ({ ...q, page: 1 }));
                }}
                sort={deliveryQuery.sort}
                order={deliveryQuery.order}
                onSortChange={handleDeliverySort}
                onPageChange={(page) => setDeliveryQuery((q) => ({ ...q, page }))}
                pageSize={deliveryQuery.page_size}
                onPageSizeChange={(page_size) => setDeliveryQuery((q) => ({ ...q, page: 1, page_size }))}
                filterLabel="Status"
                filterValue={deliveryQuery.status || ""}
                filterOptions={[
                  { value: "", label: "All statuses" },
                  { value: "pending", label: "Pending" },
                  { value: "delivering", label: "Delivering" },
                  { value: "delivered", label: "Delivered" },
                  { value: "failed", label: "Failed" },
                  { value: "dead_lettered", label: "Dead lettered" },
                ]}
                onFilterChange={(status) => setDeliveryQuery((q) => ({ ...q, page: 1, status }))}
              />

              {selectedDelivery && deliveryDetail && (
                <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
                  <div className="code-block-header">
                    <h3>Delivery Detail</h3>
                    <CopyButton text={JSON.stringify(deliveryDetail, null, 2)} label="Copy JSON" />
                  </div>
                  <div className="code-block">{JSON.stringify(deliveryDetail, null, 2)}</div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => { setSelectedDelivery(null); setDeliveryDetail(null); }}>
                    <Icon name="close" size={16} />
                    Close
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "events" && (
            <div className="card">
              {!eventsLoading && eventPagination?.total === 0 && !eventSearch ? (
                <div className="empty-state" style={{ padding: "40px 16px" }}>
                  <div className="empty-icon">
                    <Icon name="event" size={48} />
                  </div>
                  <h3 style={{ marginBottom: 8 }}>No events yet</h3>
                  <p style={{ color: "var(--on-surface-variant)", fontSize: 14, maxWidth: 480, margin: "0 auto 16px" }}>
                    Send an event with your API key. Events appear here even if you have no endpoints configured.
                  </p>
                  <div className="code-block" style={{ textAlign: "left", maxWidth: 560, margin: "0 auto" }}>
                    {`curl -X POST ${process.env.NEXT_PUBLIC_API_URL || "https://webhook-delivery-api.nikhilkmaguwala.workers.dev"}/v1/ingest/events \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"event_type":"test.event","payload":{"hello":"world"}}'`}
                  </div>
                </div>
              ) : (
                <PaginatedTable
                  columns={[
                    {
                      id: "event_type",
                      label: "Type",
                      sortable: true,
                      render: (ev) => ev.eventType,
                    },
                    {
                      id: "id",
                      label: "ID",
                      sortable: true,
                      render: (ev) => (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="mono" style={{ fontSize: 11 }}>{ev.id}</span>
                          <CopyButton text={ev.id} label="Copy" />
                        </div>
                      ),
                    },
                    {
                      id: "created_at",
                      label: "Created",
                      sortable: true,
                      render: (ev) => new Date(ev.createdAt).toLocaleString(),
                    },
                    {
                      id: "payload",
                      label: "Payload",
                      render: (ev) => (
                        <details>
                          <summary style={{ cursor: "pointer", fontSize: 13 }}>View payload</summary>
                          <div style={{ marginTop: 8 }}>
                            <div className="code-block-header">
                              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Payload</span>
                              <CopyButton text={JSON.stringify(ev.payload, null, 2)} label="Copy JSON" />
                            </div>
                            <div className="code-block">{JSON.stringify(ev.payload, null, 2)}</div>
                          </div>
                        </details>
                      ),
                    },
                  ]}
                  rows={events}
                  rowKey={(ev) => ev.id}
                  pagination={eventPagination}
                  loading={eventsLoading}
                  emptyTitle="No events found"
                  emptyDescription="Try adjusting your search."
                  searchValue={eventSearch}
                  searchPlaceholder="Search type, ID, idempotency key, payload…"
                  onSearchChange={(value) => {
                    setEventSearch(value);
                    setEventQuery((q) => ({ ...q, page: 1 }));
                  }}
                  sort={eventQuery.sort}
                  order={eventQuery.order}
                  onSortChange={handleEventSort}
                  onPageChange={(page) => setEventQuery((q) => ({ ...q, page }))}
                  pageSize={eventQuery.page_size}
                  onPageSizeChange={(page_size) => setEventQuery((q) => ({ ...q, page: 1, page_size }))}
                />
              )}
            </div>
          )}

          {tab === "api-keys" && (
            <div className="card">
              {newKeyValue && (
                <div className="secret-banner">
                  <p style={{ fontWeight: 600, marginBottom: 12 }}>Save your API key — it won&apos;t be shown again:</p>
                  <CopyableBlock value={newKeyValue} />
                  <CopyableBlock
                    label="Example curl command"
                    value={`curl -X POST ${process.env.NEXT_PUBLIC_API_URL || "https://webhook-delivery-api.nikhilkmaguwala.workers.dev"}/v1/ingest/events \\\n  -H "Authorization: Bearer ${newKeyValue}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event_type":"test.event","payload":{"hello":"world"}}'`}
                  />
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setNewKeyValue(null)}>
                    <Icon name="close" size={16} />
                    Dismiss
                  </button>
                </div>
              )}
              {canManage && (
                <form onSubmit={createKey} className="form-row">
                  <input className="input" placeholder="Key name (e.g. Production)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} required />
                  <button className="btn btn-primary" type="submit">
                    <Icon name="key" size={18} />
                    Create Key
                  </button>
                </form>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Prefix</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((key) => (
                    <tr key={key.id}>
                      <td>{key.name}</td>
                      <td className="mono">{key.keyPrefix}...</td>
                      <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                      <td>{key.revokedAt ? <span className="badge badge-danger">Revoked</span> : <span className="badge badge-success">Active</span>}</td>
                      <td>
                        {canManage && !key.revokedAt && (
                          <button className="btn btn-danger btn-sm" onClick={async () => { await api.revokeApiKey(key.id); loadTabData(); }}>
                            <Icon name="block" size={16} />
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "members" && (
            <div className="card">
              <div className="page-header" style={{ marginBottom: 20, padding: 0 }}>
                <div>
                  <h3 className="card-title" style={{ marginBottom: 4 }}>Team & roles</h3>
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                    The project creator is always an admin. Invited users can be <strong>Admin</strong> or <strong>Member</strong>.
                  </p>
                </div>
              </div>

              <div className="role-legend">
                {Object.entries(roleHelp).map(([role, description]) => (
                  <div key={role} className="role-legend-item">
                    <RoleBadge role={role} />
                    <span>{description}</span>
                  </div>
                ))}
              </div>

              {access?.can_manage_members && (
                <>
                  {inviteUrl && (
                    <div className="secret-banner">
                      <p style={{ fontWeight: 600, marginBottom: 8 }}>Copy this invite link and send it to your teammate:</p>
                      <CopyableBlock value={inviteUrl} />
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setInviteUrl(null)}>
                        <Icon name="close" size={16} />
                        Dismiss
                      </button>
                    </div>
                  )}

                  <form onSubmit={inviteMember} className="invite-form">
                    <input
                      className="input"
                      type="email"
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                    <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}>
                      <option value="member">Member — view only</option>
                      <option value="admin">Admin — full manage access</option>
                    </select>
                    <button className="btn btn-primary" type="submit" disabled={inviting}>
                      <Icon name="link" size={18} />
                      {inviting ? "Creating invite..." : "Create invite link"}
                    </button>
                  </form>
                </>
              )}

              <h4 style={{ marginBottom: 12 }}>People with access</h4>
              {members.length === 0 ? (
                <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>No members yet.</p>
              ) : (
                <div className="member-list" style={{ marginBottom: 24 }}>
                  {members.map((m) => (
                    <div key={m.id} className="member-row">
                      <div className="member-info">
                        <div className="member-name">
                          {m.name}
                          {m.is_you && (
                            <span className="badge badge-neutral" style={{ marginLeft: 8 }}>
                              <Icon name="account_circle" size={14} />
                              You
                            </span>
                          )}
                        </div>
                        <div className="member-email">{m.email}</div>
                        <div className="member-meta">
                          Joined {m.role === "creator" ? "as creator" : new Date(m.joinedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="member-actions">
                        {m.can_change_role ? (
                          <select
                            className="input input-sm"
                            value={m.role}
                            onChange={async (e) => {
                              await api.updateProjectMemberRole(projectId, m.userId, e.target.value as "admin" | "member");
                              loadTabData();
                            }}
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                        ) : (
                          <RoleBadge role={m.role} />
                        )}
                        {m.can_remove && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={async () => {
                              if (!confirm(`Remove ${m.name}'s access to this project?`)) return;
                              await api.removeProjectMember(projectId, m.userId);
                              loadTabData();
                            }}
                          >
                            <Icon name="person_remove" size={16} />
                            Remove access
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <h4 style={{ marginBottom: 12 }}>Pending invitations</h4>
              {invitations.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No pending invites.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Invite link</th>
                      {access?.can_manage_members && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td><RoleBadge role={inv.role} /></td>
                        <td>{inv.expired ? <span className="badge badge-danger">Expired</span> : <span className="badge badge-neutral">Pending</span>}</td>
                        <td>{!inv.expired && <CopyButton text={inv.invite_url} label="Copy link" />}</td>
                        {access?.can_manage_members && (
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={async () => {
                                await api.revokeProjectInvitation(projectId, inv.id);
                                loadTabData();
                              }}
                            >
                              <Icon name="block" size={16} />
                              Revoke
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
