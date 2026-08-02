import { organizationMembers, organizations, users } from "@webhook-delivery/db";
import { hashPassword, slugify, verifyPassword } from "@webhook-delivery/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createJwt } from "../middleware/auth";
import { getClientIp } from "../middleware/db";
import { logAudit } from "../services/audit";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

auth.post("/register", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    email?: string;
    password?: string;
    name?: string;
    organization_name?: string;
  }>();

  if (!body.email || !body.password || !body.name) {
    return c.json({ error: "email, password, and name are required" }, 400);
  }

  if (body.password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({ email: body.email, passwordHash, name: body.name })
    .returning();

  const orgName = body.organization_name || `${body.name}'s Organization`;
  const [org] = await db
    .insert(organizations)
    .values({ name: orgName, slug: slugify(orgName) + "-" + user.id.slice(0, 8) })
    .returning();

  await db.insert(organizationMembers).values({
    organizationId: org.id,
    userId: user.id,
    role: "owner",
  });

  await logAudit(db, {
    organizationId: org.id,
    userId: user.id,
    action: "create",
    resourceType: "user",
    resourceId: user.id,
    ipAddress: getClientIp(c),
    userAgent: c.req.header("user-agent"),
  });

  const token = await createJwt(user.id, c.env.JWT_SECRET);

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
    organization: { id: org.id, name: org.name, slug: org.slug },
  }, 201);
});

auth.post("/login", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{ email?: string; password?: string }>();

  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);

  if (membership) {
    await logAudit(db, {
      organizationId: membership.organizationId,
      userId: user.id,
      action: "login",
      resourceType: "session",
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent"),
    });
  }

  const token = await createJwt(user.id, c.env.JWT_SECRET);

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

auth.get("/me", async (c) => {
  const userId = c.get("userId")!;
  const db = c.get("db");

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const memberships = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId));

  return c.json({ user, organizations: memberships });
});

export default auth;
