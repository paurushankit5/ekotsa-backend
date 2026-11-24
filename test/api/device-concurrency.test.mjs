import test from "node:test";
import assert from "node:assert/strict";
import { createCookieClient } from "./helpers/http-client.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3100";
const client = createCookieClient(baseUrl);
let serverReachable = true;

async function canReachServer() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    await fetch(new URL("/api/v1/releases/current?platform=windows", baseUrl), { signal: controller.signal }).finally(() => clearTimeout(timer));
    return true;
  } catch {
    return false;
  }
}

test.before(async () => {
  serverReachable = await canReachServer();
});

function requireReachableServer(t) {
  if (!serverReachable) {
    if (process.env.INTEGRATION_TEST_MODE === "true") {
      assert.fail(`Integration app server is not reachable at ${baseUrl}.`);
    }
    t.skip(`External blocker: no reachable app server at ${baseUrl}.`);
    return false;
  }
  return true;
}

async function loginViaGoogle(email) {
  const start = await client.request("/api/v1/oauth/google/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailHint: email }),
  });
  assert.equal(start.response.status, 200);
  const state = new URL(start.json?.oauth?.authorizationUrl).searchParams.get("state");
  assert.ok(state);

  const callback = await client.request(
    `/api/v1/oauth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(`mock-success:${email}`)}`
  );
  assert.ok([200, 302].includes(callback.response.status));
  const handoffCode = callback.json?.oauth?.handoffCode ?? new URL(callback.response.headers.get("location") ?? "http://localhost").searchParams.get("handoff_code");
  assert.ok(handoffCode);

  const exchange = await client.request("/api/v1/oauth/google/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoffCode }),
  });
  assert.equal(exchange.response.status, 200);
}

async function createActivationToken() {
  const activation = await client.request("/api/v1/activation/session", { method: "POST" });
  assert.equal(activation.response.status, 200);
  const token = activation.json?.activationSession?.token;
  assert.ok(token);
  return token;
}

async function registerDevice(deviceId, activationSessionToken, forwardedFor) {
  return await client.request("/api/v1/devices/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": forwardedFor },
    body: JSON.stringify({
      activationSessionToken,
      deviceId,
      installationId: `${deviceId}-install`,
      deviceFingerprint: `${deviceId}-fingerprint`,
      deviceName: deviceId,
      platform: "windows",
      osName: "Windows",
      osVersion: "11",
      architecture: "x64",
      appVersion: "1.0.0",
      publicKey: `${deviceId}-public-key`,
      reportedInstalledAt: new Date().toISOString(),
      reportedFirstLaunchAt: new Date().toISOString(),
      metadataSchemaVersion: 1,
      metadata: { locale: "en-IN" },
    }),
  });
}

test("two concurrent device registrations cannot exceed the limit", async (t) => {
  if (!requireReachableServer(t)) return;
  const email = `device-limit-${Date.now()}@example.com`;
  await loginViaGoogle(email);
  const tokenA = await createActivationToken();
  const tokenB = await createActivationToken();

  const [first, second] = await Promise.all([
    registerDevice(`device-a-${Date.now()}`, tokenA, "203.0.113.1"),
    registerDevice(`device-b-${Date.now()}`, tokenB, "203.0.113.2"),
  ]);

  const responses = [first, second];
  console.log(
    "device concurrency statuses",
    responses.map((response) => ({ status: response.response.status, code: response.json?.code ?? null }))
  );
  assert.equal(responses.filter((r) => r.response.status === 200).length, 1);
  assert.equal(responses.filter((r) => r.response.status === 409).length, 1);
  assert.ok(responses.some((r) => r.json?.code === "DEVICE_LIMIT_REACHED"));
});

test("activation session remains single-use", async (t) => {
  if (!requireReachableServer(t)) return;
  const email = `activation-replay-${Date.now()}@example.com`;
  await loginViaGoogle(email);
  const token = await createActivationToken();
  const deviceId = `replay-device-${Date.now()}`;
  const first = await registerDevice(deviceId, token, "203.0.113.3");
  const second = await registerDevice(`${deviceId}-again`, token, "203.0.113.4");

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 401);
  assert.equal(second.json?.code, "UNAUTHORIZED");
});

test("cross-user device collisions remain blocked", async (t) => {
  if (!requireReachableServer(t)) return;
  const deviceId = `shared-device-${Date.now()}`;

  const emailA = `collision-a-${Date.now()}@example.com`;
  await loginViaGoogle(emailA);
  const tokenA = await createActivationToken();
  const first = await registerDevice(deviceId, tokenA, "203.0.113.5");
  assert.equal(first.response.status, 200);

  const emailB = `collision-b-${Date.now()}@example.com`;
  await loginViaGoogle(emailB);
  const tokenB = await createActivationToken();
  const second = await registerDevice(deviceId, tokenB, "203.0.113.6");

  assert.equal(second.response.status, 403);
  assert.equal(second.json?.code, "FORBIDDEN");
});
