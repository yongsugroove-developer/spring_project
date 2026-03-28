import { EMOJI_CATALOG, ROUTINE_COLOR_SWATCHES } from "./emojiCatalog.js";
import {
  addDaysToDateKey,
  buildTodayRoute,
  buildWeekDates,
  getMondayWeekStart,
  isValidDateKey,
  normalizeHashPath,
  parseHashRoute,
} from "./homeUtils.js";
import { LANGUAGE_LABELS, MESSAGES } from "./translations.js";

const LOCALE_KEY = "my-planner-locale";
const THEME_KEY = "my-planner-theme";
const DENSITY_KEY = "my-planner-density";
const AUTH_TOKEN_KEY = "my-planner-auth-token";

const THEME_OPTIONS = [
  { value: "violet", labelKey: "themeViolet" },
  { value: "sunset", labelKey: "themeSunset" },
  { value: "forest", labelKey: "themeForest" },
];

const DENSITY_OPTIONS = [
  { value: "comfy", labelKey: "densityComfy" },
  { value: "compact", labelKey: "densityCompact" },
];

const ROUTE_META = {
  "/today": { tab: "today", titleKey: "homeTitle", copyKey: "homeCopy" },
  "/account": { tab: "account", titleKey: "accountTitle", copyKey: "accountCopy" },
  "/habits": { tab: "habits", titleKey: "habitsTitle", copyKey: "habitsCopy" },
  "/tasks": { tab: "tasks", titleKey: "tasksTitle", copyKey: "tasksCopy" },
  "/routines": { tab: "routines", titleKey: "routinesTitle", copyKey: "routinesCopy" },
  "/calendar": { tab: "calendar", titleKey: "calendarTitle", copyKey: "calendarCopy" },
  "/stats": { tab: "stats", titleKey: "statsTitle", copyKey: "statsCopy" },
  "/settings": { tab: "settings", titleKey: "settingsTitle", copyKey: "settingsCopy" },
};

const state = {
  locale: detectLocale(),
  themePreset: detectStoredOption(THEME_KEY, THEME_OPTIONS.map((option) => option.value), "violet"),
  density: detectStoredOption(DENSITY_KEY, DENSITY_OPTIONS.map((option) => option.value), "comfy"),
  authToken: globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? "",
  authAvailable: false,
  authRequired: false,
  currentUser: null,
  routePath: "/today",
  activeTab: "today",
  selectedHomeDate: "",
  visibleHomeWeekStart: "",
  selectedMonth: formatMonthKeyLocal(new Date()),
  statsRange: "week",
  today: null,
  habits: [],
  tasks: [],
  routines: [],
  calendar: null,
  stats: null,
  feedback: "",
  feedbackIsError: false,
  appNavOpen: false,
  accountMenuOpen: false,
  homeQuickActionsOpen: false,
  quickCreateKind: "",
  draggedHabitId: "",
  listViewRows: {},
  listEditRows: {},
};

bootstrap().catch((error) => {
  console.error(error);
  showFeedback(resolveMessage(error?.message || "loadFailed"), true);
});

async function bootstrap() {
  applyPreferences();
  bindEvents();
  applyShellText();
  await loadHealth();
  await restoreSession();
  syncRouteFromHash();
  await refreshAll();
}

