import { EMOJI_CATALOG, ROUTINE_COLOR_SWATCHES } from "./emojiCatalog.js";
import {
  addDaysToDateKey,
  buildTodayRoute,
  buildWeekDates,
  getMondayWeekStart,
  isValidDateKey,
  parseHashRoute,
} from "./homeUtils.js";
import { LANGUAGE_LABELS, MESSAGES } from "./translations.js";

const LOCALE_KEY = "my-planner-locale";
const RECENT_EMOJIS_KEY = "my-planner-recent-emojis";
const THEME_KEY = "my-planner-theme";
const DENSITY_KEY = "my-planner-density";
const AUTH_TOKEN_KEY = "my-planner-auth-token";
const LOGIN_PATH = "/login.html";
const EMOJI_FALLBACK = "✨";

const THEME_PRESET_OPTIONS = [
  { value: "violet", labelKey: "themeViolet" },
  { value: "sunset", labelKey: "themeSunset" },
  { value: "forest", labelKey: "themeForest" },
];

const DENSITY_OPTIONS = [
  { value: "comfy", labelKey: "densityComfy" },
  { value: "compact", labelKey: "densityCompact" },
];

const MOBILE_VIEWPORT_QUERY = globalThis.matchMedia?.("(max-width: 820px)") ?? null;

const state = {
  routePath: "",
  routeScreen: "today",
  activeTab: "today",
  selectedMonth: monthKey(new Date()),
  selectedDate: "",
  selectedHomeDate: "",
  homeBoardMode: "routines",
  visibleHomeWeekStart: "",
  statsRange: "week",
  todoFilter: "all",
  todoDueFilter: "all",
  todoSearchQuery: "",
  todayTodoSection: "due",
  customStatsStart: "",
  customStatsEnd: "",
  isRoutineCreateOpen: false,
  isRoutineSetCreateOpen: false,
  isTodoCreateOpen: false,
  isTodayQuickOpen: !(MOBILE_VIEWPORT_QUERY?.matches ?? false),
  isHomeQuickCreateOpen: false,
  isAssignmentsOpen: false,
  isOverrideEditorOpen: false,
  settingsExpandedControl: "",
  isRoutineQuickTaskCreateOpen: false,
  expandedRoutineIds: new Set(),
  expandedRoutineTaskTemplateIds: new Set(),
  collapsedRoutineCompletedIds: new Set(),
  revealedCompletedRoutineIds: new Set(),
  routineCreateDraft: {
    name: "",
    emoji: "",
    color: "#16a34a",
    taskTemplateIds: [],
  },
  pendingActionId: "",
  inlineFeedback: null,
  highlightTodoId: "",
  lastActionAt: "",
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
  authUser: null,
  authAvailable: false,
  authRequired: false,
  authMode: "login",
  appNavOpen: false,
  accountSection: "auth",
  accountNavOpen: false,
  adminSection: "overview",
  adminNavOpen: false,
  billingPlans: [],
  billingOverview: null,
  adminOverview: null,
  adminUsers: [],
  adminSubscriptions: [],
  adminSessions: [],
  adminLogs: [],
  today: null,
  routines: [],
  routineTaskTemplates: [],
  routineSets: [],
  assignments: [],
  override: null,
  todos: [],
  calendar: null,
  stats: null,
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

function isMobileViewport() {
  return MOBILE_VIEWPORT_QUERY?.matches ?? false;
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

function clearPlannerState() {
  state.today = null;
  state.routines = [];
  state.routineTaskTemplates = [];
  state.routineSets = [];
  state.assignments = [];
  state.override = null;
  state.todos = [];
  state.calendar = null;
  state.stats = null;
}

function clearAuthState() {
  setAuthToken("");
  state.authUser = null;
  state.billingOverview = null;
  state.accountSection = "auth";
  state.accountNavOpen = false;
  clearAdminState();
}

function plannerLocked() {
  return state.authAvailable && !state.authUser;
}

function redirectToLogin() {
  if (globalThis.location?.pathname === LOGIN_PATH) return;
  globalThis.location?.replace(LOGIN_PATH);
}

function clearAdminState() {
  state.adminOverview = null;
  state.adminUsers = [];
  state.adminSubscriptions = [];
  state.adminSessions = [];
  state.adminLogs = [];
  state.adminSection = "overview";
  state.adminNavOpen = false;
}

function canAccessAdmin() {
  return ["owner", "admin"].includes(state.authUser?.role ?? "");
}

function parseRoute(path = globalThis.location?.hash?.slice(1) ?? "/today") {
  const parsed = parseHashRoute(path);
  const normalized = parsed.pathname;
  if (normalized === "/routine-tasks") {
    return { path: normalized, tab: "routines", screen: "task-library", homeDate: "" };
  }
  if (normalized === "/routines/new") {
    return { path: normalized, tab: "routines", screen: "routine-create", homeDate: "" };
  }
  if (normalized === "/routine-sets/new") {
    return { path: normalized, tab: "routines", screen: "routine-set-create", homeDate: "" };
  }
  if (normalized === "/settings") {
    return { path: normalized, tab: "settings", screen: "settings", homeDate: "" };
  }
  if (normalized === "/account") {
    return { path: normalized, tab: "account", screen: "account", homeDate: "" };
  }
  if (normalized === "/admin") {
    return { path: normalized, tab: "admin", screen: "admin", homeDate: "" };
  }
  if (normalized === "/todos") {
    return { path: normalized, tab: "todos", screen: "todos", homeDate: "" };
  }
  if (normalized === "/calendar") {
    return { path: normalized, tab: "calendar", screen: "calendar", homeDate: "" };
  }
  if (normalized === "/stats") {
    return { path: normalized, tab: "stats", screen: "stats", homeDate: "" };
  }
  if (normalized === "/routines") {
    return { path: normalized, tab: "routines", screen: "routines", homeDate: "" };
  }
  return { path: buildTodayRoute(parsed.date), tab: "today", screen: "today", homeDate: parsed.date };
}

function syncRouteState(path) {
  const route = parseRoute(path);
  state.routePath = route.path;
  state.routeScreen = route.screen;
  state.activeTab = route.tab;
  if (route.screen === "today") {
    if (route.homeDate) {
      state.selectedHomeDate = route.homeDate;
      state.visibleHomeWeekStart = getMondayWeekStart(route.homeDate);
    } else {
      state.selectedHomeDate = "";
    }
  }
  return route;
}

function setRoute(path, { replace = false, skipRender = false } = {}) {
  const route = parseRoute(path);
  const nextHash = `#${route.path}`;
  const hashChanged = globalThis.location?.hash !== nextHash;
  if (hashChanged) {
    if (replace) {
      globalThis.history?.replaceState?.(null, "", nextHash);
    } else {
      globalThis.location.hash = route.path;
    }
  }
  syncRouteState(route.path);
  if (!skipRender && (!hashChanged || replace)) {
    render();
  }
}

function setAccountSection(section) {
  const allowed = state.authUser ? ["profile", "billing"] : ["auth", "plans"];
  state.accountSection = allowed.includes(section) ? section : allowed[0];
}

function setAdminSection(section) {
  const allowed = ["overview", "accounts", "subscriptions", "sessions", "logs"];
  state.adminSection = allowed.includes(section) ? section : "overview";
}

function defaultRoutineCreateDraft() {
  return {
    name: "",
    emoji: "",
    color: "#16a34a",
    taskTemplateIds: [],
  };
}

function getRoutineCreateDraft() {
  const draft = state.routineCreateDraft ?? defaultRoutineCreateDraft();
  return {
    ...defaultRoutineCreateDraft(),
    ...draft,
    emoji: sanitizeEmojiInput(draft.emoji ?? ""),
    color: safeColor(draft.color ?? "#16a34a"),
    taskTemplateIds: Array.isArray(draft.taskTemplateIds) ? [...new Set(draft.taskTemplateIds)] : [],
  };
}

function setRoutineCreateDraft(nextDraft) {
  state.routineCreateDraft = {
    ...defaultRoutineCreateDraft(),
    ...nextDraft,
    emoji: sanitizeEmojiInput(nextDraft?.emoji ?? ""),
    color: safeColor(nextDraft?.color ?? "#16a34a"),
    taskTemplateIds: Array.isArray(nextDraft?.taskTemplateIds) ? [...new Set(nextDraft.taskTemplateIds)] : [],
  };
}

function resetRoutineCreateDraft() {
  setRoutineCreateDraft(defaultRoutineCreateDraft());
}

function syncRoutineCreateDraftFromForm(form) {
  if (!(form instanceof HTMLFormElement) || form.dataset.form !== "routine-create") return;
  setRoutineCreateDraft({
    name: form.querySelector('input[name="name"]')?.value ?? "",
    emoji: form.querySelector('input[name="emoji"]')?.value ?? "",
    color: form.querySelector('input[name="color"]')?.value ?? "#16a34a",
    taskTemplateIds: [...form.querySelectorAll('input[name="taskTemplateIds"]:checked')].map((input) => input.value),
  });
}

function toggleSetEntry(set, value) {
  if (set.has(value)) {
    set.delete(value);
    return;
  }
  set.add(value);
}

function getRecentEmojis() {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_EMOJIS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((entry) => typeof entry === "string" && entry.trim()))].slice(0, 10);
  } catch {
    return [];
  }
}

function rememberEmoji(value) {
  const emoji = sanitizeEmojiInput(value);
  if (!emoji) return;
  const recent = [emoji, ...getRecentEmojis().filter((entry) => entry !== emoji)].slice(0, 10);
  globalThis.localStorage?.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recent));
}

function sanitizeEmojiInput(value) {
  return Array.from(String(value ?? "").trim()).slice(0, 16).join("");
}

function t(key, params = {}) {
  const bundle = MESSAGES[state.locale] ?? MESSAGES.ko;
  const fallback = MESSAGES.ko;
  const template = bundle[key] ?? fallback[key] ?? key;
  return String(template).replaceAll(/\{(\w+)\}/g, (_, token) => String(params[token] ?? ""));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKeyFromMonth(month, day) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(month) {
  const [year, monthValue] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthValue, 0)).getUTCDate();
}

function dateLabel(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(state.locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function weekdayLabels() {
  const formatter = new Intl.DateTimeFormat(state.locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 7 + index))),
  );
}

function homeMonthLabel(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(state.locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function homeWeekdayLabel(value) {
  return new Intl.DateTimeFormat(state.locale, {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function percent(value) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function clampRate(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.min(Math.max(normalized, 0), 1);
}

function safeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? "")) ? String(value) : "#6366f1";
}

function styleVars(vars) {
  const rules = Object.entries(vars)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}:${value}`);
  return rules.length > 0 ? ` style="${rules.join(";")}"` : "";
}

function accentStyle(color) {
  return styleVars({ "--routine-accent": safeColor(color) });
}

function progressStyle(rate) {
  return styleVars({ "--progress": clampRate(rate) });
}

function emojiBadge(value, size = "md") {
  const emoji = sanitizeEmojiInput(value) || EMOJI_FALLBACK;
  return `<span class="emoji-badge emoji-badge--${size}" aria-hidden="true">${esc(emoji)}</span>`;
}

function emojiPickerSection(label, items, selectedEmoji) {
  return `<div class="emoji-picker-section">
    <div class="emoji-picker-label">${esc(label)}</div>
    ${emojiPickerGrid(items, selectedEmoji)}
  </div>`;
}

function emojiPickerGrid(items, selectedEmoji, className = "") {
  const gridClassName = ["emoji-grid", className].filter(Boolean).join(" ");
  return `<div class="${gridClassName}">${items.map((emoji) => emojiPickerButton(emoji, selectedEmoji)).join("")}</div>`;
}

function emojiPickerButton(emoji, selectedEmoji) {
  const isSelected = sanitizeEmojiInput(selectedEmoji) === emoji;
  return `<button class="emoji-option ${isSelected ? "is-selected" : ""}" type="button" data-action="pick-emoji" data-emoji="${esc(emoji)}" aria-pressed="${String(isSelected)}">${esc(emoji)}</button>`;
}

function emojiField(selectedEmoji = "") {
  const emoji = sanitizeEmojiInput(selectedEmoji);
  const recent = getRecentEmojis();
  return `<label class="field field-wide emoji-field">
    <span>${t("emoji")}</span>
    <div class="emoji-input-shell">
      <input class="emoji-input" name="emoji" maxlength="16" value="${esc(emoji)}" placeholder="${t("emojiPlaceholder")}" autocomplete="off" />
      <details class="emoji-picker">
        <summary class="emoji-trigger">
          <span class="emoji-trigger-main">
            <span class="emoji-trigger-badge" data-role="emoji-preview">
              <span class="emoji-trigger-icon">${emoji ? esc(emoji) : EMOJI_FALLBACK}</span>
            </span>
            <span class="emoji-trigger-label">${t("emojiPicker")}</span>
          </span>
          <span class="emoji-trigger-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="emoji-picker-panel">
          ${recent.length ? emojiPickerSection(t("recentEmojis"), recent, emoji) : ""}
          <div class="emoji-picker-all" role="group" aria-label="${esc(t("emoji"))}">
            ${emojiPickerGrid(EMOJI_CATALOG, emoji, "emoji-grid--catalog")}
          </div>
          <button class="btn-soft emoji-clear" type="button" data-action="clear-emoji">${t("clearEmoji")}</button>
        </div>
      </details>
    </div>
  </label>`;
}

function colorSwatches(selectedColor = "") {
  const currentColor = safeColor(selectedColor || "#6366f1");
  return `<div class="color-swatch-list">${ROUTINE_COLOR_SWATCHES.map((color) => `<button class="color-swatch ${currentColor === color ? "is-selected" : ""}" type="button" data-action="pick-color" data-color="${color}"${styleVars({ "--swatch": color })} aria-label="${esc(`${t("color")} ${color}`)}"></button>`).join("")}</div>`;
}

function describeTodoDue(value) {
  return value ? dateLabel(value) : t("inbox");
}

function timeLabel(value) {
  if (!value) return t("notAvailable");
  return new Intl.DateTimeFormat(state.locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateTimeLabel(value) {
  if (!value) return t("notAvailable");
  return new Intl.DateTimeFormat(state.locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

function subscriptionPlanCode() {
  return state.billingOverview?.subscription?.plan?.code ?? "";
}

function remainingRoutineCount() {
  return state.today?.routines.filter((routine) => routine.progress.rate < 1).length ?? 0;
}

function formatCountLabel(value, singularKey, pluralKey = singularKey) {
  if (state.locale === "en") {
    return `${value} ${t(value === 1 ? singularKey : pluralKey)}`;
  }
  return `${value}${t(pluralKey)}`;
}

function markActionNow() {
  state.lastActionAt = new Date().toISOString();
}

function setInlineFeedback(scope, message, error = false) {
  state.inlineFeedback = {
    scope,
    message: resolveMessage(message),
    error,
  };
}

function inlineFeedback(scope) {
  if (state.inlineFeedback?.scope !== scope) return "";
  return `<p class="inline-feedback ${state.inlineFeedback.error ? "is-error" : ""}">${esc(state.inlineFeedback.message)}</p>`;
}

function isPending(actionId) {
  return state.pendingActionId === actionId;
}

function disabledAttr(actionId) {
  return isPending(actionId) ? ' disabled aria-busy="true"' : "";
}

function toggleButton(actionId, expanded, label) {
  return `<button class="btn-soft section-toggle ${expanded ? "is-open" : ""}" type="button" data-action="${actionId}" aria-expanded="${String(expanded)}">${esc(label)}</button>`;
}

function todoMatchesSearch(todo) {
  const query = state.todoSearchQuery.trim().toLowerCase();
  if (!query) return true;
  return [todo.title, todo.note ?? "", todo.emoji ?? ""].some((value) =>
    String(value).toLowerCase().includes(query),
  );
}

function todoMatchesDueFilter(todo) {
  const today = state.today?.date ?? "";
  if (state.todoDueFilter === "today") return todo.dueDate === today;
  if (state.todoDueFilter === "upcoming") return Boolean(todo.dueDate && todo.dueDate > today);
  if (state.todoDueFilter === "unscheduled") return todo.dueDate === null;
  return true;
}

function todoCardClasses(todo, baseClass = "todo-card") {
  const classes = [baseClass];
  if (state.highlightTodoId === todo.id) classes.push("is-highlight");
  if (isPending(`todo-${todo.id}`)) classes.push("is-pending");
  return classes.join(" ");
}

function todayFocusCards() {
  if (!state.today) return "";
  const cards = [
    [t("focusRemainingRoutines"), formatCountLabel(remainingRoutineCount(), "routineUnit", "routineUnits")],
    [t("focusTodayTodos"), formatCountLabel(state.today.summary.dueTodayCount, "todoUnit", "todoUnits")],
    [t("focusLastCheck"), timeLabel(state.lastActionAt)],
  ];
  return cards
    .map(
      ([label, value]) =>
        `<div class="focus-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`,
    )
    .join("");
}

function routineDraftPreview(routine = {}) {
  const emoji = sanitizeEmojiInput(routine.emoji) || "🎯";
  const color = safeColor(routine.color || "#6366f1");
  const name = String(routine.name ?? "").trim() || t("routinePreviewTitle");
  return `<aside class="draft-preview-card" data-role="draft-preview" data-preview-kind="routine"${accentStyle(color)}>
    <div class="draft-preview-head">
      <span class="section-label">${t("livePreview")}</span>
      ${emojiBadge(emoji, "xl")}
    </div>
    <strong data-role="draft-title">${esc(name)}</strong>
    <p class="muted draft-preview-copy" data-role="draft-meta">${t("routinePreviewHint")}</p>
    <div class="preview-accent">
      <span class="dot"></span>
      <span>${color}</span>
    </div>
  </aside>`;
}

