import { organizationMembers, organizations, users } from "@webhook-delivery/db";
import { hashPassword, slugify, verifyPassword } from "@webhook-delivery/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createJwt } from "../middleware/auth";
import { getClientIp } from "../middleware/db";
import { logAudit } from "../services/audit";
import { sendPasswordResetOtpEmail } from "../services/email";
import {
  createPasswordResetToken,
  generateOtp,
  getStoredPasswordResetOtp,
  storePasswordResetOtp,
  verifyPasswordResetOtp,
  verifyPasswordResetToken,
} from "../services/password-reset-otp";
import { getRedis } from "../services/redis";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailMatches(column: typeof users.email, email: string) {
  return sql`lower(${column}) = ${normalizeEmail(email)}`;
}

const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, we sent a password reset code.";

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

  const email = normalizeEmail(body.email);

  const [existing] = await db.select().from(users).where(emailMatches(users.email, email)).limit(1);
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name: body.name })
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

  const [user] = await db
    .select()
    .from(users)
    .where(emailMatches(users.email, body.email))
    .limit(1);

  if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
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

auth.post("/forgot-password", async (c) => {
  const db = c.get("db");
  const redis = getRedis(c.env);
  const body = await c.req.json<{ email?: string; resend?: boolean }>().catch(
    () => ({}) as { email?: string; resend?: boolean }
  );

  if (!body.email) {
    return c.json({ error: "email is required" }, 400);
  }

  const email = normalizeEmail(body.email);

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(emailMatches(users.email, email))
    .limit(1);

  if (!user) {
    return c.json({ message: GENERIC_RESET_MESSAGE, email });
  }

  const existingOtp = await getStoredPasswordResetOtp(redis, email);
  const shouldGenerate = body.resend || !existingOtp;
  const otp = shouldGenerate ? generateOtp() : existingOtp;

  if (!shouldGenerate) {
    return c.json({
      message: "A reset code was already sent. Check your email or tap Resend for a new code.",
      email: user.email,
      delivered: true,
      provider: "cached",
    });
  }

  await storePasswordResetOtp(redis, email, otp!);

  try {
    const result = await sendPasswordResetOtpEmail(c.env, { to: user.email, otp: otp! });
    return c.json({
      message: result.message || GENERIC_RESET_MESSAGE,
      email: user.email,
      delivered: result.delivered,
      provider: result.provider,
      ...(result.fallback_otp ? { fallback_otp: result.fallback_otp } : {}),
    });
  } catch (error) {
    console.error("Password reset email failed:", error);
    return c.json({
      message: "Email could not be delivered. Use the code shown below.",
      email: user.email,
      delivered: false,
      fallback_otp: otp,
    });
  }
});

auth.post("/verify-reset-otp", async (c) => {
  const db = c.get("db");
  const redis = getRedis(c.env);
  const body = await c.req.json<{ email?: string; otp?: string }>();

  if (!body.email || !body.otp) {
    return c.json({ error: "email and otp are required" }, 400);
  }

  const email = normalizeEmail(body.email);

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(emailMatches(users.email, email))
    .limit(1);

  if (!user) {
    return c.json({ error: "Invalid or expired code" }, 400);
  }

  const valid = await verifyPasswordResetOtp(redis, email, body.otp);
  if (!valid) {
    return c.json({ error: "Invalid or expired code" }, 400);
  }

  const resetToken = await createPasswordResetToken(email, c.env.JWT_SECRET);

  return c.json({
    message: "Code verified. Set your new password.",
    email: user.email,
    reset_token: resetToken,
  });
});

auth.post("/reset-password", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{ email?: string; reset_token?: string; password?: string }>();

  if (!body.email || !body.reset_token || !body.password) {
    return c.json({ error: "email, reset_token, and password are required" }, 400);
  }

  if (body.password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const email = normalizeEmail(body.email);

  const validToken = await verifyPasswordResetToken(body.reset_token, email, c.env.JWT_SECRET);
  if (!validToken) {
    return c.json({ error: "Invalid or expired reset session" }, 400);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(emailMatches(users.email, email))
    .limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const passwordHash = await hashPassword(body.password);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));

  const token = await createJwt(user.id, c.env.JWT_SECRET);

  return c.json({
    message: "Password updated successfully",
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
