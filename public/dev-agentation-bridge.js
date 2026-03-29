const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const ROOT_ID = "agentation-dev-root";
const SESSION_KEY_PREFIX = "my-planner-agentation-session:";

function isLocalHost() {
  return LOCAL_HOSTS.has(window.location.hostname);
}

function resolveAgentationHost() {
  return window.location.hostname === "::1" ? "[::1]" : window.location.hostname;
}

function resolveSessionKey() {
  return `${SESSION_KEY_PREFIX}${window.location.pathname}`;
}

function readSessionId(sessionKey) {
  try {
    return window.sessionStorage?.getItem(sessionKey) ?? undefined;
  } catch (_error) {
    return undefined;
  }
}

function writeSessionId(sessionKey, sessionId) {
  try {
    window.sessionStorage?.setItem(sessionKey, sessionId);
  } catch (_error) {
    console.warn("[agentation] failed to persist session id");
  }
}

async function resolveEndpoint() {
  const endpoint = `http://${resolveAgentationHost()}:4747`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${endpoint}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok ? endpoint : null;
  } catch (_error) {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function mountAgentationBridge() {
  if (!isLocalHost()) return;
  if (!document.body || document.getElementById(ROOT_ID)) return;

  try {
    const endpoint = await resolveEndpoint();
    const [
      ReactModule,
      ReactDomClientModule,
      AgentationModule,
    ] = await Promise.all([
      import("https://esm.sh/react@18.3.1"),
      import("https://esm.sh/react-dom@18.3.1/client"),
      import("https://esm.sh/agentation@3.0.2?bundle&deps=react@18.3.1,react-dom@18.3.1"),
    ]);

    const React = ReactModule.default;
    const { createRoot } = ReactDomClientModule;
    const { Agentation } = AgentationModule;
    const sessionKey = resolveSessionKey();
    const savedSessionId = readSessionId(sessionKey);
    const rootNode = document.createElement("div");
    rootNode.id = ROOT_ID;
    document.body.append(rootNode);

    const props = {
      ...(endpoint ? { endpoint } : {}),
      ...(savedSessionId ? { sessionId: savedSessionId } : {}),
      onSessionCreated(sessionId) {
        writeSessionId(sessionKey, sessionId);
        console.info("[agentation] session", sessionId);
      },
    };

    const root = createRoot(rootNode);
    root.render(React.createElement(Agentation, props));
    console.info(endpoint ? "[agentation] localhost sync enabled" : "[agentation] localhost toolbar only");
  } catch (error) {
    console.warn("[agentation] failed to load bridge", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void mountAgentationBridge();
  });
} else {
  void mountAgentationBridge();
}