function todoDraftPreview(todo = {}) {
  const emoji = sanitizeEmojiInput(todo.emoji) || "📝";
  const title = String(todo.title ?? "").trim() || t("todoPreviewTitle");
  const dueDate = String(todo.dueDate ?? "");
  return `<aside class="draft-preview-card" data-role="draft-preview" data-preview-kind="todo">
    <div class="draft-preview-head">
      <span class="section-label">${t("livePreview")}</span>
      ${emojiBadge(emoji, "xl")}
    </div>
    <strong data-role="draft-title">${esc(title)}</strong>
    <p class="muted draft-preview-copy" data-role="draft-meta">${esc(`${t("pending")} · ${describeTodoDue(dueDate)}`)}</p>
    <div class="state-pill">${t("createTodo")}</div>
  </aside>`;
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
  const node = document.getElementById("feedback");
  if (!node) return;
  node.textContent = message;
  node.style.color = message ? (error ? "var(--danger)" : "var(--accent)") : "";
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function textAll(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function setDocumentMeta() {
  document.documentElement.lang = state.locale;
  document.title = t("appTitle");
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("appDescription"));
}

function applyStaticText() {
  setDocumentMeta();
  text("language-label", t("language"));
  text("settings-summary", t("settings"));
  text("settings-button", t("settings"));
  text("app-nav-label", t("manageMenu"));
  text("app-nav-title", t("appTitle"));
  text("app-utility-title", t("appTitle"));
  text("hero-title", t("heroTitle"));
  text("hero-copy", t("heroCopy"));
  text("hero-label-set", t("heroSet"));
  text("hero-label-rate", t("heroRate"));
  text("hero-label-streak", t("heroStreak"));
  text("hero-label-date", t("heroDate"));
  textAll('[data-tab="today"]', t("today"));
  textAll('[data-tab="routines"]', t("routines"));
  textAll('[data-tab="todos"]', t("todos"));
  textAll('[data-tab="calendar"]', t("calendar"));
  textAll('[data-tab="stats"]', t("stats"));
  textAll('[data-tab="settings"]', t("settings"));
  textAll('[data-tab="admin"]', t("admin"));
  text("theme-label", t("theme"));
  text("density-label", t("density"));
  const drawer = document.querySelector(".app-nav-drawer");
  if (drawer) {
    drawer.setAttribute("aria-label", t("plannerSections"));
  }
  const mobileTabBar = document.querySelector('[data-role="mobile-tab-bar"]');
  if (mobileTabBar) {
    mobileTabBar.setAttribute("aria-label", t("plannerSections"));
  }
  const select = document.getElementById("language-select");
  if (select instanceof HTMLSelectElement) {
    select.value = state.locale;
    for (const option of select.options) {
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

function resolveMessage(message) {
  if (!message) return "";
  return MESSAGES[state.locale]?.[message] ? t(message) : message;
}

function trackingUnitLabel(trackingType) {
  return trackingType === "time" ? t("timeUnit") : t("countUnit");
}

function trackingTypeLabel(trackingType) {
  if (trackingType === "count") return t("typeCount");
  if (trackingType === "time") return t("typeTime");
  return t("typeBinary");
}

function trackingStep(item) {
  return item.trackingType === "time" ? 10 : 1;
}

function trackingConfig(trackingType) {
  if (trackingType === "count") return { min: 2, step: 1, value: 2, readonly: false };
  if (trackingType === "time") return { min: 1, step: 5, value: 30, readonly: false };
  return { min: 1, step: 1, value: 1, readonly: true };
}

function targetSummary(item) {
  if (item.trackingType === "binary") {
    return `${t("typeBinary")} · ${percent(item.progressRate)}`;
  }
  return `${item.currentCount}/${item.targetCount} ${trackingUnitLabel(item.trackingType)} · ${percent(item.progressRate)}`;
}

function compactTrackingValue(item) {
  if (item.trackingType === "time") {
    return `${item.currentCount}/${item.targetCount}${trackingUnitLabel(item.trackingType)}`;
  }
  return `${item.currentCount}/${item.targetCount}`;
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
  if (res.status === 401 && !preserveAuthOn401 && state.authToken) {
    clearAuthState();
    clearPlannerState();
    render();
    redirectToLogin();
  }
  if (!res.ok) throw new Error(data?.message ?? t("actionFailed"));
  return data;
}

async function refreshHealth() {
  const health = await api("/api/health", { skipAuth: true, preserveAuthOn401: true });
  state.authAvailable = health?.authAvailable ?? health?.storageDriver === "mysql";
  state.authRequired = Boolean(health?.authRequired);
  return health;
}

async function refreshBillingPlans() {
  if (!state.authAvailable) {
    state.billingPlans = [];
    return;
  }
  const result = await api("/api/billing/plans", { skipAuth: true, preserveAuthOn401: true });
  state.billingPlans = result?.plans ?? [];
}

async function refreshSession({ silent = false } = {}) {
  if (!state.authAvailable || !state.authToken) {
    clearAuthState();
    return null;
  }
  try {
    const result = await api("/api/auth/me");
    state.authUser = result?.user ?? null;
    state.billingOverview = result?.billing ?? null;
    if (state.authUser) {
      setAccountSection(state.accountSection === "plans" ? "billing" : "profile");
    }
    return result;
  } catch (error) {
    clearAuthState();
    if (!silent) {
      feedback(error instanceof Error ? error.message : t("actionFailed"), true);
    }
    return null;
  }
}

async function refreshAdminData() {
  if (!canAccessAdmin()) {
    clearAdminState();
    if (state.activeTab === "admin") {
      state.activeTab = "today";
    }
    return;
  }
  const [overview, users, subscriptions, sessions, logs] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/users"),
    api("/api/admin/subscriptions"),
    api("/api/admin/sessions"),
    api("/api/admin/logs"),
  ]);
  state.adminOverview = overview;
  state.adminUsers = users?.users ?? [];
  state.adminSubscriptions = subscriptions?.subscriptions ?? [];
  state.adminSessions = sessions?.sessions ?? [];
  state.adminLogs = logs?.logs ?? [];
}

function currentHomeDate() {
  if (isValidDateKey(state.selectedHomeDate)) {
    return state.selectedHomeDate;
  }
  if (isValidDateKey(state.today?.date ?? "")) {
    return state.today.date;
  }
  return "";
}

function syncHomeDateState(date) {
  if (!isValidDateKey(date)) {
    return;
  }
  state.selectedHomeDate = date;
  if (!state.visibleHomeWeekStart || !buildWeekDates(state.visibleHomeWeekStart).includes(date)) {
    state.visibleHomeWeekStart = getMondayWeekStart(date);
  }
}

function todayApiPath(date = currentHomeDate()) {
  return isValidDateKey(date) ? `/api/today?date=${encodeURIComponent(date)}` : "/api/today";
}

async function refreshTodayData({ renderAfter = true } = {}) {
  const today = await api(todayApiPath());
  state.today = today;
  syncHomeDateState(today.date);
  if (renderAfter) {
    render();
  }
  return today;
}

async function refreshAll(message = "") {
  if (plannerLocked()) {
    clearPlannerState();
    clearAdminState();
    redirectToLogin();
    return;
  }
  try {
    const statsQuery =
      state.statsRange === "custom" && state.customStatsStart && state.customStatsEnd
        ? `?range=custom&start=${state.customStatsStart}&end=${state.customStatsEnd}`
        : `?range=${state.statsRange}`;
    const [today, routines, routineTaskTemplates, routineSets, assignments, todos, calendar, stats] =
      await Promise.all([
        api(todayApiPath()),
        api("/api/routines"),
        api("/api/routine-task-templates"),
        api("/api/routine-sets"),
        api("/api/assignments"),
        api("/api/todos"),
        api(`/api/calendar?month=${state.selectedMonth}`),
        api(`/api/stats${statsQuery}`),
      ]);
    state.today = today;
    state.routines = routines.routines;
    state.routineTaskTemplates = routineTaskTemplates.routineTaskTemplates;
    state.routineSets = routineSets.routineSets;
    state.assignments = assignments.assignments;
    state.todos = todos.todos;
    state.calendar = calendar;
    state.stats = stats;
    syncHomeDateState(today.date);
    if (state.highlightTodoId && !state.todos.some((todo) => todo.id === state.highlightTodoId)) {
      state.highlightTodoId = "";
    }
    state.selectedDate ||= today.date;
    state.override = await api(`/api/overrides/${state.selectedDate}`);
    await refreshAdminData();
    render();
    feedback("");
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("loadFailed"), true);
  }
}

function setPlannerVisibility(isVisible) {
  const accountVisible = state.authAvailable && Boolean(state.authUser);
  const adminVisible = canAccessAdmin();
  document.querySelectorAll('[data-tab="admin"]').forEach((button) => {
    button.hidden = !adminVisible;
  });
  if (!accountVisible && state.activeTab === "account") {
    state.activeTab = "today";
  }
  if (!adminVisible && state.activeTab === "admin") {
    state.activeTab = "today";
  }
  document.querySelectorAll(".app-nav-button").forEach((button) => {
    if (button.dataset.tab === "admin") {
      button.hidden = !adminVisible;
    }
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isActive = panel.id === `tab-${state.activeTab}`;
    panel.toggleAttribute("hidden", !isActive);
    panel.classList.toggle("is-active", isActive);
    if (!isActive) {
      panel.innerHTML = "";
    }
  });
}

function authModeButton(mode, label) {
  const selected = state.authMode === mode;
  return `<button class="segment-button ${selected ? "is-selected" : ""}" type="button" data-action="auth-mode" data-mode="${mode}" aria-pressed="${String(selected)}">${esc(label)}</button>`;
}

function authPlanCard(plan, interactive = false) {
  const currentPlan = subscriptionPlanCode();
  const isCurrent = currentPlan === plan.code;
  const disabled = interactive && (isCurrent || isPending(`billing-${plan.code}`));
  const localized = localizedBillingPlan(plan);
  return `<article class="content-card content-card--stat billing-plan-card ${isCurrent ? "is-current" : ""}">
    <div class="billing-plan-head">
      <div>
        <div class="billing-plan-title-line">
          <strong>${esc(localized.name)}</strong>
          ${localized.intervalLabel ? `<span class="state-pill ${isCurrent ? "is-success" : ""}">${esc(localized.intervalLabel)}</span>` : ""}
        </div>
        <div class="muted">${esc(localized.description)}</div>
      </div>
    </div>
    <div class="billing-price">${esc(moneyLabel(plan.priceMinor, plan.currency))}</div>
    ${interactive ? `<div class="actions top-gap-sm"><button class="btn-soft compact-action" type="button" data-action="activate-plan" data-plan-code="${plan.code}"${disabled ? ' disabled aria-busy="true"' : ""}>${isCurrent ? t("billingCurrentPlan") : t("billingActivate")}</button></div>` : ""}
  </article>`;
}

function sidebarNavButton({ section, activeSection, action, label, meta = "" }) {
  const selected = section === activeSection;
  return `<button class="secondary-tab ${selected ? "is-selected" : ""}" type="button" data-action="${action}" data-section="${section}" aria-pressed="${String(selected)}">
    <strong>${esc(label)}</strong>
    ${meta ? `<span>${esc(meta)}</span>` : ""}
  </button>`;
}

function managementShell({
  shellClass = "",
  title,
  items,
  content,
}) {
  return `<div class="management-shell ${shellClass}">
    <article class="panel section management-tabs-panel">
      <div class="section-head section-head-tight">
        <div>
          <p class="section-label">${esc(t("manageMenu"))}</p>
          <h2>${esc(title)}</h2>
        </div>
      </div>
      <nav class="secondary-tabs" aria-label="${esc(title)}">${items.join("")}</nav>
    </article>
    <div class="management-content">
      ${content}
    </div>
  </div>`;
}

function renderGuestShell() {
  const plans = state.billingPlans.length
    ? state.billingPlans.map((plan) => authPlanCard(plan)).join("")
    : `<div class="content-card collapsed-summary"><strong>${t("billingTitle")}</strong><p class="muted">${t("billingLoading")}</p></div>`;
  setAccountSection(state.accountSection);
  const items = [
    sidebarNavButton({
      section: "auth",
      activeSection: state.accountSection,
      action: "select-account-section",
      label: t("login"),
      meta: t(state.authMode === "register" ? "register" : "login"),
    }),
    sidebarNavButton({
      section: "plans",
      activeSection: state.accountSection,
      action: "select-account-section",
      label: t("billingTitle"),
      meta: t("billingPlanExplorer"),
    }),
  ];
  const content =
    state.accountSection === "plans"
      ? `<article class="panel section management-panel">
          <div class="section-head"><div><p class="section-label">${t("billingTitle")}</p><h2>${t("billingPlanExplorer")}</h2></div></div>
          <p class="muted auth-copy">${t("billingGuestCopy")}</p>
          <div class="stack">${plans}</div>
        </article>`
      : `<article class="panel section management-panel">
          <div class="section-head auth-panel-head">
            <div>
              <p class="section-label">${t("account")}</p>
              <h2>${t(state.authRequired ? "authRequiredTitle" : "authOptionalTitle")}</h2>
            </div>
            ${state.authRequired ? `<span class="pill">${t("authRequiredBadge")}</span>` : `<span class="state-pill">${t("authOptionalBadge")}</span>`}
          </div>
          <p class="muted auth-copy">${t(state.authRequired ? "authRequiredCopy" : "authOptionalCopy")}</p>
          <div class="segmented auth-mode-toggle">
            ${authModeButton("login", t("login"))}
            ${authModeButton("register", t("register"))}
          </div>
          <form class="content-card content-card--form auth-form" data-form="${state.authMode === "register" ? "auth-register" : "auth-login"}">
            <div class="form-grid">
              ${state.authMode === "register" ? `<label class="field"><span>${t("displayName")}</span><input name="displayName" autocomplete="name" /></label>` : ""}
              <label class="field"><span>${t("email")}</span><input name="email" type="email" autocomplete="${state.authMode === "register" ? "email" : "username"}" required /></label>
              <label class="field"><span>${t("password")}</span><input name="password" type="password" autocomplete="${state.authMode === "register" ? "new-password" : "current-password"}" required minlength="8" /></label>
            </div>
            ${inlineFeedback(state.authMode === "register" ? "auth-register" : "auth-login")}
            <div class="actions">
              <button class="btn" type="submit"${disabledAttr(state.authMode === "register" ? "auth-register" : "auth-login")}>${t(state.authMode === "register" ? "registerAction" : "loginAction")}</button>
            </div>
          </form>
        </article>`;
  return managementShell({
    shellClass: "management-shell--account",
    title: t("accountWorkspace"),
    items,
    content,
  });
}

function renderAccountShell() {
  const subscription = state.billingOverview?.subscription ?? null;
  const plans = state.billingOverview?.plans ?? state.billingPlans;
  const periodEnd = subscription?.currentPeriodEnd ? dateLabel(subscription.currentPeriodEnd.slice(0, 10)) : t("notAvailable");
  setAccountSection(state.accountSection);
  const items = [
    sidebarNavButton({
      section: "profile",
      activeSection: state.accountSection,
      action: "select-account-section",
      label: t("account"),
      meta: state.authUser?.displayName ?? state.authUser?.email ?? "",
    }),
    sidebarNavButton({
      section: "billing",
      activeSection: state.accountSection,
      action: "select-account-section",
      label: t("billingTitle"),
      meta: subscription?.plan?.name ?? t("billingNoPlan"),
    }),
  ];
  const content =
    state.accountSection === "billing"
      ? `<article class="panel section management-panel">
          <div class="section-head auth-panel-head">
            <div>
              <p class="section-label">${t("billingTitle")}</p>
              <h2>${t("billingManageTitle")}</h2>
            </div>
            ${subscription ? `<span class="pill">${esc(subscription.status)}</span>` : `<span class="state-pill">${t("billingNoPlan")}</span>`}
          </div>
          <p class="muted auth-copy">${t("billingManageCopy")}</p>
          ${inlineFeedback("billing")}
          <div class="stack">${plans.map((plan) => authPlanCard(plan, true)).join("")}</div>
        </article>`
      : `<article class="panel section management-panel account-panel">
          <div class="section-head auth-panel-head">
            <div>
              <p class="section-label">${t("account")}</p>
              <h2>${esc(state.authUser?.displayName ?? state.authUser?.email ?? t("account"))}</h2>
            </div>
            <button class="btn-soft compact-action" type="button" data-action="logout"${disabledAttr("auth-logout")}>${t("logout")}</button>
          </div>
          <div class="summary-grid">
            <div class="summary-card"><span>${t("email")}</span><strong class="summary-compact">${esc(state.authUser?.email ?? "-")}</strong></div>
            <div class="summary-card"><span>${t("billingCurrentPlan")}</span><strong>${esc(subscription?.plan?.name ?? t("billingNoPlan"))}</strong></div>
            <div class="summary-card"><span>${t("billingRenewal")}</span><strong>${esc(periodEnd)}</strong></div>
          </div>
          ${canAccessAdmin() ? `<div class="top-gap account-admin-shortcut">
            <div class="content-card content-card--stat">
              <div class="row-between">
                <div>
                  <span class="section-label">${t("admin")}</span>
                  <strong class="summary-compact">${t("adminWorkspace")}</strong>
                </div>
                <button class="btn-soft compact-action" type="button" data-action="open-admin-workspace">${t("adminOverviewTitle")}</button>
              </div>
            </div>
          </div>` : ""}
        </article>`;
  return managementShell({
    shellClass: "management-shell--account",
    title: t("accountWorkspace"),
    items,
    content,
  });
}

function renderAuthShell() {
  const target = document.getElementById("tab-account");
  if (!target) return;
  if (!state.authAvailable || !state.authUser) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = renderAccountShell();
}

function renderUserEntry() {
  const entry = document.getElementById("tab-button-account");
  if (!(entry instanceof HTMLButtonElement)) return;
  if (!state.authAvailable || !state.authUser) {
    entry.hidden = true;
    entry.innerHTML = "";
    entry.setAttribute("aria-expanded", "false");
    return;
  }
  const label = state.authUser.displayName || state.authUser.email || t("account");
  const meta = state.authUser.displayName ? state.authUser.email || "" : t("account");
  const initial = Array.from(label.trim())[0] ?? "U";
  entry.hidden = false;
  entry.classList.toggle("is-active", state.activeTab === "account");
  entry.setAttribute("aria-expanded", String(state.activeTab === "account"));
  entry.setAttribute("aria-label", `${t("account")}: ${label}`);
  entry.innerHTML = `
    <span class="user-entry-avatar" aria-hidden="true">${esc(initial.toUpperCase())}</span>
    <span class="user-entry-copy">
      <strong>${esc(label)}</strong>
      <span>${esc(meta)}</span>
    </span>
  `;
}

function render() {
  renderApp();
}

function renderAppNav() {
  const shell = document.querySelector(".app-nav-shell");
  if (!shell) return;
  if (isMobileViewport()) {
    state.appNavOpen = false;
    shell.classList.remove("is-open");
    return;
  }
  shell.classList.toggle("is-open", state.appNavOpen);
}

function renderHero() {
  renderHeroPanel();
}

function renderTabs() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle("is-active", isActive);
    if (button.classList.contains("app-nav-button")) {
      button.setAttribute("aria-selected", String(isActive));
    }
    if (button.classList.contains("mobile-tab-button")) {
      button.setAttribute("aria-pressed", String(isActive));
    }
    button.tabIndex = isActive ? 0 : -1;
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isActive = panel.id === `tab-${state.activeTab}`;
    panel.classList.toggle("is-active", isActive);
    panel.toggleAttribute("hidden", !isActive);
  });
}

function renderToday() {
  renderTodayHomePage();
}

function todayRoutine(routine) {
  const hideCompleted = isMobileViewport()
    ? !state.revealedCompletedRoutineIds.has(routine.id)
    : state.collapsedRoutineCompletedIds.has(routine.id);
  const completedCount = routine.items.filter((item) => item.isComplete).length;
  const visibleItems = hideCompleted ? routine.items.filter((item) => !item.isComplete) : routine.items;
  return `<article class="routine-card routine-card--today ${isPending(`routine-${routine.id}`) ? "is-pending" : ""}"${accentStyle(routine.color)}>
    <div class="routine-head">
      <div class="routine-name">
        ${emojiBadge(routine.emoji, "lg")}
        <div>
          <strong>${esc(routine.name)}</strong>
          <div class="muted">${routine.progress.completedUnits}/${routine.progress.targetUnits}</div>
        </div>
      </div>
      <div class="inline-actions">
        ${completedCount ? `<button class="btn-soft compact-action" type="button" data-action="toggle-completed-items" data-routine-id="${routine.id}" aria-pressed="${String(hideCompleted)}">${hideCompleted ? t("showCompleted") : t("hideCompleted")}</button>` : ""}
        <span class="pill tag-teal">${percent(routine.progress.rate)}</span>
      </div>
    </div>
    <div class="progress-track"><div class="progress-fill"${progressStyle(routine.progress.rate)}></div></div>
    ${inlineFeedback(`routine-${routine.id}`)}
    <div class="routine-items">${visibleItems.length ? visibleItems.map((item) => todayItem(routine.id, item)).join("") : empty(t("allCompletedHidden"))}</div>
  </article>`;
}

function todayItem(routineId, item) {
  if (isMobileViewport()) {
    if (item.trackingType === "binary") {
      return `<div class="routine-item-row routine-item-row--binary ${item.isComplete ? "is-complete" : ""}">
        <div class="routine-item-row-copy">
          <strong>${esc(item.title)}</strong>
        </div>
        <span class="state-pill routine-item-row-value ${item.isComplete ? "is-success" : ""}">${item.isComplete ? t("done") : t("open")}</span>
        <span class="routine-item-row-toggle">
          <input type="checkbox" data-action="toggle-binary" data-routine-id="${routineId}" data-item-id="${item.id}" ${item.currentCount >= 1 ? "checked" : ""} aria-label="${esc(item.title)}" ${isPending(`routine-${routineId}`) ? "disabled" : ""} />
        </span>
      </div>`;
    }
    return `<div class="routine-item-row routine-item-row--counter ${item.isComplete ? "is-complete" : ""}">
      <div class="routine-item-row-copy">
        <strong>${esc(item.title)}</strong>
      </div>
      <strong class="routine-item-row-value ${item.isComplete ? "is-complete" : ""}">${esc(compactTrackingValue(item))}</strong>
      <div class="counter">
        <button class="counter-button" type="button" data-action="adjust-progress" data-direction="-1" data-routine-id="${routineId}" data-item-id="${item.id}" aria-label="${esc(`${t("decrease")} ${item.title}`)}"${disabledAttr(`routine-${routineId}`)}>-</button>
        <strong class="counter-value">${item.currentCount}</strong>
        <button class="counter-button" type="button" data-action="adjust-progress" data-direction="1" data-routine-id="${routineId}" data-item-id="${item.id}" aria-label="${esc(`${t("increase")} ${item.title}`)}"${disabledAttr(`routine-${routineId}`)}>+</button>
      </div>
    </div>`;
  }
  if (item.trackingType === "binary") {
    return `<div class="item-card item-card--check ${item.isComplete ? "is-complete" : ""}">
      <label class="check-row">
        <span class="check-main">
          <input type="checkbox" data-action="toggle-binary" data-routine-id="${routineId}" data-item-id="${item.id}" ${item.currentCount >= 1 ? "checked" : ""} ${isPending(`routine-${routineId}`) ? "disabled" : ""} />
          <span class="check-copy">
            <strong>${esc(item.title)}</strong>
            <span class="muted">${trackingTypeLabel(item.trackingType)}</span>
          </span>
        </span>
        <span class="state-pill ${item.isComplete ? "is-success" : ""}">${item.isComplete ? t("done") : t("open")}</span>
      </label>
    </div>`;
  }
  return `<div class="item-card item-card--counter">
    <div class="count-row">
      <div class="count-copy">
        <strong>${esc(item.title)}</strong>
        <div class="muted">${trackingTypeLabel(item.trackingType)} · ${targetSummary(item)}</div>
      </div>
      <div class="counter">
        <button class="counter-button" type="button" data-action="adjust-progress" data-direction="-1" data-routine-id="${routineId}" data-item-id="${item.id}" aria-label="${esc(`${t("decrease")} ${item.title}`)}"${disabledAttr(`routine-${routineId}`)}>-</button>
        <strong class="counter-value">${item.currentCount}</strong>
        <button class="counter-button" type="button" data-action="adjust-progress" data-direction="1" data-routine-id="${routineId}" data-item-id="${item.id}" aria-label="${esc(`${t("increase")} ${item.title}`)}"${disabledAttr(`routine-${routineId}`)}>+</button>
      </div>
    </div>
  </div>`;
}