function bindEvents() {
  window.addEventListener("hashchange", async () => {
    syncRouteFromHash();
    await refreshForRouteChange();
  });

  document.addEventListener("click", (event) => {
    const clickTarget = event.target instanceof HTMLElement ? event.target : null;
    if (state.accountMenuOpen && clickTarget && !clickTarget.closest(".account-menu-shell")) {
      state.accountMenuOpen = false;
      renderShellOnly();
    }
    if (state.homeQuickActionsOpen && clickTarget && !clickTarget.closest(".home-fab-shell")) {
      state.homeQuickActionsOpen = false;
      render();
    }

    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action], [data-route], [data-pick-emoji], [data-pick-color], [data-delete-id]") : null;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.route) {
      event.preventDefault();
      navigate(target.dataset.route);
      return;
    }
    if (target.dataset.pickEmoji) {
      event.preventDefault();
      setInputValue(target.dataset.pickEmoji, target.dataset.value ?? "");
      return;
    }
    if (target.dataset.pickColor) {
      event.preventDefault();
      setInputValue(target.dataset.pickColor, target.dataset.value ?? "");
      return;
    }

    const action = target.dataset.action;
    if (action) {
      event.preventDefault();
      void handleAction(action, target);
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    void handleSubmit(form);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "settings-locale" && target instanceof HTMLSelectElement) {
      state.locale = target.value in MESSAGES ? target.value : "ko";
      globalThis.localStorage?.setItem(LOCALE_KEY, state.locale);
      render();
      return;
    }
    if (target.id === "settings-theme" && target instanceof HTMLSelectElement) {
      state.themePreset = target.value;
      setStoredOption(THEME_KEY, state.themePreset);
      applyPreferences();
      render();
      return;
    }
    if (target.id === "settings-density" && target instanceof HTMLSelectElement) {
      state.density = target.value;
      setStoredOption(DENSITY_KEY, state.density);
      applyPreferences();
      render();
    }
  });

  document.addEventListener("dragstart", (event) => {
    const row = event.target instanceof HTMLElement ? event.target.closest("[data-home-habit-row]") : null;
    if (!(row instanceof HTMLElement)) return;
    state.draggedHabitId = row.dataset.homeHabitRow ?? "";
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.draggedHabitId);
    }
  });

  document.addEventListener("dragend", () => {
    state.draggedHabitId = "";
  });

  document.addEventListener("dragenter", (event) => {
    const row = event.target instanceof HTMLElement ? event.target.closest("[data-home-habit-row]") : null;
    if (row) event.preventDefault();
  });

  document.addEventListener("dragover", (event) => {
    const row = event.target instanceof HTMLElement ? event.target.closest("[data-home-habit-row]") : null;
    if (!row) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  document.addEventListener("drop", (event) => {
    const row = event.target instanceof HTMLElement ? event.target.closest("[data-home-habit-row]") : null;
    if (!(row instanceof HTMLElement)) return;
    event.preventDefault();
    const draggedId = state.draggedHabitId || event.dataTransfer?.getData("text/plain") || "";
    const targetId = row.dataset.homeHabitRow ?? "";
    if (!draggedId || !targetId || draggedId === targetId) return;
    void reorderHabits(draggedId, targetId);
  });
}

async function handleAction(action, target) {
  if (action === "toggle-account-menu") {
    state.accountMenuOpen = !state.accountMenuOpen;
    renderShellOnly();
    return;
  }
  if (action === "close-account-menu") {
    state.accountMenuOpen = false;
    renderShellOnly();
    return;
  }
  if (action === "toggle-app-nav") {
    state.appNavOpen = !state.appNavOpen;
    renderShellOnly();
    return;
  }
  if (action === "close-app-nav") {
    state.appNavOpen = false;
    renderShellOnly();
    return;
  }
  if (action === "go-home") {
    navigate("/today");
    return;
  }
  if (action === "toggle-row-view") {
    toggleListRow("listViewRows", target.dataset.kind ?? "", target.dataset.id ?? "");
    return;
  }
  if (action === "toggle-row-edit") {
    toggleListRow("listEditRows", target.dataset.kind ?? "", target.dataset.id ?? "");
    return;
  }
  if (action === "toggle-home-fab") {
    state.homeQuickActionsOpen = !state.homeQuickActionsOpen;
    render();
    return;
  }
  if (action === "open-quick-create") {
    const kind = target.dataset.kind ?? "";
    if (!["habit", "task", "routine"].includes(kind)) return;
    state.homeQuickActionsOpen = false;
    state.quickCreateKind = kind;
    render();
    return;
  }
  if (action === "close-quick-create") {
    state.quickCreateKind = "";
    render();
    return;
  }
  if (action === "close-home-fab") {
    state.homeQuickActionsOpen = false;
    render();
    return;
  }
  if (action === "shift-week") {
    const direction = Number(target.dataset.direction || "0");
    const base = state.visibleHomeWeekStart || getMondayWeekStart(state.selectedHomeDate || dateKeyLocal());
    navigate(buildTodayRoute(addDaysToDateKey(base, direction * 7)));
    return;
  }
  if (action === "pick-date") {
    const date = target.dataset.date ?? "";
    if (isValidDateKey(date)) navigate(buildTodayRoute(date));
    return;
  }
  if (action === "toggle-binary") {
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${target.dataset.habitId}`, {
      method: "PUT",
      body: { completed: target.dataset.complete !== "true" },
    });
    await refreshTodayOnly();
    showFeedback("saveDone");
    return;
  }
  if (action === "adjust-habit") {
    const habit = state.today?.habits?.find((entry) => entry.id === target.dataset.habitId);
    if (!habit) return;
    const nextValue = Math.max(0, Math.min(habit.targetCount, habit.currentValue + Number(target.dataset.delta || "0")));
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${habit.id}`, {
      method: "PUT",
      body: { value: nextValue },
    });
    await refreshTodayOnly();
    showFeedback("saveDone");
    return;
  }
  if (action === "advance-habit") {
    const habit = state.today?.habits?.find((entry) => entry.id === target.dataset.habitId);
    if (!habit) return;
    const nextValue = habit.isComplete ? 0 : Math.min(habit.targetCount, habit.currentValue + 1);
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${habit.id}`, {
      method: "PUT",
      body: { value: nextValue },
    });
    await refreshTodayOnly();
    showFeedback("saveDone");
    return;
  }
  if (action === "delete-habit") {
    await request(`/api/habits/${target.dataset.deleteId}`, { method: "DELETE" });
    await refreshAll();
    showFeedback("deleteDone");
    return;
  }
  if (action === "delete-task") {
    await request(`/api/tasks/${target.dataset.deleteId}`, { method: "DELETE" });
    await refreshAll();
    showFeedback("deleteDone");
    return;
  }
  if (action === "delete-routine") {
    await request(`/api/routines/${target.dataset.deleteId}`, { method: "DELETE" });
    await refreshAll();
    showFeedback("deleteDone");
    return;
  }
  if (action === "toggle-task-status") {
    const task = state.tasks.find((entry) => entry.id === target.dataset.taskId);
    if (!task) return;
    await request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: { status: task.status === "done" ? "pending" : "done" },
    });
    await refreshAll();
    showFeedback("saveDone");
    return;
  }
  if (action === "shift-month") {
    state.selectedMonth = shiftMonthKey(state.selectedMonth, Number(target.dataset.direction || "0"));
    await refreshCalendarOnly();
    render();
    return;
  }
  if (action === "stats-range") {
    state.statsRange = target.dataset.range === "month" ? "month" : "week";
    await refreshStatsOnly();
    render();
    return;
  }
  if (action === "logout") {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (_error) {
      // Ignore and clear the token locally.
    }
    setAuthToken("");
    if (state.authAvailable) {
      location.assign("/login");
      return;
    }
    await refreshAll();
  }
}

async function handleSubmit(form) {
  const kind = form.dataset.form;
  const data = new FormData(form);
  try {
    if (kind === "habit-create") {
      await request("/api/habits", { method: "POST", body: serializeHabitForm(data, true) });
      form.reset();
      state.quickCreateKind = "";
      state.homeQuickActionsOpen = false;
      await refreshAll();
      showFeedback("createHabitDone");
      return;
    }
    if (kind === "habit-update") {
      await request(`/api/habits/${form.dataset.id}`, { method: "PATCH", body: serializeHabitForm(data, false) });
      await refreshAll();
      showFeedback("updateHabitDone");
      return;
    }
    if (kind === "task-create") {
      await request("/api/tasks", { method: "POST", body: serializeTaskForm(data) });
      form.reset();
      state.quickCreateKind = "";
      state.homeQuickActionsOpen = false;
      await refreshAll();
      showFeedback("createTaskDone");
      return;
    }
    if (kind === "task-update") {
      await request(`/api/tasks/${form.dataset.id}`, { method: "PATCH", body: serializeTaskForm(data) });
      await refreshAll();
      showFeedback("updateTaskDone");
      return;
    }
    if (kind === "routine-create") {
      await request("/api/routines", { method: "POST", body: serializeRoutineForm(data) });
      form.reset();
      state.quickCreateKind = "";
      state.homeQuickActionsOpen = false;
      await refreshAll();
      showFeedback("createRoutineDone");
      return;
    }
    if (kind === "routine-update") {
      await request(`/api/routines/${form.dataset.id}`, { method: "PATCH", body: serializeRoutineForm(data) });
      await refreshAll();
      showFeedback("updateRoutineDone");
    }
  } catch (error) {
    console.error(error);
    showFeedback(resolveMessage(error.message), true);
  }
}

function serializeHabitForm(data, useFallbackDate) {
  const trackingType = String(data.get("trackingType") || "binary");
  return {
    name: String(data.get("name") || ""),
    emoji: optionalValue(data.get("emoji")),
    color: String(data.get("color") || ROUTINE_COLOR_SWATCHES[0]),
    tag: optionalValue(data.get("tag")),
    trackingType,
    targetCount: trackingType === "binary" ? 1 : Number(data.get("targetCount") || 1),
    startDate: optionalValue(data.get("startDate")) || (useFallbackDate ? state.selectedHomeDate || dateKeyLocal() : undefined),
  };
}

function serializeTaskForm(data) {
  return {
    title: String(data.get("title") || ""),
    emoji: optionalValue(data.get("emoji")),
    note: optionalValue(data.get("note")),
    dueDate: optionalValue(data.get("dueDate")),
    status: String(data.get("status") || "pending"),
  };
}

function serializeRoutineForm(data) {
  return {
    name: String(data.get("name") || ""),
    emoji: optionalValue(data.get("emoji")),
    color: optionalValue(data.get("color")),
    habitIds: data.getAll("habitIds").map(String),
    notificationEnabled: data.get("notificationEnabled") === "on",
    notificationTime: optionalValue(data.get("notificationTime")),
    notificationWeekdays: data.getAll("notificationWeekdays").map((value) => Number(value)),
  };
}

async function loadHealth() {
  const health = await request("/api/health", { allow401: true });
  state.authAvailable = Boolean(health?.authAvailable);
  state.authRequired = Boolean(health?.authRequired);
}

async function restoreSession() {
  if (!state.authAvailable) return;
  if (!state.authToken && state.authRequired) {
    location.assign("/login");
    return;
  }
  if (!state.authToken) return;
  try {
    const response = await request("/api/auth/me", { allow401: true });
    state.currentUser = response?.user ?? null;
  } catch (error) {
    setAuthToken("");
    if (state.authRequired) {
      location.assign("/login");
      return;
    }
    console.warn(error);
  }
}

function syncRouteFromHash() {
  const hash = location.hash ? location.hash.slice(1) : "/today";
  const parsed = parseHashRoute(hash);
  state.routePath = ROUTE_META[parsed.pathname] ? parsed.pathname : "/today";
  state.activeTab = ROUTE_META[state.routePath].tab;
  if (state.routePath === "/today" && parsed.date) {
    state.selectedHomeDate = parsed.date;
    state.visibleHomeWeekStart = getMondayWeekStart(parsed.date);
  }
  if (!location.hash) {
    history.replaceState(null, "", `#${buildTodayRoute(state.selectedHomeDate)}`);
  }
  renderShellOnly();
}

function navigate(route) {
  state.appNavOpen = false;
  state.accountMenuOpen = false;
  state.homeQuickActionsOpen = false;
  state.quickCreateKind = "";
  const target = normalizeHashPath(route);
  const nextHash = target === "/today" ? buildTodayRoute(state.selectedHomeDate) : target;
  if (location.hash !== `#${nextHash}`) {
    location.hash = nextHash;
  }
}

