# Status Board (Lite)

## todo
- [ ] Run real-browser manual validation for the rebuilt home screen on desktop and mobile widths
- [ ] Validate date-rail touch scrolling, task/habit carousel swiping, and direct task completion on the home screen
- [ ] Validate date memo save/clear and reload behavior on the home screen across route refreshes
- [ ] Validate the mode override select/clear flow against expected weekday behavior
- [ ] Confirm the achievement card animation pacing and reduced-motion behavior in a browser
- [ ] Verify PWA install flow, standalone launch, and offline fallback on a supported browser
- [ ] Verify the signed Android release APK on a non-dev device against the deployed HTTPS host
- [ ] Verify iPhone Safari home-screen install and standalone launch against the deployed HTTPS host
- [ ] Run the public deploy smoke check against the production domain
- [ ] Collect explicit user approval after manual UX validation

## in_progress
- [x] Planner scheduling now resolves through routine modes and date overrides instead of routine-set assignment rules
- [x] Legacy/current JSON normalization now creates a default mode when none exists and preserves older assignment metadata during migration
- [x] Time-based habits now store timestamp arrays and expose append/remove behavior through the habit checkin API
- [x] Habit/routine deletion now cleans routine-mode references and removes broken overrides
- [x] The home screen now uses a horizontal date rail, a standalone achievement card, and a horizontal task/habit carousel
- [x] The home task panel now supports selected-day and inbox filtering with inline completion toggles
- [x] The home habit panel now shows binary/count controls or time-entry chips depending on tracking type
- [x] The routines screen now exposes mode creation/editing alongside reusable routine bundle management
- [x] Emoji input and display have been removed from the current browser UI while emoji persistence remains intact in the API/storage layer
- [x] Automated regression coverage now includes routine mode override behavior and time-entry removal
- [x] Localhost pages now mount a local-only Agentation bridge so manual UI annotations can sync to the local MCP server without enabling the toolbar on deployed hosts
- [x] Routine and mode habit assignment now uses a button-triggered overlay picker instead of always-expanded checkbox lists, while keeping create/update drafts stable during overlay interactions
- [x] The habit picker overlay now removes redundant explanatory copy, uses a home-list-inspired row layout, and separates the list from the cancel/apply actions with clearer spacing
- [x] Mode forms now collapse after a successful save, expose inline habit creation via a layer popup from the habit picker field, and the mobile tab bar redistributes evenly across four slots after routine-tab removal
- [x] The browser UI now serves the locally hosted `SUIT Variable` font as its default typeface, replacing the previous Google-font mix with a softer commercial-use-friendly UI font stack
- [x] The home habit panel now shows only habits assigned to the selected day, hiding unscheduled habits instead of rendering inactive rows
- [x] The achievement card now uses milestone badges and tier-based celebration styling so high completion states feel more rewarding without overwhelming low-progress states
- [x] New habits now auto-attach to `mode-default` when that default mode already exists, preventing freshly created standalone habits from appearing as unscheduled by default
- [x] The achievement milestone badge now uses emoji-first visual cues with localized accessible labels instead of text-only copy
- [x] Home time-tracked habits now use a single-slot tap toggle that shows only the latest recorded time and clears on the next tap instead of stacking duplicate chips
- [x] The redundant `습관 보기` heading above the home habit board has been removed
- [x] The top utility header now stays in normal document flow instead of sticky floating behavior
- [x] The redundant `마이 플래너` eyebrow above the screen title has been removed
- [x] The home time-toggle button now hugs its content width instead of presenting as an overly wide tap target
- [x] The home habit board now drops the noisy tag/streak/start-date subtitle from each row and keeps the focus on the habit name plus status control
- [x] The home habit board now groups rows by active routine section, repeats shared habits in every matching routine section, and keeps remaining items in a standalone section
- [x] The grouped home habit board now falls back to saved routines when the active mode has no linked routine details, and narrow-screen section wrappers no longer collapse to single-row heights
- [x] The home habit panel card now expands more aggressively than the task panel so more grouped routine information remains visible without immediate scrolling
- [x] Today payloads and planner storage now support per-date short memos with backward-compatible `dailyNotes` normalization
- [x] The home screen now exposes a compact date memo card so the selected date can hold a short reminder or reflection without leaving home
- [x] Settings now formalize concept help into a short FAQ covering tasks, habits, routines, modes, schedules, time logs, and completion-rate calculation
- [x] Browser settings/auth/API helpers are now shared across `app.js` and `login.js` instead of duplicated inline
- [x] The Express-served browser UI now exposes install metadata, a service worker, and an offline fallback as a PWA shell
- [x] A Capacitor Android project now wraps the existing Express app through a configurable remote server URL for follow-on mobile packaging
- [x] Public distribution now supports hidden placeholder billing, an `/install` guide page, and Android release signing/version configuration

## done (user approved only)
- [ ] Routine-mode home redesign approved by user after manual QA

## Notes
- Project: My Planner
- Requirement ID: RQ-001
- Owner: yongsugroove
