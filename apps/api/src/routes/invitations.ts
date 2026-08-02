import {
  organizationMembers,
  organizations,
  projectInvitations,
  projectMembers,
  projects,
  users,
} from "@webhook-delivery/db";
import { hashPassword, slugify } from "@webhook-delivery/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createJwt, sessionAuth, verifyJwt } from "../middleware/auth";
import { getClientIp } from "../middleware/db";
import { logAudit } from "../services/audit";
import { sendInviteOtpEmail } from "../services/email";
import {
  clearInviteEmailVerification,
  createInviteVerificationToken,
  generateOtp,
  getStoredInviteOtp,
  isInviteVerificationSatisfied,
  storeInviteOtp,
  verifyInviteOtp,
} from "../services/invite-otp";
import { canManageProject, canManageProjectMembers, getProjectAccess, getProjectPermissions, isProjectCreator } from "../services/project-access";
import { getRedis } from "../services/redis";
import type { AppEnv } from "../types";

const invitations = new Hono<AppEnv>();

function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function inviteBaseUrl(c: { req: { header: (n: string) => string | undefined } }) {
  return c.req.header("origin") || "https://webhook-master-nikhil.vercel.app";
}

invitations.get("/invitations/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  const [invite] = await db
    .select({
      email: projectInvitations.email,
      role: projectInvitations.role,
      expiresAt: projectInvitations.expiresAt,
      acceptedAt: projectInvitations.acceptedAt,
      projectId: projects.id,
      projectName: projects.name,
      projectDescription: projects.description,
    })
    .from(projectInvitations)
    .innerJoin(projects, eq(projectInvitations.projectId, projects.id))
    .where(eq(projectInvitations.token, token))
    .limit(1);

  if (!invite) return c.json({ error: "Invitation not found" }, 404);

  const [existingUser] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);

  return c.json({
    invitation: {
      email: invite.email,
      role: invite.role,
      expired: invite.expiresAt < new Date(),
      accepted: !!invite.acceptedAt,
      has_account: !!existingUser?.passwordHash,
      project: {
        id: invite.projectId,
        name: invite.projectName,
        description: invite.projectDescription,
      },
    },
  });
});

invitations.post("/invitations/:token/send-otp", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");
  const redis = getRedis(c.env);
  const body = await c.req.json<{ resend?: boolean }>().catch(() => ({}) as { resend?: boolean });

  const [invite] = await db
    .select({
      email: projectInvitations.email,
      expiresAt: projectInvitations.expiresAt,
      acceptedAt: projectInvitations.acceptedAt,
      projectName: projects.name,
    })
    .from(projectInvitations)
    .innerJoin(projects, eq(projectInvitations.projectId, projects.id))
    .where(eq(projectInvitations.token, token))
    .limit(1);

  if (!invite) return c.json({ error: "Invitation not found" }, 404);
  if (invite.acceptedAt) return c.json({ error: "Invitation already accepted" }, 400);
  if (invite.expiresAt < new Date()) return c.json({ error: "Invitation expired" }, 400);

  const existingOtp = await getStoredInviteOtp(redis, token);
  const shouldGenerate = body.resend || !existingOtp;
  const otp = shouldGenerate ? generateOtp() : existingOtp;

  if (shouldGenerate) {
    await storeInviteOtp(redis, token, otp);
  } else {
    return c.json({
      message: "Verification code already sent. Check your email or tap Resend for a new code.",
      email: invite.email,
      delivered: true,
      provider: "cached",
    });
  }

  try {
    const result = await sendInviteOtpEmail(c.env, {
      to: invite.email,
      otp,
      projectName: invite.projectName,
    });

    return c.json({
      message: body.resend
        ? "A new verification code was sent to your email"
        : result.message,
      email: invite.email,
      delivered: result.delivered,
      provider: result.provider,
      resent: !!body.resend,
      ...(result.fallback_otp ? { fallback_otp: result.fallback_otp } : {}),
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to send verification email",
        fallback_otp: otp,
        delivered: false,
        message: "Use the verification code shown below.",
      },
      200
    );
  }
});

