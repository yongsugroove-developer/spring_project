export const STORAGE_KEYS = {
  locale: "my-planner-locale",
  theme: "my-planner-theme",
  density: "my-planner-density",
  authToken: "my-planner-auth-token",
};

export function detectLocale(messages, fallback = "ko") {
  const saved = globalThis.localStorage?.getItem(STORAGE_KEYS.locale);
  if (saved && messages?.[saved]) {
    return saved;
  }

  const candidates = [globalThis.navigator?.language, ...(globalThis.navigator?.languages ?? [])].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = String(candidate).toLowerCase();
    if (normalized.startsWith("ko")) return "ko";
    if (normalized.startsWith("ja")) return "ja";
    if (normalized.startsWith("en")) return "en";
  }

  return fallback;
}

export function detectStoredOption(key, allowedValues, fallback) {
  const stored = globalThis.localStorage?.getItem(key);
  return stored && allowedValues.includes(stored) ? stored : fallback;
}

export function setStoredOption(key, value) {
  globalThis.localStorage?.setItem(key, value);
}

export function getAuthToken() {
  return globalThis.localStorage?.getItem(STORAGE_KEYS.authToken) ?? "";
}

export function persistAuthToken(value) {
  if (value) {
    globalThis.localStorage?.setItem(STORAGE_KEYS.authToken, value);
    return;
  }
  globalThis.localStorage?.removeItem(STORAGE_KEYS.authToken);
}

export function applyPreferences(state, target = document.body) {
  if (!target) {
    return;
  }
  target.dataset.theme = state.themePreset;
  target.dataset.density = state.density;
}
