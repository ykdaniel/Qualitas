# Known Architectural Debt / Backlog

This file tracks known functional and architectural issues that are **not**
yet fixed. Each item has enough context that future you (or a new
collaborator) can pick it up without re-investigating from scratch.

Items are roughly ordered by impact. Nothing in here is a blocker for
day-to-day use of the app; everything is a future-proofing concern.

---

## 1. Foreign keys should reference `id`, not `referenceNo` / `documentNumber`

**Where:**
- `models.py`: `NCR.noiNumber → noi.referenceNo`, `ITR.noiNumber → noi.referenceNo`,
  `ITR.ncrNumber → ncr.documentNumber`, plus the `Checklist` cross-references
  which the code itself flagged as "非 FK，避免編號異動時約束斷裂".

**The problem:**
All cross-module foreign keys currently use the human-readable reference
number as their join key. Reference numbers can be **regenerated** — see
commit `4bdab0a8` "fix(noi): improve referenceNo regeneration to check
abbreviation mismatch". Every regeneration silently breaks any rows that
pointed at the old number. The workaround adopted in `Checklist` is to
drop the FK constraint entirely ("非 FK"), which removes the only layer
that would have told us about the breakage.

**Why it was not fixed here:**
The fix touches every model, every repository query that joins on these
columns, every router that exposes the IDs, and every frontend component
that reads them. It needs a data migration that walks every NCR/ITR/etc.
row, looks up the referenced NOI/NCR by current referenceNo, and
backfills a new `noi_id`/`ncr_id` FK column. High risk, multi-day job.

**What to do when you tackle it:**
1. Add nullable `*_id` columns next to the existing string columns.
2. Write a migration that populates them.
3. Dual-write in services (keep both columns populated on create).
4. Switch joins to use the new columns.
5. Switch the frontend to read the new columns.
6. Drop the string columns.

---

## 2. SQLite concurrency on sequence generation

**Where:** `core/utils.py::generate_reference_no`.

**Current state (after this commit):**
Protected by a process-level `threading.Lock` (`_reference_seq_lock`).
That's enough for a **single-worker** uvicorn deployment, which is what
the NAS docker-compose stack currently runs. The lock does **not**
protect a multi-worker deployment.

**Why it was not fully fixed here:**
The proper fix is either:
- Move to PostgreSQL, where `SELECT ... FOR UPDATE` actually locks
  (SQLite silently ignores `FOR UPDATE`); or
- Add a cross-process lock (file lock, Redis, or similar).

Either option is a deployment change, not a code change. Needs a decision
on production DB.

**Smoke test to reproduce the old bug (when moving to multi-worker):**
Open two browser tabs logged in, click "Create NCR" in both at exactly
the same time, with no `-workers=1` on uvicorn. If you see two NCRs with
the same `documentNumber`, the cross-process lock is missing.

---

## 3. Optimistic concurrency on record updates

**Problem:**
Two users opening the same NCR edit screen, making different changes,
and clicking Save — the second save silently overwrites the first. There
is no `version` / `updated_at` check, no 409 Conflict, no UI warning.

**Fix outline:**
1. Add `version INTEGER NOT NULL DEFAULT 0` to each user-editable model
   (NCR, NOI, ITR, ITP, OBS, PQP, Audit, FollowUp, FAT).
2. Update repository `update()` methods to `WHERE id = ? AND version = ?`
   and increment version on success.
3. Raise `StaleDataError` → map to HTTP 409 in routers.
4. Frontend: on 409, show "this record was changed by someone else,
   reload to see the latest version" and re-fetch.

**Why not now:** touches every write path in 9 modules, plus migrations,
plus frontend error handling. Do it as its own focused PR.

---

## 4. Refresh token in localStorage

**Where:**
- `react-app/src/services/api.ts` lines 23, 68, 93-94, 113-114
- `react-app/src/context/AuthContext.tsx` lines 38, 49, 58-60, 67-68

**Problem:**
Both `token` (access) and `refreshToken` live in `localStorage`. Any XSS
(a rogue dependency, a mis-escaped `dangerouslySetInnerHTML`) can
exfiltrate both. The refresh token has 7-day validity per `core/config.py`,
so a single theft persists.

**Fix outline:**
1. Backend `/api/auth/login`: set refresh token via
   `response.set_cookie('refresh_token', ..., httponly=True, secure=True,
   samesite='strict', max_age=...)`. Stop returning it in JSON.
2. Backend `/api/auth/refresh`: read from cookie instead of request body.
3. Backend: `settings.CORS_ORIGINS` already exists; ensure the FastAPI
   CORSMiddleware has `allow_credentials=True`.
4. Frontend `api.ts`: remove all `localStorage.*refreshToken` code; add
   `credentials: 'include'` to login and refresh fetches. Access token
   stays in memory (or in a Zustand store), not localStorage, so a page
   reload triggers a silent refresh via the cookie.