invitations.post("/invitations/:token/verify-otp", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");
  const redis = getRedis(c.env);
  const body = await c.req.json<{ otp?: string }>().catch(() => ({}) as { otp?: string });

  if (!body.otp) return c.json({ error: "otp is required" }, 400);

  const [invite] = await db
    .select({
      email: projectInvitations.email,
      expiresAt: projectInvitations.expiresAt,
      acceptedAt: projectInvitations.acceptedAt,
    })
    .from(projectInvitations)
    .where(eq(projectInvitations.token, token))
    .limit(1);

  if (!invite) return c.json({ error: "Invitation not found" }, 404);
  if (invite.acceptedAt) return c.json({ error: "Invitation already accepted" }, 400);
  if (invite.expiresAt < new Date()) return c.json({ error: "Invitation expired" }, 400);

  const valid = await verifyInviteOtp(redis, token, body.otp);
  if (!valid) return c.json({ error: "Invalid or expired verification code" }, 400);

  const verification_token = await createInviteVerificationToken(token, invite.email, c.env.JWT_SECRET);

  return c.json({ verified: true, verification_token, message: "Email verified" });
});

invitations.post("/invitations/:token/accept", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");
  const body = await c.req.json<{ name?: string; password?: string; verification_token?: string }>().catch(
    () => ({}) as { name?: string; password?: string; verification_token?: string }
  );

  const [invite] = await db
    .select()
    .from(projectInvitations)
    .where(eq(projectInvitations.token, token))
    .limit(1);

  if (!invite) return c.json({ error: "Invitation not found" }, 404);
  if (invite.acceptedAt) return c.json({ error: "Invitation already accepted" }, 400);
  if (invite.expiresAt < new Date()) return c.json({ error: "Invitation expired" }, 400);

  const redis = getRedis(c.env);
  const emailVerified = await isInviteVerificationSatisfied(
    redis,
    token,
    invite.email,
    c.env.JWT_SECRET,
    body.verification_token
  );
  if (!emailVerified) {
    return c.json({ error: "Email not verified. Complete OTP verification first." }, 403);
  }

  const authHeader = c.req.header("Authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const payload = await verifyJwt(authHeader.slice(7), c.env.JWT_SECRET);
    if (payload) userId = payload.userId;
  }

  if (!userId) {
    if (!body.name || !body.password) {
      return c.json({ error: "name and password required to create account" }, 400);
    }
    if (body.password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const [existing] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);
    if (existing) {
      if (!existing.passwordHash) {
        const passwordHash = await hashPassword(body.password);
        await db
          .update(users)
          .set({ passwordHash, name: body.name || existing.name, updatedAt: new Date() })
          .where(eq(users.id, existing.id));
        userId = existing.id;
      } else {
        return c.json(
          {
            error:
              "An account with this email already exists. Sign in with that email, then open the invite link again.",
          },
          409
        );
      }
    } else {
      const passwordHash = await hashPassword(body.password);
      const [user] = await db
        .insert(users)
        .values({ email: invite.email, passwordHash, name: body.name })
        .returning();

      const orgName = `${body.name}'s Workspace`;
      const [org] = await db
        .insert(organizations)
        .values({ name: orgName, slug: slugify(orgName) + "-" + user.id.slice(0, 8) })
        .returning();

      await db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "owner",
      });

      userId = user.id;
    }
  } else {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return c.json(
        { error: "Signed-in email does not match this invitation. Use the invited email address." },
        403
      );
    }
  }

  const [existingMember] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, invite.projectId), eq(projectMembers.userId, userId)))
    .limit(1);

  if (!existingMember) {
    await db.insert(projectMembers).values({
      projectId: invite.projectId,
      userId,
      role: invite.role,
    });
  }

  await db
    .update(projectInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(projectInvitations.id, invite.id));

  await clearInviteEmailVerification(redis, token);

  const jwt = await createJwt(userId, c.env.JWT_SECRET);

  return c.json({
    token: jwt,
    project_id: invite.projectId,
    message: "Invitation accepted. Welcome to the project!",
  });
});

