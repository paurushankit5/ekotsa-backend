export function createCookieClient(baseUrl) {
  const cookieJar = new Map();

  function cookieHeader() {
    const items = Array.from(cookieJar.entries()).map(([key, value]) => `${key}=${value}`);
    return items.join("; ");
  }

  function storeSetCookies(response) {
    const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      cookieJar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }

  async function request(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const headers = new Headers(init.headers ?? {});
    const cookie = cookieHeader();
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers,
      signal: controller.signal,
      redirect: init.redirect ?? "manual",
    }).finally(() => clearTimeout(timer));
    storeSetCookies(response);

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, text, json, cookies: new Map(cookieJar) };
  }

  return {
    request,
    getCookie(name) {
      return cookieJar.get(name) ?? null;
    },
  };
}
