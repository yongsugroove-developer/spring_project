# Requirements (Lite)

## Project
- Name: My Planner
- Owner: yongsugroove
- Requirement ID: RQ-001
- Folder: spring_project

## Goal
- Deliver a responsive single-user planner MVP with habits, tasks, calendar, stats, and routine-mode based scheduling.
- Promote the home screen into the primary operating surface for date selection, completion feedback, inline task handling, and habit check-ins.

## Fixed Options
- Stack profile: node-express
- Auth mode: none
- Persistence mode: local JSON by default, legacy JSON/MySQL migration preserved
- Settings scope: single-user

## Acceptance Criteria
- AC-01: Users can create, update, reorder, and delete saved habits, and each habit supports `binary`, `count`, or `time` tracking.
- AC-02: Time-tracked habits no longer accumulate minutes; each tap records a click timestamp, exposes recent time chips, and supports removing an individual timestamp from the selected date.
- AC-03: Users can create, edit, and delete saved routines as reusable bundles of habits plus notification metadata.
- AC-04: Users can create, edit, and delete routine modes; each mode can include both routine bundles and standalone habits, and each mode is activated by weekday rules plus date-specific overrides.
- AC-05: Today, calendar, stats, and streak calculations resolve scheduled habits from the active mode for the selected date instead of from the full habit catalog.
- AC-06: If older data has no mode records, the app non-destructively creates a default mode that keeps legacy home behavior visible.
- AC-07: Users can create, edit, complete, and delete one-off tasks with selected-date and inbox behavior, and the home screen shows them in a swipeable task panel.
- AC-08: The home screen uses the structure `date rail -> achievement card -> horizontal task/habit panels`, removes the redundant top summary box, and keeps both panels usable on narrow mobile widths.
- AC-09: Achievement feedback is treated as a first-class UX surface with animated count-up, liquid fill, milestone messaging, pulse feedback, and reduced-motion fallback.
- AC-10: Emoji fields continue to round-trip through storage and APIs for future extensibility, but emoji input and display are removed from the current browser UI.
- AC-11: Browser UI text still supports Korean, English, and Japanese with Korean as the default browser-facing locale.
- AC-12: Users can save or clear a short date memo for the selected day, and the memo round-trips through `/api/today` plus a dedicated save API without breaking older planner data.
- AC-13: Settings expose a concise FAQ section that explains the difference between tasks, habits, routines, modes, date reservations, time logs, and completion-rate calculation.

## Runtime Commands
- Build: `npm run build`
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- Lint: `npm run lint`
- Run: `npm run dev`

## Manual QA Focus
- Validate the date rail touch scroll on `360x800`, `390x844`, and `412x915`.
- Validate the home task/habit carousel swipe behavior and direct task completion from the task panel.
- Validate achievement animation behavior for partial progress and 100% completion.
- Validate date memo save and clear behavior on the home screen for the selected date.
- Validate mode override selection and clearing from the home date area.
