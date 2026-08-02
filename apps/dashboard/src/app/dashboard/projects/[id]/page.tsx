"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type Analytics, type Delivery, type Endpoint } from "@/lib/api";

type Tab = "overview" | "endpoints" | "deliveries" | "events" | "api-keys";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    healthy: "badge-success",
    delivered: "badge-success",
    degraded: "badge-warning",
    pending: "badge-neutral",
    delivering: "badge-neutral",
    unhealthy: "badge-danger",
    failed: "badge-danger",
    dead_lettered: "badge-danger",
  };
  return <span className={`badge ${map[status] || "badge-neutral"}`}>{status}</span>;
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [tab, setTab] = useState<Tab>("overview");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [events, setEvents] = useState<Array<{ id: string; eventType: string; payload: Record<string, unknown>; createdAt: string }>>([]);
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; keyPrefix: string; createdAt: string; revokedAt: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const [deliveryDetail, setDeliveryDetail] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    loadTabData();
  }, [projectId, tab]);

  async function loadTabData() {
    setLoading(true);
    try {
      if (tab === "overview") {
        const data = await api.getAnalytics(projectId);
        setAnalytics(data);
      } else if (tab === "endpoints") {
        const { endpoints: eps } = await api.getEndpoints(projectId);
        setEndpoints(eps);
      } else if (tab === "deliveries") {
        const { deliveries: dels } = await api.getDeliveries(projectId);
        setDeliveries(dels);
      } else if (tab === "events") {
        const { events: evs } = await api.getEvents(projectId);
        setEvents(evs);
      } else if (tab === "api-keys") {
        const { api_keys } = await api.getApiKeys(projectId);
        setApiKeys(api_keys);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addEndpoint(e: React.FormEvent) {
    e.preventDefault();
    await api.createEndpoint(projectId, newEndpointUrl);
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
    loadTabData();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "endpoints", label: "Endpoints" },
    { id: "deliveries", label: "Deliveries" },
    { id: "events", label: "Events" },
    { id: "api-keys", label: "API Keys" },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard" style={{ fontSize: 14, color: "var(--text-muted)" }}>← Back to projects</Link>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
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
                        <tr key={ep.id}>
                          <td className="mono" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{ep.url}</td>
                          <td><StatusBadge status={ep.status} /></td>
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
              <form onSubmit={addEndpoint} style={{ marginBottom: 24, display: "flex", gap: 8 }}>
                <input className="input" placeholder="https://your-app.com/webhooks" value={newEndpointUrl} onChange={(e) => setNewEndpointUrl(e.target.value)} required style={{ flex: 1 }} />
                <button className="btn btn-primary" type="submit">Add Endpoint</button>
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
                    <tr key={ep.id}>
                      <td className="mono">{ep.url}</td>
                      <td><StatusBadge status={ep.status} /></td>
                      <td>{ep.enabled ? "Yes" : "No"}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleEndpoint(ep.id, ep.enabled)}>
                          {ep.enabled ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "deliveries" && (
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Endpoint</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Response</th>
                    <th>Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="mono">{d.eventType}</td>
                      <td className="mono" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{d.endpointUrl}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td>{d.attemptCount}</td>
                      <td>{d.lastResponseStatus ?? "—"}</td>
                      <td>{d.lastResponseTimeMs ? `${d.lastResponseTimeMs}ms` : "—"}</td>
                      <td style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => viewDelivery(d.id)}>Inspect</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => replayDelivery(d.id)}>Replay</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedDelivery && deliveryDetail && (
                <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
                  <h3 style={{ marginBottom: 16 }}>Delivery Detail</h3>
                  <div className="code-block">{JSON.stringify(deliveryDetail, null, 2)}</div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => { setSelectedDelivery(null); setDeliveryDetail(null); }}>Close</button>
                </div>
              )}
            </div>
          )}

          {tab === "events" && (
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>ID</th>
                    <th>Created</th>
                    <th>Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.eventType}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{ev.id}</td>
                      <td>{new Date(ev.createdAt).toLocaleString()}</td>
                      <td>
                        <details>
                          <summary style={{ cursor: "pointer", fontSize: 13 }}>View payload</summary>
                          <div className="code-block" style={{ marginTop: 8 }}>{JSON.stringify(ev.payload, null, 2)}</div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "api-keys" && (
            <div className="card">
              {newKeyValue && (
                <div style={{ background: "rgba(99, 102, 241, 0.1)", border: "1px solid var(--primary)", borderRadius: 8, padding: 16, marginBottom: 24 }}>
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>Save your API key — it won&apos;t be shown again:</p>
                  <code className="mono">{newKeyValue}</code>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, display: "block" }} onClick={() => setNewKeyValue(null)}>Dismiss</button>
                </div>
              )}
              <form onSubmit={createKey} style={{ marginBottom: 24, display: "flex", gap: 8 }}>
                <input className="input" placeholder="Key name (e.g. Production)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} required style={{ flex: 1 }} />
                <button className="btn btn-primary" type="submit">Create Key</button>
              </form>
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
                        {!key.revokedAt && (
                          <button className="btn btn-danger btn-sm" onClick={async () => { await api.revokeApiKey(key.id); loadTabData(); }}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