function renderRoutines() {
  return renderRoutinesPage();
  const target = document.getElementById("tab-routines");
  if (!target) return;
  target.innerHTML = `<div class="layout-2 layout-workspace workspace-two-pane">
    <div class="stack workspace-sidebar">
      <article class="panel section section-elevated creator-panel">
        <div class="section-head"><div><p class="section-label">${t("createRoutine")}</p><h2>${t("createRoutineHeading")}</h2></div>${toggleButton("toggle-routine-create", state.isRoutineCreateOpen, state.isRoutineCreateOpen ? t("hideCreateRoutine") : t("openCreateRoutine"))}</div>
        ${state.isRoutineCreateOpen ? `<form class="content-card content-card--form" data-form="routine-create">
          <div class="create-flow">
            <div class="stack">
              ${routineFields()}
              ${inlineFeedback("routine-create")}
              <div class="actions"><button class="btn" type="submit">${t("createRoutine")}</button></div>
            </div>
            ${routineDraftPreview({ color: "#6366f1" })}
          </div>
        </form>` : `<div class="content-card collapsed-summary"><strong>${t("createRoutinePrompt")}</strong><p class="muted">${t("createRoutineHint")}</p></div>`}
      </article>
      <article class="panel section creator-panel">
        <div class="section-head"><div><p class="section-label">${t("createSet")}</p><h2>${t("routineSetsHeading")}</h2></div>${toggleButton("toggle-routine-set-create", state.isRoutineSetCreateOpen, state.isRoutineSetCreateOpen ? t("hideCreateSet") : t("openCreateSet"))}</div>
        ${state.isRoutineSetCreateOpen ? `<form class="content-card content-card--form" data-form="routine-set-create">${routineSetFields()}${inlineFeedback("routine-set-create")}<div class="actions"><button class="btn" type="submit">${t("createSet")}</button></div></form>` : `<div class="content-card collapsed-summary"><strong>${t("createSetPrompt")}</strong><p class="muted">${t("createSetHint")}</p></div>`}
      </article>
    </div>
    <div class="stack workspace-main">
      <article class="panel section workspace-panel">
        <div class="section-head"><div><p class="section-label">${t("routineEditor")}</p><h2>${t("routineEditor")}</h2></div></div>
        <div class="stack">${state.routines.length ? state.routines.map(routineEditor).join("") : empty(t("noRoutines"), { label: t("openCreateRoutine"), action: "open-routine-create" })}</div>
      </article>
      <article class="panel section workspace-panel">
        <div class="section-head"><div><p class="section-label">${t("routineSetsHeading")}</p><h2>${t("routineSetsHeading")}</h2></div></div>
        <div class="stack">${state.routineSets.length ? state.routineSets.map(routineSetEditor).join("") : empty(t("noRoutineSets"), { label: t("openCreateSet"), action: "open-routine-set-create" })}</div>
      </article>
    </div>
  </div>`;
}

function routineFields(routine = {}) {
  return `<div class="form-grid">
    ${emojiField(routine.emoji ?? "")}
    <label class="field"><span>${t("name")}</span><input name="name" required value="${esc(routine.name ?? "")}" /></label>
    <label class="field field-color"><span>${t("color")}</span><div class="color-input-shell"><input class="color-input" name="color" type="color" value="${esc(routine.color ?? "#6366f1")}" /></div>${colorSwatches(routine.color ?? "#6366f1")}</label>
    <label class="field"><span>${t("status")}</span><select name="isArchived"><option value="false" ${routine.isArchived ? "" : "selected"}>${t("active")}</option><option value="true" ${routine.isArchived ? "selected" : ""}>${t("archived")}</option></select></label>
  </div>`;
}

function renderTrackingTypeOptions(selected) {
  return `<option value="binary" ${selected === "binary" ? "selected" : ""}>${t("typeBinary")}</option><option value="count" ${selected === "count" ? "selected" : ""}>${t("typeCount")}</option><option value="time" ${selected === "time" ? "selected" : ""}>${t("typeTime")}</option>`;
}

function targetInput(name, trackingType, value) {
  const config = trackingConfig(trackingType);
  return `<input name="${name}" type="number" min="${config.min}" step="${config.step}" value="${value ?? config.value}" ${config.readonly ? "readonly" : ""} />`;
}

function trackingGuide() {
  return `<p class="muted helper-text">${t("targetGuide")}</p>`;
}

function routineEditor(routine) {
  const expanded = state.expandedRoutineIds.has(routine.id);
  return `<article class="routine-card routine-card--editor"${accentStyle(routine.color)}>
    <form data-form="routine-update" data-id="${routine.id}">
      <div class="routine-head">
        <div class="routine-name">
          ${emojiBadge(routine.emoji, "lg")}
          <div>
            <strong>${esc(routine.name)}</strong>
            <div class="muted">${t("itemsCount", { count: routine.items.length })}</div>
          </div>
        </div>
        <div class="inline-actions">
          <button class="btn-soft compact-action" type="button" data-action="toggle-routine-items" data-routine-id="${routine.id}" aria-expanded="${String(expanded)}">${expanded ? t("hideItems") : t("manageItems")}</button>
          <button class="btn-danger" type="button" data-action="delete-routine" data-id="${routine.id}">${t("delete")}</button>
        </div>
      </div>
      ${routineFields(routine)}
      <div class="actions"><button class="btn-soft" type="submit">${t("saveRoutine")}</button></div>
    </form>
    ${inlineFeedback(`routine-editor-${routine.id}`)}
    <div class="routine-items ${expanded ? "" : "is-collapsed"}">
      ${expanded ? (routine.items.length ? routine.items.map((item) => routineItemEditor(routine.id, item)).join("") : empty(t("noRoutineItems"))) : `<div class="content-card collapsed-summary"><strong>${t("itemsCount", { count: routine.items.length })}</strong><p class="muted">${t("manageItemsHint")}</p></div>`}
      ${expanded ? `<form class="item-card" data-form="routine-item-create" data-routine-id="${routine.id}">
        <div class="form-grid">
          <label class="field"><span>${t("itemName")}</span><input name="title" required /></label>
          <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions("binary")}</select></label>
          <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", "binary", 1)}</label>
        </div>
        ${trackingGuide()}
        <div class="actions"><button class="btn" type="submit">${t("addItem")}</button></div>
      </form>` : ""}
    </div>
  </article>`;
}

function routineItemEditor(routineId, item) {
  return `<form class="item-card" data-form="routine-item-update" data-routine-id="${routineId}" data-item-id="${item.id}">
    <div class="form-grid">
      <label class="field"><span>${t("itemName")}</span><input name="title" required value="${esc(item.title)}" /></label>
      <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions(item.trackingType)}</select></label>
      <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", item.trackingType, item.targetCount)}</label>
      <label class="field"><span>${t("sortOrder")}</span><input name="sortOrder" type="number" min="1" value="${item.sortOrder}" /></label>
      <label class="field"><span>${t("status")}</span><select name="isActive"><option value="true" ${item.isActive ? "selected" : ""}>${t("active")}</option><option value="false" ${item.isActive ? "" : "selected"}>${t("inactive")}</option></select></label>
    </div>
    ${trackingGuide()}
    <div class="actions"><button class="btn-soft" type="submit">${t("saveItem")}</button><button class="btn-danger" type="button" data-action="delete-routine-item" data-routine-id="${routineId}" data-item-id="${item.id}">${t("deleteItem")}</button></div>
  </form>`;
}

function routineChoiceItem(routine, fieldName, checked) {
  return `<label class="choice-item">
    <input type="checkbox" name="${fieldName}" value="${routine.id}" ${checked ? "checked" : ""} />
    ${emojiBadge(routine.emoji)}
    <span>${esc(routine.name)}</span>
  </label>`;
}

function routineSetFields(routineSet = {}) {
  const selected = new Set(routineSet.routineIds ?? []);
  return `<div class="form-grid">
    <label class="field-wide"><span>${t("setName")}</span><input name="name" required value="${esc(routineSet.name ?? "")}" /></label>
    <div class="field-wide"><span>${t("routines")}</span><div class="choice-list">${state.routines.map((routine) => routineChoiceItem(routine, "routineIds", selected.has(routine.id))).join("")}</div></div>
  </div>`;
}

function routineSetEditor(routineSet) {
  return `<form class="content-card content-card--form" data-form="routine-set-update" data-id="${routineSet.id}">
    <div class="row-between">
      <div><strong>${esc(routineSet.name)}</strong><div class="muted">${t("linkedRoutines", { count: routineSet.routines.length })}</div></div>
      <button class="btn-danger" type="button" data-action="delete-routine-set" data-id="${routineSet.id}">${t("delete")}</button>
    </div>
    <div class="top-gap-sm">${routineSetFields(routineSet)}</div>
    <div class="actions"><button class="btn-soft" type="submit">${t("saveSet")}</button></div>
  </form>`;
}

function renderTodos() {
  const target = document.getElementById("tab-todos");
  if (!target) return;
  const todos = state.todos.filter(
    (todo) =>
      (state.todoFilter === "all" || todo.status === state.todoFilter) &&
      todoMatchesSearch(todo) &&
      todoMatchesDueFilter(todo),
  );
  target.innerHTML = `<div class="layout-2-equal layout-workspace workspace-two-pane">
    <article class="panel section section-elevated workspace-sidebar creator-panel">
      <div class="section-head"><div><p class="section-label">${t("createTodo")}</p><h2>${t("createTodoHeading")}</h2></div>${toggleButton("toggle-todo-create", state.isTodoCreateOpen, state.isTodoCreateOpen ? t("hideCreateTodo") : t("openCreateTodo"))}</div>
      ${state.isTodoCreateOpen ? `<form class="content-card content-card--form" data-form="todo-create">
        <div class="create-flow">
          <div class="stack">
            <div class="form-grid">
              ${emojiField("")}
              <label class="field"><span>${t("title")}</span><input name="title" required /></label>
              <label class="field"><span>${t("date")}</span><input name="dueDate" type="date" /></label>
              <label class="field-wide"><span>${t("note")}</span><textarea name="note"></textarea></label>
            </div>
            ${inlineFeedback("todo-create")}
            <div class="actions"><button class="btn" type="submit">${t("createTodo")}</button></div>
          </div>
          ${todoDraftPreview({})}
        </div>
      </form>` : `<div class="content-card collapsed-summary"><strong>${t("createTodoPrompt")}</strong><p class="muted">${t("createTodoHint")}</p></div>`}
    </article>
    <article class="panel section workspace-main workspace-panel">
      <div class="section-head"><div><p class="section-label">${t("todoList")}</p><h2>${t("todoList")}</h2></div><div class="segmented"><button class="segment-button ${state.todoFilter === "all" ? "is-selected" : ""}" type="button" data-action="todo-filter" data-filter="all" aria-pressed="${state.todoFilter === "all"}">${t("all")}</button><button class="segment-button ${state.todoFilter === "pending" ? "is-selected" : ""}" type="button" data-action="todo-filter" data-filter="pending" aria-pressed="${state.todoFilter === "pending"}">${t("pending")}</button><button class="segment-button ${state.todoFilter === "done" ? "is-selected" : ""}" type="button" data-action="todo-filter" data-filter="done" aria-pressed="${state.todoFilter === "done"}">${t("done")}</button></div></div>
      <div class="content-card content-card--form filter-card">
        <div class="form-grid">
          <label class="field"><span>${t("todoSearch")}</span><input name="todoSearch" value="${esc(state.todoSearchQuery)}" placeholder="${t("todoSearchPlaceholder")}" /></label>
          <label class="field"><span>${t("dueFilter")}</span><select name="todoDueFilter"><option value="all" ${state.todoDueFilter === "all" ? "selected" : ""}>${t("allDates")}</option><option value="today" ${state.todoDueFilter === "today" ? "selected" : ""}>${t("dueToday")}</option><option value="upcoming" ${state.todoDueFilter === "upcoming" ? "selected" : ""}>${t("upcoming")}</option><option value="unscheduled" ${state.todoDueFilter === "unscheduled" ? "selected" : ""}>${t("unscheduled")}</option></select></label>
        </div>
      </div>
      <div class="stack top-gap-sm">${todos.length ? todos.map(todoEditor).join("") : empty(state.todos.length ? t("noTodosMatchFilters") : t("noTodos"), { label: t("openCreateTodo"), action: "open-todo-create" })}</div>
    </article>
  </div>`;
}

function todoStatusLabel(status) {
  return status === "done" ? t("done") : t("pending");
}

function todayTodoCard(todo, context) {
  const isDone = todo.status === "done";
  const quickActionLabel = context === "due" ? t("moveTomorrow") : t("planToday");
  return `<article class="${todoCardClasses(todo, "todo-card todo-card--compact")}">
    <div class="row-between">
      <div class="routine-name">
        ${emojiBadge(todo.emoji)}
        <strong>${esc(todo.title)}</strong>
      </div>
      <span class="state-pill ${todo.status === "done" ? "is-success" : ""}">${todoStatusLabel(todo.status)}</span>
    </div>
    <div class="muted">${describeTodoDue(todo.dueDate)}</div>
    ${todo.note ? `<p class="muted">${esc(todo.note)}</p>` : ""}
    ${inlineFeedback(`todo-${todo.id}`)}
    ${isDone ? "" : `<div class="actions"><button class="btn-soft compact-action" type="button" data-action="complete-todo" data-id="${todo.id}"${disabledAttr(`todo-${todo.id}`)}>${t("done")}</button><button class="btn-soft compact-action" type="button" data-action="${context === "due" ? "move-todo-tomorrow" : "move-todo-today"}" data-id="${todo.id}"${disabledAttr(`todo-${todo.id}`)}>${quickActionLabel}</button></div>`}
  </article>`;
}

function todoEditor(todo) {
  return `<form class="${todoCardClasses(todo)}" data-form="todo-update" data-id="${todo.id}">
    <div class="row-between">
      <div class="routine-name">
        ${emojiBadge(todo.emoji)}
        <div>
          <strong>${esc(todo.title)}</strong>
          <div class="muted">${describeTodoDue(todo.dueDate)}</div>
        </div>
      </div>
      <span class="state-pill ${todo.status === "done" ? "is-success" : ""}">${todoStatusLabel(todo.status)}</span>
    </div>
    ${inlineFeedback(`todo-${todo.id}`)}
    <div class="form-grid top-gap-sm">
      ${emojiField(todo.emoji ?? "")}
      <label class="field"><span>${t("title")}</span><input name="title" required value="${esc(todo.title)}" /></label>
      <label class="field"><span>${t("date")}</span><input name="dueDate" type="date" value="${esc(todo.dueDate ?? "")}" /></label>
      <label class="field"><span>${t("status")}</span><select name="status"><option value="pending" ${todo.status === "pending" ? "selected" : ""}>${t("pending")}</option><option value="done" ${todo.status === "done" ? "selected" : ""}>${t("done")}</option></select></label>
      <label class="field-wide"><span>${t("note")}</span><textarea name="note">${esc(todo.note ?? "")}</textarea></label>
    </div>
    <div class="actions"><button class="btn-soft" type="submit">${t("saveTodo")}</button><button class="btn-danger" type="button" data-action="delete-todo" data-id="${todo.id}">${t("delete")}</button></div>
  </form>`;
}

function renderCalendar() {
  const target = document.getElementById("tab-calendar");
  if (!target) return;
  if (!state.calendar || !state.override) {
    target.innerHTML = "";
    return;
  }
  const isMobile = isMobileViewport();
  const [year, month] = state.selectedMonth.split("-");
  const weekday = state.assignments.find((entry) => entry.ruleType === "weekday");
  const weekend = state.assignments.find((entry) => entry.ruleType === "weekend");
  const override = state.override.override;
  const selectedDay =
    state.calendar.days.find((day) => day.date === state.selectedDate) ?? state.calendar.days[0] ?? null;
  const firstDay = state.calendar.days[0] ? new Date(`${state.calendar.days[0].date}T00:00:00Z`).getUTCDay() : 0;
  const selectedDayMarkup = selectedDay
    ? `<article class="panel section calendar-focus-card workspace-panel">
        <div class="section-head"><div><p class="section-label">${t("calendarFocusTitle")}</p><h2>${dateLabel(selectedDay.date)}</h2></div><span class="pill">${esc(selectedDay.setName ?? t("noSet"))}</span></div>
        ${isMobile ? `<div class="calendar-focus-inline">
          <span class="calendar-focus-stat">${t("calendarRoutineRate")}: <strong>${percent(selectedDay.routineProgressRate)}</strong></span>
          <span class="calendar-focus-stat">${t("calendarTodoCount")}: <strong>${selectedDay.completedTodoCount}/${selectedDay.todoCount}</strong></span>
          <span class="calendar-focus-stat">${t("calendarOverrideState")}: <strong>${selectedDay.overrideApplied ? t("calendarOverrideOn") : t("calendarOverrideOff")}</strong></span>
        </div>` : `<div class="summary-grid">
          <div class="summary-card"><span>${t("calendarRoutineRate")}</span><strong>${percent(selectedDay.routineProgressRate)}</strong></div>
          <div class="summary-card"><span>${t("calendarTodoCount")}</span><strong>${selectedDay.completedTodoCount}/${selectedDay.todoCount}</strong></div>
          <div class="summary-card"><span>${t("calendarOverrideState")}</span><strong>${selectedDay.overrideApplied ? t("calendarOverrideOn") : t("calendarOverrideOff")}</strong></div>
        </div>`}
      </article>`
    : "";
  target.innerHTML = `<div class="layout-2 layout-workspace workspace-two-pane calendar-layout">
    <article class="panel section section-elevated workspace-main calendar-board-panel">
      <div class="section-head"><div><p class="section-label">${t("calendar")}</p><h2>${t("assignmentCalendar", { year, month })}</h2></div><div class="inline-actions"><button class="btn-soft compact-action" type="button" data-action="change-month" data-direction="-1">${t("prev")}</button><button class="btn-soft compact-action" type="button" data-action="go-to-current-month">${t("goToToday")}</button><button class="btn-soft compact-action" type="button" data-action="change-month" data-direction="1">${t("next")}</button></div></div>
      <div class="calendar-legend">
        <span class="legend-item"><span class="legend-swatch is-progress"></span>${t("calendarRoutineRate")}</span>
        <span class="legend-item"><span class="legend-swatch is-override"></span>${t("calendarOverrideState")}</span>
      </div>
      <div class="calendar-grid">${weekdayLabels().map((label) => `<div class="weekday">${label}</div>`).join("")}${new Array(firstDay).fill("").map(() => '<div class="day-card is-empty"></div>').join("")}${state.calendar.days.map(calendarDay).join("")}</div>
    </article>
    <div class="stack workspace-sidebar calendar-sidebar">
      ${selectedDayMarkup}
      <article class="panel section creator-panel">
        <div class="section-head"><div><p class="section-label">${t("assignmentsHeading")}</p><h2>${t("weekdayWeekend")}</h2></div>${toggleButton("toggle-assignments", state.isAssignmentsOpen, state.isAssignmentsOpen ? t("hideAssignmentsEditor") : t("editBaseAssignments"))}</div>
        ${state.isAssignmentsOpen ? `<form class="content-card content-card--form" data-form="assignments-save"><div class="form-grid"><label class="field"><span>${t("weekdaySet")}</span><select name="weekdaySetId">${setOptions(weekday?.setId ?? "", true)}</select></label><label class="field"><span>${t("weekendSet")}</span><select name="weekendSetId">${setOptions(weekend?.setId ?? "", true)}</select></label></div>${inlineFeedback("assignments")}<div class="actions"><button class="btn" type="submit">${t("saveAssignments")}</button></div></form>` : `<div class="content-card collapsed-summary"><strong>${t("baseAssignmentSummary")}</strong><p class="muted">${t("weekdaySet")}: ${esc(weekday ? state.routineSets.find((set) => set.id === weekday.setId)?.name ?? t("none") : t("none"))} · ${t("weekendSet")}: ${esc(weekend ? state.routineSets.find((set) => set.id === weekend.setId)?.name ?? t("none") : t("none"))}</p></div>`}
      </article>
      <article class="panel section creator-panel">
        <div class="section-head"><div><p class="section-label">${t("overrideHeading")}</p><h2>${t("overrideForDate", { date: dateLabel(state.selectedDate) })}</h2></div>${toggleButton("toggle-override-editor", state.isOverrideEditorOpen, state.isOverrideEditorOpen ? t("hideOverrideEditor") : t("editOverride"))}</div>
        ${state.isOverrideEditorOpen ? `<form class="override-card content-card--form" data-form="override-save" data-date="${state.selectedDate}"><div class="form-grid"><label class="field-wide"><span>${t("forcedSet")}</span><select name="setId">${setOptions(override.setId ?? "", true)}</select></label><div class="field-wide"><span>${t("includeRoutines")}</span><div class="choice-list">${state.routines.map((routine) => routineChoiceItem(routine, "includeRoutineIds", override.includeRoutineIds.includes(routine.id))).join("")}</div></div><div class="field-wide"><span>${t("excludeRoutines")}</span><div class="choice-list">${state.routines.map((routine) => routineChoiceItem(routine, "excludeRoutineIds", override.excludeRoutineIds.includes(routine.id))).join("")}</div></div></div>${inlineFeedback("override")}<div class="actions"><button class="btn" type="submit">${t("saveOverride")}</button></div></form>` : `<div class="content-card collapsed-summary"><strong>${t("calendarOverrideState")}</strong><p class="muted">${override.setId ? `${t("forcedSet")}: ${esc(state.routineSets.find((set) => set.id === override.setId)?.name ?? t("none"))}` : t("calendarOverrideOff")}</p><p class="muted">${t("includeRoutines")}: ${override.includeRoutineIds.length} · ${t("excludeRoutines")}: ${override.excludeRoutineIds.length}</p></div>`}
      </article>
    </div>
  </div>`;
}

