# Requirements (Lite)

## Project
- Name: My Planner
- Owner: yongsugroove
- Requirement ID: RQ-001
- Folder: spring_project

## Goal
- Deliver a usable single-user web MVP for routine formation and schedule management.
- Cover routines, routine-set assignment, todos, calendar feedback, statistics, time-based routine items, and localized UI behind stable local APIs.

## Fixed Options
- Stack profile: node-express
- Auth mode: none
- Persistence mode: local JSON
- Settings scope: single-user

## Acceptance Criteria
- AC-01: Users can create, update, archive, and delete routine groups and routine items.
- AC-02: Routine items support `binary`, `count`, and `time` tracking modes, and daily progress is computed from item-level completion ratios.
- AC-03: Users can create routine sets, assign different sets to weekday and weekend schedules, and apply date-specific overrides that change the set or include/exclude individual routines.
- AC-04: Users can create, edit, complete, and delete one-off todos with optional date assignment and inbox behavior.
- AC-05: The web UI exposes separate tabs for today, routines, todos, calendar, and statistics, and those tabs reflect routine assignment, overrides, daily progress, calendar fill, and aggregate stats from stored data.
- AC-06: System UI text supports Korean, English, and Japanese, defaults to Korean, and switches based on browser language while still allowing manual override in the browser.

## Runtime Commands
- Build: `npm run build`
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- Lint: `npm run lint`
- Run: `npm run dev`

## Schedule
- Target release date: 2026-03-22
- Hard deadline: 2026-03-22
