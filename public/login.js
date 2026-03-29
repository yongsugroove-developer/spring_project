import { LANGUAGE_LABELS, MESSAGES } from "./translations.js";

const LOCALE_KEY = "my-planner-locale";
const THEME_KEY = "my-planner-theme";
const DENSITY_KEY = "my-planner-density";
const AUTH_TOKEN_KEY = "my-planner-auth-token";
const HOME_PATH = "/";

const THEME_PRESET_OPTIONS = [
  { value: "violet", labelKey: "themeViolet" },
  { value: "sunset", labelKey: "themeSunset" },
  { value: "forest", labelKey: "themeForest" },
];

const DENSITY_OPTIONS = [
  { value: "comfy", labelKey: "densityComfy" },
  { value: "compact", labelKey: "densityCompact" },
];

const state = {
  locale: detectLocale(),
  themePreset: detectStoredOption(
    THEME_KEY,
    THEME_PRESET_OPTIONS.map((option) => option.value),
    "violet",
  ),
  density: detectStoredOption(
    DENSITY_KEY,
    DENSITY_OPTIONS.map((option) => option.value),
    "comfy",
  ),
  authToken: globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? "",
  authAvailable: false,
  authRequired: false,
  authMode: "login",
  billingPlans: [],
  pendingActionId: "",
  inlineFeedback: null,
};

function detectLocale() {
  const saved = globalThis.localStorage?.getItem(LOCALE_KEY);
  if (saved && MESSAGES[saved]) return saved;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").toLowerCase();
    if (normalized.startsWith("ko")) return "ko";
    if (normalized.startsWith("ja")) return "ja";
    if (normalized.startsWith("en")) return "en";
  }
  return "ko";
}

function detectStoredOption(key, allowedValues, fallback) {
  const stored = globalThis.localStorage?.getItem(key);
  return allowedValues.includes(stored) ? stored : fallback;
}

function setStoredOption(key, value) {
  globalThis.localStorage?.setItem(key, value);
}

function applyPreferences() {
  document.body.dataset.theme = state.themePreset;
  document.body.dataset.density = state.density;
}

function setAuthToken(token) {
  state.authToken = token;
  if (token) {
    globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, token);
    return;
  }
  globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
}

function t(key, params = {}) {
  const bundle = MESSAGES[state.locale] ?? MESSAGES.ko;
  const fallback = MESSAGES.ko;
  const template = bundle[key] ?? fallback[key] ?? key;
  return String(template).replaceAll(/\{(\w+)\}/g, (_, token) => String(params[token] ?? ""));
}

function resolveMessage(message) {
  if (!message) return "";
  return MESSAGES[state.locale]?.[message] ? t(message) : message;
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function feedback(message, error = false) {
  const node = document.getElementById("login-feedback");
  if (!node) return;
  node.textContent = message;
  node.style.color = message ? (error ? "var(--danger)" : "var(--accent)") : "";
}

function setDocumentMeta() {
  document.documentElement.lang = state.locale;
  document.title = `${t("login")} | ${t("appTitle")}`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("authRequiredCopy"));
}

function applyStaticText() {
  setDocumentMeta();
  text("settings-summary", t("settings"));
  text("language-label", t("language"));
  text("theme-label", t("theme"));
  text("density-label", t("density"));

  const languageSelect = document.getElementById("language-select");
  if (languageSelect instanceof HTMLSelectElement) {
    languageSelect.value = state.locale;
    for (const option of languageSelect.options) {
      option.textContent = LANGUAGE_LABELS[option.value] ?? option.value;
    }
  }

  const themeSelect = document.getElementById("theme-select");
  if (themeSelect instanceof HTMLSelectElement) {
    themeSelect.value = state.themePreset;
    for (const option of themeSelect.options) {
      const match = THEME_PRESET_OPTIONS.find((entry) => entry.value === option.value);
      option.textContent = match ? t(match.labelKey) : option.value;
    }
  }

  const densitySelect = document.getElementById("density-select");
  if (densitySelect instanceof HTMLSelectElement) {
    densitySelect.value = state.density;
    for (const option of densitySelect.options) {
      const match = DENSITY_OPTIONS.find((entry) => entry.value === option.value);
      option.textContent = match ? t(match.labelKey) : option.value;
    }
  }
}

