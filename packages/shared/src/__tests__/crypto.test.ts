import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  hashPassword,
  isSuccessStatus,
  signPayload,
  slugify,
  verifyPassword,
  verifyPayload,
} from "../index";

describe("HMAC signing and verification", () => {
  it("produces a deterministic hex signature", async () => {
    const signature = await signPayload("timestamp.body", "secret-key");
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(await signPayload("timestamp.body", "secret-key")).toBe(signature);
  });

  it("verifies matching signatures", async () => {
    const signature = await signPayload("timestamp.body", "secret-key");
    expect(await verifyPayload("timestamp.body", "secret-key", signature)).toBe(true);
  });

  it("rejects invalid signatures", async () => {
    const signature = await signPayload("timestamp.body", "secret-key");
    expect(await verifyPayload("timestamp.body", "wrong-secret", signature)).toBe(false);
  });
});

describe("API key hashing", () => {
  it("hashes keys deterministically", async () => {
    const key = `${API_KEY_PREFIX}abc123`;
    const hashA = await hashApiKey(key);
    const hashB = await hashApiKey(key);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates keys with the expected prefix", () => {
    const { key, prefix } = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(prefix).toBe(key.slice(0, 16));
  });
});

describe("password hashing", () => {
  it("verifies a stored password hash", async () => {
    const stored = await hashPassword("super-secret");
    expect(await verifyPassword("super-secret", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });
});

describe("helpers", () => {
  it("classifies HTTP success statuses", () => {
    expect(isSuccessStatus(200)).toBe(true);
    expect(isSuccessStatus(299)).toBe(true);
    expect(isSuccessStatus(300)).toBe(false);
    expect(isSuccessStatus(500)).toBe(false);
  });

  it("slugifies text", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("  Multiple   Spaces ")).toBe("multiple-spaces");
  });
});