5. Logout: backend clears the cookie; frontend clears memory state.

**Gotcha:** will invalidate every existing session at deploy time. Do it
during a maintenance window or announce it.

**Why not now:** medium-sized change touching backend auth + CORS +
frontend auth + login UX + tests. Should be its own PR with a reviewer.

---

## 5. Default admin credentials (partially fixed)

**Status after this commit:**
- **New installs** now refuse to seed an admin in production without
  `INITIAL_ADMIN_PASSWORD` env var, and auto-generate a strong random
  password in development (printed once on first boot).
- **Existing installs** with the legacy `admin`/`admin` password get a
  loud startup warning on every boot until the password is changed.

**Remaining work:** there is no "force password change on first login"
mechanism. If the user ignores the warning and keeps `admin`/`admin`,
nothing stops them. Adding a `must_change_password` flag on the user
model + a login-flow interceptor would close this. Small job, but it
touches auth middleware and the login UI.

---

## 6. OBS workflow: `Closed → Open` reopening is ambiguous

**Where:** `core/utils.py::WorkflowEngine.TRANSITIONS["OBS"]`

```python
"OBS": {
    # Compatible with both simple UI statuses and legacy workflow data
    "Open": ["In Progress", "Resolved", "Closed", "Void"],
    "In Progress": ["Resolved", "Closed", "Open", "Void"],
    "Resolved": ["Closed", "Open", "Void"],
    "Closed": ["Open", "Void"],   # ← reopen is allowed
    "Void": []
}
```

**Problem:**
The comment says "compatible with both simple UI statuses and legacy
workflow data" — meaning we're letting the data model serve two different
workflows at once. This is the kind of compromise that quietly rots:
reopening a Closed record leaves no audit trace of "reopened", no
timestamp reset, no notification semantics.

**What to decide (with the business users):**
- Is `Closed` meant to be terminal, or is reopening a real workflow?
- If reopening is real, add an explicit `Reopened` state with its own
  semantics (who can do it, under what conditions, what happens to the
  original close-out date).
- If reopening is not real, remove `"Open"` from `"Closed"` and write a
  one-off migration that cleans up any legacy records that got into this
  state by accident.

**Why not now:** business decision, not a code decision. Need input from
the actual users of the OBS module.

---

## 7. Audit logging is called manually at every CRUD site

**Where:** every service file calls `log_audit(...)` immediately after a
create / update / delete.

**Problem:**
- Easy to forget when adding a new method (bulk delete, imports, etc.).
- `old_value` / `new_value` dicts are hand-built and can drift from the
  actual DB state.
- Every test has to mock `log_audit` separately.

**Fix outline:**
Use SQLAlchemy `before_flush` / `after_flush` events in `database.py` to
auto-write to `AuditLog` based on the session's `new`, `dirty`, and
`deleted` sets. Stash the request's `user_id` / `username` on
`session.info` in an auth middleware so the listener can read it.

**Gotchas:**
- The listener must skip `AuditLog` itself (infinite recursion).
- `get_history()` gives you `(added, unchanged, deleted)` for each
  attribute — that's what the `new_value` dict becomes.
- Every existing test that does `mock_log.assert_called_once()` will
  break; those assertions should be rewritten to count audit rows.

**Why not now:** real refactor, breaks all existing tests, needs
context-propagation plumbing. Worth doing, but deserves a dedicated
afternoon.

---

## 8. `ReferenceSequence` is keyed on vendor abbreviation, not vendor ID

**Where:** `models.py::ReferenceSequence`, `core/utils.py::generate_reference_no`.

**Problem:**
If you delete vendor "廠商A" (abbreviation `A`) and later create a new
"廠商A" (also `A`), the new vendor inherits the **old vendor's sequence
counter**. New NCRs for the new vendor will start numbering from where
the old one left off — no collision, but also no isolation. More subtly:
if two vendors happen to map to the same abbreviation (fallback rule
truncates to first 10 alphanumeric uppercase chars), they silently share
a counter.

**Fix:** change the `ReferenceSequence` unique key from
`(project, vendor_abbrev, doc)` to `(project, vendor_id, doc)`, backfill
from existing data. Small migration, but touches every existing sequence
row.

---

## 9. SQLite `WAL` + backup consistency

**Where:** `backend/main.py` startup backs up `qualitas.db` via a file
copy.

**Problem:**
If the database is in WAL mode (SQLite's default for reasonable
concurrency), a naive `cp` of `qualitas.db` without also copying the
`-wal` and `-shm` files can produce an inconsistent backup. The user
will discover this the day they actually need to restore from a backup.

