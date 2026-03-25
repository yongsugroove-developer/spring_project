import { ROUTINE_COLOR_SWATCHES, ROUTINE_EMOJI_GROUPS, TODO_EMOJI_GROUPS } from "./emojiCatalog.js";
import { LANGUAGE_LABELS, MESSAGES } from "./translations.js";

const LOCALE_KEY = "my-planner-locale";
const RECENT_EMOJIS_KEY = "my-planner-recent-emojis";
const THEME_KEY = "my-planner-theme";
const DENSITY_KEY = "my-planner-density";
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

const state = {
  activeTab: "today",
  selectedMonth: monthKey(new Date()),
  selectedDate: "",
  statsRange: "week",
  todoFilter: "all",
  todoDueFilter: "all",
  todoSearchQuery: "",
  customStatsStart: "",
  customStatsEnd: "",
  isRoutineCreateOpen: false,
  isRoutineSetCreateOpen: false,
  isTodoCreateOpen: false,
  isAssignmentsOpen: false,
  isOverrideEditorOpen: false,
  expandedRoutineIds: new Set(),
  collapsedRoutineCompletedIds: new Set(),
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
  today: null,
  routines: [],
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

function applyPreferences() {
  document.body.dataset.theme = state.themePreset;
  document.body.dataset.density = state.density;
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

function emojiGroups(kind) {
  return kind === "todo" ? TODO_EMOJI_GROUPS : ROUTINE_EMOJI_GROUPS;
}

function emojiLabelForGroup(key) {
  const labelKey = `emojiGroup${key.slice(0, 1).toUpperCase()}${key.slice(1)}`;
  return t(labelKey);
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
    <div class="emoji-grid">${items.map((emoji) => emojiPickerButton(emoji, selectedEmoji)).join("")}</div>
  </div>`;
}

function emojiPickerButton(emoji, selectedEmoji) {
  const isSelected = sanitizeEmojiInput(selectedEmoji) === emoji;
  return `<button class="emoji-option ${isSelected ? "is-selected" : ""}" type="button" data-action="pick-emoji" data-emoji="${esc(emoji)}" aria-pressed="${String(isSelected)}">${esc(emoji)}</button>`;
}

function emojiField(selectedEmoji = "", kind = "routine") {
  const emoji = sanitizeEmojiInput(selectedEmoji);
  const recent = getRecentEmojis();
  return `<label class="field field-wide emoji-field">
    <span>${t("emoji")}</span>
    <div class="emoji-input-shell">
      <span class="emoji-preview" data-role="emoji-preview">${emoji ? esc(emoji) : EMOJI_FALLBACK}</span>
      <input name="emoji" maxlength="16" value="${esc(emoji)}" placeholder="${t("emojiPlaceholder")}" autocomplete="off" />
      <details class="emoji-picker">
        <summary class="emoji-trigger">
          <span class="emoji-trigger-icon">${emoji ? esc(emoji) : EMOJI_FALLBACK}</span>
          <span>${t("emojiPicker")}</span>
        </summary>
        <div class="emoji-picker-panel">
          ${recent.length ? emojiPickerSection(t("recentEmojis"), recent, emoji) : ""}
          ${emojiGroups(kind)
            .map((group) => emojiPickerSection(emojiLabelForGroup(group.key), group.items, emoji))
            .join("")}
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
  node.style.color = error ? "var(--danger)" : "var(--accent)";
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
  text("theme-label", t("theme"));
  text("density-label", t("density"));
  const tabs = document.querySelector(".tabs");
  if (tabs) {
    tabs.setAttribute("aria-label", t("plannerSections"));
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

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": state.locale,
    },
    ...options,
  });
  if (res.status === 204) return null;
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(t("invalidJson"));
  }
  if (!res.ok) throw new Error(data?.message ?? t("actionFailed"));
  return data;
}

async function refreshAll(message = "") {
  try {
    const statsQuery =
      state.statsRange === "custom" && state.customStatsStart && state.customStatsEnd
        ? `?range=custom&start=${state.customStatsStart}&end=${state.customStatsEnd}`
        : `?range=${state.statsRange}`;
    const [today, routines, routineSets, assignments, todos, calendar, stats] =
      await Promise.all([
        api("/api/today"),
        api("/api/routines"),
        api("/api/routine-sets"),
        api("/api/assignments"),
        api("/api/todos"),
        api(`/api/calendar?month=${state.selectedMonth}`),
        api(`/api/stats${statsQuery}`),
      ]);
    state.today = today;
    state.routines = routines.routines;
    state.routineSets = routineSets.routineSets;
    state.assignments = assignments.assignments;
    state.todos = todos.todos;
    state.calendar = calendar;
    state.stats = stats;
    if (state.highlightTodoId && !state.todos.some((todo) => todo.id === state.highlightTodoId)) {
      state.highlightTodoId = "";
    }
    state.selectedDate ||= today.date;
    state.override = await api(`/api/overrides/${state.selectedDate}`);
    render();
    if (message) feedback(resolveMessage(message));
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("loadFailed"), true);
  }
}

