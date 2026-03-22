# AGENTS.md

## Project Identity
- Project: `my-planner`
- Product name: `마이 플래너`
- Primary owner: `yongsugroove`
- Requirement in focus: `RQ-001`

## Purpose
- Build a single-user routine and todo planner as a responsive web MVP.
- Use this file as the root briefing for the main agent and all delegated work.

## Canonical Commands
- Build: `npm run build`
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- Lint: `npm run lint`
- Run: `npm run dev`

Before closing substantial work, run the relevant verification commands above.

## Project Structure
- `src/`: backend or runtime implementation
- `public/` or `app/`: frontend implementation
- `tests/`: automated verification
- `docs/agent-ops/`: requirements, plan, status, QA, handoff, decisions
- `.cursor/rules/`: project rules for Cursor
- `.cursor/agents/`: project subagents for Cursor
- `.codex/agents/`: project subagent prompts for Codex

## Working Agreements
- Prefer small, reversible changes over broad rewrites.
- Keep docs truthful and lightweight.
- Update the matching `docs/agent-ops/` file when scope, status, or risk changes materially.
- Do not mark approval-sensitive work as complete without explicit user approval.

## Security Boundaries
- Never commit secrets, tokens, `.env`, or plaintext credentials.
- Keep sensitive values server-side and masked in any browser-visible response.
- Record security provisioning or reset evidence in `docs/agent-ops/security-reset-evidence.md`.

## Agent Workflow
- The main agent acts as the orchestrator.
- Use focused subagents for frontend, backend, QA, and security work.
- Prefer FE/BE parallel execution when dependencies are clear.
- Use a verifier after implementation and a security reviewer for sensitive changes.

## Codex Subagent Notes
- In Codex, load the matching prompt from `.codex/agents/` before spawning a subagent.
- The role files under `.codex/agents/` are guidance, not executable settings.
- They do not auto-spawn subagents by themselves.
- In the current Codex runtime, subagent delegation requires an explicit `spawn_agent` decision by the main agent.
- Keep ownership explicit for each spawned subagent so write scopes do not overlap by accident.
- Keep QA and security review read-first by default; allow edits only when the task explicitly needs them.

## Expected Reporting
- Changed files
- Verification run
- Remaining risks
- Next action needed from the user, if any

## Stack Profile: Node Express

### Tech Stack
- Runtime: Node.js, TypeScript, Express
- Frontend: static HTML/CSS/JS or lightweight server-rendered UI
- Tests: Vitest + Supertest

### File Structure
- `src/`: backend runtime, handlers, services, persistence
- `public/`: browser-facing static UI assets
- `tests/unit/`: isolated logic tests
- `tests/integration/`: route and flow verification

### Profile Boundaries
- Prefer simple server architecture over framework-heavy abstractions.
- Keep frontend and backend loosely coupled through explicit API contracts.
- Preserve deterministic validation and safe secret handling by default.
- Keep persistence swappable so local JSON storage can later move to a service database.
