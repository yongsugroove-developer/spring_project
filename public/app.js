import { LANGUAGE_LABELS, MESSAGES } from "./translations.js";

const LOCALE_KEY = "my-planner-locale";

const state = {
  activeTab: "today",
  selectedMonth: monthKey(new Date()),
  selectedDate: "",
  statsRange: "week",
  todoFilter: "all",
  customStatsStart: "",
  customStatsEnd: "",
  locale: detectLocale(),
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

function t(key, params = {}) {
  const bundle = MESSAGES[state.locale] ?? MESSAGES.ko;
  const fallback = MESSAGES.ko;
  const template = bundle[key] ?? fallback[key] ?? key;
  return String(template).replaceAll(/\{(\w+)\}/g, (_, token) => String(params[token] ?? ""));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

function setDocumentMeta() {
  document.documentElement.lang = state.locale;
  document.title = t("appTitle");
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("appDescription"));
}

function applyStaticText() {
  setDocumentMeta();
  text("language-label", t("language"));
  text("hero-title", t("heroTitle"));
  text("hero-copy", t("heroCopy"));
  text("hero-label-set", t("heroSet"));
  text("hero-label-rate", t("heroRate"));
  text("hero-label-streak", t("heroStreak"));
  text("hero-label-date", t("heroDate"));
  text("tab-button-today", t("today"));
  text("tab-button-routines", t("routines"));
  text("tab-button-todos", t("todos"));
  text("tab-button-calendar", t("calendar"));
  text("tab-button-stats", t("stats"));
  const select = document.getElementById("language-select");
  if (select instanceof HTMLSelectElement) {
    select.value = state.locale;
    for (const option of select.options) {
      option.textContent = LANGUAGE_LABELS[option.value] ?? option.value;
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
  renderHero();
  renderTabs();
  renderToday();
  renderRoutines();
  renderTodos();
  renderCalendar();
  renderStats();
  syncTrackingForms();
}

function renderHero() {
  text("hero-set", state.today?.assignment.baseSetName ?? t("noSet"));
  text("hero-rate", percent(state.today?.summary.routineRate));
  text("hero-streak", `${state.stats?.summary.currentStreak ?? 0} ${t("days")}`);
  text("hero-date", dateLabel(state.today?.date));
}

function renderTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${state.activeTab}`);
  });
}

function renderToday() {
  const target = document.getElementById("tab-today");
  if (!target || !state.today) return;
  const summary = state.today.summary;
  target.innerHTML = `<div class="layout-2">
    <article class="panel section">
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
      <div class="stack" style="margin-top:16px;">${state.today.routines.length ? state.today.routines.map(todayRoutine).join("") : empty(t("noActiveRoutines"))}</div>
    </article>
    <div class="stack">
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("todayTodos")}</p><h2>${t("dueToday")}</h2></div></div>
        <div class="list-stack">${state.today.todos.dueToday.length ? state.today.todos.dueToday.map(todoCompact).join("") : empty(t("noDueToday"))}</div>
      </article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("inbox")}</p><h2>${t("inbox")}</h2></div></div>
        <div class="list-stack">${state.today.todos.inbox.length ? state.today.todos.inbox.map(todoCompact).join("") : empty(t("emptyInbox"))}</div>
      </article>
    </div>
  </div>`;
}

function todayRoutine(routine) {
  return `<article class="routine-card">
    <div class="routine-head">
      <div class="routine-name">
        <span class="dot" style="background:${routine.color}"></span>
        <div>
          <strong>${esc(routine.name)}</strong>
          <div class="muted">${routine.progress.completedUnits}/${routine.progress.targetUnits}</div>
        </div>
      </div>
      <span class="pill tag-teal">${percent(routine.progress.rate)}</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${routine.progress.rate * 100}%"></div></div>
    <div class="routine-items">${routine.items.map((item) => todayItem(routine.id, item)).join("")}</div>
  </article>`;
}

function todayItem(routineId, item) {
  if (item.trackingType === "binary") {
    return `<div class="item-card">
      <label class="check-row">
        <input type="checkbox" data-action="toggle-binary" data-routine-id="${routineId}" data-item-id="${item.id}" ${item.currentCount >= 1 ? "checked" : ""} />
        <span>${esc(item.title)}</span>
        <strong>${item.isComplete ? t("done") : t("open")}</strong>
      </label>
    </div>`;
  }
  return `<div class="item-card">
    <div class="count-row">
      <div>
        <strong>${esc(item.title)}</strong>
        <div class="muted">${trackingTypeLabel(item.trackingType)} · ${targetSummary(item)}</div>
      </div>
      <div class="counter">
        <button type="button" data-action="adjust-progress" data-direction="-1" data-routine-id="${routineId}" data-item-id="${item.id}">-</button>
        <strong>${item.currentCount}</strong>
        <button type="button" data-action="adjust-progress" data-direction="1" data-routine-id="${routineId}" data-item-id="${item.id}">+</button>
      </div>
    </div>
  </div>`;
}

function renderRoutines() {
  const target = document.getElementById("tab-routines");
  if (!target) return;
  target.innerHTML = `<div class="stack">
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("createRoutine")}</p><h2>${t("createRoutineHeading")}</h2></div></div>
      <form class="content-card" data-form="routine-create">${routineFields()}<div class="actions"><button class="btn" type="submit">${t("createRoutine")}</button></div></form>
    </article>
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("routineEditor")}</p><h2>${t("routineEditor")}</h2></div></div>
      <div class="stack">${state.routines.length ? state.routines.map(routineEditor).join("") : empty(t("noRoutines"))}</div>
    </article>
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("routineSetsHeading")}</p><h2>${t("routineSetsHeading")}</h2></div></div>
      <form class="content-card" data-form="routine-set-create">${routineSetFields()}<div class="actions"><button class="btn" type="submit">${t("createSet")}</button></div></form>
      <div class="stack" style="margin-top:16px;">${state.routineSets.length ? state.routineSets.map(routineSetEditor).join("") : empty(t("noRoutineSets"))}</div>
    </article>
  </div>`;
}

function routineFields(routine = {}) {
  return `<div class="form-grid">
    <label class="field"><span>${t("name")}</span><input name="name" required value="${esc(routine.name ?? "")}" /></label>
    <label class="field"><span>${t("color")}</span><input name="color" type="color" value="${esc(routine.color ?? "#f97316")}" /></label>
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
  return `<p class="muted" style="margin-top:8px;">${t("targetGuide")}</p>`;
}