function render() {
  applyStaticText();
  applyPreferences();
  renderHero();
  renderTabs();
  renderToday();
  renderRoutines();
  renderTodos();
  renderCalendar();
  renderStats();
  syncInteractiveFields();
}

function renderHero() {
  text("hero-set", state.today?.assignment.baseSetName ?? t("noSet"));
  text("hero-rate", percent(state.today?.summary.routineRate));
  text("hero-streak", `${state.stats?.summary.currentStreak ?? 0} ${t("days")}`);
  text("hero-date", dateLabel(state.today?.date));
  const focus = document.getElementById("hero-focus");
  if (focus) {
    focus.innerHTML = todayFocusCards();
  }
}

function renderTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isActive = panel.id === `tab-${state.activeTab}`;
    panel.classList.toggle("is-active", isActive);
    panel.toggleAttribute("hidden", !isActive);
  });
}

function renderToday() {
  const target = document.getElementById("tab-today");
  if (!target || !state.today) return;
  const summary = state.today.summary;
  target.innerHTML = `<div class="layout-2 layout-dashboard">
    <article class="panel section section-elevated">
      <div class="section-head">
        <div>
          <p class="section-label">${t("today")}</p>
          <h2>${t("routineProgressForDate", { date: dateLabel(state.today.date) })}</h2>
        </div>
        <span class="pill">${esc(state.today.assignment.baseSetName ?? t("noSet"))}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-card"><span>${t("rate")}</span><strong>${percent(summary.routineRate)}</strong></div>
        <div class="summary-card"><span>${t("units")}</span><strong>${summary.completedUnits}/${summary.targetUnits}</strong></div>
        <div class="summary-card"><span>${t("items")}</span><strong>${summary.completedItemCount}/${summary.totalItemCount}</strong></div>
      </div>
      <div class="today-strip top-gap">
        <div class="content-card content-card--stat"><span>${t("focusRemainingRoutines")}</span><strong>${remainingRoutineCount()}</strong></div>
        <div class="content-card content-card--stat"><span>${t("focusTodayTodos")}</span><strong>${summary.dueTodayCount}</strong></div>
        <div class="content-card content-card--stat"><span>${t("inbox")}</span><strong>${summary.inboxCount}</strong></div>
      </div>
      <div class="stack stack-lg top-gap">${state.today.routines.length ? state.today.routines.map(todayRoutine).join("") : empty(t("noActiveRoutines"), { label: t("openCreateRoutine"), action: "open-routine-create" })}</div>
    </article>
    <div class="stack side-stack">
      <article class="panel section quick-entry-panel">
        <div class="section-head"><div><p class="section-label">${t("quickAdd")}</p><h2>${t("todayQuickEntry")}</h2></div></div>
        <form class="content-card content-card--form quick-form" data-form="todo-create-quick">
          <div class="create-flow create-flow--compact">
            <div class="stack">
              <div class="form-grid">
                ${emojiField("", "todo")}
                <label class="field field-wide"><span>${t("title")}</span><input name="title" required /></label>
                <label class="field"><span>${t("date")}</span><input name="dueDate" type="date" value="${esc(state.today.date)}" /></label>
              </div>
              ${inlineFeedback("today-quick")}
              <div class="actions"><button class="btn" type="submit">${t("quickCreateTodo")}</button></div>
            </div>
            ${todoDraftPreview({ dueDate: state.today.date })}
          </div>
        </form>
      </article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("todayTodos")}</p><h2>${t("dueToday")}</h2></div><span class="state-pill">${summary.dueTodayCount}</span></div>
        <div class="list-stack">${state.today.todos.dueToday.length ? state.today.todos.dueToday.map((todo) => todayTodoCard(todo, "due")).join("") : empty(t("noDueToday"), { label: t("openCreateTodo"), action: "open-todo-create" })}</div>
      </article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("inbox")}</p><h2>${t("inbox")}</h2></div><span class="state-pill">${summary.inboxCount}</span></div>
        <div class="list-stack">${state.today.todos.inbox.length ? state.today.todos.inbox.map((todo) => todayTodoCard(todo, "inbox")).join("") : empty(t("emptyInbox"), { label: t("openCreateTodo"), action: "open-todo-create" })}</div>
      </article>
    </div>
  </div>`;
}

