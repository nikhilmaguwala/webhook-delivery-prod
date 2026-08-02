import { auditLogs } from "@webhook-delivery/db";
import type { Database } from "@webhook-delivery/db";

type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "replay"
  | "api_key_created"
  | "api_key_revoked";

export async function logAudit(
  db: Database,
  params: {
    organizationId: string;
    userId?: string;
    action: AuditAction;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }
) {
  await db.insert(auditLogs).values({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}
