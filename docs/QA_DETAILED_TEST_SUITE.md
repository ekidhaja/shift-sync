# ShiftSync — Detailed End-to-End QA Test Suite

This document is the full manual QA execution guide based on the raw requirements.
It is designed for real-world testers: exact accounts, routes, actions, and expected outcomes.

---

## 1) Test Scope and Goal

- Validate all **evaluation scenarios** first.
- Then validate each requirement area end-to-end:
  - Roles/RBAC
  - Scheduling + constraints
  - Swap/Coverage workflow
  - Compliance/overtime
  - Fairness
  - Realtime updates
  - Notifications
  - Timezone/time handling
  - Audit trail

---

## 2) Pre-Run Setup

### 2.1 Environment

Run from project root:

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
npm run dev:ws
```

### 2.2 Browser Sessions

Use 3 isolated sessions for concurrency/realtime tests:

- **Session A (Manager 1)**: normal browser window
- **Session B (Manager 2)**: incognito/private window
- **Session C (Staff)**: second browser profile or another incognito window

### 2.3 Seed Accounts

- Admins:
  - `admin.paul@coastaleats.com` / `password123`
  - `admin.rina@coastaleats.com` / `password123`
  - `admin.omar@coastaleats.com` / `password123`
- Managers:
  - `manager.john@coastaleats.com` / `password123`
  - `manager.maya@coastaleats.com` / `password123`
  - `manager.luke@coastaleats.com` / `password123`
- Staff:
  - `staff.sam@coastaleats.com` / `password123`
  - `staff.sky@coastaleats.com` / `password123`
  - `staff.tina@coastaleats.com` / `password123`
  - `staff.aria@coastaleats.com` / `password123`
  - `staff.noah@coastaleats.com` / `password123`
  - `staff.leah@coastaleats.com` / `password123`

### 2.3.1 Seed Behavior Note

- Seed data intentionally includes **foundational setup only** (users, roles, skills, certifications, manager-location mappings, and basic preferences).
- Manager-location allocation is seeded as: `manager.john` = 2 locations (Downtown, Harbor), `manager.maya` = 1 (Sunset), `manager.luke` = 1 (Marina).
- Seed data does **not** pre-create operational business records like shifts, assignments, availability entries, swap requests, or notifications.
- QA actors must create those records during execution steps below.

### 2.3.2 Seeded Staff Skills + Location Certifications

- `staff.sam@coastaleats.com`
  - Skills: `server`, `host`
  - Certified locations: `Downtown`, `Harbor`, `Sunset`, `Marina`
- `staff.sky@coastaleats.com`
  - Skills: `server`, `bartender`
  - Certified locations: `Downtown`, `Harbor`
- `staff.tina@coastaleats.com`
  - Skills: `line cook`, `server`
  - Certified locations: `Sunset`, `Marina`
- `staff.aria@coastaleats.com`
  - Skills: `host`, `bartender`
  - Certified locations: `Downtown`, `Marina`
- `staff.noah@coastaleats.com`
  - Skills: `line cook`, `server`
  - Certified locations: `Harbor`, `Sunset`
- `staff.leah@coastaleats.com`
  - Skills: `host`, `line cook`
  - Certified locations: `Downtown`, `Sunset`

### 2.3.3 Availability Timezone Semantics

- Recurring availability (`dayOfWeek`, `start`, `end`) is evaluated in the **selected location timezone**.
- Multi-location recurring creation stores one availability record per selected location, so the same window is enforced as local wall-clock time per location.
- Exception availability stores explicit start/end timestamps and is enforced as absolute instants.
- Duplicate/conflicting availability windows for the same user/location/time range are rejected with a conflict error.

### 2.4 Evidence to Capture Per Test

- Screenshot/video (UI state)
- Network response (status + response body for API failures)
- Timestamp + browser session used

---

## 3) Evaluation Scenarios (Run First)

## EV-01 — Sunday Night Chaos (Call-out coverage)

**Purpose:** Validate fast coverage flow with constraint filtering and realtime updates.

**Sessions:** A (manager.john), C (staff.sam)

**Steps**

1. Session A: sign in `manager.john@coastaleats.com`.
2. Session C: sign in `staff.sam@coastaleats.com`, go to `/availability`, add recurring availability covering an evening window for a manager-owned location.
3. Session A: go to `/schedule` and create a same-day or near-term evening shift for that location.
4. In the created shift, open assignment controls.
5. Try assigning a clearly ineligible person (wrong skill/certification/unavailable) to trigger violation details.
6. Confirm violations display clear reason(s) and alternatives list.
7. Assign an eligible staff member.
8. Session C: open `/schedule`.
9. Observe update without hard refresh (or after WS event-driven reload).

**Example values**

- Location: `Coastal Eats — Downtown`
- Staff availability (Session C): recurring `Tuesday`, `17:00`–`23:00` (Downtown timezone)
- Shift (Session A): start `2026-04-14 18:00`, end `2026-04-14 22:00`, required skill `server`, headcount `1`
- Ineligible assignment example: choose a staff member without `server` skill or without Downtown certification

**Expected**

- Ineligible assignment is blocked with explicit rule message.
- Alternatives are shown when available.
- Eligible assignment succeeds.
- Staff schedule reflects change in near real-time.

---

## EV-02 — Overtime Trap

**Purpose:** Validate overtime warning/blocking and what-if impact visibility.

**Session:** A (manager.john)

**Steps**

1. Sign in manager; go to `/compliance`.
2. In what-if panel, enter a known `userId` and `shiftId`.
3. Click **Run what-if**.
4. Verify projected weekly hours, daily hours, consecutive days, and issue list appear.
5. Go to `/schedule` and attempt assignment expected to violate severe compliance (e.g., >12h/day or 7th day without override reason).

**Example values**

- What-if test pair:
  - `userId`: any staff id from `/api/shifts/options` response (for example `staff.sam`'s id)
  - `shiftId`: id of a newly created draft shift in manager scope
- Daily hard-block setup:
  - Shift A: `2026-04-15 08:00`–`14:00` (6h)
  - Shift B: `2026-04-15 15:00`–`22:00` (7h)
  - Assign same user to both via what-if/assignment flow => projected daily `13h` (block)
- 7th-day override setup: assign one short shift on each day `2026-04-14` through `2026-04-19`, then test another on `2026-04-20`

**Expected**

- What-if returns measurable projections and issue severities.
- Warning scenarios allow visibility and manager awareness.
- Block scenarios reject assignment with clear reason.

---

## EV-03 — Timezone Tangle

**Purpose:** Validate location timezone interpretation for availability windows.

**Session:** C (staff.sam), A (manager.john)

**Steps**

1. Session C: sign in staff; open `/availability`.
2. Create recurring window (e.g., 09:00–17:00) for one location.
3. Add another recurring window for a second location in different timezone.
4. Session A: create two shifts at those locations around 09:00–17:00 local windows.
5. Attempt assignment of same staff for each location-specific shift.

**Example values**

- Locations: `Coastal Eats — Downtown` (`America/New_York`) and `Coastal Eats — Sunset` (`America/Los_Angeles`)
- Recurring availability windows for the same staff:
  - Downtown: `Monday`, `09:00`–`17:00`
  - Sunset: `Monday`, `09:00`–`17:00`
- Shifts:
  - Downtown shift: `2026-04-13 10:00`–`14:00` local (ET)
  - Sunset shift: `2026-04-13 10:00`–`14:00` local (PT)

**Expected**

- Availability is enforced per location timezone.
- Assignments succeed/fail according to local-time interpretation, not manager browser timezone.

---

## EV-04 — Simultaneous Assignment

**Purpose:** Verify first-write-wins under concurrent manager actions.

**Sessions:** A (manager.john), B (admin.rina)

**Steps**

1. Both sessions sign in and open `/schedule` on same location/week.
2. Use same staff target and overlapping/identical assignment context.
3. Trigger assign action nearly simultaneously.

**Example values**

- Location/week: `Coastal Eats — Downtown`, week of `2026-04-13`
- Shift: `2026-04-16 12:00`–`20:00`, required skill `server`, headcount `2`
- Target staff: one certified + skilled staff in Downtown (for example `staff.sam`)
- Simultaneous trigger method: both sessions click `Assign` within ~1 second

**Expected**

- Exactly one succeeds.
- Second receives immediate conflict response with clear message.
- Conflict-aware feedback and alternatives are presented.

---

## EV-05 — Fairness Complaint

**Purpose:** Validate premium shift distribution and desired-hours variance insight.

**Session:** A (manager.john)

**Steps**

1. Open `/fairness`.
2. Load fairness summary for a location.
3. Review rows showing assigned hours vs desired, variance, premium count, fairness score.
4. Compare staff entries and identify over/under-scheduled users.

**Expected**

- Premium shift metrics visible.
- Fairness score and variance values visible and interpretable.

---

## EV-06 — Regret Swap

**Purpose:** Ensure cancellation before approval preserves original assignments and notifies parties.

**Sessions:** C (staff.sam), A (manager.john)

**Steps**

1. Session A: create two compatible shifts in one managed location.
2. Session C (`staff.sam`) and another staff session (`staff.sky`) each ensure availability is set for those shifts.
3. Session A: assign `staff.sam` to shift A and `staff.sky` to shift B.
4. Session C (`staff.sam`): open `/swaps`, create a SWAP request with target `staff.sky` and proposed shift B.
5. Before any manager action, `staff.sam` cancels the pending request.
6. Session A: open `/swaps` queue and `/schedule` for same shifts.
7. Session C: open `/notifications`.

**Expected**

- Swap transitions to canceled state.
- Original assignments remain unchanged.
- Notifications reflect cancellation to relevant users.

---

## 4) Requirement Packs — Detailed Tests

## R1 — User Management, Roles, Skills, Certifications, Availability

## R1-01 — Staff can be certified for multiple locations

**Session:** A (admin.paul)

**Steps**

1. Sign in admin; open manager/schedule options where staff metadata is visible (e.g., `/schedule`).
2. Inspect staff metadata in assignment context.

**Expected**

- At least one staff member (seeded) shows certification links to multiple locations.

## R1-02 — Staff skill model is enforced

**Session:** A (manager.john)

**Steps**

1. Create shift requiring a specific skill in `/schedule`.
2. Attempt assignment of staff without that skill.

**Expected**

- Assignment blocked with explicit skill violation.

## R1-03 — Recurring availability create/edit/delete

**Session:** C (staff.sam)

**Steps**

1. Open `/availability`.
2. Create recurring entry (day/start/end/location).
3. Verify appears in list.
4. Delete entry.

**Expected**

- Create/delete succeed and UI reflects persisted state.

## R1-04 — One-off exception availability create/delete

**Session:** C (staff.sam)

**Steps**

1. In `/availability`, create exception window for a date/time range.
2. Verify appears.
3. Delete entry.

**Expected**

- Exception behavior persisted and removable.

## R1-05 — Manager scope restriction

**Session:** A (manager.john), B (manager.maya)

**Steps**

1. Each manager opens `/schedule`, `/availability`, `/fairness`.
2. Compare visible location options.

**Expected**

- Each manager sees/manages only assigned locations.

## R1-06 — Admin global visibility

**Session:** Admin

**Steps**

1. Open `/schedule`, `/fairness`, `/on-duty`-backed dashboard components.
2. Validate cross-location visibility.

**Expected**

- Admin can access all locations and global views.

---

## R2 — Shift Scheduling + Constraint Engine

## R2-01 — Shift creation fields required

**Session:** Manager

**Steps**

1. In `/schedule`, try creating shift missing required fields.
2. Then create with location/date/time/skill/headcount.

**Example values**

- Invalid payload attempt: omit `requiredSkillId` and `endDateTime`
- Valid payload:
  - location: `Coastal Eats — Harbor`
  - start: `2026-04-14 11:00`
  - end: `2026-04-14 19:00`
  - skill: `server`
  - headcount: `2`

**Expected**

- Invalid payload rejected with clear error.
- Valid shift created.

## R2-02 — Manual assignment success path

**Session:** Manager

**Steps**

1. Assign eligible staff to created shift.

**Expected**

- Assignment succeeds, appears in shift assignment list.

## R2-03 — Publish schedule visibility to staff

**Sessions:** Manager + Staff

**Steps**

1. Manager publishes week in `/schedule`.
2. Staff opens `/schedule`.

**Expected**

- Staff sees published assigned shifts.

## R2-04 — Edit/unpublish cutoff behavior

**Session:** Manager

**Steps**

1. Attempt edit/delete/unassign around cutoff boundary (inside vs outside).

**Example values**

- Default cutoff: `48h` before shift start
- Outside-cutoff shift: starts `2026-04-20 12:00` (edit/delete should be allowed when tested >48h ahead)
- Inside-cutoff shift: starts `2026-04-16 12:00` (edit/delete/unassign should be blocked when tested within 48h)

**Expected**

- Blocked inside cutoff with specific message.
- Allowed outside cutoff.

## R2-05 — Double-booking across locations blocked

**Session:** Manager

**Steps**

1. Assign staff to shift A.
2. Attempt overlapping shift B assignment (different location permitted in selection).

**Example values**

- Shift A (Downtown): `2026-04-17 09:00`–`13:00`
- Shift B (Harbor): `2026-04-17 12:00`–`16:00`
- Same target staff for both assignments (must be certified/skilled for both locations)

**Expected**

- Overlap violation returned; assignment denied.

## R2-06 — 10-hour rest minimum blocked

**Session:** Manager

**Steps**

1. Assign shift ending late.
2. Attempt assignment starting <10h later.

**Example values**

- Shift A: `2026-04-18 15:00`–`23:00`
- Shift B: `2026-04-19 07:00`–`15:00` (8h gap from Shift A end, should be blocked)
- Control check (optional): Shift C starting `2026-04-19 09:30` (10.5h gap) should pass rest rule if other constraints pass

**Expected**

- Rest-window violation returned; assignment denied.

## R2-07 — Certification enforcement

**Session:** Manager

**Steps**

1. Try assigning staff to location without certification.

**Expected**

- Certification violation message.

## R2-08 — Availability enforcement

**Session:** Manager + Staff

**Steps**

1. Staff sets narrow availability.
2. Manager attempts assignment outside window.

**Example values**

- Staff recurring availability: `Wednesday`, `10:00`–`14:00`, location `Downtown`
- Manager shift for same staff/location: `Wednesday`, `15:00`–`19:00` (outside availability => blocked)

**Expected**

- Availability violation message.

## R2-09 — Violation clarity + alternatives

**Session:** Manager

**Steps**

1. Trigger each constraint class where possible.
2. Record UI error detail and suggested alternatives output.

**Expected**

- Reason is explicit and actionable.
- Alternatives list appears when candidates exist.

---

## R3 — Swap/Drop & Coverage Workflow

## R3-01 — Swap request creation (Staff A → Staff B)

**Sessions:** C (staff.sam), B (staff.sky)

**Steps**

1. Manager first creates two compatible shifts and assigns Staff A to shift A and Staff B to shift B.
2. Staff A opens `/swaps`, enters own shift + target user + proposed shift.
3. Submit swap request.

**Expected**

- Request enters `PENDING_PEER`.
- Target staff receives notification.

## R3-02 — Peer acceptance then manager approval

**Sessions:** Staff B + Manager

**Steps**

1. Staff B accepts request.
2. Manager opens `/swaps` queue and approves.

**Expected**

- Status transitions: `PENDING_PEER` → `PENDING_MANAGER` → `APPROVED`.
- Assignment changes only after manager approval.

## R3-03 — Drop request flow

**Session:** Staff + Manager

**Steps**

1. Manager creates and assigns a valid upcoming shift to the staff actor.
2. Staff submits drop request.
3. Manager approves/rejects.

**Expected**

- Correct status transition and notifications.

## R3-04 — Pending cap enforced (max 3)

**Session:** Staff

**Steps**

1. Create 3 pending requests.
2. Attempt 4th.

**Expected**

- 4th blocked with cap message.

## R3-05 — Drop expiry 24h before shift

**Session:** Staff

**Steps**

1. Manager creates and assigns a shift starting within <24 hours.
2. Staff attempts drop creation for that shift.

**Example values**

- If current local time is `2026-04-14 10:00`, create assigned shift starting `2026-04-15 07:00` (21h ahead)
- Expected drop creation response: rejection with expiry details

**Expected**

- Rejected with expiry reason.

## R3-06 — Shift edited while swap pending/approved

**Session:** Manager + Staff

**Steps**

1. Create pending/approved swap referencing a shift.
2. Manager edits the shift.

**Expected**

- Swap canceled automatically.
- Parties notified.
- Original assignment retained per decision.

---

## R4 — Compliance & Labor Rules

## R4-01 — Weekly warning threshold

**Session:** Manager

**Steps**

1. Manager creates/assigns enough weekly shifts to move a user near threshold.
2. Use `/compliance` what-if for that user/shift combination.

**Example values**

- Target week: week of `2026-04-13`
- Create 5 assigned shifts at `7h` each (total `35h`) for same user
- What-if additional shift of `5h` should project `40h` tracking threshold

**Expected**

- Warning at 35+ and tracking at 40+ reflected.

## R4-02 — Daily warning and block

**Session:** Manager

**Steps**

1. Manager creates assignments that push projected daily total >8h and then >12h.
2. Run what-if and assignment attempts for both cases.

**Example values**

- Warning setup: same-day totals `09:00`–`13:00` + `14:00`–`19:00` => `9h` (warning)
- Block setup: same-day totals `08:00`–`14:00` + `15:00`–`22:00` => `13h` (block)

**Expected**

- > 8h warning; >12h block.

## R4-03 — Consecutive day warning and override

**Session:** Manager

**Steps**

1. Manager creates and assigns consecutive-day shifts to the same user.
2. Evaluate 6th day and 7th day scenarios via what-if + assignment attempt.
3. Try 7th-day assignment without override, then with override reason.

**Example values**

- Assign one shift per day for `2026-04-14` through `2026-04-19` (6 consecutive days)
- Test day-7 shift on `2026-04-20 11:00`–`17:00`
- Override reason example: `Emergency coverage due to two call-outs`

**Expected**

- 6th day warning.
- 7th day requires override reason; without it blocked.

## R4-04 — Overtime dashboard identifies risk rows

**Session:** Manager

**Steps**

1. Load overtime dashboard for location in `/compliance`.

**Expected**

- At-risk staff rows and totals visible.

---

## R5 — Fairness Analytics

## R5-01 — Premium shift distribution visibility

**Session:** Manager

**Steps**

1. Manager creates and assigns several Friday/Saturday evening shifts across multiple staff.
2. Open `/fairness`, load summary.

**Example values**

- Premium windows (example):
  - Friday `2026-04-17 18:00`–`22:00`
  - Saturday `2026-04-18 18:00`–`22:00`
- Distribute at least 4 such shifts unevenly across 3 staff to make score differences visible

**Expected**

- Premium counts visible per staff.

## R5-02 — Desired-hours variance visibility

**Session:** Manager

**Steps**

1. In same view, inspect assigned vs desired and variance.

**Expected**

- Variance values visible and accurate relative to displayed totals.

## R5-03 — Fairness score interpretation

**Session:** Manager

**Steps**

1. Compare fairness scores between staff entries.

**Expected**

- Score updates reflect assignment distribution differences.

---

## R6 — Realtime Features

## R6-01 — Schedule realtime update to staff

**Sessions:** Manager + Staff

**Steps**

1. Staff keeps `/schedule` open.
2. Manager publishes or edits relevant schedule.

**Expected**

- Staff view updates without manual full-page refresh.

## R6-02 — Swap realtime updates

**Sessions:** Staff + Manager

**Steps**

1. Keep `/swaps` open in both sessions.
2. Create/accept/approve/cancel swap in one session.

**Expected**

- Other session reflects updates in near real-time.

## R6-03 — On-duty live dashboard

**Session:** Manager/Admin

**Steps**

1. Keep `/fairness` open (on-duty section).
2. Trigger assignment/publish changes affecting current window.

**Expected**

- On-duty view updates from realtime schedule events.

## R6-04 — Concurrent conflict notification immediacy

**Sessions:** Two scheduler actors (manager/admin)

**Steps**

1. Execute near-simultaneous assignment.

**Example values**

- Use two sessions with valid scope to same location (for example `manager.john` + `admin.rina`)
- Use one shift and one target user; click assign in both sessions within ~1 second

**Expected**

- Immediate conflict response for loser request (no silent overwrite).

---

## R7 — Notifications & Preferences

## R7-01 — Notification generation by event type

**Sessions:** Staff + Manager

**Steps**

1. Trigger shift changes, swap events, publish actions.
2. Open `/notifications`.

**Expected**

- Relevant notifications are persisted and listed.

## R7-02 — Read/unread state transitions

**Session:** Any role

**Steps**

1. Mark one notification read.
2. Mark all read.

**Expected**

- Unread count decreases accordingly.

## R7-03 — Preferences persistence

**Session:** Any role

**Steps**

1. Toggle in-app/realtime/email simulation preferences in `/notifications`.
2. Reload page.

**Expected**

- Preferences persist.

---

## R8 — Calendar & Time Handling

## R8-01 — Location timezone display behavior

**Sessions:** Manager/Staff

**Steps**

1. Compare shift display for two different locations/timezones.

**Expected**

- Display context is aligned to location timezone semantics.

## R8-02 — Overnight shift handling

**Session:** Manager + Staff

**Steps**

1. Create shift crossing midnight (e.g., 11pm–3am).
2. Assign/publish and view as staff.

**Example values**

- Shift: start `2026-04-18 23:00`, end `2026-04-19 03:00`, location `Downtown`, skill `server`

**Expected**

- Treated as single valid shift with correct range.

## R8-03 — DST-adjacent availability sanity

**Session:** Staff + Manager

**Steps**

1. Add recurring availability near DST boundary week.
2. Attempt assignment around boundary.

**Example values**

- Timezone: `America/New_York`
- Use DST transition week around `2026-03-08` (spring-forward)
- Recurring availability: `Sunday`, `01:00`–`05:00`
- Assignment checks:
  - Shift A: `2026-03-08 01:30`–`03:30`
  - Shift B: `2026-03-08 04:00`–`06:00`

**Expected**

- Behavior remains consistent with location timezone rules.

---

## R9 — Audit Trail

## R9-01 — Schedule change audit completeness

**Session:** Manager/Admin

**Steps**

1. Create/update/delete shift and assignment changes.
2. Fetch shift history context (where available in app/API).

**Expected**

- Audit entries include actor, action, timestamp, before/after states when relevant.

## R9-02 — Manager shift-history access scope

**Session:** Manager

**Steps**

1. Access history for shift in managed location.
2. Attempt for unmanaged location.

**Expected**

- Managed access allowed; unmanaged forbidden.

## R9-03 — Admin export with location/date range

**Session:** Admin

**Steps**

1. Export all-locations CSV.
2. Export with `locationId` filter.
3. Export with `from/to` filters.
4. Try invalid date range.

**Expected**

- Valid exports succeed with CSV payload.
- Invalid range returns clear `400`.

---

## 5) Intentional Ambiguities — Decision Conformance Tests

## A1 — Decertification & history preserved

**Session:** Admin/Manager

**Steps**

1. Use staff certified at location; ensure historical assignment exists.
2. Remove/alter certification (if admin tooling exists) or simulate with non-certified user for future assignment.

**Expected**

- Historical assignment remains in records.
- Future incompatible assignment is blocked.

## A2 — Desired hours soft vs availability hard

**Session:** Manager

**Steps**

1. Attempt assignment within availability but above desired target.
2. Attempt outside availability.

**Expected**

- Above desired can proceed with fairness/compliance visibility.
- Outside availability blocked.

## A3 — Consecutive day counting (any shift counts)

**Session:** Manager

**Steps**

1. Use short-duration shifts across consecutive days and evaluate what-if.

**Expected**

- Day counted regardless of shift length.

## A4 — Swap approved then shift edited

**Session:** Manager + Staff

**Steps**

1. Approve swap.
2. Edit referenced shift.

**Expected**

- Swap canceled post-edit.
- Notifications sent.
- Original assignment remains per defined decision.

## A5 — Single fixed timezone per location

**Session:** Manager/Staff

**Steps**

1. Validate that location behavior is consistent with one configured IANA timezone.

**Expected**

- No per-user timezone reinterpretation of location rules.

---

## 6) Suggested Execution Order (Fast-to-Full)

1. `EV-04`, `EV-06`, `R2-05`, `R2-06`, `R3-04` (highest risk)
2. Remaining evaluation scenarios
3. RBAC + scheduling packs
4. Swap/compliance/fairness/realtime
5. Timezone and ambiguity conformance
6. Audit export/history closure checks

---

## 7) Pass/Fail Logging Template

| Case ID | Result | Session(s) | Evidence            | Notes            |
| ------- | ------ | ---------- | ------------------- | ---------------- |
| EV-04   | PASS   | A+B        | video + network log | One 201, one 409 |

Use `docs/QA_CHECKLIST.md` for concise tracking, and this file for deep execution steps.

---

## 8) Coverage Snapshot

- Evaluation scenarios covered: `6` (`EV-01` to `EV-06`)
- Requirement packs covered: `9` (`R1` to `R9`)
- Ambiguity decision tests covered: `5` (`A1` to `A5`)
- Matrix mapping style: every requirement row has primary and supporting case IDs

## 9) Requirement-to-Test Traceability Matrix

This matrix maps raw requirements to executable test IDs in this document.

| Raw Requirement Area    | Requirement Detail                                              | Primary Case IDs          | Secondary/Supporting Case IDs      |
| ----------------------- | --------------------------------------------------------------- | ------------------------- | ---------------------------------- |
| Evaluation Scenarios    | Sunday Night Chaos                                              | `EV-01`                   | `R2-09`, `R6-01`, `R6-02`          |
| Evaluation Scenarios    | Overtime Trap                                                   | `EV-02`                   | `R4-01`, `R4-02`, `R4-04`          |
| Evaluation Scenarios    | Timezone Tangle                                                 | `EV-03`                   | `R8-01`, `R8-03`, `R2-08`          |
| Evaluation Scenarios    | Simultaneous Assignment                                         | `EV-04`                   | `R2-05`, `R6-04`                   |
| Evaluation Scenarios    | Fairness Complaint                                              | `EV-05`                   | `R5-01`, `R5-02`, `R5-03`          |
| Evaluation Scenarios    | Regret Swap                                                     | `EV-06`                   | `R3-01`, `R3-02`, `R7-01`          |
| User Management & Roles | Staff certified for multiple locations                          | `R1-01`                   | `R2-07`, `EV-03`                   |
| User Management & Roles | Staff have skills                                               | `R1-02`                   | `R2-02`, `R2-09`                   |
| User Management & Roles | Staff availability windows (recurring + exceptions)             | `R1-03`, `R1-04`          | `R2-08`, `EV-03`                   |
| User Management & Roles | Managers only manage assigned locations                         | `R1-05`                   | `R9-02`                            |
| User Management & Roles | Admin sees everything                                           | `R1-06`                   | `R9-03`                            |
| Shift Scheduling        | Create shift (location/date-time/skill/headcount)               | `R2-01`                   | `R2-02`, `EV-01`                   |
| Shift Scheduling        | Assign staff manually                                           | `R2-02`                   | `EV-01`, `EV-04`                   |
| Shift Scheduling        | Publish weekly schedule visible to staff                        | `R2-03`                   | `R6-01`                            |
| Shift Scheduling        | Unpublish/edit before cutoff only                               | `R2-04`                   | `R2-01`                            |
| Constraint Enforcement  | No double-booking across locations                              | `R2-05`                   | `EV-04`, `R6-04`                   |
| Constraint Enforcement  | Minimum 10-hour rest                                            | `R2-06`                   | `R2-09`                            |
| Constraint Enforcement  | Skill requirement enforcement                                   | `R1-02`, `R2-09`          | `EV-01`                            |
| Constraint Enforcement  | Certification requirement enforcement                           | `R2-07`                   | `R1-01`                            |
| Constraint Enforcement  | Availability requirement enforcement                            | `R2-08`                   | `EV-03`                            |
| Constraint UX           | Clear violation reason                                          | `R2-09`                   | `EV-01`                            |
| Constraint UX           | Suggest alternatives                                            | `R2-09`                   | `EV-01`, `EV-04`                   |
| Swap & Coverage         | Swap request workflow (A requests, B accepts, manager approves) | `R3-01`, `R3-02`          | `R7-01`                            |
| Swap & Coverage         | Drop request workflow                                           | `R3-03`                   | `R7-01`                            |
| Swap & Coverage         | Pending cap (max 3)                                             | `R3-04`                   | `R3-01`, `R3-03`                   |
| Swap & Coverage         | Drop expiry 24h before shift                                    | `R3-05`                   | `R3-03`                            |
| Swap & Coverage         | Edit shift cancels related swaps                                | `R3-06`                   | `A4`, `EV-06`                      |
| Swap & Coverage         | Original assignment unchanged until approval                    | `R3-02`                   | `EV-06`                            |
| Compliance              | Weekly warning/track thresholds                                 | `R4-01`                   | `EV-02`                            |
| Compliance              | Daily warning/block thresholds                                  | `R4-02`                   | `EV-02`                            |
| Compliance              | 6th/7th day rules + override reason                             | `R4-03`                   | `A3`                               |
| Compliance              | What-if preview before assignment                               | `R4-01`, `R4-02`, `R4-03` | `EV-02`                            |
| Compliance              | Overtime dashboard highlights risk                              | `R4-04`                   | `EV-02`                            |
| Fairness                | Premium shift tracking                                          | `R5-01`                   | `EV-05`                            |
| Fairness                | Desired hours variance                                          | `R5-02`                   | `EV-05`, `A2`                      |
| Fairness                | Fairness score distribution                                     | `R5-03`                   | `EV-05`                            |
| Realtime                | Staff see schedule updates without refresh                      | `R6-01`                   | `EV-01`                            |
| Realtime                | Swap updates in realtime                                        | `R6-02`                   | `EV-06`                            |
| Realtime                | On-duty dashboard updates live                                  | `R6-03`                   | `R4-04`                            |
| Realtime                | Immediate concurrent conflict feedback                          | `R6-04`                   | `EV-04`                            |
| Notifications           | Staff/manager event notifications persisted                     | `R7-01`                   | `R3-01`, `R3-02`, `R3-03`, `EV-06` |
| Notifications           | Read/unread lifecycle                                           | `R7-02`                   | `R7-01`                            |
| Notifications           | Preferences controls persist                                    | `R7-03`                   | `R7-01`                            |
| Calendar & Time         | Times handled correctly by location timezone                    | `R8-01`                   | `EV-03`, `A5`                      |
| Calendar & Time         | Overnight shift handling                                        | `R8-02`                   | `R2-01`                            |
| Calendar & Time         | DST-adjacent availability behavior                              | `R8-03`                   | `EV-03`                            |
| Audit Trail             | All schedule changes audited with before/after                  | `R9-01`                   | `R2-01`, `R2-02`, `R3-06`          |
| Audit Trail             | Managers can view shift history (scoped)                        | `R9-02`                   | `R1-05`                            |
| Audit Trail             | Admin export by location/date range                             | `R9-03`                   | `R1-06`                            |
| Ambiguity Decision      | Decertification keeps history, blocks future assignments        | `A1`                      | `R2-07`, `R9-01`                   |
| Ambiguity Decision      | Desired hours soft, availability hard                           | `A2`                      | `R2-08`, `R5-02`                   |
| Ambiguity Decision      | Any shift counts for consecutive day                            | `A3`                      | `R4-03`                            |
| Ambiguity Decision      | Approved swap then edit => cancel + notify + keep assignment    | `A4`                      | `R3-06`, `EV-06`                   |
| Ambiguity Decision      | Single IANA timezone per location                               | `A5`                      | `EV-03`, `R8-01`                   |
