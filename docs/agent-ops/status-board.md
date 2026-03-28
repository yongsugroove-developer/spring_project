# Status Board (Lite)

## todo
- [ ] Run manual browser validation for the new habit timetable on desktop and mobile
- [ ] Verify drag-and-drop habit reordering in a real browser and confirm persistence after refresh
- [ ] Validate the renamed task screen and routine notification metadata flow against the intended mobile UX
- [ ] Decide app packaging path for web-to-mobile release

## in_progress
- [x] Planner domain has been inverted to `habit -> routine(bundle) -> task(one-off)`
- [x] Legacy JSON/MySQL planner data now migrates forward into habits, habit checkins, routines, and tasks
- [x] `/api/today` now returns a habits-only home payload keyed by the selected date
- [x] Habit CRUD, reorder, and per-date checkin APIs now back the main timetable workflow
- [x] Routine APIs now manage only saved habit bundles plus notification metadata
- [x] Todo APIs and UI have been renamed to task APIs and screens
- [x] The frontend shell now renders dedicated Home, Habits, Tasks, Routines, Calendar, Stats, and Settings screens against the new API contract
- [x] Home now shows a week strip plus a drag-sortable habit timetable with inline progress controls
- [x] Calendar now renders as a month-style grid instead of a broken card list layout
- [x] The main home screen has been tightened into a denser summary + timetable layout with reduced spacing
- [x] Home creation actions have been moved out of the top summary card into a bottom-left floating + menu
- [x] Frontend action result messages are now hidden from the page and emitted to console/system logs instead
- [x] Home floating actions now open quick-create layer popups for habits, tasks, and routines without tab changes
- [x] MySQL planner snapshot reads now tolerate JSON columns returned either as strings or parsed objects, and legacy column checks remain version-safe
- [x] Build, lint, unit, and integration verification completed for the habit-first slice

## done (user approved only)
- [x] Emoji decoration and UX refresh for the single-user planner MVP

## Notes
- Project: 마이 플래너
- Requirement ID: RQ-001
- Owner: yongsugroove
