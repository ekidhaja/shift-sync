# ShiftSync — Progress Log

## Phase 0 — Foundation & Deploy ✅

- Prisma schema, migrations, Railway Postgres
- Base entities: User, Role, Location, Skill, Certification
- Shared UI components library (`/components/*/index.tsx`)
- App shell routes + health API
- Standalone WebSocket server entry
- First Railway deploy

## Phase 1 — Auth & RBAC ✅

- NextAuth + Prisma adapter (credentials flow)
- Role gating + manager‑location scoping helpers
- Profile self-service APIs + UI forms
- Staff-only availability write APIs
- Manager read-only availability timeline
- Seed users for Admin/Manager/Staff
- Focused frontend/backend tests passing for auth/forms/RBAC/validation

## Phase 2 — Scheduling Core ✅

- Shift CRUD + assignment
- Publish/unpublish with 48‑hour cutoff
- Constraint engine + clear violations + alternatives
- Audit logging for all changes

## Phase 3 — Swap & Coverage ✅

- Swap/drop requests + approval flow
- Pending request cap (max 3)
- Drop expiry 24 hours before shift
- Cancel swap if shift is edited
- Notifications for all steps

## Phase 4 — Compliance & Overtime ✅

- 35+ weekly warning, 40+ tracking
- 8‑hour daily warning, 12‑hour block
- 6th day warning, 7th day requires override
- “What‑if” impact preview

## Phase 5 — Fairness & Realtime ✅

- Premium shift distribution
- Desired hours variance + fairness score
- Real‑time schedule updates, swap events, conflicts
- Notification center + on‑duty live dashboard
