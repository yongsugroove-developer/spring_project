const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function supportsServiceWorker() {
  return (
    "serviceWorker" in navigator &&
    (globalThis.isSecureContext || LOCAL_HOSTS.has(globalThis.location?.hostname ?? ""))
  );
}

export async function registerPwaServiceWorker(scriptUrl = "/sw.js") {
  if (!supportsServiceWorker()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(scriptUrl, { scope: "/" });
  } catch (error) {
    console.error("Failed to register service worker", error);
    return null;
  }
}
