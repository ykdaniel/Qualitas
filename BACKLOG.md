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

**Update (2026-09-22/23):** the specific failure mode this item warns about — a service commits the record
first and only `db.add()`s the audit entry afterward with no second commit, so the entry is silently lost —
was found real and fixed (not refactored away, just made atomic with the write: `commit=False` + a single
`self.repo.db.commit()`) for NCR/NOI (earlier rounds) and, this round, for PQP/OBS/OSD/FAT/Contractor (see
`docs/workflow/audit-five-path-repair.md`) and ITP/Checklist(create)/KM/Project (same doc, third batch — KM
and Project had never called `log_audit` at all, not merely lost it). This closes the acute data-loss bug on
those modules' CRUD paths; it does **not** address this item's actual proposal (auto-audit via SQLAlchemy
session events) — the manual call-site pattern, its "easy to forget on a new method" risk, and the hand-built
`old_value`/`new_value` drift risk are all still exactly as described below. Meeting Minutes, internal Audit,
and FollowUp were spot-checked (create path, isolated HTTP + a direct `audit_logs` read) and already save their
audit correctly — not touched. Not checked at all: any bulk/import write path (e.g. KM's `import_docx`, which
now produces an audit row via the fixed `update_article` but doesn't pass through who did it — see the third
batch's Limitations), and Checklist's/ITR's other write paths beyond what those modules' own rounds covered.

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

## 11. Cross-module workflow · Phase 1 的 PR1、PR4 已做；PR2/PR3 查明風險，使用者決定先跳過 · 【優先度：低】

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

### 2026-10-06 現況核對

查程式碼發現 Phase 1 其實已經做掉兩個 PR，只是沒有回來更新這份文件：
- **PR1（`<RelatedDocuments/>` 共用元件）已完成**——`react-app/src/components/ui/RelatedDocuments.tsx`，
  NOI／ITR／NCR／ITP 的 modal 都已經在用。
- **PR4（ITR→NCR 一鍵建立）已完成**——ITR 畫面上的「Raise NCR」按鈕
  （`ITRModals.tsx::handleRaiseNcr`）。

**PR2（NCR 加 `itr_id` 真外鍵）、PR3（ITP 加 `pqp_id` 外鍵）仍未做，查明風險後使用者決定先跳過**：

- 查證 `NCR.itrNumber` 不是單純的顯示欄位，而是 `workflow_service.py` 裡至少 10 幾處
  Q-Workflow 跨模組關聯邏輯（含 **P0 資料隔離範圍檢查**，程式碼自己註解明確點出這是自由文字、
  非外鍵強制）直接拿來做字串比對的依據。真的要做 PR2，不能只新增欄位，必須把這 10 幾處全部
  改成查 `itr_id`，每一處都要重新測試，尤其 P0 範圍檢查是安全性相關的部分。
- 使用者提供業務脈絡：**ITR 目前都是暫態資料，可以接受相關風險；但 ITP 資料不能變動**——
  所以 PR3（動到 ITP）被排除在外，PR2（動到 ITR 關聯）風險上可以接受。
- 討論出的技術路徑（供之後撿起來做時參考）：先新增 `itr_id` 欄位＋新建記錄時雙寫＋歷史資料
  回填（對不到的留空，不硬猜）→ 再把 `workflow_service.py` 的讀取點一個一個換成用 `itr_id`，
  P0 範圍檢查放最後且要多測 → 穩定後 `itrNumber` 保留做歷史顯示用，不強制砍掉。「只加欄位、
  不改讀取邏輯」的保守版被評估為**無法真正解決問題**（`workflow_service.py` 照樣字串比對，
  編號異動一樣會斷），不建議採用。
- **使用者本批決定：PR2、PR3 都先跳過，不開始動手**，上述分析留著供之後決定要做的時候參考。

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

## 20. OBS engineer sign-off: anyone can approve as anyone · FIXED + 已於 2026-10-05 部署（身份制，方案 A）

**2026-10-05 修正**：走使用者選定的方案 A（身份制）。後端
`backend/services/obs_service.py` 新增 `_apply_engineer_approval_identity()`：
核准狀態轉為 Approved 的當下，直接從已驗證登入的使用者查出真實姓名／公司寫入
`ApprovedBy`，完全忽略前端送來的值；非核准狀態也會把前端送來的 `ApprovedBy`
整個剝除，不給任何管道偽造（`create_obs`／`update_obs` 都處理）。未登入或已停用
帳號嘗試核准會被拒絕（`ValueError` → 400）。前端 `OBSModals.tsx` 把兩個「簽核人」
下拉選單改成唯讀欄位，即時預覽「若此刻核准，會寫入誰」，但已經核准過的歷史記錄
會繼續顯示真正的歷史核准人，不會被現在查看的人蓋掉。新增
`tests/test_obs_engineer_approval_identity.py` 7 項測試（偽造姓名被擋、公司名稱
正確附加、重新存檔不會換人、退回後換人重新核准會正確換人、未登入/已停用不能核准、
建立時偽造欄位被剝除），加上既有 127 項 OBS 測試全數通過。已部署並在正式環境
實測確認（切換 Approved 立即顯示目前登入使用者，無法再選別人）。

驗證時額外發現一筆歷史資料不一致：`QTS-RKS-HL-OBS-000001` 整體狀態 Closed，但兩個
工程師核准欄位仍是 Pending——與本次修正無關，是舊資料遷移缺口，見下方新增項目。

<details>
<summary>原始問題記錄（2026-09-01）</summary>

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

</details>

---

## 21. Offboarding a user (deactivate ≠ removed from the system) · 子項1 FIXED + 已於 2026-10-05 部署；子項2 已於 2026-09-28 修正；子項3 仍待處理

**2026-10-05 修正（子項1）**：`backend/repositories/user_repository.py::get_all()`
新增 `active_only` 參數（預設 `False`，維持內部呼叫相容），`services/user_service.py`
與 `routers/iam.py` 的 `GET /iam/users/` 端點一路串到底，**router 層級預設
`active_only=True`**——所有「選一個人」的 picker（NCR／OBS／OSD／FollowUp／
Meeting Minutes 的 assignee picker）呼叫既有的 `getUsers()` 不用改任何程式碼就自動
排除停用帳號。`react-app/src/services/api.ts::getUsers(activeOnly=true)` 同步改，
IAM 管理頁面（`store/iamStore.ts` 的 `fetchUsers`／`fetchData`）明確傳
`activeOnly=false` 保留看到停用帳號的能力（才能重新啟用）。新增
`tests/test_user_active_only_filter.py` 4 項測試，加上既有 324 項 IAM/user 測試
全數通過。已部署；正式環境目前沒有停用帳號可以肉眼驗證，邏輯已經隔離測試覆蓋。

子項3（批次移轉工具）仍未處理，維持原評估——不急，之前判斷工程量較大。

<details>
<summary>原始問題記錄（2026-09-01）</summary>

Captured 2026-09-01, surfaced by discussing #20's "pick any IAM user as
approver" gap — user asked "有人離職怎麼辦？？" (what happens when someone
leaves?). IAM already has a real deactivate mechanism
(`User.is_active`, toggled from the IAM UI) that correctly blocks login —
checked in `core/security.py::get_current_user`, re-verified on **every**
request (not just at login), so a deactivated user's existing session
dies immediately too. That part is solid. Three gaps found beyond it:

1. **Every "pick a person" dropdown still offers deactivated users.**
   `repositories/user_repository.py::UserRepository.get_all()` has no
   `is_active` filter, and the frontend `getUsers()` (used by NCR's
   `assignedTo` picker, OBS's `qualityEngineerApprovalBy` /
   `constructionEngineerApprovalBy` pickers, and the IAM list itself) just
   renders whatever comes back. So a departed employee is offered as a new
   assignee/approver exactly like anyone still on staff, indefinitely.
   Historical records are correctly unaffected either way (they store a
   name snapshot, not a live lookup) — this is only about *new* picks.

2. **`scheduler.py`'s reminder emails don't check `is_active` either.**

   **2026-09-28 修正：** FollowUp 到期／逾期與 NCR 待業主核准的 IAM
   收件人現在會檢查 `is_active`，停用者略過、不自動轉寄承包商。
   隔離記憶體 SQLite＋寄信函式 AsyncMock：修正前新增測試 4 failed / 20 passed；
   修正後連同既有排程測試 33 passed。新增 24 案比對所有資料表前後內容不變。
   未修改承包商通知、指派或升級通知政策；本項只完成停止寄給停用帳號，
   不代表離職交接完成。下文保留為修正前問題描述。

   Both the FollowUp due/overdue reminder (`f.assignee.email`, line ~61)
   and the NCR pending-owner-approval reminder (`assignee.email`, line
   ~161) look up the assignee purely by ID and mail them if an email
   exists — no check that the account is still active. If a departed
   user's account still has open NCRs/FollowUps assigned when they leave,
   the scheduler keeps mailing their now-dead inbox forever, and — because
   nothing else watches these records — **no one else ever gets notified
   that the item is stuck.** This is worse than gap 1: gap 1 risks a bad
   *new* pick, this one silently strands *existing* work with no escalation
   path.

3. **No bulk reassignment / offboarding tool.** There is no "move every
   open item currently assigned to user X onto user Y" action anywhere in
   the app. Offboarding someone today means manually finding and editing
   every NCR/FollowUp (and, per #20 once that ships, every OBS engineer
   sign-off) they were on, one row at a time — easy to miss some if the
   departing person had more than a couple open items.

**Not investigated yet:**
- Where exactly to draw the `is_active` filter for gap 1 — probably a new
  `active_only: bool = True` param on the `get_users` endpoint/repository
  method, defaulting to filtered for pickers but explicitly `False` for
  the IAM management list (which needs to show inactive accounts to
  reactivate them).
- Whether gap 2's fix should be "skip mailing inactive assignees" (silent,
  but at least stops mailing a dead inbox) or "escalate to someone else"
  (e.g. the record's vendor contact, or a configurable fallback/manager
  email) — skipping alone still leaves the record silently unattended,
  just without spamming a former employee.
- Whether gap 3 is worth building as a real bulk-reassign UI, or whether
  surfacing "records still assigned to inactive users" as a filtered list/
  dashboard widget (so an admin can reassign them individually via
  existing per-record editing) is enough — the latter is far less work
  and doesn't require new bulk-mutation endpoints.

</details>

---

## 22. Checklist "bare template must stay clean" rule · CORE RULE DONE, 2 sub-items still open · 【優先度：已完成大半，剩政策決定】

Captured 2026-09-01: `QTS-RKS-HL-CHK-000001` (a pre-§17, unlinked
"template" record) was found holding real `status='Pass'`/`passCount=1`
results, and at that time neither `create_checklist` nor
`update_checklist` had any backend check to stop a NEW row from doing the
same thing going forward — only the React `readOnly` prop enforced it.
That historical production finding is unchanged and not reinvestigated
here. The backend-enforcement gap it flagged **has since been fixed**: found
2026-09-28, while doing an unrelated business-flow review, that
`backend/services/checklist_service.py`/`services/itr_service.py` now
implement the full §17 isolation-hardening design (dated
"2026-09-19" in the code's own comments — this was already in the
working tree, uncommitted, before this session's review; not implemented
by this review):

- `create_checklist` rejects `itrId`/`template_id` being set directly —
  an instance can only be created via `ITRService.link_checklist`'s
  deep-copy.
- A bare template (`itrId`/`template_id` both empty) cannot hold
  `status`/`detail_data`/`passCount`/`failCount` — `create_checklist` and
  `update_checklist` both reject it (`_touched_fields_carry_results`).
- `update_checklist` locks `itrId`/`template_id` as immutable, and locks
  writes to an instance once its parent ITR's status makes it closed
  (`lock_itr_for_write`).
- `link_checklist`/`unlink_checklist` (`itr_service.py`) deep-copy a
  template into an independent row and delete cleanly on unlink;
  `Checklist.version`/`source_template_version` columns exist
  (`db_migrations.py::_add_checklist_version_columns`, additive-only, no
  backfill — a pre-existing row's `source_template_version` is `NULL`,
  the correct "unknown" sentinel, not a gap).
- `CHECKLIST_CLOSE` is enforced (`routers/checklist.py`) for reopening an
  already-Pass/Fail instance's own result.
- `checklist_repository.get_all` defaults to `itrId IS NULL` (bare
  templates only) unless `include_instances` is passed.
- Dedicated tests exist: `tests/test_checklist_itr_isolation_integration.py`,
  `tests/test_checklist_version_migration.py`, plus a read-only inventory
  script `scripts/verification/checklist_itr_inventory.py`. Not re-run by
  this review (no code changed) — cited as existing, not fresh evidence.

**Still open (2 sub-items, unchanged from the original design plan —
policy decisions, not code gaps):**
1. Whether a re-inspection's new checklist instance must link the SAME
   template as the original failing one, or any template — undecided.
2. Whether the legacy rows this item originally found (e.g.
   `QTS-RKS-HL-CHK-000001`, predating the §17 split, and the sibling
   `QTS-RKS-RKS-CHK-000006` itrId/itrNumber desync row) get a cleanup
   decision, or stay as historical data with `source_template_version
   IS NULL` — no decision made either way; nothing has been changed or
   deleted.

