# ShiftSync — Location Timezone Contract

This document defines the canonical time model for ShiftSync.
It is the implementation contract for all calendar, scheduling, availability, compliance, swaps, notifications, and audit views.

---

## 1) Core Principle

**Location local time is the business truth.**

- Every shift belongs to exactly one location.
- Every location has one IANA timezone (example: `America/New_York`).
- Shift meaning is defined in that location timezone, not in user/browser timezone.

Example:

- `Mon 11:00 PM → Tue 3:00 AM` at Downtown (`America/New_York`) is that exact local window in New York.

---

## 2) Non-Negotiable Requirements

1. **Storage/processing correctness across user timezones**
   - User timezone must not change saved shift meaning.
2. **Display in location timezone**
   - Shift and availability times are rendered in the shift/location timezone.
3. **Recurring availability supports DST**
   - Recurring local wall-clock windows remain stable across DST changes.
4. **Overnight shifts are single shifts**
   - `11:00 PM → 3:00 AM` is one shift object spanning midnight.

---

## 3) Canonical Data Semantics

### 3.1 Shift Semantics

A shift is represented by:

- `locationId`
- `startUtc` (absolute instant)
- `endUtc` (absolute instant), where `endUtc > startUtc`

Interpretation rule:

- `startUtc` and `endUtc` are the UTC encoding of local datetimes entered in the shift location timezone.

### 3.2 Recurring Availability Semantics

Recurring availability is represented as local wall-clock constraints in location timezone:

- `dayOfWeek` (0..6, anchored to **start day**)
- `startMinuteLocal` (0..1439)
- `endMinuteLocal` (0..1439)
- `spansOvernight` (boolean)

Alternative equivalent encoding:

- `spansOvernight = endMinuteLocal <= startMinuteLocal`

### 3.3 Exception Availability Semantics

Exception availability is an absolute interval:

- `startUtc`, `endUtc` (or equivalent DateTime columns)
- always linked to a location

---

## 4) Input and Conversion Rules

### 4.1 Shift Create/Edit Input

Input from UI is local datetime values plus target location.

Required conversion pipeline:

1. Read location timezone from selected location.
2. Parse local datetime in that timezone.
3. Convert to UTC for storage.

Forbidden behavior:

- Parsing `datetime-local` directly using browser timezone for shift persistence.

### 4.2 Availability Input

Recurring:

- Persist local day/minute fields (not absolute UTC datetimes).

Exception:

- Parse local datetime using selected location timezone, then convert to UTC.

Forbidden behavior:

- Exception conversion based on browser timezone when location timezone is known.

---

## 5) Display Rules

1. Shift times:
   - Always formatted in shift location timezone.
2. Availability times:
   - Rendered in availability location timezone.
3. Labels:
   - Show timezone abbreviation where possible (example: `EDT` / `EST`) and/or IANA name in filters/details.
4. Cross-location manager pages:
   - Each row/card keeps its own location timezone context.

---

## 6) DST Behavior Contract

### 6.1 Recurring Availability (Wall-Clock Stability)

A recurring window `Mon 09:00–17:00` means:

- Monday 9 to 5 in that location, regardless of UTC offset changes.

Implication:

- UTC equivalent may shift seasonally (EST ↔ EDT), but local wall-clock schedule stays constant.

### 6.2 Shift Duration Through DST Changes

Shift duration is computed from UTC instants (`endUtc - startUtc`).

Examples:

- Spring forward night can yield shorter elapsed duration for same local clock span.
- Fall back night can yield longer elapsed duration for same local clock span.

This is expected and must be treated as correct elapsed time.

### 6.3 Ambiguous/Nonexistent Local Times

Policy for alignment (recommended):

- Nonexistent local times (spring forward gap): reject with explicit validation error.
- Ambiguous local times (fall back overlap): require disambiguation rule and apply consistently.

Recommended default disambiguation:

- Choose the **earlier occurrence** unless user explicitly selects otherwise.

---

## 7) Overnight Shift Contract

A shift with local end earlier than local start is interpreted as next-day end.

Example:

- Input: `2026-04-20 23:00` to `03:00` (same date entered for both)
- Interpretation: end local datetime becomes `2026-04-21 03:00`
- Persist as one shift with `endUtc > startUtc`

Validation:

- Must be one shift record.
- Must pass overlap/rest/compliance as one contiguous interval.

---

## 8) Constraint Engine Expectations

All assignment and availability checks must evaluate using location timezone semantics:

- Overlap checks: absolute UTC intervals.
- Rest windows: absolute elapsed hours.
- Recurring availability membership: location-local day/time matching with overnight support.
- Exception blocks: absolute interval overlap.

---

## 9) Acceptance Criteria

1. Creating same local shift from browsers in different user timezones yields identical `startUtc/endUtc`.
2. A shift displays the same local time for all users when viewed with location timezone formatting.
3. Recurring `09:00–17:00` continues matching at local 09:00 after DST transitions.
4. Overnight `23:00–03:00` saves and renders as one shift crossing midnight.
5. Availability and assignment outcomes do not drift when user timezone changes.

---

## 10) QA Scenarios to Enforce

1. **Cross-timezone creator parity**
   - Two users in different browser timezones create the same location-local shift; resulting UTC instants match.
2. **DST spring-forward recurring check**
   - Recurring local windows remain valid after transition.
3. **DST fall-back recurring check**
   - Recurring local windows remain local-wall-clock stable.
4. **Overnight shift assignment**
   - `23:00–03:00` shift can be created, assigned, and evaluated as one interval.
5. **Mixed-location board rendering**
   - Each shift row displays in its own location timezone with clear label.

---

## 11) Implementation Boundary

This contract is normative. If code behavior conflicts with this document, the code must be updated to match this contract.
