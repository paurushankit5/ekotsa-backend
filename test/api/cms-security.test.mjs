import test from "node:test";
import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";

async function canReachServer() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(new URL("/", baseUrl), { signal: controller.signal }).finally(() => clearTimeout(timer));
    return true;
  } catch {
    return false;
  }
}

let serverReachable = true;

test.before(async () => {
  serverReachable = await canReachServer();
});

function requireReachableServer(t) {
  if (!serverReachable) {
    t.skip(`External blocker: no reachable app server at ${baseUrl}.`);
    return false;
  }
  return true;
}

test("preview link creation rejects unauthenticated requests", async (t) => {
  if (!requireReachableServer(t)) return;
  const response = await fetch(new URL("/api/v1/admin/cms/preview-links", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: "CmsPage",
      entityId: "preview-test",
      revisionVersion: 1,
      targetPath: "/preview-test",
    }),
  });

  assert.ok([401, 403].includes(response.status), `unexpected status ${response.status}`);
});

test("scheduler endpoint rejects missing or wrong cron secret", async (t) => {
  if (!requireReachableServer(t)) return;
  const missingSecret = await fetch(new URL("/api/v1/internal/cms/process-schedules", baseUrl), {
    method: "POST",
  });
  assert.ok([401, 403].includes(missingSecret.status), `unexpected status ${missingSecret.status}`);

  const wrongSecret = await fetch(new URL("/api/v1/internal/cms/process-schedules", baseUrl), {
    method: "POST",
    headers: { "x-cron-token": "not-the-secret" },
  });
  assert.ok([401, 403].includes(wrongSecret.status), `unexpected status ${wrongSecret.status}`);
});