function routineEditor(routine) {
  return `<article class="routine-card">
    <form data-form="routine-update" data-id="${routine.id}">
      <div class="routine-head">
        <div class="routine-name">
          <span class="dot" style="background:${routine.color}"></span>
          <div>
            <strong>${esc(routine.name)}</strong>
            <div class="muted">${t("itemsCount", { count: routine.items.length })}</div>
          </div>
        </div>
        <button class="btn-danger" type="button" data-action="delete-routine" data-id="${routine.id}">${t("delete")}</button>
      </div>
      ${routineFields(routine)}
      <div class="actions"><button class="btn-soft" type="submit">${t("saveRoutine")}</button></div>
    </form>
    <div class="routine-items">
      ${routine.items.length ? routine.items.map((item) => routineItemEditor(routine.id, item)).join("") : empty(t("noRoutineItems"))}
      <form class="item-card" data-form="routine-item-create" data-routine-id="${routine.id}">
        <div class="form-grid">
          <label class="field"><span>${t("itemName")}</span><input name="title" required /></label>
          <label class="field"><span>${t("type")}</span><select name="trackingType">${renderTrackingTypeOptions("binary")}</select></label>
          <label class="field" data-role="target-field"><span>${t("targetValue")}</span>${targetInput("targetCount", "binary", 1)}</label>
        </div>
        ${trackingGuide()}
        <div class="actions"><button class="btn" type="submit">${t("addItem")}</button></div>
      </form>
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

function routineSetFields(routineSet = {}) {
  const selected = new Set(routineSet.routineIds ?? []);
  return `<div class="form-grid">
    <label class="field-wide"><span>${t("setName")}</span><input name="name" required value="${esc(routineSet.name ?? "")}" /></label>
    <div class="field-wide"><span>${t("routines")}</span><div class="choice-list">${state.routines.map((routine) => `<label class="choice-item"><input type="checkbox" name="routineIds" value="${routine.id}" ${selected.has(routine.id) ? "checked" : ""} /><span>${esc(routine.name)}</span></label>`).join("")}</div></div>
  </div>`;
}

function routineSetEditor(routineSet) {
  return `<form class="content-card" data-form="routine-set-update" data-id="${routineSet.id}">
    <div class="row-between">
      <div><strong>${esc(routineSet.name)}</strong><div class="muted">${t("linkedRoutines", { count: routineSet.routines.length })}</div></div>
      <button class="btn-danger" type="button" data-action="delete-routine-set" data-id="${routineSet.id}">${t("delete")}</button>
    </div>
    <div style="margin-top:12px;">${routineSetFields(routineSet)}</div>
    <div class="actions"><button class="btn-soft" type="submit">${t("saveSet")}</button></div>
  </form>`;
}

function renderTodos() {
  const target = document.getElementById("tab-todos");
  if (!target) return;
  const todos = state.todos.filter((todo) => state.todoFilter === "all" || todo.status === state.todoFilter);
  target.innerHTML = `<div class="layout-2-equal">
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("createTodo")}</p><h2>${t("createTodoHeading")}</h2></div></div>
      <form class="content-card" data-form="todo-create"><div class="form-grid"><label class="field"><span>${t("title")}</span><input name="title" required /></label><label class="field"><span>${t("date")}</span><input name="dueDate" type="date" /></label><label class="field-wide"><span>${t("note")}</span><textarea name="note"></textarea></label></div><div class="actions"><button class="btn" type="submit">${t("createTodo")}</button></div></form>
    </article>
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("todoList")}</p><h2>${t("todoList")}</h2></div><div class="inline-actions"><button class="btn-soft" type="button" data-action="todo-filter" data-filter="all">${t("all")}</button><button class="btn-soft" type="button" data-action="todo-filter" data-filter="pending">${t("pending")}</button><button class="btn-soft" type="button" data-action="todo-filter" data-filter="done">${t("done")}</button></div></div>
      <div class="stack">${todos.length ? todos.map(todoEditor).join("") : empty(t("noTodos"))}</div>
    </article>
  </div>`;
}

function todoStatusLabel(status) {
  return status === "done" ? t("done") : t("pending");
}

function todoCompact(todo) {
  return `<article class="todo-card"><strong>${esc(todo.title)}</strong><div class="muted">${todo.dueDate ? dateLabel(todo.dueDate) : t("inbox")} · ${todoStatusLabel(todo.status)}</div>${todo.note ? `<p class="muted">${esc(todo.note)}</p>` : ""}</article>`;
}

function todoEditor(todo) {
  return `<form class="todo-card" data-form="todo-update" data-id="${todo.id}"><div class="form-grid"><label class="field"><span>${t("title")}</span><input name="title" required value="${esc(todo.title)}" /></label><label class="field"><span>${t("date")}</span><input name="dueDate" type="date" value="${esc(todo.dueDate ?? "")}" /></label><label class="field"><span>${t("status")}</span><select name="status"><option value="pending" ${todo.status === "pending" ? "selected" : ""}>${t("pending")}</option><option value="done" ${todo.status === "done" ? "selected" : ""}>${t("done")}</option></select></label><label class="field-wide"><span>${t("note")}</span><textarea name="note">${esc(todo.note ?? "")}</textarea></label></div><div class="actions"><button class="btn-soft" type="submit">${t("saveTodo")}</button><button class="btn-danger" type="button" data-action="delete-todo" data-id="${todo.id}">${t("delete")}</button></div></form>`;
}

function renderCalendar() {
  const target = document.getElementById("tab-calendar");
  if (!target || !state.calendar || !state.override) return;
  const [year, month] = state.selectedMonth.split("-");
  const weekday = state.assignments.find((entry) => entry.ruleType === "weekday");
  const weekend = state.assignments.find((entry) => entry.ruleType === "weekend");
  const override = state.override.override;
  const firstDay = state.calendar.days[0] ? new Date(`${state.calendar.days[0].date}T00:00:00Z`).getUTCDay() : 0;
  target.innerHTML = `<div class="layout-2">
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("calendar")}</p><h2>${t("assignmentCalendar", { year, month })}</h2></div><div class="inline-actions"><button class="btn-soft" type="button" data-action="change-month" data-direction="-1">${t("prev")}</button><button class="btn-soft" type="button" data-action="change-month" data-direction="1">${t("next")}</button></div></div>
      <div class="calendar-grid">${weekdayLabels().map((label) => `<div class="weekday">${label}</div>`).join("")}${new Array(firstDay).fill("").map(() => '<div class="day-card is-empty"></div>').join("")}${state.calendar.days.map(calendarDay).join("")}</div>
    </article>
    <div class="stack">
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("assignmentsHeading")}</p><h2>${t("weekdayWeekend")}</h2></div></div>
        <form class="content-card" data-form="assignments-save"><div class="form-grid"><label class="field"><span>${t("weekdaySet")}</span><select name="weekdaySetId">${setOptions(weekday?.setId ?? "", true)}</select></label><label class="field"><span>${t("weekendSet")}</span><select name="weekendSetId">${setOptions(weekend?.setId ?? "", true)}</select></label></div><div class="actions"><button class="btn" type="submit">${t("saveAssignments")}</button></div></form>
      </article>
      <article class="panel section">
        <div class="section-head"><div><p class="section-label">${t("overrideHeading")}</p><h2>${t("overrideForDate", { date: dateLabel(state.selectedDate) })}</h2></div></div>
        <form class="override-card" data-form="override-save"><div class="form-grid"><label class="field-wide"><span>${t("forcedSet")}</span><select name="setId">${setOptions(override.setId ?? "", true)}</select></label><div class="field-wide"><span>${t("includeRoutines")}</span><div class="choice-list">${state.routines.map((routine) => `<label class="choice-item"><input type="checkbox" name="includeRoutineIds" value="${routine.id}" ${override.includeRoutineIds.includes(routine.id) ? "checked" : ""} /><span>${esc(routine.name)}</span></label>`).join("")}</div></div><div class="field-wide"><span>${t("excludeRoutines")}</span><div class="choice-list">${state.routines.map((routine) => `<label class="choice-item"><input type="checkbox" name="excludeRoutineIds" value="${routine.id}" ${override.excludeRoutineIds.includes(routine.id) ? "checked" : ""} /><span>${esc(routine.name)}</span></label>`).join("")}</div></div></div><div class="actions"><button class="btn" type="submit">${t("saveOverride")}</button></div></form>
      </article>
    </div>
  </div>`;
}

function calendarDay(day) {
  return `<button class="day-card ${state.selectedDate === day.date ? "is-selected" : ""}" style="--progress:${day.routineProgressRate}" type="button" data-action="select-date" data-date="${day.date}"><strong>${Number(day.date.slice(-2))}</strong><div class="calendar-meta"><span>${esc(day.setName ?? t("noSet"))}</span><span>${percent(day.routineProgressRate)}</span><span>${day.completedUnits}/${day.targetUnits}</span></div></button>`;
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
  target.innerHTML = `<div class="layout-2-equal">
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("summary")}</p><h2>${t("statistics")}</h2></div><div class="inline-actions"><button class="btn-soft" type="button" data-action="stats-range" data-range="week">${t("week")}</button><button class="btn-soft" type="button" data-action="stats-range" data-range="month">${t("month")}</button></div></div>
      <form class="content-card" data-form="stats-custom"><div class="form-grid"><label class="field"><span>${t("start")}</span><input name="start" type="date" value="${esc(state.customStatsStart)}" /></label><label class="field"><span>${t("end")}</span><input name="end" type="date" value="${esc(state.customStatsEnd)}" /></label></div><div class="actions"><button class="btn-soft" type="submit">${t("applyCustom")}</button></div></form>
      <div class="summary-grid" style="margin-top:16px;"><div class="summary-card"><span>${t("today")}</span><strong>${percent(summary.dailyRate)}</strong></div><div class="summary-card"><span>${t("week")}</span><strong>${percent(summary.weeklyRate)}</strong></div><div class="summary-card"><span>${t("month")}</span><strong>${percent(summary.monthlyRate)}</strong></div><div class="summary-card"><span>${t("currentStreak")}</span><strong>${summary.currentStreak} ${t("days")}</strong></div><div class="summary-card"><span>${t("bestStreak")}</span><strong>${summary.bestStreak} ${t("days")}</strong></div><div class="summary-card"><span>${t("todoCompletion")}</span><strong>${percent(summary.todoCompletion.rate)}</strong></div></div>
    </article>
    <article class="panel section">
      <div class="section-head"><div><p class="section-label">${t("topRoutines")}</p><h2>${t("topRoutines")}</h2></div></div>
      <div class="stack">${summary.topRoutines.length ? summary.topRoutines.map((routine) => `<div class="content-card"><div class="routine-name"><span class="dot" style="background:${routine.color}"></span><div><strong>${esc(routine.name)}</strong><div class="muted">${routine.completedUnits}/${routine.targetUnits}</div></div></div><div style="margin-top:8px;" class="pill tag-teal">${percent(routine.completionRate)}</div></div>`).join("") : empty(t("noRoutineStats"))}</div>
    </article>
  </div>`;
}

function empty(message) {
  return `<div class="empty">${esc(message)}</div>`;
}

function checkedValues(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function routineProgressPayload(routine) {
  return Object.fromEntries(routine.items.map((item) => [item.id, item.currentCount]));
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

async function after(promise, message) {
  await promise;
  await refreshAll(message);
}

async function onSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    if (form.dataset.form === "routine-create") return after(api("/api/routines", { method: "POST", body: JSON.stringify({ name: data.get("name"), color: data.get("color") }) }), "createRoutineDone");
    if (form.dataset.form === "routine-update") return after(api(`/api/routines/${form.dataset.id}`, { method: "PATCH", body: JSON.stringify({ name: data.get("name"), color: data.get("color"), isArchived: data.get("isArchived") === "true" }) }), "updateRoutineDone");
    if (form.dataset.form === "routine-item-create") return after(api(`/api/routines/${form.dataset.routineId}/items`, { method: "POST", body: JSON.stringify({ title: data.get("title"), trackingType: data.get("trackingType"), targetCount: Number(data.get("targetCount")) }) }), "createItemDone");
    if (form.dataset.form === "routine-item-update") return after(api(`/api/routines/${form.dataset.routineId}/items/${form.dataset.itemId}`, { method: "PATCH", body: JSON.stringify({ title: data.get("title"), trackingType: data.get("trackingType"), targetCount: Number(data.get("targetCount")), sortOrder: Number(data.get("sortOrder")), isActive: data.get("isActive") === "true" }) }), "updateItemDone");
    if (form.dataset.form === "routine-set-create") return after(api("/api/routine-sets", { method: "POST", body: JSON.stringify({ name: data.get("name"), routineIds: checkedValues(form, "routineIds") }) }), "createSetDone");
    if (form.dataset.form === "routine-set-update") return after(api(`/api/routine-sets/${form.dataset.id}`, { method: "PATCH", body: JSON.stringify({ name: data.get("name"), routineIds: checkedValues(form, "routineIds") }) }), "updateSetDone");
    if (form.dataset.form === "assignments-save") {
      const assignments = [];
      if (data.get("weekdaySetId")) assignments.push({ ruleType: "weekday", setId: data.get("weekdaySetId") });
      if (data.get("weekendSetId")) assignments.push({ ruleType: "weekend", setId: data.get("weekendSetId") });
      return after(api("/api/assignments", { method: "PUT", body: JSON.stringify({ assignments }) }), "saveAssignmentsDone");
    }
    if (form.dataset.form === "override-save") return after(api(`/api/overrides/${state.selectedDate}`, { method: "PUT", body: JSON.stringify({ setId: data.get("setId") || null, includeRoutineIds: checkedValues(form, "includeRoutineIds"), excludeRoutineIds: checkedValues(form, "excludeRoutineIds") }) }), "saveOverrideDone");
    if (form.dataset.form === "todo-create") return after(api("/api/todos", { method: "POST", body: JSON.stringify({ title: data.get("title"), note: data.get("note") || null, dueDate: data.get("dueDate") || null }) }), "createTodoDone");
    if (form.dataset.form === "todo-update") return after(api(`/api/todos/${form.dataset.id}`, { method: "PATCH", body: JSON.stringify({ title: data.get("title"), note: data.get("note") || null, dueDate: data.get("dueDate") || null, status: data.get("status") }) }), "updateTodoDone");
    if (form.dataset.form === "stats-custom") {
      state.customStatsStart = String(data.get("start") || "");
      state.customStatsEnd = String(data.get("end") || "");
      state.statsRange = "custom";
      return refreshAll("customStatsDone");
    }
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("saveFailed"), true);
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
    if (button.dataset.action === "delete-routine") return after(api(`/api/routines/${button.dataset.id}`, { method: "DELETE" }), "deleteRoutineDone");
    if (button.dataset.action === "delete-routine-item") return after(api(`/api/routines/${button.dataset.routineId}/items/${button.dataset.itemId}`, { method: "DELETE" }), "deleteItemDone");
    if (button.dataset.action === "delete-routine-set") return after(api(`/api/routine-sets/${button.dataset.id}`, { method: "DELETE" }), "deleteSetDone");
    if (button.dataset.action === "delete-todo") return after(api(`/api/todos/${button.dataset.id}`, { method: "DELETE" }), "deleteTodoDone");
    if (button.dataset.action === "todo-filter") {
      state.todoFilter = button.dataset.filter ?? "all";
      renderTodos();
      return;
    }
    if (button.dataset.action === "change-month") {
      const [year, month] = state.selectedMonth.split("-").map(Number);
      state.selectedMonth = monthKey(new Date(year, month - 1 + Number(button.dataset.direction), 1));
      return refreshAll();
    }
    if (button.dataset.action === "select-date") {
      state.selectedDate = button.dataset.date;
      state.override = await api(`/api/overrides/${state.selectedDate}`);
      renderCalendar();
      return;
    }
    if (button.dataset.action === "stats-range") {
      state.statsRange = button.dataset.range ?? "week";
      return refreshAll();
    }
    if (button.dataset.action === "adjust-progress") {
      const routine = state.today?.routines.find((entry) => entry.id === button.dataset.routineId);
      const item = routine?.items.find((entry) => entry.id === button.dataset.itemId);
      if (!routine || !item || !state.today) return;
      const delta = Number(button.dataset.direction) * trackingStep(item);
      const itemProgress = routineProgressPayload(routine);
      itemProgress[item.id] = Math.max(0, Math.min(item.targetCount, item.currentCount + delta));
      return after(api(`/api/checkins/${state.today.date}/routines/${routine.id}`, { method: "PUT", body: JSON.stringify({ itemProgress }) }), "updateProgressDone");
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
  if (target instanceof HTMLSelectElement && target.name === "trackingType") {
    syncTrackingForm(target.closest("form"));
    return;
  }
  if (!(target instanceof HTMLInputElement) || target.dataset.action !== "toggle-binary") return;
  try {
    const routine = state.today?.routines.find((entry) => entry.id === target.dataset.routineId);
    const item = routine?.items.find((entry) => entry.id === target.dataset.itemId);
    if (!routine || !item || !state.today) return;
    const itemProgress = routineProgressPayload(routine);
    itemProgress[item.id] = target.checked ? 1 : 0;
    await after(api(`/api/checkins/${state.today.date}/routines/${routine.id}`, { method: "PUT", body: JSON.stringify({ itemProgress }) }), "updateCheckDone");
  } catch (error) {
    feedback(error instanceof Error ? error.message : t("actionFailed"), true);
  }
}

document.addEventListener("submit", (event) => void onSubmit(event));
document.addEventListener("click", (event) => void onClick(event));
document.addEventListener("change", (event) => void onChange(event));

void refreshAll("loaded");