invitations.use("*", sessionAuth);

invitations.get("/projects/:projectId/access", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");

  const permissions = await getProjectPermissions(db, userId, projectId);
  if (!permissions) return c.json({ error: "Forbidden" }, 403);

  return c.json({
    access: permissions,
    roles: {
      creator: "Created this project. Full access. Cannot be removed.",
      admin: "Can manage endpoints, API keys, deliveries, and team members.",
      member: "View-only access to project data. Cannot change settings or invite others.",
    },
  });
});

invitations.get("/projects", async (c) => {
  const userId = c.get("userId")!;
  const db = c.get("db");

  const orgProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      description: projects.description,
      organizationId: projects.organizationId,
      createdAt: projects.createdAt,
      access: organizationMembers.role,
    })
    .from(projects)
    .innerJoin(organizationMembers, eq(projects.organizationId, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId));

  const sharedProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      description: projects.description,
      organizationId: projects.organizationId,
      createdAt: projects.createdAt,
      access: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId));

  const orgIds = new Set(orgProjects.map((p) => p.id));
  const merged = [
    ...orgProjects.map((p) => ({ ...p, shared: false })),
    ...sharedProjects.filter((p) => !orgIds.has(p.id)).map((p) => ({ ...p, shared: true })),
  ];

  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return c.json({ projects: merged });
});

invitations.post("/projects/:projectId/invitations", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const body = await c.req.json<{ email?: string; role?: string }>();

  if (!(await canManageProjectMembers(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (!body.email) return c.json({ error: "email is required" }, 400);

  const email = body.email.toLowerCase().trim();
  const role = body.role === "admin" ? "admin" : ("member" as const);

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    const access = await getProjectAccess(db, existingUser.id, projectId);
    if (access) return c.json({ error: "User already has access to this project" }, 409);
  }

  const [pending] = await db
    .select()
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.projectId, projectId),
        eq(projectInvitations.email, email),
        isNull(projectInvitations.acceptedAt)
      )
    )
    .limit(1);

  if (pending && pending.expiresAt > new Date()) {
    return c.json({
      invitation: {
        id: pending.id,
        email,
        token: pending.token,
        invite_url: `${inviteBaseUrl(c)}/invite/${pending.token}`,
      },
      message: "Invitation already pending",
    });
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invitation] = await db
    .insert(projectInvitations)
    .values({ projectId, email, token, role, invitedBy: userId, expiresAt })
    .returning();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project) {
    await logAudit(db, {
      organizationId: project.organizationId,
      userId,
      action: "project_invited",
      resourceType: "project_invitation",
      resourceId: invitation.id,
      metadata: { email, role },
      ipAddress: getClientIp(c),
    });
  }

  const inviteUrl = `${inviteBaseUrl(c)}/invite/${token}`;

  return c.json(
    {
      invitation: {
        id: invitation.id,
        email,
        token,
        invite_url: inviteUrl,
        expires_at: expiresAt.toISOString(),
      },
      message: "Copy the invite URL and send it to your teammate.",
    },
    201
  );
});