**Fix:** use the SQLite online backup API (`db.backup(target)` in
Python) or run `sqlite3 qualitas.db ".backup target.db"` via subprocess.
Both handle WAL correctly. Small change in the startup backup routine.

---

## 10. `[AUTO-GENERATE]` sentinel in checklist records (partially fixed)

**Status after this commit:**
The backend now prefers `None` for "please auto-generate" and accepts
`"[AUTO-GENERATE]"` only as a deprecation-logged fallback. The **frontend**
still sends the sentinel (see `react-app/src/store/checklistStore.ts`
line 63, which has a HACK comment acknowledging this).

**Remaining work:** when the Zustand refactor is done, update the
frontend to send `null` instead of `"[AUTO-GENERATE]"`, then remove the
fallback branch in `services/checklist_service.py`.

---

## 11. Cross-module workflow (not started)

**The gap:**
Qualitas modules (ITP / NOI / ITR / NCR / PQP / OBS / FAT / FollowUp)
each have their own CRUD + status, but the **business process that
connects them** is not modelled anywhere. A user who raises an NCR
from a failing ITR has to manually copy the vendor, reference numbers,
and dates between modules; a manager looking at an ITP cannot see the
NOIs / ITRs / NCRs that descend from it; nobody has a unified "what's
waiting on me across all modules" view; and there is no enforcement
that work flows through the intended sequence.

The data model has some of the FKs already (NOI→ITP, ITR→NOI,
NCR→NOI) but key links are missing: **PQP→ITP is absent entirely**
(PQP is an island), and **NCR→ITR only goes through NOI** so you
can't trace an NCR back to the specific failing inspection report
in one hop.

**The five pain points this initiative is meant to fix** (in
dependency order — each builds on the previous):

1. Cannot see relationships between documents
2. Creating a linked document requires manual copy/paste of key fields
3. No global "my tasks" view across modules
4. The process has no teeth — users can skip steps
5. Managers have no view of process health (cycle time, stuck items,
   vendor compliance trends)

**Planned approach:**
Five phases, each independently shippable:

| Phase | Addresses | Core change | Risk |
|---|---|---|---|
| 1. Trace + Create-from | 1, 2 | Fill missing FKs, add `<RelatedDocuments/>` shared component, add "Create from" buttons | Low |
| 2. Business event log | 4, 5 (base) | Extend `AuditLog` (or add `business_events`) to record non-CRUD events like `ITR.failed`, `NCR.raised`; emit from services | Low |
| 3. Cross-module inbox | 3 | Aggregation query + "My Tasks" dashboard | Medium |
| 4. Rules + enforcement | 4 | Python rule engine (hardcoded rules to start); transition gates | Med-high |
| 5. Dashboards / metrics | 5 | Cycle time, open items, SLA compliance views | Medium |

**Phase 1 is split into five PRs** for independent review:
- PR1 — `<RelatedDocuments/>` component using existing FKs only
  (no schema change). **Detailed plan:**
  `docs/workflow/phase1-pr1-related-documents.md`
- PR2 — Add `NCR.itr_id` FK + data migration (back-fill via NOI)
- PR3 — Add `ITP.pqp_id` FK (manual link, no auto back-fill)
- PR4 — "Create from" buttons, starting with ITR → NCR
- PR5 — Evaluate whether OBS / FAT / FollowUp should join the chain

**Why it was not fixed here:**
Scope: this is a multi-month initiative, not a single PR. It needs
product-level sequencing decisions (which pain point to solve first),
and Phase 1 PRs 2 and 3 partially overlap with backlog item **#1**
(the `referenceNo` → `id` FK migration) — that work should be
folded in rather than done twice.

**What to do when you pick it up:**
1. Start with `docs/workflow/phase1-pr1-related-documents.md`
2. Answer the six open design questions in that doc's final section
3. Ship PR1 (pure UI, zero schema risk) and review the UX before
   committing to PR2+
4. When tackling PR2 / PR3, coordinate with backlog item **#1** so
   the FK refactor is done once, not twice

---

## Not on this list (and why)

- **Migrating SQLite → Postgres.** Real production move, not a code
  change. Blocks #2 and #9 being fixed properly, but is itself blocked
  on the deployer deciding to run a Postgres container on the NAS.
- **Full rate limit audit.** Rate limiter middleware exists in
  `backend/middleware/rate_limiter.py` but I have not verified it's
  mounted on the login route or that the limits are sensible. Quick win
  if you want it — half an hour.
- **File upload hardening.** `/api/files/upload` exists; I have not
  audited path traversal, MIME sniffing, size limits, or same-origin
  serving. Do this before any untrusted user can upload.
- **OpenAPI schema for frontend code generation.** The backend publishes
  `/openapi.json`; the frontend hand-writes API types. Drift is
  inevitable. `openapi-typescript` can generate them automatically. Nice
  to have, not urgent.