async function refreshForRouteChange() {
  if (state.routePath === "/today") {
    await refreshTodayOnly();
    return;
  }
  await refreshAll();
}

async function refreshAll() {
  const todayPath = state.selectedHomeDate ? `/api/today?date=${state.selectedHomeDate}` : "/api/today";
  const [today, habits, tasks, routines, calendar, stats] = await Promise.all([
    request(todayPath),
    request("/api/habits"),
    request("/api/tasks"),
    request("/api/routines"),
    request(`/api/calendar?month=${state.selectedMonth}`),
    request(`/api/stats?range=${state.statsRange}`),
  ]);

  state.today = today;
  state.habits = habits.habits;
  state.tasks = tasks.tasks;
  state.routines = routines.routines;
  state.calendar = calendar;
  state.stats = stats;
  syncTodayState();
  render();
}

async function refreshTodayOnly() {
  state.today = await request(state.selectedHomeDate ? `/api/today?date=${state.selectedHomeDate}` : "/api/today");
  syncTodayState();
  render();
}

async function refreshCalendarOnly() {
  state.calendar = await request(`/api/calendar?month=${state.selectedMonth}`);
}

async function refreshStatsOnly() {
  state.stats = await request(`/api/stats?range=${state.statsRange}`);
}

function syncTodayState() {
  if (!state.today) return;
  state.selectedHomeDate = state.today.date;
  state.visibleHomeWeekStart = getMondayWeekStart(state.today.date);
  if (!state.selectedMonth) {
    state.selectedMonth = state.today.date.slice(0, 7);
  }
}

async function reorderHabits(draggedId, targetId) {
  const visibleIds = state.today?.habits?.map((habit) => habit.id) ?? state.habits.map((habit) => habit.id);
  const baseIds = state.habits.map((habit) => habit.id);
  const nextVisibleIds = moveId(visibleIds, draggedId, targetId);
  const visibleIdSet = new Set(nextVisibleIds);
  let visibleIndex = 0;
  const nextIds = baseIds.map((id) => (visibleIdSet.has(id) ? nextVisibleIds[visibleIndex++] : id));
  await request("/api/habits/reorder", { method: "POST", body: { habitIds: nextIds } });
  await refreshAll();
  showFeedback("saveDone");
}

function render() {
  renderShellOnly();
  renderPanels();
}

function renderShellOnly() {
  applyPreferences();
  applyShellText();
  document.documentElement.lang = state.locale;
  document.title = `My Planner | ${t(ROUTE_META[state.routePath].titleKey)}`;
  document.querySelector(".app-nav-shell")?.classList.toggle("is-open", state.appNavOpen);
  document.querySelector(".account-menu-shell")?.classList.toggle("is-open", state.accountMenuOpen);
  const accountTrigger = document.getElementById("account-menu-trigger");
  if (accountTrigger instanceof HTMLElement) {
    accountTrigger.setAttribute("aria-expanded", String(state.accountMenuOpen));
  }
  document.body.classList.toggle("is-overlay-open", Boolean(state.quickCreateKind));

  for (const button of document.querySelectorAll("[data-tab]")) {
    if (!(button instanceof HTMLElement)) continue;
    const active = button.dataset.tab === state.activeTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const button of document.querySelectorAll(".mobile-tab-button")) {
    if (!(button instanceof HTMLElement)) continue;
    const active = button.dataset.route === state.routePath;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const panel of document.querySelectorAll(".tab-panel")) {
    if (!(panel instanceof HTMLElement)) continue;
    const active = panel.id === `tab-${state.activeTab}`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  }

  const feedback = document.getElementById("feedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.hidden = true;
  }

  const accountName = document.getElementById("account-menu-name");
  const accountMeta = document.getElementById("account-menu-meta");
  if (accountName instanceof HTMLElement) {
    accountName.textContent = state.currentUser?.displayName || state.currentUser?.email || t("accountMenu");
  }
  if (accountMeta instanceof HTMLElement) {
    accountMeta.textContent = state.currentUser?.email || "계정 / 보기 설정 / 통계";
  }
}

function renderPanels() {
  const renderers = {
    today: renderTodayDensePage,
    account: renderAccountPage,
    habits: renderHabitsPage,
    tasks: renderTasksPage,
    routines: renderRoutinesPage,
    calendar: renderCalendarMonthPage,
    stats: renderStatsPage,
    settings: renderSettingsPage,
  };

  for (const [name, renderPanel] of Object.entries(renderers)) {
    setPanel(name, name === state.activeTab ? renderPanel() : "");
  }
}

function renderTodayPage() {
  if (!state.today) return "";
  const weekDates = buildWeekDates(state.selectedHomeDate);
  return `<div class="today-home-layout">
    <section class="content-card today-home-topbar">
      <div class="today-home-topbar-main">
        <p class="eyebrow">habit board</p>
        <h2>${esc(formatMonthLabel(state.selectedHomeDate))}</h2>
        <p class="muted today-home-date-copy">${esc(formatFullDate(state.selectedHomeDate))}</p>
      </div>
      <div class="today-home-topbar-side">
        <div class="actions today-home-topbar-actions">
          <button class="btn-soft compact-action" type="button" data-route="/habits">${esc(t("manageHabits"))}</button>
          <button class="btn-soft compact-action" type="button" data-route="/routines">${esc(t("goRoutines"))}</button>
        </div>
        <span class="muted">${esc(t("reorderHint"))}</span>
      </div>
    </section>
    <section class="content-card today-home-week">
      <div class="route-inline-head today-home-week-head">
        <h3>${esc(t("month"))}</h3>
        <div class="actions">
          <button class="btn-soft compact-action" type="button" data-action="shift-week" data-direction="-1">${esc(t("weekPrevious"))}</button>
          <button class="btn-soft compact-action" type="button" data-action="shift-week" data-direction="1">${esc(t("weekNext"))}</button>
        </div>
      </div>
      <div class="today-home-week-grid">${weekDates.map((date) => weekChip(date)).join("")}</div>
    </section>
    <div class="today-home-context summary-grid">
      ${summaryCard(t("homeSummaryRate"), percent(state.today.summary.habitRate))}
      ${summaryCard(t("completedHabits"), `${state.today.summary.completedHabits}/${state.today.summary.totalHabits}`)}
      ${summaryCard(t("remainingHabits"), String(state.today.summary.remainingHabits))}
    </div>
    <section class="content-card today-home-board">
      <div class="today-home-board-head">
        <div>${esc(t("progress"))}</div>
        <div>${esc(t("habits"))}</div>
        <div>${esc(t("status"))}</div>
      </div>
      <div class="today-home-board-body">
        ${state.today.habits.length ? state.today.habits.map(renderHomeHabitRow).join("") : renderHomeEmpty()}
      </div>
    </section>
  </div>`;
}

function renderHabitsPage() {
  return `<div class="route-screen-layout route-screen-layout--library">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(t("habitsMenu"))}</h3>
        <p class="muted">${esc(t("listOnlyHint"))}</p>
      </div>
      <div class="route-list-stack">
        ${state.habits.length ? state.habits.map(renderHabitManagerCard).join("") : `<p class="muted">${esc(t("noHabits"))}</p>`}
      </div>
    </section>
  </div>`;
}

function renderTasksPage() {
  return `<div class="route-screen-layout route-screen-layout--library">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(t("tasksMenu"))}</h3>
        <p class="muted">${esc(t("listOnlyHint"))}</p>
      </div>
      <div class="route-list-stack">
        ${state.tasks.length ? state.tasks.map(renderTaskManagerCard).join("") : `<p class="muted">${esc(t("noTasks"))}</p>`}
      </div>
    </section>
  </div>`;
}

