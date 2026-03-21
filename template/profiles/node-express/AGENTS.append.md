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
