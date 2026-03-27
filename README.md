# ShiftSync — Multi‑Location Staff Scheduling Platform

ShiftSync is a full‑stack scheduling platform for a multi‑location restaurant group (Coastal Eats) operating across multiple time zones. It enforces real‑world staffing constraints, supports shift swaps and coverage workflows, provides overtime and fairness analytics, and updates users in real time.

---

## Tech Stack

- **Frontend/Backend**: Next.js (App Router) + TypeScript  
- **Database**: Managed Postgres + Prisma  
- **Auth**: NextAuth + Prisma Adapter  
- **Realtime**: Standalone WebSocket server  
- **Notifications**: In‑app (persisted, read/unread)  
- **Deploy**: Railway  

---

## Core Requirements (Summary)

- Roles: **Admin**, **Manager**, **Staff**
- Multi‑location scheduling across **2 time zones**
- Skills, certifications, availability constraints
- No overlaps, **10‑hour rest minimum**
- Publish/unpublish schedules with **48‑hour cutoff**
- Swap/drop workflows with approval and notifications
- Overtime warnings/blocks and compliance rules
- Fairness analytics (premium shifts + desired hours)
- Real‑time updates + conflict handling
- Audit trail exportable per location

---

## Decisions & Rationale

These resolve the intentional ambiguities:

1. **Decertification & History**  
   - **Decision**: Keep historical assignments; prevent future assignments.  
   - **Why**: Preserves audit integrity and payroll accuracy.

2. **Desired Hours vs Availability**  
   - **Decision**: Availability is hard constraint; desired hours are soft targets.  
   - **Why**: Avoids blocking schedules while guiding fairness.

3. **Consecutive Days Calculation**  
   - **Decision**: Any shift counts as a day worked.  
   - **Why**: Matches staff workload and preparation impact.

4. **Swap Approved → Shift Edited**  
   - **Decision**: Cancel swap, keep original assignment, notify all.  
   - **Why**: Prevents mismatched expectations and ambiguity.

5. **Timezone for Locations**  
   - **Decision**: Single fixed IANA timezone per location.  
   - **Why**: Predictable DST handling and scheduling clarity.

6. **Desired Hours Default**  
   - **Decision**: 40 hours/week if not specified.  
   - **Why**: Aligns with standard workforce planning.

7. **Audit Retention & Export**  
   - **Decision**: 365‑day retention; export per location (admins can select all).  
   - **Why**: Keeps data manageable yet compliant and reviewable.

8. **Manager Views**  
   - **Decision**: Managers see **multi‑location** dashboards by default.  
   - **Why**: Matches their operational scope.

---

## Evaluation Scenarios (Expected Behavior)

1. **Sunday Night Chaos (Call‑out)**  
   Manager opens the schedule, triggers coverage modal for the shift. System filters qualified, available, conflict‑free staff and suggests top candidates. Manager sends a drop/pickup request. Assignment updates are broadcast in real time.

2. **Overtime Trap**  
   During assignment, the system shows projected weekly hours. It warns at 35+ and flags 52‑hour totals with a “what‑if” panel listing the exact shifts causing overtime.

3. **Timezone Tangle**  
   Availability is interpreted in each **location’s** timezone. A staff member certified at PT and ET locations sees the 9–5 window applied locally per site.

4. **Simultaneous Assignment**  
   If two managers assign the same staff member, the first commit wins. The second receives an immediate conflict error and alternative suggestions.

5. **Fairness Complaint**  
   Manager opens fairness analytics, filters premium shifts (Fri/Sat evening), and compares distribution and desired‑hours variance for the employee.

6. **Regret Swap**  
   Staff A cancels pending swap before approval. Original assignment remains; all parties are notified.

---

## Phase Checklist (Deployable Milestones)

### Phase 0 — Foundation & Deploy
- Prisma schema, migrations, Railway Postgres
- Base entities: User, Role, Location, Skill, Certification
- Shared UI components library (`/components/*/index.tsx`)
- App shell routes + health APIs
- Standalone WebSocket server entry
- First Railway deploy

### Phase 1 — Auth & RBAC
- NextAuth + Prisma adapter
- Role gating + manager‑location scoping
- Profile + availability CRUD
- Seed users for Admin/Manager/Staff

### Phase 2 — Scheduling Core
- Shift CRUD + assignment
- Publish/unpublish with 48‑hour cutoff
- Constraint engine + clear violations + alternatives
- Audit logging for all changes

### Phase 3 — Swap & Coverage
- Swap/drop requests + approval flow
- Pending request cap (max 3)
- Drop expiry 24 hours before shift
- Cancel swap if shift is edited
- Notifications for all steps

### Phase 4 — Compliance & Overtime
- 35+ weekly warning, 40+ tracking
- 8‑hour daily warning, 12‑hour block
- 6th day warning, 7th day requires override
- “What‑if” impact preview

### Phase 5 — Fairness & Realtime
- Premium shift distribution
- Desired hours variance + fairness score
- Real‑time schedule updates, swap events, conflicts
- Notification center + on‑duty live dashboard

---

## Seed Data Strategy

Single, comprehensive seed script populates all data needed for evaluation and demos:

- 4 locations across 2 time zones
- Users with Admin/Manager/Staff roles
- Skills and certifications (multi‑location staff)
- Availability with recurring + exception windows
- Existing schedules with **conflicts** for validation
- Swap requests in multiple states (pending/approved/expired)
- Overtime‑triggering schedules for compliance testing

---

## Phase 0 Setup

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:generate
```

Run the app and WebSocket server in separate terminals:

```bash
npm run dev
```

```bash
npm run dev:ws
```

Health check is available at `GET /api/health`.

---

## Notes

This README reflects finalized decisions for the assessment and is intended to guide implementation, testing, and evaluation.