function todayRoutine(routine) {
  const hideCompleted = state.collapsedRoutineCompletedIds.has(routine.id);
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
  const target = document.getElementById("tab-routines");
  if (!target) return;
  target.innerHTML = `<div class="layout-2 layout-workspace">
    <div class="stack">
      <article class="panel section section-elevated">
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
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("createSet")}</p><h2>${t("routineSetsHeading")}</h2></div>${toggleButton("toggle-routine-set-create", state.isRoutineSetCreateOpen, state.isRoutineSetCreateOpen ? t("hideCreateSet") : t("openCreateSet"))}</div>
        ${state.isRoutineSetCreateOpen ? `<form class="content-card content-card--form" data-form="routine-set-create">${routineSetFields()}${inlineFeedback("routine-set-create")}<div class="actions"><button class="btn" type="submit">${t("createSet")}</button></div></form>` : `<div class="content-card collapsed-summary"><strong>${t("createSetPrompt")}</strong><p class="muted">${t("createSetHint")}</p></div>`}
      </article>
    </div>
    <div class="stack">
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("routineEditor")}</p><h2>${t("routineEditor")}</h2></div></div>
        <div class="stack">${state.routines.length ? state.routines.map(routineEditor).join("") : empty(t("noRoutines"), { label: t("openCreateRoutine"), action: "open-routine-create" })}</div>
      </article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("routineSetsHeading")}</p><h2>${t("routineSetsHeading")}</h2></div></div>
        <div class="stack">${state.routineSets.length ? state.routineSets.map(routineSetEditor).join("") : empty(t("noRoutineSets"), { label: t("openCreateSet"), action: "open-routine-set-create" })}</div>
      </article>
    </div>
  </div>`;
}