function renderRoutinesPage() {
  return `<div class="route-screen-layout route-screen-layout--creator">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(t("routinesMenu"))}</h3>
        <p class="muted">${esc(t("listOnlyHint"))}</p>
      </div>
      <div class="route-list-stack">
        ${state.routines.length ? state.routines.map(renderRoutineManagerCard).join("") : `<p class="muted">${esc(t("noRoutines"))}</p>`}
      </div>
    </section>
  </div>`;
}

function renderCalendarPage() {
  const days = state.calendar?.days ?? [];
  return `<div class="route-screen-layout">
    <section class="content-card">
      <div class="route-inline-head">
        <h3>${esc(formatMonthTitle(state.selectedMonth))}</h3>
        <div class="actions">
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="-1">${esc(t("weekPrevious"))}</button>
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="1">${esc(t("weekNext"))}</button>
        </div>
      </div>
      <div class="summary-grid">
        ${days.length ? days.map((day) => `<article class="content-card content-card--stat"><span>${esc(day.date)}</span><strong>${percent(day.habitProgressRate)}</strong><div class="muted">${day.completedHabits}/${day.totalHabits} habits · ${day.completedTaskCount}/${day.taskCount} tasks</div></article>`).join("") : `<p class="muted">${esc(t("noCalendarData"))}</p>`}
      </div>
    </section>
  </div>`;
}

function renderStatsPage() {
  const summary = state.stats?.summary;
  return `<div class="route-screen-layout">
    <section class="content-card">
      <div class="route-inline-head">
        <h3>${esc(t("stats"))}</h3>
        <div class="segmented">
          <button class="segment-button ${state.statsRange === "week" ? "is-selected" : ""}" type="button" data-action="stats-range" data-range="week">Week</button>
          <button class="segment-button ${state.statsRange === "month" ? "is-selected" : ""}" type="button" data-action="stats-range" data-range="month">Month</button>
        </div>
      </div>
      ${summary ? `<div class="summary-grid">
        ${summaryCard("Daily", percent(summary.dailyRate))}
        ${summaryCard("Weekly", percent(summary.weeklyRate))}
        ${summaryCard("Monthly", percent(summary.monthlyRate))}
        ${summaryCard("Current streak", String(summary.currentStreak))}
        ${summaryCard("Best streak", String(summary.bestStreak))}
        ${summaryCard("Task completion", `${summary.taskCompletion.completed}/${summary.taskCompletion.total}`)}
      </div>
      <div class="route-list-stack" style="margin-top:16px;">
        ${summary.topHabits.map((habit) => `<article class="route-list-card"><div class="route-list-row"><div class="route-list-copy"><strong>${esc(`${habit.emoji ?? ""} ${habit.name}`.trim())}</strong><span>${habit.completedDays}/${habit.trackedDays} days</span></div><strong>${percent(habit.completionRate)}</strong></div></article>`).join("") || `<p class="muted">${esc(t("noStatsData"))}</p>`}
      </div>` : `<p class="muted">${esc(t("noStatsData"))}</p>`}
    </section>
  </div>`;
}

function renderSettingsPage() {
  return `<div class="route-screen-layout route-screen-layout--settings">
    <section class="content-card">
      <div class="route-section-heading"><h3>${esc(t("displaySettings"))}</h3></div>
      <div class="settings-control-list">
        <label class="settings-control-item"><span>${esc(t("language"))}</span><select id="settings-locale">${Object.entries(LANGUAGE_LABELS).map(([value, label]) => `<option value="${value}" ${value === state.locale ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(t("theme"))}</span><select id="settings-theme">${THEME_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.themePreset ? "selected" : ""}>${esc(t(option.labelKey))}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(t("density"))}</span><select id="settings-density">${DENSITY_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.density ? "selected" : ""}>${esc(t(option.labelKey))}</option>`).join("")}</select></label>
      </div>
    </section>
  </div>`;
}

function renderAccountPage() {
  if (!state.authAvailable) {
    return `<div class="route-screen-layout route-screen-layout--settings">
      <section class="content-card">
        <div class="route-section-heading">
          <h3>${esc(t("authUnavailableTitle"))}</h3>
          <p class="muted">${esc(t("authUnavailableCopy"))}</p>
        </div>
      </section>
    </div>`;
  }

  if (!state.currentUser) {
    return `<div class="route-screen-layout route-screen-layout--settings">
      <section class="content-card">
        <div class="route-section-heading">
          <h3>${esc(t("authRequiredTitle"))}</h3>
          <p class="muted">${esc(t("authRequiredCopy"))}</p>
        </div>
        <div class="actions">
          <a class="btn" href="/login">${esc(t("login"))}</a>
        </div>
      </section>
    </div>`;
  }

  return `<div class="route-screen-layout route-screen-layout--settings">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(t("accountMenu"))}</h3>
        <p class="muted">${esc(t("accountCopy"))}</p>
      </div>
      <div class="route-list-stack">
        <article class="route-list-stack-item">
          <div class="route-list-row">
            <div class="route-list-copy">
              <strong>${esc(state.currentUser.displayName || t("accountMenu"))}</strong>
              <span>${esc(state.currentUser.email || "")}</span>
            </div>
            <span class="route-list-meta">${esc(state.currentUser.role || "")}</span>
          </div>
        </article>
        <article class="route-list-stack-item">
          <div class="route-list-row">
            <div class="route-list-copy">
              <strong>${esc(t("status"))}</strong>
              <span>${esc(state.currentUser.status || "")}</span>
            </div>
          </div>
        </article>
      </div>
      <div class="actions">
        <button class="btn-soft" type="button" data-action="logout">${esc(t("logout"))}</button>
      </div>
    </section>
  </div>`;
}

function renderHomeHabitRow(habit) {
  const progress = habit.trackingType === "binary"
    ? `<button class="home-status-toggle ${habit.isComplete ? "is-complete" : ""}" type="button" data-action="toggle-binary" data-habit-id="${habit.id}" data-complete="${String(habit.isComplete)}" aria-label="${esc(habit.isComplete ? t("markPending") : t("markDone"))}">${habit.isComplete ? "✅" : ""}</button>`
    : `<button class="home-progress-chip ${habit.isComplete ? "is-complete" : ""}" type="button" data-action="advance-habit" data-habit-id="${habit.id}" aria-label="${esc(`${habit.name} ${habit.currentValue}/${habit.targetCount}`)}">${habit.currentValue}/${habit.targetCount}</button>`;
  return `<article class="home-board-group ${habit.isComplete ? "" : "is-pending"}" data-home-habit-row="${habit.id}" draggable="true" style="--routine-accent:${esc(habit.color)};">
    <div class="home-board-row home-board-row--item">
      <div class="home-board-cell home-board-cell--index"><span class="home-order-badge">${habit.sortOrder}</span><span class="muted">::</span></div>
      <div class="home-board-cell home-board-cell--main">
        <div class="home-routine-main">
          <span class="emoji-badge">${esc(habit.emoji || "•")}</span>
          <div class="home-item-copy">
            <strong>${esc(habit.name)}</strong>
            <span class="muted">${esc([habit.tag, `${t("streak")} ${habit.streak}`, `${t("startDate")} ${habit.startDate}`].filter(Boolean).join(" · "))}</span>
          </div>
        </div>
      </div>
      <div class="home-board-cell home-board-cell--status">${progress}</div>
    </div>
  </article>`;
}

function renderHomeEmpty() {
  return `<div class="home-board-empty">
    <p>${esc(t("noHabitsHome"))}</p>
    <span class="muted">${esc(t("homeQuickCreateHint"))}</span>
  </div>`;
}

