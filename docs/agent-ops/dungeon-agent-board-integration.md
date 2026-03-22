# Dungeon Agent Board Integration

## Purpose

This project can be visualized through `dungeon-agent-board` using the board's `codex-live` mode.

## Local Setup

Point the board repo `.env` at the shared Codex session store and this project root:

```env
CODEX_SESSIONS_DIR=C:\Users\<user>\.codex\sessions
CODEX_REPO_ROOT=C:\path\to\spring_project
CODEX_SESSION_SOURCES=vscode,cli
CODEX_SESSION_STALE_MS=600000
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174
```

## Expected Behavior

- the main Codex session appears as the leader on the board
- spawned subagents appear only when the session includes `spawn_agent`
- frontend, backend, QA, and security roles are inferred from the spawned task text

## Important Limit

The leader is not a spawned worker in the current Codex runtime.
The board synthesizes the leader from the parent session and only adds worker agents for spawned subagents.
