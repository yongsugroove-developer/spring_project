# Execution Plan (Lite)

## Requirement
- ID: RQ-001
- Project: My Planner

## Work Items
| Task ID | Description | Owner | Status |
|---|---|---|---|
| BE-04 | Replace routine-set based scheduling with routine modes, weekday activation, and date override resolution across Today, Calendar, Stats, and streak calculations | Backend Worker | done |
| BE-05 | Migrate time-tracked habits from minute accumulation to timestamp entry arrays and preserve legacy data compatibility | Backend Worker | done |
| BE-06 | Add routine mode CRUD APIs and date override API, and clean mode references when habits or routines are deleted | Backend Worker | done |
| FE-04 | Rebuild the home screen into date rail, achievement card, and swipeable task/habit panels with direct task completion and time-entry chips | Frontend Worker | done |
| FE-05 | Remove emoji input/display from the current browser UI while keeping storage and API emoji fields intact | Frontend Worker | done |
| FE-06 | Add routine mode management UI and home mode override controls | Frontend Worker | done |
| BE-07 | Add date memo storage plus `/api/today` exposure and a dedicated date-memo save API with backward-compatible data normalization | Backend Worker | done |
| FE-07 | Add a compact home date-memo card and formalize settings help into short FAQ entries without changing the existing route structure | Frontend Worker | done |
| QA-04 | Add regression coverage for routine mode overrides, time-entry append/remove flow, and routine mode CRUD routes | Test Agent | done |
| QA-05 | Add regression coverage for date-memo persistence and current-format migration when `dailyNotes` is missing | Test Agent | done |
| DOC-02 | Rewrite planning and QA docs to match the routine-mode home redesign | Leader | done |
| DOC-03 | Update requirements and status docs for date memo support and FAQ formalization | Leader | done |

## Run Commands
- Build: `npm run build`
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- Lint: `npm run lint`
- Run: `npm run dev`

## Exit Conditions
- Automated verification passes.
- Remaining work is limited to real-browser manual validation and user approval.