function renderHabitManagerCard(habit) {
  return `<details class="route-list-card" data-habit-row="${habit.id}" draggable="true">
    <summary class="route-list-row route-list-row--wide">
      <div class="route-list-copy"><strong>${esc(`${habit.emoji ?? ""} ${habit.name}`.trim())}</strong><span>${esc([habit.tag, habit.startDate, `${habit.currentStreak}/${habit.bestStreak} streak`].filter(Boolean).join(" · "))}</span></div>
      <span class="route-list-meta">${esc(trackingTypeLabel(habit.trackingType))}</span>
    </summary>
    <form class="form-grid" data-form="habit-update" data-id="${habit.id}">
      ${habitFields(`habit-${habit.id}`, habit, false)}
      <div class="actions">
        <button class="btn" type="submit">${esc(t("save"))}</button>
        <button class="btn-danger" type="button" data-action="delete-habit" data-delete-id="${habit.id}">${esc(t("delete"))}</button>
      </div>
    </form>
  </details>`;
}

function renderTaskManagerCard(task) {
  return `<details class="route-list-card">
    <summary class="route-list-row route-list-row--wide">
      <div class="route-list-copy"><strong>${esc(`${task.emoji ?? ""} ${task.title}`.trim())}</strong><span>${esc(task.note || task.dueDate || t("unscheduled"))}</span></div>
      <span class="state-pill ${task.status === "done" ? "is-success" : ""}">${esc(task.status === "done" ? t("taskDone") : t("taskPending"))}</span>
    </summary>
    <form class="form-grid" data-form="task-update" data-id="${task.id}">
      ${taskFields(`task-${task.id}`, task)}
      <div class="actions">
        <button class="btn" type="submit">${esc(t("save"))}</button>
        <button class="btn-soft" type="button" data-action="toggle-task-status" data-task-id="${task.id}">${esc(task.status === "done" ? t("markPending") : t("markDone"))}</button>
        <button class="btn-danger" type="button" data-action="delete-task" data-delete-id="${task.id}">${esc(t("delete"))}</button>
      </div>
    </form>
  </details>`;
}

function renderRoutineManagerCard(routine) {
  return `<details class="route-list-card">
    <summary class="route-list-row route-list-row--wide">
      <div class="route-list-copy"><strong>${esc(`${routine.emoji ?? ""} ${routine.name}`.trim())}</strong><span>${esc(`${routine.habits.length} habits · ${routine.notificationEnabled ? "notification on" : "notification off"}`)}</span></div>
      <span class="route-list-meta">${esc(routine.notificationTime || "--:--")}</span>
    </summary>
    <form class="form-grid" data-form="routine-update" data-id="${routine.id}">
      ${routineFields(`routine-${routine.id}`, routine)}
      <div class="actions">
        <button class="btn" type="submit">${esc(t("save"))}</button>
        <button class="btn-danger" type="button" data-action="delete-routine" data-delete-id="${routine.id}">${esc(t("delete"))}</button>
      </div>
    </form>
  </details>`;
}

function itemStateKey(kind, id) {
  return `${kind}:${id}`;
}

function toggleListRow(bucket, kind, id) {
  if (!kind || !id) return;
  const key = itemStateKey(kind, id);
  const current = Boolean(state[bucket][key]);
  const next = { ...state[bucket] };
  if (current) {
    delete next[key];
  } else {
    next[key] = true;
  }
  state[bucket] = next;
  const siblingBucket = bucket === "listViewRows" ? "listEditRows" : "listViewRows";
  if (state[siblingBucket][key]) {
    const sibling = { ...state[siblingBucket] };
    delete sibling[key];
    state[siblingBucket] = sibling;
  }
  render();
}

function renderRowActionButtons(kind, id, isViewing, isEditing, deleteAction) {
  return `<div class="route-row-actions">
    <button class="btn-soft compact-action" type="button" data-action="toggle-row-view" data-kind="${kind}" data-id="${id}">${esc(isViewing ? "닫기" : "보기")}</button>
    <button class="btn-soft compact-action" type="button" data-action="toggle-row-edit" data-kind="${kind}" data-id="${id}">${esc(isEditing ? "닫기" : "수정")}</button>
    <button class="btn-danger compact-action" type="button" data-action="${deleteAction}" data-delete-id="${id}">${esc(t("delete"))}</button>
  </div>`;
}

function renderDetailPanel(content) {
  return `<section class="route-detail-panel">${content}</section>`;
}

function renderDetailGrid(items) {
  return `<div class="route-detail-grid">${items.map((item) => `<article class="route-detail-item"><span>${esc(item.label)}</span><strong>${esc(item.value || "-")}</strong></article>`).join("")}</div>`;
}

function renderHabitOverview(habit) {
  return renderDetailGrid([
    { label: t("name"), value: `${habit.emoji ?? ""} ${habit.name}`.trim() },
    { label: t("tag"), value: habit.tag || "-" },
    { label: t("type"), value: trackingTypeLabel(habit.trackingType) },
    { label: t("targetValue"), value: String(habit.targetCount || 1) },
    { label: t("startDate"), value: habit.startDate || "-" },
    { label: t("streak"), value: `${habit.currentStreak}/${habit.bestStreak}` },
  ]);
}

function renderTaskOverview(task) {
  return renderDetailGrid([
    { label: t("title"), value: `${task.emoji ?? ""} ${task.title}`.trim() },
    { label: t("date"), value: task.dueDate || t("unscheduled") },
    { label: t("status"), value: task.status === "done" ? t("taskDone") : t("taskPending") },
    { label: t("note"), value: task.note || "-" },
  ]);
}

function renderRoutineOverview(routine) {
  return renderDetailGrid([
    { label: t("name"), value: `${routine.emoji ?? ""} ${routine.name}`.trim() },
    { label: t("notificationEnabled"), value: routine.notificationEnabled ? "사용" : "미사용" },
    { label: t("notificationTime"), value: routine.notificationTime || "--:--" },
    { label: t("habits"), value: routine.habits.map((habit) => habit.name).join(", ") || "-" },
  ]);
}

function renderHabitEditor(habit) {
  const key = itemStateKey("habit", habit.id);
  const isViewing = Boolean(state.listViewRows[key]);
  const isEditing = Boolean(state.listEditRows[key]);
  return `<article class="route-list-card route-list-card--actionable" data-habit-row="${habit.id}" draggable="true">
    <div class="route-list-row route-list-row--wide">
      <div class="route-list-copy"><strong>${esc(`${habit.emoji ?? ""} ${habit.name}`.trim())}</strong><span>${esc([habit.tag, habit.startDate, `${habit.currentStreak}/${habit.bestStreak} streak`].filter(Boolean).join(" · "))}</span></div>
      <div class="route-list-side route-list-side--actions">
        <span class="route-list-meta">${esc(trackingTypeLabel(habit.trackingType))}</span>
        ${renderRowActionButtons("habit", habit.id, isViewing, isEditing, "delete-habit")}
      </div>
    </div>
    ${isViewing ? renderDetailPanel(renderHabitOverview(habit)) : ""}
    ${isEditing ? `<form class="form-grid route-inline-form" data-form="habit-update" data-id="${habit.id}">
      ${habitFields(`habit-${habit.id}`, habit, false)}
      <div class="actions">
        <button class="btn" type="submit">${esc(t("save"))}</button>
      </div>
    </form>` : ""}
  </article>`;
}

function renderTaskEditor(task) {
  const key = itemStateKey("task", task.id);
  const isViewing = Boolean(state.listViewRows[key]);
  const isEditing = Boolean(state.listEditRows[key]);
  return `<article class="route-list-card route-list-card--actionable">
    <div class="route-list-row route-list-row--wide">
      <div class="route-list-copy"><strong>${esc(`${task.emoji ?? ""} ${task.title}`.trim())}</strong><span>${esc(task.note || task.dueDate || t("unscheduled"))}</span></div>
      <div class="route-list-side route-list-side--actions">
        <span class="state-pill ${task.status === "done" ? "is-success" : ""}">${esc(task.status === "done" ? t("taskDone") : t("taskPending"))}</span>
        ${renderRowActionButtons("task", task.id, isViewing, isEditing, "delete-task")}
      </div>
    </div>
    ${isViewing ? renderDetailPanel(renderTaskOverview(task)) : ""}
    ${isEditing ? `<form class="form-grid route-inline-form" data-form="task-update" data-id="${task.id}">
      ${taskFields(`task-${task.id}`, task)}
      <div class="actions">
        <button class="btn" type="submit">${esc(t("save"))}</button>
        <button class="btn-soft" type="button" data-action="toggle-task-status" data-task-id="${task.id}">${esc(task.status === "done" ? t("markPending") : t("markDone"))}</button>
      </div>
    </form>` : ""}
  </article>`;
}

