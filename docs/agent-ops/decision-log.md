# Decision Log

## Rules
- Do not guess when requirements are unclear.
- Ask for explicit user instruction before dispatch.
- Final completion requires explicit user approval.

## Entries
| Date | Decision ID | Topic | User Instruction | Leader Action | Status |
|---|---|---|---|---|---|
| 2026-02-24 | DEC-001 | Template bootstrap | "Initialize project from template." | Created the initial Node/Express project scaffold and the shared agent operation documents. | Historical |
| 2026-03-22 | DEC-002 | Product pivot | "Build a project called My Planner for routines, todos, calendar, and statistics." | Reframed the project from template/sample scope into a planner web MVP with local persistence and tabbed UI architecture. | In Progress |
| 2026-03-22 | DEC-003 | Storage strategy | "Implement the plan with local-first persistence and API-first structure." | Selected JSON file persistence behind a repository interface so later migration to DB-backed web/mobile services remains straightforward. | In Progress |
| 2026-03-22 | DEC-004 | Routine model | "A routine is a collection of repeated tasks." | Modeled routines as groups containing multiple routine items, with daily progress computed from item-level completion ratios. | In Progress |
| 2026-03-22 | DEC-005 | UI structure | "Use tabs instead of showing everything in a single page." | Defined a responsive tabbed SPA with Today, Routines, Todos, Calendar, and Stats sections using the same backend APIs. | In Progress |
| 2026-03-22 | DEC-006 | Assignment model | "Weekdays should run routine 1 and weekends routine 2, with date-specific assignment support." | Split routine definition from activation by introducing routine sets, weekday/weekend assignment rules, and date overrides that can swap sets or include/exclude routines. | In Progress |
| 2026-03-22 | DEC-007 | Progress model | "Routine items need checks and count-based completion when an activity must be done more than once." | Replaced boolean-only completion with per-item progress values so binary and count-based routine items share one calculation path for Today, Calendar, and Stats. | In Progress |
| 2026-03-22 | DEC-008 | Item typing and localization | "Items need check, count, and time modes, and all interface text must switch between Korean, English, and Japanese based on browser language." | Added a third `time` tracking mode for routine items and standardized UI text through locale dictionaries with browser-language detection and manual override. | In Progress |

## Approval History
| Date | Requirement ID | QA Verdict | UI Verdict | User Final Approval | Release Decision |
|---|---|---|---|---|---|
| 2026-03-22 | RQ-001 | Pass | Pending | Pending | Pending |
