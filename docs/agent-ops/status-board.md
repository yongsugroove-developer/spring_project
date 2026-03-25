# Status Board (Lite)

## todo
- [ ] Add browser-level regression coverage for emoji picker and personalization flows
- [ ] Run browser validation for the hamburger-free mobile utility bar, merged Today todo panel, and compact month calendar at phone widths
- [ ] Replace manual billing placeholders with a real provider checkout/subscription flow
- [ ] Decide app packaging path for web-to-mobile release

## in_progress
- [x] Requirements, README, and status docs updated for emoji decoration and personalization scope
- [x] JSON-backed planner API now persists routine/todo emoji fields with migration support
- [x] Responsive planner UI now supports emoji picker, live preview, today quick add, calendar focus cards, and theme/density personalization
- [x] Build, lint, unit, and integration verification completed for the emoji UX slice
- [x] Mobile-first UI refinement now uses a phone bottom tab bar, reordered Today scan flow, and compact calendar detail stacking
- [x] Third-pass mobile tightening now removes planner hamburger navigation on phones, hides hero chrome, and routes admin entry through Account
- [x] Second-pass layout tuning now reduces mobile draft/form density and shrinks hero, routine, todo, and calendar surfaces for faster scanning
- [x] Local MySQL runtime now exists with app schema, MySQL-backed planner repository, auth session APIs, and billing plan/subscription scaffolding
- [x] Browser UI now supports login/register/logout, token-backed session restore, and manual plan activation against the MySQL auth/billing APIs
- [x] Owner/admin backoffice now exists for account access control, manual plan assignment, session visibility, and audit log review
- [x] Account and backoffice surfaces now use a left hamburger/sidebar pattern so only one management group is shown at a time
- [x] Planner navigation now also uses a global hamburger drawer, with Today as the default visible surface and other sections revealed one at a time
- [x] Auth UI now uses a dedicated login page, app-side auth redirect, and a top-right user chip for account entry instead of exposing account inside the hamburger drawer
- [x] Account and backoffice second-level navigation now uses in-page tabs instead of nested hamburger menus
- [x] GitHub Actions CI/CD, PM2 ecosystem config, and Lightsail release scripts now exist for production deployment

## done (user approved only)
- [x] Emoji decoration and UX refresh for the single-user planner MVP

## Notes
- Project: 마이 플래너
- Requirement ID: RQ-001
- Owner: yongsugroove
