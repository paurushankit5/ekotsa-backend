import test from "node:test";
import assert from "node:assert/strict";
import { createCookieClient } from "./helpers/http-client.mjs";
import { bootstrapDeviceSession } from "./helpers/flows.mjs";

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

test("desktop-facing contract endpoints return the expected envelopes", async (t) => {
  if (!requireReachableServer(t)) return;
  const email = `contract-${Date.now()}@example.com`;
  const deviceId = `contract-device-${Date.now()}`;
  const session = await bootstrapDeviceSession(client, { email, deviceId, deviceName: "Contract Device" });

  const me = await client.request("/api/v1/devices/me");
  assert.equal(me.response.status, 200);
  assert.equal(me.json?.ok, true);
  assert.equal(me.json?.device?.id, session.device?.id);

  const status = await client.request("/api/v1/licenses/status");
  assert.equal(status.response.status, 200);
  assert.equal(status.json?.ok, true);
  assert.ok(["grant", "legacy_user_license", "none"].includes(status.json?.license?.source));

  const issue = await client.request("/api/v1/licenses/issue", {
    method: "POST",
    headers: { authorization: `Bearer ${session.deviceAuthToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: session.deviceId }),
  });
  assert.equal(issue.response.status, 200);
  assert.equal(issue.json?.ok, true);
  assert.equal(issue.json?.artifact?.payload?.deviceId, session.deviceId);
  assert.equal(issue.json?.artifact?.payload?.v, 2);
  assert.equal(issue.json?.artifact?.payload?.entitlementVersion, 1);
  assert.ok(issue.json?.artifact?.payload?.kid);

  const refresh = await client.request("/api/v1/licenses/refresh", {
    method: "POST",
    headers: { authorization: `Bearer ${session.deviceAuthToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: session.deviceId }),
  });
  assert.equal(refresh.response.status, 200);
  assert.equal(refresh.json?.ok, true);
  assert.equal(refresh.json?.artifact?.payload?.deviceId, session.deviceId);
  assert.equal(refresh.json?.artifact?.payload?.v, 2);
});
