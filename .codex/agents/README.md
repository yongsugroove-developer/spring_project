# Codex Subagents

This directory mirrors the existing Cursor role split so the main Codex agent can dispatch focused subagents with the same project vocabulary.

Codex does not auto-load these files. The orchestrator should read the matching prompt and apply it when calling `spawn_agent`.
These files do not trigger subagent creation on their own.

## Role Map

| Prompt file | Preferred agent type | Primary ownership | Default mode |
|---|---|---|---|
| `backend-worker.md` | `worker` | `src/`, backend-facing tests | edit |
| `frontend-worker.md` | `worker` | `public/`, UI-facing tests | edit |
| `qa-verifier.md` | `worker` | verification commands, tests only if asked | read-first |
| `security-reviewer.md` | `explorer` | read-only review by default | read-first |

## Dispatch Rules

1. Start from `AGENTS.md`, then load the matching prompt file in this directory.
2. Tell each worker which files or folders it owns.
3. Tell each worker it is not alone in the codebase and must not revert edits it did not make.
4. Keep frontend and backend ownership disjoint when dispatching in parallel.
5. Use the verifier after implementation and the security reviewer for sensitive changes.