function moneyLabel(priceMinor, currency) {
  return new Intl.NumberFormat(state.locale, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format((Number(priceMinor) || 0) / 100);
}

function billingIntervalLabel(interval) {
  return interval === "year" ? t("billingYearly") : t("billingMonthly");
}

function localizedBillingPlan(plan) {
  if (plan.code === "free") {
    return {
      name: t("billingPlanFreeName"),
      description: t("billingPlanFreeDescription"),
      intervalLabel: "",
    };
  }
  if (plan.code === "pro-monthly") {
    return {
      name: t("billingPlanProName"),
      description: t("billingPlanProMonthlyDescription"),
      intervalLabel: billingIntervalLabel("month"),
    };
  }
  if (plan.code === "pro-yearly") {
    return {
      name: t("billingPlanProName"),
      description: t("billingPlanProYearlyDescription"),
      intervalLabel: billingIntervalLabel("year"),
    };
  }
  return {
    name: plan.name,
    description: plan.description,
    intervalLabel: billingIntervalLabel(plan.interval),
  };
}

function inlineFeedback(scope) {
  if (state.inlineFeedback?.scope !== scope) return "";
  return `<p class="inline-feedback ${state.inlineFeedback.error ? "is-error" : ""}">${esc(
    state.inlineFeedback.message,
  )}</p>`;
}

function setInlineFeedback(scope, message, error = false) {
  state.inlineFeedback = {
    scope,
    message: resolveMessage(message),
    error,
  };
}

function isPending(actionId) {
  return state.pendingActionId === actionId;
}

function disabledAttr(actionId) {
  return isPending(actionId) ? ' disabled aria-busy="true"' : "";
}

function authModeButton(mode, label) {
  const selected = state.authMode === mode;
  return `<button class="segment-button ${selected ? "is-selected" : ""}" type="button" data-action="auth-mode" data-mode="${mode}" aria-pressed="${String(selected)}">${esc(label)}</button>`;
}

function planCard(plan) {
  const localized = localizedBillingPlan(plan);
  return `<article class="content-card content-card--stat billing-plan-card">
    <div class="billing-plan-head">
      <div>
        <div class="billing-plan-title-line">
          <strong>${esc(localized.name)}</strong>
          ${localized.intervalLabel ? `<span class="state-pill">${esc(localized.intervalLabel)}</span>` : ""}
        </div>
        <div class="muted">${esc(localized.description)}</div>
      </div>
    </div>
    <div class="billing-price">${esc(moneyLabel(plan.priceMinor, plan.currency))}</div>
  </article>`;
}

function authCardTitle() {
  return state.authAvailable ? t("authRequiredTitle") : t("authUnavailableTitle");
}

function authCardCopy() {
  return state.authAvailable ? t("authRequiredCopy") : t("authUnavailableCopy");
}

function settingsPanel() {
  return `<div class="login-settings-wrap">
    <details class="settings-panel login-settings-panel">
      <summary id="settings-summary" class="settings-summary">${t("displaySettings")}</summary>
      <div class="header-controls login-settings-controls">
        <label class="control-box">
          <span id="language-label">${t("language")}</span>
          <select id="language-select" aria-labelledby="language-label">
            <option value="ko">한국어</option>
            <option value="en">영어</option>
            <option value="ja">일본어</option>
          </select>
        </label>
        <label class="control-box">
          <span id="theme-label">${t("theme")}</span>
          <select id="theme-select" aria-labelledby="theme-label">
            <option value="violet">바이올렛</option>
            <option value="sunset">선셋</option>
            <option value="forest">포레스트</option>
          </select>
        </label>
        <label class="control-box">
          <span id="density-label">${t("density")}</span>
          <select id="density-select" aria-labelledby="density-label">
            <option value="comfy">여유</option>
            <option value="compact">조밀</option>
          </select>
        </label>
      </div>
    </details>
  </div>`;
}

function renderRoot() {
  const root = document.getElementById("login-root");
  if (!root) return;

  const plans = !state.authAvailable
    ? `<div class="content-card collapsed-summary"><strong>${t("system")}</strong><p class="muted">${t("authUnavailableCopy")}</p></div>`
    : state.billingPlans.length
      ? state.billingPlans.map((plan) => planCard(plan)).join("")
      : `<div class="content-card collapsed-summary"><strong>${t("billingTitle")}</strong><p class="muted">${t("billingLoading")}</p></div>`;

  root.innerHTML = `<div class="login-layout">
    <section class="login-card">
      <div class="section-head auth-panel-head">
        <div>
          <p class="section-label">${t("login")}</p>
          <h1>${esc(authCardTitle())}</h1>
        </div>
      </div>
      <p class="login-copy">${esc(authCardCopy())}</p>
      <p id="login-feedback" class="feedback" aria-live="polite"></p>
      <div class="segmented auth-mode-toggle">
        ${authModeButton("login", t("login"))}
        ${authModeButton("register", t("register"))}
      </div>
      <form class="content-card content-card--form auth-form" data-form="${state.authMode === "register" ? "auth-register" : "auth-login"}">
        <div class="form-grid">
          ${
            state.authMode === "register"
              ? `<label class="field"><span>${t("displayName")}</span><input name="displayName" autocomplete="name" /></label>`
              : ""
          }
          <label class="field"><span>${t("email")}</span><input name="email" type="email" autocomplete="${state.authMode === "register" ? "email" : "username"}" required /></label>
          <label class="field"><span>${t("password")}</span><input name="password" type="password" autocomplete="${state.authMode === "register" ? "new-password" : "current-password"}" required minlength="8" /></label>
        </div>
        ${inlineFeedback("auth")}
        <div class="actions">
          <button class="btn" type="submit"${!state.authAvailable ? " disabled" : ""}${disabledAttr("auth")}>${t(
            state.authMode === "register" ? "registerAction" : "loginAction",
          )}</button>
        </div>
      </form>
      ${settingsPanel()}
    </section>

    <aside class="login-side-stack">
      <section class="panel section login-side-panel">
        <div class="section-head section-head-tight">
          <div>
            <p class="section-label">${t("billingTitle")}</p>
            <h2>${t("billingPlanExplorer")}</h2>
          </div>
        </div>
        <p class="muted auth-copy">${t("billingGuestCopy")}</p>
        <div class="stack">${plans}</div>
      </section>
    </aside>
  </div>`;
}

function render() {
  applyPreferences();
  renderRoot();
  applyStaticText();
}

async function api(path, options = {}) {
  const {
    headers: customHeaders = {},
    skipAuth = false,
    preserveAuthOn401 = false,
    ...fetchOptions
  } = options;
  const res = await fetch(path, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": state.locale,
      ...(skipAuth || !state.authToken ? {} : { Authorization: `Bearer ${state.authToken}` }),
      ...customHeaders,
    },
    ...fetchOptions,
  });
  if (res.status === 204) return null;
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(t("invalidJson"));
  }
  if (res.status === 401 && !preserveAuthOn401) {
    setAuthToken("");
  }
  if (!res.ok) throw new Error(data?.message ?? t("actionFailed"));
  return data;
}

