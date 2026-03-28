# Status Board (Lite)

## todo
- [ ] Run real-browser manual validation for the rebuilt home screen on desktop and mobile widths
- [ ] Validate date-rail touch scrolling, task/habit carousel swiping, and direct task completion on the home screen
- [ ] Validate the mode override select/clear flow against expected weekday behavior
- [ ] Confirm the achievement card animation pacing and reduced-motion behavior in a browser
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

## done (user approved only)
- [ ] Routine-mode home redesign approved by user after manual QA

## Notes
- Project: My Planner
- Requirement ID: RQ-001
- Owner: yongsugroove