function renderRoutineEditor(routine) {
  const key = itemStateKey("routine", routine.id);
  const isViewing = Boolean(state.listViewRows[key]);
  const isEditing = Boolean(state.listEditRows[key]);
  return `<article class="route-list-card route-list-card--actionable">
    <div class="route-list-row route-list-row--wide">
      <div class="route-list-copy"><strong>${esc(`${routine.emoji ?? ""} ${routine.name}`.trim())}</strong><span>${esc(`${routine.habits.length} habits · ${routine.notificationEnabled ? "notification on" : "notification off"}`)}</span></div>
      <div class="route-list-side route-list-side--actions">
        <span class="route-list-meta">${esc(routine.notificationTime || "--:--")}</span>
        ${renderRowActionButtons("routine", routine.id, isViewing, isEditing, "delete-routine")}
      </div>
    </div>
    ${isViewing ? renderDetailPanel(renderRoutineOverview(routine)) : ""}
    ${isEditing ? `<form class="form-grid route-inline-form" data-form="routine-update" data-id="${routine.id}">
      ${routineFields(`routine-${routine.id}`, routine)}
      <div class="actions">
        <button class="btn" type="submit">${esc(t("save"))}</button>
      </div>
    </form>` : ""}
  </article>`;
}

function habitFields(prefix, habit, includePicker) {
  return `
    <label><span>${esc(t("name"))}</span><input name="name" value="${esc(habit?.name || "")}" required /></label>
    <label><span>${esc(t("tag"))}</span><input name="tag" value="${esc(habit?.tag || "")}" /></label>
    ${includePicker ? emojiPickerField(`${prefix}-emoji`, habit?.emoji || "") : `<label><span>${esc(t("emoji"))}</span><input name="emoji" value="${esc(habit?.emoji || "")}" /></label>`}
    ${includePicker ? colorPickerField(`${prefix}-color`, habit?.color || ROUTINE_COLOR_SWATCHES[0]) : `<label><span>${esc(t("color"))}</span><input class="color-input" type="color" name="color" value="${esc(habit?.color || ROUTINE_COLOR_SWATCHES[0])}" /></label>`}
    <label><span>${esc(t("type"))}</span><select name="trackingType">${trackingOption("binary", habit?.trackingType)}${trackingOption("count", habit?.trackingType)}${trackingOption("time", habit?.trackingType)}</select></label>
    <label><span>${esc(t("targetValue"))}</span><input name="targetCount" type="number" min="1" value="${Number(habit?.targetCount || 1)}" /></label>
    <label><span>${esc(t("startDate"))}</span><input name="startDate" type="date" value="${esc(habit?.startDate || state.selectedHomeDate || dateKeyLocal())}" /></label>
  `;
}

function taskFields(prefix, task) {
  return `
    <label><span>${esc(t("title"))}</span><input name="title" value="${esc(task?.title || "")}" required /></label>
    <label><span>${esc(t("date"))}</span><input name="dueDate" type="date" value="${esc(task?.dueDate || "")}" /></label>
    ${task ? `<label><span>${esc(t("emoji"))}</span><input name="emoji" value="${esc(task.emoji || "")}" /></label>` : emojiPickerField(`${prefix}-emoji`, "")}
    <label><span>${esc(t("status"))}</span><select name="status"><option value="pending" ${task?.status !== "done" ? "selected" : ""}>${esc(t("taskPending"))}</option><option value="done" ${task?.status === "done" ? "selected" : ""}>${esc(t("taskDone"))}</option></select></label>
    <label style="grid-column:1 / -1;"><span>${esc(t("note"))}</span><textarea name="note">${esc(task?.note || "")}</textarea></label>
  `;
}

function routineFields(prefix, routine) {
  const selected = new Set(routine?.habits?.map((habit) => habit.id) || []);
  return `
    <label><span>${esc(t("name"))}</span><input name="name" value="${esc(routine?.name || "")}" required /></label>
    ${routine ? `<label><span>${esc(t("emoji"))}</span><input name="emoji" value="${esc(routine.emoji || "")}" /></label>` : emojiPickerField(`${prefix}-emoji`, "")}
    <label><span>${esc(t("color"))}</span><input class="color-input" type="color" name="color" value="${esc(routine?.color || ROUTINE_COLOR_SWATCHES[0])}" /></label>
    <label><span>${esc(t("notificationTime"))}</span><input type="time" name="notificationTime" value="${esc(routine?.notificationTime || "")}" /></label>
    <label class="choice-item"><input type="checkbox" name="notificationEnabled" ${routine?.notificationEnabled ? "checked" : ""} /> <span>${esc(t("notificationEnabled"))}</span></label>
    <fieldset style="grid-column:1 / -1;"><legend>${esc(t("notificationWeekdays"))}</legend><div class="choice-list">${weekdayChoices(routine?.notificationWeekdays || [])}</div></fieldset>
    <fieldset style="grid-column:1 / -1;"><legend>${esc(t("habits"))}</legend><div class="choice-list choice-list--stacked">${state.habits.map((habit) => `<label class="choice-item"><input type="checkbox" name="habitIds" value="${habit.id}" ${selected.has(habit.id) ? "checked" : ""} /><span>${esc(`${habit.emoji ?? ""} ${habit.name}`.trim())}</span></label>`).join("") || `<span class="muted">${esc(t("noHabits"))}</span>`}</div></fieldset>
  `;
}

function emojiPickerField(inputId, value) {
  return `<label style="grid-column:1 / -1;">
    <span>${esc(t("emoji"))}</span>
    <input id="${inputId}" class="emoji-input" name="emoji" value="${esc(value)}" />
    <details class="emoji-picker">
      <summary class="emoji-trigger"><span class="emoji-trigger-main"><span class="emoji-trigger-badge">${esc(value || "🙂")}</span><span class="emoji-trigger-label">${esc(value || t("emoji"))}</span></span><span class="emoji-trigger-caret">⌄</span></summary>
      <div class="emoji-picker-panel">
        <div class="emoji-picker-section emoji-picker-all">
          <div class="emoji-grid emoji-grid--catalog">${EMOJI_CATALOG.map((emoji) => `<button class="emoji-option" type="button" data-pick-emoji="${inputId}" data-value="${esc(emoji)}">${esc(emoji)}</button>`).join("")}</div>
        </div>
      </div>
    </details>
  </label>`;
}

function colorPickerField(inputId, value) {
  return `<label style="grid-column:1 / -1;">
    <span>${esc(t("color"))}</span>
    <div class="color-input-shell"><input id="${inputId}" class="color-input" type="color" name="color" value="${esc(value)}" /></div>
    <div class="color-swatch-list">${ROUTINE_COLOR_SWATCHES.map((color) => `<button class="color-swatch ${color === value ? "is-selected" : ""}" type="button" style="--swatch:${esc(color)};" data-pick-color="${inputId}" data-value="${color}" aria-label="${color}"></button>`).join("")}</div>
  </label>`;
}