function calendarDay(day) {
  return `<button class="day-card ${state.selectedDate === day.date ? "is-selected" : ""} ${day.overrideApplied ? "has-override" : ""}"${progressStyle(day.routineProgressRate)} type="button" data-action="select-date" data-date="${day.date}"><div class="day-card-head"><strong>${Number(day.date.slice(-2))}</strong>${day.overrideApplied ? `<span class="calendar-flag"><span class="calendar-flag-text">${t("calendarOverrideOn")}</span></span>` : ""}</div><div class="calendar-meta"><span class="calendar-set">${esc(day.setName ?? t("noSet"))}</span><span class="calendar-rate">${percent(day.routineProgressRate)}</span><span class="calendar-units">${day.completedUnits}/${day.targetUnits}</span></div></button>`;
}

function setOptions(selectedId, blank = false) {
  const options = state.routineSets.map((set) => `<option value="${set.id}" ${set.id === selectedId ? "selected" : ""}>${esc(set.name)}</option>`);
  if (blank) options.unshift(`<option value="" ${selectedId ? "" : "selected"}>${t("none")}</option>`);
  return options.join("");
}

function renderStats() {
  const target = document.getElementById("tab-stats");
  if (!target) return;
  if (!state.stats) {
    target.innerHTML = "";
    return;
  }
  const summary = state.stats.summary;
  target.innerHTML = `<div class="layout-2-equal layout-workspace">
    <article class="panel section section-elevated">
      <div class="section-head"><div><p class="section-label">${t("summary")}</p><h2>${t("statistics")}</h2></div><div class="segmented"><button class="segment-button ${state.statsRange === "week" ? "is-selected" : ""}" type="button" data-action="stats-range" data-range="week" aria-pressed="${state.statsRange === "week"}">${t("week")}</button><button class="segment-button ${state.statsRange === "month" ? "is-selected" : ""}" type="button" data-action="stats-range" data-range="month" aria-pressed="${state.statsRange === "month"}">${t("month")}</button><button class="segment-button ${state.statsRange === "custom" ? "is-selected" : ""}" type="button" data-action="stats-range" data-range="custom" aria-pressed="${state.statsRange === "custom"}">${t("custom")}</button></div></div>
      ${state.statsRange === "custom" ? `<form class="content-card content-card--form" data-form="stats-custom"><div class="form-grid"><label class="field"><span>${t("start")}</span><input name="start" type="date" value="${esc(state.customStatsStart)}" required /></label><label class="field"><span>${t("end")}</span><input name="end" type="date" value="${esc(state.customStatsEnd)}" required /></label></div>${inlineFeedback("stats-custom")}<div class="actions"><button class="btn-soft" type="submit">${t("applyCustom")}</button></div></form>` : `<div class="content-card collapsed-summary"><strong>${t("customRange")}</strong><p class="muted">${t("customRangeHint")}</p></div>`}
      <div class="summary-grid top-gap">${[
        [t("today"), percent(summary.dailyRate)],
        [t("week"), percent(summary.weeklyRate)],
        [t("month"), percent(summary.monthlyRate)],
        [t("currentStreak"), `${summary.currentStreak} ${t("days")}`],
        [t("bestStreak"), `${summary.bestStreak} ${t("days")}`],
        [t("todoCompletion"), percent(summary.todoCompletion.rate)],
      ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
    </article>
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("topRoutines")}</p><h2>${t("topRoutines")}</h2></div></div>
      <div class="stack">${summary.topRoutines.length ? summary.topRoutines.map((routine) => `<div class="content-card content-card--stat"${accentStyle(routine.color)}><div class="routine-name">${emojiBadge(routine.emoji)}<div><strong>${esc(routine.name)}</strong><div class="muted">${routine.completedUnits}/${routine.targetUnits}</div></div></div><div class="top-gap-sm pill tag-teal">${percent(routine.completionRate)}</div></div>`).join("") : empty(t("noRoutineStats"))}</div>
    </article>
  </div>`;
}

function roleOptions(selectedRole) {
  return ["member", "admin", "owner"]
    .map((role) => `<option value="${role}" ${role === selectedRole ? "selected" : ""}>${esc(t(`role${role.slice(0, 1).toUpperCase()}${role.slice(1)}`))}</option>`)
    .join("");
}

