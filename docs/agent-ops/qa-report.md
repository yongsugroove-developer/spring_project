# QA Report

## Metadata
- Requirement ID: RQ-001
- Reported by: Codex

## Commands
- Build: `npm run build`
- Lint: `npm run lint`
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- Frontend syntax: `node --check public/app.js`
- Frontend syntax: `node --check public/translations.js`

## Result
- Build: Passed on 2026-03-28
- Lint: Passed on 2026-03-28
- Unit: Passed on 2026-03-28
- Integration: Passed on 2026-03-28
- Frontend syntax: Passed on 2026-03-28

## Verdict
- Verdict: Pass
- Recommendation: The planner now runs on a habit-first domain model, with habits on the home timetable, routines reduced to habit bundles with notification metadata, and one-off work moved to renamed task APIs and screens. The calendar screen now renders as a real month grid, the home screen has been tightened into a denser summary plus timetable layout, and creation actions on home now live behind a floating + menu instead of occupying the top summary area. Those floating actions now open in-place quick-create layer popups for habits, tasks, and routines, which reduces tab changes during entry. Bottom navigation is back as a fixed footer with Home, Habits, Tasks, Routines, and Calendar, while account, display settings, and stats now sit under a top-right account dropdown that also shows the current signed-in user summary. The home timetable board now reserves more vertical space, keeps row height fixed, and scrolls internally without showing a scrollbar so longer lists do not keep pushing the page down. Mobile quick-create cards now shrink and scroll within the card, with sticky action buttons so submit controls remain reachable. Habit, task, and routine list screens expose explicit View, Edit, and Delete actions. Frontend action result copy is hidden from the page and sent only to console/system logs. The MySQL planner snapshot path now also handles JSON columns whether mysql2 returns them as raw strings or parsed objects. Automated verification passed. Manual browser validation is still required for drag-and-drop ordering, mobile layout density, account dropdown behavior, footer navigation ergonomics, and quick-create layer usability.