function summaryCard(label, value) {
  return `<article class="content-card content-card--stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
}

function weekChip(date) {
  const weekday = new Intl.DateTimeFormat(state.locale, { weekday: "short" }).format(new Date(`${date}T12:00:00`));
  const selected = date === state.selectedHomeDate;
  const today = date === dateKeyLocal();
  return `<button class="today-home-day ${selected ? "is-selected" : ""} ${today ? "is-today" : ""}" type="button" data-action="pick-date" data-date="${date}"><span>${esc(weekday)}</span><strong>${esc(date.slice(-2))}</strong></button>`;
}

function weekdayChoices(selected) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels.map((label, index) => `<label class="choice-item"><input type="checkbox" name="notificationWeekdays" value="${index}" ${selected.includes(index) ? "checked" : ""} /><span>${label}</span></label>`).join("");
}

function settingsLink(route, title, copy) {
  return `<button class="settings-link-card" type="button" data-route="${route}"><div class="settings-link-copy"><strong>${esc(title)}</strong><span>${esc(copy)}</span></div><span class="settings-link-meta">></span></button>`;
}

function trackingOption(value, selectedValue) {
  return `<option value="${value}" ${selectedValue === value || (!selectedValue && value === "binary") ? "selected" : ""}>${esc(trackingTypeLabel(value))}</option>`;
}

function trackingTypeLabel(value) {
  const labelKey = value === "binary" ? "typeBinary" : value === "count" ? "typeCount" : "typeTime";
  return t(labelKey);
}

function renderTodayDensePage() {
  if (!state.today) return "";
  const weekDates = buildWeekDates(state.selectedHomeDate);
  return `<div class="today-home-layout today-home-layout--dense">
    <section class="content-card today-home-overview">
      <div class="today-home-overview-head">
        <div class="today-home-topbar-main">
          <p class="eyebrow">${esc(t("homeTitle"))}</p>
          <h2>${esc(formatMonthLabel(state.selectedHomeDate))}</h2>
          <p class="muted today-home-date-copy">${esc(formatFullDate(state.selectedHomeDate))}</p>
        </div>
      </div>
      <div class="today-home-summary-row">
        ${renderHomeMiniStat(t("homeSummaryRate"), percent(state.today.summary.habitRate))}
        ${renderHomeMiniStat(t("completedHabits"), `${state.today.summary.completedHabits}/${state.today.summary.totalHabits}`)}
        ${renderHomeMiniStat(t("remainingHabits"), String(state.today.summary.remainingHabits))}
      </div>
    </section>
    <section class="content-card today-home-week">
      <div class="route-inline-head today-home-week-head">
        <h3>${esc(t("month"))}</h3>
        <div class="actions">
          <button class="btn-soft compact-action" type="button" data-action="shift-week" data-direction="-1">${esc(t("weekPrevious"))}</button>
          <button class="btn-soft compact-action" type="button" data-action="shift-week" data-direction="1">${esc(t("weekNext"))}</button>
        </div>
      </div>
      <div class="today-home-week-grid">${weekDates.map((date) => weekChip(date)).join("")}</div>
    </section>
    <section class="content-card today-home-board today-home-board--dense">
      <div class="today-home-board-head">
        <div>${esc(t("progress"))}</div>
        <div>${esc(t("habits"))}</div>
        <div>${esc(t("status"))}</div>
      </div>
      <div class="today-home-board-body">
        ${state.today.habits.length ? state.today.habits.map(renderHomeHabitRowDense).join("") : renderHomeEmpty()}
      </div>
    </section>
    ${renderHomeFab()}
    ${renderQuickCreateLayer()}
  </div>`;
}

function renderHomeFab() {
  return `<div class="home-fab-shell ${state.homeQuickActionsOpen ? "is-open" : ""}">
    ${state.homeQuickActionsOpen ? `<button class="home-fab-backdrop" type="button" data-action="close-home-fab" aria-label="${esc(t("closeMenu"))}"></button>` : ""}
    <div class="home-fab-menu" aria-hidden="${state.homeQuickActionsOpen ? "false" : "true"}">
      <button class="home-fab-option btn-soft" type="button" data-action="open-quick-create" data-kind="habit">${esc(t("createHabit"))}</button>
      <button class="home-fab-option btn-soft" type="button" data-action="open-quick-create" data-kind="task">${esc(t("createTask"))}</button>
      <button class="home-fab-option btn-soft" type="button" data-action="open-quick-create" data-kind="routine">${esc(t("createRoutine"))}</button>
    </div>
    <button class="home-fab-trigger" type="button" data-action="toggle-home-fab" aria-label="${esc(t("addMenu"))}">+</button>
  </div>`;
}

function renderQuickCreateLayer() {
  if (!state.quickCreateKind) return "";

  const config = {
    habit: {
      title: t("createHabit"),
      copy: t("quickCreateHabitCopy"),
      form: `<form class="form-grid" data-form="habit-create">
        ${habitFields("quick-habit-create", null, true)}
        <div class="actions quick-create-actions">
          <button class="btn-soft" type="button" data-action="close-quick-create">${esc(t("cancel"))}</button>
          <button class="btn" type="submit">${esc(t("createHabit"))}</button>
        </div>
      </form>`,
    },
    task: {
      title: t("createTask"),
      copy: t("quickCreateTaskCopy"),
      form: `<form class="form-grid" data-form="task-create">
        ${taskFields("quick-task-create", null)}
        <div class="actions quick-create-actions">
          <button class="btn-soft" type="button" data-action="close-quick-create">${esc(t("cancel"))}</button>
          <button class="btn" type="submit">${esc(t("createTask"))}</button>
        </div>
      </form>`,
    },
    routine: {
      title: t("createRoutine"),
      copy: t("quickCreateRoutineCopy"),
      form: `<form class="form-grid" data-form="routine-create">
        ${routineFields("quick-routine-create", null)}
        <div class="actions quick-create-actions">
          <button class="btn-soft" type="button" data-action="close-quick-create">${esc(t("cancel"))}</button>
          <button class="btn" type="submit">${esc(t("createRoutine"))}</button>
        </div>
      </form>`,
    },
  }[state.quickCreateKind];

  if (!config) return "";

  return `<div class="quick-create-layer quick-create-layer--${state.quickCreateKind}" role="dialog" aria-modal="true" aria-label="${esc(config.title)}">
    <button class="quick-create-backdrop" type="button" data-action="close-quick-create" aria-label="${esc(t("closeMenu"))}"></button>
    <section class="content-card quick-create-card quick-create-card--${state.quickCreateKind}">
      <div class="quick-create-head">
        <div>
          <p class="eyebrow">${esc(t("addMenu"))}</p>
          <h3>${esc(config.title)}</h3>
          <p class="muted">${esc(config.copy)}</p>
        </div>
        <button class="btn-soft quick-create-close" type="button" data-action="close-quick-create" aria-label="${esc(t("closeMenu"))}">×</button>
      </div>
      ${config.form}
    </section>
  </div>`;
}

function renderCalendarMonthPage() {
  const days = state.calendar?.days ?? [];
  const monthGrid = buildCalendarMonthGrid(state.selectedMonth, days);
  const monthRate =
    days.length === 0 ? 0 : days.reduce((sum, day) => sum + Number(day.habitProgressRate || 0), 0) / days.length;

  return `<div class="route-screen-layout">
    <section class="content-card calendar-shell">
      <div class="route-inline-head">
        <h3>${esc(formatMonthTitle(state.selectedMonth))}</h3>
        <div class="actions">
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="-1">${esc(t("weekPrevious"))}</button>
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="1">${esc(t("weekNext"))}</button>
        </div>
      </div>
      <div class="calendar-focus-inline">
        <article class="calendar-focus-rate" style="--progress:${String(monthRate)};">
          <div class="calendar-focus-copy">
            <span>${esc(t("homeSummaryRate"))}</span>
            <strong>${esc(percent(monthRate))}</strong>
          </div>
          <div class="calendar-water-pool calendar-water-pool--summary" aria-hidden="true">
            <div class="calendar-water-fill">
              <span class="calendar-water-wave calendar-water-wave--back"></span>
              <span class="calendar-water-wave calendar-water-wave--front"></span>
            </div>
          </div>
        </article>
      </div>
      <div class="calendar-grid calendar-grid--month">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => `<span class="weekday">${label}</span>`).join("")}
        ${monthGrid.length ? monthGrid.map((cell) => renderCalendarMonthCell(cell)).join("") : `<p class="muted">${esc(t("noCalendarData"))}</p>`}
      </div>
    </section>
  </div>`;
}

function renderHomeMiniStat(label, value) {
  return `<article class="today-home-summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
}

