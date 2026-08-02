import { describe, expect, it } from "vitest";
import { createJwt, verifyJwt } from "../../middleware/auth";

const SECRET = "test-jwt-secret";

describe("JWT creation and validation", () => {
  it("round-trips a valid token", async () => {
    const token = await createJwt("user-123", SECRET);
    const payload = await verifyJwt(token, SECRET);
    expect(payload).toEqual({ userId: "user-123" });
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await createJwt("user-123", SECRET);
    expect(await verifyJwt(token, "other-secret")).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyJwt("not-a-jwt", SECRET)).toBeNull();
    expect(await verifyJwt("a.b", SECRET)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const payload = btoa(
      JSON.stringify({
        sub: "user-123",
        iat: 1,
        exp: 1,
      })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${header}.${payload}`)
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(await verifyJwt(`${header}.${payload}.${sig}`, SECRET)).toBeNull();
  });
});
