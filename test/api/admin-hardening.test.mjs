import test from "node:test";
import assert from "node:assert/strict";
import { createCookieClient } from "./helpers/http-client.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3100";
const client = createCookieClient(baseUrl);
let serverReachable = true;
const adminEmail = process.env.INTEGRATION_ADMIN_EMAIL || "admin.integration@ekotsa.test";
const adminPassword = process.env.INTEGRATION_ADMIN_PASSWORD || "IntegrationAdmin!123";

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

async function adminLogin() {
  const login = await client.request("/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  assert.equal(login.response.status, 200);
}

test("admin mutation rejects missing trusted origin", async (t) => {
  if (!requireReachableServer(t)) return;
  await adminLogin();
  const response = await client.request("/api/v1/admin/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId: "missing", action: "approve" }),
  });
  assert.equal(response.response.status, 403);
  assert.equal(response.json?.code, "FORBIDDEN");
});

test("admin mutation rejects unsupported content type", async (t) => {
  if (!requireReachableServer(t)) return;
  await adminLogin();
  // Any admin mutation works here; /admin/generate-code was removed (no plan code generation).
  const response = await client.request("/api/v1/admin/payments/note", {
    method: "POST",
    headers: { origin: baseUrl, "Content-Type": "text/plain" },
    body: "not-json",
  });
  assert.equal(response.response.status, 415);
  assert.equal(response.json?.code, "UNSUPPORTED_MEDIA_TYPE");
});

test("admin mutation rejects oversized payloads", async (t) => {
  if (!requireReachableServer(t)) return;
  await adminLogin();
  const response = await client.request("/api/v1/admin/payments/status", {
    method: "POST",
    headers: { origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentId: "x",
      status: "PENDING",
      note: "a".repeat(100_000),
    }),
  });
  assert.equal(response.response.status, 413);
  assert.equal(response.json?.code, "PAYLOAD_TOO_LARGE");
});