function renderHomeHabitRowDense(habit) {
  const progress = habit.trackingType === "binary"
    ? `<button class="home-status-toggle ${habit.isComplete ? "is-complete" : ""}" type="button" data-action="toggle-binary" data-habit-id="${habit.id}" data-complete="${String(habit.isComplete)}" aria-label="${esc(habit.isComplete ? t("markPending") : t("markDone"))}">${habit.isComplete ? "✅" : ""}</button>`
    : `<button class="home-progress-chip ${habit.isComplete ? "is-complete" : ""}" type="button" data-action="advance-habit" data-habit-id="${habit.id}" aria-label="${esc(`${habit.name} ${habit.currentValue}/${habit.targetCount}`)}">${habit.currentValue}/${habit.targetCount}</button>`;

  return `<article class="home-board-group ${habit.isComplete ? "" : "is-pending"}" data-home-habit-row="${habit.id}" draggable="true" style="--routine-accent:${esc(habit.color)};">
    <div class="home-board-row home-board-row--item">
      <div class="home-board-cell home-board-cell--index">
        <span class="home-order-badge">${habit.sortOrder}</span>
        <span class="muted">::</span>
      </div>
      <div class="home-board-cell home-board-cell--main">
        <div class="home-routine-main">
          <span class="emoji-badge ${habit.emoji ? "" : "emoji-badge--empty"}">${habit.emoji ? esc(habit.emoji) : ""}</span>
          <div class="home-item-copy">
            <strong>${esc(habit.name)}</strong>
            <span class="muted">${esc([habit.tag, `${t("streak")} ${habit.streak}`, `${t("startDate")} ${habit.startDate}`].filter(Boolean).join(" | "))}</span>
          </div>
        </div>
      </div>
      <div class="home-board-cell home-board-cell--status">${progress}</div>
    </div>
  </article>`;
}

function buildCalendarMonthGrid(monthKey, days) {
  if (!days.length) {
    return [];
  }

  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstDay.getUTCDay();
  const mondayIndex = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const cells = Array.from({ length: mondayIndex }, () => null);

  for (const day of days) {
    cells.push(day);
  }

  const remainder = cells.length % 7;
  if (remainder !== 0) {
    cells.push(...Array.from({ length: 7 - remainder }, () => null));
  }

  return cells;
}

function renderCalendarMonthCell(cell) {
  if (!cell) {
    return `<div class="day-card is-empty" aria-hidden="true"></div>`;
  }

  const isSelected = cell.date === state.selectedHomeDate;
  const isToday = cell.date === dateKeyLocal();
  const progressValue = Math.max(0, Math.min(1, Number(cell.habitProgressRate || 0)));
  return `<button
      class="day-card calendar-day-button ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}"
      type="button"
      data-route="${buildTodayRoute(cell.date)}"
      style="--progress:${String(progressValue)};"
      aria-label="${esc(`${cell.date} ${percent(cell.habitProgressRate)}`)}"
    >
      <span class="calendar-water-pool calendar-water-pool--cell" aria-hidden="true">
        <span class="calendar-water-fill">
          <span class="calendar-water-wave calendar-water-wave--back"></span>
          <span class="calendar-water-wave calendar-water-wave--front"></span>
        </span>
      </span>
      <div class="day-card-head">
        <strong>${esc(String(Number(cell.date.slice(-2))))}</strong>
        ${isToday ? `<span class="calendar-flag"><span class="calendar-flag-text">Today</span></span>` : ""}
      </div>
      <div class="calendar-rate-block">
        <span class="calendar-rate-value">${esc(percent(cell.habitProgressRate))}</span>
      </div>
    </button>`;
}

function setPanel(name, html) {
  const panel = document.getElementById(`tab-${name}`);
  if (panel) {
    panel.innerHTML = html;
  }
}

async function request(path, options = {}) {
  const headers = { "Accept-Language": state.locale };
  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    if (response.status === 401 && state.authToken && !options.retried) {
      setAuthToken("");
      return request(path, { ...options, retried: true });
    }
    if (response.status === 401 && !options.allow401 && state.authRequired) {
      setAuthToken("");
      location.assign("/login");
      throw new Error("authenticationRequired");
    }
    throw new Error(payload?.message || "actionFailed");
  }
  return payload;
}

function applyShellText() {
  const meta = ROUTE_META[state.routePath];
  text("app-utility-title", t("appTitle"));
  text("app-nav-label", t("plannerSections"));
  text("app-nav-title", t("appTitle"));
  text("screen-label", "my planner");
  text("screen-title", t(meta.titleKey));
  text("screen-copy", t(meta.copyKey));
  for (const button of document.querySelectorAll("[data-label-key]")) {
    if (button instanceof HTMLElement) {
      button.textContent = t(button.dataset.labelKey || "");
    }
  }
}

function showFeedback(message, isError = false) {
  const resolved = resolveMessage(message);
  if (resolved) {
    if (isError) {
      console.error(`[planner-ui] ${resolved}`);
    } else {
      console.info(`[planner-ui] ${resolved}`);
    }
  }
  state.feedback = "";
  state.feedbackIsError = false;
  const feedback = document.getElementById("feedback");
  if (feedback instanceof HTMLElement) {
    feedback.textContent = "";
    feedback.hidden = true;
  }
}

function detectLocale() {
  const saved = globalThis.localStorage?.getItem(LOCALE_KEY);
  if (saved && MESSAGES[saved]) return saved;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const normalized = String(candidate || "").toLowerCase();
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

function setAuthToken(token) {
  state.authToken = token;
  if (token) {
    globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, token);
  } else {
    globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
  }
}

function applyPreferences() {
  document.body.dataset.theme = state.themePreset;
  document.body.dataset.density = state.density;
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) {
    input.value = value;
    const scope = input.closest("label") || input.parentElement;
    const badge = scope?.querySelector(".emoji-trigger-badge");
    const label = scope?.querySelector(".emoji-trigger-label");
    if (badge) badge.textContent = value || "🙂";
    if (label) label.textContent = value || t("emoji");
    for (const swatch of scope?.querySelectorAll(".color-swatch") ?? []) {
      if (swatch instanceof HTMLElement) {
        swatch.classList.toggle("is-selected", swatch.dataset.value === value);
      }
    }
  }
}

function t(key) {
  const bundle = MESSAGES[state.locale] ?? MESSAGES.ko;
  return bundle[key] ?? MESSAGES.ko[key] ?? key;
}

function resolveMessage(message) {
  return MESSAGES[state.locale]?.[message] ? t(message) : String(message || "");
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function optionalValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function dateKeyLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatMonthKeyLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(dateKey) {
  return new Intl.DateTimeFormat(state.locale, { year: "numeric", month: "long" }).format(new Date(`${dateKey}T12:00:00`));
}

function formatMonthTitle(monthKey) {
  return new Intl.DateTimeFormat(state.locale, { year: "numeric", month: "long" }).format(new Date(`${monthKey}-01T12:00:00`));
}

function formatFullDate(dateKey) {
  return new Intl.DateTimeFormat(state.locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  return formatMonthKeyLocal(new Date(year, month - 1 + delta, 1));
}

function moveId(ids, draggedId, targetId) {
  const next = [...ids];
  const fromIndex = next.indexOf(draggedId);
  const toIndex = next.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return next;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, draggedId);
  return next;
}
