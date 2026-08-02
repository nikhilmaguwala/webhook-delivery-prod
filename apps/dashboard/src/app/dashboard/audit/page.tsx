"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

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

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading audit logs...</p>;

  return (
    <>
      <h1 className="page-title" style={{ marginBottom: 24 }}>Audit Logs</h1>
      <div className="card">
        {logs.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No audit logs yet</p>
        ) : (
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
        )}
      </div>
    </>
  );
}
