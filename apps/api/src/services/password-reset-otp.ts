import type { Redis } from "@upstash/redis";
import { generateOtp, normalizeOtp } from "./invite-otp";
import { redisValueAsString } from "./redis-coerce";

export { generateOtp, normalizeOtp };

const OTP_TTL_SECONDS = 600;
const RESET_TOKEN_TTL_SECONDS = 1800;

const OTP_PREFIX = "code:";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function otpKey(email: string) {
  return `pwd_reset_otp:${normalizeEmail(email)}`;
}

export async function storePasswordResetOtp(redis: Redis, email: string, otp: string) {
  await redis.set(otpKey(email), `${OTP_PREFIX}${normalizeOtp(otp)}`, { ex: OTP_TTL_SECONDS });
}

export async function getStoredPasswordResetOtp(redis: Redis, email: string): Promise<string | null> {
  const stored = redisValueAsString(await redis.get(otpKey(email)));
  if (!stored) return null;

  const raw = stored.startsWith(OTP_PREFIX) ? stored.slice(OTP_PREFIX.length) : stored;
  const normalized = normalizeOtp(raw);
  return normalized.length === 6 ? normalized : null;
}

export async function verifyPasswordResetOtp(redis: Redis, email: string, otp: string) {
  const stored = await getStoredPasswordResetOtp(redis, email);
  const input = normalizeOtp(otp);
  if (!stored || stored !== input) return false;

  await redis.del(otpKey(email));
  return true;
}

type PasswordResetPayload = {
  purpose: "password_reset";
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

export async function createPasswordResetToken(email: string, secret: string): Promise<string> {
  const payload: PasswordResetPayload = {
    purpose: "password_reset",
    email: normalizeEmail(email),
    exp: Math.floor(Date.now() / 1000) + RESET_TOKEN_TTL_SECONDS,
  };
  return signPayload(payload, secret);
}

export async function verifyPasswordResetToken(
  resetToken: string,
  email: string,
  secret: string
): Promise<boolean> {
  const payload = await verifySignedPayload<PasswordResetPayload>(resetToken, secret);
  if (!payload) return false;
  if (payload.purpose !== "password_reset") return false;
  return payload.email === normalizeEmail(email);
}
