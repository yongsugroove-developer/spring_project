import {
  addDaysToDateKey,
  buildTodayRoute,
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

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#e11d48",
  "#64748b",
  "#1f2937",
];

const MODE_ROUTINE_PREFIX = "[[mode-routine]]";

const ROUTE_META = {
  "/today": { tab: "today", titleKey: "homeTitle", copyKey: "homeCopy" },
  "/account": { tab: "account", titleKey: "accountTitle", copyKey: "accountCopy" },
  "/modes": { tab: "modes", titleKey: "modesMenu", copyKey: "modesCopy" },
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
  selectedMonth: formatMonthKeyLocal(new Date()),
  statsRange: "week",
  today: null,
  habits: [],
  tasks: [],
  routines: [],
  modes: [],
  calendar: null,
  stats: null,
  accountMenuOpen: false,
  homeQuickActionsOpen: false,
  quickCreateKind: "",
  routeFormDrafts: {},
  modeDateDrafts: {},
  modeDatePicker: null,
  habitPicker: null,
  modeDetailsOpen: {},
  homeNoteOpen: true,
  homePanel: "habits",
  homeTaskFilter: "scheduled",
  draggedHabitId: "",
  previousAchievementRate: 0,
  achievementPulseUntil: 0,
};

let feedbackTimer = 0;
let achievementAnimationFrame = 0;

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

    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action], [data-route]") : null;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.route) {
      event.preventDefault();
      navigate(target.dataset.route);
      return;
    }

    const action = target.dataset.action;
    if (action) {
      event.preventDefault();
      rememberOpenModeDetails(target);
      void handleAction(action, target);
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    rememberOpenModeDetails(form);
    void handleSubmit(form);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    rememberOpenModeDetails(target);
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
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      target.name === "scheduleType" &&
      target.form instanceof HTMLFormElement &&
      (target.form.dataset.form === "mode-create" || target.form.dataset.form === "mode-update")
    ) {
      captureRouteFormDraft(target.form);
      render();
    }
  });

  document.addEventListener("dragstart", (event) => {
    const row = event.target instanceof HTMLElement ? event.target.closest("[data-home-habit-row]") : null;
    if (!(row instanceof HTMLElement)) return;
    state.draggedHabitId = row.dataset.homeHabitId ?? "";
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.draggedHabitId);
    }
  });

  document.addEventListener("dragend", () => {
    state.draggedHabitId = "";
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
    const targetId = row.dataset.homeHabitId ?? "";
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
  if (action === "go-home") {
    navigate("/today");
    return;
  }
  if (action === "pick-date") {
    const date = target.dataset.date ?? "";
    if (isValidDateKey(date)) {
      navigate(buildTodayRoute(date));
    }
    return;
  }
  if (action === "select-home-panel") {
    state.homePanel = target.dataset.panel === "tasks" ? "tasks" : "habits";
    updateHomePanelTabs();
    syncHomeCarouselPosition(true);
    return;
  }
  if (action === "set-home-task-filter") {
    state.homeTaskFilter = target.dataset.filter === "inbox" ? "inbox" : "scheduled";
    render();
    return;
  }
  if (action === "toggle-binary") {
    const habitId = target.dataset.habitId ?? "";
    const completed = target.dataset.complete === "true";
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${habitId}`, {
      method: "PUT",
      body: { completed: !completed },
    });
    markAchievementPulse();
    await refreshTodayOnly();
    return;
  }
  if (action === "adjust-habit") {
    const habit = state.today?.habits?.find((entry) => entry.id === target.dataset.habitId);
    if (!habit) return;
    const nextValue = Math.max(0, habit.currentValue + Number(target.dataset.delta || "0"));
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${habit.id}`, {
      method: "PUT",
      body: { value: nextValue },
    });
    markAchievementPulse();
    await refreshTodayOnly();
    return;
  }
  if (action === "cycle-count") {
    const habit = state.today?.habits?.find((entry) => entry.id === target.dataset.habitId);
    if (!habit) return;
    const targetCount = Math.max(1, Number(habit.targetCount || 1));
    const nextValue = habit.currentValue >= targetCount ? Math.min(1, targetCount) : Math.min(targetCount, habit.currentValue + 1);
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${habit.id}`, {
      method: "PUT",
      body: { value: nextValue },
    });
    markAchievementPulse();
    await refreshTodayOnly();
    return;
  }
  if (action === "log-time") {
    const habit = state.today?.habits?.find((entry) => entry.id === target.dataset.habitId);
    if (!habit) return;
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${habit.id}`, {
      method: "PUT",
      body: { completed: !habit.timeEntries?.length },
    });
    markAchievementPulse();
    await refreshTodayOnly();
    return;
  }
  if (action === "remove-time-entry") {
    const habitId = target.dataset.habitId ?? "";
    const entryIndex = Number(target.dataset.entryIndex || "-1");
    await request(`/api/habit-checkins/${state.selectedHomeDate}/habits/${habitId}`, {
      method: "PUT",
      body: { action: "remove-time", entryIndex },
    });
    await refreshTodayOnly();
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
    return;
  }
  if (action === "delete-habit") {
    await request(`/api/habits/${target.dataset.deleteId}`, { method: "DELETE" });
    await refreshAll();
    return;
  }
  if (action === "delete-task") {
    await request(`/api/tasks/${target.dataset.deleteId}`, { method: "DELETE" });
    await refreshAll();
    return;
  }
  if (action === "delete-routine") {
    await request(`/api/routines/${target.dataset.deleteId}`, { method: "DELETE" });
    await refreshAll();
    return;
  }
  if (action === "delete-mode") {
    const modeId = target.dataset.deleteId ?? "";
    await request(`/api/routine-modes/${modeId}`, { method: "DELETE" });
    await deleteModeOwnedRoutines(modeId);
    await refreshAll();
    return;
  }
  if (action === "clear-mode-override") {
    await request(`/api/routine-mode-overrides/${state.selectedHomeDate}`, {
      method: "PUT",
      body: { modeId: null },
    });
    await refreshAll();
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
    closeQuickCreate();
    return;
  }
  if (action === "close-home-fab") {
    state.homeQuickActionsOpen = false;
    render();
    return;
  }
  if (action === "set-mode-schedule") {
    captureVisibleRouteFormDrafts();
    const formKey = target.dataset.formKey ?? "";
    const scheduleType = target.dataset.scheduleType ?? "";
    if (!formKey || !["everyday", "dates", "weekdays", "weekends"].includes(scheduleType)) return;
    state.routeFormDrafts[formKey] = {
      ...(getRouteFormDraft(formKey) ?? {}),
      scheduleType,
    };
    if (scheduleType === "dates") {
      openModeDatePicker(formKey);
      return;
    }
    if (state.modeDatePicker?.formKey === formKey) {
      state.modeDatePicker = null;
    }
    render();
    return;
  }
  if (action === "open-mode-date-picker") {
    captureVisibleRouteFormDrafts();
    const formKey = target.dataset.formKey ?? "";
    if (!formKey) return;
    openModeDatePicker(formKey);
    return;
  }
  if (action === "shift-mode-date-month") {
    captureVisibleRouteFormDrafts();
    if (!state.modeDatePicker) return;
    state.modeDatePicker.month = shiftMonthKey(state.modeDatePicker.month, Number(target.dataset.direction || "0"));
    render();
    return;
  }
  if (action === "toggle-mode-date") {
    captureVisibleRouteFormDrafts();
    if (!state.modeDatePicker) return;
    const date = target.dataset.date ?? "";
    if (!isValidDateKey(date)) return;
    const dates = new Set(state.modeDatePicker.dates);
    if (dates.has(date)) {
      dates.delete(date);
    } else {
      dates.add(date);
    }
    state.modeDatePicker.dates = sortReservedDates([...dates]);
    render();
    return;
  }
  if (action === "apply-mode-date-picker") {
    captureVisibleRouteFormDrafts();
    if (!state.modeDatePicker) return;
    state.modeDateDrafts[state.modeDatePicker.formKey] = sortReservedDates(state.modeDatePicker.dates);
    state.modeDatePicker = null;
    render();
    return;
  }
  if (action === "close-mode-date-picker") {
    captureVisibleRouteFormDrafts();
    state.modeDatePicker = null;
    render();
    return;
  }
  if (action === "open-habit-picker") {
    captureVisibleRouteFormDrafts();
    const formKey = target.dataset.formKey ?? "";
    if (!formKey || !state.habits.length) return;
    const draft = getRouteFormDraft(formKey);
    state.habitPicker = {
      formKey,
      selectedIds: orderedSelectedIds(draft?.habitIds ?? [], state.habits),
    };
    render();
    return;
  }
  if (action === "toggle-habit-picker-choice") {
    if (!state.habitPicker) return;
    const habitId = target.dataset.habitId ?? "";
    if (!habitId) return;
    const selectedIds = new Set(state.habitPicker.selectedIds);
    if (selectedIds.has(habitId)) {
      selectedIds.delete(habitId);
    } else {
      selectedIds.add(habitId);
    }
    state.habitPicker.selectedIds = orderedSelectedIds([...selectedIds], state.habits);
    render();
    return;
  }
  if (action === "apply-habit-picker") {
    if (!state.habitPicker) return;
    const { formKey, selectedIds } = state.habitPicker;
    state.routeFormDrafts[formKey] = {
      ...(getRouteFormDraft(formKey) ?? {}),
      habitIds: orderedSelectedIds(selectedIds, state.habits),
    };
    state.habitPicker = null;
    render();
    return;
  }
  if (action === "close-habit-picker") {
    state.habitPicker = null;
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
  const formKey = form.dataset.formKey ?? "";
  const data = new FormData(form);

  try {
    if (kind === "habit-create") {
      await request("/api/habits", { method: "POST", body: serializeHabitForm(data, true) });
      form.reset();
      closeQuickCreate();
      await refreshAll();
      return;
    }
    if (kind === "habit-update") {
      await request(`/api/habits/${form.dataset.id}`, { method: "PATCH", body: serializeHabitForm(data, false) });
      await refreshAll();
      return;
    }
    if (kind === "task-create") {
      await request("/api/tasks", { method: "POST", body: serializeTaskForm(data) });
      form.reset();
      closeQuickCreate();
      await refreshAll();
      return;
    }
    if (kind === "task-update") {
      await request(`/api/tasks/${form.dataset.id}`, { method: "PATCH", body: serializeTaskForm(data) });
      await refreshAll();
      return;
    }
    if (kind === "routine-create") {
      await request("/api/routines", { method: "POST", body: serializeRoutineForm(data) });
      clearRouteFormDraft(formKey);
      form.reset();
      closeQuickCreate();
      await refreshAll();
      return;
    }
    if (kind === "routine-update") {
      await request(`/api/routines/${form.dataset.id}`, { method: "PATCH", body: serializeRoutineForm(data) });
      clearRouteFormDraft(formKey);
      await refreshAll();
      return;
    }
    if (kind === "mode-create") {
      const modePayload = buildModeFormPayload(data);
      const reservedDates = readReservedDates(data);
      const created = await request("/api/routine-modes", {
        method: "POST",
        body: { name: modePayload.name, routineIds: [], habitIds: [], activeDays: modePayload.activeDays },
      });
      const nextModeState = await syncModeRoutineSelections(
        created.mode.id,
        modePayload.name,
        modePayload.routineSelections,
        modePayload.habitIds,
      );
      await request(`/api/routine-modes/${created.mode.id}`, {
        method: "PATCH",
        body: {
          name: modePayload.name,
          routineIds: nextModeState.routineIds,
          habitIds: nextModeState.habitIds,
          activeDays: modePayload.activeDays,
        },
      });
      await syncModeReservations(created.mode.id, [], reservedDates);
      clearRouteFormDraft(formKey);
      delete state.modeDateDrafts[formKey];
      form.reset();
      await refreshAll();
      return;
    }
    if (kind === "mode-update") {
      const modeId = form.dataset.id ?? "";
      const modePayload = buildModeFormPayload(data, modeId);
      const reservedDates = readReservedDates(data);
      const previousDates = state.modes.find((entry) => entry.id === modeId)?.reservedDates ?? [];
      const nextModeState = await syncModeRoutineSelections(
        modeId,
        modePayload.name,
        modePayload.routineSelections,
        modePayload.habitIds,
      );
      await request(`/api/routine-modes/${modeId}`, {
        method: "PATCH",
        body: {
          name: modePayload.name,
          routineIds: nextModeState.routineIds,
          habitIds: nextModeState.habitIds,
          activeDays: modePayload.activeDays,
        },
      });
      await syncModeReservations(modeId, previousDates, reservedDates);
      clearRouteFormDraft(formKey);
      delete state.modeDateDrafts[formKey];
      await refreshAll();
      return;
    }
    if (kind === "daily-note-save") {
      await request(`/api/daily-notes/${state.selectedHomeDate}`, {
        method: "PUT",
        body: { note: String(data.get("note") || "") },
      });
      await refreshTodayOnly();
      showFeedback(tx("saveDone", "저장했습니다."));
      return;
    }
    if (kind === "mode-override") {
      await request(`/api/routine-mode-overrides/${state.selectedHomeDate}`, {
        method: "PUT",
        body: { modeId: optionalValue(data.get("modeId")) },
      });
      await refreshAll();
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
    color: String(data.get("color") || "#16a34a"),
    tag: optionalValue(data.get("tag")),
    trackingType,
    targetCount: trackingType === "binary" ? 1 : Number(data.get("targetCount") || 1),
    startDate: optionalValue(data.get("startDate")) || (useFallbackDate ? state.selectedHomeDate || dateKeyLocal() : undefined),
  };
}

function serializeTaskForm(data) {
  return {
    title: String(data.get("title") || ""),
    note: optionalValue(data.get("note")),
    dueDate: optionalValue(data.get("dueDate")),
    status: String(data.get("status") || "pending"),
  };
}

function serializeRoutineForm(data) {
  return {
    name: String(data.get("name") || ""),
    color: optionalValue(data.get("color")),
    habitIds: data.getAll("habitIds").map(String),
    notificationEnabled: false,
    notificationTime: null,
    notificationWeekdays: [],
  };
}

function serializeModeForm(data) {
  return {
    name: String(data.get("name") || ""),
    routineIds: [],
    habitIds: orderedSelectedIds(data.getAll("habitIds").map(String), state.habits),
    activeDays: readModeActiveDays(data, ""),
    routineSelections: collectModeRoutineSelections(data),
  };
}

function routineFormKey(routineId = "", scope = "create") {
  return routineId ? `routine:${routineId}` : `routine:${scope}`;
}

function modeFormKey(modeId = "", scope = "create") {
  return modeId ? `mode:${modeId}` : `mode:${scope}`;
}

function orderedSelectedIds(values, items) {
  const selected = new Set(values.map(String));
  return items.map((item) => item.id).filter((id) => selected.has(id));
}

function createModeRoutineName(modeId, sourceRoutineId, displayName) {
  return `${MODE_ROUTINE_PREFIX}${encodeURIComponent(modeId)}|${encodeURIComponent(sourceRoutineId)}|${encodeURIComponent(displayName)}`;
}

function parseModeRoutineName(name) {
  const text = String(name || "");
  if (!text.startsWith(MODE_ROUTINE_PREFIX)) {
    return null;
  }
  const raw = text.slice(MODE_ROUTINE_PREFIX.length);
  const [modeId, sourceRoutineId, displayName] = raw.split("|");
  if (!modeId || !sourceRoutineId || displayName === undefined) {
    return null;
  }
  return {
    modeId: decodeURIComponent(modeId),
    sourceRoutineId: decodeURIComponent(sourceRoutineId),
    displayName: decodeURIComponent(displayName),
  };
}

function getRoutineDisplayName(routine) {
  if (!routine) {
    return "";
  }
  return parseModeRoutineName(routine.name)?.displayName ?? String(routine.name || "");
}

function isModeOwnedRoutine(routine) {
  return Boolean(parseModeRoutineName(routine?.name));
}

function getVisibleRoutines() {
  return state.routines.filter((routine) => !isModeOwnedRoutine(routine));
}

function getModeOwnedRoutines(modeId) {
  return state.routines.filter((routine) => parseModeRoutineName(routine.name)?.modeId === modeId);
}

function getRoutineHabitIds(routine) {
  const sourceIds =
    Array.isArray(routine?.habits) && routine.habits.length
      ? routine.habits.map((habit) => habit.id)
      : Array.isArray(routine?.habitIds)
        ? routine.habitIds
        : [];
  const selected = new Set(sourceIds.map(String));
  return state.habits.map((habit) => habit.id).filter((habitId) => selected.has(habitId));
}

function areSameIds(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function getModeScheduleType(activeDays = [], modeId = "") {
  const normalized = [...new Set((activeDays ?? []).map(Number))].sort((left, right) => left - right);
  if (areSameIds(normalized, [0, 1, 2, 3, 4, 5, 6])) {
    return "everyday";
  }
  if (areSameIds(normalized, [1, 2, 3, 4, 5])) {
    return "weekdays";
  }
  if (areSameIds(normalized, [0, 6])) {
    return "weekends";
  }
  return modeId === "mode-default" ? "everyday" : "dates";
}

function readModeActiveDays(data, modeId = "") {
  const scheduleType = String(data.get("scheduleType") || "");
  if (scheduleType === "weekdays") {
    return [1, 2, 3, 4, 5];
  }
  if (scheduleType === "weekends") {
    return [0, 6];
  }
  if (scheduleType === "everyday" || modeId === "mode-default") {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  return [];
}

function formatModeScheduleSummary(activeDays, reservedDates, modeId = "") {
  const scheduleType = getModeScheduleType(activeDays, modeId);
  if (scheduleType === "weekdays") {
    return tx("weeklyWeekdays", "매주 주중");
  }
  if (scheduleType === "weekends") {
    return tx("weeklyWeekends", "매주 주말");
  }
  if (scheduleType === "everyday") {
    return tx("everyday", "매일");
  }
  return formatReservedDatesSummary(reservedDates);
}

function formatModeScheduleBadge(activeDays, reservedDates, modeId = "") {
  const scheduleType = getModeScheduleType(activeDays, modeId);
  if (scheduleType === "weekdays") {
    return tx("modeWeekdaysShort", "주중");
  }
  if (scheduleType === "weekends") {
    return tx("modeWeekendsShort", "주말");
  }
  if (scheduleType === "everyday") {
    return tx("modeEverydayShort", "매일");
  }
  return reservedDates?.length ? `${tx("modeDatesShort", "날짜")} ${reservedDates.length}` : tx("modeDatesShort", "날짜");
}

function collectModeRoutineSelections(data) {
  const selections = {};
  for (const routine of getVisibleRoutines()) {
    const selectedIds = orderedSelectedIds(
      data.getAll(`routineHabit:${routine.id}`).map(String),
      Array.isArray(routine.habits) ? routine.habits : [],
    );
    if (selectedIds.length) {
      selections[routine.id] = selectedIds;
    }
  }
  return selections;
}

function getModeRoutineSelections(mode, draft) {
  if (draft?.routineSelections && typeof draft.routineSelections === "object") {
    return Object.fromEntries(
      Object.entries(draft.routineSelections)
        .map(([routineId, habitIds]) => {
          const routine = getVisibleRoutines().find((entry) => entry.id === routineId);
          if (!routine || !Array.isArray(habitIds)) {
            return null;
          }
          return [routineId, orderedSelectedIds(habitIds.map(String), Array.isArray(routine.habits) ? routine.habits : [])];
        })
        .filter((entry) => Array.isArray(entry) && entry[1].length),
    );
  }

  const selections = {};
  for (const routine of getVisibleRoutines()) {
    const fullHabitIds = getRoutineHabitIds(routine);
    const directRoutine = mode?.routines?.find((entry) => entry.id === routine.id) ?? null;
    const derivedRoutine =
      mode?.routines?.find((entry) => parseModeRoutineName(entry.name)?.sourceRoutineId === routine.id) ?? null;
    const selectedIds = derivedRoutine ? getRoutineHabitIds(derivedRoutine) : directRoutine ? fullHabitIds : [];
    if (selectedIds.length) {
      selections[routine.id] = orderedSelectedIds(selectedIds, Array.isArray(routine.habits) ? routine.habits : []);
    }
  }
  return selections;
}

function buildModeFormPayload(data, modeId = "") {
  return {
    name: String(data.get("name") || ""),
    habitIds: orderedSelectedIds(data.getAll("habitIds").map(String), state.habits),
    activeDays: readModeActiveDays(data, modeId),
    routineSelections: collectModeRoutineSelections(data),
  };
}

function getRouteFormDraft(formKey) {
  if (!formKey) {
    return null;
  }
  return state.routeFormDrafts[formKey] ?? null;
}

function clearRouteFormDraft(formKey) {
  if (!formKey) {
    return;
  }
  delete state.routeFormDrafts[formKey];
}

function shouldOpenModeDetails(formKey) {
  if (!formKey) {
    return false;
  }
  return Boolean(state.modeDetailsOpen[formKey] || state.modeDatePicker?.formKey === formKey || state.habitPicker?.formKey === formKey);
}

function rememberOpenModeDetails(target) {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const details = target.closest("[data-mode-details-key]");
  if (!(details instanceof HTMLDetailsElement)) {
    return;
  }
  const detailsKey = details.dataset.modeDetailsKey ?? "";
  if (!detailsKey) {
    return;
  }
  state.modeDetailsOpen[detailsKey] = details.open;
}

function captureRouteFormDraft(form) {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  const formKey = form.dataset.formKey ?? "";
  if (!formKey) {
    return;
  }
  const data = new FormData(form);
  if (form.dataset.form === "mode-create" || form.dataset.form === "mode-update") {
    const modeId = form.dataset.id ?? "";
    state.routeFormDrafts[formKey] = {
      name: String(data.get("name") || ""),
      color: optionalValue(data.get("color")),
      routineSelections: collectModeRoutineSelections(data),
      habitIds: orderedSelectedIds(data.getAll("habitIds").map(String), state.habits),
      reservedDates: readReservedDates(data),
      activeDays: readModeActiveDays(data, modeId),
      scheduleType: String(data.get("scheduleType") || getModeScheduleType(readModeActiveDays(data, modeId), modeId)),
    };
    return;
  }
  state.routeFormDrafts[formKey] = {
    name: String(data.get("name") || ""),
    color: optionalValue(data.get("color")),
    routineIds: [],
    habitIds: orderedSelectedIds(data.getAll("habitIds").map(String), state.habits),
    reservedDates: readReservedDates(data),
  };
}

function captureVisibleRouteFormDrafts() {
  for (const form of document.querySelectorAll("form[data-form-key]")) {
    captureRouteFormDraft(form);
  }
}

function openModeDatePicker(formKey) {
  const currentDates = getModeReservedDates(formKey, getRouteFormDraft(formKey)?.reservedDates ?? []);
  state.modeDatePicker = {
    formKey,
    month: (currentDates[0] ?? state.selectedHomeDate ?? dateKeyLocal()).slice(0, 7),
    dates: [...currentDates],
  };
  render();
}

function selectedItemsByIds(ids, items) {
  const selected = new Set(ids.map(String));
  return items.filter((item) => selected.has(item.id));
}

function formatSelectionSummary(items, emptyLabel) {
  if (!items.length) {
    return emptyLabel;
  }
  if (items.length === 1) {
    return items[0].name;
  }
  return `${items[0].name} +${items.length - 1}`;
}

function sortReservedDates(values) {
  return [...new Set(values.filter((value) => isValidDateKey(value)))].sort((left, right) => left.localeCompare(right));
}

function readReservedDates(data) {
  return sortReservedDates(data.getAll("reservedDates").map(String));
}

function getModeReservedDates(formKey, fallbackDates = null) {
  const draft = state.modeDateDrafts[formKey];
  if (Array.isArray(draft)) {
    return sortReservedDates(draft);
  }
  return sortReservedDates(fallbackDates ?? []);
}

function formatReservedDatesSummary(dates) {
  if (!dates.length) {
  return tx("noReservedDates", "예약된 날짜가 없습니다.");
  }
  if (dates.length === 1) {
    return formatCompactDate(dates[0]);
  }
  return `${formatCompactDate(dates[0])} +${dates.length - 1}`;
}

async function deleteModeOwnedRoutines(modeId) {
  for (const routine of getModeOwnedRoutines(modeId)) {
    await request(`/api/routines/${routine.id}`, { method: "DELETE" });
  }
}

async function syncModeRoutineSelections(modeId, modeName, routineSelections, standaloneHabitIds) {
  const nextRoutineIds = [];
  const coveredHabitIds = new Set();
  const existingDerivedBySourceId = new Map(
    getModeOwnedRoutines(modeId)
      .map((routine) => {
        const meta = parseModeRoutineName(routine.name);
        return meta ? [meta.sourceRoutineId, routine] : null;
      })
      .filter(Boolean),
  );
  const usedDerivedIds = new Set();

  for (const routine of getVisibleRoutines()) {
    const selectedIds = orderedSelectedIds(
      routineSelections?.[routine.id] ?? [],
      Array.isArray(routine.habits) ? routine.habits : [],
    );
    if (!selectedIds.length) {
      continue;
    }

    const fullHabitIds = getRoutineHabitIds(routine);
    if (areSameIds(selectedIds, fullHabitIds)) {
      nextRoutineIds.push(routine.id);
      fullHabitIds.forEach((habitId) => coveredHabitIds.add(habitId));
      continue;
    }

    const payload = {
      name: createModeRoutineName(modeId, routine.id, `${modeName}의 ${getRoutineDisplayName(routine)}`),
      color: routine.color || null,
      habitIds: selectedIds,
      notificationEnabled: false,
      notificationTime: null,
      notificationWeekdays: [],
    };
    const existingDerived = existingDerivedBySourceId.get(routine.id);
    if (existingDerived) {
      await request(`/api/routines/${existingDerived.id}`, { method: "PATCH", body: payload });
      nextRoutineIds.push(existingDerived.id);
      usedDerivedIds.add(existingDerived.id);
    } else {
      const created = await request("/api/routines", { method: "POST", body: payload });
      nextRoutineIds.push(created.routine.id);
    }
    selectedIds.forEach((habitId) => coveredHabitIds.add(habitId));
  }

  for (const routine of getModeOwnedRoutines(modeId)) {
    const meta = parseModeRoutineName(routine.name);
    if (!meta || usedDerivedIds.has(routine.id) || nextRoutineIds.includes(routine.id)) {
      continue;
    }
    await request(`/api/routines/${routine.id}`, { method: "DELETE" });
  }

  return {
    routineIds: nextRoutineIds,
    habitIds: orderedSelectedIds(
      standaloneHabitIds.filter((habitId) => !coveredHabitIds.has(habitId)),
      state.habits,
    ),
  };
}

async function syncModeReservations(modeId, previousDates, nextDates) {
  const previous = new Set(sortReservedDates(previousDates));
  const next = new Set(sortReservedDates(nextDates));

  for (const date of previous) {
    if (next.has(date)) {
      continue;
    }
    await request(`/api/routine-mode-overrides/${date}`, {
      method: "PUT",
      body: { modeId: null },
    });
  }

  for (const date of next) {
    await request(`/api/routine-mode-overrides/${date}`, {
      method: "PUT",
      body: { modeId },
    });
  }
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
    if (!response?.user) {
      throw new Error("authRequiredTitle");
    }
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

function resetTransientUiState() {
  if (state.quickCreateKind === "routine") {
    clearRouteFormDraft(routineFormKey("", "quick-create"));
  }
  state.accountMenuOpen = false;
  state.homeQuickActionsOpen = false;
  state.quickCreateKind = "";
  state.modeDatePicker = null;
  state.habitPicker = null;
}

function syncRouteFromHash() {
  resetTransientUiState();
  const hash = location.hash ? location.hash.slice(1) : "/today";
  const parsed = parseHashRoute(hash);
  state.routePath = ROUTE_META[parsed.pathname] ? parsed.pathname : "/today";
  state.activeTab = ROUTE_META[state.routePath].tab;
  if (state.routePath === "/today" && parsed.date) {
    state.selectedHomeDate = parsed.date;
  }
  if (!location.hash) {
    history.replaceState(null, "", `#${buildTodayRoute(state.selectedHomeDate)}`);
  }
  renderShellOnly();
}

function navigate(route) {
  resetTransientUiState();
  const target = normalizeHashPath(route);
  const nextHash = target === "/today" ? buildTodayRoute(state.selectedHomeDate) : target;
  if (location.hash !== `#${nextHash}`) {
    location.hash = nextHash;
    return;
  }
  render();
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
  const [today, habits, tasks, routines, modes, calendar, stats] = await Promise.all([
    request(todayPath),
    request("/api/habits"),
    request("/api/tasks"),
    request("/api/routines"),
    request("/api/routine-modes"),
    request(`/api/calendar?month=${state.selectedMonth}`),
    request(`/api/stats?range=${state.statsRange}`),
  ]);

  state.today = today;
  state.habits = habits.habits;
  state.tasks = tasks.tasks;
  state.routines = routines.routines;
  state.modes = modes.modes;
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
  if (!state.selectedMonth) {
    state.selectedMonth = state.today.date.slice(0, 7);
  }
}

async function reorderHabits(draggedId, targetId) {
  const visibleIds = getHomeHabits().map((habit) => habit.id);
  const baseIds = state.habits.map((habit) => habit.id);
  const nextVisibleIds = moveId(visibleIds, draggedId, targetId);
  const visibleIdSet = new Set(nextVisibleIds);
  let visibleIndex = 0;
  const nextIds = baseIds.map((id) => (visibleIdSet.has(id) ? nextVisibleIds[visibleIndex++] : id));
  await request("/api/habits/reorder", { method: "POST", body: { habitIds: nextIds } });
  await refreshAll();
}

function render() {
  renderShellOnly();
  renderPanels();
  wireDynamicBehaviors();
}

function renderShellOnly() {
  applyPreferences();
  applyShellText();
  document.documentElement.lang = state.locale;
  document.title = `마이 플래너 | ${tx(ROUTE_META[state.routePath].titleKey, "마이 플래너")}`;
  document.querySelector(".account-menu-shell")?.classList.toggle("is-open", state.accountMenuOpen);
  const accountTrigger = document.getElementById("account-menu-trigger");
  if (accountTrigger instanceof HTMLElement) {
    accountTrigger.setAttribute("aria-expanded", String(state.accountMenuOpen));
  }
  document.body.classList.toggle("is-overlay-open", Boolean(state.quickCreateKind || state.modeDatePicker || state.habitPicker));

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

  const accountName = document.getElementById("account-menu-name");
  const accountMeta = document.getElementById("account-menu-meta");
  if (accountName instanceof HTMLElement) {
    accountName.textContent = state.currentUser?.displayName || state.currentUser?.email || tx("accountMenu", "계정");
  }
  if (accountMeta instanceof HTMLElement) {
    accountMeta.textContent = state.currentUser?.email || tx("accountMenuMeta", "계정 / 설정 / 통계");
  }
}

function renderPanels() {
  const renderers = {
    today: renderTodayPage,
    account: renderAccountPage,
    modes: renderModesPage,
    habits: renderHabitsPage,
    tasks: renderTasksPage,
    routines: renderRoutinesPage,
    calendar: renderCalendarPage,
    stats: renderStatsPage,
    settings: renderSettingsPage,
  };

  for (const [name, renderPanel] of Object.entries(renderers)) {
    setPanel(name, name === state.activeTab ? renderPanel() : "");
  }
}

function renderTodayPage() {
  if (!state.today) return "";
  const rate = Number(state.today.summary.habitRate || 0);
  const clampedRate = Math.max(0, Math.min(rate, 1));
  const tasks = getHomeTasks();
  const homeHabitGroups = getHomeHabitGroups();
  const achievementTier = resolveAchievementTier(clampedRate);
  return `<div class="route-screen-layout home-screen">
    <section class="content-card home-date-card">
      <h2 class="home-date-month" data-home-month-label>${esc(formatMonthLabel(state.selectedHomeDate))}</h2>
      <div class="home-date-rail" data-home-date-rail>
        ${buildHomeRailDates(state.selectedHomeDate).map((date) => renderDateChip(date)).join("")}
      </div>
    </section>

    <section class="content-card achievement-card achievement-card--${achievementTier} ${rate >= 1 ? "is-complete" : ""} ${state.achievementPulseUntil > Date.now() ? "is-pulsing" : ""}" style="--achievement-progress:${String(clampedRate)};">
      <div class="achievement-copy">
        <div class="achievement-label-row">
          <p class="eyebrow">${esc(tx("homeSummaryRate", "달성률"))}</p>
          <span class="achievement-milestone" role="img" aria-label="${esc(resolveMilestone(clampedRate))}" title="${esc(resolveMilestone(clampedRate))}">${esc(resolveMilestoneEmoji(clampedRate))}</span>
        </div>
        <h3 data-achievement-number="${String(rate)}">${esc(percent(rate))}</h3>
      </div>
      <div class="achievement-stats today-home-summary-row">
        ${renderAchievementStat(tx("completedHabits", "완료"), `${state.today.summary.completedHabits}/${state.today.summary.totalHabits}`)}
        ${renderAchievementStat(tx("remainingHabits", "남음"), String(state.today.summary.remainingHabits), "remaining")}
        ${renderAchievementStat(tx("streak", "연속"), summarizeTodayStreak(state.today.habits))}
      </div>
      <div class="achievement-liquid" aria-hidden="true">
        <span class="achievement-wave achievement-wave--back"></span>
        <span class="achievement-wave achievement-wave--front"></span>
        ${
          clampedRate >= 0.75
            ? `<span class="achievement-spark achievement-spark--left"></span>
        <span class="achievement-spark achievement-spark--center"></span>
        <span class="achievement-spark achievement-spark--right"></span>`
            : ""
        }
        ${rate >= 1 ? `<span class="achievement-confetti"></span>` : ""}
      </div>
    </section>

    ${renderDailyNoteCard()}

    <section class="home-panels">
      <div class="segmented home-panel-tabs">
        <button class="segment-button ${state.homePanel === "tasks" ? "is-selected" : ""}" type="button" data-action="select-home-panel" data-panel="tasks">${esc(tx("tasksMenu", "할 일 보기"))}</button>
        <button class="segment-button ${state.homePanel === "habits" ? "is-selected" : ""}" type="button" data-action="select-home-panel" data-panel="habits">${esc(tx("habitsMenu", "습관 보기"))}</button>
      </div>
      <div class="home-carousel" data-home-carousel>
        <section class="content-card home-panel" data-home-panel="tasks">
          <div class="route-inline-head home-panel-head">
            <div>
              <h3>${esc(tx("tasksMenu", "할 일 보기"))}</h3>
              <p class="muted">${esc(tx("homeTaskCopy", "메인에서 선택한 날짜의 할 일과 보관함 할 일을 함께 관리합니다."))}</p>
            </div>
            <div class="segmented home-filter-tabs">
              <button class="segment-button ${state.homeTaskFilter === "scheduled" ? "is-selected" : ""}" type="button" data-action="set-home-task-filter" data-filter="scheduled">${esc(tx("scheduledTasks", "선택 날짜"))}</button>
              <button class="segment-button ${state.homeTaskFilter === "inbox" ? "is-selected" : ""}" type="button" data-action="set-home-task-filter" data-filter="inbox">${esc(tx("inbox", "보관함"))}</button>
            </div>
          </div>
          <div class="home-task-list">
            ${tasks.length ? tasks.map(renderHomeTaskRow).join("") : renderEmptyState(tx("noTasksHome", "이 구역에 표시할 할 일이 없습니다."))}
          </div>
        </section>

        <section class="content-card home-panel" data-home-panel="habits">
          ${
            homeHabitGroups.length
              ? `<section class="today-home-board today-home-board--dense home-habit-board">
            <div class="today-home-board-head">
              <span>${esc(tx("order", "순서"))}</span>
              <span>${esc(tx("habitsMenu", "습관 보기"))}</span>
              <span>${esc(tx("status", "상태"))}</span>
            </div>
            <div class="today-home-board-body">
              ${homeHabitGroups.map((group) => renderHomeHabitSection(group)).join("")}
            </div>
          </section>`
              : renderEmptyState(tx("noHabitsHome", "이 날짜에 표시할 습관이 없습니다. 습관을 만들고 루틴이나 모드에 포함하면 메인에 나타납니다."))
          }
        </section>
      </div>
    </section>

    ${renderHomeFab()}
    ${renderQuickCreateLayer()}
  </div>`;
}

function renderAccountPage() {
  if (!state.authAvailable) {
    return `<div class="route-screen-layout route-screen-layout--settings">
      <section class="content-card">
        <div class="route-section-heading">
          <h3>${esc(tx("authUnavailableTitle", "인증을 사용할 수 없습니다."))}</h3>
          <p class="muted">${esc(tx("authUnavailableCopy", "현재 환경에서는 인증 기능을 제공하지 않습니다."))}</p>
        </div>
      </section>
    </div>`;
  }

  if (!state.currentUser) {
    return `<div class="route-screen-layout route-screen-layout--settings">
      <section class="content-card">
        <div class="route-section-heading">
          <h3>${esc(tx("authRequiredTitle", "로그인이 필요합니다."))}</h3>
          <p class="muted">${esc(tx("authRequiredCopy", "계속하려면 로그인하세요."))}</p>
        </div>
        <div class="actions">
          <a class="btn" href="/login">${esc(tx("login", "로그인"))}</a>
        </div>
      </section>
    </div>`;
  }

  return `<div class="route-screen-layout route-screen-layout--settings">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(tx("accountMenu", "계정"))}</h3>
        <p class="muted">${esc(tx("accountCopy", "현재 로그인한 계정 정보와 세션 동작을 확인합니다."))}</p>
      </div>
      <div class="route-list-stack">
        <article class="route-list-stack-item">
          <div class="route-list-row">
            <div class="route-list-copy">
              <strong>${esc(state.currentUser.displayName || tx("accountMenu", "계정"))}</strong>
              <span>${esc(state.currentUser.email || "")}</span>
            </div>
            <span class="route-list-meta">${esc(formatUserRole(state.currentUser.role))}</span>
          </div>
        </article>
        <article class="route-list-stack-item">
          <div class="route-list-row">
            <div class="route-list-copy">
              <strong>${esc(tx("status", "상태"))}</strong>
              <span>${esc(formatUserStatus(state.currentUser.status))}</span>
            </div>
          </div>
        </article>
      </div>
      <div class="actions">
        <button class="btn-soft" type="button" data-action="logout">${esc(tx("logout", "로그아웃"))}</button>
      </div>
    </section>
    <section class="content-card route-guide-card">
      <div class="route-section-heading">
        <h3>${esc(tx("plannerGuideTitle", "개념 안내"))}</h3>
        <p class="muted">${esc(tx("plannerGuideCopy", "할 일, 습관, 루틴, 모드를 같은 기준으로 이해할 수 있게 핵심 차이만 정리했습니다."))}</p>
      </div>
      <div class="route-guide-grid">
        ${renderGuideCard(tx("guideTaskTitle", "할 일"), tx("guideTaskCopy", "할 일은 한 번 처리하고 끝나는 항목입니다."))}
        ${renderGuideCard(tx("guideHabitTitle", "습관"), tx("guideHabitCopy", "습관은 반복해서 기록하는 기본 단위입니다."))}
        ${renderGuideCard(tx("guideRoutineTitle", "루틴"), tx("guideRoutineCopy", "루틴은 여러 습관을 함께 다시 쓰기 위한 저장 묶음입니다."))}
        ${renderGuideCard(tx("guideModeTitle", "모드"), tx("guideModeCopy", "모드는 상황에 따라 루틴과 개별 습관을 조합해 저장한 구성입니다."))}
      </div>
    </section>
    <section class="content-card route-guide-card">
      <div class="route-section-heading">
        <h3>${esc(tx("plannerGuideTitle", "개념 안내"))}</h3>
        <p class="muted">${esc(tx("plannerGuideCopy", "할 일, 습관, 루틴, 모드를 같은 기준으로 이해할 수 있게 핵심 차이만 정리했습니다."))}</p>
      </div>
      <div class="route-guide-grid">
        ${renderGuideCard(tx("guideTaskTitle", "할 일"), tx("guideTaskCopy", "할 일은 한 번 처리하고 끝나는 항목입니다."))}
        ${renderGuideCard(tx("guideHabitTitle", "습관"), tx("guideHabitCopy", "습관은 반복해서 기록하는 기본 단위입니다."))}
        ${renderGuideCard(tx("guideRoutineTitle", "루틴"), tx("guideRoutineCopy", "루틴은 여러 습관을 함께 다시 쓰기 위한 저장 묶음입니다."))}
        ${renderGuideCard(tx("guideModeTitle", "모드"), tx("guideModeCopy", "모드는 상황에 따라 루틴과 개별 습관을 조합해 저장한 구성입니다."))}
      </div>
    </section>
  </div>`;
}

function renderHabitsPage() {
  return `<div class="route-screen-layout route-screen-layout--library">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(tx("habitsMenu", "습관 보기"))}</h3>
        <p class="muted">${esc(tx("listOnlyHint", "이 화면은 목록에 집중합니다. 새 항목은 홈의 + 버튼에서 추가합니다."))}</p>
        ${renderGuideText(tx("habitsGuide", "습관은 반복해서 기록하는 가장 작은 단위입니다. 루틴과 모드에서 이 습관을 조합해 사용합니다."))}
      </div>
      <div class="route-list-stack">
        ${state.habits.length ? state.habits.map(renderHabitCard).join("") : renderEmptyState(tx("noHabits", "저장된 습관이 없습니다."), [{ route: "/today", label: tx("goHome", "홈으로 이동") }])}
      </div>
    </section>
  </div>`;
}

renderHabitsPage = function () {
  return `<div class="route-screen-layout route-screen-layout--library">
    <section class="content-card">
      <div class="route-list-stack">
        ${state.habits.length ? state.habits.map(renderHabitCard).join("") : renderEmptyState(tx("noHabits", ""), [{ route: "/today", label: tx("goHome", "") }])}
      </div>
    </section>
  </div>`;
};

function renderModesPage() {
  const createFormKey = modeFormKey();
  return `<div class="route-screen-layout">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(tx("modesMenu", "모드 설정"))}</h3>
        <p class="muted">${esc(tx("modesCopy", "모드는 여행모드나 약속모드처럼 상황에 맞는 루틴과 개별 습관 묶음입니다."))}</p>
        ${renderGuideText(tx("modesGuide", "날짜를 고르거나 매주 주중, 매주 주말처럼 예약해 상황별 구성을 빠르게 바꿀 수 있습니다."))}
      </div>
      <details class="route-list-card route-list-card--collapsible route-list-card--mode route-list-card--mode-create" data-mode-details-key="${createFormKey}" ${shouldOpenModeDetails(createFormKey) ? "open" : ""}>
        <summary class="route-list-row route-list-row--wide route-list-summary">
          <div class="route-list-copy route-list-copy--routine">
            <strong>${esc(tx("createMode", "모드 만들기"))}</strong>
            <span class="routine-inline-empty">${esc(tx("modesCopy", "모드는 여행모드나 약속모드처럼 상황에 맞는 루틴과 개별 습관 묶음입니다."))}</span>
          </div>
          <span class="route-list-side">
            <span class="route-list-meta">${esc(tx("modesTitle", "모드"))}</span>
            <span class="route-list-toggle" aria-hidden="true">⌄</span>
          </span>
        </summary>
        <form class="form-grid route-inline-form" data-form="mode-create" data-form-key="${createFormKey}">
          ${modeFields("create", null)}
          <div class="actions">
            <button class="btn" type="submit">${esc(tx("createMode", "모드 만들기"))}</button>
          </div>
        </form>
      </details>
      <div class="route-list-stack">
        ${
          state.modes.length
            ? state.modes.map(renderModeCard).join("")
            : renderEmptyState(tx("noModes", "저장된 모드가 없습니다."), [
                { route: "/routines", label: tx("manageRoutines", "루틴 관리") },
                { route: "/habits", label: tx("manageHabits", "습관 관리") },
              ])
        }
      </div>
    </section>
    ${renderModeDatePickerLayer()}
    ${renderHabitPickerLayer()}
  </div>`;
}

renderModesPage = function () {
  const createFormKey = modeFormKey();
  return `<div class="route-screen-layout">
    <section class="content-card">
      <details class="route-list-card route-list-card--collapsible route-list-card--mode route-list-card--mode-create" data-mode-details-key="${createFormKey}" ${shouldOpenModeDetails(createFormKey) ? "open" : ""}>
        <summary class="route-list-row route-list-row--wide route-list-summary">
          <div class="route-list-copy route-list-copy--routine">
            <strong>${esc(tx("createMode", ""))}</strong>
            <span class="routine-inline-empty">${esc(tx("modesCopy", ""))}</span>
          </div>
          <span class="route-list-side">
            <span class="route-list-meta">${esc(tx("modesTitle", ""))}</span>
            <span class="route-list-toggle" aria-hidden="true">⌄</span>
          </span>
        </summary>
        <form class="form-grid route-inline-form" data-form="mode-create" data-form-key="${createFormKey}">
          ${modeFields("create", null)}
          <div class="actions">
            <button class="btn" type="submit">${esc(tx("createMode", ""))}</button>
          </div>
        </form>
      </details>
      <div class="route-list-stack">
        ${
          state.modes.length
            ? state.modes.map(renderModeCard).join("")
            : renderEmptyState(tx("noModes", ""), [
                { route: "/routines", label: tx("manageRoutines", "") },
                { route: "/habits", label: tx("manageHabits", "") },
              ])
        }
      </div>
    </section>
    ${renderModeDatePickerLayer()}
    ${renderHabitPickerLayer()}
  </div>`;
};

function renderTasksPage() {
  return `<div class="route-screen-layout route-screen-layout--library">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(tx("tasksMenu", "할 일 보기"))}</h3>
        <p class="muted">${esc(tx("listOnlyHint", "이 화면은 목록에 집중합니다. 새 항목은 홈의 + 버튼에서 추가합니다."))}</p>
      </div>
      <div class="route-list-stack">
        ${state.tasks.length ? state.tasks.map(renderTaskCard).join("") : `<p class="muted">${esc(tx("noTasks", "저장된 할 일이 없습니다."))}</p>`}
      </div>
    </section>
  </div>`;
}

function renderRoutinesPage() {
  const visibleRoutines = getVisibleRoutines();
  return `<div class="route-screen-layout route-screen-layout--library">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(tx("routinesMenu", "루틴 보기"))}</h3>
        <p class="muted">${esc(tx("listOnlyHint", "이 화면은 목록에 집중합니다. 새 항목은 홈의 + 버튼에서 추가합니다."))}</p>
        ${renderGuideText(tx("routinesGuide", "루틴은 저장된 습관 묶음입니다. 원본 습관을 바꾸지 않고 여러 습관을 함께 묶어 씁니다."))}
      </div>
      <div class="route-list-stack">
        ${
          visibleRoutines.length
            ? visibleRoutines.map(renderRoutineCard).join("")
            : renderEmptyState(tx("noRoutines", "저장된 루틴이 없습니다."), [
                { route: "/habits", label: tx("manageHabits", "습관 관리") },
                { route: "/today", label: tx("goHome", "홈으로 이동") },
              ])
        }
      </div>
    </section>
    ${renderHabitPickerLayer()}
  </div>`;
}

renderRoutinesPage = function () {
  const visibleRoutines = getVisibleRoutines();
  return `<div class="route-screen-layout route-screen-layout--library">
    <section class="content-card">
      <div class="route-list-stack">
        ${
          visibleRoutines.length
            ? visibleRoutines.map(renderRoutineCard).join("")
            : renderEmptyState(tx("noRoutines", ""), [
                { route: "/habits", label: tx("manageHabits", "") },
                { route: "/today", label: tx("goHome", "") },
              ])
        }
      </div>
    </section>
    ${renderHabitPickerLayer()}
  </div>`;
};

function renderCalendarPage() {
  const days = state.calendar?.days ?? [];
  const monthGrid = buildCalendarMonthGrid(state.selectedMonth, days);
  const monthRate = days.length === 0 ? 0 : days.reduce((sum, day) => sum + Number(day.habitProgressRate || 0), 0) / days.length;
  return `<div class="route-screen-layout">
    <section class="content-card calendar-shell">
      <div class="route-inline-head">
        <h3>${esc(formatMonthTitle(state.selectedMonth))}</h3>
        <div class="actions">
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="-1">${esc(tx("weekPrevious", "이전 주"))}</button>
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="1">${esc(tx("weekNext", "다음 주"))}</button>
        </div>
      </div>
      <div class="calendar-focus-inline">
        <article class="calendar-focus-rate" style="--progress:${String(monthRate)};">
          <div class="calendar-focus-copy">
            <span>${esc(tx("homeSummaryRate", "달성률"))}</span>
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
        ${buildLocalizedWeekdayLabels().map((label) => `<span class="weekday">${label}</span>`).join("")}
        ${monthGrid.length ? monthGrid.map((cell) => renderCalendarMonthCell(cell)).join("") : `<p class="muted">${esc(tx("noCalendarData", "표시할 캘린더 데이터가 없습니다."))}</p>`}
      </div>
    </section>
  </div>`;
}

renderCalendarPage = function () {
  const days = state.calendar?.days ?? [];
  const monthGrid = buildCalendarMonthGrid(state.selectedMonth, days);
  const monthRate = days.length === 0 ? 0 : days.reduce((sum, day) => sum + Number(day.habitProgressRate || 0), 0) / days.length;
  return `<div class="route-screen-layout">
    <section class="content-card calendar-shell">
      <div class="route-inline-head">
        <h3>${esc(formatMonthTitle(state.selectedMonth))}</h3>
        <div class="actions">
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="-1">${esc(tx("weekPrevious", ""))}</button>
          <button class="btn-soft compact-action" type="button" data-action="shift-month" data-direction="1">${esc(tx("weekNext", ""))}</button>
        </div>
      </div>
      <div class="calendar-focus-inline">
        <article class="calendar-focus-rate" style="--progress:${String(monthRate)};">
          <div class="calendar-water-pool calendar-water-pool--cell calendar-water-pool--focus" aria-hidden="true">
            <div class="calendar-water-fill">
              <span class="calendar-water-wave calendar-water-wave--back"></span>
              <span class="calendar-water-wave calendar-water-wave--front"></span>
            </div>
          </div>
          <div class="calendar-focus-copy">
            <span>${esc(tx("homeSummaryRate", ""))}</span>
            <strong>${esc(percent(monthRate))}</strong>
          </div>
        </article>
      </div>
      <div class="calendar-grid calendar-grid--month">
        ${buildLocalizedWeekdayLabels().map((label) => `<span class="weekday">${label}</span>`).join("")}
        ${monthGrid.length ? monthGrid.map((cell) => renderCalendarMonthCell(cell)).join("") : `<p class="muted">${esc(tx("noCalendarData", ""))}</p>`}
      </div>
    </section>
  </div>`;
};

function renderStatsPage() {
  const summary = state.stats?.summary;
  return `<div class="route-screen-layout">
    <section class="content-card">
      <div class="route-inline-head">
        <h3>${esc(tx("stats", "통계"))}</h3>
        <div class="segmented">
          <button class="segment-button ${state.statsRange === "week" ? "is-selected" : ""}" type="button" data-action="stats-range" data-range="week">주</button>
          <button class="segment-button ${state.statsRange === "month" ? "is-selected" : ""}" type="button" data-action="stats-range" data-range="month">월</button>
        </div>
      </div>
      ${summary ? `<div class="summary-grid">
        ${summaryCard(tx("statsDaily", "일간 달성률"), percent(summary.dailyRate))}
        ${summaryCard(tx("statsWeekly", "주간 달성률"), percent(summary.weeklyRate))}
        ${summaryCard(tx("statsMonthly", "월간 달성률"), percent(summary.monthlyRate))}
        ${summaryCard(tx("statsCurrentStreak", "현재 연속"), String(summary.currentStreak))}
        ${summaryCard(tx("statsBestStreak", "최고 연속"), String(summary.bestStreak))}
        ${summaryCard(tx("taskCompletion", "할 일 완료"), `${summary.taskCompletion.completed}/${summary.taskCompletion.total}`)}
      </div>
      <div class="route-list-stack" style="margin-top:16px;">
        ${summary.topHabits.map((habit) => `<article class="route-list-card"><div class="route-list-row"><div class="route-list-copy"><strong>${esc(habit.name)}</strong><span>${habit.completedDays}/${habit.trackedDays}${esc(tx("daysSuffix", "일"))}</span></div><strong>${percent(habit.completionRate)}</strong></div></article>`).join("") || `<p class="muted">${esc(tx("noStatsData", "표시할 통계가 없습니다."))}</p>`}
      </div>` : `<p class="muted">${esc(tx("noStatsData", "표시할 통계가 없습니다."))}</p>`}
    </section>
  </div>`;
}

function renderSettingsPage() {
  return `<div class="route-screen-layout route-screen-layout--settings">
    <section class="content-card">
      <div class="route-section-heading"><h3>${esc(tx("displaySettings", "보기 설정"))}</h3></div>
      <div class="settings-control-list">
        <label class="settings-control-item"><span>${esc(tx("language", "언어"))}</span><select id="settings-locale">${Object.entries(LANGUAGE_LABELS).map(([value, label]) => `<option value="${value}" ${value === state.locale ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(tx("theme", "테마"))}</span><select id="settings-theme">${THEME_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.themePreset ? "selected" : ""}>${esc(tx(option.labelKey, option.value))}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(tx("density", "밀도"))}</span><select id="settings-density">${DENSITY_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.density ? "selected" : ""}>${esc(tx(option.labelKey, option.value))}</option>`).join("")}</select></label>
      </div>
    </section>
  </div>`;
}

renderAccountPage = function () {
  if (!state.authAvailable) {
    return `<div class="route-screen-layout route-screen-layout--settings">
      <section class="content-card">
        <div class="route-section-heading">
          <h3>${esc(tx("authUnavailableTitle", "인증을 사용할 수 없습니다."))}</h3>
          <p class="muted">${esc(tx("authUnavailableCopy", "현재 환경에서는 인증 기능을 제공하지 않습니다."))}</p>
        </div>
      </section>
    </div>`;
  }

  if (!state.currentUser) {
    return `<div class="route-screen-layout route-screen-layout--settings">
      <section class="content-card">
        <div class="route-section-heading">
          <h3>${esc(tx("authRequiredTitle", "로그인이 필요합니다."))}</h3>
          <p class="muted">${esc(tx("authRequiredCopy", "계속하려면 로그인해주세요."))}</p>
        </div>
        <div class="actions">
          <a class="btn" href="/login">${esc(tx("login", "로그인"))}</a>
        </div>
      </section>
    </div>`;
  }

  return `<div class="route-screen-layout route-screen-layout--settings">
    <section class="content-card">
      <div class="route-section-heading">
        <h3>${esc(tx("accountMenu", "계정"))}</h3>
        <p class="muted">${esc(tx("accountCopy", "현재 로그인한 계정 정보와 세션 동작을 확인합니다."))}</p>
      </div>
      <div class="route-list-stack">
        <article class="route-list-stack-item">
          <div class="route-list-row">
            <div class="route-list-copy">
              <strong>${esc(state.currentUser.displayName || tx("accountMenu", "계정"))}</strong>
              <span>${esc(state.currentUser.email || "")}</span>
            </div>
            <span class="route-list-meta">${esc(formatUserRole(state.currentUser.role))}</span>
          </div>
        </article>
        <article class="route-list-stack-item">
          <div class="route-list-row">
            <div class="route-list-copy">
              <strong>${esc(tx("status", "상태"))}</strong>
              <span>${esc(formatUserStatus(state.currentUser.status))}</span>
            </div>
          </div>
        </article>
      </div>
      <div class="actions">
        <button class="btn-soft" type="button" data-action="logout">${esc(tx("logout", "로그아웃"))}</button>
      </div>
    </section>
  </div>`;
};

renderSettingsPage = function () {
  return `<div class="route-screen-layout route-screen-layout--settings">
    <section class="content-card">
      <div class="route-section-heading"><h3>${esc(tx("displaySettings", "보기 설정"))}</h3></div>
      <div class="settings-control-list">
        <label class="settings-control-item"><span>${esc(tx("language", "언어"))}</span><select id="settings-locale">${Object.entries(LANGUAGE_LABELS).map(([value, label]) => `<option value="${value}" ${value === state.locale ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(tx("theme", "테마"))}</span><select id="settings-theme">${THEME_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.themePreset ? "selected" : ""}>${esc(tx(option.labelKey, option.value))}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(tx("density", "간격"))}</span><select id="settings-density">${DENSITY_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.density ? "selected" : ""}>${esc(tx(option.labelKey, option.value))}</option>`).join("")}</select></label>
      </div>
    </section>
    <section class="content-card route-guide-card">
      <div class="route-section-heading">
        <h3>${esc(tx("plannerGuideTitle", "개념 안내"))}</h3>
        <p class="muted">${esc(tx("plannerGuideCopy", "할 일, 습관, 루틴, 모드를 같은 기준으로 이해할 수 있게 핵심 차이만 정리했습니다."))}</p>
      </div>
      <div class="route-guide-grid">
        ${renderGuideCard(tx("guideTaskTitle", "할 일"), tx("guideTaskCopy", "할 일은 한 번 처리하고 끝나는 항목입니다."))}
        ${renderGuideCard(tx("guideHabitTitle", "습관"), tx("guideHabitCopy", "습관은 반복해서 기록하는 기본 단위입니다."))}
        ${renderGuideCard(tx("guideRoutineTitle", "루틴"), tx("guideRoutineCopy", "루틴은 여러 습관을 함께 다시 쓰기 위한 저장 묶음입니다."))}
        ${renderGuideCard(tx("guideModeTitle", "모드"), tx("guideModeCopy", "모드는 상황에 따라 루틴과 개별 습관을 조합해 저장한 구성입니다."))}
      </div>
    </section>
  </div>`;
};

renderTodayPage = function () {
  if (!state.today) return "";
  const rate = Number(state.today.summary.habitRate || 0);
  const clampedRate = Math.max(0, Math.min(rate, 1));
  const tasks = getHomeTasks();
  const homeHabitGroups = getHomeHabitGroups();
  const achievementTier = resolveAchievementTier(clampedRate);
  return `<div class="route-screen-layout home-screen">
    <section class="content-card home-date-card">
      <h2 class="home-date-month" data-home-month-label>${esc(formatMonthLabel(state.selectedHomeDate))}</h2>
      <div class="home-date-rail" data-home-date-rail>
        ${buildHomeRailDates(state.selectedHomeDate).map((date) => renderDateChip(date)).join("")}
      </div>
    </section>

    <section class="content-card achievement-card achievement-card--${achievementTier} ${rate >= 1 ? "is-complete" : ""} ${state.achievementPulseUntil > Date.now() ? "is-pulsing" : ""}" style="--achievement-progress:${String(clampedRate)};">
      <div class="achievement-copy">
        <div class="achievement-label-row">
          <p class="eyebrow">${esc(tx("homeSummaryRate", "달성률"))}</p>
          <span class="achievement-milestone" role="img" aria-label="${esc(resolveMilestone(clampedRate))}" title="${esc(resolveMilestone(clampedRate))}">${esc(resolveMilestoneEmoji(clampedRate))}</span>
        </div>
        <h3 data-achievement-number="${String(rate)}">${esc(percent(rate))}</h3>
      </div>
      <div class="achievement-stats today-home-summary-row">
        ${renderAchievementStat(tx("completedHabits", "완료"), `${state.today.summary.completedHabits}/${state.today.summary.totalHabits}`)}
        ${renderAchievementStat(tx("remainingHabits", "남음"), String(state.today.summary.remainingHabits), "remaining")}
        ${renderAchievementStat(tx("streak", "연속"), summarizeTodayStreak(state.today.habits))}
      </div>
      <div class="achievement-liquid" aria-hidden="true">
        <span class="achievement-wave achievement-wave--back"></span>
        <span class="achievement-wave achievement-wave--front"></span>
        ${
          clampedRate >= 0.75
            ? `<span class="achievement-spark achievement-spark--left"></span>
        <span class="achievement-spark achievement-spark--center"></span>
        <span class="achievement-spark achievement-spark--right"></span>`
            : ""
        }
        ${rate >= 1 ? `<span class="achievement-confetti"></span>` : ""}
      </div>
    </section>

    ${renderDailyNoteCard()}

    <section class="home-panels">
      <div class="segmented home-panel-tabs">
        <button class="segment-button ${state.homePanel === "tasks" ? "is-selected" : ""}" type="button" data-action="select-home-panel" data-panel="tasks">${esc(tx("tasksMenu", "할 일 보기"))}</button>
        <button class="segment-button ${state.homePanel === "habits" ? "is-selected" : ""}" type="button" data-action="select-home-panel" data-panel="habits">${esc(tx("habitsMenu", "습관 보기"))}</button>
      </div>
      <div class="home-carousel" data-home-carousel>
        <section class="content-card home-panel" data-home-panel="tasks">
          <div class="route-inline-head home-panel-head">
            <div>
              <h3>${esc(tx("tasksMenu", "할 일 보기"))}</h3>
              <p class="muted">${esc(tx("homeTaskCopy", "메인에서 선택한 날짜의 할 일과 보관함 할 일을 함께 관리합니다."))}</p>
            </div>
            <div class="segmented home-filter-tabs">
              <button class="segment-button ${state.homeTaskFilter === "scheduled" ? "is-selected" : ""}" type="button" data-action="set-home-task-filter" data-filter="scheduled">${esc(tx("scheduledTasks", "선택 날짜"))}</button>
              <button class="segment-button ${state.homeTaskFilter === "inbox" ? "is-selected" : ""}" type="button" data-action="set-home-task-filter" data-filter="inbox">${esc(tx("inbox", "보관함"))}</button>
            </div>
          </div>
          <div class="home-task-list">
            ${tasks.length ? tasks.map(renderHomeTaskRow).join("") : renderEmptyState(tx("noTasksHome", "이 구역에 표시할 할 일이 없습니다."))}
          </div>
        </section>

        <section class="content-card home-panel" data-home-panel="habits">
          ${
            homeHabitGroups.length
              ? `<section class="today-home-board today-home-board--dense home-habit-board">
            <div class="today-home-board-head">
              <span>${esc(tx("order", "순서"))}</span>
              <span>${esc(tx("habitsMenu", "습관 보기"))}</span>
              <span>${esc(tx("status", "상태"))}</span>
            </div>
            <div class="today-home-board-body">
              ${homeHabitGroups.map((group) => renderHomeHabitSection(group)).join("")}
            </div>
          </section>`
              : renderEmptyState(tx("noHabitsHome", "이 날짜에 표시할 습관이 없습니다. 습관을 만들고 루틴이나 모드에 포함하면 메인에 나타납니다."))
          }
        </section>
      </div>
    </section>

    ${renderHomeFab()}
    ${renderQuickCreateLayer()}
  </div>`;
};

renderSettingsPage = function () {
  return `<div class="route-screen-layout route-screen-layout--settings">
    <section class="content-card">
      <div class="route-section-heading"><h3>${esc(tx("displaySettings", "보기 설정"))}</h3></div>
      <div class="settings-control-list">
        <label class="settings-control-item"><span>${esc(tx("language", "언어"))}</span><select id="settings-locale">${Object.entries(LANGUAGE_LABELS).map(([value, label]) => `<option value="${value}" ${value === state.locale ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(tx("theme", "테마"))}</span><select id="settings-theme">${THEME_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.themePreset ? "selected" : ""}>${esc(tx(option.labelKey, option.value))}</option>`).join("")}</select></label>
        <label class="settings-control-item"><span>${esc(tx("density", "간격"))}</span><select id="settings-density">${DENSITY_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.density ? "selected" : ""}>${esc(tx(option.labelKey, option.value))}</option>`).join("")}</select></label>
      </div>
    </section>
    <section class="content-card route-guide-card">
      <div class="route-section-heading">
        <h3>${esc(tx("plannerGuideTitle", "개념 안내"))}</h3>
        <p class="muted">${esc(tx("plannerGuideCopy", "할 일, 습관, 루틴, 모드를 같은 기준으로 이해할 수 있게 핵심 차이만 정리했습니다."))}</p>
      </div>
      <div class="route-guide-grid">
        ${renderGuideCard(tx("guideTaskTitle", "할 일"), tx("guideTaskCopy", "할 일은 한 번 처리하고 끝나는 항목입니다."))}
        ${renderGuideCard(tx("guideHabitTitle", "습관"), tx("guideHabitCopy", "습관은 반복해서 기록하는 기본 단위입니다."))}
        ${renderGuideCard(tx("guideRoutineTitle", "루틴"), tx("guideRoutineCopy", "루틴은 여러 습관을 함께 다시 쓰기 위한 저장 묶음입니다."))}
        ${renderGuideCard(tx("guideModeTitle", "모드"), tx("guideModeCopy", "모드는 상황에 따라 루틴과 개별 습관을 조합해 저장한 구성입니다."))}
      </div>
    </section>
    <section class="content-card route-guide-card">
      <div class="route-section-heading">
        <h3>${esc(tx("faqTitle", "자주 묻는 질문"))}</h3>
        <p class="muted">${esc(tx("faqCopy", "할 일, 습관, 루틴, 모드가 비슷해 보일 때 가장 먼저 헷갈리는 질문만 짧게 정리했습니다."))}</p>
      </div>
      <div class="route-faq-grid">
        ${renderFaqItem(tx("faqTaskHabitQ", "할 일과 습관은 무엇이 다른가요?"), tx("faqTaskHabitA", "할 일은 한 번 처리하고 끝나는 항목이고, 습관은 날짜를 기준으로 반복해서 기록하는 항목입니다."))}
        ${renderFaqItem(tx("faqRoutineModeQ", "루틴과 모드는 무엇이 다른가요?"), tx("faqRoutineModeA", "루틴은 습관 묶음을 다시 쓰기 위한 저장본이고, 모드는 상황에 따라 루틴과 개별 습관을 함께 조합한 구성입니다."))}
        ${renderFaqItem(tx("faqModeScheduleQ", "날짜 예약, 주중, 주말은 언제 쓰면 되나요?"), tx("faqModeScheduleA", "날짜 예약은 여행이나 약속처럼 특정 기간에만 쓰고, 주중과 주말은 반복되는 생활 흐름을 나눌 때 씁니다."))}
        ${renderFaqItem(tx("faqTimeLogQ", "시간 기록 습관은 어디에서 확인하나요?"), tx("faqTimeLogA", "메인 습관 보기에서 해당 습관을 누르면 시간이 기록되고, 최근 기록 시간이 같은 줄에 바로 표시됩니다."))}
        ${renderFaqItem(tx("faqDailyNoteQ", "날짜 메모는 어디에 쓰나요?"), tx("faqDailyNoteA", "날짜 메모는 선택한 날짜에만 붙는 짧은 기록입니다. 일정 메모, 컨디션 기록, 하루 회고를 간단히 남길 때 쓰면 됩니다."))}
        ${renderFaqItem(tx("faqAchievementQ", "달성률은 어떻게 계산되나요?"), tx("faqAchievementA", "선택한 날짜에 노출된 습관 중 완료된 습관의 비율로 계산됩니다."))}
      </div>
    </section>
  </div>`;
};

function renderDateChip(date) {
  const weekday = new Intl.DateTimeFormat(state.locale, { weekday: "short" }).format(new Date(`${date}T12:00:00`));
  const selected = date === state.selectedHomeDate;
  const today = date === dateKeyLocal();
  return `<button class="home-date-chip ${selected ? "is-selected" : ""} ${today ? "is-today" : ""}" type="button" data-action="pick-date" data-date="${date}">
    <span>${esc(weekday)}</span>
    <strong>${esc(String(Number(date.slice(-2))))}</strong>
  </button>`;
}

function renderAchievementStat(label, value, extraClass = "") {
  return `<article class="today-home-summary-card achievement-stat ${extraClass ? `achievement-stat--${extraClass}` : ""}">
    <span>${esc(label)}</span>
    <strong>${esc(value)}</strong>
  </article>`;
}

function renderDailyNoteCard() {
  const dailyNote = state.today?.dailyNote ?? { note: null, updatedAt: null };
  const meta = dailyNote.updatedAt
    ? `${tx("dailyNoteUpdatedAt", "마지막 저장")} ${formatDateTime(dailyNote.updatedAt)}`
    : tx("dailyNoteMetaEmpty", "이 날짜에 저장된 메모가 아직 없습니다.");
  return `<form class="content-card home-note-card" data-form="daily-note-save">
    <div class="route-inline-head home-note-head">
      <div>
        <h3>${esc(tx("dailyNoteTitle", "날짜 메모"))}</h3>
        <p class="muted">${esc(tx("dailyNoteCopy", "선택한 날짜에 짧은 메모를 남기고 나중에 다시 확인합니다."))}</p>
      </div>
      <span class="home-note-date">${esc(formatCompactDate(state.selectedHomeDate))}</span>
    </div>
    <textarea name="note" rows="4" aria-label="${esc(tx("dailyNoteTitle", "날짜 메모"))}" placeholder="${esc(tx("dailyNotePlaceholder", "이 날짜에 남길 짧은 메모를 적어 주세요."))}">${esc(dailyNote.note || "")}</textarea>
    <div class="actions home-note-actions">
      <span class="home-note-meta muted">${esc(meta)}</span>
      <button class="btn" type="submit">${esc(tx("save", "저장"))}</button>
    </div>
  </form>`;
}

renderDailyNoteCard = function () {
  const dailyNote = state.today?.dailyNote ?? { note: null, updatedAt: null };
  const meta = dailyNote.updatedAt
    ? `${tx("dailyNoteUpdatedAt", "")} ${formatDateTime(dailyNote.updatedAt)}`
    : tx("dailyNoteMetaEmpty", "");
  return `<details class="content-card home-note-card home-note-card--collapsible" data-home-note-details ${state.homeNoteOpen ? "open" : ""}>
    <summary class="home-note-summary">
      <div class="home-note-summary-copy">
        <h3>${esc(tx("dailyNoteTitle", ""))}</h3>
        <p class="muted">${esc(tx("dailyNoteCopy", ""))}</p>
      </div>
      <span class="home-note-summary-side">
        <span class="home-note-date">${esc(formatCompactDate(state.selectedHomeDate))}</span>
        <span class="home-note-toggle" aria-hidden="true">⌄</span>
      </span>
    </summary>
    <form class="home-note-form" data-form="daily-note-save">
      <textarea name="note" rows="4" aria-label="${esc(tx("dailyNoteTitle", ""))}" placeholder="${esc(tx("dailyNotePlaceholder", ""))}">${esc(dailyNote.note || "")}</textarea>
      <div class="actions home-note-actions">
        <span class="home-note-meta muted">${esc(meta)}</span>
        <button class="btn" type="submit">${esc(tx("save", ""))}</button>
      </div>
    </form>
  </details>`;
};

function renderHomeTaskRow(task) {
  const done = task.status === "done";
  const meta = task.dueDate ? formatCompactDate(task.dueDate) : tx("inbox", "보관함");
  return `<article class="home-task-row ${done ? "is-done" : ""}">
    <button class="home-task-toggle ${done ? "is-done" : ""}" type="button" data-action="toggle-task-status" data-task-id="${task.id}" aria-label="${esc(done ? tx("markPending", "미완료로 변경") : tx("markDone", "완료 처리"))}">${done ? "✓" : ""}</button>
    <div class="home-task-copy">
      <strong>${esc(task.title)}</strong>
      <span>${esc(task.note || meta)}</span>
    </div>
    <span class="state-pill ${done ? "is-success" : ""}">${esc(meta)}</span>
  </article>`;
}

function renderHomeHabitSection(group) {
  return `<section class="home-habit-section" style="--section-accent:${esc(group.accentColor)};">
    <div class="home-habit-section-head">
      <span class="home-habit-section-title">${esc(group.title)}</span>
    </div>
    <div class="home-habit-section-list">
      ${group.habits.map((habit, index) => renderHomeHabitRow(habit, index, group.key)).join("")}
    </div>
  </section>`;
}

function renderHomeHabitRow(habit, index, groupKey = "group") {
  const instanceKey = `${groupKey}:${habit.id}:${index}`;
  return `<article class="home-board-group ${habit.isScheduledToday ? "" : "is-inactive"}" data-home-habit-row="${esc(instanceKey)}" data-home-habit-id="${habit.id}" draggable="true" style="--routine-accent:${esc(habit.color)};">
    <div class="home-board-row home-board-row--item home-board-row--${habit.trackingType} ${habit.isScheduledToday ? "" : "home-board-row--inactive"} ${habit.isComplete ? "is-complete" : ""}">
      <div class="home-board-cell home-board-cell--index">
        <span class="home-order-badge">${esc(String(index + 1))}</span>
      </div>
      <div class="home-board-cell home-board-cell--main">
        <div class="home-routine-main">
          <span class="home-routine-accent"></span>
          <div class="home-item-copy">
            <strong>${esc(habit.name)}</strong>
          </div>
        </div>
      </div>
      <div class="home-board-cell home-board-cell--status">
        ${renderHomeHabitStatus(habit)}
      </div>
    </div>
  </article>`;
}

function renderHomeHabitStatus(habit) {
  if (!habit.isScheduledToday) {
    return `<span class="state-pill">${esc(habit.startsLater ? tx("startsLater", "시작 전") : tx("notScheduledToday", "오늘 미배정"))}</span>`;
  }
  return habit.trackingType === "binary"
    ? renderBinaryAction(habit)
    : habit.trackingType === "count"
      ? renderCountAction(habit)
      : renderTimeAction(habit);
}

function renderBinaryAction(habit) {
  return `<button class="home-status-toggle home-status-toggle--emoji ${habit.isComplete ? "is-complete" : ""}" type="button" data-action="toggle-binary" data-habit-id="${habit.id}" data-complete="${String(habit.isComplete)}" aria-label="${esc(habit.isComplete ? tx("markPending", "미완료로 변경") : tx("markDone", "완료 처리"))}">${habit.isComplete ? "✅" : "○"}</button>`;
}

function renderCountAction(habit) {
  const targetCount = Math.max(1, Number(habit.targetCount || 1));
  const label = habit.currentValue >= targetCount ? "✅" : `${Math.max(0, habit.currentValue)}/${targetCount}`;
  return `<button class="home-progress-chip home-progress-chip--cycle ${habit.isComplete ? "is-complete" : ""}" type="button" data-action="cycle-count" data-habit-id="${habit.id}" aria-label="${esc(`${habit.name} ${label}`)}">${esc(label)}</button>`;
}

function renderTimeAction(habit) {
  const entries = Array.isArray(habit.timeEntries) ? [...habit.timeEntries] : [];
  const latestEntry = entries.at(-1);
  return `<button class="home-time-toggle ${latestEntry ? "is-complete" : ""}" type="button" data-action="log-time" data-habit-id="${habit.id}" aria-label="${esc(latestEntry ? tx("markPending", "미완료로 변경") : tx("logTime", "시간 기록"))}">
    <span>${esc(latestEntry ? formatTimeEntry(latestEntry) : tx("logTime", "시간 기록"))}</span>
  </button>`;
}

function renderColorPaletteField(selectedColor, fallbackColor) {
  const normalized = String(selectedColor || fallbackColor || PRESET_COLORS[0]).toLowerCase();
  const palette = PRESET_COLORS.includes(normalized) ? PRESET_COLORS : [normalized, ...PRESET_COLORS];
  return `<fieldset class="route-color-field" style="grid-column:1 / -1;">
    <legend>${esc(tx("color", "색상"))}</legend>
    <div class="color-swatch-list" role="radiogroup" aria-label="${esc(tx("color", "색상"))}">
      ${palette
        .map(
          (color) => `<label class="color-swatch-option" title="${esc(color)}">
        <input type="radio" name="color" value="${esc(color)}" ${color === normalized ? "checked" : ""} />
        <span class="color-swatch" style="--swatch:${esc(color)};"></span>
      </label>`,
        )
        .join("")}
    </div>
  </fieldset>`;
}

function renderHabitCard(habit) {
  return `<details class="route-list-card route-list-card--collapsible route-list-card--habit" style="--habit-card-accent:${esc(habit.color)};">
    <summary class="route-list-row route-list-row--wide route-list-summary route-list-summary--habit">
      <div class="route-list-copy route-list-copy--habit">
        <div class="habit-card-title-row">
          <span class="habit-card-color" aria-hidden="true"></span>
          <strong>${esc(habit.name)}</strong>
        </div>
        <span class="habit-card-meta">${esc([habit.tag, habit.startDate, `${habit.currentStreak}/${habit.bestStreak} ${tx("streak", "연속")}`].filter(Boolean).join(" | "))}</span>
      </div>
      <span class="route-list-side">
        <span class="route-list-meta route-list-meta--habit">${esc(trackingTypeLabel(habit.trackingType))}</span>
        <span class="route-list-toggle" aria-hidden="true">⌄</span>
      </span>
    </summary>
    <form class="form-grid route-inline-form" data-form="habit-update" data-id="${habit.id}">
      ${habitFields(habit)}
      <div class="actions">
        <button class="btn" type="submit">${esc(tx("save", "저장"))}</button>
        <button class="btn-danger" type="button" data-action="delete-habit" data-delete-id="${habit.id}">${esc(tx("delete", "삭제"))}</button>
      </div>
    </form>
  </details>`;
}

function renderTaskCard(task) {
  return `<article class="route-list-card">
    <div class="route-list-row route-list-row--wide">
      <div class="route-list-copy">
        <strong>${esc(task.title)}</strong>
        <span>${esc(task.note || task.dueDate || tx("unscheduled", "미정"))}</span>
      </div>
      <span class="state-pill ${task.status === "done" ? "is-success" : ""}">${esc(task.status === "done" ? tx("taskDone", "완료") : tx("taskPending", "미완료"))}</span>
    </div>
    <form class="form-grid route-inline-form" data-form="task-update" data-id="${task.id}">
      ${taskFields(task)}
      <div class="actions">
        <button class="btn" type="submit">${esc(tx("save", "저장"))}</button>
        <button class="btn-soft" type="button" data-action="toggle-task-status" data-task-id="${task.id}">${esc(task.status === "done" ? tx("markPending", "미완료로 변경") : tx("markDone", "완료 처리"))}</button>
        <button class="btn-danger" type="button" data-action="delete-task" data-delete-id="${task.id}">${esc(tx("delete", "삭제"))}</button>
      </div>
    </form>
  </article>`;
}

function renderRoutineCard(routine) {
  const previewItems = Array.isArray(routine.habits) ? routine.habits : [];
  const accentColor = routine.color || previewItems[0]?.color || "#64748b";
  return `<details class="route-list-card route-list-card--collapsible route-list-card--routine" style="--routine-card-accent:${esc(accentColor)};">
    <summary class="route-list-row route-list-row--wide route-list-summary">
      <div class="route-list-copy route-list-copy--routine">
        <strong>${esc(getRoutineDisplayName(routine))}</strong>
        <span class="routine-inline-list" title="${esc(
          previewItems.length ? previewItems.map((habit) => habit.name).join(", ") : tx("noHabitsSelected", "선택한 습관이 없습니다."),
        )}">
          ${
            previewItems.length
              ? previewItems
                  .map(
                    (habit) =>
                      `<span class="routine-inline-item" style="--routine-item-color:${esc(habit.color)};">${esc(habit.name)}</span>`,
                  )
                  .join("")
              : `<span class="routine-inline-empty">${esc(tx("noHabitsSelected", "선택한 습관이 없습니다."))}</span>`
          }
        </span>
      </div>
      <span class="route-list-side">
        <span class="route-list-meta">${esc(`${previewItems.length} ${tx("habits", "습관")}`)}</span>
        <span class="route-list-toggle" aria-hidden="true">⌄</span>
      </span>
    </summary>
    <form class="form-grid route-inline-form" data-form="routine-update" data-id="${routine.id}" data-form-key="${routineFormKey(routine.id)}">
      ${routineFields(routine)}
      <div class="actions">
        <button class="btn" type="submit">${esc(tx("save", "저장"))}</button>
        <button class="btn-danger" type="button" data-action="delete-routine" data-delete-id="${routine.id}">${esc(tx("delete", "삭제"))}</button>
      </div>
    </form>
  </details>`;
}

function renderModeCard(mode) {
  const reservationSummary = formatModeScheduleBadge(mode.activeDays ?? [], mode.reservedDates ?? [], mode.id);
  const previewItems = [
    ...(Array.isArray(mode.routines)
      ? mode.routines.map((routine) => ({
          name: getRoutineDisplayName(routine),
          color: routine.color || routine.habits?.[0]?.color || "#6366f1",
        }))
      : []),
    ...(Array.isArray(mode.habits)
      ? mode.habits.map((habit) => ({
          name: habit.name,
          color: habit.color || "#64748b",
        }))
      : []),
  ];
  const accentColor = previewItems[0]?.color || "#64748b";
  const previewTitle = previewItems.length
    ? previewItems.map((item) => item.name).join(", ")
    : tx("noHabitsSelected", "선택한 습관이 없습니다.");
  const previewMarkup =
    previewItems.length > 3
      ? `<span class="mode-preview-compact">${esc(previewItems[0].name)}</span><span class="mode-preview-more">+${previewItems.length - 1}</span>`
      : previewItems.length
        ? previewItems
            .map(
              (item) =>
                `<span class="routine-inline-item" style="--routine-item-color:${esc(item.color)};">${esc(item.name)}</span>`,
            )
            .join("")
        : `<span class="routine-inline-empty">${esc(tx("noHabitsSelected", "선택한 습관이 없습니다."))}</span>`;
  const formKey = modeFormKey(mode.id);
  return `<details class="route-list-card route-list-card--collapsible route-list-card--mode" style="--routine-card-accent:${esc(accentColor)};" data-mode-details-key="${formKey}" ${shouldOpenModeDetails(formKey) ? "open" : ""}>
    <summary class="route-list-row route-list-row--wide route-list-summary route-list-summary--mode">
      <div class="route-list-copy route-list-copy--routine route-list-copy--mode">
        <div class="mode-card-title-row">
          <strong>${esc(mode.name)}</strong>
          <span class="route-list-toggle" aria-hidden="true">⌄</span>
          <span class="pill mode-card-pill">${esc(reservationSummary)}</span>
        </div>
        <span class="routine-inline-list routine-inline-list--mode" title="${esc(previewTitle)}">
          ${previewMarkup}
        </span>
        <span class="mode-card-meta">${esc(`${tx("routines", "루틴")} ${mode.routines.length} · ${tx("habits", "습관")} ${mode.habits.length}`)}</span>
      </div>
    </summary>
    <form class="form-grid route-inline-form" data-form="mode-update" data-id="${mode.id}" data-form-key="${formKey}">
      ${modeFields(mode)}
      <div class="actions">
        <button class="btn" type="submit">${esc(tx("save", "저장"))}</button>
        <button class="btn-danger" type="button" data-action="delete-mode" data-delete-id="${mode.id}">${esc(tx("delete", "삭제"))}</button>
      </div>
    </form>
  </details>`;
}

renderHomeTaskRow = function (task) {
  const done = task.status === "done";
  const meta = task.dueDate ? formatCompactDate(task.dueDate) : tx("inbox", "보관함");
  return `<article class="home-task-row ${done ? "is-done" : ""}">
    <button class="home-task-toggle ${done ? "is-done" : ""}" type="button" data-action="toggle-task-status" data-task-id="${task.id}" aria-label="${esc(done ? tx("markPending", "미완료로 변경") : tx("markDone", "완료 처리"))}">${esc(done ? tx("doneShort", "완료") : tx("checkShort", "체크"))}</button>
    <div class="home-task-copy">
      <strong>${esc(task.title)}</strong>
      <span>${esc(task.note || meta)}</span>
    </div>
    <span class="state-pill ${done ? "is-success" : ""}">${esc(meta)}</span>
  </article>`;
};

renderBinaryAction = function (habit) {
  return `<button class="home-status-toggle home-status-toggle--emoji ${habit.isComplete ? "is-complete" : ""}" type="button" data-action="toggle-binary" data-habit-id="${habit.id}" data-complete="${String(habit.isComplete)}" aria-label="${esc(habit.isComplete ? tx("markPending", "미완료로 변경") : tx("markDone", "완료 처리"))}">${habit.isComplete ? "✅" : "○"}</button>`;
};

function habitFields(habit = null) {
  const trackingType = habit?.trackingType ?? "binary";
  return `
    <label>
      <span>${esc(tx("name", "이름"))}</span>
      <input name="name" type="text" required value="${esc(habit?.name || "")}" />
    </label>
    <label>
      <span>${esc(tx("tag", "태그"))}</span>
      <input name="tag" type="text" value="${esc(habit?.tag || "")}" />
    </label>
    ${renderColorPaletteField(habit?.color, "#16a34a")}
    <label>
      <span>${esc(tx("type", "유형"))}</span>
      <select name="trackingType">
        ${trackingOption("binary", trackingType)}
        ${trackingOption("count", trackingType)}
        ${trackingOption("time", trackingType)}
      </select>
    </label>
    <label>
      <span>${esc(tx("targetValue", "목표"))}</span>
      <input name="targetCount" type="number" min="1" step="1" value="${esc(String(habit?.targetCount ?? 1))}" />
    </label>
    <label>
      <span>${esc(tx("startDate", "시작일"))}</span>
      <input name="startDate" type="date" value="${esc(habit?.startDate || state.selectedHomeDate || dateKeyLocal())}" />
    </label>`;
}

function taskFields(task = null) {
  return `
    <label>
      <span>${esc(tx("title", "제목"))}</span>
      <input name="title" type="text" required value="${esc(task?.title || "")}" />
    </label>
    <label>
      <span>${esc(tx("dueDate", "마감일"))}</span>
      <input name="dueDate" type="date" value="${esc(task?.dueDate || "")}" />
    </label>
    <label style="grid-column:1 / -1;">
      <span>${esc(tx("note", "메모"))}</span>
      <textarea name="note" rows="3">${esc(task?.note || "")}</textarea>
    </label>
    <label>
      <span>${esc(tx("status", "상태"))}</span>
      <select name="status">
        <option value="pending" ${task?.status !== "done" ? "selected" : ""}>${esc(tx("taskPending", "미완료"))}</option>
        <option value="done" ${task?.status === "done" ? "selected" : ""}>${esc(tx("taskDone", "완료"))}</option>
      </select>
    </label>`;
}

function routineFields(routineOrKind = null, maybeRoutine = null) {
  const routine =
    routineOrKind && typeof routineOrKind === "object" && !Array.isArray(routineOrKind)
      ? routineOrKind
      : maybeRoutine;
  const formScope = typeof routineOrKind === "string" ? routineOrKind : "create";
  const formKey = routine?.id ? routineFormKey(routine.id) : routineFormKey("", formScope);
  const draft = getRouteFormDraft(formKey);
  const selectedHabitIds = orderedSelectedIds(draft?.habitIds ?? routine?.habitIds ?? routine?.habits?.map((habit) => habit.id) ?? [], state.habits);
  return `
    <label>
      <span>${esc(tx("name", "이름"))}</span>
      <input name="name" type="text" required value="${esc(draft?.name ?? routine?.name ?? "")}" />
    </label>
    ${renderColorPaletteField(draft?.color ?? routine?.color, "#2563eb")}
    ${renderHabitPickerField(formKey, selectedHabitIds)}`;
}

function modeFields(modeOrKind = null, maybeMode = null) {
  const mode =
    modeOrKind && typeof modeOrKind === "object" && !Array.isArray(modeOrKind) ? modeOrKind : maybeMode;
  const formScope = typeof modeOrKind === "string" ? modeOrKind : "create";
  const formKey = mode?.id ? modeFormKey(mode.id) : modeFormKey("", formScope);
  const draft = getRouteFormDraft(formKey);
  const selectedHabitIds = orderedSelectedIds(draft?.habitIds ?? mode?.habits?.map((habit) => habit.id) ?? [], state.habits);
  const routineSelections = getModeRoutineSelections(mode, draft);
  const visibleRoutines = getVisibleRoutines();
  const reservedDates = getModeReservedDates(formKey, draft?.reservedDates ?? mode?.reservedDates ?? []);
  const scheduleType = draft?.scheduleType ?? getModeScheduleType(draft?.activeDays ?? mode?.activeDays ?? [], mode?.id ?? "");
  const scheduleSummary = formatModeScheduleSummary(draft?.activeDays ?? mode?.activeDays ?? [], reservedDates, mode?.id ?? "");
  return `
    <label>
      <span>${esc(tx("name", "이름"))}</span>
      <input name="name" type="text" required value="${esc(draft?.name ?? mode?.name ?? "")}" />
    </label>
    <p class="helper-text muted" style="grid-column:1 / -1;">${esc(tx("modeScheduleGuide", "이 모드를 날짜로 직접 예약하거나 매주 주중, 주말 반복으로 적용할 수 있습니다."))}</p>
    <fieldset class="mode-schedule-field" style="grid-column:1 / -1;">
      <legend>${esc(tx("modeSchedule", "적용 방식"))}</legend>
      <div class="mode-schedule-list">
        ${
          mode?.id === "mode-default"
            ? `<label class="choice-item">
          <input type="radio" name="scheduleType" value="everyday" checked />
          <span>${esc(tx("everyday", "매일"))}</span>
        </label>`
            : ""
        }
        <label class="choice-item">
          <input type="radio" name="scheduleType" value="dates" ${scheduleType === "dates" ? "checked" : ""} />
          <span>${esc(tx("specificDates", "날짜 선택"))}</span>
        </label>
        <label class="choice-item">
          <input type="radio" name="scheduleType" value="weekdays" ${scheduleType === "weekdays" ? "checked" : ""} />
          <span>${esc(tx("weeklyWeekdays", "매주 주중"))}</span>
        </label>
        <label class="choice-item">
          <input type="radio" name="scheduleType" value="weekends" ${scheduleType === "weekends" ? "checked" : ""} />
          <span>${esc(tx("weeklyWeekends", "매주 주말"))}</span>
        </label>
      </div>
    </fieldset>
    <p class="helper-text muted" style="grid-column:1 / -1;">${esc(tx("modeRoutineGuide", "루틴 전체를 쓰거나 루틴 안의 일부 습관만 골라 이 모드에 담을 수 있습니다."))}</p>
    <fieldset style="grid-column:1 / -1;">
      <legend>${esc(tx("routines", "루틴"))}</legend>
      <div class="choice-list--stacked">
        ${
          visibleRoutines.length
            ? visibleRoutines
                .map(
                  (routine) => `<article class="route-list-card route-list-card--actionable">
              <div class="route-list-row route-list-row--wide">
                <div class="route-list-copy">
                  <strong>${esc(getRoutineDisplayName(routine))}</strong>
                  <span>${esc(`${(routine.habits ?? []).length} ${tx("habits", "습관")}`)}</span>
                </div>
              </div>
              <div class="choice-list--stacked">
                ${
                  Array.isArray(routine.habits) && routine.habits.length
                    ? routine.habits
                        .map(
                          (habit) => `<label class="choice-item">
                    <input type="checkbox" name="routineHabit:${routine.id}" value="${habit.id}" ${(routineSelections[routine.id] ?? []).includes(habit.id) ? "checked" : ""} />
                    <span>${esc(habit.name)}</span>
                  </label>`,
                        )
                        .join("")
                    : `<p class="muted">${esc(tx("noHabits", "저장된 습관이 없습니다."))}</p>`
                }
              </div>
            </article>`,
                )
                .join("")
            : `<p class="muted">${esc(tx("noRoutines", "저장된 루틴이 없습니다."))}</p>`
        }
      </div>
    </fieldset>
    ${renderHabitPickerField(formKey, selectedHabitIds)}
    <fieldset style="grid-column:1 / -1;">
      <legend>${esc(tx("reservedDates", "예약 날짜"))}</legend>
      <div class="mode-date-field-row">
        <button class="btn-soft" type="button" data-action="open-mode-date-picker" data-form-key="${formKey}" ${scheduleType === "dates" ? "" : "disabled"}>${esc(tx("dateSettings", "날짜 설정"))}</button>
        <span class="route-list-meta">${esc(scheduleSummary)}</span>
      </div>
      <div class="mode-date-chip-list">
        ${
          scheduleType !== "dates"
            ? `<span class="pill">${esc(scheduleSummary)}</span>`
            : reservedDates.length
            ? reservedDates.map((date) => `<span class="pill">${esc(formatCompactDate(date))}</span>`).join("")
            : `<span class="muted">${esc(tx("noReservedDates", "예약된 날짜가 없습니다."))}</span>`
        }
      </div>
      ${scheduleType === "dates" ? reservedDates.map((date) => `<input type="hidden" name="reservedDates" value="${esc(date)}" />`).join("") : ""}
    </fieldset>`;
}

modeFields = function (modeOrKind = null, maybeMode = null) {
  const mode =
    modeOrKind && typeof modeOrKind === "object" && !Array.isArray(modeOrKind) ? modeOrKind : maybeMode;
  const formScope = typeof modeOrKind === "string" ? modeOrKind : "create";
  const formKey = mode?.id ? modeFormKey(mode.id) : modeFormKey("", formScope);
  const draft = getRouteFormDraft(formKey);
  const selectedHabitIds = orderedSelectedIds(draft?.habitIds ?? mode?.habits?.map((habit) => habit.id) ?? [], state.habits);
  const routineSelections = getModeRoutineSelections(mode, draft);
  const visibleRoutines = getVisibleRoutines();
  const reservedDates = getModeReservedDates(formKey, draft?.reservedDates ?? mode?.reservedDates ?? []);
  const scheduleType = draft?.scheduleType ?? getModeScheduleType(draft?.activeDays ?? mode?.activeDays ?? [], mode?.id ?? "");
  const scheduleSummary =
    scheduleType === "everyday"
      ? tx("everyday", "매일")
      : scheduleType === "weekdays"
        ? tx("weeklyWeekdays", "매주 주중")
        : scheduleType === "weekends"
          ? tx("weeklyWeekends", "매주 주말")
          : formatReservedDatesSummary(reservedDates);
  return `
    <label>
      <span>${esc(tx("name", "이름"))}</span>
      <input name="name" type="text" required value="${esc(draft?.name ?? mode?.name ?? "")}" />
    </label>
    <p class="helper-text muted" style="grid-column:1 / -1;">${esc(tx("modeScheduleGuide", "이 모드를 날짜로 직접 예약하거나 매주 주중, 주말 반복으로 적용할 수 있습니다."))}</p>
    <fieldset class="mode-schedule-field" style="grid-column:1 / -1;">
      <legend>${esc(tx("reservedDates", "예약 날짜"))}</legend>
      <input type="hidden" name="scheduleType" value="${esc(scheduleType)}" />
      <div class="segmented mode-schedule-segment">
        <button class="segment-button ${scheduleType === "everyday" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="everyday">${esc(tx("everyday", "매일"))}</button>
        <button class="segment-button ${scheduleType === "dates" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="dates">${esc(tx("specificDates", "날짜로 예약"))}</button>
        <button class="segment-button ${scheduleType === "weekdays" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="weekdays">${esc(tx("weeklyWeekdays", "매주 주중"))}</button>
        <button class="segment-button ${scheduleType === "weekends" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="weekends">${esc(tx("weeklyWeekends", "매주 주말"))}</button>
      </div>
      <div class="mode-schedule-summary">
        <span class="pill">${esc(scheduleSummary)}</span>
        ${scheduleType === "dates" ? `<button class="btn-soft" type="button" data-action="open-mode-date-picker" data-form-key="${formKey}">${esc(tx("dateSettings", "날짜 설정"))}</button>` : ""}
      </div>
      <div class="mode-date-chip-list">
        ${
          scheduleType !== "dates"
            ? ""
            : reservedDates.length
              ? reservedDates.map((date) => `<span class="pill">${esc(formatCompactDate(date))}</span>`).join("")
              : `<span class="muted">${esc(tx("noReservedDates", "예약된 날짜가 없습니다."))}</span>`
        }
      </div>
      ${scheduleType === "dates" ? reservedDates.map((date) => `<input type="hidden" name="reservedDates" value="${esc(date)}" />`).join("") : ""}
    </fieldset>
    <p class="helper-text muted" style="grid-column:1 / -1;">${esc(tx("modeRoutineGuide", "루틴 전체를 쓰거나 루틴 안의 일부 습관만 골라 이 모드에 넣을 수 있습니다."))}</p>
    <fieldset style="grid-column:1 / -1;">
      <legend>${esc(tx("routines", "루틴"))}</legend>
      <div class="choice-list--stacked">
        ${
          visibleRoutines.length
            ? visibleRoutines
                .map(
                  (routine) => `<article class="route-list-card route-list-card--actionable">
              <div class="route-list-row route-list-row--wide">
                <div class="route-list-copy">
                  <strong>${esc(getRoutineDisplayName(routine))}</strong>
                  <span>${esc(`${(routine.habits ?? []).length} ${tx("habits", "습관")}`)}</span>
                </div>
              </div>
              <div class="choice-list--stacked">
                ${
                  Array.isArray(routine.habits) && routine.habits.length
                    ? routine.habits
                        .map(
                          (habit) => `<label class="choice-item">
                    <input type="checkbox" name="routineHabit:${routine.id}" value="${habit.id}" ${(routineSelections[routine.id] ?? []).includes(habit.id) ? "checked" : ""} />
                    <span>${esc(habit.name)}</span>
                  </label>`,
                        )
                        .join("")
                    : `<p class="muted">${esc(tx("noHabits", "저장된 습관이 없습니다."))}</p>`
                }
              </div>
            </article>`,
                )
                .join("")
            : `<p class="muted">${esc(tx("noRoutines", "저장된 루틴이 없습니다."))}</p>`
        }
      </div>
    </fieldset>
    ${renderHabitPickerField(formKey, selectedHabitIds)}`;
};

modeFields = function (modeOrKind = null, maybeMode = null) {
  const mode =
    modeOrKind && typeof modeOrKind === "object" && !Array.isArray(modeOrKind) ? modeOrKind : maybeMode;
  const formScope = typeof modeOrKind === "string" ? modeOrKind : "create";
  const formKey = mode?.id ? modeFormKey(mode.id) : modeFormKey("", formScope);
  const draft = getRouteFormDraft(formKey);
  const selectedHabitIds = orderedSelectedIds(draft?.habitIds ?? mode?.habits?.map((habit) => habit.id) ?? [], state.habits);
  const routineSelections = getModeRoutineSelections(mode, draft);
  const visibleRoutines = getVisibleRoutines();
  const reservedDates = getModeReservedDates(formKey, draft?.reservedDates ?? mode?.reservedDates ?? []);
  const scheduleType = draft?.scheduleType ?? getModeScheduleType(draft?.activeDays ?? mode?.activeDays ?? [], mode?.id ?? "");
  const scheduleSummary =
    scheduleType === "everyday"
      ? tx("everyday", "")
      : scheduleType === "weekdays"
        ? tx("weeklyWeekdays", "")
        : scheduleType === "weekends"
          ? tx("weeklyWeekends", "")
          : formatReservedDatesSummary(reservedDates);
  return `
    <label>
      <span>${esc(tx("name", ""))}</span>
      <input name="name" type="text" required value="${esc(draft?.name ?? mode?.name ?? "")}" />
    </label>
    <fieldset class="mode-schedule-field" style="grid-column:1 / -1;">
      <legend>${esc(tx("reservedDates", ""))}</legend>
      <input type="hidden" name="scheduleType" value="${esc(scheduleType)}" />
      <div class="segmented mode-schedule-segment">
        <button class="segment-button ${scheduleType === "everyday" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="everyday">${esc(tx("everyday", ""))}</button>
        <button class="segment-button ${scheduleType === "dates" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="dates">${esc(tx("specificDates", ""))}</button>
        <button class="segment-button ${scheduleType === "weekdays" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="weekdays">${esc(tx("weeklyWeekdays", ""))}</button>
        <button class="segment-button ${scheduleType === "weekends" ? "is-selected" : ""}" type="button" data-action="set-mode-schedule" data-form-key="${formKey}" data-schedule-type="weekends">${esc(tx("weeklyWeekends", ""))}</button>
      </div>
      <div class="mode-schedule-summary">
        <span class="pill">${esc(scheduleSummary)}</span>
      </div>
      ${scheduleType === "dates" ? reservedDates.map((date) => `<input type="hidden" name="reservedDates" value="${esc(date)}" />`).join("") : ""}
    </fieldset>
    <p class="helper-text muted" style="grid-column:1 / -1;">${esc(tx("modeRoutineGuide", ""))}</p>
    <fieldset style="grid-column:1 / -1;">
      <legend>${esc(tx("routines", ""))}</legend>
      <div class="choice-list--stacked">
        ${
          visibleRoutines.length
            ? visibleRoutines
                .map(
                  (routine) => `<article class="route-list-card route-list-card--actionable">
              <div class="route-list-row route-list-row--wide">
                <div class="route-list-copy">
                  <strong>${esc(getRoutineDisplayName(routine))}</strong>
                  <span>${esc(`${(routine.habits ?? []).length} ${tx("habits", "")}`)}</span>
                </div>
              </div>
              <div class="choice-list--stacked">
                ${
                  Array.isArray(routine.habits) && routine.habits.length
                    ? routine.habits
                        .map(
                          (habit) => `<label class="choice-item">
                    <input type="checkbox" name="routineHabit:${routine.id}" value="${habit.id}" ${(routineSelections[routine.id] ?? []).includes(habit.id) ? "checked" : ""} />
                    <span>${esc(habit.name)}</span>
                  </label>`,
                        )
                        .join("")
                    : `<p class="muted">${esc(tx("noHabits", ""))}</p>`
                }
              </div>
            </article>`,
                )
                .join("")
            : `<p class="muted">${esc(tx("noRoutines", ""))}</p>`
        }
      </div>
    </fieldset>
    ${renderHabitPickerField(formKey, selectedHabitIds)}`;
};

function renderHabitPickerField(formKey, selectedHabitIds) {
  const selectedHabits = selectedItemsByIds(selectedHabitIds, state.habits);
  const summary = formatSelectionSummary(selectedHabits, tx("noHabitsSelected", "선택한 습관이 없습니다."));
  return `<fieldset class="habit-picker-field" style="grid-column:1 / -1;">
    <legend>${esc(tx("habits", "습관"))}</legend>
    <div class="habit-picker-field-row">
      <button class="btn-soft habit-picker-trigger" type="button" data-action="open-habit-picker" data-form-key="${esc(formKey)}" ${state.habits.length ? "" : "disabled"}>${esc(tx("selectHabits", "습관 선택"))}</button>
      <span class="route-list-meta">${esc(summary)}</span>
    </div>
    <div class="habit-picker-chip-list">
      ${
        selectedHabits.length
          ? selectedHabits.map((habit) => `<span class="pill">${esc(habit.name)}</span>`).join("")
          : `<span class="muted">${esc(state.habits.length ? tx("noHabitsSelected", "선택한 습관이 없습니다.") : tx("noHabits", "저장된 습관이 없습니다."))}</span>`
      }
    </div>
    ${selectedHabitIds.map((habitId) => `<input type="hidden" name="habitIds" value="${esc(habitId)}" />`).join("")}
  </fieldset>`;
}

function renderModeDatePickerLayer() {
  if (!state.modeDatePicker) {
    return "";
  }
  const monthGrid = buildCalendarMonthGrid(state.modeDatePicker.month, []);
  return `<div class="mode-date-layer">
    <button class="mode-date-backdrop" type="button" data-action="close-mode-date-picker" aria-label="${esc(tx("cancel", "취소"))}"></button>
    <section class="content-card mode-date-card">
      <div class="mode-date-head">
        <div>
          <p class="eyebrow">${esc(tx("reservedDates", "예약 날짜"))}</p>
          <h3>${esc(formatMonthTitle(state.modeDatePicker.month))}</h3>
        </div>
        <div class="actions">
          <button class="btn-soft compact-action" type="button" data-action="shift-mode-date-month" data-direction="-1">${esc(tx("weekPrevious", "이전 주"))}</button>
          <button class="btn-soft compact-action" type="button" data-action="shift-mode-date-month" data-direction="1">${esc(tx("weekNext", "다음 주"))}</button>
        </div>
      </div>
      <div class="calendar-grid calendar-grid--month mode-date-grid">
      ${buildLocalizedWeekdayLabels().map((label) => `<span class="weekday">${label}</span>`).join("")}
        ${monthGrid.map((cell) => renderModeDatePickerCell(cell)).join("")}
      </div>
      <div class="mode-date-chip-list mode-date-chip-list--selection">
        ${
          state.modeDatePicker.dates.length
            ? state.modeDatePicker.dates.map((date) => `<span class="pill">${esc(formatCompactDate(date))}</span>`).join("")
            : `<span class="muted">${esc(tx("noReservedDates", "예약된 날짜가 없습니다."))}</span>`
        }
      </div>
      <div class="actions">
        <button class="btn-soft" type="button" data-action="close-mode-date-picker">${esc(tx("cancel", "취소"))}</button>
        <button class="btn" type="button" data-action="apply-mode-date-picker">${esc(tx("apply", "적용"))}</button>
      </div>
    </section>
  </div>`;
}

function renderHabitPickerLayer() {
  if (!state.habitPicker) {
    return "";
  }
  return `<div class="mode-date-layer habit-picker-layer">
    <button class="mode-date-backdrop" type="button" data-action="close-habit-picker" aria-label="${esc(tx("cancel", "취소"))}"></button>
    <section class="content-card habit-picker-card">
      <div class="choice-list--stacked habit-picker-list">
        ${
          state.habits.length
            ? state.habits
                .map((habit) => {
                  const meta = [habit.tag, trackingTypeLabel(habit.trackingType), habit.startDate].filter(Boolean).join(" | ");
                  const checked = state.habitPicker?.selectedIds.includes(habit.id);
                  return `<label class="habit-picker-option home-board-group ${checked ? "is-selected" : ""}" data-action="toggle-habit-picker-choice" data-habit-id="${habit.id}" style="--routine-accent:${esc(habit.color)};">
            <span class="habit-picker-row">
              <span class="habit-picker-main">
                <span class="home-routine-accent"></span>
                <span class="home-item-copy">
                  <strong>${esc(habit.name)}</strong>
                  <span>${esc(meta || tx("habits", "습관"))}</span>
                </span>
              </span>
              <span class="habit-picker-status">
                <input type="checkbox" data-action="toggle-habit-picker-choice" data-habit-id="${habit.id}" ${checked ? "checked" : ""} aria-label="${esc(habit.name)}" />
              </span>
            </span>
          </label>`;
                })
                .join("")
            : `<p class="muted">${esc(tx("noHabits", "저장된 습관이 없습니다."))}</p>`
        }
      </div>
      <div class="actions habit-picker-actions">
        <button class="btn-soft" type="button" data-action="close-habit-picker">${esc(tx("cancel", "취소"))}</button>
        <button class="btn" type="button" data-action="apply-habit-picker">${esc(tx("apply", "적용"))}</button>
      </div>
    </section>
  </div>`;
}

function renderModeDatePickerCell(cell) {
  if (cell.type === "empty") {
    return '<span class="calendar-day-spacer" aria-hidden="true"></span>';
  }
  const date = cell.date;
  const selected = state.modeDatePicker?.dates.includes(date);
  const today = date === dateKeyLocal();
  return `<button class="mode-date-button ${selected ? "is-selected" : ""} ${today ? "is-today" : ""}" type="button" data-action="toggle-mode-date" data-date="${date}">
    <strong>${esc(String(Number(date.slice(-2))))}</strong>
  </button>`;
}

function renderHomeFab() {
  return `<div class="home-fab-shell ${state.homeQuickActionsOpen ? "is-open" : ""}">
    ${state.homeQuickActionsOpen ? `<button class="home-fab-backdrop" type="button" data-action="close-home-fab" aria-label="${esc(tx("closeMenu", "추가 메뉴 닫기"))}"></button>` : ""}
    <div class="home-fab-menu">
    <button class="btn home-fab-option" type="button" data-action="open-quick-create" data-kind="habit">${esc(tx("createHabit", "습관 만들기"))}</button>
    <button class="btn home-fab-option" type="button" data-action="open-quick-create" data-kind="task">${esc(tx("createTask", "할 일 만들기"))}</button>
    <button class="btn home-fab-option" type="button" data-action="open-quick-create" data-kind="routine">${esc(tx("createRoutine", "루틴 만들기"))}</button>
    </div>
    <button class="home-fab-trigger" type="button" data-action="toggle-home-fab" aria-label="${esc(state.homeQuickActionsOpen ? tx("closeMenu", "추가 메뉴 닫기") : tx("addMenu", "추가 메뉴 열기"))}">${state.homeQuickActionsOpen ? "\u00D7" : "+"}</button>
  </div>`;
}

function renderQuickCreateLayer() {
  if (!state.quickCreateKind) {
    return "";
  }

  const config = {
    habit: {
      cardClass: "quick-create-card quick-create-card--habit content-card",
      title: tx("createHabit", "습관 만들기"),
      copy: tx("quickCreateHabitCopy", "시간표를 벗어나지 않고 바로 습관을 만듭니다."),
      form: "habit-create",
      fields: habitFields(null),
    },
    task: {
      cardClass: "quick-create-card quick-create-card--task content-card",
      title: tx("createTask", "할 일 만들기"),
      copy: tx("quickCreateTaskCopy", "탭을 바꾸지 않고 바로 할 일을 추가합니다."),
      form: "task-create",
      fields: taskFields({ dueDate: state.homeTaskFilter === "scheduled" ? state.selectedHomeDate : "" }),
    },
    routine: {
      cardClass: "quick-create-card quick-create-card--routine content-card",
      title: tx("createRoutine", "루틴 만들기"),
      copy: tx("quickCreateRoutineCopy", "현재 습관 목록을 바탕으로 루틴 묶음을 바로 만듭니다."),
      form: "routine-create",
      formKey: routineFormKey("", "quick-create"),
      fields: routineFields("quick-create", null),
    },
  }[state.quickCreateKind];

  if (!config) {
    return "";
  }

  return `<div class="quick-create-layer">
    <button class="quick-create-backdrop" type="button" data-action="close-quick-create" aria-label="${esc(tx("cancel", "취소"))}"></button>
    <section class="${config.cardClass}">
      <div class="quick-create-head">
        <div>
          <p class="eyebrow">${esc(tx("today", "홈"))}</p>
          <h3>${esc(config.title)}</h3>
          <p class="muted">${esc(config.copy)}</p>
        </div>
        <button class="btn-soft quick-create-close" type="button" data-action="close-quick-create" aria-label="${esc(tx("cancel", "취소"))}">\u00D7</button>
      </div>
      <form class="form-grid" data-form="${config.form}" ${config.formKey ? `data-form-key="${config.formKey}"` : ""}>
        ${config.fields}
        <div class="actions quick-create-actions">
          <button class="btn-soft" type="button" data-action="close-quick-create">${esc(tx("cancel", "취소"))}</button>
          <button class="btn" type="submit">${esc(config.title)}</button>
        </div>
      </form>
    </section>
    ${renderHabitPickerLayer()}
  </div>`;
}

function setPanel(name, html) {
  const panel = document.getElementById(`tab-${name}`);
  if (!(panel instanceof HTMLElement)) {
    return;
  }
  panel.innerHTML = html;
}

async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.authToken) {
    headers.set("Authorization", `Bearer ${state.authToken}`);
  }
  const hasBody = options.body !== undefined;
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

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(resolveMessage(payload?.message || response.statusText || tx("actionFailed", "요청을 처리하지 못했습니다.")));
  }

  if (!payload) {
    throw new Error(tx("invalidJson", "서버가 올바르지 않은 응답 형식을 반환했습니다."));
  }

  return payload;
}

function applyShellText() {
  const meta = ROUTE_META[state.routePath] || ROUTE_META["/today"];
  text("app-utility-title", "appTitle", "마이 플래너");
  text("screen-title", meta.titleKey, "마이 플래너");
  text("screen-copy", meta.copyKey, "개인 플래너");

  for (const element of document.querySelectorAll("[data-label-key]")) {
    if (!(element instanceof HTMLElement)) continue;
    element.textContent = tx(element.dataset.labelKey || "", element.textContent || "");
  }
}

function wireDynamicBehaviors() {
  const homeNoteDetails = document.querySelector("[data-home-note-details]");
  if (homeNoteDetails instanceof HTMLDetailsElement) {
    homeNoteDetails.addEventListener("toggle", () => {
      state.homeNoteOpen = homeNoteDetails.open;
    });
  }

  for (const details of document.querySelectorAll("[data-mode-details-key]")) {
    if (!(details instanceof HTMLDetailsElement)) {
      continue;
    }
    const detailsKey = details.dataset.modeDetailsKey ?? "";
    if (!detailsKey) {
      continue;
    }
    details.addEventListener("toggle", () => {
      state.modeDetailsOpen[detailsKey] = details.open;
    });
  }

  const carousel = document.querySelector("[data-home-carousel]");
  if (carousel instanceof HTMLElement) {
    carousel.addEventListener("scroll", handleHomeCarouselScroll, { passive: true });
    requestAnimationFrame(() => syncHomeCarouselPosition(false));
  }

  const rail = document.querySelector("[data-home-date-rail]");
  if (rail instanceof HTMLElement) {
    rail.addEventListener(
      "scroll",
      () => {
        const label = document.querySelector("[data-home-month-label]");
        if (!(label instanceof HTMLElement)) return;
        const centeredDate = getCenteredRailDate(rail) || state.selectedHomeDate;
        label.textContent = formatMonthLabel(centeredDate);
      },
      { passive: true },
    );

    const selectedChip = rail.querySelector(".home-date-chip.is-selected");
    if (selectedChip instanceof HTMLElement) {
      selectedChip.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    }

    const label = document.querySelector("[data-home-month-label]");
    if (label instanceof HTMLElement) {
      label.textContent = formatMonthLabel(getCenteredRailDate(rail) || state.selectedHomeDate);
    }
  }

  animateAchievementNumber();
}

function handleHomeCarouselScroll(event) {
  const carousel = event.currentTarget;
  if (!(carousel instanceof HTMLElement)) {
    return;
  }
  const styles = getComputedStyle(carousel);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  const panelWidth = carousel.firstElementChild instanceof HTMLElement ? carousel.firstElementChild.offsetWidth + gap : carousel.clientWidth;
  const nextPanel = carousel.scrollLeft >= panelWidth * 0.5 ? "habits" : "tasks";
  if (nextPanel !== state.homePanel) {
    state.homePanel = nextPanel;
    updateHomePanelTabs();
  }
}

function updateHomePanelTabs() {
  for (const button of document.querySelectorAll('[data-action="select-home-panel"]')) {
    if (!(button instanceof HTMLElement)) continue;
    const selected = button.dataset.panel === state.homePanel;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function syncHomeCarouselPosition(animate) {
  const carousel = document.querySelector("[data-home-carousel]");
  if (!(carousel instanceof HTMLElement)) {
    return;
  }
  const styles = getComputedStyle(carousel);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  const panelWidth = carousel.firstElementChild instanceof HTMLElement ? carousel.firstElementChild.offsetWidth + gap : carousel.clientWidth;
  const left = state.homePanel === "habits" ? panelWidth : 0;
  carousel.scrollTo({ left, behavior: animate ? "smooth" : "auto" });
}

function animateAchievementNumber() {
  const element = document.querySelector("[data-achievement-number]");
  if (!(element instanceof HTMLElement) || !state.today) {
    return;
  }

  const target = Number(element.dataset.achievementNumber || 0);
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    element.textContent = percent(target);
    state.previousAchievementRate = target;
    return;
  }

  cancelAnimationFrame(achievementAnimationFrame);
  const startValue = Number.isFinite(state.previousAchievementRate) ? state.previousAchievementRate : 0;
  const startTime = performance.now();
  const duration = 520;

  const step = (timestamp) => {
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const nextValue = startValue + (target - startValue) * eased;
    element.textContent = percent(nextValue);
    if (progress < 1) {
      achievementAnimationFrame = requestAnimationFrame(step);
      return;
    }
    state.previousAchievementRate = target;
    element.textContent = percent(target);
  };

  achievementAnimationFrame = requestAnimationFrame(step);
}

function showFeedback(message, isError = false) {
  const feedback = document.getElementById("feedback");
  if (!(feedback instanceof HTMLElement)) {
    return;
  }
  if (!message) {
    feedback.hidden = true;
    feedback.textContent = "";
    feedback.classList.remove("is-error");
    return;
  }

  feedback.hidden = false;
  feedback.textContent = message;
  feedback.classList.toggle("is-error", isError);

  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedback.hidden = true;
    feedback.textContent = "";
    feedback.classList.remove("is-error");
  }, isError ? 4200 : 2400);
}

function closeQuickCreate() {
  if (state.quickCreateKind === "routine") {
    clearRouteFormDraft(routineFormKey("", "quick-create"));
    if (state.habitPicker?.formKey === routineFormKey("", "quick-create")) {
      state.habitPicker = null;
    }
  }
  state.quickCreateKind = "";
  state.homeQuickActionsOpen = false;
  render();
}

function markAchievementPulse() {
  state.achievementPulseUntil = Date.now() + 900;
}

function getHomeTasks() {
  const filtered = state.tasks.filter((task) =>
    state.homeTaskFilter === "inbox" ? task.dueDate === null : task.dueDate === state.selectedHomeDate,
  );
  return [...filtered].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "pending" ? -1 : 1;
    }
    if ((left.dueDate || "") !== (right.dueDate || "")) {
      return (left.dueDate || "").localeCompare(right.dueDate || "");
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function getHomeHabits() {
  const todayHabits = new Map((state.today?.habits ?? []).map((habit) => [habit.id, habit]));
  const selectedDate = state.selectedHomeDate || state.today?.date || "";
  return state.habits.map((habit) => {
    const todayHabit = todayHabits.get(habit.id);
    if (todayHabit) {
      return {
        ...todayHabit,
        isScheduledToday: true,
        startsLater: false,
      };
    }
    return {
      ...habit,
      currentValue: 0,
      isComplete: false,
      progressRate: 0,
      streak: Number(habit.currentStreak || 0),
      timeEntries: [],
      latestTimeEntry: null,
      isScheduledToday: false,
      startsLater: Boolean(selectedDate && habit.startDate > selectedDate),
    };
  });
}

function getHomeHabitGroups() {
  const homeHabits = getHomeHabits();
  const habitMap = new Map(homeHabits.map((habit) => [habit.id, habit]));
  const activeModeId = state.today?.activeMode?.id || "";
  const activeMode = state.modes.find((mode) => mode.id === activeModeId) ?? null;
  const sourceRoutines =
    Array.isArray(activeMode?.routines) && activeMode.routines.length
      ? activeMode.routines
      : getVisibleRoutines().filter((routine) => Array.isArray(routine?.habitIds) && routine.habitIds.length);
  const groups = [];
  const groupedHabitIds = new Set();

  for (const routine of sourceRoutines) {
    const routineHabitIds =
      Array.isArray(routine.habits) && routine.habits.length
        ? routine.habits.map((habit) => habit.id)
        : (routine.habitIds ?? []);
    const routineHabits = routineHabitIds
      .map((habitId) => habitMap.get(habitId))
      .filter((habit) => habit !== undefined);
    if (!routineHabits.length) {
      continue;
    }
    routineHabits.forEach((habit) => groupedHabitIds.add(habit.id));
    groups.push({
      key: `routine-${routine.id}`,
      title: getRoutineDisplayName(routine),
      accentColor: routine.color || routineHabits[0]?.color || "#6366f1",
      habits: routineHabits,
    });
  }

  const standaloneHabits = homeHabits.filter((habit) => !groupedHabitIds.has(habit.id));
  if (standaloneHabits.length) {
    groups.push({
      key: "standalone",
      title: tx("standaloneHabit", "개별 습관"),
      accentColor: standaloneHabits[0]?.color || "#64748b",
      habits: standaloneHabits,
    });
  }

  return groups;
}

function buildHomeRailDates(centerDate) {
  const anchor = isValidDateKey(centerDate) ? centerDate : dateKeyLocal();
  return Array.from({ length: 21 }, (_, index) => addDaysToDateKey(anchor, index - 7));
}

function buildCalendarMonthGrid(monthKey, days) {
  const [year, month] = String(monthKey).split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mondayIndex = (firstDay.getUTCDay() + 6) % 7;
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const cells = [];

  for (let index = 0; index < mondayIndex; index += 1) {
    cells.push({ type: "empty", id: `empty-${index}` });
  }

  for (let day = 1; day <= lastDate; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ type: "day", summary: dayMap.get(date) ?? null, date });
  }

  return cells;
}

function renderCalendarMonthCell(cell) {
  if (cell.type === "empty") {
    return '<span class="calendar-day-spacer" aria-hidden="true"></span>';
  }

  const summary = cell.summary ?? {
    date: cell.date,
    habitProgressRate: 0,
    completedHabits: 0,
    totalHabits: 0,
    taskCount: 0,
    completedTaskCount: 0,
  };
  const selected = summary.date === state.selectedHomeDate;
  const today = summary.date === dateKeyLocal();

  return `<button class="day-card calendar-day-button calendar-day-button--water ${selected ? "is-selected" : ""} ${today ? "is-today" : ""}" type="button" data-route="${buildTodayRoute(summary.date)}" style="--progress:${String(summary.habitProgressRate)};">
    <div class="calendar-water-pool calendar-water-pool--cell" aria-hidden="true">
      <div class="calendar-water-fill">
        <span class="calendar-water-wave calendar-water-wave--back"></span>
        <span class="calendar-water-wave calendar-water-wave--front"></span>
      </div>
    </div>
    <div class="day-card-head">
      <strong>${esc(String(Number(summary.date.slice(-2))))}</strong>
    </div>
    <span class="calendar-rate">${esc(percent(summary.habitProgressRate))}</span>
  </button>`;
}

function summaryCard(label, value) {
  return `<article class="summary-card">
    <span>${esc(label)}</span>
    <strong>${esc(value)}</strong>
  </article>`;
}

function weekdayChoices(name, selectedValues) {
  const selected = selectedValues instanceof Set ? selectedValues : new Set(selectedValues ?? []);
  return [1, 2, 3, 4, 5, 6, 0]
    .map((day) => {
      const label = new Intl.DateTimeFormat(state.locale, { weekday: "short" }).format(
        new Date(`${WEEKDAY_SAMPLE_DATES.get(day)}T12:00:00`),
      );
      return `<label class="choice-item">
        <input type="checkbox" name="${name}" value="${day}" ${selected.has(day) ? "checked" : ""} />
        <span>${esc(label)}</span>
      </label>`;
    })
    .join("");
}

const WEEKDAY_SAMPLE_DATES = new Map([
  [0, "2026-03-29"],
  [1, "2026-03-30"],
  [2, "2026-03-31"],
  [3, "2026-04-01"],
  [4, "2026-04-02"],
  [5, "2026-04-03"],
  [6, "2026-04-04"],
]);

function buildLocalizedWeekdayLabels() {
  return [1, 2, 3, 4, 5, 6, 0].map((day) =>
    new Intl.DateTimeFormat(state.locale, { weekday: "short" }).format(
      new Date(`${WEEKDAY_SAMPLE_DATES.get(day)}T12:00:00`),
    ),
  );
}

function formatUserRole(value) {
  if (value === "owner") return "소유자";
  if (value === "admin") return "관리자";
  if (value === "member") return "구성원";
  return String(value || "");
}

function formatUserStatus(value) {
  if (value === "active") return "활성";
  if (value === "blocked") return "차단";
  if (value === "inactive") return "비활성";
  return String(value || "");
}

function trackingOption(value, currentValue) {
  return `<option value="${value}" ${value === currentValue ? "selected" : ""}>${esc(trackingTypeLabel(value))}</option>`;
}

function trackingTypeLabel(value) {
  if (value === "count") return tx("typeCount", "횟수");
  if (value === "time") return tx("typeTime", "시간");
  return tx("typeBinary", "체크");
}

function resolveMilestone(rate) {
  if (rate >= 1) return tx("milestone100", "완벽한 하루");
  if (rate >= 0.75) return tx("milestone75", "거의 다 왔어요");
  if (rate >= 0.5) return tx("milestone50", "탄력이 붙었어요");
  if (rate >= 0.25) return tx("milestone25", "좋은 시작");
  return tx("milestone0", "시작할 준비");
}

function resolveMilestoneEmoji(rate) {
  if (rate >= 1) return "🏆";
  if (rate >= 0.75) return "🚀";
  if (rate >= 0.5) return "🔥";
  if (rate >= 0.25) return "✨";
  return "🌱";
}

function resolveAchievementTier(rate) {
  if (rate >= 1) return "complete";
  if (rate >= 0.75) return "surge";
  if (rate >= 0.5) return "momentum";
  if (rate >= 0.25) return "warm";
  return "ready";
}

function summarizeTodayStreak(habits) {
  const streak = habits.reduce((max, habit) => Math.max(max, Number(habit.streak || 0)), 0);
  return `${streak}${tx("daysSuffix", "일")}`;
}

function renderEmptyState(copy, actions = []) {
  return `<article class="route-list-card route-list-card--empty">
    <p class="muted">${esc(copy)}</p>
    ${
      actions.length
        ? `<div class="route-empty-actions">${actions
            .map((action) => `<button class="btn-soft" type="button" data-route="${esc(action.route)}">${esc(action.label)}</button>`)
            .join("")}</div>`
        : ""
    }
  </article>`;
}

function renderGuideText(copy) {
  return `<p class="helper-text muted">${esc(copy)}</p>`;
}

function renderGuideCard(title, copy) {
  return `<article class="route-guide-item">
    <strong>${esc(title)}</strong>
    <p class="muted">${esc(copy)}</p>
  </article>`;
}

function renderFaqItem(question, answer) {
  return `<article class="route-faq-item">
    <strong>${esc(question)}</strong>
    <p class="muted">${esc(answer)}</p>
  </article>`;
}

function formatActiveDays(activeDays) {
  const values = [...new Set(activeDays ?? [])];
  if (values.length === 7) {
    return tx("everyday", "매일");
  }
  const labelsByDay = new Map([
    [0, "2026-03-29"],
    [1, "2026-03-30"],
    [2, "2026-03-31"],
    [3, "2026-04-01"],
    [4, "2026-04-02"],
    [5, "2026-04-03"],
    [6, "2026-04-04"],
  ]);
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((day) => values.includes(day))
    .map((day) =>
      new Intl.DateTimeFormat(state.locale, { weekday: "short" }).format(
        new Date(`${labelsByDay.get(day)}T12:00:00`),
      ),
    )
    .join(" · ");
}

function formatTimeEntry(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const timeLabel = new Intl.DateTimeFormat(state.locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const entryDate = value.slice(0, 10);
  if (entryDate === state.selectedHomeDate) {
    return timeLabel;
  }
  return `${formatCompactDate(entryDate)} ${timeLabel}`;
}

function formatCompactDate(dateKey) {
  if (!isValidDateKey(dateKey)) {
    return String(dateKey || "");
  }
  return new Intl.DateTimeFormat(state.locale, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }
  return new Intl.DateTimeFormat(state.locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function detectLocale() {
  const stored = globalThis.localStorage?.getItem(LOCALE_KEY);
  if (stored && stored in MESSAGES) {
    return stored;
  }
  const candidates = [globalThis.navigator?.language, ...(globalThis.navigator?.languages ?? [])].filter(Boolean);
  if (candidates.some((value) => String(value).toLowerCase().startsWith("ja"))) return "ja";
  if (candidates.some((value) => String(value).toLowerCase().startsWith("en"))) return "en";
  return "ko";
}

function detectStoredOption(key, allowedValues, fallbackValue) {
  const stored = globalThis.localStorage?.getItem(key);
  return stored && allowedValues.includes(stored) ? stored : fallbackValue;
}

function setStoredOption(key, value) {
  globalThis.localStorage?.setItem(key, value);
}

function setAuthToken(value) {
  state.authToken = value;
  if (value) {
    globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, value);
    return;
  }
  globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
}

function applyPreferences() {
  document.body.dataset.theme = state.themePreset;
  document.body.dataset.density = state.density;
}

function t(key, fallback) {
  return tx(key, fallback);
}

function tx(key, fallback = "") {
  return MESSAGES[state.locale]?.[key] ?? MESSAGES.en?.[key] ?? fallback ?? key;
}

function resolveMessage(message) {
  const normalized = String(message || "").trim();
  if (!normalized) {
    return tx("actionFailed", "요청을 처리하지 못했습니다.");
  }
  if (normalized in (MESSAGES[state.locale] || {}) || normalized in (MESSAGES.en || {})) {
    return tx(normalized, normalized);
  }
  return normalized;
}

function text(id, key, fallback = "") {
  const element = document.getElementById(id);
  if (element instanceof HTMLElement) {
    element.textContent = tx(key, fallback);
  }
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
  const safeValue = Math.max(0, Math.min(Number(value || 0), 1));
  return `${Math.round(safeValue * 100)}%`;
}

function dateKeyLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthKeyLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(dateKey) {
  if (!dateKey) {
    return "";
  }
  const source = /^\d{4}-\d{2}$/.test(dateKey) ? `${dateKey}-01` : dateKey;
  return new Intl.DateTimeFormat(state.locale, { year: "numeric", month: "long" }).format(
    new Date(`${source}T12:00:00`),
  );
}

function formatMonthTitle(monthKey) {
  return formatMonthLabel(monthKey);
}

function formatFullDate(dateKey) {
  if (!isValidDateKey(dateKey)) {
    return String(dateKey || "");
  }
  return new Intl.DateTimeFormat(state.locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function shiftMonthKey(monthKey, delta) {
  const [year, month] = String(monthKey || formatMonthKeyLocal(new Date())).split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return formatMonthKeyLocal(date);
}

function moveId(ids, draggedId, targetId) {
  const nextIds = [...ids];
  const fromIndex = nextIds.indexOf(draggedId);
  const toIndex = nextIds.indexOf(targetId);
  if (fromIndex < 0 || toIndex < 0) {
    return nextIds;
  }
  nextIds.splice(fromIndex, 1);
  nextIds.splice(toIndex, 0, draggedId);
  return nextIds;
}

function getCenteredRailDate(rail) {
  const chips = [...rail.querySelectorAll(".home-date-chip")];
  if (!chips.length) {
    return "";
  }
  const railBounds = rail.getBoundingClientRect();
  const railCenter = railBounds.left + railBounds.width / 2;
  let bestDate = "";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const chip of chips) {
    if (!(chip instanceof HTMLElement)) continue;
    const bounds = chip.getBoundingClientRect();
    const center = bounds.left + bounds.width / 2;
    const distance = Math.abs(center - railCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDate = chip.dataset.date || "";
    }
  }

  return bestDate;
}
