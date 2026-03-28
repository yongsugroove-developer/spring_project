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
| QA-04 | Add regression coverage for routine mode overrides, time-entry append/remove flow, and routine mode CRUD routes | Test Agent | done |
| DOC-02 | Rewrite planning and QA docs to match the routine-mode home redesign | Leader | done |

## Run Commands
- Build: `npm run build`
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- Lint: `npm run lint`
- Run: `npm run dev`

## Exit Conditions
- Automated verification passes.
- Remaining work is limited to real-browser manual validation and user approval.
