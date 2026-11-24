import test from "node:test";
import assert from "node:assert/strict";
import { createCookieClient } from "./helpers/http-client.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
let serverReachable = true;
const client = createCookieClient(baseUrl);

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

test(
  "registration accepts idempotent retries and records download events",
  {
    skip: process.env.DB_INTEGRATION_AVAILABLE === "true"
      ? false
      : "External blocker: the configured database is not writable from this environment.",
  },
  async (t) => {
    if (!requireReachableServer(t)) return;
    const unique = `test-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const idempotencyKey = `qa-registration-${unique}`;
    const payload = {
      fullName: "Commercial Test",
      organizationName: "Ekotsa QA",
      contactCountryCode: "+91",
      contactNumber: "9999999999",
      whatsappCountryCode: "+91",
      whatsappNumber: "9999999999",
      email: unique,
      termsAccepted: true,
      privacyAcknowledged: true,
      termsVersion: "1.0",
      privacyVersion: "1.0",
      marketingConsent: false,
      source: "test",
    };

    const first = await client.request("/api/v1/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    assert.equal(first.response.status, 200);
    assert.equal(first.json?.ok, true);
    assert.ok(first.json?.registration?.id);

    const second = await client.request("/api/v1/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    assert.equal(second.response.status, 200);
    assert.equal(second.json?.registration?.id, first.json?.registration?.id);

    const releases = await client.request("/api/v1/releases/current?platform=windows");
    const version = releases.json?.release?.version ?? null;
    assert.ok(version);

    const download = await client.request("/api/v1/downloads/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "windows",
        installerVersion: version,
        mode: "json",
      }),
    });
    assert.equal(download.response.status, 200);
    assert.equal(download.json?.ok, true);
    assert.ok(download.json?.download?.url);
  }
);

test("admin and registration status remain protected", async (t) => {
  if (!requireReachableServer(t)) return;
  const search = await client.request("/api/v1/admin/customers/search?q=test");
  assert.equal(search.response.status, 401);

  const status = await client.request("/api/v1/registrations/status");
  assert.equal(status.response.status, 401);
});

test("release manifest endpoint is publicly readable", async (t) => {
  if (!requireReachableServer(t)) return;
  const releases = await client.request("/api/v1/releases/current");
  assert.equal(releases.response.status, 200);
  assert.equal(releases.json?.ok, true);
  assert.ok("releases" in (releases.json ?? {}) || "release" in (releases.json ?? {}));
});

test("admin payment mutation rejects untrusted callers", async (t) => {
  if (!requireReachableServer(t)) return;
  const result = await client.request("/api/v1/admin/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId: "test", action: "approve" }),
  });
  assert.ok([401, 403].includes(result.response.status));
});