function statusOptions(selectedStatus) {
  return ["active", "suspended"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${esc(t(`accountStatus${status.slice(0, 1).toUpperCase()}${status.slice(1)}`))}</option>`)
    .join("");
}

function billingPlanOptions(selectedCode) {
  return state.billingPlans
    .map((plan) => `<option value="${plan.code}" ${plan.code === selectedCode ? "selected" : ""}>${esc(`${plan.name} · ${moneyLabel(plan.priceMinor, plan.currency)}`)}</option>`)
    .join("");
}

function adminUserCard(user) {
  const accessScope = `admin-user-${user.id}`;
  const billingScope = `admin-billing-${user.id}`;
  return `<article class="content-card content-card--form admin-user-card">
    <div class="row-between">
      <div>
        <strong>${esc(user.displayName)}</strong>
        <div class="muted">${esc(user.email)}</div>
      </div>
      <div class="inline-actions">
        <span class="state-pill">${esc(t(`role${user.role.slice(0, 1).toUpperCase()}${user.role.slice(1)}`))}</span>
        <span class="state-pill ${user.status === "active" ? "is-success" : ""}">${esc(t(`accountStatus${user.status.slice(0, 1).toUpperCase()}${user.status.slice(1)}`))}</span>
      </div>
    </div>
    <div class="summary-grid top-gap-sm">
      <div class="summary-card"><span>${t("billingCurrentPlan")}</span><strong>${esc(user.billing.planName ?? t("billingNoPlan"))}</strong></div>
      <div class="summary-card"><span>${t("adminLastSession")}</span><strong>${esc(user.lastSessionAt ? dateTimeLabel(user.lastSessionAt) : t("notAvailable"))}</strong></div>
      <div class="summary-card"><span>${t("adminActiveSessions")}</span><strong>${user.activeSessionCount}</strong></div>
    </div>
    <form class="top-gap-sm" data-form="admin-user-update" data-user-id="${user.id}">
      <div class="form-grid">
        <label class="field"><span>${t("adminRole")}</span><select name="role">${roleOptions(user.role)}</select></label>
        <label class="field"><span>${t("status")}</span><select name="status">${statusOptions(user.status)}</select></label>
      </div>
      ${inlineFeedback(accessScope)}
      <div class="actions"><button class="btn-soft" type="submit"${disabledAttr(accessScope)}>${t("adminSaveAccount")}</button></div>
    </form>
    <form class="top-gap-sm" data-form="admin-subscription-assign" data-user-id="${user.id}">
      <div class="form-grid">
        <label class="field field-wide"><span>${t("adminAssignPlan")}</span><select name="planCode">${billingPlanOptions(user.billing.planCode)}</select></label>
      </div>
      ${inlineFeedback(billingScope)}
      <div class="actions"><button class="btn-soft" type="submit"${disabledAttr(billingScope)}>${t("adminApplyPlan")}</button></div>
    </form>
  </article>`;
}

function adminSubscriptionCard(subscription) {
  return `<article class="content-card admin-entry-card">
    <div class="row-between">
      <div>
        <strong>${esc(subscription.displayName)}</strong>
        <div class="muted">${esc(subscription.email)}</div>
      </div>
      <span class="state-pill ${subscription.status === "active" ? "is-success" : ""}">${esc(subscription.status)}</span>
    </div>
    <div class="top-gap-sm muted">${esc(subscription.plan.name)} · ${esc(moneyLabel(subscription.plan.priceMinor, subscription.plan.currency))} · ${esc(billingIntervalLabel(subscription.plan.interval))}</div>
    <div class="top-gap-sm admin-meta-grid">
      <span>${t("start")}: ${esc(dateLabel(subscription.currentPeriodStart.slice(0, 10)))}</span>
      <span>${t("billingRenewal")}: ${esc(dateLabel(subscription.currentPeriodEnd.slice(0, 10)))}</span>
    </div>
  </article>`;
}

function adminSessionCard(session) {
  return `<article class="content-card admin-entry-card">
    <div class="row-between">
      <div>
        <strong>${esc(session.displayName)}</strong>
        <div class="muted">${esc(session.email)}</div>
      </div>
      <span class="state-pill ${session.status === "active" ? "is-success" : ""}">${esc(session.status)}</span>
    </div>
    <div class="top-gap-sm admin-meta-grid">
      <span>${t("adminLastSession")}: ${esc(dateTimeLabel(session.lastUsedAt))}</span>
      <span>${t("adminSessionExpires")}: ${esc(dateTimeLabel(session.expiresAt))}</span>
    </div>
  </article>`;
}

function adminLogCard(log) {
  const actorName = log.actor?.displayName ?? log.actor?.email ?? t("system");
  const targetName = log.target?.displayName ?? log.target?.email ?? t("none");
  return `<article class="content-card admin-entry-card">
    <div class="row-between">
      <div>
        <strong>${esc(log.message)}</strong>
        <div class="muted">${esc(log.scope)} · ${esc(log.eventType)}</div>
      </div>
      <span class="state-pill">${esc(dateTimeLabel(log.createdAt))}</span>
    </div>
    <div class="top-gap-sm admin-meta-grid">
      <span>${t("adminActor")}: ${esc(actorName)}</span>
      <span>${t("adminTarget")}: ${esc(targetName)}</span>
    </div>
  </article>`;
}

function renderAdmin() {
  const target = document.getElementById("tab-admin");
  if (!target) return;
  if (!canAccessAdmin()) {
    target.innerHTML = "";
    return;
  }
  setAdminSection(state.adminSection);
  const summary = state.adminOverview?.summary;
  const items = [
    sidebarNavButton({
      section: "overview",
      activeSection: state.adminSection,
      action: "select-admin-section",
      label: t("adminOverviewTitle"),
      meta: t("admin"),
    }),
    sidebarNavButton({
      section: "accounts",
      activeSection: state.adminSection,
      action: "select-admin-section",
      label: t("adminAccountsTitle"),
      meta: String(state.adminUsers.length),
    }),
    sidebarNavButton({
      section: "subscriptions",
      activeSection: state.adminSection,
      action: "select-admin-section",
      label: t("adminSubscriptionsTitle"),
      meta: String(state.adminSubscriptions.length),
    }),
    sidebarNavButton({
      section: "sessions",
      activeSection: state.adminSection,
      action: "select-admin-section",
      label: t("adminSessionsTitle"),
      meta: String(state.adminSessions.length),
    }),
    sidebarNavButton({
      section: "logs",
      activeSection: state.adminSection,
      action: "select-admin-section",
      label: t("adminLogsTitle"),
      meta: String(state.adminLogs.length),
    }),
  ];
  let content = "";
  if (state.adminSection === "accounts") {
    content = `<article class="panel section management-panel">
      <div class="section-head"><div><p class="section-label">${t("account")}</p><h2>${t("adminAccountsTitle")}</h2></div></div>
      <div class="stack">${state.adminUsers.length ? state.adminUsers.map(adminUserCard).join("") : empty(t("adminEmptyUsers"))}</div>
    </article>`;
  } else if (state.adminSection === "subscriptions") {
    content = `<article class="panel section management-panel">
      <div class="section-head"><div><p class="section-label">${t("billingTitle")}</p><h2>${t("adminSubscriptionsTitle")}</h2></div></div>
      <div class="stack">${state.adminSubscriptions.length ? state.adminSubscriptions.map(adminSubscriptionCard).join("") : empty(t("adminEmptySubscriptions"))}</div>
    </article>`;
  } else if (state.adminSection === "sessions") {
    content = `<article class="panel section management-panel">
      <div class="section-head"><div><p class="section-label">${t("adminSessionsTitle")}</p><h2>${t("adminSessionsTitle")}</h2></div></div>
      <div class="stack">${state.adminSessions.length ? state.adminSessions.map(adminSessionCard).join("") : empty(t("adminEmptySessions"))}</div>
    </article>`;
  } else if (state.adminSection === "logs") {
    content = `<article class="panel section management-panel">
      <div class="section-head"><div><p class="section-label">${t("adminLogsTitle")}</p><h2>${t("adminLogsTitle")}</h2></div></div>
      <div class="stack">${state.adminLogs.length ? state.adminLogs.map(adminLogCard).join("") : empty(t("adminEmptyLogs"))}</div>
    </article>`;
  } else {
    content = `<article class="panel section section-elevated management-panel">
      <div class="section-head">
        <div>
          <p class="section-label">${t("admin")}</p>
          <h2>${t("adminOverviewTitle")}</h2>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-card"><span>${t("adminTotalUsers")}</span><strong>${summary?.totalUsers ?? 0}</strong></div>
        <div class="summary-card"><span>${t("adminActiveUsers")}</span><strong>${summary?.activeUsers ?? 0}</strong></div>
        <div class="summary-card"><span>${t("adminAdminUsers")}</span><strong>${summary?.adminUsers ?? 0}</strong></div>
        <div class="summary-card"><span>${t("adminActiveSubscriptions")}</span><strong>${summary?.activeSubscriptions ?? 0}</strong></div>
        <div class="summary-card"><span>${t("adminActiveSessions")}</span><strong>${summary?.activeSessions ?? 0}</strong></div>
        <div class="summary-card"><span>${t("adminMrr")}</span><strong>${esc(moneyLabel(summary?.monthlyRecurringRevenueMinor ?? 0, state.billingPlans[0]?.currency ?? "KRW"))}</strong></div>
      </div>
    </article>`;
  }
  target.innerHTML = managementShell({
    shellClass: "management-shell--admin",
    title: t("adminWorkspace"),
    items,
    content,
  });
}

function empty(message, action = null) {
  const actionMarkup =
    action?.label && action?.action
      ? `<div class="actions actions-center"><button class="btn-soft" type="button" data-action="${action.action}">${esc(action.label)}</button></div>`
      : "";
  return `<div class="empty"><p>${esc(message)}</p>${actionMarkup}</div>`;
}

function pageHero(label, title, copy = "", actions = "") {
  return `<article class="panel section section-elevated route-hero-card">
    <div class="section-head route-hero-head">
      <div>
        <p class="section-label">${esc(label)}</p>
        <h2>${esc(title)}</h2>
        ${copy ? `<p class="muted route-hero-copy">${esc(copy)}</p>` : ""}
      </div>
      ${actions ? `<div class="inline-actions route-hero-actions">${actions}</div>` : ""}
    </div>
  </article>`;
}

function routeActionButton(action, label, className = "btn-soft compact-action") {
  return `<button class="${className}" type="button" data-action="${action}">${esc(label)}</button>`;
}

function settingLinkCard(action, title, copy, meta = "") {
  return `<button class="settings-link-card" type="button" data-action="${action}">
    <div class="settings-link-copy">
      <strong>${esc(title)}</strong>
      <span>${esc(copy)}</span>
    </div>
    <span class="settings-link-meta">${esc(meta || "›")}</span>
  </button>`;
}

function templateUsageCount(templateId) {
  return state.routineItems?.filter?.((item) => item.templateId === templateId).length ?? 0;
}

function routeAppBar(backPath, title, copy = "", actions = "", label = "") {
  return `<header class="route-appbar">
    <div class="route-appbar-main">
      <button class="route-appbar-back" type="button" data-action="go-route" data-path="${backPath}" aria-label="${esc(t("prev"))}">
        <span aria-hidden="true">‹</span>
      </button>
      <div class="route-appbar-copy">
        ${label ? `<p class="section-label">${esc(label)}</p>` : ""}
        <h2>${esc(title)}</h2>
        ${copy ? `<p class="muted route-appbar-note">${esc(copy)}</p>` : ""}
      </div>
    </div>
    ${actions ? `<div class="route-appbar-actions">${actions}</div>` : ""}
  </header>`;
}

function routeNavRow(action, title, copy = "", meta = "›", extraAttrs = "") {
  return `<button class="route-list-row" type="button" data-action="${action}" ${extraAttrs}>
    <span class="route-list-copy">
      <strong>${esc(title)}</strong>
      ${copy ? `<span>${esc(copy)}</span>` : ""}
    </span>
    <span class="route-list-meta">${esc(meta)}</span>
  </button>`;
}

function routePathRow(path, title, copy = "", meta = "›") {
  return routeNavRow("go-route", title, copy, meta, `data-path="${path}"`);
}

function settingsCurrentValue(control) {
  if (control === "language") return LANGUAGE_LABELS[state.locale] ?? LANGUAGE_LABELS.ko;
  if (control === "theme") {
    const option = THEME_PRESET_OPTIONS.find((entry) => entry.value === state.themePreset) ?? THEME_PRESET_OPTIONS[0];
    return t(option.labelKey);
  }
  if (control === "density") {
    const option = DENSITY_OPTIONS.find((entry) => entry.value === state.density) ?? DENSITY_OPTIONS[0];
    return t(option.labelKey);
  }
  return "";
}

function settingsInlineSelect(control) {
  if (control === "language") {
    return `<div class="settings-inline-editor">
      <select id="language-select" aria-label="${esc(t("language"))}">
        ${Object.entries(LANGUAGE_LABELS)
          .map(([value, label]) => `<option value="${value}" ${state.locale === value ? "selected" : ""}>${esc(label)}</option>`)
          .join("")}
      </select>
    </div>`;
  }
  if (control === "theme") {
    return `<div class="settings-inline-editor">
      <select id="theme-select" aria-label="${esc(t("theme"))}">
        ${THEME_PRESET_OPTIONS.map((option) => `<option value="${option.value}" ${state.themePreset === option.value ? "selected" : ""}>${esc(t(option.labelKey))}</option>`).join("")}
      </select>
    </div>`;
  }
  return `<div class="settings-inline-editor">
    <select id="density-select" aria-label="${esc(t("density"))}">
      ${DENSITY_OPTIONS.map((option) => `<option value="${option.value}" ${state.density === option.value ? "selected" : ""}>${esc(t(option.labelKey))}</option>`).join("")}
    </select>
  </div>`;
}

function settingsControlRow(control, label) {
  const open = state.settingsExpandedControl === control;
  return `<div class="route-list-stack-item ${open ? "is-open" : ""}">
    ${routeNavRow("toggle-settings-control", label, "", settingsCurrentValue(control), `data-control="${control}" aria-expanded="${String(open)}"`)}
    ${open ? settingsInlineSelect(control) : ""}
  </div>`;
}

function legacyTrackingSummaryText(trackingType, targetCount) {
  return `${trackingTypeLabel(trackingType)} · ${targetCount}${trackingUnitLabel(trackingType)}`;
}

function legacyRoutineTaskTemplateListItem(template) {
  const usageCount = state.routines.reduce(
    (sum, routine) => sum + routine.items.filter((item) => item.templateId === template.id).length,
    0,
  );
  const expanded = state.expandedRoutineTaskTemplateIds.has(template.id);
  return `<article class="route-list-card ${template.isArchived ? "is-muted" : ""}">
    <button class="route-list-row route-list-row--wide" type="button" data-action="toggle-routine-task-template" data-id="${template.id}" aria-expanded="${String(expanded)}">
      <span class="route-list-copy">
        <strong>${esc(template.title)}</strong>
        <span>${esc(trackingSummaryText(template.trackingType, template.targetCount))}</span>
      </span>
      <span class="route-list-side">
        <span class="state-pill ${template.isArchived ? "" : "is-success"}">${esc(template.isArchived ? t("archived") : t("active"))}</span>
        <span class="state-pill">${usageCount}${t("items")}</span>
        <span class="route-list-meta">${expanded ? "−" : "+"}</span>
      </span>
    </button>
    ${expanded ? `<form class="route-inline-form" data-form="routine-task-template-update" data-id="${template.id}">
      <div class="form-grid">
        <label class="field field-wide"><span>${t("itemName")}</span><input name="title" required value="${esc(template.title)}" /></label>
        <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions(template.trackingType)}</select></label>
        <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", template.trackingType, template.targetCount)}</label>
        <label class="field"><span>${t("status")}</span><select name="isArchived"><option value="false" ${template.isArchived ? "" : "selected"}>${t("active")}</option><option value="true" ${template.isArchived ? "selected" : ""}>${t("archived")}</option></select></label>
      </div>
      ${inlineFeedback(`routine-task-template-${template.id}`)}
      <div class="actions">
        <button class="btn-soft" type="submit">${t("saveItem")}</button>
        <button class="btn-danger" type="button" data-action="delete-routine-task-template" data-id="${template.id}">${t("delete")}</button>
      </div>
    </form>` : ""}
  </article>`;
}

function legacyTaskTemplateChoiceItem(template, checked = false) {
  return `<label class="choice-item choice-item--template">
    <input type="checkbox" name="taskTemplateIds" value="${template.id}" ${checked ? "checked" : ""} />
    <span class="choice-copy">
      <strong>${esc(template.title)}</strong>
      <span>${esc(`${trackingTypeLabel(template.trackingType)} · ${template.targetCount}${trackingUnitLabel(template.trackingType)}`)}</span>
    </span>
  </label>`;
}

function routineSummaryCard(routine) {
  return `<article class="content-card content-card--stat routine-summary-card"${accentStyle(routine.color)}>
    <div class="row-between">
      <div class="routine-name">
        ${emojiBadge(routine.emoji)}
        <div>
          <strong>${esc(routine.name)}</strong>
          <div class="muted">${t("itemsCount", { count: routine.items.length })}</div>
        </div>
      </div>
      <div class="inline-actions">
        <span class="state-pill ${routine.isArchived ? "" : "is-success"}">${t(routine.isArchived ? "archived" : "active")}</span>
        <button class="btn-danger compact-action" type="button" data-action="delete-routine" data-id="${routine.id}">${t("delete")}</button>
      </div>
    </div>
    <div class="tag-cloud top-gap-sm">${routine.items.length ? routine.items.map((item) => `<span class="tag-chip">${esc(item.title)}</span>`).join("") : `<span class="muted">${t("noRoutineItems")}</span>`}</div>
  </article>`;
}

function routineSetSummaryCard(routineSet) {
  return `<article class="content-card content-card--stat routine-summary-card">
    <div class="row-between">
      <div>
        <strong>${esc(routineSet.name)}</strong>
        <div class="muted">${t("linkedRoutines", { count: routineSet.routines.length })}</div>
      </div>
      <button class="btn-danger compact-action" type="button" data-action="delete-routine-set" data-id="${routineSet.id}">${t("delete")}</button>
    </div>
    <div class="tag-cloud top-gap-sm">${routineSet.routines.length ? routineSet.routines.map((routine) => `<span class="tag-chip">${esc(routine.name)}</span>`).join("") : `<span class="muted">${t("noRoutines")}</span>`}</div>
  </article>`;
}

function routineTaskTemplateCard(template) {
  const usageCount = state.routines.reduce(
    (sum, routine) => sum + routine.items.filter((item) => item.templateId === template.id).length,
    0,
  );
  return `<form class="content-card content-card--form task-template-card" data-form="routine-task-template-update" data-id="${template.id}">
    <div class="row-between">
      <div>
        <strong>${esc(template.title)}</strong>
        <div class="muted">${esc(`${trackingTypeLabel(template.trackingType)} · ${template.targetCount}${trackingUnitLabel(template.trackingType)}`)}</div>
      </div>
      <div class="inline-actions">
        <span class="state-pill">${usageCount}${t("items")}</span>
        <button class="btn-danger compact-action" type="button" data-action="delete-routine-task-template" data-id="${template.id}">${t("delete")}</button>
      </div>
    </div>
    <div class="form-grid top-gap-sm">
      <label class="field field-wide"><span>${t("itemName")}</span><input name="title" required value="${esc(template.title)}" /></label>
      <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions(template.trackingType)}</select></label>
      <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", template.trackingType, template.targetCount)}</label>
      <label class="field"><span>${t("status")}</span><select name="isArchived"><option value="false" ${template.isArchived ? "" : "selected"}>${t("active")}</option><option value="true" ${template.isArchived ? "selected" : ""}>${t("archived")}</option></select></label>
    </div>
    ${inlineFeedback(`routine-task-template-${template.id}`)}
    <div class="actions"><button class="btn-soft" type="submit">${t("saveItem")}</button></div>
  </form>`;
}

function legacyRoutineTaskTemplateCreateForm() {
  return `<form class="content-card content-card--form" data-form="routine-task-template-create">
    <div class="form-grid">
      <label class="field field-wide"><span>${t("itemName")}</span><input name="title" required /></label>
      <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions("binary")}</select></label>
      <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", "binary", 1)}</label>
    </div>
    ${trackingGuide()}
    ${inlineFeedback("routine-task-template-create")}
    <div class="actions"><button class="btn" type="submit">${t("addItem")}</button></div>
  </form>`;
}

function routineHomeEmptyState() {
  return `<article class="panel section section-elevated onboarding-panel">
    <div class="section-head">
      <div>
        <p class="section-label">${t("today")}</p>
        <h2>${state.locale === "ko" ? "비어 있는 시작 화면" : "Start With A Clean Planner"}</h2>
        <p class="muted route-hero-copy">${state.locale === "ko" ? "기본 샘플은 제거했다. 먼저 루틴용 할일을 만들고, 그다음 루틴과 세트를 묶는 흐름으로 시작하면 된다." : "The planner now starts empty. Build reusable routine tasks first, then compose routines and sets."}</p>
      </div>
    </div>
    <div class="onboarding-actions">
      ${settingLinkCard("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리 만들기" : "Create Task Library", state.locale === "ko" ? "재사용할 루틴용 할일을 먼저 저장한다" : "Save reusable routine tasks first")}
      ${settingLinkCard("open-routine-create", t("createRoutine"), state.locale === "ko" ? "저장된 할일을 선택해 루틴을 만든다" : "Compose a routine from saved tasks")}
      ${settingLinkCard("open-routine-set-create", t("createSet"), state.locale === "ko" ? "루틴을 묶어 요일별 세트를 만든다" : "Group routines into a set")}
    </div>
  </article>`;
}

function trackingSummaryText(trackingType, targetCount) {
  return `${trackingTypeLabel(trackingType)} / ${targetCount}${trackingUnitLabel(trackingType)}`;
}

function taskTemplateChoiceItem(template, checked = false) {
  return `<label class="choice-item choice-item--template route-selection-row">
    <input type="checkbox" name="taskTemplateIds" value="${template.id}" ${checked ? "checked" : ""} />
    <span class="choice-copy">
      <strong>${esc(template.title)}</strong>
      <span>${esc(trackingSummaryText(template.trackingType, template.targetCount))}</span>
    </span>
    <span class="state-pill">${esc(trackingTypeLabel(template.trackingType))}</span>
  </label>`;
}

function routineTaskTemplateCreateForm(options = {}) {
  const contextAttr = options.context ? ` data-context="${options.context}"` : "";
  const formClass = options.compact
    ? "content-card content-card--form route-inline-create-form"
    : "content-card content-card--form";
  const submitClass = options.submitClass ?? (options.compact ? "btn-soft" : "btn");
  return `<form class="${formClass}" data-form="routine-task-template-create"${contextAttr}>
    <div class="form-grid">
      <label class="field field-wide"><span>${t("itemName")}</span><input name="title" required /></label>
      <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions("binary")}</select></label>
      <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", "binary", 1)}</label>
    </div>
    ${trackingGuide()}
    ${inlineFeedback("routine-task-template-create")}
    <div class="actions"><button class="${submitClass}" type="submit">${t("addItem")}</button></div>
  </form>`;
}

function routineTaskTemplateListItem(template) {
  const usageCount = state.routines.reduce(
    (sum, routine) => sum + routine.items.filter((item) => item.templateId === template.id).length,
    0,
  );
  const expanded = state.expandedRoutineTaskTemplateIds.has(template.id);
  return `<article class="route-list-card ${template.isArchived ? "is-muted" : ""}">
    <button class="route-list-row route-list-row--wide" type="button" data-action="toggle-routine-task-template" data-id="${template.id}" aria-expanded="${String(expanded)}">
      <span class="route-list-copy">
        <strong>${esc(template.title)}</strong>
        <span>${esc(trackingSummaryText(template.trackingType, template.targetCount))}</span>
      </span>
      <span class="route-list-side">
        <span class="state-pill ${template.isArchived ? "" : "is-success"}">${esc(template.isArchived ? t("archived") : t("active"))}</span>
        <span class="state-pill">${usageCount}${t("items")}</span>
        <span class="route-list-meta">${expanded ? "-" : "+"}</span>
      </span>
    </button>
    ${expanded ? `<form class="route-inline-form" data-form="routine-task-template-update" data-id="${template.id}">
      <div class="form-grid">
        <label class="field field-wide"><span>${t("itemName")}</span><input name="title" required value="${esc(template.title)}" /></label>
        <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions(template.trackingType)}</select></label>
        <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", template.trackingType, template.targetCount)}</label>
        <label class="field"><span>${t("status")}</span><select name="isArchived"><option value="false" ${template.isArchived ? "" : "selected"}>${t("active")}</option><option value="true" ${template.isArchived ? "selected" : ""}>${t("archived")}</option></select></label>
      </div>
      ${inlineFeedback(`routine-task-template-${template.id}`)}
      <div class="actions">
        <button class="btn-soft" type="submit">${t("saveItem")}</button>
        <button class="btn-danger" type="button" data-action="delete-routine-task-template" data-id="${template.id}">${t("delete")}</button>
      </div>
    </form>` : ""}
  </article>`;
}

function routineCreateFields(draft) {
  return `<div class="create-flow route-create-flow">
    <div class="stack">
      <label class="field field-wide route-title-field">
        <span>${t("name")}</span>
        <input name="name" required value="${esc(draft.name ?? "")}" />
      </label>
      <div class="form-grid route-meta-grid">
        ${emojiField(draft.emoji ?? "")}
        <label class="field field-color route-color-field">
          <span>${t("color")}</span>
          <div class="color-input-shell"><input class="color-input" name="color" type="color" value="${esc(draft.color ?? "#16a34a")}" /></div>
          ${colorSwatches(draft.color ?? "#16a34a")}
        </label>
      </div>
    </div>
    ${routineDraftPreview(draft)}
  </div>`;
}

function routineSetCreateChoiceRow(routine, checked = false) {
  return `<label class="choice-item route-selection-row route-selection-row--routine">
    <input type="checkbox" name="routineIds" value="${routine.id}" ${checked ? "checked" : ""} />
    ${emojiBadge(routine.emoji)}
    <span class="choice-copy">
      <strong>${esc(routine.name)}</strong>
      <span>${t("itemsCount", { count: routine.items.length })}</span>
    </span>
    <span class="state-pill ${routine.isArchived ? "" : "is-success"}">${t(routine.isArchived ? "archived" : "active")}</span>
  </label>`;
}

function homeQuickForm() {
  return `<form class="content-card content-card--form home-quick-form" data-form="todo-create-quick">
    <div class="stack">
      <div class="form-grid">
        <label class="field field-wide"><span>${t("title")}</span><input name="title" required /></label>
        <label class="field"><span>${t("date")}</span><input name="dueDate" type="date" value="${esc(currentHomeDate() || state.today?.date || "")}" /></label>
        ${emojiField("")}
      </div>
      ${inlineFeedback("today-quick")}
      <div class="actions"><button class="btn" type="submit">${t("quickCreateTodo")}</button></div>
    </div>
  </form>`;
}

function homeBoardModeButton(mode, label) {
  const selected = state.homeBoardMode === mode;
  return `<button class="segment-button ${selected ? "is-selected" : ""}" type="button" data-action="set-home-board-mode" data-mode="${mode}" aria-pressed="${String(selected)}">${esc(label)}</button>`;
}

function homeContextChip(label, value, className = "") {
  const classes = ["home-context-chip", className].filter(Boolean).join(" ");
  return `<div class="${classes}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function homeRoutineEmptyState() {
  return `<div class="home-board-empty">
    <p>${esc(t("noActiveRoutines"))}</p>
    <div class="actions actions-center">
      <button class="btn-soft compact-action" type="button" data-action="open-routine-task-library">${esc(state.locale === "ko" ? "할일 라이브러리" : "Task Library")}</button>
      <button class="btn-soft compact-action" type="button" data-action="open-routine-create">${esc(t("createRoutine"))}</button>
      <button class="btn-soft compact-action" type="button" data-action="open-routine-set-create">${esc(t("createSet"))}</button>
    </div>
  </div>`;
}

function homeTodoEmptyState() {
  return `<div class="home-board-empty">
    <p>${esc(t("noTodos"))}</p>
    <div class="actions actions-center">
      <button class="btn-soft compact-action" type="button" data-action="toggle-home-quick">${esc(t("quickAdd"))}</button>
    </div>
  </div>`;
}

function homeRoutineGroupRow(routine, order) {
  const hideCompleted = isMobileViewport()
    ? !state.revealedCompletedRoutineIds.has(routine.id)
    : state.collapsedRoutineCompletedIds.has(routine.id);
  const completedCount = routine.items.filter((item) => item.isComplete).length;
  const visibleItems = hideCompleted ? routine.items.filter((item) => !item.isComplete) : routine.items;

  return `<div class="home-board-group ${isPending(`routine-${routine.id}`) ? "is-pending" : ""}"${accentStyle(routine.color)}>
    <div class="home-board-row home-board-row--group">
      <div class="home-board-cell home-board-cell--index"><span class="home-order-badge">${order}</span></div>
      <div class="home-board-cell home-board-cell--main">
        <div class="home-routine-main">
          ${emojiBadge(routine.emoji)}
          <span class="home-routine-accent"></span>
          <div>
            <strong>${esc(routine.name)}</strong>
            <span class="muted">${esc(`${routine.progress.completedUnits}/${routine.progress.targetUnits}`)}</span>
          </div>
        </div>
      </div>
      <div class="home-board-cell home-board-cell--status">
        <span class="pill tag-teal">${percent(routine.progress.rate)}</span>
        ${completedCount ? `<button class="btn-soft compact-action" type="button" data-action="toggle-completed-items" data-routine-id="${routine.id}" aria-pressed="${String(hideCompleted)}">${hideCompleted ? t("showCompleted") : t("hideCompleted")}</button>` : ""}
      </div>
    </div>
    ${inlineFeedback(`routine-${routine.id}`)}
    ${visibleItems.length ? visibleItems.map((item) => homeRoutineItemRow(routine.id, item)).join("") : `<div class="home-board-row home-board-row--empty"><div class="home-board-cell home-board-cell--main">${esc(t("allCompletedHidden"))}</div></div>`}
  </div>`;
}

function homeRoutineItemRow(routineId, item) {
  const meta =
    item.trackingType === "binary"
      ? trackingTypeLabel(item.trackingType)
      : `${item.targetCount}${trackingUnitLabel(item.trackingType)}`;

  if (item.trackingType === "binary") {
    return `<div class="home-board-row home-board-row--item ${item.isComplete ? "is-complete" : ""}">
      <div class="home-board-cell home-board-cell--index">${item.sortOrder}</div>
      <div class="home-board-cell home-board-cell--main">
        <div class="home-item-copy">
          <strong>${esc(item.title)}</strong>
          <span class="muted">${esc(meta)}</span>
        </div>
      </div>
      <div class="home-board-cell home-board-cell--status">
        <label class="home-binary-toggle">
          <input type="checkbox" data-action="toggle-binary" data-routine-id="${routineId}" data-item-id="${item.id}" ${item.currentCount >= 1 ? "checked" : ""} ${isPending(`routine-${routineId}`) ? "disabled" : ""} />
          <span class="state-pill ${item.isComplete ? "is-success" : ""}">${item.isComplete ? t("done") : t("open")}</span>
        </label>
      </div>
    </div>`;
  }

  return `<div class="home-board-row home-board-row--item ${item.isComplete ? "is-complete" : ""}">
    <div class="home-board-cell home-board-cell--index">${item.sortOrder}</div>
    <div class="home-board-cell home-board-cell--main">
      <div class="home-item-copy">
        <strong>${esc(item.title)}</strong>
        <span class="muted">${esc(meta)}</span>
      </div>
    </div>
    <div class="home-board-cell home-board-cell--status">
      <div class="home-counter">
        <button class="counter-button" type="button" data-action="adjust-progress" data-direction="-1" data-routine-id="${routineId}" data-item-id="${item.id}" aria-label="${esc(`${t("decrease")} ${item.title}`)}"${disabledAttr(`routine-${routineId}`)}>-</button>
        <strong class="home-counter-value ${item.isComplete ? "is-complete" : ""}">${esc(compactTrackingValue(item))}</strong>
        <button class="counter-button" type="button" data-action="adjust-progress" data-direction="1" data-routine-id="${routineId}" data-item-id="${item.id}" aria-label="${esc(`${t("increase")} ${item.title}`)}"${disabledAttr(`routine-${routineId}`)}>+</button>
      </div>
    </div>
  </div>`;
}

function homeTodoGroup(title, todos, typeLabel) {
  if (!todos.length) {
    return "";
  }

  return `<div class="home-board-group">
    <div class="home-board-row home-board-row--group home-board-row--todo-group">
      <div class="home-board-cell home-board-cell--index"><span class="home-order-badge">${esc(typeLabel)}</span></div>
      <div class="home-board-cell home-board-cell--main"><strong>${esc(title)}</strong></div>
      <div class="home-board-cell home-board-cell--status"><span class="state-pill">${todos.length}</span></div>
    </div>
    ${todos.map((todo, index) => homeTodoItemRow(todo, typeLabel, index + 1)).join("")}
  </div>`;
}

