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
- [x] Home creation actions have been moved out of the top summary card into a bottom-right floating + menu
- [x] Frontend action result messages are now hidden from the page and emitted to console/system logs instead
- [x] Home floating actions now open quick-create layer popups for habits, tasks, and routines without tab changes
- [x] The floating + action now sits on the bottom-right and quick-create overlays use the full viewport more effectively
- [x] Bottom tab navigation and the old left drawer have been replaced by a top-right hamburger menu
- [x] Hamburger navigation now exposes account, list-style habit/task/routine views, calendar, stats, and display settings
- [x] The hamburger trigger is back on the top-left and quick-create overlays now render as smaller centered layer popups
- [x] The top-left hamburger trigger is forced visible above legacy responsive hides, and quick-create popups now use measured card widths with no internal scroll area
- [x] Bottom navigation is restored with Home, Habits, Tasks, Routines, and Calendar, while account/settings/stats now live in a top-right account dropdown
- [x] Habit, task, and routine list screens now expose explicit View, Edit, and Delete actions instead of summary-only rows
- [x] Bottom navigation now behaves as a fixed footer, the home timetable uses a larger fixed-height scrollable board, and the floating + action stays above the footer
- [x] The home timetable now reserves more vertical space, clamps row height, and scrolls internally; mobile quick-create cards now shrink and keep their action buttons reachable
- [x] Home habit rows are now fixed-height and the board body hides its scrollbar while remaining internally scrollable
- [x] Home habit status controls now use compact check-emoji toggles and single-tap count chips instead of wide text buttons and +/- steppers
- [x] Binary habit status now uses a centered touch area that only reveals a check emoji on completion, and home drag-and-drop targets the full habit card for reordering
- [x] MySQL planner snapshot reads now tolerate JSON columns returned either as strings or parsed objects, and legacy column checks remain version-safe
- [x] Calendar month cells now show only achievement rate with animated progress fills instead of habit/task count detail copy
- [x] Calendar achievement animation now fills each date cell like rising water with a subtle wave instead of a direct progress bar
- [x] Build, lint, unit, and integration verification completed for the habit-first slice

## done (user approved only)
- [x] Emoji decoration and UX refresh for the single-user planner MVP

## Notes
- Project: 마이 플래너
- Requirement ID: RQ-001
- Owner: yongsugroove
