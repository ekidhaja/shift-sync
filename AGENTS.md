# ShiftSync — AGENTS

## Current Phase

**Phase 0 completed. Phase 1 completed.**

## Phase 0 Delivered

- Prisma schema and DB wiring
- Base UI components
- Health API
- WebSocket server entry
- Railway deploy

## Phase 1 Delivered

- NextAuth config + credentials login
- RBAC helpers
- Profile + availability API routes
- Profile + availability UI forms
- Seed users for Admin/Manager/Staff
- 6 frontend tests + 6 backend tests passing

## Coding Standards

- **File naming**: use `/myComponent/index.tsx` (no single‑file component names).
- **Folders**: group by domain where possible (`src/components`, `src/lib`, `src/app`, `prisma`, `docs`).
- **UI**: minimal, whitespace‑heavy, subtle Facebook blue accents.
- **Imports**: use absolute imports via `@/`.
- **Types**: strict TypeScript, no `any` unless justified.
- **Backend**: validate inputs; return explicit error messages.

## Base Folder Structure

- `src/app` — routes, layouts, API handlers
- `src/components` — reusable UI primitives
- `src/lib` — shared logic (db, auth, rbac, helpers)
- `prisma` — schema + seed
- `docs` — progress and decisions

## Base Reusable Components (Phase 0)

- `Button`
- `Badge`
- `Card`

## Quality Gates (Per Phase)

- Every phase must include **5–7 frontend unit tests** (components, UI logic).
- Every phase must include **5–7 backend unit tests** (API/logic).
- Tests must pass before phase completion.
- Fix failing tests before moving on.

## Notes

- Decisions captured in README.
- Single seed script will include conflicts, swap states, and overtime‑triggering schedules.
