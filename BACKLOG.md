# Known Architectural Debt / 


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

## 4. Refresh token in localStorage  ·  ✅ DONE 2026-06-03

JWTs are now delivered **only** as httpOnly cookies — the XSS exfiltration
surface is closed.
- Backend `/api/auth/login` + `/api/auth/refresh` set httpOnly `access_token` /
  `refresh_token` (+ non-httpOnly CSRF) cookies and return `AuthResult`
  (`{token_type}`) — **no token values in the JSON body** (`routers/auth.py`,
  `schemas.AuthResult`). Refresh reads the token from the cookie.
- Frontend carries auth entirely via the cookie (`api.ts` `withCredentials`,
  CSRF echoed in the `X-CSRF-Token` header); **all `localStorage` token code
  removed** from `api.ts`, `AuthContext.tsx`, `Login.tsx`. `get_current_user`
  already reads the cookie (`core/security.py`), and `/auth/verify` re-hydrates
  auth state on mount/reload.

**Deploy note:** any session that predates the cookie rollout (localStorage-only,
no auth cookie) is forced to re-login once the new frontend ships. Sessions that
logged in after the 2026-06-03 cookie deploy already have cookies and continue
uninterrupted.

---

## 5. Default admin credentials (partially fixed)

**Status after this commit:**
- **New installs** now refuse to seed an admin in production without
  `INITIAL_ADMIN_PASSWORD` env var, and auto-generate a strong random
  password in development (printed once on first boot).
- **Existing installs** with the legacy `admin`/`admin` password get a
  loud startup warning on every boot until the password is changed.

**Remaining work:**
1. _(code)_ there is no "force password change on first login" mechanism. If
   the user ignores the warning and keeps `admin`/`admin`, nothing stops them.
   Adding a `must_change_password` flag on the user model + a login-flow
   interceptor would close this. Small job, but it touches auth middleware and
   the login UI.
2. _(ops, do once on prod)_ verify the seeded `admin` account on
   qualitas.rokusumi.net is NOT still on the legacy `admin` password — check
   the backend startup logs for the "still using the legacy password" warning;
   if present, change it via the UI or re-seed with `INITIAL_ADMIN_PASSWORD`.

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

## 12. NCR monthly statistics (feature gap)

**Where:**
- Dashboard currently has `NCRParetoChart` / `NCRStatsCard` but no
  time-series view. `NCR.raiseDate` and `NCR.closeoutDate` are already
  on the model — the data is there, the aggregation isn't.

**What's missing:**
Month-by-month trend of NCRs raised vs closed, with status / type /
vendor breakdowns. A plan existed as `react-app/NCR_MONTHLY_STATISTICS_PLAN.md`
(deleted 2026-04-19, see git history) but sat untouched for 3 months.

