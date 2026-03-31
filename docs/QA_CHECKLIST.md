# ShiftSync — Manual QA Checklist

Use this checklist to validate each phase manually on UI/API and report issues consistently.

## How to Report

For each case, record:

- **Case ID**
- **Result**: PASS / FAIL
- **Environment**: Local / Railway URL
- **Evidence**: screenshot/video/network log
- **Notes**: observed vs expected behavior

### How to Fill Fields

- **Result**: `PASS` if expected behavior happens, otherwise `FAIL`.
- **Observed**: brief factual outcome you saw.
- **Evidence**: screenshot filename, short video, or API/network response snippet.

Example (PASS):

```markdown
### P1-QR-02

Case: Login with `admin.paul@coastaleats.com` / `password123`; redirected.
Result: [ PASS ]
Observed: [ Redirected to `/profile` after submit. ]
Evidence: [ p1-qr-02-login-success.png, POST /api/auth/callback/credentials = 200 ]
```

Example (FAIL):

```markdown
### P1-QR-11

Case: Invalid profile payload (`desiredWeeklyHours: -5`); expect `400`.
Result: [ FAIL ]
Observed: [ API returned 200 and saved -5. ]
Evidence: [ p1-qr-11-response.png, response body snippet attached ]
```

---

## Test Execution Template

| Case ID    | Result | Environment | Evidence       | Notes                      |
| ---------- | ------ | ----------- | -------------- | -------------------------- |
| P1-AUTH-02 | PASS   | Local       | screenshot.png | Login redirects to profile |

---

## Phase 0 — Foundation & Deploy

- **P0-WEB-01**: Open `/`; page renders without crash.
- **P0-API-01**: `GET /api/health` returns `200` with `status: "ok"`.
- **P0-WS-01**: Connect to WS endpoint and receive `ws:connected` payload.
- **P0-DEPLOY-01**: Railway web URL responds.
- **P0-DEPLOY-02**: Railway WS URL accepts connection.

---

## Phase 1 — Auth, RBAC, Profile, Availability

### Phase 1 Quick-Run (10–12 min)

Run these first on every Phase 1 regression pass:

- **P1-QR-01**: Open `/auth/sign-in`; form renders.
- **P1-QR-02**: Login with `admin.paul@coastaleats.com` / `password123`; redirected.
- **P1-QR-03**: Login with wrong password; authentication fails.
- **P1-QR-04**: Open `/profile`; page loads while authenticated.
- **P1-QR-05**: Update name + desired hours; refresh and confirm persistence.
- **P1-QR-06**: Open `/availability`; page loads.
- **P1-QR-07**: Add recurring availability; confirm returned by `GET /api/availability`.
- **P1-QR-08**: Add exception availability; confirm returned by `GET /api/availability`.
- **P1-QR-09**: Delete one availability entry; confirm it is removed.
- **P1-QR-10**: Unauthenticated `GET /api/profile`; expect `401`.
- **P1-QR-11**: Invalid profile payload (`desiredWeeklyHours: -5`); expect `400`.
- **P1-QR-12**: Invalid availability payload; expect `400` with validation details.

### Auth & Access

- **P1-AUTH-01**: `/auth/sign-in` loads.
- **P1-AUTH-02**: Valid seeded login works and redirects.
- **P1-AUTH-03**: Invalid password fails.
- **P1-RBAC-01**: Unauthenticated user blocked from `/profile` and `/availability`.

### Profile

- **P1-PROF-01**: Update name and desired weekly hours, refresh, values persist.
- **P1-PROF-02**: Invalid profile payload gets `400` via API.

### Availability

- **P1-AVAIL-01**: Create recurring availability window.
- **P1-AVAIL-02**: Create exception availability window.
- **P1-AVAIL-03**: Delete an availability entry.
- **P1-AVAIL-04**: Invalid payload returns `400` with details.
- **P1-AVAIL-05**: Manager can view managed staff availability timeline (read-only).
- **P1-AVAIL-06**: Manager/API write attempt on availability returns `403`.
- **P1-AVAIL-07**: Admin availability page access is blocked in Phase 1.

---

## Phase 2 — Scheduling Core

- **P2-SHIFT-01**: Create shift with location/date/time/skill/headcount.
- **P2-ASSIGN-01**: Assign qualified/certified/available staff succeeds.
- **P2-ASSIGN-02**: Missing skill blocks assignment with clear reason.
- **P2-ASSIGN-03**: Missing location certification blocks assignment.
- **P2-ASSIGN-04**: Overlap double-booking blocked.
- **P2-ASSIGN-05**: 10-hour rest violation blocked.
- **P2-PUB-01**: Publish weekly schedule makes it staff-visible.
- **P2-PUB-02**: Edit/unpublish within cutoff blocked.
- **P2-ALT-01**: Alternative suggestions shown on conflicts.
- **P2-AUDIT-01**: Shift create/update/delete writes audit entries.
- **P2-AUDIT-02**: Assignment add/remove writes audit entries.

---

## Phase 3 — Swap & Coverage

- **P3-SWAP-01**: Staff A requests swap with Staff B.
- **P3-SWAP-02**: Staff B accepts; pending manager approval.
- **P3-DROP-01**: Staff creates drop request.
- **P3-LIMIT-01**: 4th pending request blocked (>3 rule).
- **P3-EXP-01**: Drop expires 24h before shift.
- **P3-EDIT-01**: Manager edit cancels pending/approved swap and notifies parties.
- **P3-STATE-01**: Original assignment remains until manager approval.

---

## Phase 4 — Compliance & Overtime

- **P4-WEEK-01**: Weekly 35+ warning appears.
- **P4-DAY-01**: Daily >8 warning appears.
- **P4-DAY-02**: Daily >12 hard block enforced.
- **P4-DAYS-01**: 6th consecutive day warning appears.
- **P4-DAYS-02**: 7th day requires override reason.
- **P4-WHATIF-01**: What-if panel shows assignment impact before confirm.
- **P4-DASH-01**: Dashboard highlights assignments causing overtime.

---

## Phase 5 — Fairness, Realtime, Notifications

- **P5-FAIR-01**: Premium shifts tracked (Fri/Sat evening).
- **P5-FAIR-02**: Fairness score updates based on assignments.
- **P5-FAIR-03**: Under/over scheduled vs desired hours shown.
- **P5-RT-01**: Schedule updates push to staff without refresh.
- **P5-RT-02**: Simultaneous assignment conflict appears immediately.
- **P5-RT-03**: Swap/drop updates broadcast in real-time.
- **P5-NOTIF-01**: Notification center stores read/unread state.
- **P5-NOTIF-02**: Notification preferences respected.
- **P5-ONDUTY-01**: On-duty dashboard updates live.

---

## Current Seeded Test Accounts (Phase 1)

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
