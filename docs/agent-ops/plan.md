# Execution Plan (Lite)

## Requirement
- ID: RQ-001
- Project: My Planner

## Work Items
| Task ID | Description | Owner | Status |
|---|---|---|---|
| DOC-01 | Replace template-oriented requirement and status docs with My Planner scope and acceptance criteria | Leader | done |
| BE-01 | Add JSON-backed planner repository, service layer, and REST API for routines, todos, calendar, and stats | Backend Worker | done |
| FE-01 | Replace sample demo UI with responsive tabbed planner SPA on top of the new API | Frontend Worker | done |
| QA-01 | Add unit and integration coverage for planner logic and routes, then run project verification | Test Agent | done |
| BE-02 | Refactor the routine domain into routine sets, weekday/weekend assignment rules, date overrides, and item-level progress maps | Backend Worker | done |
| FE-02 | Extend the SPA with routine-set editors, assignment controls, override controls, and binary/count progress UI in the Today tab | Frontend Worker | done |
| QA-02 | Add coverage for assignment resolution, override precedence, count-based progress clamping, and updated stats/calendar behavior | Test Agent | done |
| FE-03 | Add time-based routine item tracking and browser-aware UI localization with manual language switching | Frontend Worker | done |
| QA-03 | Verify time-item API flow, localized UI boot behavior, and regression coverage after i18n changes | Test Agent | done |

## Run Commands
- Build: `npm run build`
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- Lint: `npm run lint`
- Run: `npm run dev`

## Minimum Policy
- FE/BE parallel execution when safe
- Verify before claiming completion
- Final completion requires user approval
