export async function bootstrapDeviceSession(client, { email, deviceId, deviceName = "Integration Device" }) {
  const start = await client.request("/api/v1/oauth/google/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailHint: email }),
  });
  if (start.response.status !== 200) throw new Error(`oauth start failed: ${start.response.status}`);
  const state = new URL(start.json?.oauth?.authorizationUrl).searchParams.get("state");
  if (!state) throw new Error("missing oauth state");

  const callback = await client.request(
    `/api/v1/oauth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(`mock-success:${email}`)}`
  );
  if (![200, 302].includes(callback.response.status)) throw new Error(`oauth callback failed: ${callback.response.status}`);
  const handoffCode = callback.json?.oauth?.handoffCode ?? new URL(callback.response.headers.get("location") ?? "http://localhost").searchParams.get("handoff_code");
  if (!handoffCode) throw new Error("missing handoff code");

  const exchange = await client.request("/api/v1/oauth/google/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoffCode }),
  });
  if (exchange.response.status !== 200) throw new Error(`oauth exchange failed: ${exchange.response.status}`);

  const activation = await client.request("/api/v1/activation/session", {
    method: "POST",
  });
  if (activation.response.status !== 200) throw new Error(`activation session failed: ${activation.response.status}`);

  const activationSessionToken = activation.json?.activationSession?.token;
  if (!activationSessionToken) throw new Error("missing activation session token");

  const register = await client.request("/api/v1/devices/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activationSessionToken,
      deviceId,
      installationId: `${deviceId}-install`,
      deviceFingerprint: `${deviceId}-fingerprint`,
      deviceName,
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
  if (register.response.status !== 200) throw new Error(`device register failed: ${register.response.status}`);

  const deviceAuthToken = register.json?.deviceAuth?.token;
  if (!deviceAuthToken) throw new Error("missing device auth token");

  return {
    email,
    handoffCode,
    activationSessionToken,
    deviceAuthToken,
    deviceId,
    device: register.json?.device ?? null,
  };
}