function homeTodoItemRow(todo, typeLabel, order) {
  const isDone = todo.status === "done";
  const rowClasses = ["home-board-row", "home-board-row--item", "home-board-row--todo"];
  if (todo.status === "done") rowClasses.push("is-complete");
  if (state.highlightTodoId === todo.id) rowClasses.push("is-highlight");
  if (isPending(`todo-${todo.id}`)) rowClasses.push("is-pending");

  const moveAction = typeLabel === t("dueToday") ? "move-todo-tomorrow" : "move-todo-today";
  const moveLabel = typeLabel === t("dueToday") ? t("moveTomorrow") : t("planToday");

  return `<div class="${rowClasses.join(" ")}">
    <div class="home-board-cell home-board-cell--index">
      <span class="home-order-badge home-order-badge--plain">${order}</span>
      <span class="home-todo-kind">${esc(typeLabel)}</span>
    </div>
    <div class="home-board-cell home-board-cell--main">
      <div class="home-item-copy">
        <div class="home-todo-title">${emojiBadge(todo.emoji)}<strong>${esc(todo.title)}</strong></div>
        <span class="muted">${esc(describeTodoDue(todo.dueDate))}</span>
      </div>
    </div>
    <div class="home-board-cell home-board-cell--status">
      <span class="state-pill ${isDone ? "is-success" : ""}">${todoStatusLabel(todo.status)}</span>
      ${isDone ? "" : `<div class="inline-actions">
        <button class="btn-soft compact-action" type="button" data-action="complete-todo" data-id="${todo.id}"${disabledAttr(`todo-${todo.id}`)}>${t("done")}</button>
        <button class="btn-soft compact-action" type="button" data-action="${moveAction}" data-id="${todo.id}"${disabledAttr(`todo-${todo.id}`)}>${moveLabel}</button>
      </div>`}
    </div>
  </div>`;
}

function renderHomeRoutinesBoard() {
  if (!state.today?.routines.length) {
    return homeRoutineEmptyState();
  }

  return state.today.routines.map((routine, index) => homeRoutineGroupRow(routine, index + 1)).join("");
}

function renderHomeTodosBoard() {
  const dueToday = state.today?.todos.dueToday ?? [];
  const inbox = state.today?.todos.inbox ?? [];

  if (!dueToday.length && !inbox.length) {
    return homeTodoEmptyState();
  }

  return [homeTodoGroup(t("dueToday"), dueToday, t("dueToday")), homeTodoGroup(t("inbox"), inbox, t("inbox"))]
    .filter(Boolean)
    .join("");
}

function renderTodayHomePage() {
  const target = document.getElementById("tab-today");
  if (!target || !state.today) return;

  syncHomeDateState(state.today.date);
  const selectedDate = currentHomeDate() || state.today.date;
  const weekDates = buildWeekDates(state.visibleHomeWeekStart || selectedDate);
  const summary = state.today.summary;
  const isMobile = isMobileViewport();
  const boardMode = state.homeBoardMode === "todos" ? "todos" : "routines";
  const localToday = dateKeyFromMonth(monthKey(new Date()), new Date().getDate());
  const topActions = [
    routeActionButton("toggle-home-quick", t("quickAdd")),
    routeActionButton("open-routine-create", t("createRoutine")),
  ].join("");

  target.innerHTML = `<div class="today-home-layout">
    <article class="panel section today-home-topbar">
      <div class="today-home-topbar-main">
        <p class="section-label">${esc(homeWeekdayLabel(selectedDate))}</p>
        <h2>${esc(homeMonthLabel(selectedDate))}</h2>
        <p class="muted today-home-date-copy">${esc(dateLabel(selectedDate))}</p>
      </div>
      <div class="today-home-topbar-side">
        <span class="pill">${esc(`🔥 ${state.stats?.summary.currentStreak ?? 0}${t("days")}`)}</span>
        <div class="inline-actions today-home-topbar-actions">${topActions}</div>
      </div>
    </article>

    <article class="panel section today-home-week">
      <div class="row-between today-home-week-head">
        <button class="btn-soft compact-action" type="button" data-action="shift-home-week" data-direction="-1">${t("prev")}</button>
        <strong>${esc(homeMonthLabel(selectedDate))}</strong>
        <button class="btn-soft compact-action" type="button" data-action="shift-home-week" data-direction="1">${t("next")}</button>
      </div>
      <div class="today-home-week-grid">
        ${weekDates
          .map((date) => {
            const selected = date === selectedDate;
            const isToday = date === localToday;
            return `<button class="today-home-day ${selected ? "is-selected" : ""} ${isToday ? "is-today" : ""}" type="button" data-action="select-home-date" data-date="${date}">
              <span>${esc(homeWeekdayLabel(date))}</span>
              <strong>${Number(date.slice(-2))}</strong>
            </button>`;
          })
          .join("")}
      </div>
    </article>

    <div class="today-home-context">
      ${homeContextChip(t("heroSet"), state.today.assignment.baseSetName ?? t("noSet"))}
      ${homeContextChip(t("rate"), percent(summary.routineRate), "is-accent")}
      ${homeContextChip(
        boardMode === "routines" ? t("focusRemainingRoutines") : t("focusTodayTodos"),
        String(boardMode === "routines" ? remainingRoutineCount() : summary.dueTodayCount + summary.inboxCount),
      )}
    </div>

    <div class="segmented today-home-mode-switch" aria-label="${esc(t("today"))}">
      ${homeBoardModeButton("routines", t("routines"))}
      ${homeBoardModeButton("todos", t("todos"))}
    </div>

    ${!isMobile && state.isHomeQuickCreateOpen ? `<article class="panel section today-home-quick-inline">
      <div class="section-head section-head-tight">
        <div><p class="section-label">${t("quickAdd")}</p><h2>${t("todayQuickEntry")}</h2></div>
        ${routeActionButton("toggle-home-quick", t("hideCreateTodo"))}
      </div>
      ${homeQuickForm()}
    </article>` : ""}

    <article class="panel section today-home-board">
      <div class="today-home-board-head">
        <span>${boardMode === "routines" ? t("sortOrder") : t("type")}</span>
        <span>${t("title")}</span>
        <span>${t("status")}</span>
      </div>
      <div class="today-home-board-body">
        ${boardMode === "routines" ? renderHomeRoutinesBoard() : renderHomeTodosBoard()}
      </div>
    </article>

    ${isMobile ? `<button class="home-fab" type="button" data-action="toggle-home-quick" aria-label="${esc(t("quickAdd"))}">+</button>` : ""}
    ${isMobile && state.isHomeQuickCreateOpen ? `<div class="home-sheet-backdrop" data-action="close-home-quick"></div>
      <aside class="home-sheet" aria-label="${esc(t("todayQuickEntry"))}">
        <div class="section-head section-head-tight">
          <div><p class="section-label">${t("quickAdd")}</p><h2>${t("todayQuickEntry")}</h2></div>
          ${routeActionButton("close-home-quick", t("hideCreateTodo"))}
        </div>
        ${homeQuickForm()}
      </aside>` : ""}
  </div>`;
}

function legacyRenderSettingsPage() {
  const target = document.getElementById("tab-settings");
  if (!target) return;
  target.innerHTML = `<div class="settings-layout">
    ${pageHero(
      t("settings"),
      state.locale === "ko" ? "설정" : "Settings",
      state.locale === "ko" ? "현재 동작하는 설정과 관리 진입점만 한 화면에 정리했다." : "Only working settings and management entry points are shown here.",
      routeActionButton("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리" : "Task Library"),
    )}
    <article class="panel section settings-list-card">
      <div class="section-head"><div><p class="section-label">${t("displaySettings")}</p><h2>${state.locale === "ko" ? "화면 설정" : "Display"}</h2></div></div>
      <div class="settings-control-list">
        <label class="settings-control-item">
          <span>${t("language")}</span>
          <select id="language-select" aria-label="${esc(t("language"))}">
            <option value="ko">${LANGUAGE_LABELS.ko}</option>
            <option value="en">${LANGUAGE_LABELS.en}</option>
            <option value="ja">${LANGUAGE_LABELS.ja}</option>
          </select>
        </label>
        <label class="settings-control-item">
          <span>${t("theme")}</span>
          <select id="theme-select" aria-label="${esc(t("theme"))}">
            <option value="violet">${t("themeViolet")}</option>
            <option value="sunset">${t("themeSunset")}</option>
            <option value="forest">${t("themeForest")}</option>
          </select>
        </label>
        <label class="settings-control-item">
          <span>${t("density")}</span>
          <select id="density-select" aria-label="${esc(t("density"))}">
            <option value="comfy">${t("densityComfy")}</option>
            <option value="compact">${t("densityCompact")}</option>
          </select>
        </label>
      </div>
    </article>
    <article class="panel section settings-list-card">
      <div class="section-head"><div><p class="section-label">${t("manageMenu")}</p><h2>${state.locale === "ko" ? "플래너 구조" : "Planner Flow"}</h2></div></div>
      <div class="settings-link-list">
        ${settingLinkCard("open-routine-task-library", state.locale === "ko" ? "루틴용 할일 라이브러리" : "Routine Task Library", state.locale === "ko" ? "루틴이 참조할 재사용 할일을 관리한다" : "Manage reusable tasks that routines reference")}
        ${settingLinkCard("open-routine-create", state.locale === "ko" ? "루틴 만들기" : "Create Routine", state.locale === "ko" ? "저장된 할일을 선택해 루틴을 생성한다" : "Build a routine from saved tasks")}
        ${settingLinkCard("open-routine-set-create", state.locale === "ko" ? "세트 만들기" : "Create Set", state.locale === "ko" ? "루틴들을 묶어 세트를 만든다" : "Bundle routines into a set")}
        ${settingLinkCard("open-todo-create", t("todos"), state.locale === "ko" ? "일회성 투두 화면으로 이동한다" : "Go to one-off todo planning")}
      </div>
    </article>
    ${state.authAvailable ? `<article class="panel section settings-list-card">
      <div class="section-head"><div><p class="section-label">${t("account")}</p><h2>${state.locale === "ko" ? "계정 및 운영" : "Account And Admin"}</h2></div></div>
      <div class="settings-link-list">
        ${settingLinkCard("open-account", t("accountWorkspace"), state.locale === "ko" ? "계정과 결제 상태를 확인한다" : "View account and billing")}
        ${canAccessAdmin() ? settingLinkCard("open-admin-workspace", t("adminWorkspace"), state.locale === "ko" ? "운영 현황과 사용자 상태를 관리한다" : "Manage operations and user access") : ""}
      </div>
    </article>` : ""}
  </div>`;
}

function renderSettingsPage() {
  const target = document.getElementById("tab-settings");
  if (!target) return;
  target.innerHTML = `<div class="route-screen-layout route-screen-layout--settings">
    ${routeAppBar(
      "/today",
      t("settings"),
      state.locale === "ko"
        ? "현재 동작하는 설정과 관리 진입만 정리했습니다."
        : "Only active settings and working management entry points are shown here.",
      routeActionButton("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리" : "Task Library"),
      t("settings"),
    )}
    <article class="panel section route-section-card">
      <div class="route-section-heading">
        <p class="section-label">${t("displaySettings")}</p>
        <h3>${state.locale === "ko" ? "표시 설정" : "Display"}</h3>
      </div>
      <div class="route-list-stack">
        ${settingsControlRow("language", t("language"))}
        ${settingsControlRow("theme", t("theme"))}
        ${settingsControlRow("density", t("density"))}
      </div>
    </article>
    <article class="panel section route-section-card">
      <div class="route-section-heading">
        <p class="section-label">${t("manageMenu")}</p>
        <h3>${state.locale === "ko" ? "플래너 흐름" : "Planner Flow"}</h3>
      </div>
      <div class="route-list-stack">
        ${routePathRow("/routine-tasks", state.locale === "ko" ? "루틴용 할일 라이브러리" : "Routine Task Library", state.locale === "ko" ? "루틴이 참조하는 저장된 할일을 관리합니다." : "Manage reusable tasks that routines reference.")}
        ${routePathRow("/routines/new", state.locale === "ko" ? "루틴 만들기" : "Create Routine", state.locale === "ko" ? "저장된 할일을 선택해 루틴을 구성합니다." : "Build a routine from saved tasks.")}
        ${routePathRow("/routine-sets/new", state.locale === "ko" ? "세트 만들기" : "Create Set", state.locale === "ko" ? "저장된 루틴을 묶어 세트를 만듭니다." : "Bundle routines into a set.")}
        ${routeNavRow("open-todo-create", t("todos"), state.locale === "ko" ? "일회성 할 일을 따로 관리합니다." : "Go to the one-off todo workspace.")}
      </div>
    </article>
    ${state.authAvailable ? `<article class="panel section route-section-card">
      <div class="route-section-heading">
        <p class="section-label">${t("account")}</p>
        <h3>${state.locale === "ko" ? "계정 및 관리" : "Account And Admin"}</h3>
      </div>
      <div class="route-list-stack">
        ${routeNavRow("open-account", t("accountWorkspace"), state.locale === "ko" ? "계정과 결제 상태를 확인합니다." : "View account and billing details.")}
        ${canAccessAdmin() ? routeNavRow("open-admin-workspace", t("adminWorkspace"), state.locale === "ko" ? "운영 계정과 접근 상태를 관리합니다." : "Manage operations and user access.") : ""}
      </div>
    </article>` : ""}
  </div>`;
}

function renderTodayPage() {
  const target = document.getElementById("tab-today");
  if (!target || !state.today) return;
  const hasPlannerData =
    state.routineTaskTemplates.length > 0 ||
    state.routines.length > 0 ||
    state.routineSets.length > 0 ||
    state.todos.length > 0;
  const summary = state.today.summary;
  const todayTodos = [...state.today.todos.dueToday, ...state.today.todos.inbox];
  target.innerHTML = `<div class="today-quiet-layout">
    ${pageHero(
      t("today"),
      dateLabel(state.today.date),
      state.today.assignment.baseSetName
        ? `${t("heroSet")}: ${state.today.assignment.baseSetName}`
        : state.locale === "ko"
          ? "아직 연결된 세트가 없다."
          : "No routine set is linked yet.",
      [
        routeActionButton("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리" : "Task Library"),
        routeActionButton("open-routine-create", t("createRoutine")),
      ].join(""),
    )}
    <article class="panel section section-elevated today-summary-panel-compact">
      <div class="summary-grid today-summary-grid">
        <div class="summary-card"><span>${t("rate")}</span><strong>${percent(summary.routineRate)}</strong></div>
        <div class="summary-card"><span>${t("items")}</span><strong>${summary.completedItemCount}/${summary.totalItemCount}</strong></div>
        <div class="summary-card"><span>${t("focusTodayTodos")}</span><strong>${summary.dueTodayCount}</strong></div>
      </div>
    </article>
    ${!hasPlannerData ? routineHomeEmptyState() : ""}
    ${state.today.routines.length ? `<article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("today")}</p><h2>${t("routines")}</h2></div></div>
      <div class="stack">${state.today.routines.map((routine) => todayRoutine(routine)).join("")}</div>
    </article>` : ""}
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("todayTodos")}</p><h2>${t("todayTodos")}</h2></div>${routeActionButton("open-todo-create", t("openCreateTodo"))}</div>
      <div class="list-stack today-list-stack">${todayTodos.length ? todayTodos.map((todo) => todayTodoCard(todo, todo.dueDate ? "due" : "inbox")).join("") : empty(t("noTodos"), { label: t("openCreateTodo"), action: "open-todo-create" })}</div>
    </article>
  </div>`;
}

function legacyRenderRoutinesPage() {
  const target = document.getElementById("tab-routines");
  if (!target) return;

  if (state.routeScreen === "task-library") {
    target.innerHTML = `<div class="route-page-grid">
      ${pageHero(
        state.locale === "ko" ? "루틴용 할일" : "Routine Tasks",
        state.locale === "ko" ? "루틴용 할일 라이브러리" : "Routine Task Library",
        state.locale === "ko" ? "루틴은 여기서 저장한 할일을 선택해 묶는다." : "Routines are composed by selecting tasks saved here.",
        [
          routeActionButton("open-routine-create", t("createRoutine")),
          routeActionButton("open-routine-set-create", t("createSet")),
        ].join(""),
      )}
      <article class="panel section">${routineTaskTemplateCreateForm()}</article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("manageItems")}</p><h2>${state.locale === "ko" ? "저장된 할일" : "Saved Tasks"}</h2></div></div>
        <div class="stack">${state.routineTaskTemplates.length ? state.routineTaskTemplates.map(routineTaskTemplateCard).join("") : empty(state.locale === "ko" ? "저장된 루틴용 할일이 없습니다." : "No routine tasks saved yet.")}</div>
      </article>
    </div>`;
    return;
  }

  if (state.routeScreen === "routine-create") {
    const activeTemplates = state.routineTaskTemplates.filter((template) => !template.isArchived);
    target.innerHTML = `<div class="route-page-grid">
      ${pageHero(
        t("createRoutine"),
        state.locale === "ko" ? "루틴 만들기" : "Create Routine",
        state.locale === "ko" ? "루틴 메타데이터를 입력하고, 저장된 루틴용 할일을 선택한다." : "Enter routine metadata and choose from saved routine tasks.",
        routeActionButton("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리" : "Task Library"),
      )}
      <article class="panel section section-elevated">
        <form class="content-card content-card--form" data-form="routine-create">
          <div class="create-flow">
            <div class="stack">
              ${routineFields({ color: "#16a34a" })}
              <div class="field-wide">
                <span>${state.locale === "ko" ? "루틴용 할일 선택" : "Select Routine Tasks"}</span>
                <div class="choice-list choice-list--stacked">${activeTemplates.length ? activeTemplates.map((template) => taskTemplateChoiceItem(template)).join("") : empty(state.locale === "ko" ? "먼저 루틴용 할일을 만들어야 합니다." : "Create routine tasks first.", { label: state.locale === "ko" ? "할일 만들기" : "Create Tasks", action: "open-routine-task-library" })}</div>
              </div>
              ${inlineFeedback("routine-create")}
              <div class="actions">
                <button class="btn" type="submit">${t("createRoutine")}</button>
                ${routeActionButton("open-routine-task-library", state.locale === "ko" ? "새 할일 추가" : "Add New Task")}
              </div>
            </div>
            ${routineDraftPreview({ color: "#16a34a" })}
          </div>
        </form>
      </article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("addItem")}</p><h2>${state.locale === "ko" ? "같은 화면에서 할일 추가" : "Quick Add Task"}</h2></div></div>
        ${routineTaskTemplateCreateForm()}
      </article>
    </div>`;
    return;
  }

  if (state.routeScreen === "routine-set-create") {
    target.innerHTML = `<div class="route-page-grid">
      ${pageHero(
        t("createSet"),
        state.locale === "ko" ? "세트 만들기" : "Create Set",
        state.locale === "ko" ? "저장된 루틴을 선택해 세트를 만든다." : "Build a set by selecting existing routines.",
        routeActionButton("open-routine-create", t("createRoutine")),
      )}
      <article class="panel section section-elevated">
        <form class="content-card content-card--form" data-form="routine-set-create">
          ${routineSetFields()}
          ${inlineFeedback("routine-set-create")}
          <div class="actions"><button class="btn" type="submit">${t("createSet")}</button></div>
        </form>
      </article>
    </div>`;
    return;
  }

  target.innerHTML = `<div class="route-page-grid">
    ${pageHero(
      t("routines"),
      state.locale === "ko" ? "루틴 워크스페이스" : "Routine Workspace",
      state.locale === "ko" ? "생성 흐름을 분리하고, 저장된 할일을 기준으로 루틴을 구성하도록 바꿨다." : "Creation flows are separated, and routines are composed from saved tasks.",
      [
        routeActionButton("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리" : "Task Library"),
        routeActionButton("open-routine-create", t("createRoutine")),
        routeActionButton("open-routine-set-create", t("createSet")),
      ].join(""),
    )}
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("routineEditor")}</p><h2>${t("routines")}</h2></div></div>
      <div class="stack">${state.routines.length ? state.routines.map(routineSummaryCard).join("") : empty(t("noRoutines"), { label: t("createRoutine"), action: "open-routine-create" })}</div>
    </article>
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("routineSetsHeading")}</p><h2>${t("routineSetsHeading")}</h2></div></div>
      <div class="stack">${state.routineSets.length ? state.routineSets.map(routineSetSummaryCard).join("") : empty(t("noRoutineSets"), { label: t("createSet"), action: "open-routine-set-create" })}</div>
    </article>
  </div>`;
}

