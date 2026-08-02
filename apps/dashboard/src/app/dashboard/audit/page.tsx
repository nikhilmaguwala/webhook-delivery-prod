"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

export default function AuditPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org") || "";
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    api.getAuditLogs(orgId)
      .then((data) => setLogs(data.audit_logs))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="loading-inline">
        <div className="spinner" />
        <span>Loading audit logs...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Track security-sensitive actions across your organization.</p>
        </div>
      </div>

      <div className="card">
        {logs.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 16px" }}>
            <div className="empty-icon">
              <Icon name="history" size={48} />
            </div>
            <p style={{ color: "var(--on-surface-variant)" }}>No audit logs yet</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>IP</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id as string}>
                    <td><span className="badge badge-neutral">{log.action as string}</span></td>
                    <td>{log.resourceType as string} {log.resourceId ? `(${(log.resourceId as string).slice(0, 8)}...)` : ""}</td>
                    <td className="mono">{(log.ipAddress as string) || "—"}</td>
                    <td>{new Date(log.createdAt as string).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
