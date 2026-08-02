import type { Redis } from "@upstash/redis";
import { redisValueAsString } from "./redis-coerce";

const OTP_TTL_SECONDS = 600;
const VERIFIED_TTL_SECONDS = 1800;

const OTP_PREFIX = "code:";
const VERIFIED_PREFIX = "verified:";

function otpKey(inviteToken: string) {
  return `invite_otp:${inviteToken}`;
}

function verifiedKey(inviteToken: string) {
  return `invite_verified:${inviteToken}`;
}

/** Normalize OTP for comparison — Redis may return numbers and drop leading zeros. */
export function normalizeOtp(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.padStart(6, "0").slice(-6);
}

export function generateOtp(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, "0");
}

export async function storeInviteOtp(redis: Redis, inviteToken: string, otp: string) {
  await redis.set(otpKey(inviteToken), `${OTP_PREFIX}${normalizeOtp(otp)}`, { ex: OTP_TTL_SECONDS });
}

export async function getStoredInviteOtp(redis: Redis, inviteToken: string): Promise<string | null> {
  const stored = redisValueAsString(await redis.get(otpKey(inviteToken)));
  if (!stored) return null;

  const raw = stored.startsWith(OTP_PREFIX) ? stored.slice(OTP_PREFIX.length) : stored;
  const normalized = normalizeOtp(raw);
  return normalized.length === 6 ? normalized : null;
}

export async function verifyInviteOtp(redis: Redis, inviteToken: string, otp: string) {
  const stored = await getStoredInviteOtp(redis, inviteToken);
  const input = normalizeOtp(otp);
  if (!stored || stored !== input) return false;

  await redis.del(otpKey(inviteToken));
  await redis.set(verifiedKey(inviteToken), `${VERIFIED_PREFIX}${inviteToken}`, { ex: VERIFIED_TTL_SECONDS });
  return true;
}

export async function isInviteEmailVerified(redis: Redis, inviteToken: string) {
  const value = redisValueAsString(await redis.get(verifiedKey(inviteToken)));
  if (!value) return false;

  if (value === `${VERIFIED_PREFIX}${inviteToken}`) return true;
  if (value.startsWith(VERIFIED_PREFIX)) return value.slice(VERIFIED_PREFIX.length) === inviteToken;

  const legacy = value.toLowerCase();
  return legacy === "verified" || legacy === "1" || legacy === "true";
}

export async function clearInviteEmailVerification(redis: Redis, inviteToken: string) {
  await redis.del(verifiedKey(inviteToken));
}

type InviteVerificationPayload = {
  purpose: "invite_verify";
  invite: string;
  email: string;
  exp: number;
};

async function signPayload(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${header}.${body}.${sig}`;
}

async function verifySignedPayload<T extends Record<string, unknown>>(
  token: string,
  secret: string
): Promise<T | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as T;
    const exp = payload.exp as number | undefined;
    if (exp && exp < Date.now() / 1000) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function createInviteVerificationToken(
  inviteToken: string,
  email: string,
  secret: string
): Promise<string> {
  const payload: InviteVerificationPayload = {
    purpose: "invite_verify",
    invite: inviteToken,
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + VERIFIED_TTL_SECONDS,
  };
  return signPayload(payload, secret);
}

export async function verifyInviteVerificationToken(
  verificationToken: string,
  inviteToken: string,
  email: string,
  secret: string
): Promise<boolean> {
  const payload = await verifySignedPayload<InviteVerificationPayload>(verificationToken, secret);
  if (!payload) return false;
  if (payload.purpose !== "invite_verify") return false;
  if (payload.invite !== inviteToken) return false;
  if (payload.email !== email.toLowerCase()) return false;
  return true;
}

export async function isInviteVerificationSatisfied(
  redis: Redis,
  inviteToken: string,
  email: string,
  secret: string,
  verificationToken?: string
): Promise<boolean> {
  if (
    verificationToken &&
    (await verifyInviteVerificationToken(verificationToken, inviteToken, email, secret))
  ) {
    return true;
  }
  return isInviteEmailVerified(redis, inviteToken);
}