function renderRoutinesPage() {
  const target = document.getElementById("tab-routines");
  if (!target) return;

  if (state.routeScreen === "task-library") {
    const activeTemplates = state.routineTaskTemplates.filter((template) => !template.isArchived);
    const archivedTemplates = state.routineTaskTemplates.filter((template) => template.isArchived);
    target.innerHTML = `<div class="route-screen-layout route-screen-layout--library">
      ${routeAppBar(
        "/routines",
        state.locale === "ko" ? "루틴용 할일 라이브러리" : "Routine Task Library",
        state.locale === "ko"
          ? "루틴은 여기 저장된 할일을 골라 묶는 방식으로 구성합니다."
          : "Routines are composed by selecting the reusable tasks saved here.",
        routeActionButton("open-routine-create", t("createRoutine")),
        state.locale === "ko" ? "루틴용 할일" : "Routine Tasks",
      )}
      <article class="panel section route-section-card">
        <div class="route-section-heading">
          <p class="section-label">${t("addItem")}</p>
          <h3>${state.locale === "ko" ? "새 할일 저장" : "Save A Task"}</h3>
        </div>
        ${routineTaskTemplateCreateForm()}
      </article>
      <article class="panel section route-section-card">
        <div class="route-section-heading">
          <p class="section-label">${t("manageItems")}</p>
          <h3>${state.locale === "ko" ? "저장된 할일" : "Saved Tasks"}</h3>
        </div>
        <div class="route-list-stack">
          ${activeTemplates.length
            ? activeTemplates.map(routineTaskTemplateListItem).join("")
            : empty(state.locale === "ko" ? "저장된 루틴용 할일이 없습니다." : "No routine tasks saved yet.")}
        </div>
      </article>
      ${archivedTemplates.length ? `<article class="panel section route-section-card route-section-card--muted">
        <div class="route-section-heading">
          <p class="section-label">${t("archived")}</p>
          <h3>${state.locale === "ko" ? "보관된 할일" : "Archived Tasks"}</h3>
        </div>
        <div class="route-list-stack">
          ${archivedTemplates.map(routineTaskTemplateListItem).join("")}
        </div>
      </article>` : ""}
    </div>`;
    return;
  }

  if (state.routeScreen === "routine-create") {
    const draft = getRoutineCreateDraft();
    const activeTemplates = state.routineTaskTemplates.filter((template) => !template.isArchived);
    const selectedTemplateIds = new Set(
      draft.taskTemplateIds.filter((templateId) => activeTemplates.some((template) => template.id === templateId)),
    );
    target.innerHTML = `<div class="route-screen-layout route-screen-layout--creator">
      ${routeAppBar(
        "/routines",
        state.locale === "ko" ? "루틴 만들기" : "Create Routine",
        state.locale === "ko"
          ? "루틴 이름을 정하고 저장된 할일을 선택해 루틴을 구성합니다."
          : "Enter routine metadata and choose from saved routine tasks.",
        routeActionButton("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리" : "Task Library"),
        t("createRoutine"),
      )}
      <form id="routine-create-form" class="route-form-stack" data-form="routine-create">
        <article class="panel section route-section-card route-section-card--creator">
          ${routineCreateFields(draft)}
        </article>
        <article class="panel section route-section-card route-section-card--creator">
          <div class="route-section-heading">
            <p class="section-label">${t("manageItems")}</p>
            <h3>${state.locale === "ko" ? "저장된 할일 선택" : "Select Saved Tasks"}</h3>
          </div>
          <div class="route-list-stack">
            ${activeTemplates.length
              ? activeTemplates.map((template) => taskTemplateChoiceItem(template, selectedTemplateIds.has(template.id))).join("")
              : empty(
                  state.locale === "ko" ? "먼저 루틴용 할일을 만들어야 합니다." : "Create routine tasks first.",
                  { label: state.locale === "ko" ? "할일 만들기" : "Create Tasks", action: "open-routine-task-library" },
                )}
          </div>
          ${inlineFeedback("routine-create")}
        </article>
      </form>
      <article class="panel section route-section-card route-section-card--inline">
        <div class="route-inline-head">
          <div>
            <p class="section-label">${t("addItem")}</p>
            <h3>${state.locale === "ko" ? "같은 화면에서 새 할일 추가" : "Quick Add Task"}</h3>
          </div>
          ${routeActionButton(
            "toggle-routine-task-template-create",
            state.isRoutineQuickTaskCreateOpen
              ? state.locale === "ko"
                ? "접기"
                : "Hide"
              : state.locale === "ko"
                ? "할일 추가"
                : "Add Task",
          )}
        </div>
        ${state.isRoutineQuickTaskCreateOpen
          ? routineTaskTemplateCreateForm({ compact: true, context: "routine-create", submitClass: "btn-soft" })
          : `<p class="muted route-inline-copy">${state.locale === "ko" ? "빠르게 새 할일을 저장하면 바로 위 목록에 추가되고 자동 선택됩니다." : "A new task saved here will be added to the list above and selected automatically."}</p>`}
      </article>
      <div class="route-sticky-footer">
        <button class="btn route-sticky-button" form="routine-create-form" type="submit">${t("createRoutine")}</button>
      </div>
    </div>`;
    return;
  }

  if (state.routeScreen === "routine-set-create") {
    target.innerHTML = `<div class="route-screen-layout route-screen-layout--creator">
      ${routeAppBar(
        "/routines",
        state.locale === "ko" ? "세트 만들기" : "Create Set",
        state.locale === "ko"
          ? "저장된 루틴을 선택해 평소 사용할 세트를 만듭니다."
          : "Build a set by selecting existing routines.",
        routeActionButton("open-routine-create", t("createRoutine")),
        t("createSet"),
      )}
      <form id="routine-set-create-form" class="route-form-stack" data-form="routine-set-create">
        <article class="panel section route-section-card route-section-card--creator">
          <div class="route-section-heading">
            <p class="section-label">${t("createSet")}</p>
            <h3>${state.locale === "ko" ? "세트 이름" : "Set Name"}</h3>
          </div>
          <label class="field field-wide route-title-field">
            <span>${t("setName")}</span>
            <input name="name" required />
          </label>
        </article>
        <article class="panel section route-section-card route-section-card--creator">
          <div class="route-section-heading">
            <p class="section-label">${t("routines")}</p>
            <h3>${state.locale === "ko" ? "루틴 선택" : "Select Routines"}</h3>
          </div>
          <div class="route-list-stack">
            ${state.routines.length
              ? state.routines.map((routine) => routineSetCreateChoiceRow(routine)).join("")
              : empty(t("noRoutines"), { label: t("createRoutine"), action: "open-routine-create" })}
          </div>
          ${inlineFeedback("routine-set-create")}
        </article>
      </form>
      <div class="route-sticky-footer">
        <button class="btn route-sticky-button" form="routine-set-create-form" type="submit">${t("createSet")}</button>
      </div>
    </div>`;
    return;
  }

  target.innerHTML = `<div class="route-page-grid">
    ${pageHero(
      t("routines"),
      state.locale === "ko" ? "루틴 워크스페이스" : "Routine Workspace",
      state.locale === "ko" ? "생성 흐름은 분리하고, 저장된 할일을 바탕으로 루틴을 구성합니다." : "Creation flows are separated, and routines are composed from saved tasks.",
      [
        routeActionButton("open-routine-task-library", state.locale === "ko" ? "할일 라이브러리" : "Task Library"),
        routeActionButton("open-routine-create", t("createRoutine")),
        routeActionButton("open-routine-set-create", t("createSet")),
      ].join(""),
    )}
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("routineEditor")}</p><h2>${t("routines")}</h2></div></div>
      <div class="stack">${state.routines.length ? state.routines.map(routineSummaryCard).join("") : empty(t("noRoutines"), { label: t("createRoutine"), action: "open-routine-create" })}</div>
    </article>
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("routineSetsHeading")}</p><h2>${t("routineSetsHeading")}</h2></div></div>
      <div class="stack">${state.routineSets.length ? state.routineSets.map(routineSetSummaryCard).join("") : empty(t("noRoutineSets"), { label: t("createSet"), action: "open-routine-set-create" })}</div>
    </article>
  </div>`;
}

function renderHeroPanel() {
  const header = document.querySelector(".app-header");
  if (header) {
    header.hidden = true;
  }
  return;
  if (state.activeTab !== "today") {
    return;
  }
  text("hero-title", dateLabel(state.today?.date));
  text(
    "hero-copy",
    state.today?.assignment.baseSetName
      ? `${t("heroSet")}: ${state.today.assignment.baseSetName}`
      : state.locale === "ko"
        ? "오늘 적용된 세트가 없습니다."
        : "No set is applied today.",
  );
  text("hero-set", state.today?.assignment.baseSetName ?? t("noSet"));
  text("hero-rate", percent(state.today?.summary.routineRate));
  text("hero-streak", `${state.stats?.summary.currentStreak ?? 0} ${t("days")}`);
  text("hero-date", dateLabel(state.today?.date));
  const focus = document.getElementById("hero-focus");
  if (focus) {
    focus.innerHTML = todayFocusCards();
  }
}

function renderApp() {
  syncRouteState(state.routePath || globalThis.location?.hash?.slice(1) || "/today");
  applyStaticText();
  applyPreferences();
  renderUserEntry();
  renderHero();
  if (plannerLocked()) {
    redirectToLogin();
    return;
  }
  renderAppNav();
  renderAuthShell();
  setPlannerVisibility(true);
  renderTabs();
  if (!plannerLocked()) {
    renderToday();
    renderRoutines();
    renderTodos();
    renderCalendar();
    renderStats();
    renderSettingsPage();
    renderAdmin();
  }
  syncInteractiveFields();
}

function checkedValues(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function routineProgressPayload(routine) {
  return Object.fromEntries(routine.items.map((item) => [item.id, item.currentCount]));
}

function formEmojiValue(data) {
  const emoji = sanitizeEmojiInput(String(data.get("emoji") || ""));
  return emoji || null;
}

function syncEmojiField(field) {
  if (!(field instanceof HTMLElement)) return;
  const input = field.querySelector('input[name="emoji"]');
  if (!(input instanceof HTMLInputElement)) return;
  input.value = sanitizeEmojiInput(input.value);
  const value = input.value;
  const preview = field.querySelector('[data-role="emoji-preview"]');
  if (preview) preview.textContent = value || EMOJI_FALLBACK;
  const trigger = field.querySelector(".emoji-trigger-icon");
  if (trigger) trigger.textContent = value || EMOJI_FALLBACK;
  field.querySelectorAll(".emoji-option").forEach((button) => {
    const isSelected = button.dataset.emoji === value;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function syncColorSwatches(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.querySelector('input[name="color"]');
  if (!(input instanceof HTMLInputElement)) return;
  const currentColor = safeColor(input.value);
  form.querySelectorAll(".color-swatch").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.color === currentColor);
  });
}

function syncDraftPreview(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const preview = form.querySelector('[data-role="draft-preview"]');
  if (!(preview instanceof HTMLElement)) return;
  const previewKind = preview.dataset.previewKind;
  const titleNode = preview.querySelector('[data-role="draft-title"]');
  const metaNode = preview.querySelector('[data-role="draft-meta"]');
  const emojiNode = preview.querySelector(".emoji-badge");
  const emojiValue = sanitizeEmojiInput(form.querySelector('input[name="emoji"]')?.value ?? "");

  if (emojiNode) {
    emojiNode.textContent = emojiValue || (previewKind === "routine" ? "🎯" : "📝");
  }

  if (previewKind === "routine") {
    const name = form.querySelector('input[name="name"]')?.value?.trim() || t("routinePreviewTitle");
    const color = safeColor(form.querySelector('input[name="color"]')?.value ?? "#6366f1");
    if (titleNode) titleNode.textContent = name;
    if (metaNode) metaNode.textContent = t("routinePreviewHint");
    preview.style.setProperty("--routine-accent", color);
    return;
  }

  const title = form.querySelector('input[name="title"]')?.value?.trim() || t("todoPreviewTitle");
  const dueDate = form.querySelector('input[name="dueDate"]')?.value ?? "";
  if (titleNode) titleNode.textContent = title;
  if (metaNode) metaNode.textContent = `${t("pending")} · ${describeTodoDue(dueDate)}`;
}

function syncInteractiveFields() {
  syncTrackingForms();
  document.querySelectorAll(".emoji-field").forEach((field) => syncEmojiField(field));
  document.querySelectorAll('form[data-form="routine-create"], form[data-form="todo-create"], form[data-form="todo-create-quick"]').forEach((form) => syncDraftPreview(form));
  document.querySelectorAll('form[data-form="routine-create"], form[data-form="routine-update"]').forEach((form) => syncColorSwatches(form));
  const themeSelect = document.getElementById("theme-select");
  if (themeSelect instanceof HTMLSelectElement) themeSelect.value = state.themePreset;
  const densitySelect = document.getElementById("density-select");
  if (densitySelect instanceof HTMLSelectElement) densitySelect.value = state.density;
}

function syncTrackingForm(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const select = form.querySelector('select[name="trackingType"]');
  const targetInputNode = form.querySelector('input[name="targetCount"]');
  if (!(select instanceof HTMLSelectElement) || !(targetInputNode instanceof HTMLInputElement)) return;
  const config = trackingConfig(select.value);
  targetInputNode.min = String(config.min);
  targetInputNode.step = String(config.step);
  targetInputNode.readOnly = config.readonly;
  if (config.readonly) {
    targetInputNode.value = "1";
  } else if (!targetInputNode.value || Number(targetInputNode.value) < config.min) {
    targetInputNode.value = String(config.value);
  }
}

function syncTrackingForms() {
  document
    .querySelectorAll(
      'form[data-form="routine-item-create"], form[data-form="routine-item-update"], form[data-form="routine-task-template-create"], form[data-form="routine-task-template-update"]',
    )
    .forEach((form) => syncTrackingForm(form));
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

async function finishSuccess(message, options = {}) {
  markActionNow();
  if (options.highlightTodoId) {
    state.highlightTodoId = options.highlightTodoId;
  }
  state.inlineFeedback = null;
  feedback("");
  if (typeof options.onBeforeRefresh === "function") {
    options.onBeforeRefresh();
  }
  await refreshAll();
}

async function onSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const inlineScopes = {
    "auth-login": "auth-login",
    "auth-register": "auth-register",
    "admin-user-update": `admin-user-${form.dataset.userId ?? ""}`,
    "admin-subscription-assign": `admin-billing-${form.dataset.userId ?? ""}`,
    "routine-task-template-create": "routine-task-template-create",
    "routine-task-template-update": `routine-task-template-${form.dataset.id ?? ""}`,
    "routine-create": "routine-create",
    "routine-update": `routine-editor-${form.dataset.id ?? ""}`,
    "routine-item-create": `routine-editor-${form.dataset.routineId ?? ""}`,
    "routine-item-update": `routine-editor-${form.dataset.routineId ?? ""}`,
    "routine-set-create": "routine-set-create",
    "assignments-save": "assignments",
    "override-save": "override",
    "todo-create": "todo-create",
    "todo-create-quick": "today-quick",
    "todo-update": `todo-${form.dataset.id ?? ""}`,
    "stats-custom": "stats-custom",
  };
  try {
    if (form.dataset.form === "auth-login") {
      return runPending("auth-login", async () => {
        const result = await api("/api/auth/login", {
          method: "POST",
          skipAuth: true,
          preserveAuthOn401: true,
          body: JSON.stringify({
            email: data.get("email"),
            password: data.get("password"),
          }),
        });
        setAuthToken(result?.session?.token ?? "");
        state.authUser = result?.user ?? null;
        state.billingOverview = result?.billing ?? null;
        setAccountSection("profile");
        await finishSuccess("loginDone", { inlineScope: "auth-login" });
      });
    }
    if (form.dataset.form === "auth-register") {
      return runPending("auth-register", async () => {
        const result = await api("/api/auth/register", {
          method: "POST",
          skipAuth: true,
          preserveAuthOn401: true,
          body: JSON.stringify({
            displayName: data.get("displayName") || null,
            email: data.get("email"),
            password: data.get("password"),
          }),
        });
        setAuthToken(result?.session?.token ?? "");
        state.authUser = result?.user ?? null;
        state.billingOverview = result?.billing ?? null;
        setAccountSection("profile");
        await finishSuccess("registerDone", { inlineScope: "auth-register" });
      });
    }
    if (form.dataset.form === "admin-user-update") {
      return runPending(`admin-user-${form.dataset.userId}`, async () => {
        await api(`/api/admin/users/${form.dataset.userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            role: data.get("role"),
            status: data.get("status"),
          }),
        });
        await finishSuccess("adminUserUpdated", { inlineScope: `admin-user-${form.dataset.userId}` });
      });
    }
    if (form.dataset.form === "admin-subscription-assign") {
      return runPending(`admin-billing-${form.dataset.userId}`, async () => {
        await api(`/api/admin/users/${form.dataset.userId}/subscription`, {
          method: "POST",
          body: JSON.stringify({
            planCode: data.get("planCode"),
          }),
        });
        await finishSuccess("adminPlanAssigned", { inlineScope: `admin-billing-${form.dataset.userId}` });
      });
    }
    if (form.dataset.form === "routine-create") {
      return runPending("routine-create", async () => {
        syncRoutineCreateDraftFromForm(form);
        await api("/api/routines", {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            emoji: formEmojiValue(data),
            color: data.get("color"),
            taskTemplateIds: checkedValues(form, "taskTemplateIds"),
          }),
        });
        syncRouteState("/routines");
        await finishSuccess("createRoutineDone", {
          inlineScope: "routine-create",
          onBeforeRefresh() {
            resetRoutineCreateDraft();
            state.isRoutineQuickTaskCreateOpen = false;
          },
        });
      });
    }
    if (form.dataset.form === "routine-task-template-create") {
      return runPending("routine-task-template-create", async () => {
        if (form.dataset.context === "routine-create") {
          syncRoutineCreateDraftFromForm(document.querySelector('form[data-form="routine-create"]'));
        }
        const result = await api("/api/routine-task-templates", {
          method: "POST",
          body: JSON.stringify({
            title: data.get("title"),
            trackingType: data.get("trackingType"),
            targetCount: Number(data.get("targetCount")),
          }),
        });
        await finishSuccess("createItemDone", {
          inlineScope: "routine-task-template-create",
          onBeforeRefresh() {
            if (form.dataset.context === "routine-create") {
              const draft = getRoutineCreateDraft();
              setRoutineCreateDraft({
                ...draft,
                taskTemplateIds: [...draft.taskTemplateIds, result?.routineTaskTemplate?.id].filter(Boolean),
              });
              state.isRoutineQuickTaskCreateOpen = false;
            }
          },
        });
      });
    }
    if (form.dataset.form === "routine-task-template-update") {
      return runPending(`routine-task-template-${form.dataset.id}`, async () => {
        await api(`/api/routine-task-templates/${form.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: data.get("title"),
            trackingType: data.get("trackingType"),
            targetCount: Number(data.get("targetCount")),
            isArchived: data.get("isArchived") === "true",
          }),
        });
        await finishSuccess("updateItemDone", {
          inlineScope: `routine-task-template-${form.dataset.id}`,
        });
      });
    }
    if (form.dataset.form === "routine-update") {
      return runPending(`routine-editor-${form.dataset.id}`, async () => {
        await api(`/api/routines/${form.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: data.get("name"),
            emoji: formEmojiValue(data),
            color: data.get("color"),
            isArchived: data.get("isArchived") === "true",
          }),
        });
        await finishSuccess("updateRoutineDone", { inlineScope: `routine-editor-${form.dataset.id}` });
      });
    }
    if (form.dataset.form === "routine-item-create") {
      state.expandedRoutineIds.add(form.dataset.routineId);
      return runPending(`routine-editor-${form.dataset.routineId}`, async () => {
        await api(`/api/routines/${form.dataset.routineId}/items`, {
          method: "POST",
          body: JSON.stringify({
            title: data.get("title"),
            trackingType: data.get("trackingType"),
            targetCount: Number(data.get("targetCount")),
          }),
        });
        await finishSuccess("createItemDone", { inlineScope: `routine-editor-${form.dataset.routineId}` });
      });
    }
    if (form.dataset.form === "routine-item-update") {
      state.expandedRoutineIds.add(form.dataset.routineId);
      return runPending(`routine-editor-${form.dataset.routineId}`, async () => {
        await api(`/api/routines/${form.dataset.routineId}/items/${form.dataset.itemId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: data.get("title"),
            trackingType: data.get("trackingType"),
            targetCount: Number(data.get("targetCount")),
            sortOrder: Number(data.get("sortOrder")),
            isActive: data.get("isActive") === "true",
          }),
        });
        await finishSuccess("updateItemDone", { inlineScope: `routine-editor-${form.dataset.routineId}` });
      });
    }
    if (form.dataset.form === "routine-set-create") {
      return runPending("routine-set-create", async () => {
        await api("/api/routine-sets", {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            routineIds: checkedValues(form, "routineIds"),
          }),
        });
        syncRouteState("/routines");
        await finishSuccess("createSetDone", { inlineScope: "routine-set-create" });
      });
    }
    if (form.dataset.form === "routine-set-update") {
      return runPending(`routine-set-${form.dataset.id}`, async () => {
        await api(`/api/routine-sets/${form.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: data.get("name"),
            routineIds: checkedValues(form, "routineIds"),
          }),
        });
        await finishSuccess("updateSetDone");
      });
    }
    if (form.dataset.form === "assignments-save") {
      const assignments = [];
      if (data.get("weekdaySetId")) assignments.push({ ruleType: "weekday", setId: data.get("weekdaySetId") });
      if (data.get("weekendSetId")) assignments.push({ ruleType: "weekend", setId: data.get("weekendSetId") });
      return runPending("assignments", async () => {
        await api("/api/assignments", { method: "PUT", body: JSON.stringify({ assignments }) });
        await finishSuccess("saveAssignmentsDone", { inlineScope: "assignments" });
      });
    }
    if (form.dataset.form === "override-save") {
      return runPending("override", async () => {
        await api(`/api/overrides/${form.dataset.date || state.selectedDate}`, {
          method: "PUT",
          body: JSON.stringify({
            setId: data.get("setId") || null,
            includeRoutineIds: checkedValues(form, "includeRoutineIds"),
            excludeRoutineIds: checkedValues(form, "excludeRoutineIds"),
          }),
        });
        await finishSuccess("saveOverrideDone", { inlineScope: "override" });
      });
    }
    if (form.dataset.form === "todo-create") {
      return runPending("todo-create", async () => {
        const result = await api("/api/todos", {
          method: "POST",
          body: JSON.stringify({
            title: data.get("title"),
            emoji: formEmojiValue(data),
            note: data.get("note") || null,
            dueDate: data.get("dueDate") || null,
          }),
        });
        await finishSuccess("createTodoDone", {
          inlineScope: "todo-create",
          highlightTodoId: result?.todo?.id,
        });
      });
    }
    if (form.dataset.form === "todo-create-quick") {
      return runPending("today-quick", async () => {
        const result = await api("/api/todos", {
          method: "POST",
          body: JSON.stringify({
            title: data.get("title"),
            emoji: formEmojiValue(data),
            note: null,
            dueDate: data.get("dueDate") || null,
          }),
        });
        await finishSuccess("createTodoDone", {
          inlineScope: "today-quick",
          highlightTodoId: result?.todo?.id,
          onBeforeRefresh() {
            state.isHomeQuickCreateOpen = false;
          },
        });
      });
    }
    if (form.dataset.form === "todo-update") {
      return runPending(`todo-${form.dataset.id}`, async () => {
        await api(`/api/todos/${form.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: data.get("title"),
            emoji: formEmojiValue(data),
            note: data.get("note") || null,
            dueDate: data.get("dueDate") || null,
            status: data.get("status"),
          }),
        });
        await finishSuccess("updateTodoDone", { inlineScope: `todo-${form.dataset.id}` });
      });
    }
    if (form.dataset.form === "stats-custom") {
      const start = String(data.get("start") || "");
      const end = String(data.get("end") || "");
      if (!start || !end) {
        setInlineFeedback("stats-custom", t("customStatsRangeRequired"), true);
        render();
        return;
      }
      if (start > end) {
        setInlineFeedback("stats-custom", t("customStatsRangeOrder"), true);
        render();
        return;
      }
      state.customStatsStart = start;
      state.customStatsEnd = end;
      state.statsRange = "custom";
      await finishSuccess("customStatsDone", { inlineScope: "stats-custom" });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t("saveFailed");
    const scope = inlineScopes[form.dataset.form];
    if (scope) {
      setInlineFeedback(scope, message, true);
      render();
      feedback("");
      return;
    }
    feedback(message, true);
  }
}