Design record: no dedicated handoff file existed for this fix before now;
the original design plan (title "Checklist/ITR: template/result isolation
+ traceability hardening") matches the shipped code closely enough to
serve as its record — see [[todo_checklist_bare_template_backend_gap]]
for the still-linked older cross-reference notes.

---

## 23. Attachment preview won't open + Print doesn't show · 預覽半邊 FIXED + 已於 2026-10-05 部署；列印半邊 2026-10-06 逐模組實測未能重現，擱置

**2026-10-05 查明並修正（預覽半邊）**：逐模組比對 `Shared/FileAttachment.tsx` 的縮圖點擊邏輯
（`onClick={() => onPreview && onPreview(...)}`——`onPreview` 沒接就是 100% 保證的死點擊，
不是偶發）。結果：OBS／NCR／OSD／NOI 都正確接了；**ITR（5 處附件區塊）、PQP（兩個 modal）、
Meeting Minutes（1 處）完全沒接**，點附件縮圖從功能上線那天起就一直沒反應，不需要特定資料
或條件就能重現。修法比照 OBS/NCR 已經在跑的 `handlePreview` + `ImagePreviewOverlay` pattern，
三個模組都補上，`tsc`／完整 build 通過，已部署。KM／FAT／Audit 不使用這個共用元件（各自有
自己的附件機制），這次沒有一併檢查，如果之後也回報預覽打不開要另外查。

**列印半邊尚未重現**：靜態檢查 ITR/PQP/Meeting Minutes/FAT/Checklist/Audit/KM 的列印觸發邏輯
（`window.print()`、`createPortal` 目標元素）結構上都沒看到明顯漏接，跟預覽那種「完全沒接」
的清楚缺陷不一樣。可能是「列印有觸發但內容印不全」（跟本 session 稍早修過的 ITR Checklist
結果漏印是同一類問題，不確定還有沒有其他模組中招）或單純版面/CSS 問題，需要使用者提供截圖
或重現步驟、或由 Claude 實際操作使用者帳號才能往下查，目前沒有足夠線索可以動手。

### 2026-10-06 正式環境逐模組實測，未能重現

在正式環境（`qualitas.rokusumi.net`，已登入 Admin）用 `window.print` 掛鉤 + DOM 檢查的方式，
對每個有實際資料的模組按下列印按鈕並檢查產生的列印內容：

- **NCR**：正常，完整表單含兩張照片、附件清單、簽核欄位。
- **PQP**：正常；唯一發現的小瑕疵是空白「3. 版本歷程」區塊被跳過時，編號從 2 跳到 4（設計
  上是「空區塊不印」，不是內容遺失，純屬編號美觀問題，影響極小）。
- **Meeting Minutes**：正常。
- **Checklist**：正常。
- **KM（知識庫文章）**：正常，索引頁／目錄都有渲染。
- **OSD、FAT、Audit**：正式環境目前完全沒有資料，無法實測。
- ITR／OBS／NOI 已在修復 #20、#23 預覽半邊時個別驗證過，列印正常。

**結論：目前找不到任何「按下列印、內容印不出來」的重現案例。** 附件預覽半邊（ITR/PQP/Meeting
Minutes 完全沒接 `onPreview`）是明確、百分之百可重現的缺陷，已經修好；但「列印」這半邊無論是
讀程式碼還是逐模組實測都沒抓到問題，可能原因：①使用者原始回報可能是跟著附件預覽一起講的
整體印象，不是列印本身另有獨立問題；②可能是瀏覽器彈出視窗攔截器之類的環境特定情況，自動化
瀏覽器無法重現；③原始回報的那筆記錄現在可能已經不是當初的樣子。**暫時沒有進一步線索可查，
擱置——如果之後真的再遇到，需要當下截圖或錄影才能繼續往下查。**

<details>
<summary>原始問題記錄（2026-09-02）</summary>

Captured 2026-09-02, reported directly by the user: "附件無法打開來預覽，列印不會出現" —
attachment preview doesn't open, and Print doesn't appear/render. **Not yet
reproduced or narrowed to a specific module** — logging as-is per the
user's own framing ("要排查各模組" — needs checking module by module),
not investigating further right now.

**Quick look at the shared infrastructure before logging (not a full
investigation):**
- Attachment preview (`Shared/FileAttachment.tsx`) doesn't own the preview
  UI itself — clicking a thumbnail calls an `onPreview` prop the *parent*
  module supplies, which is expected to render `Shared/ImagePreviewOverlay.tsx`.
  If a given module never wires `onPreview` (or never mounts the overlay),
  clicking there would silently do nothing — this shape means the bug
  could plausibly be real in some modules and not others, matching the
  user's own instinct that it needs a per-module check rather than one
  shared fix.
- `getAuthenticatedFileUrl()` (`services/api.ts`) just normalizes the URL
  to a relative path — no token embedding — so file access relies on the
  httpOnly auth cookie riding along on the `<img src>` request. Looked
  structurally sound, not an obvious shared culprit.
- Print is built the same way in every module that has it (a
  `ReactDOM.createPortal` into `<body>`, `Shared/PrintPrimitives.tsx` for
  the shared cells, a per-module `*.print.css`) — didn't inspect any one
  module's wiring for this pass.

**Before starting real work on this:** get the user to name which
module(s) and record(s) reproduce it, and which specifically fails —
preview click does nothing vs. errors, print button does nothing vs. opens
a blank/broken print dialog — since "which modules" is exactly the open
question, not an assumption to make.

</details>

---

## 24. Dashboard/list number reconciliation gaps · 子項1、4 FIXED（未部署）；子項2、3 待決定後處理

Captured 2026-09-19 from a full manual walkthrough of all 22 sidebar pages
(no console errors, no failed API calls — these are real data/display
discrepancies, not crashes). **Spot-checked against the local dev DB and
confirmed real** (see below); not yet re-checked against production,
which has diverged from local dev all session — verify there too before
assuming identical numbers.

1. **ITP submission count disagrees with itself.** Dashboard shows "ITP
   144, SUBMITTED 144 (100%)"; the ITP page itself shows "Submission 134,
   Submission Maturity 93%". Same underlying table, two different counts
   on two different pages.
2. **ITP status tabs don't cover the total.** Approved (26) + Pending (86)
   = 112, but the page header total is 144 — a 32-row gap. The user
   manually paged through all rows and found the missing 32 have status
   values that match no tab at all: blank (10), `active` (17), `For
   Construction` (5). **Confirmed via local DB**: 20 rows have a
   `referenceNo` starting `CHWCL-` instead of the normal
   `QTS-RKS-HL-...` pattern (close to but not exactly the reported 32 —
   worth a closer count when this is picked up), with an empty assignee
   field — legacy imported data, presumably pre-dating this app's own
   status vocabulary.
3. **Follow Up Issues card totals don't add up.** Cards show Open 17 /
   Closed 0 / Total 129 — 17 + 0 ≠ 129. The actual table status
   breakdown is Open 7 / In Progress 3 / Under Review 1 for genuine
   FollowUp rows, plus 118 rows that are the *virtual* ITP-sourced
   aggregation (see `columns.tsx`'s `isExternal` rows, `sourceModule`)
   carrying over those same non-standard ITP status strings from #2 above
   — so the "17" on the summary card doesn't obviously correspond to
   anything a user can find by looking at the table.
4. **NCR and OBS define "Open" differently from their own tabs.** NCR's
   top card shows Open=4, but its own status tabs show Open=3 + In
   Progress=1 (4 total, but the card's single "Open" number silently
   folds in a different status than the tab labeled Open). OBS does the
   same thing in the other direction — its In Progress items get counted
   into the Open tab.

**Not investigated yet:** where each of these counts is actually computed
(likely `useFollowUpIssueStats.ts`, a similar ITP stats hook, and each
module's summary-card logic vs. its own tab-filter logic disagreeing on
what counts as which status) — worth checking whether the summary cards
and the tabs are two independently-written pieces of logic that just
drifted apart, which is the same root-cause shape KPI's Void-exclusion
bug had before it was fixed 2026-08-27.

### 2026-10-06 查明根因與處理現況

**子項1（ITP 送審數矛盾）— 已修，未部署**：`useDashboardStats.ts` 的 `itpSubmitted`
漏掉 `status !== ''` 這個條件（ITP 頁面自己的 `useITPStats.ts` 有這個條件）。一行修正，
不涉及業務決策。

**子項4（NCR/OBS Open 定義不一致）— 已修，未部署**：專案裡已經有共用的狀態分類工具
`utils/statusBuckets.ts`（`isOutstandingStatus`/`isClosedStatus`/`isVoidStatus`），
Dashboard 自己早就在用，但 NCR/OBS **模組自己頁面**的 `useNCRStats.ts`／`useOBSStats.ts`
沒用、各自寫了一套不一致的 ad-hoc 邏輯。改成呼叫同一套共用工具後，`opening + closed +
void` 保證等於 `total`（含非標準狀態值）。`open`／`inProgress`／`resolved` 三個獨立分頁
的字面比對邏輯維持不變（這幾個分頁要不要重新設計是另一個待決定的 UX 問題，不在本次範圍）。
新增 `tests-unit/ncrObsStatsBucketing.test.ts` 12 項測試，連同既有 129 項單元測試、`tsc`、
build 全部通過。

**子項2（ITP 狀態分頁蓋不到全部）— 查明細節，使用者決定先不處理，記錄待辦**：
直接查本機開發資料庫確認全表範圍（不只 CHWCL 那批）非標準狀態分布：空白 10 筆、`active`
17 筆、`For Construction` 5 筆，合計 32 筆，與原始回報的 144−112=32 完全吻合。CHWCL 開頭
的 20 筆（`project_id` 皆為空，未掛任何專案）內容查證為真實業務文件——某涵洞電氣廂
（Culvert Box）工程的 MEP 檢驗測試計畫書（電纜、消防警報、CCTV、門禁、空調通風、照明配電、
接地、通訊、排水系統等），其中 `Pending`／`approved`（標準值）那幾筆其實已經有被正確算進
分頁，真正「無家可歸」的只有 `active`／`For Construction` 這兩種狀態文字——而且不只 CHWCL
這批，其他專案的 ITP 也有同樣狀態值，不是單一批次的孤例。

Claude 建議方案 2（新增一個「其他/未分類」分頁，不碰既有資料、不用猜任何歷史真相，讓所有
數字對得起來）而非方案 1（排除出總數會製造「全部分頁 vs. 統計總數」的新矛盾）或方案 3
（`active`／`For Construction` 是舊系統裡有意義的真實狀態用語，用猜的改成現在的 7 種標準
值風險太高，可能誤判這些記錄實際的審核進度）。**使用者本批選擇先不處理，待之後再決定要用
哪個方案。**

**子項3（FollowUp 卡片加總錯誤）— 仍待使用者決定方向，尚未查**：卡片的 Open/Closed/Total
要不要把從其他模組（NCR/OBS/NOI/ITR/ITP/PQP）帶過來的「虛擬項目」也正確分類成待處理/已結案
（工程量較大，要幫每個來源模組各自定義分類規則），還是卡片只算「真正的 FollowUp 資料表」。

## 25. UI polish: untranslated key + inconsistent date format · FIXED + 已於 2026-10-06 部署

**2026-10-06**：兩個子項都查證並處理：
- 「`common.revision` 顯示原始鍵」：**查無此問題**——全程式碼庫已經沒有任何地方引用這個
  翻譯鍵了（Checklist 列印範本的「Revision」是寫死文字，不是透過 `t()`），應該是
  2026-09-19 記錄之後、被別的重構順便修掉或拿掉了，不需要再處理。
- 「NOI 日期格式跟其他模組不一致（`2026/2/6` vs. `2026-02-06`）」：**已修**——只有
  `NOIPrintTemplate.tsx` 的「列印日期」這一行用 `toLocaleDateString('zh-TW')`，改成跟
  其他地方一致的 `YYYY-MM-DD`（用本地日期組件手動組字串，不用 `toISOString()`，避免跨時
  區在日期邊界算錯一天）。`tsc`／build 通過。

<details>
<summary>原始問題記錄（2026-09-19）</summary>

Captured 2026-09-19, same walkthrough as #24.

- Checklist's table header shows the raw i18n key `common.revision`
  instead of translated text — same class of bug as
  `checklist.templateModeBanner` fixed 2026-09-01 (missing translation
  key, `t()` returns the key itself since it's truthy, silently defeating
  any `|| fallback`). Check `common.revision` is actually defined in both
  `LanguageContext.tsx` language blocks.
- Date format is inconsistent across modules: NOI displays `2026/2/6`
  while other modules display `2026-02-06`. Cosmetic, but worth a single
  shared date-formatting helper if/when this is picked up, rather than
  patching NOI's specific format call in isolation.

</details>

(Owner Performance being an unimplemented placeholder page was also
re-confirmed by this walkthrough — already tracked, see
[[todo_dead_features_2026_08_24]], not re-logged here.)

## 26. Data integrity findings from manual walkthrough · NOT STARTED，已核對正式環境 · 【優先度：低／待分級】

Captured 2026-09-19. **All confirmed against the local dev DB**
(`backend/qualitas.db`) via direct query — not yet checked against
production, which has different/diverged data.

1. **Two NCRs with identical auto-generated description, from the same
   ITR.** `QTS-RKS-HL-NCR-000002` and `QTS-RKS-HL-NCR-000003` both have
   `description = "NCR raised from failed ITR QTS-RKS-HL-ITR-000003"`
   (confirmed via DB — `subject` is empty on both, the reviewer read
   `description` as the record's subject line in the UI). Each also has
   its own FollowUp row. Could be two genuinely separate failed checklist
   items on the same ITR each correctly raising their own NCR (the
   template text doesn't distinguish which item), or a duplicate-creation
   bug in the "Raise NCR" flow — **needs the actual creation audit-log
   entries checked to tell which**, per the reviewer's own note.
2. **Document-number prefix doesn't match the configured naming rule.**
   Document Naming Rules is configured as `QTS-RKS-{ABBREV}-...`, but
   confirmed live examples don't follow it: `QTS-A-PQP-000001`,
   `QTS-C-AUD-000001`, `QTS-HL-OSD-000001`, `QTS-A-NOI-000001` (missing
   the `RKS` segment entirely), plus `QTS-RKS-RKS-CHK-000006` (the
   already-known desync row from
   [[todo_checklist_backend_lock_and_itrid_desync]], not a new
   occurrence — cross-referencing, not re-logging).
3. **Closed OBS records missing fields that should be required at
   closure.** `HL-OBS-000001` is Closed but has no Close-out Date,
   Subject, or Raise Date. `NA-OBS-000002` has almost every field empty.
   Suggests either a backend gap (Closed doesn't actually require these
   fields) or bulk-imported/seeded data that skipped normal creation.
4. **Numbering prefix doesn't match the Contractor field, and collides
   with another record's sequence number.** `QTS-RKS-NA-NCR-000003` shows
   Contractor = "Hailong" (an `HL`-coded vendor) despite its own document
   number using the `NA` prefix, and it shares the same sequence number
   (`000003`) as `HL-NCR-000003` — two different-prefix documents landed
   on the same number. Given `generate_reference_no()` keys sequences by
   `(project, vendor, doc_type)`, this is very plausibly correct-by-design
   (different vendor prefix = different sequence counter, so collision is
   expected, not a bug) — but the Contractor-vs-prefix mismatch itself
   (an `NA`-prefixed NCR whose contractor is a different, `HL`-prefixed
   vendor) suggests the vendor was changed after the number was assigned,
   which existing number-assignment code doesn't seem to guard against.
5. **Broken cross-module reference.** ITR `ITR-000002`'s linked
   `QTS-A-NOI-000001` cannot be found in the NOI list at all — a
   documentNumber-based reference (see #3 in the "Original finding" P0
   note and [[todo_checklist_backend_lock_and_itrid_desync]]'s item 2)
   pointing at a NOI that either never existed under that number or was
   deleted without the ITR's reference being cleaned up.
6. **Impossible date ordering.** `NOI-000003`'s Issue Date (2/24) is
   *after* its Inspection Date (2/12) — the notice was apparently issued
   after the inspection it's supposedly about took place. No cross-field
   date validation catches this at write time.
7. **Missing reference number on an ITP row.** Row 6, "Pre-mixed Concrete
   Work", has no Reference no. at all — likely related to the same
   legacy-import population as #24's CHWCL-prefixed rows.

**Not investigated yet:** whether any of #3/#5/#6 are enforceable via a
cheap backend validator (closure-requires-these-fields for OBS; FK
existence check before allowing an ITR-NOI link to save; issueDate <=
inspectionDate cross-field check) versus being accepted as historical
seed-data noise not worth new validation code for.

### 2026-10-06 正式環境核對結果（唯讀查詢，未修改任何資料）

透過容器內 `python`／SQLAlchemy 直接唯讀查詢正式 `qualitas.db`（不是本機開發 DB）：

- **#1（重複 NCR 描述）：正式環境沒有** ——本機那兩筆重複的 NCR 看來是本機測試時產生的，
  不是正式資料的問題。
- **#2（編號前綴不符命名規則）：正式環境有 83 筆**，分布：NCR 0、OBS 0、PQP 1
  （`QTS-A-PQP-000001`）、NOI 0、**ITP 82 筆**（前綴是 `CHW01-`，不是本機看到的
  `CHWCL-`——代表是規模更大的同類舊系統匯入資料，本機那 20 筆 `CHWCL-` 應該只是這批正式
  資料的一個子集／取樣，不是獨立長出來的）。
- **#3（已結案 OBS 缺欄位）：正式環境確認重現**，就是同一筆 `QTS-RKS-HL-OBS-000001`（跟
  本輪稍早驗證 #20 時在這筆記錄上順便發現的歷史資料不一致是同一筆——缺 Close-out
  Date／Raise Date）。
- **#6（NOI 日期順序不合理）：正式環境確認重現**，同一筆 `QTS-RKS-HL-NOI-000003`（發出日期
  2026-02-24 晚於檢驗日期 2026-02-12）。
- **#7（ITP 缺編號）：正式環境確認重現**，同一筆「Pre-mixed Concrete Work」。

**結論**：#3、#6、#7 查到的都是跟本機開發環境**完全同一筆記錄**，代表本機開發資料庫本來就是
正式資料的某種快照/複製，不是本機自己長出的獨立問題；#2 則顯示正式環境的舊匯入資料規模比
本機看到的還大（82 筆 vs. 20 筆）。#4、#5 本輪未查（#4 的編號碰撞屬於設計內行為，#5 需要比對
跨模組關聯，本輪未做）。

依然只是記錄現況，尚未決定要不要做成防呆驗證或清理舊資料。

## 27. IAM user list never shows the actual username · FIXED 2026-09-30，已於 2026-10-05 部署

2026-09-30：store 四條資料整理路徑保留獨立 username；姓名下方顯示登入帳號並納入搜尋，兩者相同不重複顯示。另將編輯表單初始值從顯示姓名改為真正帳號，避免把 full_name 當 username 送回。前端110項測試、型別及建置通過；後續獨立畫面驗收確認帳號顯示／搜尋、只改信箱後帳號及姓名不變，重載畫面與唯讀DB一致。詳見 [交接紀錄](docs/workflow/iam-username-2026-09-30-handoff.md)。以下保留原始發現。

Captured 2026-09-19. Confirmed against `IAM/columns.tsx` — the user list
table's columns are `name` (full_name), `email`, `display_company`,
`role`, `status`, `createdAt`. **`username` is never a column.** The
reviewer's specific complaint — "the list only shows admin@example.com
and john@example.com, not YkDaniel, and the top-right corner just says
'System Administrator'" — is explained by this: `YkDaniel` *is*
`admin@example.com`'s username, but nothing in the IAM screen surfaces
that mapping, so there's no way to look at the user list and know what
username to type at the login screen, or to confirm which login session
maps to which row, without going to the database directly (as this
session had to do multiple times this month for password resets).

**Not investigated yet:** whether to add a `username` column outright, or
fold it into the existing `name` cell (e.g. "System Administrator
(YkDaniel)") — the latter needs less layout rework.

## 28. Project-selector dropdown does not filter list data server-side for any account that can see more than one project · FIXED 2026-09-29, deployed 2026-10-05

Captured 2026-09-19 as "not verifiable yet — only one project exists." Confirmed 2026-09-29 while
building the BACKLOG #37 load-state fix (root cause: none of 12 modules' list routers declared a
`project_id` query parameter, so the frontend's existing `getProjectFilterParams()` was silently
discarded by FastAPI on every one of them — full detail in the previous revision of this entry, now
superseded by the fix below).

**Fixed 2026-09-29**, module by module (not a blanket find-and-replace — verified each one
separately): added `project_id` to all 12 affected routers (ITP, PQP, NCR, OBS, NOI, ITR, FAT, OSD,
Audit, MeetingMinutes, Checklist, FollowUp) and threaded it through to each repository's `get_all`,
which (checked per module, not assumed) **already** applied `project_id` as an AND-combined filter
alongside the existing `apply_scope` — i.e. the intersection semantics this fix needed were already
correct at the repository layer for all 12; the gap was purely that the parameter never reached it.
10 of 12 services needed no change (`**filters` pass-through); ITP and Audit had explicit signatures
and needed the parameter added. Also added, to all 12 frontend stores: a fetch-sequence guard (a
late-arriving response for an old project selection can no longer overwrite a newer one) and
scope-aware clearing (a failed fetch for a newly-selected project clears the list instead of leaving
the previous project's rows on screen — BACKLOG #37's states apply on top of this). Separately found
and fixed: `FollowUpIssue.tsx` had its own ad-hoc fetch bypassing the shared store entirely (no
`project_id`, no re-fetch on project change) — the one module, out of 12, that didn't follow the
common pattern; caught only by testing each module's actual browser behavior, not by code reading
alone. "All Projects" semantics unchanged (empty filter object → router skips the condition →
behavior still governed by `scope` alone, exactly as before). Contractor filter, search, pagination,
status filters, and response formats all unchanged and verified working together with the new
`project_id` filter. Existing `project_id = NULL` demo data (db_seeder.py's baseline ITP/Checklist
records) is not touched or auto-assigned; its one behavior change is documented, not silently
absorbed — see the handoff.

Verified with a real 2-project isolated stack: 12/12 endpoints filter correctly by direct API
comparison (all/A/B counts match seed exactly); a single-project account requesting an out-of-scope
project gets an empty result (not an error, not a leak); browser walkthroughs compare actual row
identities (not just counts) across a project switch on ITP, FollowUp, and Dashboard; a delayed
old request does not overwrite a faster newer one; a failed switch shows BACKLOG #37's explicit
error state, never the old project's numbers. `tsc`, 97 frontend unit tests, build, and 265 backend
tests (12 modules' non-HTTP suites; 22 `_http.py` files couldn't run — this environment has no
`httpx` installed, pre-existing and unrelated to this batch) all pass; re-ran BACKLOG #37's full
verification suite on the same stack with zero regressions. Full per-module table, the FollowUp
finding, and the NULL-project-data impact note: [handoff](docs/workflow/project-filter-2026-09-29-handoff.md).

## 29. Outstanding test coverage from the 2026-09-19 walkthrough · NOT A BUG LIST — untested, not broken

Captured 2026-09-19, same session as #24-28 above. The reviewer
deliberately stopped short of these because they mutate data and wanted
sign-off first — **this is a to-do list of what still needs manual
verification, not a set of confirmed problems.** Don't read anything
below as "found broken."

- Create / Edit / Delete flows (any module) — untested this pass.
- Search — untested this pass.
- Language switch (en/zh toggle) — untested this pass.
- Role management (creating/editing custom roles, permission assignment)
  — untested this pass.
- Permissions Preview — untested this pass.
- Security page's "Sign out everywhere" — untested (would kill the
  reviewer's own session, correctly deferred).
- Security page's "Enable 2FA" — untested (would change the account's
  login flow, correctly deferred).

**How to apply:** when any of these areas comes up for real work, treat
this list as "not yet exercised end-to-end," not as "known-good" — the
walkthrough's own confirmed findings (#24-28) show that "no console
errors" is not the same as "correct," so absence of a report here isn't
evidence these areas are fine either.

---

## 30. ITR full-flow browser acceptance (2026-09-20) · 前三項已處理，#1 已於 2026-10-06 部署並正式環境驗證（#2/#3 已被後續決策解決）；其餘待決定 · 【優先度：低】

Captured 2026-09-20 from a UI walkthrough through the isolated stack
(`backend/scripts/verification/isolated_stack.py`), as three test accounts
(editor / approver / closer), zh UI: create ITR -> link template -> fill and
save -> approve -> revoke -> Checklist Reopen -> modify to Fail -> re-inspect
-> approval history. **No flow-blocking defect was found**; every step had a
working path. Nothing below was fixed or changed (no business rule touched).
English UI was not re-walked. Success feedback after save/approve could not be
confirmed reliably (a re-inspect success toast and error toasts were seen).

Ordered by priority (top three first):

1. **Untranslated i18n keys shown raw in the zh UI.** `itr.relatedITP`,
   `itr.selectITP`, `itr.sectionDrawings`, `itr.sectionCertificates` are
   defined only in the `en` block of `LanguageContext.tsx` (lines ~356-359),
   not in `zh`, so the ITR form shows the raw keys every time. Also the
   linked-checklist row badge shows raw English `PASS` / `FAIL` inside the zh
   UI (row renders `record.status` unlocalised). Same class as #25.
2. **A user without `itr:approve:all` can pick "Approved"; after the server
   refuses, the screen contradicts the real state.** Editor selects 已核准 and
   saves -> 403 with the raw English message `Operation not permitted.
   Required: itr:approve:all`, and the status dropdown stays on 已核准 while
   the ITR is still In Progress.
3. **The "approve anyway?" warning does not match the outcome.** With a Fail
   checklist the approver gets "此 ITR 有關聯的不合格檢查表。確定要核准嗎？";
   confirming then saving is refused (400 `Cannot approve ITR — checklist(s)
   not passed: ... (Fail)`, English) and the dropdown again stays on 已核准.
   The warning never says approval cannot proceed.

Other observations (lower priority):

- **Revoked ITR keeps its close-out date.** After revoke the ITR is In
  Progress but `closeoutDate` is still the approval day (list shows it).
  Whether revoke should clear it is a business-rule question — not decided.
- **Unsaved checklist-snapshot edits are discarded silently**: Cancel in the
  snapshot panel, or closing the whole ITR modal, gives no confirmation.
- **Save refused after another user approved the ITR meanwhile**: typed
  content is kept and the DB is unchanged (good), but the reason shown is
  `Required: checklist:close:all`, not "the ITR was approved"; the row still
  says 尚未填寫 (no refresh).
- **Re-inspect only appears after the ITR's 檢驗結果 is manually set to
  不合格**; a Fail checklist alone does not surface it. May be by design,
  just hard to discover.
- Sidebar shows modules the account has no permission for (403 console
  noise) — already tracked as the frontend permission-gated nav item, not new.
- Test-data note, not a defect: approval history showed 操作人 "未記錄" because
  the test accounts had no full name (the username was still shown).

### 2026-10-06 查明與處理

**#1（未翻譯 i18n 鍵）— 已修，已於 2026-10-06 部署並正式環境驗證**：`itr.relatedITP`／
`itr.selectITP`／`itr.sectionDrawings`／`itr.sectionCertificates` 確認只存在
`LanguageContext.tsx` 的 `en` 區塊，`zh` 區塊真的缺這 4 個鍵，已補上。另外關聯檢查表列的
Pass/Fail 徽章（`ITRModals.tsx` 原本直接印 `record.status` 英文原字）也一併改成透過既有的
`checklist.status.pass`／`checklist.status.fail` 翻譯鍵顯示。`tsc`／build 通過，正式環境
切換中文介面實測確認 4 個欄位跟徽章都正確顯示中文。

驗證時順便發現一個**沒在原始記錄裡、這次沒修**的小地方：ITR 的「ALL CHECKLISTS PASSED」
這句狀態文字在中文介面依然是英文原字，應該也是漏翻譯，之後有空可以一併處理。

**#2（權限不足核准後畫面顯示矛盾）、#3（核准警告文字跟結果不符）— 已被後續決策解決，
不需再修**：查證 2026-10-04 的 FORMS-CONSISTENCY-2026 那輪已經把 ITR 存檔失敗的訊息
改成專屬的 `itr.saveNotConfirmed`（「未能確認保存是否完成，您填寫的內容仍保留在這裡」），
是刻意決策：因為同一個 catch 也涵蓋「完全沒收到回應」的情況，系統本來就無法斷言保存
究竟成功與否，所以不敢宣稱「確定核准」或「確定失敗」。下拉選單繼續顯示使用者剛才選的
值，是搭配這句誠實的「不確定」提示文字一起呈現，不再構成「畫面宣稱假狀態」的矛盾——
這輪沒有再動 ITR 核准流程本身。

**兩項次要觀察，使用者本批決定先跳過：**
- 撤銷核准後結案日期不會清掉——確認是刻意設計（`revoke_itr_approval` 的函式說明明確
  寫會保留撤銷當下每個欄位當歷史紀錄），是業務規則問題，不是程式疏漏，需要你明確決定
  要不要改這個行為。
- 未存檔的 checklist 編輯、取消或直接關閉 ITR 視窗沒有確認提示——這個是真的 UX 缺口，
  但會動到 ITR 編輯畫面，照規矩先報備，使用者決定先跳過。

## 31. `set_user_scope` audit is not atomic (commit first, audit after) · NOT STARTED — kept as a to-do by decision 2026-09-20 · 【優先度：已決議延後】

Listed in `docs/workflow/itr-ui-improvement-notes.md`: the account
data-scope path `set_user_scope` still commits before writing its audit
entry (non-atomic), so a failing audit write can leave the scope change saved
without a record. The account-protection round only added the Admin-account
guard; transaction consistency was not changed. Priority was lowered on
2026-09-20 in favour of the ITR full-flow acceptance above; **no
implementation was started.** Related unaudited area: 2FA (`two_factor.py`)
was outside that inventory.

---

## 32. ITR upstream/downstream flow acceptance (2026-09-20, round 2) · findings + what this round fixed

Captured 2026-09-20 from an ISOLATED full-chain run (isolated stack, real logins, Chromium): ITP -> Checklist
template -> ITR (from NOI) -> fill / approve / revoke / reopen / history -> Fail -> NCR -> re-inspection ->
NCR closure -> Q-WorkFlow, plus dashboard figures and four scoped accounts. **Each flow was exercised once on one
path. That is NOT "the module is done"**: English UI, NCR form with a role that can pick an assignee, OBS, PQP and
concurrent users were not run. Only ITP/NOI/ITR/NCR/Checklist were walked; OBS/PQP were inventoried by reading
code only (OBS has `noiNumber`/`itrNumber` columns that nothing uses; PQP has no link to ITP/ITR).

Related-documents graph as coded (`workflows/relationships.py`): ITP<->NOI, NOI<->ITR, NOI<->NCR only. ITR->NCR,
ITR->re-inspection ITR and NCR->ITR are plain text/id fields with no edge, so those panels cannot navigate them.

### Fixed this round (2026-09-20) — data-scope consistency
- **Checklist instances had no contractor** (measured: contractor-scoped account got 200 from link, then 404 on the
  instance; empty checklist area in the ITR). `link_checklist` and `create_reinspection` now copy the contractor from
  the parent ITR (real FK column, re-read under the write lock), like `project_id`. `record_in_scope` unchanged: a NULL
  contractor is still NOT visible to a contractor-scoped user. Existing contractor-less rows are only *reported* by
  `checklist_itr_inventory.py::find_instances_missing_contractor` (read-only, frozen parents marked); **not backfilled**.
- **`/api/itr/stats` ignored data scope** (measured: an account that sees 0 ITRs read total 3 / approved 2 / void 1).
  Now uses the same `apply_scope` as the list on the single base query for total/status/overdue; optional
  `project_id`/`vendor_id` only narrow. Authorization boundary, not a cosmetic issue.
- Verification: `tests/test_scope_instance_contractor_http.py` (21) + isolated browser run; see the notes file.

### Still open, ordered (measured facts / read from code / not verified are separated)

> **2026-10-07 對照更新（讀碼＋NAS 檔案指紋比對，未實測）**：下列三項在這份清單裡仍寫成未修，但目前程式碼已修好，且 NAS 上的檔案與本機 md5 完全一致（`routers/file_router.py`、`services/itp_service.py`、`services/checklist_service.py`、`core/scope.py`），即**已上線**：
> - **ITP create 稽核**：`ITPService.create_itp` 已是單一交易（flush → `log_audit(strict=True)` → 一次 commit，失敗整體 rollback）。
> - **Checklist create 稽核**：`ChecklistService.create_checklist` 同上（2026-09-23 原子性修正）。
> - **`POST /api/files/upload` 只檢查登入**：現在先 `require_attachment_permission(..., "update")`，再 `attachment_target(...)` 確認目標存在且在資料範圍內；`by-entity`／`get`／`delete`／`download` 也有對應檢查。
> - **Checklist 空白模板後端防護（#22）**：後端建立時拒絕直接帶 `itrId`／`template_id`，並檢查結果欄位；#22 只剩兩個政策決定（重驗是否沿用同模板、舊資料是否清理），不是程式碼缺口。
> - 附件授權的 HTTP 測試（`test_attachment_authorization_http.py` 等）本次**跑了約 9 分鐘仍無結果**，原因未查，故上述為讀碼結論，不是實測結論。
1. **NOI create: Q-WorkFlow row and NOI CREATE audit were not persisted** — **NOI part FIXED 2026-09-20 (round 4); ITP and Checklist-template
   create audits are STILL OPEN.** Measured before (isolated file-backed SQLite, real login + HTTP, new Session): create -> 200, NOI 1,
   Q-WorkFlow 0, audit 0, sequence 1, `/api/workflow/` empty; an injected Q-WorkFlow failure raised `PendingRollbackError` and left the NOI
   committed (2 NOIs, 0 rows). Cause read from code and consistent with the numbers: the repository committed the NOI first, then the
   Q-WorkFlow flush / non-strict audit add were never committed. Fixed as ONE transaction (write lock -> sequence -> NOI -> Q-WorkFlow ->
   strict audit -> one commit; any failure rolls back everything incl. the sequence). ITP create and Checklist-template create still
   commit first and audit afterwards (0 audit rows measured) — same pattern, not touched. Open question found on the way (existing
   behaviour, pinned by a characterisation test in round 4, **FIXED in round 5 (2026-09-20)**): the create path gives a re-inspection NOI
   (`ncrNumber`) no Q-WorkFlow row but the start-up back-fill used to give it one. Both now call the same `noi_has_own_qworkflow`
   (truthiness of the stored value; no new normalisation). Existing rows are never deleted/merged/renumbered. **Historical extra rows:** a
   database that was restarted before this fix may already hold rows for re-inspection NOIs — count UNKNOWN (not inventoried on any real
   database); `scripts/verification/noi_workflow_inventory.py` lists them read-only. **Break point found (reported, not fixed):** if the
   re-inspection ITR is filed under the *re-inspection NOI* instead of the original NOI and the original's only ITR is Void, the original NOI's
   tracker cannot pass column 2 (W/H Inspection needs a non-Void ITR under the ORIGINAL NOI) — existing rule, independent of the back-fill.
2. ~~**Dashboard trend month bug in UTC+ time zones.**~~ **FIXED 2026-09-20 (round 6).** Measured: Asia/Taipei window was 2026-03..2026-08
   (no current month), UTC 2026-04..2026-09; all six trend cards read 0 with data present. Cause: a local first-of-month Date read back
   through `toISOString()`. Now `src/utils/trendMonths.ts` (integer year/month arithmetic on the user's local month; one documented rule
   for which month a record belongs to). **Still open here:** the only Checklist figure on the dashboard is the *template* count
   ("Checklist Trend"); no inspection-result statistic exists (`useDashboardStats().checklist` is computed but never rendered) — semantics
   deliberately not changed. Also: the trend `useMemo` has no clock dependency, so a tab left open across midnight of a month change keeps the
   old window until data changes (not addressed).
2b. ~~**One invalid date in NCR/OBS/NOI made the whole list 500; OBS/NOI update returned 500 after saving; NCR partial update skipped the order check.**~~
   **FIXED 2026-09-20 (round 7, NCR/OBS/NOI only).** New strict write rule (`core/strict_dates.py`: complete calendar-valid `YYYY-MM-DD`, 422, no
   truncation), validated on the final/merged content before commit; historical values are read back raw with a read-only `date_issues`
   (never written back); frontend shows raw value + warning and never overwrites it with a blank input. **Still open:** the shared lenient
   `validate_date_format` is unchanged and still used by ITP/ITR/OSD/FAT/FollowUp/Audit/Meeting/PQP (untested); overdue-NCR closure
   (closeout after the SLA due date = 422) is a separate policy decision; historical anomaly count on real databases UNKNOWN (read-only
   `scripts/verification/date_inventory.py`, nothing cleaned). Details in the notes file.
2c. ~~**NCR/OBS/NOI modal closed after a refused save (page swallowed the error; modal called `onClose()` unconditionally).**~~ **FIXED 2026-09-20 (round 8).**
   One `SaveOutcome` (`utils/saveFlow.ts`) now separates "record not saved" / "saved, file step failed" / "saved, list reload failed"; the modal
   closes only for a complete save, keeps every field, the original date values and pending files otherwise, and a retry never re-creates the
   record or re-does finished uploads/deletes. Browser regression: `react-app/tests-browser/save-failure.mjs` (129 assertions, file endpoints
   stubbed). **Still open:** the same `await onSave(...); onClose()` pattern exists in ITR/ITP/OSD/FAT/PQP/Meeting/FollowUp/IAM/Contractor
   modals — NOT examined; the file upload endpoint writes into `backend/uploads` with no override, so real upload storage is not testable in an
   isolated stack (an env override for the upload root would fix that).
   Round 9: create-only accounts get a files-only retry (never rewrites the record); edit-after-partial, category split and refused writes
   covered by the same browser regression (180 assertions). Read from code, NOT tested/changed: `POST /api/files/upload` checks login only —
   no module permission and no `entity_in_scope` — so any logged-in account can attach files to any entity id.
   Round 10: the duplicate toast for "saved, file step failed" was removed by a collaborator (banner only); browser regression updated to
   assert one persistent banner and no toast (187 assertions, file endpoints still stubbed).
   Round 11 (attachment authorization, MEASURED not fixed): `/api/files/*` ignores the target record's module permission (a no-permission
   account can upload/list/download/delete attachments of NCR/OBS/NOI/ITR incl. closed/approved ones), upload skips scope/existence/lock checks
   (out-of-scope accounts inject files; nonexistent targets get orphan files), `contractor`/`km` are fully open to scoped outsiders, soft-deleted files
   stay downloadable by path. Tool: `backend/scripts/verification/attachment_authz_audit.py` (real HTTP, upload root redirected into the run dir).
   Fix plan + permission table + the create-only-retry decision (A/B/C) are in the notes file; no authorization policy was changed.
   Round 12 (FIXED, decision A taken): configurable upload root `QUALITAS_UPLOAD_ROOT` (mandatory + confined in isolated processes; the suite fails if
   `backend/uploads` changes), uploads need an existing in-scope target, all-or-nothing batches, soft-deleted files not downloadable by anyone, reads need
   `<module>:view:all`, upload/delete need `<module>:update:all` for all 14 entity types (create-only accounts cannot attach files; UI warns before creating),
   explicit state locks applied (NOI/Audit/FollowUp Closed, Meeting Published/Void, ITR Approved, PQP Approved, Checklist under an Approved/Void ITR;
   OBS/NCR Closed by photo category). STILL OPEN / for decision: attachment policy for Void states, NOI Reject, NCR/OBS Closed for non-photo categories,
   Checklist Pass/Fail, unknown categories; other modules' front ends not reviewed for the new 403s. NEXT: overdue-NCR closure (keep the original due date
   and the overdue fact; check the closure and overdue statistics first).
   Round 13 (attachment wrap-up, FIXED): ITR Void locked; exact per-module category allow-list (was: any label variant bypassed the OBS/NCR category lock);
   row-less files are served ONLY as KM images (km:view:all), never on the strength of their directory; download entry point now uses the same token
   validation as get_current_user (revoked / logged-out-everywhere / refresh / deactivated tokens were accepted). OPEN: front ends of ITP, ITR, OSD, PQP,
   Meeting not yet aligned with plan A (no attachmentsAllowed, old close-on-failure handling); row-less legacy files in ncr/obs/osd need an inventory
   decision (dev DB not read); `update_itr` has no field lock for Void; remaining pending attachment states listed in the notes file.
   Round 14 (overdue NCR closure, FIXED): an NCR may be closed after its due date (rule `closeoutDate <= dueDate` removed; raise<=closeout and
   raise<=due kept); the due date of a Closed NCR / of the closing request is frozen (`due_fixed_at_closure`, NEW small rule — confirm); "NCR closed" hint only after
   the server confirmed; form shows "closed late". No NCR batch endpoint exists. Existing statistics / scheduler / Q-Workflow unchanged (pinned by tests). Auth
   regression after the shared-validator refactor: 384 + 25 tests pass. `due_fixed_at_closure` CONFIRMED (does NOT stop "move the due date, THEN close"; no full
   due-date-change history is claimed). NOT done: "NCR is not linked to any ITR" hint still shows before the save.
   Round 15 (FIXED): the backend now requires ncr:close:all to enter Closed (PUT from any non-Closed status AND POST created as Closed; service layer, checked before any
   write; role names give no exception). Earlier "closure permission unchanged" was true only for the UI. OPEN: create-as-Closed skips the closure conditions;
   editing / reopening a Closed NCR still needs only ncr:update:all in the backend; the UI still lets a no-close user pick Yes and only then gets the 403.
   Round 16 (FIXED): an NCR cannot be created directly as Closed around the closure conditions — ONE shared `assert_closure_conditions` for create and update; photos
   cannot exist before the record does, so a direct Closed is always refused; closedBy is server-set (client value ignored on create and update; forged closedBy was
   stored before). Measured, NOT fixed: NCR create/update write NO audit rows at all (audit added after the repository commit and never committed). OPEN: verifiedBy /
   effectivenessVerifiedBy still client-writable; the update-path photo condition only reads the improvementPhotos JSON list (any string), not the attachments table.
   Round 17 (FIXED): NCR create / update / closure are ONE transaction with strict audit (repo commit=False, single commit, rollback on any failure; CREATE / UPDATE with
   actual before-after of changed fields / STATUS_CHANGE; no file content, no fabricated history). NCR trace is NOT complete: closure photos still satisfiable by any string;
   verifiedBy / effectivenessVerifiedBy client-writable; closedBy keeps the first closer on re-close; delete_ncr audit atomicity not checked.
   Round 18 (FIXED, behaviour change): NCR closure now needs improvement photos the SERVER confirms — an attachment row of THIS NCR, category improvementPhoto, not
   deleted, file present under the upload root, image FILE HEADER (first bytes only; the file is not decoded, so a truncated / corrupt file with a valid header passes) — instead of "the improvementPhotos JSON list is non-empty". Measured before: arbitrary string,
   non-existent path, another NCR's photo, own soft-deleted photo, wrong-category photo all closed the NCR (HTTP 200). Legacy JSON path strings no longer count (not
   rewritten, not backfilled; historical Closed NCRs are not re-validated unless re-closed). Photos are always uploaded AFTER the record write, so the UI flow is two
   saves (photo first, verdict "Yes" second); the UI previously could NOT close with attachment photos at all (pre-existing defect, fixed). Photo-delete vs closure race
   closed with one shared write lock. Round-17 record check: failure of the SECOND audit row (STATUS_CHANGE) now covered; photo audit is count-only, cannot tell a
   same-count replacement (no attachment history system). OPEN: Q-Workflow improvement checkpoint still reads the JSON column; `getEntityFiles` trailing-slash 307
   (may relate to #23); verifiedBy / effectivenessVerifiedBy client-writable; re-close operator; delete_ncr audit atomicity; reopen permission.
   Round 19 (FIXED): `getEntityFiles` called `/files/by-entity/` but the route is `/files/by-entity` -> every list took a 307 with an absolute Location. With the repository's own
   vite.config.js (Location rewrite) it WORKED, with one extra round trip per list; it FAILED (cross-origin) only behind a proxy without the rewrite. Round 18's "dev proxy
   rewrites Host -> fails" was measured with a scratch proxy and its browser run used yet another one: CORRECTED. Client now asks for the exact route (no proxy dependence; no CORS /
   auth / Host change). NOT changed: image check is FILE-HEADER only (not decodable-image proof); OBS/OSD/Meeting modals not browser-run; nginx not run; BACKLOG #23 NOT closed.
   Round 20 (INVESTIGATED ONLY, no rule changed): Q-Workflow "improvement" reads the NCR improvementPhotos JSON string list, the opposite of the round-18 closure rule (server-verified
   attachments). Measured: valid attachment closes the NCR but leaves the flow stuck at "improvement"; a made-up string / another NCR's path / soft-deleted path is green there but
   refused for closure; `blocking_ncr_id` points at the NCR that HAS evidence. Progress is 100% computed on read (qworkflow has no progress columns; GET endpoints and the start-up
   backfill write nothing — measured), so a rule change alters historical DISPLAYED progress / dashboard buckets but no row. Proposal in the notes file: shared read-only batch evidence
   check, per-NCR class verified / invalid / legacy_unverified / missing, Closed history = done + "unverified" flag, open NCR with legacy JSON = current; decisions marked with a star; must
   deploy together with round 18.
   Round 21 (FIXED, behaviour change): the Q-Workflow improvement checkpoint now uses the SAME read-only photo check as NCR closure (core/ncr_photo_evidence.py, batch, one query per 400 NCRs,
   no cross-request cache, file HEADER only). Not Closed: passes only with a valid attachment of this NCR (old JSON strings do not count; reasons missing / invalid / legacy_unverified,
   with re-upload hints; a reopened NCR keeps its pass while a valid photo is still there). Closed: passes either way — "current photos verified" with a valid photo, else "passed on Closed
   status, photos not verified" with the underlying reason kept. Percentage formula unchanged; the cell and the flow summary state how many records are unverified; blocking_ncr_id is the NCR that
   really blocks (stable order). Closed-passes-the-tracker never loosens re-closing (tested). Read-only impact inventory script added (refuses the project's own DB/uploads; real-data counts
   still UNKNOWN). Correction to round 20: only the shape "valid attachment + empty JSON" got stuck, not every legitimate closure. Deploy group = rounds 18 + 19 + 21 together; deployed 2026-10-05 (code was already in the working tree; not separately git-pushed).
   Item 33.1 (one full test run before merge/deploy) is now due.
3. **NCR re-inspection number is unvalidated free text and is what NCR closure requires.** Measured: `NO-SUCH-ITR-999`
   was accepted and stored; Q-WorkFlow then refuses to count it. Data-integrity, not UI.
4. **ITR approval condition vs Q-WorkFlow completion condition disagree.** Approval needs every checklist Pass;
   Q-WorkFlow counts an ITR "passed" only from the manual `inspectionResult` field. Measured: an Approved re-inspection
   ITR with `inspectionResult` empty never satisfies the re-inspection checkpoint, and an Approved ITR locks that field
   (revoke -> set -> re-approve needed). The original failed ITR can never be Approved (checklist Fail), so the NOI reaches
   100% only by voiding it (measured: Void keeps Fail result, NCR link, checklist evidence).
5. ~~**`link_checklist` does not check the template's scope.**~~ **FIXED 2026-09-20 (round 3).** Measured before: contractor B got
   404 reading contractor A's template, but `link-checklist` with A's template id returned 200 and B read the copied content.
   Now `link_checklist` requires the source template to pass `record_in_scope` (same rule as the direct read; NULL project /
   contractor is not a public template; no shared-template policy added). Missing and out-of-scope answer with the same 404
   body; the check runs before numbering, the instance and the audit, and before the "is an instance" message. Consequence
   to know: a scoped account can no longer link a template that has no project/contractor (such templates were already
   invisible to it in the list). Details in the notes file.
6. **NCR form: required "assignee" picker is empty for a role without IAM user-list permission** (measured with the
   test role), so the form cannot be saved from the UI; the NCR raised from an ITR also arrives with subject, reference
   standard and deviation empty although the UI requires them. Not verified with a role that has the permission.
7. Interface/traceability, lower: related panels lack ITR->NCR / re-inspection / NCR->ITR edges; the same template can
   be linked twice into one ITR (business rule undecided); ~~"Generate Checklist" and its toast are English-only~~
   **FIXED 2026-09-28/29** — see the two dated entries at the bottom of this file (Generate Checklist permission
   gating + friendly messaging, and the item panel/footer i18n unification); NCR
   closure needs `effectivenessVerified` and owner approval (separate permissions) — unexplained in the UI.

---

## 33. Follow-ups raised at the end of round 20 (2026-09-21) · NOT STARTED — recorded by decision, nothing changed · 【優先度：已決議延後】

Each item is a to-do, not a finding about a specific bug. Context: `docs/workflow/itr-ui-improvement-notes.md`, rounds 18-20.

1. **One FULL test run before any merge or deploy.** Rounds 18-20 only ran the relevant subsets (never the whole backend suite plus the front-end unit
   tests), while touching shared code: `core/utils.py` (`lock_ncr_for_write`), `routers/file_router.py` (delete takes the NCR lock), `services/ncr_service.py`,
   the shared `denv` fixture in `tests/test_date_write_guard_http.py` (file router mounted, extra user `dt_v1`), `react-app/scripts/run-unit-tests.mjs`
   (axios alias / `import.meta.env` define). Do it once after the Q-Workflow implementation, not every round.
   **DONE 2026-09-22 (round 22)**: full backend suite on the frozen tree = 1949 passed, 3 skipped, 0 failed (34:41); front-end unit 75/75, tsc, production build OK, ESLint 29 = 29 existing, 0 new.
   The first full run had 2 failures that were a TEST-SETUP artefact (stale bytecode left by one of my mutation checks), not a regression — details in the notes file, round 22.
2. **Confirm what wrote `backend/qualitas.db` and appended to `backend/logs/app.log` at 21:27:20 on 2026-09-21.** One INFO line
   (`core.security - Token blacklisted`, +86 bytes; log now 22065055 bytes) and the dev DB's mtime are the same second. The test files that log out
   (`test_attachment_hardening_http.py`) did not grow the log when re-run alone, so it is NOT attributed to any process of these rounds - but it was
   not ruled out either (a comparison test run was in progress). Someone who can see the developer's own dev server should check whether a login/logout
   happened then. This is an isolation question, not log noise. Nobody has read or modified either file's contents.
3. **Q-Workflow: decision on "historical Closed NCR without verifiable photos".** Round-20 proposal = `done` + an "unverified historical" flag (percentage
   rises for such flows; Accepted can turn green with a flag). Weakness: the tracker has only done / current / pending, no "unknown", so a small flag on a
   green cell can still be read as "complete". Alternative = keep such NCRs `current` (flows stay stuck). Decide together with the other open decision
   (open NCR with only legacy JSON: block vs flag). Neither is implemented.
4. **Watch the two-step closing flow for a usability trap after release.** The prompt tells the user to leave "Effectiveness Verified" off "Yes" for the save
   that uploads the photo, but the form derives status Closed from "Yes"; someone who already picked Yes must set it back by hand. Automatic two-step saving
   was declined (2026-09-21). Revisit if users hit the message repeatedly.
   **FIXED 2026-09-22 (round 23), SCOPE = an already-existing NCR only**: such an NCR with `ncr:update:all` now offers "Upload photo(s) only" next to the improvement-photo picker
   once a file is pending — calls ONLY `POST /api/files/upload`, no NCR write, no field/status/date change, no auto-close; a form already at "Effectiveness Verified = Yes" no longer
   has to be changed back to add a photo. On success the pending file is cleared and the stored list is re-read (no re-upload on the next Save); on failure everything is kept,
   nothing marked done. Reuses the existing attachment permission/scope/state-lock checks server-side (no frontend-only gate). **STILL a limitation, not fixed**: a not-yet-created
   NCR has no such entry point and none is silently created for it — the "new record already set to Yes" case is unchanged.
   Round 24 (2026-09-22): closed a coverage gap — upload succeeds but the follow-up list-reload GET fails was untested. Confirmed the pending file was already cleared as soon as the
   upload POST succeeds (no duplicate-upload risk existed), but nothing told the user the reload failed. Added a distinct toast ("uploaded, but the list reload failed") and 7 new
   browser assertions (26 total in `upload-photos-only.mjs`, all pass; `save-failure.mjs` NCR suite 105/105 unchanged). No backend change. All testing so far (rounds 23-24) done by
   Claude Code; not independently verified by the user yet.
5. **NOT STARTED — a brand-new (unsaved) NCR still cannot pre-upload its improvement photo.** Item 4's fix (rounds 23-24) only covers an ALREADY-EXISTING NCR; a new record has no id yet,
   so "Upload photo(s) only" is correctly not offered there (item 6 of the round-23 request: no entry point, and nothing is silently created to make one available). If a user fills a
   new NCR's form with Effectiveness Verified already "Yes" and adds a photo before the first save, they still hit "Cannot close yet" and must save once (verdict off "Yes") before the
   photo can go up, then set it back. No decision has been made on whether this deserves its own treatment (e.g. always requiring one non-closing save for a brand-new NCR, or something
   else) — recorded here as a to-do only; not implemented, not scoped.

## 34. ITP inspection-plan table column headers are English-only · NOT STARTED, deferred by decision · 【優先度：已決議延後】

**Where:** `react-app/src/components/ITP/ITPAdvancedEditor.tsx` — the plan table's own column headers
(Event No. / Inspection Activity / Standard / Criteria / Check Time / Method / Frequency / Records /
Verification Point / Sub. / Main / Emp. / HSE / Op.).

**Context:** found during the 2026-09-28 ITP UI/UX review alongside the item-edit-panel/footer-button
localization gap. The panel + primary action buttons were localized in the 2026-09-29 batch (see the dated
entry below), but the user's instruction for that batch named only "項目面板與主要操作按鈕" — the table's own
column headers are a separate, larger surface and were explicitly left untouched pending a scope decision.

**Why not done:** not authorized yet — needs its own confirmation before touching, since it's a bigger,
more visible surface than the item panel (every row references these headers) and deserves a deliberate
look at translation choices (e.g. whether "Verification Point" role abbreviations SUB./MAIN/EMP./HSE stay
as-is, matching what the item panel's own Sub-Con/Main Con/Employer fields resolved to — see the batch's
handoff doc `docs/workflow/itp-uiux-batch2-handoff.md` for that precedent) before being applied at table scale.

---

## 35. ITP standalone `/itp/:id` page (`ITPDetail.tsx`) has no i18n at all, and a different detail_data parser than the list-page modal · Gap 2 (parser) FIXED 2026-09-29, deployed 2026-10-05; Gap 1 (i18n) FIXED + 已於 2026-10-07 部署並正式環境驗證

**Where:** `react-app/src/components/ITP/ITPDetail.tsx`, routed at `/itp/:id` in `App.tsx` — a real,
reachable page, not dead code, but structurally separate from `ITPModals.tsx` + `ITPAdvancedEditor.tsx`
(the list page's own edit modal).

**Found:** 2026-09-28/29, while fixing the Record-link misrouting bug (`docs/workflow/itp-record-link-fix-handoff.md`)
and doing the ITP UI/UX batches. Two separate gaps on this one page:

1. **Zero i18n integration** — no `useLanguage()` import at all. Every label, button (Save Document / Add
   New Item / Print / PDF / Publish), and the item edit panel are hardcoded English, unlike the list-page
   modal which was brought fully under the i18n mechanism in the 2026-09-29 batch.
2. **A different `detail_data` parser** — this page only understands the older phased
   `{a:[...], b:[...], c:[...]}` object shape (`ITPDetail.tsx` lines ~134-153); the list-page modal's shared
   `utils/itpParser.ts` accepts BOTH that shape and a flat array with per-item `phase` keys (what
   `prepareDetailPayload()` in `ITPModals.tsx` actually writes). A record whose items were most recently
   saved via the list-page modal may render with **zero items** on this standalone page even though the
   data is there — confirmed while building a verification seed for the Record-link fix (had to seed a
   second ITP row in the old phased shape specifically so this page would show anything at all).

**Why not fixed (at the time):** out of scope for both batches that found it — the Record-link fix batch was
fix-only (that one bug), and the UI/UX batch's language-unification instruction named the list-page modal's
own panel/buttons only.

**Gap 2 (parser) — FIXED 2026-09-29, independently re-verified same day (no further code change):**
`ITPDetail.tsx` now loads through the same `utils/itpParser.ts::parseInspectionItems` the list-page
modal uses, instead of its own inline `{a,b,c}`-only logic. First round: isolated-stack verification
(13 assertions across 5 detail_data shapes, including a save-and-reload round trip) confirmed both
entry points show identical item count/content/order for every shape, including the previously-empty
flat-array case. Second round (separate isolated environment, field-by-field instead of count/text
only): 24 assertions checking every field (activity/standard/criteria/checkTime/method/frequency/
record + all 4 VP points) and the Phase `<select>`'s actual value (not just which visual group it
rendered under) for every item on both entry points — all matched; plus a cross-entry-point save
round trip (save on the standalone page, reopen via the list-page modal) confirmed no loss or
reordering; plus the 3 other review scripts that also exercise `ITPDetail.tsx` (Record-link fix,
form-actions, form-ux-responsive — 169+60+8 cases) re-run with zero regressions. `tsc`, 91 frontend
unit tests, and the production build all passed both rounds. Save logic untouched (both entry points
already wrote the same `{a,b,c}` payload). Details: [Claude 交接紀錄](docs/workflow/itp-detail-parser-fix-handoff.md)
(第一輪修正 + 第二輪 Claude 獨立複驗，兩段分開記錄).

**Gap 1 (i18n) — FIXED，已於 2026-10-07 部署並正式環境驗證（2026-10-07）：**

加上 `useLanguage()`，範圍對齊清單頁編輯視窗（`ITPModals.tsx`／`ITPAdvancedEditor.tsx`）已經
翻譯過的部分——重用既有 `itp.itemPanel.*`／`common.*` 翻譯鍵（編輯項目視窗的標題、編號、階段、
標準、準則、檢查時機、檢驗方法、頻率、紀錄、驗證點標籤、取消/套用按鈕），加 5 個新鍵
（`itp.detail.*`：Activity EN/CH 分開的兩個欄位、Insert After、At the End、Save Document、
Inspection Details 區塊標題）給這頁獨有、清單頁編輯視窗沒有對應欄位的部分。頂部「Back to
List」改用既有 `common.back`。

**刻意不翻譯、維持跟清單頁編輯視窗同樣的既有慣例**：正式文件本身的表格欄位標題（Event No.、
Inspection Activity、Standard / Criteria 等）、文件標題「Inspection & Test Plan」、HSE
縮寫——查證清單頁的「參考實作」（`ITPAdvancedEditor.tsx`）自己的主表格欄位標題跟這些 toast/
confirm 訊息也都是寫死英文，不是漏翻譯，是整個 ITP 模組對正式文件格式維持固定雙語/英文標籤
的既有慣例，這次刻意保持一致，不擴大翻譯範圍。

**順便修正一個跟 i18n 無關的真實 bug**：刪除項目的確認對話框原本寫死中文
「確定要刪除此項目嗎？」，即使在英文介面下也會跳出中文——改成跟參考實作
（`ITPAdvancedEditor.tsx`）完全一致的英文文字「Are you sure you want to delete this
item?」，兩個入口點行為统一。

`tsc`／完整 build／129 項前端單元測試全數通過。正式環境登入後切換中文介面實測：「返回」按鈕、
編輯項目彈窗的所有欄位標籤（編號、階段、檢驗活動英/中文、標準、準則、檢查時機、檢驗方法、
取消/套用按鈕）皆正確顯示中文，確認修正生效。

### 2026-10-07 使用者驗證時額外發現並一併修正：編輯項目彈窗太窄、配色跟系統不一致

使用者截圖指出「編輯項目（A.1）」這個彈窗太小、顏色也跟系統其他地方不一致。查證屬實，而且是
**兩個入口共同的既有問題**，不是這次 i18n 修正造成的：

- **寬度**：清單頁編輯視窗（`ITPAdvancedEditor.tsx`）的項目編輯彈窗是 `max-w-[1100px]`＋
  `max-h-[90vh] flex flex-col`（header 用 `shrink-0`、內容區 `flex-1 overflow-y-auto`）；
  這個獨立詳情頁（`ITPDetail.tsx`）的同一個彈窗卻只有 `max-w-2xl`（672px，不到一半寬）、內容區
  固定 `max-h-[70vh]`——兩邊編輯的是同一種資料，寬度卻差了一大截，難怪覺得特別擠。已改成跟
  清單頁完全一致的 1100px＋flex-col 版面。
- **配色**：彈窗標頭兩邊都用藍紫漸層（`bg-gradient-to-r from-blue-600 to-indigo-600`），跟系統
  其他彈窗（`FormShell.module.css::modalHeader`）的米白底（`#faf7f1`）／金色邊框
  （`rgba(184,148,90,...)`）／深色文字（`#2d2a24`）完全不同調——這個色差在**兩個入口都存在**，
  是既有設計不一致，不是這次新增的。已經把 `ITPDetail.tsx` 跟 `ITPAdvancedEditor.tsx` 兩邊的彈窗
  標頭都改成跟系統一致的米白／金色／深色配色，拿掉原本為深色背景設計的裝飾圓形光暈與高亮效果。

`tsc`／build 通過，正式環境切換中文介面實測確認兩項修正都生效（彈窗變寬、標頭配色跟系統一致）。

### 2026-10-07：ITP 編輯視窗與表格 UX 精修（已修，已於 2026-10-07 部署；尚未在正式環境登入實測）

使用者逐項看預覽提出的調整。`ITPDetail.tsx` 與 `ITPAdvancedEditor.tsx` 兩邊逐字同步（兩份彈窗是重複程式碼，每次都要改兩次，長期建議抽成共用元件，未做）。

- **版面**：Activity／Standard 並排成一對（各自內部英文在上、中文在下）；視窗放大到 `max-w-[1500px]`／`max-h-[95vh]`。
- **區塊標題**：所有欄位群（Activity、Standard、Criteria、Check Time、Method、Frequency、Record、Phase、Insert After）統一為「標籤＋同列橫線」，線色 `slate-400`、2px。
- **語言辨識**：EN／中文改為有色小標籤（EN 藍、中文金），中文輸入值改用深色（不再淺灰，避免看起來像 placeholder）。
- **Criteria**：多項時顯示 1、2、3 編號圓點（單項不顯示）。
- **Event No. / Phase 卡片**：拿掉 Event No. 唯讀框（標題已有）；**Phase 保留**——`handleAddNew` 寫死 `defaultPhase = 'A'`，Phase 下拉是新增到 B/C 階段與搬移項目的唯一入口（一度誤判可拿掉，已更正）。Insert After 與 Phase 並排。
- **必填**：Activity／Standard 英文必填，儲存前有最小內容檢查。
- **表格字級**：螢幕表格英文主行 11px、中文副行 10px、中文統一 `slate-500`（Frequency 原本比其他欄小一級）。列印版未同步。
- **列印**：每個階段橫列與該階段第一列同組（`<tbody break-inside-avoid>`），避免階段橫列單獨留在頁尾。**只改程式碼，未實際列印驗證**。
- **ITP 列表頁**：狀態改用共用 `StatusBadge`（新增 `approvedwithcomments` 青綠、`reviseresubmit` 橘兩個顏色，僅影響 ITP；NOI 只有 Open／Closed／Reject）；參考編號改金褐色、列 hover 底線；垃圾桶平時淡灰、列 hover 才變紅。
- **刻意不改**：階段顏色（灰／藍／綠）維持原樣；VP 區塊靛藍底框維持；鉛筆編輯圖示維持在最右側 Operation 欄（該欄為 `sticky right-0`，本來就不會被捲走）；Calibri／標楷體字型試過後取消（沒有內建 Carlito 前，沒裝 Calibri 的電腦英文會變襯線體）。
- **未決**：Criteria 多項之間是否加分隔線；列印版字級是否與螢幕統一；Standard 灰框的等寬字型。

---

## 36. ITP: a new inspection-plan item can be saved with every field blank · NOT STARTED, deliberately deferred · 【優先度：已決議延後】

**Where:** `react-app/src/components/ITP/ITPAdvancedEditor.tsx`'s "Add New Item" → item edit panel → Apply.

**Found:** 2026-09-28, real isolated-browser evidence during the ITP UI/UX review — clicking "Add New Item"
then "Apply" with zero fields filled succeeds, creating a row with only an auto-assigned Event No. and the
default `Record: "-"`. No required-field validation exists on this panel at all.

**Why not fixed:** the user explicitly decided, when picking which UI/UX findings to act on
(2026-09-28), that this one gets noted as an observation only — **no mandatory-field rule or confirmation
dialog this round** ("第 2 項空白檢驗項目暫不新增必填規則"). Recorded here so it isn't lost, not because a fix
was attempted and abandoned.

**What to decide before building:** which fields (if any) should be required — Activity seems the obvious
minimum candidate (an item with no activity name is hard to act on later), but Standard/Criteria/Check
Time/Method/Frequency are more debatable; a business decision, not a code decision.

## 37. Dashboard's "current total" cards don't distinguish a failed load from zero, except for NCR/OBS/NOI · FIXED 2026-09-29, deployed 2026-10-05

**Where:** `react-app/src/hooks/useDashboardModuleStatus.ts` (new), and every Dashboard surface that
shows a "current total" or a trend for ITP/PQP/NCR/OBS/NOI/Checklist — the key-stats tiles,
`ITPStatsCard.tsx`/`PQPStatsCard.tsx`/`NCRStatsCard.tsx`/`OBSStatsCard.tsx`, `ITPGaugeChart.tsx`/
`PQPGaugeChart.tsx`, the OBS/NCR pareto sections, and `TrendAnalysisSection.tsx`'s 6 mini-cards.

**Found:** 2026-09-29, while building the Dashboard key-stats summary (which reuses the existing
`statistics` object — see [UI/UX handoff](docs/workflow/dashboard-uiux-2026-09-29-handoff.md)). A
store whose fetch failed left its `xxxList` empty and every card read `total: list.length` with no
check of the store's own `error` flag — a genuine "0" and "failed to load" rendered identically.
The existing `failedModules` banner only checked NCR/OBS/NOI, not ITP/PQP/Checklist.

**Fixed:** new `useDashboardModuleStatus()` hook derives one of `'loading' | 'error-empty' |
'error-stale' | 'ok'` per module from each store's EXISTING `loading`/`error`/list — no calculation
changed, no new store state. Every Dashboard surface that shows one of these modules now reads the
same per-module status, so a module in trouble reads the same way everywhere on the page (no
"module says 0 here, error banner says something else there"). Project/permission-scope changes are
handled by a scope-confirmation ref (a scope's data is only trusted as "stale but real" once a
fetch has actually completed FOR THAT SCOPE — a switch whose re-fetch fails shows "could not load",
never the previous scope's numbers, even flagged). Details, including a real render-loop bug and a
real scope-change race caught and fixed live while verifying this: [load-state handoff](docs/workflow/dashboard-loadstate-2026-09-29-handoff.md).

**Found and separately recorded while verifying this fix, not folded in:** BACKLOG #28 (the
project-selector dropdown doesn't actually filter these lists server-side for a multi-project
account) went from "not verifiable" to confirmed with a concrete root cause. Also observed at the
time (not acted on, per instruction): the key-stats tile, stats card and gauge for PQP/ITP show the
same numbers three times on one page — **resolved 2026-09-29** in the Dashboard statistics-
consistency + PQP/ITP simplification batch (`ApprovalSummaryCard.tsx`), see
[handoff](docs/workflow/dashboard-stats-consistency-2026-09-29-handoff.md).

## 38. App-shell header overflows horizontally at ~390px in English (not Chinese) · 已於某輪修正並已部署，2026-10-06 正式環境複驗確認

**Where:** `AppLayout.tsx`'s own top header (`_topBar_...`), not any specific module page.

**Found:** 2026-09-29, while checking the Dashboard statistics-consistency batch at 390px in both
languages. Chinese renders at 390px with zero horizontal overflow; English overflows by 42–80px
depending on the page (measured on `/pqp` and `/dashboard`, both otherwise untouched by that
batch — confirmed the header itself, not page content, is the cause: the Dashboard's own new
`ApprovalSummaryCard`s measured 332px wide, well inside the 390px viewport). Likely cause: English
labels in the header ("SC Full", "All Projects", "Logout" etc.) are longer than their Chinese
equivalents and the header row has no wrap/truncation behavior at this width.

**Why not fixed:** out of scope for the batch that found it (Dashboard-only, explicitly told not to
touch other components) — this is shared app-shell chrome used on every page.

**What to decide before building:** whether to truncate/abbreviate the longer English labels, let
the header wrap onto a second line below ~400px, or hide some elements (e.g. the project selector's
text label, keeping just the icon) at narrow widths — a design decision, not investigated further.

### 2026-10-06 複驗：已經修好了，只是本文件標籤沒更新

查 `AppLayout.module.css` 發現 `@media (max-width: 640px)` 已經有對應修正（連同程式碼內的
`BACKLOG #38 (2026-09-29)` 註解一起找到的），選的是「決定選項」裡的第二個方案：讓標頭在窄
寬度換行成兩行，不裁切、不縮成只剩圖示、每個控制項維持原本可點擊大小。應該是某一輪連帶修掉
的，但沒有同步回來更新這份文件的狀態標籤。

正式環境以 390px、英文介面複驗：`document.documentElement.scrollWidth − clientWidth = 0`，
畫面上標頭正確換行成兩行（System Administrator / All Projects / Logout 各自完整顯示），
確認無水平溢出。不需要再處理。

## 39. NCR 改善照片保存與結案需分兩次操作 · UX 改善候選，延後處理 · 【優先度：低】

**記錄日期：2026-09-29。狀態：未實作，低優先序；不阻擋目前業務試用。**

- **已實測現況**：獨立隔離環境的 Rework 案例中，同時加入新 Improvement Photo 並設定 Effectiveness Verified=Yes 後保存，畫面拒絕並提示先保存照片、再設定 Yes。輸入仍保留；改為 Pending 保存、重開確認照片存在，再設定 Yes 保存後成功 Closed，唯讀 DB 查詢確認結案。
- **使用者影響**：完成改善時需要額外保存與重開步驟。此為操作便利性問題，本案例未發現流程阻斷或資料遺失，不歸類為已確認的安全性／資料完整性缺陷。
- **後續目標（方案待設計）**：減少人工往返，清楚呈現照片保存與結案各自的結果。不得放寬後端對「已保存、屬於本 NCR 的有效改善照片」及既有結案權限／條件的檢查。
- **驗收重點**：成功路徑可減少操作；照片上傳失敗或結果不明時不得誤報結案，輸入與待處理操作保留；重試不重複上傳已確認成功的照片，亦不重複執行已確認成功的結案。
- **範圍限制**：本次僅驗證 Rework 個案，未驗證 Repair／Use As Is 分支或所有失敗情境。僅列入代辦，不代表現在開始實作。

證據與 Claude 交接：[NCR Rework 畫面試用](docs/workflow/ncr-rework-manual-trial-2026-09-29.md)。

## 40. Q-Workflow 專案切換未生效與超過 200 筆漏列 · FIXED，已於 2026-10-05 部署

2026-09-30：頁面及後端三個工作流程端點補上選定專案條件，與既有資料範圍取交集；頁面改為逐頁載入完整清單，修正摘要計算全部但清單僅顯示前 200 筆的落差。新增集中載入 hook，切換不殘留旧範圍數值，失敗提供重試。

修正前新增三項 HTTP 測試均重現失敗；修正後相關後端 56 項、前端 108 項、型別及建置通過。獨立隔離畫面實測兩專案切換及正確 NOI 導頁，另確認 202 筆清單與摘要一致。未重跑完整後端套件；競態與錯誤重試的畫面注入測試未執行，證據層級詳見 [交接紀錄](docs/workflow/qworkflow-project-pagination-2026-09-30-handoff.md)。使用者 8198／3198 環境未動，未改業務完成條件。

## 41. Q-Workflow 節點連結仍包含作廢 ITR · FIXED，已於 2026-10-05 部署

2026-09-30：checkpoint 進度已排除 Void ITR，但摘要中的 `itr_ids`／`reinsp_itr_ids` 未排除，節點可能導向已作廢的檢驗報告。本批僅修正連結 ID 輸出，不改完成規則或資料。兩項新增 ORM 回歸測試先確認失敗再修正，涵蓋複驗單號／typed relation 及全部 ITR 作廢。詳見 [交接紀錄](docs/workflow/qworkflow-void-links-2026-09-30-handoff.md)。

## 42. NOI 歷史 ITP 空值使清單／單筆回應失敗 · FIXED，已於 2026-10-05 部署

2026-09-30：隔離 HTTP 測試確認 `itpNo=NULL` 造成讀取回應驗證失敗。僅放寬讀取 schema 以原值呈現，建立契約不變、未清洗資料；前端讀取型別同步。另修正先前分頁種子漏填 ITP 的問題。相關測試 28 項加新增種子測試 1 項通過，型別及建置通過，未跑瀏覽器或全套件。詳見 [交接紀錄](docs/workflow/noi-null-itp-read-2026-09-30-handoff.md)。

## 43. Q-Workflow 待關注 API 缺日期排序相反 · FIXED，已於 2026-10-05 部署

2026-09-30：同進度時 NULL／空日期原本排在有效日期之前，已依既有規則改為缺日期最後。新增回歸測試先失敗再修正，相關 service 與專案 HTTP 測試共 32 passed。此 API 目前無前端呼叫端，不宣稱 Dashboard 畫面變動。詳見 [交接紀錄](docs/workflow/qworkflow-project-pagination-2026-09-30-handoff.md)。

## 44. KM 檢視者仍可見寫入操作入口 · FIXED，已於 2026-10-05 部署

2026-09-30：真實隔離畫面重現 viewer 可見新增／刪除／編輯／Word 匯入；已依既有 create/update/delete 權限隱藏入口並補事件防呆，後端未改。viewer／editor 畫面驗收、編輯實際保存及112項前端測試、型別與建置通過。未驗證的操作另列於 [交接紀錄](docs/workflow/km-permission-ui-2026-09-30-handoff.md)。

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

### 2026-09-28：FAT／ITP 多專案新建選擇（已修，已於 2026-10-05 部署）

新建表單可選取後端 scope 允許的專案，兩個建立請求均傳遞 project_id；載入失敗可重試並保留輸入。保留既有空值規則及後端權限，不提供既有紀錄改歸屬。前端91項單元測試、tsc、build與隔離瀏覽器22項斷言通過，未重跑完整後端。Claude 接手範圍、測試資產、重跑方式與未驗證項詳見 [交接紀錄](docs/workflow/fat-itp-project-selection-handoff.md)。

### 2026-09-28：NCR／FollowUp 停用帳號新指派（已修，已於 2026-10-05 部署）

NCR assignedTo 與 FollowUp assignedToUserId 的新指派由服務層拒絕停用或不存在帳號；原歷史 id 重送／無關編輯保留。兩個前端選單保留原停用負責人的標示並禁止新選停用者。不含自由文字姓名／簽核人欄位，不自動轉派。相關後端100項、瀏覽器12項斷言、前端91項單元測試與型別／建置通過。詳見 [Claude交接紀錄](docs/workflow/active-assignee-handoff.md)。

### 2026-09-28：ITP 狀態下拉提供後端不接受的選項（已修，已於 2026-10-05 部署）

`ITPModals.tsx` 的狀態下拉先前無條件提供 `Rejected`／`No submit`，兩者完全不在後端 `WorkflowEngine.TRANSITIONS["ITP"]` 表內（不是任何狀態的來源或目標），選了保存必定被後端 400 拒絕；`Revise & Resubmit`／`Pending` 也未依目前狀態的合法目標過濾（例如 `Approved with comments` 出發會誤提供不合法的 `Approved`，此轉換方向不對稱）。已改為只提供「目前狀態本身」＋「後端表中該狀態的合法目標」，核准／作廢仍依既有 `itp:approve:all`／`itp:void:all` 判斷，未修改後端表或新增權限。歷史上已存在的 `Rejected`／`No submit`／完全未知狀態值會如實顯示（含明確提示），不會被清洗或改成 Pending。合法目標依「已保存的原狀態」計算（新建則依建立流程起始狀態），不會因表單上未儲存的當下選值而變動，避免選了合法目標但不儲存卻解鎖原狀態不允許的下一步——此點原本有缺陷，已修正並實測。隔離環境共30項斷言、前端91項單元測試、型別檢查與建置通過；後端程式碼未變動，未重跑後端套件。詳見 [Claude 交接紀錄](docs/workflow/itp-status-menu-handoff.md)。

### 2026-09-28：ITP 主資料成功／明細失敗的保存呈現與重試（已修，已於 2026-10-05 部署）

既有 ITP 紀錄更新時，若主資料 `PUT` 成功但明細 `PUT /detail` 失敗，先前畫面只顯示底層例外訊息（如「Network Error」），未說明主資料其實已保存，容易誤解為整筆都沒保存。中途一度誤判「收到 HTTP 回應＝確定拒絕、可稱未保存」，經核對 `update_itp_detail` 是先 commit 才組回應，commit 後失敗一樣會回錯誤碼，因此**收到回應不代表沒有寫入**，已更正為不分錯誤來源、一律顯示保守措辭「主資料已保存；檢驗計畫的保存結果尚未確認，請確認後重試」，不直接把原始錯誤文字或原始回應內容當使用者說明。視窗／輸入／附件待處理佇列維持不變、儲存鈕恢復可用；重試會重新送出主資料與明細兩者——已觀察到主資料因此多寫一筆稽核紀錄，其他潛在副作用未驗證，不宣稱無害，本批未新增去重機制；重試前若再次修改內容，保存的是最新內容而非失敗當下的內容；明細失敗時附件階段完全不會被執行，不會誤報已上傳或清空佇列。未逐一核對該端點每個例外相對於 commit 的先後順序，因此不區分「確定寫入前拒絕」的特定情況，統一使用保守提示；伺服器已提交但回應遺失的情境本身仍未實測，如實列為限制。未修改後端交易、權限或狀態機，未抽共用 hook。隔離環境本輪重跑20項斷言全數通過、前端91項單元測試、型別檢查與建置通過（皆本輪重新執行，非引用先前批次數字）；後端程式碼未變動，未重跑後端套件。詳見 [Claude 交接紀錄](docs/workflow/itp-main-detail-partial-handoff.md)。

### 2026-09-28：Projects 建立／更新／刪除授權（已修，已於 2026-10-05 部署）

`routers/projects.py::_require_admin` 原本直接比對角色**名稱**字串（`admin`/`Admin`/`ADMIN`/`system_admin`），完全不經過 IAM 權限碼系統，與前端 `Contractors.tsx`「新增 Project」按鈕早就在用的 `hasPermission('contractors:manage:all')` 判斷不一致：持有正確權限但角色名稱不同的使用者會被誤拒，角色名稱剛好是 `Admin` 但零權限的使用者反而能寫入。已依使用者指示採用既有的「稽核五路徑修正報告」方案 A：三個寫入端點改用既有權限碼 `contractors:manage:all`（`RoleChecker(CONTRACTOR_MANAGE)`），未新增權限碼、未修改任何角色的權限配置。讀取、資料範圍、稽核與引用刪除保護（`check_project_references`）維持原樣。角色改名不影響資格已用後端測試證實。後端相關測試34項、隔離瀏覽器7類情境（含未登入401、引用保護仍生效、前端入口與後端要求一致）通過；前端未修改任何程式碼（原本就是對的），未重跑 tsc/單元測試/build。詳見 [Claude 交接紀錄](docs/workflow/projects-authorization-fix-handoff.md)。

### 2026-09-28：ITP Generate Checklist 權限入口＋Publish 確認彈窗（已修，已於 2026-10-05 部署）

真實隔離瀏覽器操作發現兩項：Generate Checklist 按鈕完全未依 `checklist:create:all` 顯示／隱藏，沒有權限的帳號仍看得到、點得到，失敗時 toast 直接顯示後端原始權限碼字串；Publish 用瀏覽器原生 `window.confirm()`，固定文字看不到實際目標版次／狀態。已修：沒有權限整個不顯示按鈕（非僅停用），有權限但未保存／無項目時顯示明確中文原因，操作期間權限被收回時顯示友善訊息（不含原始權限碼）且保留已輸入內容；Publish 改用既有 `ConfirmModal`，沿用既有 `getNextRevision` 計算目標版次、依 `isUnchangedSincePriorWrite` 判斷區分新建／既有紀錄／僅補做附件的重試三種文案，取消不送出請求。後端授權、保存政策皆未變動。`tsc`／91項前端單元測試／build 通過，隔離環境7項情境（含真實 DB 層權限收回、Publish 三種文案、Cancel 無請求）全數通過。詳見 [Claude 交接紀錄](docs/workflow/itp-generate-checklist-publish-uiux-handoff.md)。

### 2026-09-28：ITP 複製檢驗項目（已修，已於 2026-10-05 部署）

每筆檢驗項目新增「複製」按鈕，沿用既有「新增項目」編輯面板，帶入來源內容供使用者修改；Apply 才加入獨立新項目（`JSON.parse(JSON.stringify(...))` 深層複製，修改複本的 Criteria／Verification Points 不影響來源），取消不寫入；新項目取得全新編號，不沿用來源 id；`record`（連結既有 ITR／Checklist 證據的欄位，經查證後確認語意）清空為 `'-'`，避免誤稱新項目已有檢驗紀錄。唯讀模式沿用既有 `{!readOnly && ...}` 區塊，未另加開關。`tsc`／91項前端單元測試／build 通過，隔離環境涵蓋既有紀錄與新建（未保存）兩種模式的取消／Apply／複本獨立性／保存後重開驗證，皆通過；唯讀模式隱藏僅用程式碼核對，未另開帳號重新畫面驗證。詳見 [Claude 交接紀錄](docs/workflow/itp-copy-inspection-item-handoff.md)。

### 2026-09-29：ITP Record 連結導錯（已修，已於 2026-10-05 部署）

`ITPAdvancedEditor.tsx`／`ITPDetail.tsx`（`/itp/:id` 獨立路由，非死碼）點擊 Record 欄位時，原本用「開頭是不是 QTS」判斷該去 Checklist 還是 ITR——但系統裡 ITR／ITP／Checklist／NOI 的文件編號全部以 `QTS-` 開頭，真正的 ITR 記錄一律被誤導向空的 Checklist 清單，非測資巧合，正式編號規則下必然發生。新增 `utils/itpRecordLink.ts::resolveItpRecordLink`，改成真的查詢 `GET /itr/?search=`與`GET /checklist/?search=&include_instances=true`兩個端點，篩出完全相符的結果分類：單一相符正確導向；查無資料明確提示；兩邊合計超過一筆（真實撞號）明確提示「多筆相符」不猜；其中一邊 403 且另一邊查無資料時提示「無權限查看」而非誤稱找不到。未改編號規則、未清洗既有資料、未改後端任何驗證邏輯。`tsc`／91項前端單元測試／build 通過，隔離環境5種情境（真實 ITR／真實 Checklist／查無資料／真實撞號／無查看權限）於列表頁彈窗與 `/itp/:id` 兩個入口皆驗證通過。排查過程中發現 `ITPDetail.tsx` 的 `detail_data` 解析格式與列表頁彈窗不同，已記錄為獨立待辦（見上方 #35）。詳見 [Claude 交接紀錄](docs/workflow/itp-record-link-fix-handoff.md)。

### 2026-09-29：ITP 整體 UI/UX 第二批——列印標題／保存狀態／語系統一（已修，已於 2026-10-05 部署）

延續 2026-09-28 審閱選出的最後 3 項改善：(1) 檢驗計畫分頁的列印用大標題原本永久佔用畫面約三分之一且不隨捲動消失，改成精簡識別列常駐頂端，原列印區塊改 `hidden print:block`（只在真正列印時出現，JSX／class 完全未動）；(2) 新增主資料／檢驗計畫／附件三個獨立、持續可見的保存狀態徽章，依各自實際保存結果呈現，不因一步成功就顯示整筆已保存（新增 `ItpMainSavedError` 讓「主資料已存、計畫未確認」與「整個都失敗」可被分辨；`onApplyItems` 改回傳實際成功與否），保存時機完全未變；(3) 項目編輯面板（12個欄位標籤）與 Print／新增項目／發布按鈕改用既有語系機制，Activity 中英文內容輸入框維持分開、未合併。`tsc`／91項前端單元測試／build 通過，隔離環境7項情境（含模擬附件失敗時三徽章正確分別呈現「已保存／已保存／保存失敗」，以及真實重試後直接查 DB 確認保存成功）全數通過。範圍外：ITP 表格欄位標題（見上方 #34）與 `ITPDetail.tsx`（見上方 #35）未觸碰；第2項（空白項目必填規則，見上方 #36）依使用者指示本批不做。詳見 [Claude 交接紀錄](docs/workflow/itp-uiux-batch2-handoff.md)。

### 2026-09-29 — 表單操作按鈕統一（已實作）

依使用者要求統一各模組表單的操作位置、尺寸與顏色。新增共用 FormActions 與語意按鈕樣式，工具靠左、取消及保存靠右且保存最右，支援窄畫面換行；保留既有事件／權限／保存行為。169 項隔離介面斷言、FAT/ITP 22 項建立流程回歸、前端 91 項單元測試、型別檢查及建置通過。完整套件及所有角色流程未重跑。

交接與實際截圖：`docs/workflow/form-actions-unification-handoff.md`。

### 2026-09-29 — 共用表單響應式與操作列可見性（已實作，已於 2026-10-05 部署）

手機單欄、平板兩欄、桌面三欄；共用關閉圖示補上名稱與鍵盤焦點。NCR 主表單／FAT 明細的儲存操作列移出捲動內容區，ITR Checklist 選單改為響應式排列避免溢出。隔離表單 60 項斷言、原按鈕一致性 169 項回歸、前端 91 項測試、型別與建置通過。後端及業務規則未改，未跑全後端套件。詳見 `docs/workflow/form-ux-responsive-handoff.md`（含範圍限制與截圖）。

### 2026-09-29 — Dashboard 資訊順序／數字命名／圖表排版／語系統一（已實作，已於 2026-10-05 部署）

依使用者要求調整呈現，未改任何統計算法、狀態分類、權限或資料範圍。(1) 新增唯讀專案 chip（讀既有 `useProjectStore`）+ 移入承包商篩選（既有 `<select>`/store 原封不動）成 scope bar 置頂；(2) 新增「關鍵統計摘要」，5 個磚重用既有 `useDashboardStats()` 的 `statistics`（未另算），明確標示「目前總量」區隔於下方近 6 個月趨勢；(3) 逐張核對 `TrendAnalysisSection.tsx` 各卡真實日期欄位後命名（NCR/OBS 依發生日期、NOI 依核發日期、PQP 依最近更新日期無則到期日、ITP 依送審日期、Checklist 依檢查日期），不再統稱「Trend」或「新增件數」；(4) 修正 PQP/ITP 儀表圖在 1024–1344px 區間被擠壓的根因（`.itpChartWrapper`/`.pqpChartWrapper`/`.obsChartWrapper`/`.ncrChartWrapper` 補 `flex-wrap: wrap`），標題改用較短且準確的 i18n 字串；(5) 新增 19 組語系 key，清除趨勢區、Gauge 標題、空資料提示的中英文硬寫。隔離環境：獨立算好的 ground truth 與關鍵統計磚/既有卡片/Gauge 四處顯示逐一比對一致（含承包商篩選後），桌面 1440/平板 820/手機 390 三種寬度皆零水平溢出，`tsc`/91 項前端單元測試/build 通過，另重跑既有 `dashboard-workflow-review.mjs` 零迴歸。過程中發現 PQP/ITP/ITR/Checklist 的載入失敗狀態完全沒有「未知非零」的提示（現有 `failedModules` 橫幅只涵蓋 NCR/OBS/NOI），已獨立記錄為 #37，本批未觸碰。詳見 [Claude 交接紀錄](docs/workflow/dashboard-uiux-2026-09-29-handoff.md)。

### 2026-09-29：ITP 獨立詳情頁 detail_data 解析格式不一致（已修，已於 2026-10-05 部署）

延續 BACKLOG #35：`ITPDetail.tsx`（`/itp/:id`）原本用自己的內嵌邏輯讀取 `detail_data`，只認得舊版分階段物件 `{a,b,c}`，遇到列表頁彈窗會寫入的扁平陣列格式就判斷為「無資料」而顯示空白檢驗計畫，即使該筆記錄實際有項目。改為呼叫與列表頁彈窗相同的 `utils/itpParser.ts::parseInspectionItems`（本來就同時接受兩種格式，並含雙語欄位正規化），兩個入口自此共用同一套解析邏輯。保存邏輯未動（兩入口本來就都寫回同一種 `{a,b,c}` 格式）。範圍限定在這一個解析格式問題；同一則待辦記錄的另一個缺口（此頁完全沒有 i18n）依指示本批不處理。`tsc`／91 項前端單元測試／build 通過，隔離環境涵蓋扁平陣列（原本顯示空白的格式）、舊版分階段物件（迴歸）、缺 phase 欄位＋舊版純字串 activity 的混合情境、`detail_data` 為 `None`，以及保存後重開共 5 種情境、13 項斷言，全數通過；未重跑 Record 連結導錯與表單按鈕統一／響應式那三批的審閱腳本。詳見 [Claude 交接紀錄](docs/workflow/itp-detail-parser-fix-handoff.md)。

### 2026-09-29：Dashboard 載入狀態（首次載入中／失敗／零筆／範圍切換）明確化（已修，已於 2026-10-05 部署）

延續使用者要求，修正 BACKLOG #37：新增 `useDashboardModuleStatus`，把 ITP/PQP/NCR/OBS/NOI/Checklist 六個模組既有的 `loading`/`error`/清單三個欄位轉成明確狀態（載入中／失敗無資料／失敗有舊資料／成功零筆），Dashboard 摘要、統計卡、Gauge、Pareto、趨勢小卡全部改讀同一份狀態，不再各自用「筆數是否為 0」互相矛盾地猜測。範圍切換用 ref 追蹤「資料是為哪個範圍確認的」，切換後失敗一律顯示「無法載入」，不會誤把舊範圍數字標成「這個範圍的舊資料」。隔離環境驗證涵蓋延遲回應、模擬失敗（無資料／有舊資料）、成功零筆、失敗後重試恢復、範圍切換共 6 類情境，`tsc`／97 項前端單元測試（新增 6 項涵蓋狀態判斷全部分支）／build 通過。過程中在真實瀏覽器抓到並修正兩個實際程式問題：(1) 第一版 store 讀取寫法（selector 回傳新物件）造成 React 無限重新渲染，Dashboard 白屏；(2) 範圍切換與重新抓取之間有真實競態，會讓中間那個畫面誤將舊範圍資料標記為新範圍已確認。驗證過程同時發現並獨立記錄 BACKLOG #28（專案下拉篩選對多專案帳號完全無效，根因是 5 個路由未宣告 `project_id` 參數），本批未觸碰。詳見 [Claude 交接紀錄](docs/workflow/dashboard-loadstate-2026-09-29-handoff.md)。

### 2026-09-29：專案篩選未生效（BACKLOG #28）全面修正（已修，已於 2026-10-05 部署）

逐一核對 12 個模組（ITP/PQP/NCR/OBS/NOI/ITR/FAT/OSD/Audit/會議記錄/Checklist/後續問題）的「專案選擇→請求參數→後端查詢→store→清單/Dashboard」完整路徑：前端一直有正確送出 `project_id`，後端 repository 層也一直正確支援（與既有 `apply_scope` 用 AND 組合，語意本來就是交集）——問題出在 12 個路由的清單端點全部沒有宣告 `project_id` 參數，FastAPI 直接丟棄。修正：12 個路由補上參數並傳遞；其中 ITP／Audit 的 service 是明確簽名，另外補一個參數；其餘 10 個 service 本來就用 `**filters` 直通，不需要改。前端 12 個 store 的 `fetchXxx` 全部加上：(1) 序號防競態，避免延遲的舊請求覆蓋新範圍資料；(2) 跨範圍失敗清空清單，避免切換專案後失敗仍殘留舊範圍數字（沿用 BACKLOG #37 的錯誤狀態）。逐一測試時額外發現 `FollowUpIssue.tsx` 是 12 個模組中唯一繞過共用 store、自己直接呼叫 API 且從未帶 `project_id` 也從不隨專案切換重新抓取的頁面，一併修正比照。承包商篩選／搜尋／分頁／狀態條件／回應格式與「全部專案」既有語意皆未變動；既有 `project_id` 為空的示範資料（`db_seeder.py`）未被自動指定專案，其唯一行為改變（選定特定專案時會從清單消失）已如實記錄。隔離環境 2 專案 12 模組全數以直接 API 比對＋瀏覽器逐筆核對記錄內容（非只比總數）、單一專案帳號查詢範圍外專案得空結果、延遲舊請求快速切換不覆蓋新資料、切換失敗顯示明確錯誤狀態，皆驗證通過；重跑 BACKLOG #37 完整驗證零迴歸。`tsc`／97 項前端單元測試／build 通過；後端 12 模組相關非 HTTP 測試共 265 項通過（22 個 `_http.py` 測試檔因環境未裝 `httpx` 無法執行，屬既有環境缺口，已用隔離環境真實 HTTP 驗證彌補）。詳見 [Claude 交接紀錄](docs/workflow/project-filter-2026-09-29-handoff.md)。

### 2026-09-29：Dashboard 統計一致性修正＋PQP／ITP 呈現簡化（已修，已於 2026-10-05 部署）

**一、統計一致性**：先用隔離資料重現（NCR/OBS 各涵蓋 Open/In Progress/Resolved/Closed/Void 五種真實合法狀態，對照後端 `WorkflowEngine.TRANSITIONS["NCR"\|"OBS"]`），確認 `useDashboardStats.ts` 的 `ncrOpen`（只認字面 "open"，漏算 In Progress/Resolved）與 `obsOpen`（"非 Closed" 誤把 Void 算進開啟）都是程式錯誤，不是刻意設計的兩種指標——已有的 `NCRStatsCard.tsx`/`NCRParetoChart.tsx` 與 `OBSStatsCard.tsx`/`OBSParetoChart.tsx` 本來就互相一致，用「既非 Closed 也非 Void」這個既有規則（可對照 2026-08-27 KPI Void-exclusion 的先例），只有 `useDashboardStats.ts` 沒跟上。修正：抽出共用 `utils/statusBuckets.ts`（`isClosedStatus`/`isVoidStatus`/`isOutstandingStatus`），NCR/OBS 的摘要、卡片、Pareto 三處全部改用同一份計算，不再各自定義。另外 Pareto 圖累積比例原本分母含 Void、柱狀圖卻只畫 Open/Closed，造成最後一根柱子加總低於累積線標示的 100%——依使用者裁示，累積比例分母改為排除 Void，與柱狀圖範圍一致；柱狀圖 Y 軸上限也比照改用 Open+Closed 計算。隔離環境驗證修正前後：修正前 Key Stats 磚（NCR Open=2/29%、OBS Open=6/86%）與 StatsCard（兩者皆 5/71%）確實不一致，修正後三處全部一致（5/71%）。

**二、PQP／ITP 呈現簡化**：新增共用 `ApprovalSummaryCard.tsx`，取代原本「關鍵統計磚＋詳細卡＋Gauge」三處重複顯示同一組數字——PQP/ITP 從關鍵統計摘要磚移除，「PQP/ITP 成熟度分析」區塊改成一張整合卡：已核准數／總數、核准比例、必要的其他狀態數（PQP：審核中／退件；ITP：已提交，文案維持「含附帶意見」）、查看詳情按鈕。比例改用純色比例條（無 Low/Medium/High 色帶，避免暗示未經確認的品質分級）。成功零筆時顯示「尚無資料」而非 0%。`ITPGaugeChart.tsx`／`PQPGaugeChart.tsx`／`ITPStatsCard.tsx`／`PQPStatsCard.tsx` 保留在檔案樹中但不再被引用（未刪除）。既有核准範圍、分母、篩選規則皆未變動。BACKLOG #37 的載入中／失敗／零筆／舊資料狀態已整合進新卡片內部，同一套隔離驗證腳本重跑零迴歸。

**驗證**：`tsc`／97 項前端單元測試／build 通過；隔離環境涵蓋 NCR/OBS 五種狀態、PQP/ITP 各自狀態組合、承包商篩選至零筆（新增一個無關聯資料的承包商實測「尚無資料」畫面）、載入失敗與重試恢復；中英文於 1440/1280/820/390px 截圖確認排版正常，過程中發現 App Shell 頁首在英文 390px 下有既有溢出（Dashboard 內容本身沒有，`/pqp` 頁面同樣發生，確認非本批造成），獨立記錄為 BACKLOG #38，未修改。#28 收尾的 22 個 `_http.py` 測試因環境未裝 `httpx`、且此環境安裝時遇到沙盒 SSL 憑證限制而無法安裝，如實記錄為未完成，改以隔離環境真實 HTTP／瀏覽器驗證彌補。詳見 [Claude 交接紀錄](docs/workflow/dashboard-stats-consistency-2026-09-29-handoff.md)。

### 2026-09-29：BACKLOG #28 HTTP 測試收尾＋#38 手機英文頁首溢出修正（已修，已於 2026-10-05 部署）

**一、#28 收尾（HTTP 測試環境缺口解除）**：先讀前一輪交接紀錄，確認 22 個 `_http.py` 測試檔（另加 `test_itr_revoke_approval_acceptance.py` 共 23 個）因環境缺 `httpx` 而從未真正執行、僅以瀏覽器驗證彌補。診斷 `pip` 本身的 HTTPS 驗證在本沙盒環境下會失敗（`curl`／Python `urllib.request` 對同一主機皆驗證成功，問題僅限 `pip` 自身網路堆疊，非憑證或代理設定問題），改用 `urllib.request`（完整 TLS 驗證、全程未關閉 SSL 驗證）下載 `httpx`/`httpcore`/`sniffio` 對應 wheel 檔，再以 `pip install --no-index --find-links` 離線安裝，成功補齊環境缺口（不是繞過驗證，是繞開 `pip` 自身故障的網路層）。以 `DATABASE_URL="sqlite:///:memory:"` 實際執行全部 23 個檔案：**584 passed, 0 failed**，先前遺留的「僅瀏覽器驗證彌補」缺口正式解除。另確認 `statusBuckets.ts` 先前只有 `isClosedStatus`/`isVoidStatus` 的間接覆蓋，`isOutstandingStatus` 五種真實狀態、Void 排除語意、Pareto 累積比例分母皆無直接測試——新增 `tests-unit/statusBuckets.test.ts` 8 項（不重複既有覆蓋），並將 `NCRParetoChart.tsx`／`OBSParetoChart.tsx` 原本重複內嵌、未被測試涵蓋的累積比例計算抽成共用 `buildParetoCumulative`（純函式，行為與抽出前完全一致），使其可被直接測試。

**二、#38 修正（手機英文頁首溢出）**：於隔離環境 375/390px 英文分別在 `/dashboard` 與 `/pqp`（不相關頁面）重現，確認兩頁皆溢出、中文皆不溢出，定位為共用 `AppLayout.module.css` 的 `.topBar`（麵包屑＋使用者名稱＋專案選擇器＋登出，單行 `justify-content: space-between` 不換行）在英文標籤（"Welcome / Dashboard"、全名、"All Projects"、"Logout"）較寬時超出手機寬度，中文剛好塞得下。既有 900px 斷點的側欄已正確全寬堆疊，並非肇因。修正：新增 `@media (max-width: 640px)` 讓 `.topBar` 改為可換行（`flex-wrap: wrap`），麵包屑與操作列各自占滿一行寬度後自然換行——所有控制項維持原尺寸可點擊，未用 `overflow:hidden` 隱藏、未縮成純圖示、未移除任何項目。範圍限定於此一 CSS 檔；未改 Dashboard 圖表或版面（依指示保留）。

**三、額外發現，未修（記錄供後續排入）**：`/pqp` 頁面於 390px 仍有約 42px 殘餘水平溢出，經 DOM 檢查為一個 8 欄資料表（`#/Reference no./Status/Contractor/Subject/Version/Updated Date/Operations`，`scrollWidth` 1139px），中英文皆發生（語言無關），與 #38 的頁首問題是各自獨立的兩個問題；#38 範圍明確限定共用 App Shell 頁首，此表格溢出不在本批處理範圍內。

**驗證**：`tsc`／105 項前端單元測試（97 舊＋8 新 `statusBuckets` 測試，0 失敗）／`vite build` 皆通過；後端隔離環境 `DATABASE_URL="sqlite:///:memory:"` 執行 23 個 `_http.py`／HTTP 相關測試檔，584 passed, 0 failed；#38 修正後於隔離環境中英文、375/390px（手機）、820px（平板）、1440px（桌面）截圖確認頁首不再溢出，且專案選擇器、使用者名稱、登出按鈕、導覽項目在窄畫面下皆可正常互動點擊（Playwright 實際點擊驗證，非僅視覺截圖）。未觸碰開發資料庫、未 commit／push／部署，隔離環境驗證完畢後已 teardown。詳見 [Claude 交接紀錄](docs/workflow/http-tests-and-mobile-header-2026-09-29-handoff.md)。

### 2026-09-29：PQP 手機資料表水平溢出修正（已修，已於 2026-10-05 部署）

延續上一批記錄的發現：`/pqp` 頁面於手機寬度（375/390px）仍有約 42–57px 的整頁水平溢出，隔離環境重現後定位真正根因——**不是**共用 `DataTable` 元件缺少橫向捲動容器（`ModuleShell.module.css` 的 `.content` 早就有 `overflow-x: auto`，`components/ui/table.tsx` 的 `Table` 也自帶 `overflow-auto` 包裝，兩層都運作正常，表格本身在窄畫面下一直都能正確在自己的容器內橫向捲動）。真正根因是共用 `DataTablePagination.tsx` 分頁列的 4 個導覽按鈕（第一頁／上一頁／下一頁／最後一頁）內含 Tailwind `sr-only`（螢幕閱讀器專用、`position: absolute`）文字，但按鈕本身（`<Button>`）沒有 `position: relative`——在沒有任何定位祖先的情況下，這個絕對定位的 span 的「containing block」會一路往上跳到整個頁面的初始容器（等同 `<html>`），導致它依照分頁列「未裁切前的完整寬度」計算出的位置（而非表格自己捲動容器裁切後的可見位置），直接污染 `document.documentElement` 自己的可捲動範圍——即使 `<body>`、`.shell`、`.content` 等所有看得到的容器都精確裁切在 390px 內（逐層量測 `scrollWidth`/`clientWidth` 全部相符），`document.documentElement.scrollWidth` 仍然固定回報多出約 42px（且這個數字與語言、視窗寬度 375/390 皆無關，改變任何一項都不影響，直到視窗寬度本身超過該固定值後才消失——這個「常數」現象正是判斷是絕對定位脫離正常文件流、而非表格內容本身撐寬的關鍵線索）。修正：只在這 4 個按鈕加上 `relative`（一個檔案、4 個 className），讓 `sr-only` span 的定位基準回到按鈕自身，不再外洩到頁面根層級。修正前後以 JS monkey-patch 直接驗證因果關係（先只加 `position:relative` 而不改原始碼確認 `htmlScrollW` 從 432 降回 390），確認後才落地成正式修正；另外用「暫時還原＋重新套用」的方式（皆透過 Edit 工具而非 git，全程未使用 stash/checkout）分別截圖了修正前後的頁面層級水平捲動行為，直接可見修正前整頁（含頁首、麵包屑）會被拖著一起橫移，修正後嘗試橫向捲動頁面本身則完全不動作。根因限定在 `DataTablePagination.tsx` 這一個共用檔案，`DataTableViewOptions.tsx`／`DataTableColumnHeader.tsx`／`DataTable.tsx` 皆無同樣的 `sr-only` 模式，未變動；未修改 `components/ui/button.tsx`（共用 Button 元件本身未動，範圍只限這 4 顆分頁按鈕，避免影響全站其他上百處使用 Button 的地方）。

**驗證**：隔離環境（`pmt_full` 帳號＋6 筆長標題 PQP 種子資料，8 欄資料表確保任何寬度下都會超寬）中英文 × 375/390/820/1440px 共 8 種組合，修正後整頁水平溢出全部為 0px（修正前 42–57px）；同一份隔離環境另外跑 NCR 模組（`sc_full` 帳號既有種子資料，同樣共用 `DataTable`，7 欄更寬的表格 2201–2449px）做回歸，同樣 8 種組合整頁溢出全部為 0px，確認修正在另一個共用同元件的模組上同樣有效、無副作用。互動驗證：搜尋欄可正常篩選與清空還原、表格自身容器可橫向捲動至最後一欄（Operations／刪除圖示）、分頁按鈕捲動進可視範圍後仍是原尺寸 32×32px 可點擊、列操作（View）仍可正常開啟詳情視窗——專案選擇／使用者資訊／登出／導覽功能本批完全未觸碰，不受影響。`tsc`／105 項前端單元測試／`vite build` 皆通過。過程中發現 PQP 狀態「Not Submit」在列表頁顯示未翻譯的原始 key `pqp.status.notSubmitted`（而非「尚未送審」／"Not Submit"，其餘 4 種狀態翻譯皆正常），是與本次修正無關的既有 i18n 缺口，已獨立記錄、本批未修。隔離堆疊驗證完畢後已 `isolated_stack.py down` 拆除，8198／3198 埠已確認釋放。詳見 [Claude 交接紀錄](docs/workflow/pqp-mobile-table-overflow-2026-09-29-handoff.md)。

### 2026-09-29：ITP→Checklist→ITR 業務鏈操作清單編寫＋真實隔離環境驗證（清單交付，無程式修改）

依使用者要求編寫一份可直接照做的業務試用操作清單（ITP 編寫檢驗計畫→產生 Checklist 範本→建立 NOI→建立 ITR 並連結 Checklist、填寫結果→核准；另列不合格時開立 NCR／複驗分支）。第一版交付後使用者核對出 5 類問題並要求修正：(1) 逐步權限描述過於寬鬆（漏列跨模組選單所需的 `*:view:all`、把 ITP Publish 誤寫成只需 create、Checklist 產生後的編輯誤寫成只需 create）；(2) NCR／複驗關係誤判為互斥（讀碼證實兩者互不觸發但不互斥，可在同一筆來源 ITR 上先後都執行，且都沒有防重複觸發機制）；(3) Raise NCR 條件遺漏 Approved/Void 保護與資料範圍檢查，且複驗條件需獨立核對（讀碼證實複驗**沒有**同樣的 Approved/Void 保護，這是讀碼推論、標記為待確認邊界情境）；(4) Checklist 保存/判定規則敘述自相矛盾（更正為「未填完可保存，只有 N/A 缺理由才擋」，N/A 不算 Pass 這條規則僅有程式證據、標示為目前行為而非已確認政策）；(5) Project 前置條件誤判（更正：零 UserProject 關聯是 unscoped 看得到全部，不是空白）。修正後在隔離環境用 Playwright 真實瀏覽器完整跑通合格主流程（ITP→Checklist→NOI→ITR→連結填 Pass→Publish→Approved 鎖定）與不合格分支（Fail→Raise NCR 確認來源回填 ITR no.→回到同一筆 Fail ITR 再 Re-inspect→確認複驗 Checklist 重置為 Not filled、原始 ITR 完全未變動），逐步記錄實際使用的權限與畫面操作，全程截圖存證。

**專項調查（同日第二輪）**：驗證過程中觀察到 Checklist 範本按 Save Template 似乎「version 遞增且另增一筆獨立紀錄」，第一版交接紀錄記為待使用者裁示的業務語意問題。使用者要求專門調查後，**證實為誤判、撤回**：新增專用調查腳本，在全新乾淨隔離環境逐次點擊並直接查資料庫（`GET /checklist/?include_instances=true`，繞過前端快取）＋攔截每個 HTTP 請求，確認「Save Template」單次點擊只送出一個 PUT、目標永遠是同一個 id，`version` 只在內容真的改變時原地遞增（3 次連續保存驗證：id 全程不變，version 1→2→3→4，無新紀錄）；範本連結進 ITR 時產生的新紀錄（`template_id`/`itrId` 指回來源）是 `link_checklist` 刻意建立的「實例」，設計如此非缺陷，且事後再編輯範本本身（version 再遞增到 4）不會影響已建立的實例（逐位元組比對前後完全相同）。確切原因：前一輪調查反覆在同一個持續累積的隔離環境上重跑開發中的整條鏈腳本，每次重跑的「Generate Checklist」步驟各自產生一筆全新獨立範本，誤把「不同次執行各自產生的多筆範本」看成「同一次 Save 產生兩筆紀錄」——是調查方法本身的假象，不是產品缺陷，未做任何程式修正。

**驗證範圍**：兩輪皆只新增驗證用檔案（`backend/scripts/verification/seed_itp_checklist_itr_chain_walkthrough.py`、`react-app/tests-browser/itp-checklist-itr-chain-walkthrough.mjs`、`react-app/tests-browser/checklist-save-template-investigation.mjs`），未修改任何產品程式碼，未重跑既有測試套件。複驗（Re-inspect）的 Approved/Void 邊界情境依使用者指示保留、未併入本批。未建立正式資料、未 commit／push／部署、未使用 stash/reset/checkout。詳見 [Claude 交接紀錄](docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md)。

### 2026-09-29：ITR「未先 Save 直接 Publish」漏存 Inspection Result（已修，已於 2026-10-05 部署）

使用者在手動隔離試用環境真實操作時發現：`QTS-CWC-ITR-000001` 選好 Inspection Result=Pass 後沒有先按 Save，直接按 Publish 並確認，核准成功，但重開後 Inspection Result 顯示「Not yet assessed」（Checklist 本身仍正確為 Pass）；對照選 Fail 後有先按 Save 的 `QTS-CWC-ITR-000002`，重開正確顯示 Fail。依指示保留使用者現場（未撤回核准、未改寫資料），另在獨立埠號（8200/3200）的隔離環境重現，攔截實際 HTTP 請求後確認：`ITR.tsx::handleSaveITRDetails` 的 `publishOnly` 分支**不論 ITR 目前是否已經 Approved**，一律只送出 `{type, status}` 兩個欄位，其餘表單內容（含 `inspectionResult`）一律捨棄。這段限制的原始註解假設「後端會拒絕已核准記錄的其他欄位」——查證後這個限制**只在 ITR 目前狀態已經是 Approved 時才成立**（`itr_service.py::update_itr` 的鎖定檢查），但使用者回報的情境是**第一次核准**（In Progress → Approved），後端在這個情境下根本不會拒絕額外欄位，是前端把「第一次核准」與「對已核准記錄再次 Publish 建版本」兩種不同情境混用同一段過度限制的邏輯，導致剛選好但沒按過一般 Save 的欄位被整個丟棄。修正：只在目前持久化狀態確實已經是 `Approved` 時才維持原本「只送 type/status」的限制路徑；否則（第一次核准）改為沿用一般 Save 本來就會走的完整表單邏輯，只是多帶 `status: 'Approved'`。一個檔案、一段條件判斷，未新增欄位、未改後端驗證邏輯、未改已核准記錄的鎖定規則。

**驗證**：`tsc`／105 項前端單元測試通過；獨立隔離環境（8200/3200，驗證後已拆除，未動使用者現場）三案例對照：Case A（重現回報情境，修正前 PUT body 僅 `{type,status}` 無 inspectionResult，修正後變成完整表單含 `inspectionResult:"Pass"`，重開正確顯示）、Case B（先 Save 再 Publish 的對照組，修正前後行為不變）、Case C（已核准記錄再次 Publish 建版本，修正後 PUT body 仍精確是 `{type,status}` 未變，未被後端鎖定規則拒絕，既有 inspectionResult 正確保留、type 正確進版，確認鎖定規則未受影響）；另完整重跑一次合格＋不合格兩條鏈確認零迴歸。使用者手動試用環境（8198/3198）全程未被觸碰，其中 `QTS-CWC-ITR-000001` 記錄本身仍是修正前產生的錯誤狀態（不會被自動回填，需使用者自己重新操作一次）。詳見 [Claude 交接紀錄](docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md) 第七節。

### 2026-09-29：確認修正時誤寫入使用者現場既有複驗實例（事故紀錄，未修改程式）

上一批 ITR Publish 修正在使用者手動試用環境（8198/3198）跑確認流程時，Playwright 腳本用「表格最後一列」定位剛建立的新紀錄，實際排序把既有的 `QTS-CWC-ITR-000003`（一筆複驗案例）排在最後，腳本因此誤操作到這筆既有紀錄：對它多連結一份新 Checklist 範本（之後成功刪除復原）、並把它原本 `Not filled` 的既有複驗實例 `QTS-CWC-CHECKLIST-000004` 誤寫入 `Pass`（系統的證據保存規則使這個寫入無法撤銷復原）。用隔離環境自身 SQLite 的 `audit_logs` 表唯讀查詢逐筆核對（不做任何寫入）確認：只有一筆是真正誤新增（已刪除復原），`-000004` 是既有紀錄被誤寫入而非新增，上一輪回報「完全復原」「原有紀錄完全未受影響」的說法有誤，已撤回更正。`QTS-CWC-ITR-000003` 標記為受此事故影響、不再作為乾淨複驗案例（僅交接文件標註，未寫回產品資料）。已訂下後續操作規則：寫入前先核對開啟畫面的完整單號與目標一致（用 `?openId=<id>` 深連結而非表格位置定位），單號不符立即停止不補救，新測試一律用獨立資料不借用既有試用案例。詳見 [Claude 交接紀錄](docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md) 第八節。

### 2026-09-29：ITR 複驗（Re-inspect）Approved／Void 邊界補查（讀碼推論轉隔離驗證，未修改程式）

延續先前多輪保留的待辦：複驗沒有 Approved/Void 保護一事，先前只有讀碼推論。本輪在獨立隔離環境（8200/3200，未用使用者現場、未沿用受事故影響的 ITR-000003）建立 6 組獨立新資料（狀態 In Progress／Approved／Void × Inspection Result Fail／Pass），逐一核對按鈕顯示、直接呼叫 API（繞過按鈕）、實際建立結果、來源紀錄是否被動到。確認：前後端行為完全一致（不是前後端不一致的錯誤）——按鈕顯示條件與後端 `create_reinspection` 的檢查條件在全部 6 種組合下給出相同結果；**Approved+Fail 與 Void+Fail 兩種組合皆可成功建立複驗 ITR**（因為核准流程只檢查 Checklist 是否 Pass，不檢查/不清空 `inspectionResult`，兩欄位彼此獨立，Approved 狀態下 inspectionResult 停留 Fail 是正常可達的狀態）；新建立的複驗 ITR 內容正確（狀態 In Progress、Checklist 重置 Ongoing）；來源紀錄在全部 6 案例事後查詢皆與呼叫前完全一致，未受複驗動作影響。**前後端行為一致，不代表這個行為已經過業務確認**——目前流程能產生 Approved+Fail 這個組合，不代表業務上已認可這個組合可以再拿去複驗；是否符合業務要求尚待決策，未自行修改程式或新增限制。待決策建議：`Void` 狀態禁止複驗（比照 Raise NCR 現行對 Void 的限制）；`Approved` 狀態須先走既有撤回核准（Revoke Approval）流程回到 In Progress，再依既有複驗條件判斷，不新增「Approved 直接複驗」的旁路；確認前維持現況不動。「核准時是否應一併檢查 Inspection Result」列為獨立政策問題，不與複驗限制一起修改。詳見 [Claude 交接紀錄](docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md) 第九節。


### 2026-09-29：ITR 複驗 Approved／Void 限制（Claude 實作、Codex 接續，自動化通過，已於 2026-10-05 部署）

延續前述邊界調查，後端已拒絕 Void／Approved 直接複驗；Approved 必須先走既有撤回核准再依原条件判斷。前端依已保存狀態停用入口並顯示原因。Codex 接手後补齊兩個缺少的提示語系 key、事件處理防呆，將直接改狀態的撤回測試改為真正撤回 API，另增四種鎖定狀態／結果組合與真正核准→撤回→複驗案例。相關 HTTP 58＋新增5項通過，前端105項及型別／建置通過；未重跑全套件或真實瀏覽器，UI 呈現尚待隔離畫面補驗。未改核准對 Inspection Result 的規則，未動使用者8198/3198環境。詳見 [交接第十節](docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md)。前述調查的允許行為為修正前歷史，不代表目前仍允許。


### 2026-09-29：ITR 複驗限制真實畫面補驗完成（已於 2026-10-05 部署）

承接上一段自動化驗證，獨立8202/3202環境實測中英文 Approved／Void + Fail 的複驗按鈕均停用，新增提示正確；由畫面合法撤回核准後，重新檢驗成功，新Checklist顯示尚未填寫，唯讀DB確認結果清空且來源ITR／原Checklist全欄不變（比較基準在撤回後、複驗前）。沒有新增產品修正，已完成本批尚缺的畫面驗收。僅新增隔離測資腳本，未重跑先前自動化或全業務鏈；詳見交接文件第十一節。使用者8198/3198未動。

### 2026-09-29：ITR 複驗限制獨立補充驗證——真實 Publish 核准→撤回→複驗完整循環（Claude）

接手時發現 Codex 已完成複驗限制的實作、63 項後端＋108 項前端自動化，以及一次真實畫面驗收（種入既有 Approved/Void 歷史狀態逐一核對）。本輪在另一組獨立隔離環境（8200/3200，事後已拆除，未用使用者現場）補做互補驗證：全程真實畫面操作，從 In Progress 開始，按 Publish **真正核准**（非直接寫入資料庫）成 Approved，核對複驗按鈕正確停用、提示文字與已定義的 i18n 譯文逐字相符，直接呼叫 API 確認後端拒絕（400，訊息一致），確認拒絕時未新增任何 ITR／Checklist、來源紀錄完全不變；接著按 **Revoke Approval 真正撤回**（畫面填理由），核對按鈕恢復可用，點擊 Re-inspect 真正成功建立新紀錄。Void+Fail 同樣核對停用、提示、API 拒絕、來源不變。與 Codex 的驗收互補：對方驗證的是「已經是既有狀態」的靜態呈現，本輪額外驗證「真實走一次核准/撤回轉換過程」那個當下的畫面反應也正確。重新確認 `tsc`／108 項前端單元測試／後端三個相關 HTTP 測試檔 63 passed，與 Codex 回報數字一致，確認雙方修改相容無衝突。只新增一個驗證腳本，未再修改任何產品程式碼。詳見 [交接文件第十二節](docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md)。使用者 8198/3198 全程未被觸碰。

### #44 追加（2026-09-30）：KM 無 view 入口與原始錯誤提示 — FIXED
使用者 Chain Full 無 KM view 仍能點側欄且看到權限碼；已補側欄隱藏、直接網址友善拒絕及清單 403 清除舊內容。未擴權。114 項前端測試及建置通過，3198 現有頁面唯讀確認生效。詳見 `docs/workflow/km-permission-ui-2026-09-30-handoff.md` 追加段落。

## 45. 空清單分頁顯示 Page 1 of 0 · FIXED，已於 2026-10-05 部署
2026-09-30：KM 空清單真實畫面確認矛盾頁碼。共用 DataTablePagination 改成零筆顯示0/0、四個換頁按鈕停用；非空頁碼不變。117項前端測試通過，詳見 `docs/workflow/empty-table-pagination-2026-09-30-handoff.md`。

## 46. KM 主文章成功後章節失敗，重試未沿用主文章 id／版本 · FIXED，已於 2026-10-05 部署
2026-09-30：保存主文章確認回傳的id及version_no，後續章節失敗重試使用同一文章與最新版本，新增部分完成友善提示。正式helper單元測試＋獨立環境既有文章真實403章節拒絕/重試/恢復保存驗證；新建重試畫面與提交後回應遺失未驗證。詳見 `docs/workflow/km-main-write-retry-2026-09-30-handoff.md`。

## 47. KM 刪除失敗沒有使用者提示 · FIXED，已於 2026-10-05 部署
2026-09-30：加入catch友善提示、finally恢復與處理中防重複送出；ConfirmModal選用pending預設維持其他呼叫端行為。獨立環境真實DELETE403確認視窗保留、提示出現、文章未刪。詳見 `docs/workflow/km-main-write-retry-2026-09-30-handoff.md` 同輪段落。

## 48. KM 編輯尚未載入即可操作、失敗誤當零章節 · FIXED，已於 2026-10-05 部署
2026-09-30：改用独立編輯快照，載入完成才可編輯/保存，失敗可重試，不因共用store刷新覆蓋編輯。121項前端測試與建置通過，獨立環境真實403與恢复重試驗證；慢回應競態本輪未另作瀏覽器注入。詳見 `docs/workflow/km-editor-loading-2026-09-30-handoff.md`。

## 49. KM 保存期間仍可改內容或關閉視窗 · FIXED，已於 2026-10-05 部署
2026-09-30：分離匯入/保存狀態、保存期間表單inert、關閉停用、同步防重複送出。121項前端測試與建置通過，獨立慢回應畫面驗證。詳見 `docs/workflow/km-saving-guard-2026-09-30-handoff.md`。

## 50. 未保存離開保護與操作鏈引導 · PARTIAL，已於 2026-10-05 部署
2026-09-30：KM取消/關閉確認與beforeunload已補；新建空白不誤報、有修改留下/離開已隔離實測。Checklist範本與ITR連結處補下一步/獨立實例說明。同日追加：共用站內導航與主要編輯表單離開保護已接入，實測情境及尚未逐一驗收的表單詳見 `docs/workflow/form-leave-guards-2026-09-30-handoff.md`；原生離開提醒及全部表單完整矩陣仍未全面複驗，不宣稱全站驗收完成。詳見 `docs/workflow/km-leave-and-chain-guidance-2026-09-30-handoff.md`。
2026-09-30（FORMS-2026-001）：補驗前一輪未逐一驗收的 OSD／Contractor／Project／Role／DocumentNamingRules 五種表單（隔離環境 Playwright 實測，非僅讀碼），並發現＋修正 3 個可重現缺陷：(1) OSD 保存失敗時被父層 `OSD.tsx` 吞掉例外，導致誤判成功並關閉視窗、丟棄未保存輸入；(2) Audit 自訂查檢項目、(3) Meeting Minutes 與會者/討論項/行動項目，四類子草稿只要輸入未按對應「新增」就直接保存主表單，皆會被靜默丟棄，現已改為擋下保存並提示使用者先新增或清空。Contractor/Project/Role/DocumentNamingRules 四表單實測後未發現缺陷，未修改程式。SecuritySettings 不在本批範圍，仍待下一批驗收。詳見 `docs/workflow/FORMS-2026-001-handoff.md`。
2026-09-30（獨立審查 REVISE）：上述 FORMS-2026-001 的 STATUS DONE 經獨立審查判定不成立，完整審查與
REQUIRED_FIXES R1–R5 封存於 `docs/workflow/FORMS-2026-001-archive.md`；主要缺口為 Meeting Minutes 子草稿
判斷漏掉非主要欄位、OSD 新建部分成功後重試會重複建立、測試證據不夠嚴謹（缺少 response/真實持久化比對、
錯誤計數用 >=1 代替精確值）、種子與腳本寫死測試密碼、STATUS 對測試規模的敘述不精確。
2026-09-30（FORMS-2026-002，R1–R5 修正）：R1 修正 Meeting Minutes 四類子草稿改為逐一比對全部欄位（不只
主要欄位），已用「只填非主要欄位」的真實案例重現並驗證擋下。R2 修正 OSD 新建部分成功後的重試重複建立
問題，改用專案既有共用保存工具 `utils/saveFlow.ts`（`runSaveFlow`，NCR/OBS/NOI 已在用），實測確認新建
POST 恰好一次、重試零筆額外 POST、資料庫確認全程只有一筆記錄。過程中的真實持久化比對意外發現並修正一個
獨立缺陷：Audit「Save Draft」在同一精靈視窗內每次都會重新建立記錄（因為 Save Draft 刻意不觸發父層狀態
同步），現已在 AuditWizard.tsx 內部追蹤自己剛建立的 id，修正後第二次保存正確改用 PUT。R3 補齊 response
status/body、真實 GET 持久化、精確錯誤計數、真實站內導頁、OSD/DocumentNamingRules 唯讀情境、Audit 既有
項目行內編輯未確認的保護（同一段子草稿保護邏輯延伸涵蓋）；並釐清 OSD Save 按鈕 disabled 狀態爭議的真正
原因是前一輪測試腳本的方法論瑕疵（locator 於文字變成「Saving...」時失去匹配，搭配吞掉逾時錯誤的
`.catch(() => false)`），非程式缺陷。R4 移除所有硬編碼測試密碼，改用必要環境變數，並加入隔離目標防誤用
檢查。R5 更正先前「111 項斷言」等不精確敘述。Contractor/Project/Role 本輪未重新加強驗證（無程式碼變更，
沿用前輪結果）；討論主題/子項目兩類子草稿的專項重現、提交後回應遺失、原生離開提醒仍未驗證，列為限制。
詳見 `docs/workflow/FORMS-2026-002-handoff.md`。
2026-10-03（獨立審查 REVISE，第二輪）：上述 FORMS-2026-002 經獨立審查再次判定 REVISE（R1–R6），
主要缺口為證據精確度不足，非產品修正本身有誤（既有修正保留未動）。完整審查封存於
`docs/workflow/FORMS-2026-002-archive.md`。
2026-10-03（FORMS-2026-003，R1–R6 補正）：R1 補齊 Meeting Minutes 討論主題、討論子項目
（owner/status-only）兩類先前只讀碼未實測的子草稿案例，四類子草稿皆已有「非主要欄位單獨觸發阻擋」
的實機證據（23/23）。R2 補齊 OSD 附件：成功類別的 response/重讀、重試只送失敗類別（精確計數非
`.includes()` 存在性判斷）、重試前改欄位仍存到同一 id、刪除一成功一 404（404 不視為成功），全部
重現並通過（44/44）。R3 發現並記錄 OSD 編輯器是滿版 modal、側欄在編輯中物理上無法點擊，與
LeaveGuard 無關（正常 modal UX，非缺陷）；改在 DocumentNamingRules（整頁編輯器）完整驗證「保存
請求仍 pending 時點擊側欄導頁 → 阻擋 → 保存完成後自動恢復導頁」的完整鏈路（28/28）；Contractor/
Project 補齊 response/body 精確核對與 toast 精確計數/文字（40/40）；讀碼確認 Contractor/Project
完全沒有唯讀模式程式碼路徑，並附上具體檔案行號證據。R4 新增共用隔離防誤用模組，核對
`isolated_stack.py` 自己在磁碟上的 marker/state 檔案與行程存活狀態，不再只信任呼叫者傳入的 JSON
字串；附 9 項負向測試自我證明（含 1 項正控制組）。R5 更正紀錄準確性，OSD 的 `page.goBack()` 調查
明確標示為「未下結論」而非確認的發現。npm test 123 passed、npm run build 成功，皆為本輪重新執行。
詳見 `docs/workflow/FORMS-2026-003-handoff.md`。
2026-10-03（獨立審查 REVISE，第三輪）：上述 FORMS-2026-003 經獨立審查再次判定 REVISE（R1–R6），
主要缺口仍是證據精確度與完成宣稱不符：MM 的「新建 actionItemsDraft」案例其實走的是既有記錄的
addActionItemNow 路徑，未真正覆蓋未保存會議先 Add 行動項目再主保存；OSD 的 404 刪除案例只驗證了
失敗後檔案仍存在，沒有在同一視窗解除攔截重試；OSD/Contractor/Project/NamingRules/Role 的錯誤文字
斷言仍是「非空即可」或 `includes(模擬文字)` 弱斷言，非精確核對實際文案；隔離防誤用的正控制只填
測試自身 pid、沒有 DB、沒有真正監聽，未能證明 guard 真的核對目標一致性；188 項數字混用瀏覽器實機
斷言與本地 guard 自測，未分開計數。完整審查封存於 `docs/workflow/FORMS-2026-003-archive.md`。
2026-10-03（FORMS-2026-004，R1–R6 補正）：R1 新增真正「新建會議」流程下 Add Topic/Add Sub-item/
Add 行動項目草稿、再主 Save 的案例，核對主 POST 與 `/followup/bulk/` 兩個請求各自的 response
status/body，並以 raw GET 重讀確認兩者皆真正持久化；另補既有記錄上 Add Topic 後 PUT 保存的對應
案例（44/44）。R2 在 OSD 刪除一成功一 404 後，於同一視窗解除攔截並重試，精確斷言只重送先前失敗的
id、已成功的 id 不重送，重讀確認檔案真的消失（50/50，含既有場景）。R3 逐一讀碼 OSD/Contractor/
Project/Role/DocumentNamingRules 各自的錯誤處理程式碼，把 toast/inline 錯誤文字斷言換成逐字核對
實際訊息字串（OSD 的 saveFlow.server 行、Contractor/Project 的 common.saveFailed、Role 的
getErrorMessage 5xx 行、NamingRules 的 `命名規則儲存失敗：` 前綴），不再接受「非空即可」；Role
補成功 response status/body 與 raw GET 重讀（27/27）；NamingRules/Contractor/Project 各自重新
執行通過（30/30、40/40）。R4 將 NamingRules 保存中導頁案例的終點斷言改為精確核對抵達
`/dashboard`（而非「只要不是原頁面」），並把 pending 提示的 locator 改為錨定在 ConfirmModal 自己
的「Unsaved Changes」標題元素，不再可能誤配表單自身的 Saving 按鈕。R5 為隔離防誤用模組新增 DB
檔案存在性＋路徑一致性、以及行程是否真的監聽目標埠（`lsof`）兩項核對，並在種子腳本
`seed_forms_leave_guard_review.py` 自身加入 `guard_if_required()` 防呼叫方繞過的二次防護；負向
測試新增 DB 缺失、DB 路徑在 root 外、pid 存活但與埠無關、埠被無關 pid 佔用四類情境（13/13，含既有
案例）。R6 本檔與 handoff 文件精確區分本輪新增/修改/沿用前輪，瀏覽器實機斷言（213 項：MM44+OSD50
+NamingRules30+Contractor/Project40+Role27+Audit22）與本地 guard 自測（13 項）分開列示，不再合併
成單一總數。npm test 123 passed、npm run build 成功，皆為本輪重新執行。詳見
`docs/workflow/FORMS-2026-004-handoff.md`。
2026-10-03（獨立審查 REVISE，第四輪）：上述 FORMS-2026-004 經獨立審查再次判定 REVISE（R1–R3），
明確表示 R2–R5 已接受不再重開，剩餘缺口僅：MM 清空草稿案例只驗證了請求次數、沒有 response/重讀/
反向證明放棄文字未落地；六支場景腳本的截圖輸出目錄仍共用 FORMS-2026-003 當時的暫存路徑，
FORMS-2026-004 執行產生的截圖從未另外保存進 repo；文件描述種子防護用錯函式名稱
（`guard_if_required()` 而非實際呼叫的 `enforce_from_environment()`），且把「NamingRules 顯示
後端 detail」這個既有程式行為誤稱為「刻意的例外」。完整審查封存於
`docs/workflow/FORMS-2026-004-archive.md`。
2026-10-03（FORMS-2026-005，R1–R3 收尾）：R1 重寫 MM scenario 4（明確清空草稿＋同時修改標題，
再 Save），核對該次 response status/body、raw GET 同 id 重讀、以及放棄的草稿文字不出現在
response/記錄/FollowUp 清單任何一處（51/51 通過）。R2 以檔名比對腳本原始碼＋修改時間窗兩項客觀
依據，從共用的暫存輸出目錄分流出 48 個可確認屬於 FORMS-2026-004 的截圖保存進新建的
`docs/workflow/FORMS-2026-004-evidence/` 並附索引，另 3 個無法確認來源的舊檔案如實標註未複製、
不冒充；六支場景腳本的 `OUT` 常數改為可用環境變數覆寫、預設本輪專屬目錄，之後每輪不再預設共用
同一路徑。R3 以附加說明（不刪除原文）校正 FORMS-2026-004-handoff.md 的兩處用語：種子防護的實際
呼叫函式、以及撤回 NamingRules detail 顯示是「刻意的例外」這個無政策依據的說法。本輪刻意只做
這三項收尾，R2–R5 未重開，未重跑整套 213 項瀏覽器驗證；本輪未修改任何產品程式碼，依規則略過
npm test/build 重跑。詳見 `docs/workflow/FORMS-2026-005-handoff.md`。
2026-10-03（獨立審查 PASS，結案）：FORMS-2026-005 經獨立審查判定 **PASS**，表單保護補正系列
（FORMS-2026-001 至 005）結案，不再開新一輪。審查明確區分兩類驗證：執行者（Claude）回報的
51 項瀏覽器實機斷言（MM scenario 4 重寫，本輪自建隔離環境中實跑），與審查者本次自行執行的
腳本／證據核對（004-evidence 48 張 PNG 逐檔 SHA-256 核對與來源暫存檔一致、005-evidence 1 張
PNG 與索引、六支腳本 `node --check`、004 handoff 的兩處用語更正是否落實）——審查者本次**未**
重跑瀏覽器，不將腳本審查冒稱實機複驗。PASS 不代表可自動部署，也不代表所有模組均經完整驗證；
歷次 REVISE（FORMS-2026-001/002/003/004 的 REQUIRED_FIXES）與原始證據全數保留未改寫，OSD 的
`page.goBack()`、提交後回應遺失、原生跨瀏覽器 `beforeunload` 提醒三項既有限制維持未驗證狀態，
留待後續需求另行交辦。完整審查見 `REVIEW.md`（TASK_ID: FORMS-2026-005）。

## 51. ITR 核准遭拒後，表單誤判已核准、無法改回合法狀態 · FIXED，已於 2026-10-05 部署

2026-10-03（TASK_ID: ITR-STATUS-2026-001）：Q-Workflow→NOI→ITR 業務操作審閱時發現：未連結
Checklist 的 In Progress ITR，畫面選 Approved 保存被後端拒絕（`Cannot approve ITR without any
linked checklists`）後，後端確認仍是 In Progress，但表單接下來拒絕把 Status 改回 In Progress，
跳出「已核准的 ITR 無法直接改回進行中，須先由具核准權限者撤回核准」——兩個方向都走不通，唯一
脫身方法是放棄整筆編輯重開。

根因：`ITRModals.tsx` 的 `handleFieldChange` 用畫面上尚未保存的 `formData.status` 當作狀態轉換
檢查的「目前狀態」，而不是同檔案裡 `isLocked` 已經在用、也特別寫過原因的已保存狀態
`existingItem?.status`——`utils/statusValidation.ts` 原本的註解甚至明寫認為這條「Approved→其他」
擋線在正常表單下「不可能被觸發」，因為假設畫面選了 Approved 一定代表已存檔成功，這次操作證明
這個假設不成立。新建模式（`existingItem` 不存在）也會被同一個問題影響——新建時選 Approved
再改回，一樣會被誤判。

修正：`handleFieldChange` 改用 `persistedStatus`（即 `existingItem?.status`）作為轉換檢查基準，
不存在時（新建模式）直接略過轉換檢查。讀碼確認 ITR 的保存流程（`ITR.tsx`）任何成功保存都會
直接關閉 Modal，不存在「同視窗保存成功後基準需要更新」這個分支，故未另外處理。

隔離環境實測（`backend/scripts/verification/seed_itr_status_revert_review.py` 隔離測試種子
腳本 + `react-app/tests-browser/itr-status-revert-review.mjs`）27/27 通過，涵蓋：核准遭拒後
同視窗改回 In Progress 並成功保存、其他欄位（Remark）保留不遺失；新建模式選 Approved 再改回
不誤觸撤回核准警告；已經真正保存為 Approved 的紀錄仍正確鎖定、Publish（下一版）仍正常；已有
Pass Checklist 的 ITR 核准仍正常成功。未修改 Checklist 必須存在才能核准的後端規則、
`itr:approve:all` 權限檢查（讀碼確認未觸碰，前端本身對 Status 下拉未做權限閘門，核准權限純後端
強制，本批未改）。npm test 123 passed、npm run build 成功。詳見
`docs/workflow/ITR-STATUS-2026-001-handoff.md`。
2026-10-03（獨立審查 REVISE，ITR-STATUS-2026-001）：上述修正方向經獨立審查接受、不重開，但
指出驗收腳本本身有兩個恆真斷言（`count() >= 0`、`count() === 0 || true`，不論結果如何都會
通過，不構成有效驗證）、Remark 在核准已遭拒之後才填入（只證明改狀態不清空，不能證明「失敗前
輸入被保留」）、情境 D 核准成功後未重新開啟同一筆核對鎖定基準、核准權限只有讀碼推論沒有實際
執行紀錄。完整審查封存於 `docs/workflow/ITR-STATUS-2026-001-archive.md`。
2026-10-03（ITR-STATUS-2026-002，證據補齊，**獨立審查 PASS**）：**產品修正本身未重開、未
重寫**，只補齊上述驗收證據缺口。移除兩個恆真斷言，改用 Remark 欄位存在/可見性精確判斷 modal
開關，新建取消案例改用「POST 請求數為 0」＋「前後 id 集合一致」兩項直接證據。Remark 改在第一
次核准保存**之前**填入，核對遭拒後、改回狀態後兩個時間點皆保留，最終以 response body 與同 id
raw GET 雙重確認持久化為最初填入值；第一次遭拒的保存額外核對實際 HTTP status（400）與
response body.detail，不只看 toast。新增情境 D2：核准成功、modal 關閉後重新開啟同一筆，核對
Status/Inspection Result 停用與 Revoke Approval 入口，補足「由 In Progress 真正轉為
Approved」這個新基準的證據（與情境 C 的預先種入 Approved 紀錄並存，不互相替代）。執行既有、
未修改的後端測試 `test_itr_approval_authority_http.py` 回歸核准權限保護，8 passed。隔離環境
瀏覽器驗證 **42/42 通過**；兩類證據（42 項瀏覽器實機、8 項後端既有測試）分開記錄，不合併成
單一數字，也不宣稱審查者重新執行過——審查本身僅核對腳本內容、斷言數與證據檔案，未重新跑過
瀏覽器或後端測試。未修改任何產品程式碼，依規則略過 npm test/build 重跑。PASS 判定範圍限於
ITR-STATUS-2026-002 的補正範圍，不代表全系統或所有瀏覽器邊界皆已驗證；不再開
ITR-STATUS-2026-003。詳見 `docs/workflow/ITR-STATUS-2026-002-handoff.md`。

## 52. Q-Workflow 列表缺少可直接辨識的「目前步驟／下一步」文字 · FIXED，已於 2026-10-05 部署

2026-10-03：Q-Workflow→NOI→ITR 業務操作審閱時觀察到：9 個檢查點欄位在一般桌面寬度（1600px）下
仍需橫向捲動兩次才能看完；每列只有一串彩色圓點（灰＝未到、綠＝完成、橘＝目前卡點），「橘色＝
目前卡點」的意義只寫在滑鼠懸停才看得到的 title 提示裡（例如 `title="Inspected · current"`），
畫面上沒有任何一行文字直接寫「目前卡在 W/H Inspection」或「下一步：等待檢驗」。對第一次看、或
需要同時盯多列進度的使用者，辨認「現在在哪、下一步做什麼」比預期費力。本批（ITR-STATUS-2026-001）
依交辦範圍明確不實作，僅記錄於此。

2026-10-03（TASK_ID: QWORKFLOW-UX-2026-001，已實作）：在兩個固定可見（不需橫向捲動）的 sticky
欄位之一（NOI 欄）既有內容下方新增一行文字，完全沿用後端已經算好的 `checkpoints[].state`：
找到第一個 `state === 'current'` 的檢查點，顯示「Current step: {既有 checkpointLabel()}」；
若沒有任何 current（即全部 9 個皆 done，完成度 100%），直接顯示該檢查點自己的既有標籤
「Accepted」本身，不加「Current step:」前綴（這是陳述已完成的事實，不是還卡在某一步）；若兩者
皆非（理論上不會發生，純防呆），不顯示任何推測文字。只新增一個翻譯 key
（`workflow.currentStep` = "Current step"／「目前步驟」），未改變進度計算規則、未新增後端
欄位、未改節點點擊／排序／篩選／完成度百分比／既有授權行為。

隔離環境實測（`backend/scripts/verification/seed_qworkflow_currentstep_review.py` 隔離測試
種子腳本 + `react-app/tests-browser/qworkflow-currentstep-review.mjs`）18/18 通過，涵蓋：低
完成度與 22% 完成度兩列各自顯示不同檢查點文字，且與該列檢查點欄位本身的 title（ground
truth）一致、100% 完成顯示「Accepted」不誤植為其他檢查點名稱、僅有 Void ITR 的情境與無 ITR
情境顯示完全相同的文字（不因為資料含 Void 字樣就另外猜測或把「Void」三個字顯示出來）、桌面
（1440px）與手機（375px）寬度下頁面層級水平溢出皆為 0px（表格本身既有的橫向捲動不受影響）、
切換專案後舊文字不殘留且能正確切回、`wh_inspection` 檢查點點擊仍開啟正確的 NOI 紀錄（僅測
NOI 導向，ITR/NCR 導向本輪未測）。`npm test` 123 passed、`npm run build` 成功。詳見
`docs/workflow/QWORKFLOW-UX-2026-001-handoff.md`。
2026-10-03（獨立審查 REVISE，QWORKFLOW-UX-2026-001）：產品邏輯與桌面呈現經審查接受、不重開；
指出手機驗證只核對整頁水平溢出為 0，第一項斷言用 `count() === 1` 卻命名為「可視不需橫向捲動」
——元素存在不代表文字真的落在可視範圍、未被表格自己的 `.tableWrapper`（`overflow-x: auto`）
或相鄰 sticky 欄位裁切。同時指出前一輪把完成度 22% 的測資稱為「MID/中完成度」不準確，以及
「節點點擊仍開啟正確紀錄」的宣稱其實只實測了 NOI 導向，未測 ITR/NCR 導向。完整審查封存於
`docs/workflow/QWORKFLOW-UX-2026-001-archive.md`。
2026-10-03（QWORKFLOW-UX-2026-002，手機可視範圍證據補齊，**獨立審查 PASS**）：**產品邏輯與
桌面呈現本輪未重開、未重寫**，只補手機可視範圍的真實幾何證據。在 375px 寬度、表格水平捲動
位置維持 ≤5px 容差（非嚴格 `scrollLeft === 0`）下，對三列（低完成度、22% 完成度、100%
Accepted）各自核對 bounding box 非零、左上角在 viewport 內、右邊界未超出 375px（實測餘裕
約 11px，即 375−364px）、`elementFromPoint` 中心點命中測試確認文字中心未被其他元素覆蓋——
中心命中只證明中心未被遮住，不能單獨證明四個邊緣都沒裁切，「文字完整可讀」是這組自動檢查
搭配三列實機截圖（含完整表格範圍，不是整頁截圖）一起佐證的，證據範圍限於本輪三個指定樣本，
不代表所有文字長度與語系都已驗證。過程中發現並修正測試腳本自身（非產品）的問題：前一輪
`locator.screenshot()` 意外觸發 274px 橫向捲動，已改用 `page.screenshot({clip})` 避免。
隔離環境實測 **39/39 通過**（18 項既有 + 21 項本輪新增）。審查明確未重新執行隔離瀏覽器、
npm test 或 build，39/39 執行結果與隔離環境拆除情況皆引用 Claude 本輪紀錄。本輪未修改任何
產品程式碼，依規則略過 npm test/build 重跑。PASS 判定範圍限於本批指定的三個樣本，不代表
全語系或全部 9 個檢查點皆已完成手機驗收；不再開 QWORKFLOW-UX-2026-003。詳見
`docs/workflow/QWORKFLOW-UX-2026-002-handoff.md`。

2026-10-04（FORMS-CONSISTENCY-2026-001~004，NOI/ITR/NCR 表單操作一致性，**獨立審查
PASS 結案**）：實際操作三表單找到並修正：ITR 鎖定記錄標題/Cancel 文案與保存中狀態不一致
（View ITR／Close／Saving...，比照 NOI/NCR 既有模式）、ITR 保存失敗原本直接顯示後端原始
5xx detail（改用共用 `describeSaveError`）、ITR 保存失敗文案最終改用專屬 `itr.saveNotConfirmed`
（不斷言「確定未保存」，因為該 catch 也涵蓋完全無回應、系統其實不知道後端是否已寫入的情況；
`saveFlow.failedKeep`／NOI/NCR 未改動）。歷經三次 REVISE：第一次補強斷言嚴謹度與保存證據鏈；
第二次重寫 Part F 為每個返回情境各用全新瀏覽器 context＋固定來源頁，才排除了「NCR 深連結
返回失敗」其實只是測試共用瀏覽器 history 造成的假象（不是產品問題）；第三次修正 ITR 保存
失敗文案的確定性宣稱。終版 `forms-consistency-review.mjs` 144/144 通過＋專用小範圍腳本
18/18 通過。**維護注意**：舊 `forms-consistency-review.mjs` 的 Part D 仍假設 ITR 保存失敗
顯示 `saveFlow.failedKeep`，對現行 ITR（已改用 `itr.saveNotConfirmed`）已過時；144 項是
歷史證據，日後若重跑整套須先同步 ITR 預期文字，否則會在 Part D 誤判。詳見
`docs/workflow/FORMS-CONSISTENCY-2026-004-handoff.md` 與各輪 archive。

### 2026-10-05：NOI 沒有單筆完整內容的列印版面（待辦，未實作） · 【優先度：低】

**使用者實際比對** NOI 的「列印」跟「匯出 Word」（NOI-EXPORT-DOCX-2026-001，已部署）內容不一致，
由使用者提供的一份單筆 NOI 列印 PDF 與對應 Word 檔比對後發現：兩者**不是同一份資料跑出不同結果
的 bug**，而是列印目前只有一種版面可用。

**根因**：`NOIDetailModal.tsx` 的「Print」按鈕（`onPrint` prop，接到 `NOI.tsx:422` 的
`handleSinglePrint`）最終還是渲染 `NOIPrintTemplate.tsx`——這個元件是給**批次列印**用的（依承包商
分組、可一次印多筆，欄位刻意精簡成 Subject／ITP no.／Event #／Checkpoint／檢驗時間一行一筆），
單筆列印只是把一筆資料塞進同一個批次範本，所以看起來像單筆列印，實際是批次摘要格式。缺少
`編號(Reference No)`、`NCR 編號`、`到期日`、`結案日期`、`狀態` 等欄位，正是因為批次範本本來就
沒設計要顯示這些——不是漏印，是設計上只有批次格式這一種。

Word 匯出（`NOIService.export_docx`）則是正規單筆完整記錄格式，欄位齊全。

**要做的事**：比照 ITR 既有的「單筆詳細列印」模式（`ITRModals.tsx` 裡的 `ITRPrintPreview`），
幫 NOI 另外做一個單筆詳細列印版面，欄位對齊 Word 匯出版本，與現有批次列印版面（`NOIPrintTemplate.tsx`）
並存，不互相取代——批次列印有自己的現場核對用途，不應該被拿掉。

使用者本批要求先記錄、不實作。

### 2026-10-05：OBS 歷史資料「整體 Closed、個別工程師核准仍 Pending」不一致 · 【優先度：低】

驗證 #20（OBS 簽核身份制修正）時，在正式環境發現 `QTS-RKS-HL-OBS-000001` 這筆記錄：
清單上整體狀態顯示 Closed，但打開後「驗證與結案」分頁的 Quality Engineer／
Construction Engineer 核准欄位都還是 Pending——跟 `obsFormSchema.ts::deriveOBSStatus`
（雙方都 Approved 才會是 Closed）邏輯矛盾。

**推測根因**：這筆記錄可能是 2026-09-01 工程師簽核欄位分拆之前、只有單一 `verified`
欄位的舊資料。當時的遷移腳本 `db_migrations.py::_backfill_obs_engineer_approvals`
只會把 `verified == 'Verified'`（精確字串比對）的舊記錄回填成兩個欄位都 Approved；
這筆的 `verified` 原始值如果不是剛好等於這個字串（或走了其他結案路徑），就不會被
回填到，停留在目前這個不一致狀態。**未查證**，只是依照遷移腳本邏輯推測。

**使用者發現的連帶問題**：這筆記錄雖然整體狀態是 Closed，一般使用者（只有
`obs:update:all`）打開會整個鎖定唯讀，但持有 `obs:approve:all` 的管理者帳號仍可
編輯——這是 `OBS.tsx:333-339` 既有的刻意設計（核准權限可以校正已結案記錄），不是
臭蟲，但容易讓人誤以為是漏洞，值得之後處理這筆歷史資料時一併說明。

**要做的事（尚未執行）**：
1. 查一下正式環境有多少筆記錄處於同樣「整體 Closed、個別核准 Pending」的不一致
   狀態（直接查資料庫即可，不需要改程式）。
2. 如果筆數不多，用 Admin 權限手動把這幾筆的兩個工程師核准欄位校正為 Approved
   （`ApprovedBy`/`ApprovedDate` 用歷史上真正結案的人/日期，不是現在操作的人）。
3. 如果筆數偏多，考慮重跑一次更寬鬆比對條件的回填（例如 `verified` 不分大小寫、
   或涵蓋 `verified` 為其他近似「已驗證」字串的情況）——但要先查證原始資料長相，
   不確定之前先不要假設。

使用者本批要求先記錄、不修正。