invitations.get("/projects/:projectId/members", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");

  const permissions = await getProjectPermissions(db, userId, projectId);
  if (!permissions) return c.json({ error: "Forbidden" }, 403);

  const [project] = await db
    .select({
      createdBy: projects.createdBy,
      organizationId: projects.organizationId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return c.json({ error: "Not found" }, 404);

  const invitedMembers = await db
    .select({
      id: projectMembers.id,
      role: projectMembers.role,
      joinedAt: projectMembers.createdAt,
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));

  const team: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    source: string;
    joinedAt: string;
    is_you: boolean;
    can_remove: boolean;
    can_change_role: boolean;
  }> = [];

  if (project.createdBy) {
    const [creator] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, project.createdBy))
      .limit(1);

    if (creator) {
      team.push({
        id: `creator-${creator.id}`,
        userId: creator.id,
        name: creator.name,
        email: creator.email,
        role: "creator",
        source: "creator",
        joinedAt: new Date(0).toISOString(),
        is_you: creator.id === userId,
        can_remove: false,
        can_change_role: false,
      });
    }
  }

  for (const member of invitedMembers) {
    if (member.userId === project.createdBy) continue;

    team.push({
      id: member.id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      role: member.role,
      source: "invitation",
      joinedAt: member.joinedAt.toISOString(),
      is_you: member.userId === userId,
      can_remove: permissions.can_manage_members && member.userId !== userId,
      can_change_role: permissions.can_manage_members && member.userId !== userId,
    });
  }

  team.sort((a, b) => {
    if (a.role === "creator") return -1;
    if (b.role === "creator") return 1;
    return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
  });

  const pending = await db
    .select({
      id: projectInvitations.id,
      email: projectInvitations.email,
      role: projectInvitations.role,
      token: projectInvitations.token,
      expiresAt: projectInvitations.expiresAt,
      createdAt: projectInvitations.createdAt,
    })
    .from(projectInvitations)
    .where(and(eq(projectInvitations.projectId, projectId), isNull(projectInvitations.acceptedAt)))
    .orderBy(desc(projectInvitations.createdAt));

  const base = inviteBaseUrl(c);

  return c.json({
    your_access: permissions,
    roles: {
      creator: "Created this project. Full access. Cannot be removed.",
      admin: "Can manage endpoints, API keys, deliveries, and team members.",
      member: "View-only access to project data. Cannot change settings or invite others.",
    },
    members: team,
    invitations: pending.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      invite_url: `${base}/invite/${inv.token}`,
      expired: inv.expiresAt < new Date(),
    })),
  });
});

invitations.patch("/projects/:projectId/members/:memberUserId", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const memberUserId = c.req.param("memberUserId");
  const db = c.get("db");
  const body = await c.req.json<{ role?: string }>();

  if (!(await canManageProjectMembers(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (await isProjectCreator(db, projectId, memberUserId)) {
    return c.json({ error: "Cannot change the project creator's role" }, 400);
  }

  const role = body.role === "admin" ? "admin" : body.role === "member" ? "member" : null;
  if (!role) return c.json({ error: "role must be admin or member" }, 400);

  const [member] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)))
    .limit(1);

  if (!member) return c.json({ error: "Member not found" }, 404);

  const [updated] = await db
    .update(projectMembers)
    .set({ role })
    .where(eq(projectMembers.id, member.id))
    .returning();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project) {
    await logAudit(db, {
      organizationId: project.organizationId,
      userId,
      action: "update",
      resourceType: "project_member",
      resourceId: member.id,
      metadata: { memberUserId, role },
      ipAddress: getClientIp(c),
    });
  }

  return c.json({ member: updated });
});

invitations.delete("/projects/:projectId/members/:memberUserId", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const memberUserId = c.req.param("memberUserId");
  const db = c.get("db");

  if (!(await canManageProjectMembers(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (await isProjectCreator(db, projectId, memberUserId)) {
    return c.json({ error: "Cannot remove the project creator" }, 400);
  }

  if (memberUserId === userId) {
    return c.json({ error: "You cannot remove your own access. Ask another admin." }, 400);
  }

  const [member] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)))
    .limit(1);

  if (!member) return c.json({ error: "Member not found" }, 404);

  await db.delete(projectMembers).where(eq(projectMembers.id, member.id));

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project) {
    await logAudit(db, {
      organizationId: project.organizationId,
      userId,
      action: "delete",
      resourceType: "project_member",
      resourceId: member.id,
      metadata: { memberUserId },
      ipAddress: getClientIp(c),
    });
  }

  return c.json({ success: true, message: "Project access removed" });
});

invitations.delete("/projects/:projectId/invitations/:invitationId", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const invitationId = c.req.param("invitationId");
  const db = c.get("db");

  if (!(await canManageProjectMembers(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .delete(projectInvitations)
    .where(and(eq(projectInvitations.id, invitationId), eq(projectInvitations.projectId, projectId)));

  return c.json({ success: true });
});

export default invitations;