async function refreshHealth() {
  const health = await api("/api/health", { skipAuth: true, preserveAuthOn401: true });
  state.authAvailable = health?.authAvailable ?? health?.storageDriver === "mysql";
  state.authRequired = Boolean(health?.authRequired);
}

async function refreshBillingPlans() {
  if (!state.authAvailable) {
    state.billingPlans = [];
    return;
  }
  const result = await api("/api/billing/plans", { skipAuth: true, preserveAuthOn401: true });
  state.billingPlans = result?.plans ?? [];
}

async function restoreSession() {
  if (!state.authAvailable || !state.authToken) return false;
  try {
    const result = await api("/api/auth/me");
    return Boolean(result?.user);
  } catch {
    setAuthToken("");
    return false;
  }
}

async function runPending(actionId, task) {
  state.pendingActionId = actionId;
  render();
  try {
    return await task();
  } finally {
    state.pendingActionId = "";
    render();
  }
}

function redirectToHome() {
  globalThis.location?.replace(HOME_PATH);
}

async function onSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const endpoint = form.dataset.form === "auth-register" ? "/api/auth/register" : "/api/auth/login";

  try {
    await runPending("auth", async () => {
      const payload =
        form.dataset.form === "auth-register"
          ? {
              displayName: data.get("displayName") || null,
              email: data.get("email"),
              password: data.get("password"),
            }
          : {
              email: data.get("email"),
              password: data.get("password"),
            };
      const result = await api(endpoint, {
        method: "POST",
        skipAuth: true,
        preserveAuthOn401: true,
        body: JSON.stringify(payload),
      });
      setAuthToken(result?.session?.token ?? "");
      state.inlineFeedback = null;
      feedback("");
      redirectToHome();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : t("actionFailed");
    setInlineFeedback("auth", message, true);
    render();
    feedback("");
  }
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "auth-mode") {
    state.authMode = button.dataset.mode === "register" ? "register" : "login";
    state.inlineFeedback = null;
    feedback("");
    render();
  }
}

function onChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.id === "language-select" && MESSAGES[target.value]) {
    state.locale = target.value;
    setStoredOption(LOCALE_KEY, target.value);
    render();
    return;
  }
  if (target.id === "theme-select") {
    state.themePreset = target.value;
    setStoredOption(THEME_KEY, target.value);
    applyPreferences();
    render();
    return;
  }
  if (target.id === "density-select") {
    state.density = target.value;
    setStoredOption(DENSITY_KEY, target.value);
    applyPreferences();
    render();
  }
}

document.addEventListener("submit", (event) => void onSubmit(event));
document.addEventListener("click", onClick);
document.addEventListener("change", onChange);

async function initializeLogin() {
  render();
  try {
    await refreshHealth();
    if (await restoreSession()) {
      redirectToHome();
      return;
    }
    await refreshBillingPlans();
    render();
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("loadFailed"), true);
  }
}

void initializeLogin();
