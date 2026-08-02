import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { requestApp } from "../helpers/app";
import { closeTestDb, createTestDb, getTestDatabaseUrl, resetDatabase } from "../helpers/db";
import { createTestEnv, seedProjectFixture } from "../helpers/fixtures";

const hasDatabase = Boolean(getTestDatabaseUrl());

describe.skipIf(!hasDatabase)("authorization integration", () => {
  const env = createTestEnv();

  beforeAll(async () => {
    await createTestDb();
  });

  beforeEach(async () => {
    const db = await createTestDb();
    await resetDatabase(db);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("allows admins to manage endpoints", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const response = await requestApp(`/v1/projects/${fixture.projectId}/endpoints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://admin-endpoint.test/hook" }),
      env,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { endpoint: { url: string } };
    expect(body.endpoint.url).toBe("https://admin-endpoint.test/hook");
  });

  it("rejects private webhook URLs when creating endpoints", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const response = await requestApp(`/v1/projects/${fixture.projectId}/endpoints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "http://127.0.0.1/webhook" }),
      env,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Webhook URL must not target private or reserved IP addresses",
    });
  });

  it("prevents members from creating API keys", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const response = await requestApp(`/v1/projects/${fixture.projectId}/api-keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.member.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Member Key" }),
      env,
    });

    expect(response.status).toBe(403);
  });

  it("prevents members from replaying deliveries", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const ingestResponse = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "member.replay.test",
        payload: { ok: true },
      }),
      env,
    });
    expect(ingestResponse.status).toBe(202);

    const deliveriesResponse = await requestApp(
      `/v1/projects/${fixture.projectId}/deliveries`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${fixture.admin.token}`,
        },
        env,
      }
    );
    const { deliveries: deliveryList } = (await deliveriesResponse.json()) as {
      deliveries: Array<{ id: string }>;
    };
    const deliveryId = deliveryList[0].id;

    const response = await requestApp(`/v1/deliveries/${deliveryId}/replay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.member.token}`,
        "Content-Type": "application/json",
      },
      env,
    });

    expect(response.status).toBe(404);
  });

  it("prevents users from accessing another project", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const response = await requestApp(`/v1/projects/${fixture.projectId}/endpoints`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${fixture.outsider.token}`,
      },
      env,
    });

    expect(response.status).toBe(403);
  });
});