function routineFields(routine = {}) {
  return `<div class="form-grid">
    ${emojiField(routine.emoji ?? "", "routine")}
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
  target.innerHTML = `<div class="layout-2-equal layout-workspace">
    <article class="panel section section-elevated">
      <div class="section-head"><div><p class="section-label">${t("createTodo")}</p><h2>${t("createTodoHeading")}</h2></div>${toggleButton("toggle-todo-create", state.isTodoCreateOpen, state.isTodoCreateOpen ? t("hideCreateTodo") : t("openCreateTodo"))}</div>
      ${state.isTodoCreateOpen ? `<form class="content-card content-card--form" data-form="todo-create">
        <div class="create-flow">
          <div class="stack">
            <div class="form-grid">
              ${emojiField("", "todo")}
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
    <article class="panel section">
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
      ${emojiField(todo.emoji ?? "", "todo")}
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
  if (!target || !state.calendar || !state.override) return;
  const [year, month] = state.selectedMonth.split("-");
  const weekday = state.assignments.find((entry) => entry.ruleType === "weekday");
  const weekend = state.assignments.find((entry) => entry.ruleType === "weekend");
  const override = state.override.override;
  const selectedDay =
    state.calendar.days.find((day) => day.date === state.selectedDate) ?? state.calendar.days[0] ?? null;
  const firstDay = state.calendar.days[0] ? new Date(`${state.calendar.days[0].date}T00:00:00Z`).getUTCDay() : 0;
  target.innerHTML = `<div class="layout-2 layout-workspace">
    <article class="panel section section-elevated">
      <div class="section-head"><div><p class="section-label">${t("calendar")}</p><h2>${t("assignmentCalendar", { year, month })}</h2></div><div class="inline-actions"><button class="btn-soft compact-action" type="button" data-action="change-month" data-direction="-1">${t("prev")}</button><button class="btn-soft compact-action" type="button" data-action="go-to-current-month">${t("goToToday")}</button><button class="btn-soft compact-action" type="button" data-action="change-month" data-direction="1">${t("next")}</button></div></div>
      <div class="calendar-legend">
        <span class="legend-item"><span class="legend-swatch is-progress"></span>${t("calendarRoutineRate")}</span>
        <span class="legend-item"><span class="legend-swatch is-override"></span>${t("calendarOverrideState")}</span>
      </div>
      <div class="calendar-grid">${weekdayLabels().map((label) => `<div class="weekday">${label}</div>`).join("")}${new Array(firstDay).fill("").map(() => '<div class="day-card is-empty"></div>').join("")}${state.calendar.days.map(calendarDay).join("")}</div>
    </article>
    <div class="stack">
      ${selectedDay ? `<article class="panel section calendar-focus-card">
        <div class="section-head"><div><p class="section-label">${t("calendarFocusTitle")}</p><h2>${dateLabel(selectedDay.date)}</h2></div><span class="pill">${esc(selectedDay.setName ?? t("noSet"))}</span></div>
        <div class="summary-grid">
          <div class="summary-card"><span>${t("calendarRoutineRate")}</span><strong>${percent(selectedDay.routineProgressRate)}</strong></div>
          <div class="summary-card"><span>${t("calendarTodoCount")}</span><strong>${selectedDay.completedTodoCount}/${selectedDay.todoCount}</strong></div>
          <div class="summary-card"><span>${t("calendarOverrideState")}</span><strong>${selectedDay.overrideApplied ? t("calendarOverrideOn") : t("calendarOverrideOff")}</strong></div>
        </div>
      </article>` : ""}
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("assignmentsHeading")}</p><h2>${t("weekdayWeekend")}</h2></div>${toggleButton("toggle-assignments", state.isAssignmentsOpen, state.isAssignmentsOpen ? t("hideAssignmentsEditor") : t("editBaseAssignments"))}</div>
        ${state.isAssignmentsOpen ? `<form class="content-card content-card--form" data-form="assignments-save"><div class="form-grid"><label class="field"><span>${t("weekdaySet")}</span><select name="weekdaySetId">${setOptions(weekday?.setId ?? "", true)}</select></label><label class="field"><span>${t("weekendSet")}</span><select name="weekendSetId">${setOptions(weekend?.setId ?? "", true)}</select></label></div>${inlineFeedback("assignments")}<div class="actions"><button class="btn" type="submit">${t("saveAssignments")}</button></div></form>` : `<div class="content-card collapsed-summary"><strong>${t("baseAssignmentSummary")}</strong><p class="muted">${t("weekdaySet")}: ${esc(weekday ? state.routineSets.find((set) => set.id === weekday.setId)?.name ?? t("none") : t("none"))} · ${t("weekendSet")}: ${esc(weekend ? state.routineSets.find((set) => set.id === weekend.setId)?.name ?? t("none") : t("none"))}</p></div>`}
      </article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("overrideHeading")}</p><h2>${t("overrideForDate", { date: dateLabel(state.selectedDate) })}</h2></div>${toggleButton("toggle-override-editor", state.isOverrideEditorOpen, state.isOverrideEditorOpen ? t("hideOverrideEditor") : t("editOverride"))}</div>
        ${state.isOverrideEditorOpen ? `<form class="override-card content-card--form" data-form="override-save" data-date="${state.selectedDate}"><div class="form-grid"><label class="field-wide"><span>${t("forcedSet")}</span><select name="setId">${setOptions(override.setId ?? "", true)}</select></label><div class="field-wide"><span>${t("includeRoutines")}</span><div class="choice-list">${state.routines.map((routine) => routineChoiceItem(routine, "includeRoutineIds", override.includeRoutineIds.includes(routine.id))).join("")}</div></div><div class="field-wide"><span>${t("excludeRoutines")}</span><div class="choice-list">${state.routines.map((routine) => routineChoiceItem(routine, "excludeRoutineIds", override.excludeRoutineIds.includes(routine.id))).join("")}</div></div></div>${inlineFeedback("override")}<div class="actions"><button class="btn" type="submit">${t("saveOverride")}</button></div></form>` : `<div class="content-card collapsed-summary"><strong>${t("calendarOverrideState")}</strong><p class="muted">${override.setId ? `${t("forcedSet")}: ${esc(state.routineSets.find((set) => set.id === override.setId)?.name ?? t("none"))}` : t("calendarOverrideOff")}</p><p class="muted">${t("includeRoutines")}: ${override.includeRoutineIds.length} · ${t("excludeRoutines")}: ${override.excludeRoutineIds.length}</p></div>`}
      </article>
    </div>
  </div>`;
}

function calendarDay(day) {
  return `<button class="day-card ${state.selectedDate === day.date ? "is-selected" : ""} ${day.overrideApplied ? "has-override" : ""}"${progressStyle(day.routineProgressRate)} type="button" data-action="select-date" data-date="${day.date}"><div class="day-card-head"><strong>${Number(day.date.slice(-2))}</strong>${day.overrideApplied ? `<span class="calendar-flag">${t("calendarOverrideOn")}</span>` : ""}</div><div class="calendar-meta"><span class="calendar-set">${esc(day.setName ?? t("noSet"))}</span><span>${percent(day.routineProgressRate)}</span><span>${day.completedUnits}/${day.targetUnits}</span></div></button>`;
}

function setOptions(selectedId, blank = false) {
  const options = state.routineSets.map((set) => `<option value="${set.id}" ${set.id === selectedId ? "selected" : ""}>${esc(set.name)}</option>`);
  if (blank) options.unshift(`<option value="" ${selectedId ? "" : "selected"}>${t("none")}</option>`);
  return options.join("");
}

function renderStats() {
  const target = document.getElementById("tab-stats");
  if (!target || !state.stats) return;
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

function empty(message, action = null) {
  const actionMarkup =
    action?.label && action?.action
      ? `<div class="actions actions-center"><button class="btn-soft" type="button" data-action="${action.action}">${esc(action.label)}</button></div>`
      : "";
  return `<div class="empty"><p>${esc(message)}</p>${actionMarkup}</div>`;
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
    .querySelectorAll('form[data-form="routine-item-create"], form[data-form="routine-item-update"]')
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
  if (options.inlineScope) {
    setInlineFeedback(options.inlineScope, message);
  }
  if (typeof options.onBeforeRefresh === "function") {
    options.onBeforeRefresh();
  }
  await refreshAll(message);
}

async function onSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const inlineScopes = {
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
    if (form.dataset.form === "routine-create") {
      return runPending("routine-create", async () => {
        await api("/api/routines", {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            emoji: formEmojiValue(data),
            color: data.get("color"),
          }),
        });
        await finishSuccess("createRoutineDone", { inlineScope: "routine-create" });
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
        feedback(t("customStatsRangeRequired"), true);
        return;
      }
      if (start > end) {
        setInlineFeedback("stats-custom", t("customStatsRangeOrder"), true);
        render();
        feedback(t("customStatsRangeOrder"), true);
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
    }
    feedback(message, true);
  }
}

async function onClick(event) {
  const button = event.target.closest("[data-action], [data-tab]");
  if (!button) return;
  if (button.dataset.tab) {
    state.activeTab = button.dataset.tab;
    renderTabs();
    return;
  }
  try {
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
      }
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
    if (button.dataset.action === "toggle-todo-create") {
      state.isTodoCreateOpen = !state.isTodoCreateOpen;
      renderTodos();
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
      toggleSetEntry(state.collapsedRoutineCompletedIds, button.dataset.routineId);
      renderToday();
      return;
    }
    if (button.dataset.action === "toggle-assignments") {
      state.isAssignmentsOpen = !state.isAssignmentsOpen;
      renderCalendar();
      return;
    }
    if (button.dataset.action === "toggle-override-editor") {
      state.isOverrideEditorOpen = !state.isOverrideEditorOpen;
      renderCalendar();
      return;
    }
    if (button.dataset.action === "open-routine-create") {
      state.activeTab = "routines";
      state.isRoutineCreateOpen = true;
      render();
      return;
    }
    if (button.dataset.action === "open-routine-set-create") {
      state.activeTab = "routines";
      state.isRoutineSetCreateOpen = true;
      render();
      return;
    }
    if (button.dataset.action === "open-todo-create") {
      state.activeTab = "todos";
      state.isTodoCreateOpen = true;
      render();
      return;
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
    return;
  }
  if (target instanceof HTMLSelectElement && target.id === "density-select") {
    state.density = DENSITY_OPTIONS.some((option) => option.value === target.value) ? target.value : "comfy";
    setStoredOption(DENSITY_KEY, state.density);
    applyPreferences();
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
  if (target instanceof HTMLInputElement && target.name === "emoji") {
    target.value = sanitizeEmojiInput(target.value);
    if (target.value) {
      rememberEmoji(target.value);
    }
    syncEmojiField(target.closest(".emoji-field"));
    syncDraftPreview(target.closest("form"));
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
}

document.addEventListener("submit", (event) => void onSubmit(event));
document.addEventListener("click", (event) => void onClick(event));
document.addEventListener("change", (event) => void onChange(event));
document.addEventListener("input", (event) => void onInput(event));

void refreshAll("loaded");
