export function createJsonApiClient({
  getAuthToken,
  onUnauthorized,
  getLocale,
  translate,
  resolveMessage,
}) {
  return async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const hasBody = options.body !== undefined;
    const locale = getLocale?.();
    const token = options.skipAuth ? "" : getAuthToken?.();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (locale && !headers.has("Accept-Language")) {
      headers.set("Accept-Language", locale);
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    if (hasBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    if (options.allow401 && response.status === 401) {
      return null;
    }

    if (response.status === 401 && !options.preserveAuthOn401) {
      onUnauthorized?.();
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      const fallbackMessage = translate?.("actionFailed") ?? "Request failed";
      const message = payload?.message || response.statusText || fallbackMessage;
      throw new Error(resolveMessage ? resolveMessage(message) : message);
    }

    if (!payload && options.requireJson !== false) {
      throw new Error(translate?.("invalidJson") ?? "Invalid JSON");
    }

    return payload;
  };
}