**Recommended approach when picked up:**
Group by `raiseDate` / `closeoutDate` in the client (no new schema —
dodges backlog item **#1**'s FK problems). Scope to core metrics
first: monthly new, monthly closed, rolling 12-month trend. Add
type / vendor breakdowns only if the core view earns its keep.
Avoid the "monthly snapshot table" alternative unless historical
reporting becomes a hard requirement.

---

## 13. NCR field-model gaps (ISO 9001 completeness)  ·  CORE DEPLOYED 2026-06-04

**Status 2026-06-04:** core first cut (#1 severity, #2 person FKs, #3
effectiveness, #4 disposition enum, #5 date format, #6 status) **implemented
backend + frontend and DEPLOYED to qualitas.rokusumi.net** (218 backend tests
pass; frontend tsc/build clean). Two implementation adaptations vs the original decisions:
- **#5 was already done** — `validate_date_format` already enforces `YYYY-MM-DD`
  on the NCR date fields; only added `effectivenessVerifiedDate` to it.
- **#6 reused the existing `Resolved` workflow state** as the "pending
  effectiveness verification" state instead of adding a separate "Pending
  Verification" — the WorkflowEngine already had `Open→In Progress→Resolved→
  Closed`; adding a duplicate state would have been confusing. Added the
  `Resolved→In Progress` transition for the effectiveness=No reroute.
- **SLA days are constants** (`NCR_SLA_DAYS` Major 7 / Minor 14 in `ncr_service`),
  NOT yet the KPIWeight-style configurable setting — that's a fast-follow.
- `closedBy` / `verifiedBy` / `effectivenessVerifiedBy` are **stamped
  server-side** on the relevant action (no manual form picker); only `assignedTo`
  has a user dropdown.

Captured 2026-06-04 from a review of the `NCR` model + form. The model is
already thorough (corrective-action chain `immediateCorrectionAction` →
`rootCauseAnalysis` → `correctiveActions` → `preventiveAction`, disposition,
product-integrity statements, defect/improvement photos). These are the gaps
worth discussing — **not yet decided, do not build until reviewed.**

**🔴 Substantive gaps**
1. **Severity / classification** — MISSING. The existing `type` field is a
   *cause* category (Design / Material / Workmanship / Document), not a severity.
   Without severity there is no triage, no per-severity SLA, and no meaningful
   KPI / owner reporting.

   **✅ DECIDED 2026-06-04 — ready to build:**
   - **Two tiers only: `Major` / `Minor`.** No "Observation" tier — observations
     are a separate record type (the OBS module); keeping it off NCR avoids
     blurring the two. No numeric 1–4 scale (poor inter-rater consistency; the
     likelihood axis is meaningless for an already-realized nonconformance).
   - **Definitions (these MUST be surfaced in the UI so users pick correctly —
     inline help / tooltip next to the severity selector, both zh + en):**
     - **Major:** affects fitness-for-purpose / structural integrity / safety /
       code or contract compliance; OR is a repeat / systemic issue. Requires
       formal disposition + root cause + owner/PQM sign-off; not closable by the
       contractor alone.
     - **Minor:** isolated, easily corrected, no impact on function or integrity.
       Contractor corrects + QA verifies to close.
   - **Severity drives the `dueDate` SLA**, auto-filled but overridable:
     Major → **7 days**, Minor → **14 days** from `raiseDate`. Defaults are a
     **global configurable setting** (same pattern as `KPIWeight`) so the PQM can
     tune per project/contract. Manual override of `dueDate` is allowed and
     **audit-logged**. Not hard-locked (a Major may legitimately need longer,
     e.g. awaiting a design disposition).
   - Implementation: nullable `severity` enum column (idempotent
     `_add_column_if_missing`), a global SLA-days config row, a form select with
     the inline definitions above, and `dueDate` auto-population on create.
2. **Accountability identities are name-strings, and closure has no signer** —
   `raisedBy` / `foundBy` are free text; there is **no `assignedTo`** (who must
   close it) and **no `closedBy` / `verifiedBy`**. `closeoutDate` records *when*
   but not *who*. Reminders (`last_reminded_at`) fire but target nobody specific.

   **✅ DECIDED 2026-06-04 — ready to build:**
   - Add `assignedTo`, `closedBy`, `verifiedBy` as **FK columns to `users.id`**
     (account links, not free-text names), nullable, **`ondelete=SET NULL`**.
   - **History is NOT stored on the NCR.** The existing `log_audit` already
     captures who-did-what-when (with the username snapshotted at the moment),
     and that audit trail is the immutable system of record. So the FK fields
     serve the *live* state + workflow (assignee filtering, targeted reminders,
     showing the current signer); if a user is later deleted the FK goes NULL but
     the audit log still holds the historical truth. No name-snapshot column.
   - **`assignedTo` is a person, not an organisation.** The contractor *company*
     is already on `vendor_id`; `assignedTo` adds *which individual* is on the
     hook to close it (so reminders/escalation target a real person).
   - **`closedBy` / `verifiedBy`** are internal QA / PQM — they always have
     accounts. **`assignedTo`** may be a contractor-side person; that person must
     have an account to be assignable. If they don't, **create a contractor login
     for them** (P0 already supports contractor-scoped logins) — do not fall back
     to free-text.
3. **No corrective-action effectiveness verification** — ISO 9001 §10.2 requires
   reviewing whether the corrective action worked. We have `preventiveAction` +
   `reInspectionNumber` but no explicit "effectiveness verified (Y/N) + by +
   date". An auditor would raise a finding on this.

   **✅ DECIDED 2026-06-04 — ready to build:**
   - Add an effectiveness-verification step, **required for ALL NCRs** (not just
     Major). This is the "did the corrective action actually prevent recurrence?"
     check done some time *after* the action — distinct from `reInspectionNumber`,
     which re-inspects the repaired item itself.
   - Fields:
     - `effectivenessVerified` — `Pending` / `Yes` / `No` (default Pending).
     - `effectivenessVerifiedBy` — FK to `users.id` (same convention as gap #2).
     - `effectivenessVerifiedDate`.
     - `effectivenessNotes` (optional) — how it was verified, e.g. "next 3 pours
       inspected, no recurrence".
   - **Gates closure:** an NCR cannot move to `Closed` until
     `effectivenessVerified = Yes`. `No` should route it back (re-open / new
     action). _(Confirm exact gate behaviour at build time.)_
4. **`productDisposition` is a free string** — should be a controlled enum.
   Free text blocks aggregation and yields inconsistent wording (重做 / 返工 /
   rework are all the same thing today).

   **✅ DECIDED 2026-06-04 — ready to build:**
   - Controlled enum, **4 values** (the standard mutually-exclusive set, framed
     as "does the nonconforming item stay in the works?"):
     1. **Use-as-is** 照用 — stays, unchanged (usually needs a concession/waiver).
     2. **Rework** 重作 — stays, corrected to *fully* meet the original spec.
     3. **Repair** 修補 — stays, made usable but *not* fully to original spec
        (requires approval; distinct from Rework — auditors care about this line).
     4. **Reject** 拒收 — does NOT stay (scrapped OR returned to supplier).
   - **Merged the old "Reject/Scrap" + "Return to supplier" into one `Reject`** —
     they are the same *quality* decision ("not used"); scrap-vs-return is only
     downstream logistics. If tracking scrap-vs-return is ever needed, add it as a
     sub-note under Reject, NOT as a second top-level option.
   - Definitions should be surfaced in the UI (same as severity), esp. the
     Rework-vs-Repair distinction.

**🟡 Data-quality / structural**
5. **All NCR dates are `Column(String)`** (`raiseDate`, `closeoutDate`,
   `dueDate`) — no validation, string-based sorting, timezone-ambiguous. Part of
   the broader SQLite/date debt; overlaps item **#1**.

   **✅ DECIDED 2026-06-04 — ready to build:**
   - **Now (cheap, low-risk): enforce ISO `YYYY-MM-DD` format** at the Pydantic
     schema layer for the NCR date fields. This blocks garbage values, makes
     string sort == chronological order, and keeps SLA/overdue math reliable.
     These are dates (not timestamps), so timezone is moot.
   - **Deferred: do NOT migrate `String` → real `DATE` columns in this NCR work.**
     The whole app stores dates as strings (ITP/ITR/NOI/OBS…); converting only
     NCR would make it inconsistent and carries migration risk on existing data.
     The real type migration should be a deliberate **system-wide** effort done
     alongside backlog item **#1** (FK migration), not piecemeal on NCR.
6. **`status` is a free string**, only the UI constrains it to
   Open / In Progress / Closed / Void; nothing enforced server-side → dirty-data
   risk.

   **✅ DECIDED 2026-06-04 — ready to build:**
   - **Add one status: `Pending Verification`** (待驗證). Lifecycle becomes:
     `Open → In Progress → Pending Verification → Closed`, plus `Void`. The new
     state makes the (now mandatory, per gap #3) "action done, awaiting
     effectiveness check" phase visible on the board instead of hidden.
   - **`effectivenessVerified = No` routes back to `In Progress`.** No separate
     `Reopened` state — reopen/recurrence counting is deferred to gap #7.
   - **Enforce the status set server-side** (Python `Enum` + Pydantic validation
     in the create/update schemas, and a guard in the service) to block dirty
     data. SQLite won't enforce an enum at the column level, so enforcement lives
     at the schema/service layer.
   - **Explicitly NOT building the P1 approval state machine** (Draft / Submitted
     / Under Review / Approved…). That stays in roadmap **P1** (deferred to last).
     This is just the minimal lifecycle the #1/#3 decisions require.
7. **No recurrence / systemic-CAPA link** — can't flag a repeat nonconformance
   or roll several NCRs up to one systemic corrective action for trend analysis.

   **⏸ DEFERRED 2026-06-04 — not in this cut.** Revisit after the core NCR
   improvements (#1–#6) ship and there is real data, and design it together with
   reporting (roadmap **P8**). Rationale: a full CAPA object is almost its own
   module (overlaps P8, cross-module workflow #11, and the existing related-docs
   graph) — scope creep here; and a half-baked `isRecurring` boolean gives little
   value without the grouping/analysis behind it. Recurrence analysis is best
   designed once there's actual data to shape it. (Note: gap #1 already treats a
   repeat/systemic issue as Major — that judgement stays manual until #7 is built.)

**🟢 Nice-to-have (depends on owner requirements)**
8. **Discipline / trade classification** for trend analysis — there is
   `foundLocation` but no discipline. (ITR already has a `discipline` field —
   but as a *free string*.)

   **✅ DECIDED 2026-06-04 — ready to build:**
   - **Add `discipline` to NCR now** (cheap; start capturing data immediately so
     it's ready when reporting/P8 lands — no backfill later). Unlike #7 this is
     just one classification column, not a design-heavy feature.
   - **Controlled enum (fixed list), not free string** — the whole value is
     aggregation; free text (Civil / 土建 / civil) would defeat it.
   - **Initial list (may be simplified/refined later):** Civil 土建 /
     Structural 結構 / Mechanical 機械 / Electrical 電氣 / Piping 管路 /
     Architectural 建築.
   - **Consistency note:** ITR's existing `discipline` is a free string. NCR will
     use the controlled list; ITR should adopt the *same* list later — deferred
     here to avoid scope creep, but flagged so the two don't drift.
9. **Cost / quantity of nonconformance** — commonly wanted for owner reporting.

   **⏸ DEFERRED 2026-06-04 — not in this cut.** Design together with reporting
   (roadmap **P8**), and **first settle the process: who fills in cost and how
   it's estimated.** Rationale: cost is sensitive, low-confidence and contentious
   (back-charges) — captured ad-hoc it's mostly blank/garbage; and quantity needs
   a unit (m³ / m / each / m²…) that can't be aggregated across NCRs, so the
   reporting value is limited. The core (#1–#6) + discipline (#8) already give
   strong reporting dimensions; cost/quantity is the lowest-value, highest-
   friction item, so it waits.

**Suggested cheap first cut (if approved, ~half a day, no need to wait for P1):**
severity enum (#1) + disposition enum (#4) + effectiveness-verified fields (#3)
+ `closedBy` / `verifiedBy` (part of #2). Each is an additive nullable column
(migration is idempotent `_add_column_if_missing`) plus a few form fields.

**Open questions to settle first:**
- ~~Severity scheme + whether it drives the SLA~~ → **resolved 2026-06-04, see gap #1.**
- ~~`assignedTo` / `closedBy` / `verifiedBy`: FK to users vs free-text?~~ →
  **resolved 2026-06-04 (FK to users), see gap #2.**
- ~~Disposition enum list?~~ → **resolved 2026-06-04 (4 values, Reject merged),
  see gap #4.**

---

## 14. NCR form (NCRModals.tsx) issues  ·  FOR DISCUSSION

Captured 2026-06-04 from a review of `react-app/src/components/NCR/NCRModals.tsx`
(the edit + view modals). The form is feature-complete (info → photos → personnel
→ disposition → corrective actions → re-inspection → quality), but has real bugs
plus structure/UX problems. **Not yet decided — discuss before fixing.** Some
items overlap the #13 data-model work and should be done together.

**🔴 Bugs (correctness, not taste)**
1. **ITR number is double-bound to one field, rendered twice, two input types.**
   `NCRModals.tsx:308` (Info section) is a **dropdown**; `NCRModals.tsx:701`
   (Re-inspection section) is a **free-text** input — both bound to the same
   `itrNumber`. Editing one changes the other. Conceptually these are *two
   different ITRs* (the one that triggered the NCR vs. the one that verifies
   closure); the form currently **cannot record both**. Likely needs a second
   field (e.g. `verificationItrNumber`) — overlaps #13.
2. ~~**View modal shows status as binary.**~~ **FIXED 2026-06-04** — the view
   modal now maps all five statuses (was `status === 'open' ? Open : Closed`).
3. **Two "ghost" fields the form can't edit.** `projectQualityManager` (PQM) and
   `aconex` (external doc-control ref) exist in `NCRDetailData` / init / view
   data but have **no input** in the edit form — they can never be set.
4. ~~**Status option set is inconsistent across the app.**~~ **WITHDRAWN
   2026-06-04** — re-check shows `columns.tsx` already lists all five incl.
   Resolved (earlier finding was a grep artifact). The #13 #6 work added
   server-side enforcement of the canonical set, so this is covered.

**🟡 Structure / UX**
5. **`productDisposition` is mis-grouped** under "Personnel / Location"
   (`NCRModals.tsx:511`, next to foundBy / serialNumbers) instead of the
   Disposition section.
6. **Two ambiguous primary buttons "Publish / Save"** (`NCRModals.tsx:826`).
   Publish auto-bumps the revision; users can't easily tell when to use which,
   and "Publish" is a hard-coded English label (untranslated).
7. **"Required fields" hint with no actual required validation.** The hint shows
   (`NCRModals.tsx:281`) but subject / contractor / raiseDate / description are
   never enforced — misleading.
8. **Closure QC check is frontend-only** (`NCRModals.tsx:222`, requires
   disposition + re-inspection ref) — bypassable, and not yet wired to the #13
   #3 effectiveness-verification gate.
9. **TBC / NA / Add-date buttons inject magic strings** ("To be confirmed",
   "Not Applicable", a date stamp) into free-text fields — not structured, can't
   filter "still TBC".
10. **One very long single-scroll modal** (8 sections, dozens of fields) — hard
    to fill on a tablet in the field; consider tabs / collapsible sections.

**🟢 Overlaps with #13 (do together)**
- No severity selector yet (#13 #1); contractor is stored as a **name string**
  (`NCRModals.tsx:385` uses `contractor.name` as the value, not the id) — rename
  breaks the link; dates use a fragile text↔date input toggle.

**Suggested split when picked up:** fix the 🔴 bugs first (small, high-value:
ITR double-bind, binary view status, ghost fields, status-set unification),
then fold the 🟡/🟢 into the #13 build so the form is reworked once.

**UPDATE 2026-06-05 — RHF + zod refactor, validation, and 7-section reorg shipped.**
Fixed by this work:
- #5 `productDisposition` now lives under the Disposition section.
- #6 the ambiguous **Publish** button was removed — every save goes through
  validation (it also had a dead rev-bump and bypassed the QC gate).
- #7 required fields are now real and enforced: drawingNo / specNo / qtyAffected
  / extent + the closure-gate fields, validated **at closure** via zod, with
  conditional `*` markers and inline errors (no longer a misleading hint).
- #8 the closure QC check is now a single zod gate that **includes** the #13 #3
  effectiveness-verification requirement (+ disposition/recurrence coupling).
- #1 *partially* — the redundant duplicate ITR input was removed; a distinct
  `verificationItrNumber` (trigger ITR vs. closure-verifying ITR) is still not
  modelled.
- #10 *partially* — form regrouped into 7 lifecycle sections + a collapsible
  optional block, but it's still one scroll (no tabs).
- Also fixed outside this section: file-router cookie auth (opening a record
  with attachments logged the user out), and the BACKLOG #15 fields not
  persisting on **create** (only update). IAM: created-date column + populate
  on create + delete-button gating + surfacing backend error detail.

Still open (NCR form / model), roughly by value:
- **a. Status workflow / state-machine.** `status` is a free dropdown — you can
  jump Open→Closed, and Resolved vs Closed is undefined. Add legal-transition
  enforcement and clarify the terminal states.
- **b. Hardcoded bilingual labels.** The #15 / reorg fields (e.g. "圖號 Drawing
  No.", the section titles) are literal zh+en strings, not `t()` keys — they
  don't switch with language. Move into LanguageContext.
- **c. `qtyAffected` is free text** — make it numeric so it can be aggregated
  (feeds #12 monthly stats).
- **d. Closure requires no evidence** — the gate only checks a re-inspection
  *number*; consider requiring a re-inspection photo / attachment before Closed.
- **e. Engineering / Design authority approver field is missing** — "Use As Is
  / Repair" needs sign-off, and print-report cell 6.3 is permanently blank
  because there's no field. Needs a new column (ideally a user FK) — overlaps
  #13 / #15.
- **f. Ghost fields** (item 3 above): `projectQualityManager` / `aconex` still
  have no edit input.
- **g. TBC / NA / Add-date magic strings** (item 9 above) are still unstructured.
- **h. `NCRDetailsViewModal` is dead code** — not routed anywhere, and still
  uses the pre-reorg layout. Delete it or sync it.
- Carry-overs tracked elsewhere: ITR/NOI stored as number not `id` (#1 at top),
  SLA days as constants + string dates (#13), contractor stored as a name
  string (🟢 above).

---

## 15. NCR formal print report  ·  STAGE B DONE (placeholder header) · STAGE A = TODO

**Status 2026-06-04:** **Stage B implemented** (frontend-only): `NCRPrintTemplate`
+ `NCR.print.css` (A4 portrait, portal into `<body>`, hide app while printing) +
a **Print button in the edit modal** (`NCRDetailModal`). Report shows identity,
severity badge, discipline, full disposition/corrective-action body,
effectiveness, and the 4 signature blocks. **Company header is a placeholder**
(`[ Company Name ]` + LOGO box). tsc/build clean. Not yet deployed.

**TODO — Stage A (branding setting):** add a configurable company name + logo
(backend store + Settings UI + logo upload) and wire it into the report header
(replace the placeholder). No central Settings page exists yet — naming-rules /
security are standalone pages, so this needs its own page/route + nav entry.
Optional: a 5th "Closed by" signature block.



Raised 2026-06-04: **NCR has no working print function.** The print button lives
only in `NCRDetailsViewModal`, which is **dead code (never rendered)**; the list
opens the edit modal, which has no print; and there is **no NCR `@media print`
CSS** (NOI/ITR/ITP/PQP/Checklist all have it).

**✅ DECIDED 2026-06-04 (direction):**
- Put the **Print button in the edit modal** (`NCRDetailModal`).
- Produce a **formal report** (company letterhead + signature blocks), not just a
  raw screen print. User acknowledged this is larger and overlaps roadmap **P1**
  (e-signature signed PDF).

**Plan (reuse the house pattern):** ITP already does formal print via a React
portal — `ReactDOM.createPortal` into a `#itp-print-root`, with `ITPDetail.print.css`
(`@page A4`, hide `#root`, show the portal). Replicate for NCR:
`#ncr-print-root` + `NCR.print.css` + an A4 report component rendering header +
identity + body (incl. the new severity / discipline / disposition / effectiveness
fields) + signature blocks.

**⛔ Blocker — no branding in the system:** there is no company name / logo /
letterhead anywhere (no settings field, no asset). "公司抬頭" has no data source.

**✅ DECIDED 2026-06-04:**
1. **Company header → add a configurable branding setting** (company name + logo)
   in Settings; the report reads it. Cleaner long-term and reusable by other
   modules' prints. (Build a branding settings store + Settings UI with logo.)
2. **Page: A4 portrait.**
3. **Signature blocks (in order):** Raised by · Contractor response (assignedTo) ·
   Disposition approved by (PQM) · Effectiveness verified by. _(“Closed by” was
   not offered in the 4-option picker — add it as a 5th block if wanted.)_

**Build stages:**
- **A. Branding setting** — backend store for company name + logo + Settings UI.
- **B. NCR report** — `#ncr-print-root` portal + `NCR.print.css` (A4 portrait,
  hide `#root`) + report layout (header reads branding; body incl. severity /
  discipline / disposition / effectiveness; the 4 signature blocks) + Print
  button in `NCRDetailModal`.

---

## Product Roadmap — Functional (prioritized)

This is a **feature / product** roadmap (distinct from the architectural debt
above). Ordering logic: secure "who can see what" first → stand up the record
**lifecycle + sign-off** → add **collaboration + traceability** → then domain
depth → finally field/mobile and external-facing output. Estimates are rough,
solo-dev: **S** ≤1 wk · **M** 1–3 wk · **L** 3–6 wk · **XL** 6 wk+.

### P0 — Multi-project / per-contractor data isolation  ·  M–L  ·  ⚠ GATE
**DEPLOYED 2026-06-03 to qualitas.rokusumi.net.** Backend + IAM frontend complete.
Enforcement lives in `core/scope.py` (`get_scope` dependency, `apply_scope`,
`record_in_scope`, `enforce_create_scope`, `enforce_update_scope`,
`entity_in_scope`) and is wired through repo→service→router for NCR, NOI, ITR,
ITP, OBS, PQP, FAT, FollowUp, Audit, Checklist, plus `/projects`, the **Workflow**
module (Q-WorkFlow scoped by its NOI), and **attachments** (`/files/*` gated by
the parent record). Create AND update paths block moving a record out of scope.
Scope model: `user_projects` table + `users.vendor_id`; users with no rows/vendor
(or admin role) stay unscoped, so existing logins are unchanged. Admin assignment
API: `GET/PUT /api/iam/users/{id}/scope`, with a frontend screen (`UserScopeSection`)
in the IAM user editor — assignable both when **creating** and editing a user.
All four `/{id}/related` endpoints (NCR, NOI, ITP, ITR) gate the root record by
scope. Tests: `test_scope_isolation`, `test_scope_all_modules`, `test_scope_http`,
`test_user_scope_api`, `test_scope_extra`, `test_scope_related` (full suite green,
205 passed).
_Not scope-checked by design:_ KPI weights and owner-performance — those tables
have no `project_id`/`vendor_id` dimension (global config / org-wide metric keyed
by owner+month); they are gated by the `KPI_VIEW`/`KPI_UPDATE` permissions instead.

_Original finding (for context):_ `User` had only `role_id`; no mapping table;
`RoleChecker` was a function-level gate, not row-level; list endpoints never
filtered by `project_id`. Any logged-in user saw **all** projects/contractors.

**Why first:** a hard prerequisite before giving any contractor/owner a login —
otherwise day one they see everyone's data. If the product stays single-org
all-access forever, this can drop down the list.

**Acceptance criteria:**
- A user can be scoped to one or more projects (and optionally to a single
  contractor) via a mapping table; admins are unscoped.
- Every list/read/update/delete endpoint enforces the scope server-side
  (not just hidden in the UI) — a scoped user requesting another project's
  record gets 403/404, verified by an automated test per module.
- Project selector reflects only the projects the user may see.
- Contractor-scoped users see only their own records across every module.

**Depends on:** nothing. Touches every router (add a scope dependency) + a
migration for the mapping table.

---

### P1 — Formal approval workflow + e-signature  ·  M–L  ·  ⏸ DEFERRED TO LAST
**Priority decision 2026-06-03:** keep on the backlog but handle **last** —
do the security follow-ups, architectural debt, and the lighter roadmap items
(P2+) before starting this. Large, and not blocking other work.

Defines the record **state machine** (e.g. Draft → Submitted → Under Review →
Approved/Rejected → Closed) that notifications, comments and reports all hang
off. Core ISO 9001 / client-audit requirement.

**Acceptance criteria:**
- Per-module configurable approval chain with ordered roles; a record cannot
  advance unless the current step is signed; rejection requires a reason and
  routes the record back.
- Captured e-signature (name + role + timestamp + hash) rendered into an
  exportable signed PDF.
- State transitions are permission-gated and audit-logged.
- Required fields enforced per stage (can't submit without them).

**Depends on:** P0 (so sign-off identity is correctly scoped).

---

### P2 — In-record comments + in-app notifications  ·  S–M
Highest CP-value quick win after the lifecycle exists. Closes the biggest
audit-trail leak: the contractor↔consultant back-and-forth that today happens
in email/LINE.

**Acceptance criteria:**
- Threaded comments on every record, with @mention.
- A notification framework (in-app bell + existing email) fires on: assigned to
  me, mentioned, state change, due-soon/overdue.
- Unread badge; mark-as-read; notification preferences per user.

**Depends on:** P1 (state-change events) — but comments can ship independently.

---

### P3 — Per-record history timeline (UI)  ·  S
The audit log already exists at the data layer (`docs`/`AUDIT_LOGGING.md`); this
is just surfacing it as a "who / when / changed what / rejection reason"
timeline on each record. Small, high audit value.

**Acceptance criteria:**
- Each record has a chronological activity tab: field changes (before→after),
  state transitions, sign-offs, comments — all attributed and timestamped.
- Filterable/exportable for a client audit.

**Depends on:** P1 + P2 (so transitions and comments appear in the timeline).

---

### P4 — ITP ↔ NOI scheduling + Hold/Witness points  ·  M
Domain depth that separates this from a generic form system: ITP hold/witness
points should drive inspection notices and a schedule, not be re-keyed.

**Acceptance criteria:**
- ITP line items can be flagged Hold / Witness / Review / Surveillance.
- A Hold/Witness point can generate a NOI; an inspection calendar shows upcoming
  inspections with assignee and confirmation status.
- A work-package view lists all open ITP/NOI/ITR/NCR items and their traceability.

**Depends on:** P0, P1.

---

### P5 — Template library + standardization  ·  M
Reusable, versioned ITP/Checklist templates per work type, linked to acceptance
criteria / spec clauses, instantiated per project.

**Acceptance criteria:**
- Create/version/clone templates; instantiate into a project as live records.
- Template changes don't mutate already-instantiated records.
- Standard acceptance-criteria / code-clause library referenceable from a line.

**Depends on:** P0. Can run parallel to P4.

---

### P6 — Mobile / PWA + offline field capture  ·  XL
Highest transformative value, biggest build. Raise NCR/ITR + photos on site,
offline, auto-sync on reconnect.

**Acceptance criteria:**
- Installable PWA; create/edit core records and capture photos with no network.
- A reliable sync queue with conflict handling (ties into optimistic-concurrency
  item #3 in the architecture backlog).
- Mobile-optimized layouts for the field-critical modules.

**Depends on:** P0, P1 stable.

---

### P7 — Spatial: drawing pins + photo markup  ·  M–L
Adds the spatial dimension QA needs ("which column, which floor"). Best planned
with P6 (capture + annotate on site).

**Acceptance criteria:**
- Annotate photos (arrow/circle/text) before attaching.
- Drop a pin on an uploaded drawing/plan and link it to the record.

**Depends on:** P6 (ideally).

---

### P8 — Reporting depth + owner-facing reports  ·  M
NCR aging, defect recurrence/root-cause Pareto, contractor scorecards, and a
scheduled monthly report emailed to the owner.

**Acceptance criteria:**
- NCR aging + recurrence/Pareto views; exportable contractor scorecard.
- A monthly summary auto-generated and emailed on schedule.

**Depends on:** P0 (numbers must be correctly scoped before sharing externally)
+ P1 (lifecycle states drive the metrics).

---

### P9 — Multi-channel notifications (LINE / push)  ·  S
Small add-on once the P2 notification framework exists; big perceived value on
site (email alone is easy to miss).

**Acceptance criteria:**
- At least one site-friendly channel (LINE / web-push) in addition to email,
  per-user opt-in.

**Depends on:** P2.

---

**One-line sequence:**
`P0 isolation (gate)` → `P1 sign-off` → `P2 comments+notify` → `P3 timeline` →
`P4 ITP/NOI scheduling` → `P5 templates` → `P6 mobile/offline` →
`P7 spatial` → `P8 reporting` → `P9 multi-channel`.
Suggested first milestone: **P1 + P2 + P3** shipped together (after the P0
gate decision) — users feel it immediately.

---

## 16. OBS module (OBSModals.tsx / OBS.tsx) issues  ·  ✅ DONE 2026-06-26

**Resolution (2026-06-26)** — took a **hybrid of (A)+(B)**: kept the data model
*lightweight* (A — dropped the NCR-style disposition/root-cause/corrective/
re-inspection/PQM fields and the free-text NOI/ITR links) but brought the UX up
to *NCR level* (B — RHF+zod validation via `obsFormSchema.ts`, real scoped print
template with a closure sign-off, people autocomplete, image preview). Item map:
- 🔴 #1 ref/serial data loss → **removed** those inputs (not part of lightweight OBS)
- 🔴 #2 broken Publish → **removed** the button (`rev` is now vestigial, unused by OBS)
- 🔴 #3 raw print → **OBSPrintTemplate + scoped OBS.print.css** (portal print, like NCR)
- 🔴 #4 free-text NOI/ITR → **removed** from the form
- 🟡 #5 no validation → **RHF + zod**, Subject + Description required
- 🟡 #6 productDisposition mis-grouped → now in its own **處置 / Response** section
- 🟡 #7 no autocomplete → **`obs-people` datalist** (system users + contractors)
- 🟡 #8 ghost fields → **gone** (`OBSDetailData` is the trimmed zod type)
- 🟡 #9 dead OBSDetailsViewModal → **replaced** by the unified read-only `<fieldset>`
- 🟡 #10 hardcoded English status / reopen → **i18n `t('status.*')`**; Void filter+stat added
- 🟡 #11 OBSItem defined twice → single type in `obsStore.ts`, imported everywhere
- 🟡 #12 date string toggle → kept the shared NCR `dateInput` helper (consistent)

Plus new: **closure photo gate** (both observation + improvement photo required to
close) and IAM **read-only gating** (`obs:update:all` / `obs:approve:all`).
Shipped in `feat(obs): complete the §16 OBS review` (+ `feat(iam)` for the gating).

---

Captured 2026-06-05 from a review of the OBS (Observation) module. OBS shares
the NCR code skeleton but never received the NCR refactor (RHF+zod validation,
field-model work, print template, NOI/ITR links). It's essentially "NCR before
the 2026-06-05 work", plus a few OBS-specific bugs.

**Decision needed first — how much should OBS mirror NCR?**
The OBS data model was copy-pasted from NCR (full disposition / corrective /
preventive / re-inspection / PQM fields) but only a subset is wired up. Pick a
direction before fixing:
- **(A) Lightweight observation** — trim the model to observation/photos/
  disposition/status/links; delete the unused NCR-style fields.
- **(B) Mini-NCR** — bring OBS up to NCR's level (RHF+zod, section structure,
  real print, NOI/ITR dropdown links).

**🔴 Bugs (data loss / broken)**
1. **`referenceStandards` and `serialNumbers` are entered but never saved.** The
   form has inputs (`OBSModals.tsx:380,486`) but `OBS.tsx:78-101` payload omits
   them (and `obsStore.OBSItem` has no such columns) — data silently dropped.
2. **Publish button is broken** — `OBS.tsx:81` hardcodes `rev: ''`, so the rev
   bump `handlePublish` computes is discarded; the button is also a hardcoded
   English "Publish" label. (Same bug NCR had; NCR removed it.)
3. **Print is raw `window.print()`** (`OBSModals.tsx:215`) — no print template or
   scoped print CSS, so it prints the whole app UI. (NCR got a real print path.)
4. **NOI / ITR are free-text inputs** (`OBSModals.tsx:285-303`) — should be
   dropdown links like NCR; currently typo-prone strings with no real link.

**🟡 Quality / consistency (OBS lags NCR)**
5. No validation at all — raw `formData` useState, no RHF+zod, no required
   fields; the "* required" hint is misleading (nothing is enforced).
6. `productDisposition` is mis-grouped under "Personnel & Location"
   (`OBSModals.tsx:495`); there is no Disposition section.
7. `foundBy` / `raisedBy` have no user/contractor autocomplete (NCR now does).
8. **Ghost fields** — `OBSDetailData` declares repairMethodStatement /
   immediateCorrectionAction / rootCauseAnalysis / correctiveActions /
   preventiveAction / finalProductIntegrityStatement / reInspectionNumber /
   projectQualityManager / aconex, but the form has no inputs and the backend
   has no columns — dead copy-paste from NCR.
9. `OBSDetailsViewModal` is dead code (not imported by OBS.tsx).
10. Status options are hardcoded English ("In Progress" / "Resolved" / "Use As
    Is" …), not `t()`; Closed→Open reopening is undefined (see #6 above).
11. `OBSItem` interface is defined twice (obsStore.ts + OBSModals.tsx) and drifts
    (modal copy lacks noiNumber/itrNumber/dueDate).
12. Dates are strings with a fragile text↔date input toggle (same as NCR pre-fix).

**Suggested order:** fix the 🔴 bugs first (#1 data-loss is the most urgent),
then decide A vs B and fold the 🟡 items into that build.

---

## 17. ITR ↔ Checklist architecture: basic data + template/instance  ·  DESIGN AGREED 2026-06-26 · FOR BUILD

Captured 2026-06-26 from a structural review of the ITR module. The ITR backend
is the most mature of the QA modules (real WorkflowEngine, optimistic locking,
`_validate_approval`, re-inspection chains, `create_ncr_from_itr`, NOI as a real
FK), but two structural defects make the current shape **not** correct.

### Defect 1 — checklist has two unsynced sources of truth

- **Relational:** `Checklist` table linked via `itrId` FK. Backend approval
  validation reads THIS (`itr_service.py:178`, called from `update_itr:257`).
  Rows only get `itrId` via the `link_checklist` endpoint, whose repo method
  **mutates the template row's `itrId`** (`itr_repository.py:253`) — i.e. it
  *moves* a shared, cross-project template into one ITR = pollutes the template.
- **JSON snapshot:** the ITR form deep-copies a template into
  `detail_data.linkedChecklists` (`itrStore.ts:113`) and even **strips `itrId`**
  off the snapshot (`ITRModals.tsx:580`). The form display + approval gate read
  this JSON (`ITRModals.tsx:228`), NOT the table.

Consequence: a user links passing checklists in the modal → they land in JSON
only; the `Checklist` table stays empty; `_validate_approval` then blocks
approval with "no linked checklists" even though the UI shows them. The two
stores can disagree; the frontend snapshot route was a workaround for the
template-polluting backend link, not a design.

### Defect 2 — basic data is duplicated across ITR and Checklist

`ITR` and `Checklist` both carry vendor / NOI / location / date / package
columns — the same inspection-event data entered and stored twice, free to drift.

### Decided architecture — one source per concern, layered references

```
ITP  inspection plan (defines checkpoints)
 └─ NOI  ★ SINGLE SOURCE of basic data (vendor / package / date / checkpoint / type)
      └─ ITR  the report — REFERENCES the NOI for its header (stores no basic data of its own)
           └─ Checklist INSTANCE — copies the template's items + holds this inspection's results;
              belongs to the ITR (itrId); has NO basic data (derives via ITR → NOI)
                 └─ references ▸ Checklist TEMPLATE (blank, cross-project, project_id NULL, NEVER written)
```

Three "stored once":
- **Template** is blank and only *referenced* (via `template_id`) — never mutated.
- **ITR header** is *referenced* from the NOI — not re-stored on the ITR.
- **Checklist instance** holds only template_id + items + per-item results — no basic data.

So basic data lives once (NOI); the inspection record lives once (the instance,
owned by the ITR); the blank form lives once (the template).

### Field-level reconciliation (basic data)

**A — NOI already has it → ITR references, stops self-storing:** vendor
(`NOI.vendor_id`), type, eventNumber/checkpoint, inspection date
(`NOI.inspectionDate`), ITP/version (`NOI.itpNo`), package.

**B — genuinely ITR report-level, stays on ITR (not "basic data"):**
documentNumber, inspectionResult, status/workflow, preparedBy/reviewedBy/
approvedBy, ncrNumber, closeoutDate, re-inspection fields, photos/attachments,
remark, aconex (ITR doc-control no.), raisedBy (report author ≠ NOI contacts).

**C — NOI lacked it; DECIDED 2026-06-26 → add BOTH to NOI** (they describe the
inspection event, so they belong at NOI level; keeps ITR header 100% referenced,
zero duplication):
- `foundLocation` (specific inspection location) → add to NOI
- `discipline` (Civil / Mechanical / Electrical …) → add to NOI

### Build outline (doc only — no code yet)

1. **Schema:** add `foundLocation`, `discipline` to NOI. Add `template_id`
   (self-FK) to `Checklist`. Convention: template = `template_id NULL && itrId
   NULL && project_id NULL`; instance = both `itrId` + `template_id` set.
2. **Backend link:** rewrite `link_checklist` to **create a new instance row**
   (deep-copy template items, set `itrId` + `template_id` + the ITR's project)
   instead of mutating the template's `itrId`. `_validate_approval` keeps reading
   the table — now correctly populated.
3. **ITR header:** resolve basic-data fields from the linked NOI (display/derive),
   stop persisting ITR's own copies.
4. **Frontend:** ITR form links/unlinks via the endpoint (no more
   `detail_data.linkedChecklists`); inspection results save to the instance row;
   display / approval gate / print all read the instance.
5. **Migration:** for each ITR, convert `detail_data.linkedChecklists` JSON into
   real instance rows (`itrId` + best-effort `template_id`), then drop the JSON.

### UI layout — one complete ITR record (UX unchanged for the user)

```
ITR No. ………                      status
── basic data (referenced from NOI) ──
vendor / NOI / date / location / package / ITP / discipline
══════════════════════════════════════
Inspection items   [＋ reference a template ▾]
  ▼ Template A-v2                 Pass 8/8   [remove]
     1. weld appearance      [O] [X] [N/A]      ← filled inline, saved to the instance
     2. dimension  [_12.5_]  [O] [X] [N/A]
  ▶ Template B-v1                 Fail 3/5   [remove]
══════════════════════════════════════
photos / attachments · result · sign-off
```

Inline accordion (no separate "checklist box"); collapsed rows keep the form
short, expand to fill. Reads/prints as a single ITR inspection report.

### Notes / risks

- Standalone checklists not under an ITR (NOI/ITP only) keep their own basic
  columns; only ITR-instances defer to the NOI.
- `detail_data` on ITR keeps only `_version` (optimistic lock) after migration.
- Frontend still on raw `useState` (no `itrFormSchema.ts`); fold the RHF+zod
  migration into step 4 for parity with NCR/OBS.

---

## 18. Meeting Minutes: recurring occurrences (shared documentNumber + rev) · ✅ SHIPPED 2026-08-31

**UPDATE 2026-08-31: built.** The user hit the real need directly ("9/1
exists, 9/8 updates based on 9/1, becomes rev 2") and confirmed accepting
the schema-risk gate below. Delivered per the original design: `models.py`
dropped `unique=True` from `documentNumber`; `db_migrations.py` gained
`_loosen_meeting_minutes_documentNumber_unique()` (backfills any NULL
`rev` to `"1.0"`, introspects and drops the legacy single-column unique
index, creates the composite `UNIQUE(documentNumber, rev)`); new
`MeetingMinutesService.create_new_occurrence()` + `POST
/meeting-minutes/{id}/new-occurrence` + a "建立下次會議 New Occurrence"
button in the modal footer. Live-DB inspection before building confirmed
the legacy index (`ix_meeting_minutes_documentNumber`) was a clean
standalone unique index, safely droppable — no hidden inline constraint.
6 new tests (mock + real-DB, including an explicit "duplicate
documentNumber+rev is still rejected" check against the real composite
index). List/print/modal all display `documentNumber (rev)` combined per
the confirmed convention.

**UPDATE 2026-08-29 (superseded by the above):** a plain `rev` column
(`String, nullable=True`, no uniqueness/constraint changes) was added to
`MeetingMinutes` and exposed as a normal editable form field as a stopgap
— closed the immediate "nowhere to type a revision" gap before the full
recurring-series design was built. `rev` stayed editable even after this
build (not made immutable as the original design text below suggested) —
"New Occurrence" just pre-fills the computed next value like any other
field.

Captured 2026-08-29 from a discussion about reusing IAM person data across
modules. That narrower ask turned out to already be solved everywhere a real
FK person-picker exists (`formatUserLabel()` in `react-app/src/services/api.ts`
already shows "name / company" in every such dropdown's option label — no
field anywhere duplicates it, nothing to fix). The concrete pain point that
surfaced instead: **Meeting Minutes has no concept of a recurring series.**

**The problem:**
Every Meeting Minutes record is fully independent — a weekly project meeting
gets a brand-new `documentNumber` each week (`backend/models.py:454`,
via `generate_reference_no`) and a from-scratch free-text attendee list
(`attendees` — `backend/models.py:470`, JSON `[{name, company, role}]`,
no IAM link at all). There's no way to see that five separate documents are
actually "the same weekly meeting, five occurrences apart," and attendees —
usually the same handful of people every week — get retyped from zero each
time.

**Decided design (ready to build):**
- Recurring occurrences **share one `documentNumber`** for the life of the
  series; a new `rev` column (`rev = Column(String, nullable=True)`, matching
  the existing NCR/NOI/ITR convention) increments per occurrence. Each
  occurrence's date goes into `title` so occurrences stay human-distinguishable
  in lists — no grouping UI needed.
- A **"New Occurrence" action** (mirrors ITR's raise-NCR/re-inspect
  click-to-derive pattern, `react-app/src/components/ITR/ITRModals.tsx:422-450`
  + `react-app/src/services/api.ts:473-482`) creates a new Draft row that
  copies **vendor, project, meetingType, organizer, location, and the full
  attendee list** from the source occurrence — confirmed with the user
  2026-08-29. `discussionLog` is deliberately **not** carried forward (fresh
  agenda every occurrence). `meetingDate` is deliberately **left blank**, not
  defaulted to today (also confirmed 2026-08-29) — the user fills in the
  actual date.
- **Display format (confirmed 2026-08-29, revised after a worked example):**
  wherever `documentNumber` is shown, append `rev` in parentheses right
  after it as one combined string, file-name-style — e.g.
  `MOM-XXX-001 (1.0)`, `MOM-XXX-001 (2.0)` — not a separate rev
  column/field. **`rev` format matches PQP's `X.0` convention**: the first
  occurrence in a series is `"1.0"` (1-based, not 0-based), and each "New
  Occurrence" bumps the integer part by 1 (`"1.0"` → `"2.0"` → `"3.0"` …).
  There is **no minor-version concept** (no `"1.1"` for an in-week
  correction) — the trailing `.0` is constant, only the integer part moves.
- **Attendee auto-fill (bundle in, independent small feature):** add a
  `meeting-attendee-people` `<datalist>` to the attendee-name input in
  `MeetingMinutesModals.tsx`, sourced from the `users` state already fetched
  for the action-item assignee picker (~line 82) — no extra API call. On
  `onBlur`, if the typed name exactly matches an existing `User`, auto-fill
  `company` from that user's `display_company` **only if company is
  currently empty** (never clobber a manually-typed external guest's
  company). Mirrors the existing OBS/NCR free-text+datalist pattern
  (`obs-people`/`ncr-people`) but adds the reactive auto-fill those don't
  have today.

**⛔ Why not now — the blocking risk:**
`MeetingMinutes.documentNumber` is currently `Column(String, index=True,
unique=True)` (`backend/models.py:462`) — a hard single-column unique
constraint. Making a series share one `documentNumber` requires loosening
this to a composite `UNIQUE(documentNumber, rev)`. SQLite can't
`ALTER TABLE ... DROP CONSTRAINT`, so this needs a raw `DROP INDEX` (found by
introspecting `sqlite_master`/`PRAGMA index_list` rather than hardcoding
SQLAlchemy's auto-generated index name) followed by
`CREATE UNIQUE INDEX ... ON meeting_minutes (documentNumber, rev)` — **the
first time this codebase has ever loosened a constraint** rather than only
adding columns/indexes/tables (every existing step in
`backend/db_migrations.py` is additive). On a live production SQLite DB with
existing data, a silently-failed `DROP INDEX` would leave the old constraint
in place and make every "New Occurrence" write fail with an `IntegrityError`
despite the migration log claiming success — this needs to be logged at
`error` level (not the usual `warning`) and manually verified post-deploy via
`PRAGMA index_list('meeting_minutes')`. User's call 2026-08-29: defer rather
than accept this risk right now.

**What to do when you tackle it (full implementation-ready plan):**

1. **`backend/models.py:462`** — drop `unique=True` from `documentNumber`
   (keep `index=True`); add `rev = Column(String, nullable=True)` right after.
2. **`backend/schemas.py`** (`MeetingMinutesBase`, ~line 912) — add
   `rev: str | None = None`; deliberately exclude it from
   `MeetingMinutesUpdate` (same treatment as `documentNumber` — immutable
   after creation, only set by `create` / `new-occurrence`).
3. **`backend/db_migrations.py`** — new step 13 in `run_migrations()`, a new
   `_add_meeting_minutes_rev_and_loosen_unique()` function:
   - `_add_column_if_missing(conn, "meeting_minutes", "rev", "VARCHAR")`.
   - Backfill: `UPDATE meeting_minutes SET rev = '1.0' WHERE rev IS NULL`
     (existing rows predate this feature — each is the sole/first occurrence
     of its own series, so `"1.0"` is correct, not `"0.0"`. Safe to backfill
     everything to the same value — the OLD single-column unique constraint
     still guarantees no two rows share a `documentNumber` at this point in
     the migration, so no collision risk).
   - Introspect `sqlite_master` + `PRAGMA index_list("meeting_minutes")` for
     every **unique** index whose column list (`PRAGMA index_info`) is
     exactly `["documentNumber"]`, and `DROP INDEX IF EXISTS` each one found
     — don't hardcode a name.
   - `CREATE UNIQUE INDEX IF NOT EXISTS ix_meeting_minutes_documentNumber_rev_unique ON meeting_minutes (documentNumber, rev)`.
   - Log the index-drop step at `logger.error` on failure (not `warning`,
     unlike every other step in this file) — a failure here silently defeats
     the whole feature rather than being a harmless no-op.
4. **`backend/repositories/meeting_minutes_repository.py`** — new
   `get_all_by_document_number(document_number)` method.
5. **`backend/services/meeting_minutes_service.py`**:
   - `create_meeting_minutes`: default `data['rev'] = '1.0'` when not
     provided (first-in-series row).
   - New `create_new_occurrence(meeting_id, user_id, username, scope)`:
     fetch source row + `record_in_scope` check → compute the next rev by
     parsing the integer part of every sibling's `rev` (format is always
     `"N.0"` — no minor versions), taking the max, and bumping by 1:
     `max_n = max(int(float(row.rev or 0)) for row in siblings); next_rev = f"{max_n + 1}.0"`
     across all rows sharing the source's `documentNumber` → build new row
     (new uuid, same `documentNumber`, `rev=next_rev`, `status="Draft"`,
     `title = f"{base_title} - {today}"` with a regex strip of any prior
     trailing `" - YYYY-MM-DD"` so chained occurrences don't accumulate
     dates, `meetingDate=None`, `discussionLog=None`, all other fields
     copied from source) → commit, catching `IntegrityError` → clean
     `ValueError` ("another occurrence was just created, please retry")
     rather than a raw 500 → `log_audit` both sides (new row + a
     `CREATE_OCCURRENCE` marker on the source).
6. **`backend/routers/meeting_minutes.py`** — new
   `POST /{meeting_id}/new-occurrence`, mirroring
   `POST /itr/{itr_id}/re-inspect` (`backend/routers/itr.py:167-184`)
   field-for-field: `MEETING_CREATE` permission dependency, `scope`
   dependency, `ValueError`→400, `None`→404.
7. **`react-app/src/services/api.ts`** — new
   `createMeetingMinutesOccurrence(meetingId)` → `POST
   /meeting-minutes/${meetingId}/new-occurrence`.
8. **`react-app/src/components/MeetingMinutes/MeetingMinutesModals.tsx`**:
   - "New Occurrence" button in the detail modal's footer (mirrors ITR's
     raise-NCR button placement), gated on `meeting:create:all` permission;
     on click, POST → toast → close modal → navigate to
     `/meeting-minutes?openId=${created.id}` for the new Draft row. Needs an
     `onDismiss` prop (same reason ITR's modal has one,
     `ITRModals.tsx:91`) to avoid racing the deep-link close-navigate.
   - Attendee auto-fill: `handleAttendeeNameBlur` + `meeting-attendee-people`
     `<datalist>` as described above.
   - Read-only info section: render as `${existingItem.documentNumber} (${existingItem.rev ?? '1.0'})`
     — one combined string, not a separate field.
9. **`react-app/src/components/MeetingMinutes/columns.tsx`** — no new `rev`
   column; change the existing `documentNumber` cell renderer to
   `${row.getValue('documentNumber')} (${row.original.rev ?? '1.0'})`.
10. **`react-app/src/store/meetingMinutesStore.ts`** — add `rev?: string;`
    to `MeetingMinutesItem`.
11. **`react-app/src/context/LanguageContext.tsx`** — add
    `meetingMinutes.rev`, `meetingMinutes.newOccurrence`,
    `meetingMinutes.newOccurrenceTitle`, `meetingMinutes.occurrenceCreated`
    to both the `en` and `zh` blocks.
12. No print template exists yet for Meeting Minutes (unlike ITR/NCR/OBS) —
    `rev` display in print is N/A until one is built.

**Post-deploy verification when built:** `pytest -q` green; on the NAS,
`PRAGMA index_list('meeting_minutes')` confirms the old single-column unique
index is gone and the composite one exists; manually create two occurrences
of the same series and confirm both share `documentNumber` with
`rev` `1.0`/`2.0` and no `IntegrityError`.

---

## 19. Word (.docx) export can't reach pixel parity with the PDF/print output · EVALUATED 2026-08-29 · DEFERRED

Captured 2026-08-29 building the NCR `.docx` export pilot (module hardening —
see `backend/core/docx_builder.py`, `services/ncr_service.py::export_docx`,
`GET /ncr/{id}/export-docx`, "匯出 Word" button in `NCRModals.tsx`). The
export is **shipped and working** — same 7-section content as
`NCRPrintTemplate.tsx` (identity / traceability / impact / description /
disposition / root-cause / corrective-action / attachments / verification /
sign-off / photos), built directly with python-docx, embedded photos
included, iterated with the user on field order/pairing, vertical-centering,
and fonts (Calibri + 標楷體). What it does **not** do: look pixel-identical
to the PDF/print output — colors, spacing, borders, checkbox glyphs are
Word's own approximation of the print template's CSS, not a copy of it.

**Why it can't easily get closer — two options investigated, both dead-ended:**

1. **Convert the print template's HTML to `.docx` via `htmldocx`** (the
   technique `services/km_service.py::export_docx` already uses for KM
   articles) instead of hand-building with python-docx. **Blocker A:**
   `NCR.print.css` uses `display: flex` (masthead `.doc-head`, checkbox rows,
   sign-off meta) and `display: grid` (`.sign-grid`, `.photo-grid`) —
   `htmldocx` doesn't understand either, so those sections would render
   broken/stacked, not side-by-side. **Blocker B (found after the user
   initially chose this path — see below):** read `htmldocx`'s source
   (`h2d.py`) — it only reads literal inline `style="..."` HTML attributes
   (`text-align`, `margin-left`, `color`, `background-color`), **not CSS
   classes or stylesheets at all**. So even after rewriting the flex/grid
   sections as real `<table>`s, every other visual detail driven by
   `NCR.print.css` classes (label shading, section-heading background,
   borders, badge pills) would still need to be duplicated as inline styles
   on every element — a full second template, not a smaller conversion. And
   `htmldocx` doesn't reliably handle table-cell borders or vertical
   alignment at all (things the current python-docx build already controls
   directly), so switching risked ending up *less* faithful, not more —
   while also requiring edits to the **live, already-shipped** print/PDF
   template (real regression risk to a working feature) for an uncertain
   payoff.
2. **Server-render the real print HTML straight to PDF** (headless
   browser / WeasyPrint-style) instead of `.docx` — would be genuinely
   pixel-identical to the print output, but produces a `.pdf`, not a `.docx`
   — doesn't satisfy "Word file" even though it would satisfy "looks like
   the PDF."

**Decided 2026-08-29:** don't pursue either path right now. Ship the current
python-docx NCR export as-is (content-complete, visually approximate, no
risk to the live print feature) and defer exact visual parity.

**What to do when you tackle it:**
- If the ask resurfaces as "the Word file should look closer to the PDF":
  keep iterating the existing `docx_builder.py` primitives directly (colors/
  spacing/border weights are already fully under our control there) rather
  than reopening the `htmldocx` route — it has a lower ceiling, not a
  higher one, for this specific print template's flex/grid-heavy CSS.
- If the ask resurfaces as "I actually want a PDF, Word was just the closest
  thing I knew to ask for": build the real server-rendered PDF path
  instead (option 2 above) — that's the one technique that gives true
  pixel parity, just not as a `.docx`.
- Either way, don't attempt to convert `NCRPrintTemplate.tsx`'s HTML via
  `htmldocx` without first fully inlining every style per element — a
  partial attempt (tables only, classes left as-is) will silently drop most
  of the visual design and look worse than the current export, not better.

---

## 20. OBS engineer sign-off: anyone can approve as anyone · NOT STARTED

Captured 2026-09-01, right after shipping the OBS Quality Engineer /
Construction Engineer closure split (see #18's neighbor commits —
`obsFormSchema.ts::deriveOBSStatus`, `OBSModals.tsx` "結案簽核" section).
The two "Approved By" fields are `<select>` pickers sourced from the real
IAM user list (`getUsers()` + `formatUserLabel()`, same pattern as NCR's
`assignedTo`) — but **any logged-in user can pick any name from that list**
for either role, and can freely toggle both roles' approval status. There
is no check that the person actually submitting the form is the person
named in `qualityEngineerApprovalBy` / `constructionEngineerApprovalBy`.

User's framing: whoever is logged in should only be able to set/change
**their own** sign-off — not the other engineer's, and not by picking an
arbitrary name. i.e. a Quality Engineer approving should stamp the
currently-authenticated user automatically (or restrict the picker to
"self only"), and should not be able to touch the Construction Engineer's
fields (or vice versa), rather than the current free-for-all where one
person could fill in and approve both roles themselves.

**Not investigated yet:**
- Whether this should be enforced by role/permission (e.g. two new scopes,
  `obs:approve:quality` / `obs:approve:construction`, gating which half of
  the closure section is editable — mirroring how OBS already gates the
  *whole record* via `obs:approve:all` vs `obs:update:all` in `OBS.tsx`),
  or by identity (whoever is logged in can only write their own name into
  either field, full stop, with no separate quality/construction role
  concept in IAM).
  - Ask on the identity route: does the app already have a stable way to
  tell if the current user *is* a "Quality Engineer" vs "Construction
  Engineer" (an IAM role/permission), or would this need a new attribute?
- Whether `ApprovedBy` should stop being a picker entirely and just
  auto-fill from `useAuth()`'s current user when that role's approval is
  set to `Approved` (read-only display of "you", not a dropdown) — would
  also remove the possibility of a typo/mismatch between the picked name
  and who is actually acting, closer to what the user described.
- Backend: today `qualityEngineerApproval`/`constructionEngineerApproval`
  are plain columns on `OBS` with no router-level check
  (`routers/obs.py`) — any authenticated user with `obs:update:all`
  (or `obs:approve:all` once closed) can currently write either field.
  Enforcing "self only" needs a backend check too, not just hiding the
  picker in the frontend — a client-side-only restriction would be
  trivially bypassable via the API directly.

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