async function onClick(event) {
  const button = event.target.closest("[data-action], [data-tab]");
  if (!button) return;
  if (button.dataset.tab) {
    state.appNavOpen = false;
    setRoute(`/${button.dataset.tab}`);
    return;
  }
  try {
    if (button.dataset.action === "go-route" && button.dataset.path) {
      state.appNavOpen = false;
      setRoute(button.dataset.path);
      return;
    }
    if (button.dataset.action === "open-account") {
      state.appNavOpen = false;
      setRoute("/account");
      return;
    }
    if (button.dataset.action === "open-settings") {
      state.appNavOpen = false;
      setRoute("/settings");
      return;
    }
    if (button.dataset.action === "toggle-app-nav") {
      state.appNavOpen = !state.appNavOpen;
      renderAppNav();
      return;
    }
    if (button.dataset.action === "close-app-nav") {
      state.appNavOpen = false;
      renderAppNav();
      return;
    }
    if (button.dataset.action === "select-account-section") {
      setAccountSection(button.dataset.section ?? "auth");
      renderAuthShell();
      return;
    }
    if (button.dataset.action === "select-admin-section") {
      setAdminSection(button.dataset.section ?? "overview");
      renderAdmin();
      return;
    }
    if (button.dataset.action === "open-admin-workspace") {
      state.appNavOpen = false;
      setRoute("/admin");
      return;
    }
    if (button.dataset.action === "auth-mode") {
      state.authMode = button.dataset.mode === "register" ? "register" : "login";
      renderAuthShell();
      return;
    }
    if (button.dataset.action === "pick-emoji") {
      const field = button.closest(".emoji-field");
      const input = field?.querySelector('input[name="emoji"]');
      if (input instanceof HTMLInputElement) {
        input.value = sanitizeEmojiInput(button.dataset.emoji);
        rememberEmoji(input.value);
        syncEmojiField(field);
        syncDraftPreview(button.closest("form"));
        const picker = button.closest("details");
        if (picker instanceof HTMLDetailsElement) {
          picker.open = false;
        }
      }
      return;
    }
    if (button.dataset.action === "clear-emoji") {
      const field = button.closest(".emoji-field");
      const input = field?.querySelector('input[name="emoji"]');
      if (input instanceof HTMLInputElement) {
        input.value = "";
        syncEmojiField(field);
        syncDraftPreview(button.closest("form"));
      }
      return;
    }
    if (button.dataset.action === "pick-color") {
      const form = button.closest("form");
      const input = form?.querySelector('input[name="color"]');
      if (input instanceof HTMLInputElement) {
        input.value = safeColor(button.dataset.color);
        syncColorSwatches(form);
        syncDraftPreview(form);
        syncRoutineCreateDraftFromForm(form);
      }
      return;
    }
    if (button.dataset.action === "toggle-settings-control") {
      state.settingsExpandedControl = state.settingsExpandedControl === button.dataset.control ? "" : button.dataset.control ?? "";
      renderSettingsPage();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "toggle-routine-create") {
      state.isRoutineCreateOpen = !state.isRoutineCreateOpen;
      renderRoutines();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "toggle-routine-set-create") {
      state.isRoutineSetCreateOpen = !state.isRoutineSetCreateOpen;
      renderRoutines();
      return;
    }
    if (button.dataset.action === "toggle-today-quick") {
      state.isTodayQuickOpen = !state.isTodayQuickOpen;
      renderToday();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "toggle-home-quick") {
      state.isHomeQuickCreateOpen = !state.isHomeQuickCreateOpen;
      renderToday();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "close-home-quick") {
      state.isHomeQuickCreateOpen = false;
      renderToday();
      return;
    }
    if (button.dataset.action === "toggle-todo-create") {
      state.isTodoCreateOpen = !state.isTodoCreateOpen;
      renderTodos();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "toggle-routine-task-template") {
      toggleSetEntry(state.expandedRoutineTaskTemplateIds, button.dataset.id);
      renderRoutines();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "toggle-routine-task-template-create") {
      state.isRoutineQuickTaskCreateOpen = !state.isRoutineQuickTaskCreateOpen;
      renderRoutines();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "toggle-routine-items") {
      toggleSetEntry(state.expandedRoutineIds, button.dataset.routineId);
      renderRoutines();
      syncInteractiveFields();
      return;
    }
    if (button.dataset.action === "toggle-completed-items") {
      if (isMobileViewport()) {
        toggleSetEntry(state.revealedCompletedRoutineIds, button.dataset.routineId);
      } else {
        toggleSetEntry(state.collapsedRoutineCompletedIds, button.dataset.routineId);
      }
      renderToday();
      return;
    }
    if (button.dataset.action === "today-todo-section") {
      state.todayTodoSection = button.dataset.section === "inbox" ? "inbox" : "due";
      renderToday();
      return;
    }
    if (button.dataset.action === "set-home-board-mode") {
      state.homeBoardMode = button.dataset.mode === "todos" ? "todos" : "routines";
      renderToday();
      return;
    }
    if (button.dataset.action === "shift-home-week") {
      const direction = Number(button.dataset.direction) || 0;
      const nextDate = addDaysToDateKey(currentHomeDate() || state.today?.date || dateKeyFromMonth(monthKey(new Date()), new Date().getDate()), direction * 7);
      setRoute(buildTodayRoute(nextDate), { skipRender: true });
      return;
    }
    if (button.dataset.action === "select-home-date" && isValidDateKey(button.dataset.date)) {
      setRoute(buildTodayRoute(button.dataset.date), { skipRender: true });
      return;
    }
    if (button.dataset.action === "toggle-assignments") {
      state.isAssignmentsOpen = !state.isAssignmentsOpen;
      if (isMobileViewport() && state.isAssignmentsOpen) {
        state.isOverrideEditorOpen = false;
      }
      renderCalendar();
      return;
    }
    if (button.dataset.action === "toggle-override-editor") {
      state.isOverrideEditorOpen = !state.isOverrideEditorOpen;
      if (isMobileViewport() && state.isOverrideEditorOpen) {
        state.isAssignmentsOpen = false;
      }
      renderCalendar();
      return;
    }
    if (button.dataset.action === "open-routine-create") {
      setRoute("/routines/new");
      return;
    }
    if (button.dataset.action === "open-routine-set-create") {
      setRoute("/routine-sets/new");
      return;
    }
    if (button.dataset.action === "open-routine-task-library") {
      setRoute("/routine-tasks");
      return;
    }
    if (button.dataset.action === "open-todo-create") {
      setRoute("/todos");
      state.isTodoCreateOpen = true;
      render();
      return;
    }
    if (button.dataset.action === "logout") {
      return runPending("auth-logout", async () => {
        await api("/api/auth/logout", { method: "POST" });
        clearAuthState();
        clearPlannerState();
        feedback("");
        redirectToLogin();
      });
    }
    if (button.dataset.action === "activate-plan") {
      return runPending(`billing-${button.dataset.planCode}`, async () => {
        const result = await api("/api/billing/subscription", {
          method: "POST",
          body: JSON.stringify({ planCode: button.dataset.planCode }),
        });
        state.billingOverview = result;
        state.inlineFeedback = null;
        feedback("");
        renderAuthShell();
      });
    }
    if (button.dataset.action === "delete-routine") {
      if (!globalThis.confirm(t("confirmDeleteRoutine"))) return;
      return runPending(`routine-editor-${button.dataset.id}`, async () => {
        await api(`/api/routines/${button.dataset.id}`, { method: "DELETE" });
        await finishSuccess("deleteRoutineDone");
      });
    }
    if (button.dataset.action === "delete-routine-item") {
      if (!globalThis.confirm(t("confirmDeleteItem"))) return;
      state.expandedRoutineIds.add(button.dataset.routineId);
      return runPending(`routine-editor-${button.dataset.routineId}`, async () => {
        await api(`/api/routines/${button.dataset.routineId}/items/${button.dataset.itemId}`, {
          method: "DELETE",
        });
        await finishSuccess("deleteItemDone", { inlineScope: `routine-editor-${button.dataset.routineId}` });
      });
    }
    if (button.dataset.action === "delete-routine-task-template") {
      if (!globalThis.confirm(t("confirmDeleteItem"))) return;
      return runPending(`routine-task-template-${button.dataset.id}`, async () => {
        await api(`/api/routine-task-templates/${button.dataset.id}`, { method: "DELETE" });
        await finishSuccess("deleteItemDone", {
          inlineScope: `routine-task-template-${button.dataset.id}`,
        });
      });
    }
    if (button.dataset.action === "delete-routine-set") {
      if (!globalThis.confirm(t("confirmDeleteSet"))) return;
      return runPending(`routine-set-${button.dataset.id}`, async () => {
        await api(`/api/routine-sets/${button.dataset.id}`, { method: "DELETE" });
        await finishSuccess("deleteSetDone");
      });
    }
    if (button.dataset.action === "delete-todo") {
      if (!globalThis.confirm(t("confirmDeleteTodo"))) return;
      return runPending(`todo-${button.dataset.id}`, async () => {
        await api(`/api/todos/${button.dataset.id}`, { method: "DELETE" });
        await finishSuccess("deleteTodoDone");
      });
    }
    if (button.dataset.action === "complete-todo") {
      return runPending(`todo-${button.dataset.id}`, async () => {
        await api(`/api/todos/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done" }),
        });
        await finishSuccess("updateTodoDone", {
          inlineScope: `todo-${button.dataset.id}`,
          highlightTodoId: button.dataset.id,
        });
      });
    }
    if (button.dataset.action === "move-todo-tomorrow") {
      const tomorrow = new Date(`${state.today?.date}T00:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      return runPending(`todo-${button.dataset.id}`, async () => {
        await api(`/api/todos/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ dueDate, status: "pending" }),
        });
        await finishSuccess("updateTodoDone", { inlineScope: `todo-${button.dataset.id}` });
      });
    }
    if (button.dataset.action === "move-todo-today") {
      return runPending(`todo-${button.dataset.id}`, async () => {
        await api(`/api/todos/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ dueDate: state.today?.date ?? null, status: "pending" }),
        });
        await finishSuccess("updateTodoDone", { inlineScope: `todo-${button.dataset.id}` });
      });
    }
    if (button.dataset.action === "todo-filter") {
      state.todoFilter = button.dataset.filter ?? "all";
      renderTodos();
      return;
    }
    if (button.dataset.action === "change-month") {
      const [year, month] = state.selectedMonth.split("-").map(Number);
      const nextMonth = monthKey(new Date(year, month - 1 + Number(button.dataset.direction), 1));
      const currentDay = Number(state.selectedDate.slice(-2)) || 1;
      state.selectedMonth = nextMonth;
      state.selectedDate = dateKeyFromMonth(nextMonth, Math.min(currentDay, lastDayOfMonth(nextMonth)));
      return refreshAll();
    }
    if (button.dataset.action === "go-to-current-month") {
      const now = new Date();
      state.selectedMonth = monthKey(now);
      state.selectedDate = dateKeyFromMonth(state.selectedMonth, now.getDate());
      return refreshAll();
    }
    if (button.dataset.action === "select-date") {
      state.selectedDate = button.dataset.date;
      state.isOverrideEditorOpen = false;
      state.override = await api(`/api/overrides/${state.selectedDate}`);
      renderCalendar();
      return;
    }
    if (button.dataset.action === "stats-range") {
      state.statsRange = button.dataset.range ?? "week";
      if (state.statsRange === "custom") {
        renderStats();
        return;
      }
      return refreshAll();
    }
    if (button.dataset.action === "adjust-progress") {
      const routine = state.today?.routines.find((entry) => entry.id === button.dataset.routineId);
      const item = routine?.items.find((entry) => entry.id === button.dataset.itemId);
      if (!routine || !item || !state.today) return;
      const delta = Number(button.dataset.direction) * trackingStep(item);
      const itemProgress = routineProgressPayload(routine);
      itemProgress[item.id] = Math.max(0, Math.min(item.targetCount, item.currentCount + delta));
      return runPending(`routine-${routine.id}`, async () => {
        await api(`/api/checkins/${state.today.date}/routines/${routine.id}`, {
          method: "PUT",
          body: JSON.stringify({ itemProgress }),
        });
        await finishSuccess("updateProgressDone", { inlineScope: `routine-${routine.id}` });
      });
    }
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("actionFailed"), true);
  }
}

async function onChange(event) {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === "language-select") {
    state.locale = MESSAGES[target.value] ? target.value : "ko";
    globalThis.localStorage?.setItem(LOCALE_KEY, state.locale);
    render();
    return;
  }
  if (target instanceof HTMLSelectElement && target.id === "theme-select") {
    state.themePreset = THEME_PRESET_OPTIONS.some((option) => option.value === target.value) ? target.value : "violet";
    setStoredOption(THEME_KEY, state.themePreset);
    applyPreferences();
    if (state.activeTab === "settings") {
      renderSettingsPage();
      syncInteractiveFields();
    }
    return;
  }
  if (target instanceof HTMLSelectElement && target.id === "density-select") {
    state.density = DENSITY_OPTIONS.some((option) => option.value === target.value) ? target.value : "comfy";
    setStoredOption(DENSITY_KEY, state.density);
    applyPreferences();
    if (state.activeTab === "settings") {
      renderSettingsPage();
      syncInteractiveFields();
    }
    return;
  }
  if (target instanceof HTMLSelectElement && target.name === "todoDueFilter") {
    state.todoDueFilter = target.value;
    renderTodos();
    return;
  }
  if (target instanceof HTMLSelectElement && target.name === "trackingType") {
    syncTrackingForm(target.closest("form"));
    return;
  }
  if (target instanceof HTMLInputElement && target.name === "taskTemplateIds") {
    syncRoutineCreateDraftFromForm(target.closest("form"));
    return;
  }
  if (target instanceof HTMLInputElement && target.name === "emoji") {
    target.value = sanitizeEmojiInput(target.value);
    if (target.value) {
      rememberEmoji(target.value);
    }
    syncEmojiField(target.closest(".emoji-field"));
    syncDraftPreview(target.closest("form"));
    syncRoutineCreateDraftFromForm(target.closest("form"));
    return;
  }
  if (!(target instanceof HTMLInputElement) || target.dataset.action !== "toggle-binary") return;
  try {
    const routine = state.today?.routines.find((entry) => entry.id === target.dataset.routineId);
    const item = routine?.items.find((entry) => entry.id === target.dataset.itemId);
    if (!routine || !item || !state.today) return;
    const itemProgress = routineProgressPayload(routine);
    itemProgress[item.id] = target.checked ? 1 : 0;
    await runPending(`routine-${routine.id}`, async () => {
      await api(`/api/checkins/${state.today.date}/routines/${routine.id}`, {
        method: "PUT",
        body: JSON.stringify({ itemProgress }),
      });
      await finishSuccess("updateCheckDone", { inlineScope: `routine-${routine.id}` });
    });
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("actionFailed"), true);
  }
}

function onInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target instanceof HTMLInputElement && target.name === "todoSearch") {
    state.todoSearchQuery = target.value;
    renderTodos();
    return;
  }
  const form = target.closest("form");
  if (target instanceof HTMLInputElement && target.name === "emoji") {
    target.value = sanitizeEmojiInput(target.value);
    syncEmojiField(target.closest(".emoji-field"));
  }
  if (target instanceof HTMLInputElement && target.name === "color") {
    syncColorSwatches(form);
  }
  syncDraftPreview(form);
  syncRoutineCreateDraftFromForm(form);
}

document.addEventListener("submit", (event) => void onSubmit(event));
document.addEventListener("click", (event) => void onClick(event));
document.addEventListener("change", (event) => void onChange(event));
document.addEventListener("input", (event) => void onInput(event));
globalThis.addEventListener?.("hashchange", () => {
  const route = syncRouteState(globalThis.location?.hash?.slice(1) || "/today");
  if (route.screen === "today") {
    void refreshTodayData().catch((error) => {
      feedback(error instanceof Error ? error.message : t("loadFailed"), true);
    });
    return;
  }
  render();
});

if (MOBILE_VIEWPORT_QUERY) {
  const onViewportChange = () => {
    state.appNavOpen = false;
    state.isHomeQuickCreateOpen = false;
    render();
  };
  if (typeof MOBILE_VIEWPORT_QUERY.addEventListener === "function") {
    MOBILE_VIEWPORT_QUERY.addEventListener("change", onViewportChange);
  } else if (typeof MOBILE_VIEWPORT_QUERY.addListener === "function") {
    MOBILE_VIEWPORT_QUERY.addListener(onViewportChange);
  }
}

async function initializeApp() {
  syncRouteState(globalThis.location?.hash?.slice(1) || "/today");
  if (!globalThis.location?.hash) {
    globalThis.history?.replaceState?.(null, "", "#/today");
  }
  render();
  try {
    await refreshHealth();
    await refreshBillingPlans();
    await refreshSession({ silent: true });
    if (plannerLocked()) {
      redirectToLogin();
      return;
    }
    await refreshAll("loaded");
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("loadFailed"), true);
  }
}

void initializeApp();
