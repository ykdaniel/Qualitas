"""
Checklist/ITR isolation — legacy data inventory (READ-ONLY)

Part of the 2026-09-19 §17 isolation/traceability hardening. Counts rows
that predate (or otherwise fall outside) the new enforcement added in
checklist_service.py/itr_service.py, so the operator can see the real
shape of existing data before/after that change ships. Reuses the exact
same "does this carry results" predicate the enforcement itself uses
(_touched_fields_carry_results), so this report and the guard it's
checking against can never quietly disagree.

This script makes NO writes of any kind — every function below is a plain
SELECT. Never run any cleanup/reclassification here; that is explicitly
out of scope (see the task this was written for).
"""

from typing import List, Tuple
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from services.checklist_service import (
    _touched_fields_carry_results,
    count_mismatch_problems,
    pass_support_problems,
    summarize_items,
)

SAMPLE_LIMIT = 10


def find_bare_templates_with_results(db: Session) -> Tuple[int, List[str]]:
    """Rows with itrId/template_id both falsy that nonetheless carry a
    Pass/Fail status, non-zero pass/failCount, or filled-in item results —
    generalizes the single known QTS-RKS-HL-CHK-000001 example into a full
    count. Every one of these predates the new create/update guards (which
    make this state impossible to reach going forward)."""
    rows = db.query(models.Checklist).filter(
        ((models.Checklist.itrId.is_(None)) | (models.Checklist.itrId == '')),
        ((models.Checklist.template_id.is_(None)) | (models.Checklist.template_id == '')),
    ).all()
    offenders = [
        r for r in rows
        if _touched_fields_carry_results({
            'status': r.status,
            'passCount': r.passCount,
            'failCount': r.failCount,
            'detail_data': r.detail_data,
        })
    ]
    return len(offenders), [r.recordsNo for r in offenders[:SAMPLE_LIMIT]]


def find_instances_missing_template_id(db: Session) -> Tuple[int, List[str]]:
    """Rows with a real itrId but no template_id — pre-§17 rows created
    before the deep-copy-from-template mechanism existed, or created some
    other way that bypassed link_checklist."""
    rows = db.query(models.Checklist).filter(
        models.Checklist.itrId.isnot(None),
        models.Checklist.itrId != '',
        ((models.Checklist.template_id.is_(None)) | (models.Checklist.template_id == '')),
    ).all()
    return len(rows), [r.recordsNo for r in rows[:SAMPLE_LIMIT]]


def find_itrnumber_without_itrid(db: Session) -> Tuple[int, List[str]]:
    """Rows where the denormalized itrNumber string is set but the real
    itrId FK is falsy — the known desync class (e.g. QTS-RKS-RKS-CHK-000006),
    typically left behind when the ITR a row pointed at was later deleted
    with no real FK to cascade from."""
    rows = db.query(models.Checklist).filter(
        ((models.Checklist.itrId.is_(None)) | (models.Checklist.itrId == '')),
        models.Checklist.itrNumber.isnot(None),
        models.Checklist.itrNumber != '',
    ).all()
    return len(rows), [r.recordsNo for r in rows[:SAMPLE_LIMIT]]


def find_instances_missing_source_template_version(db: Session) -> Tuple[int, List[str]]:
    """Real instances (itrId set) with source_template_version still NULL
    — expected baseline is every instance that existed before this
    migration shipped, since the column has no DEFAULT and is only ever
    set going forward by link_checklist. A nonzero count here is not a
    problem to fix — it's the intentional "historical version unknown"
    marker; this is purely for visibility."""
    rows = db.query(models.Checklist).filter(
        models.Checklist.itrId.isnot(None),
        models.Checklist.itrId != '',
        models.Checklist.source_template_version.is_(None),
    ).all()
    return len(rows), [r.recordsNo for r in rows[:SAMPLE_LIMIT]]


def find_instances_with_reliable_evidence_timestamp(db: Session) -> Tuple[int, List[str]]:
    """Real instances with evidence_recorded_at set AND confirmed
    reliable — set live by update_checklist only (the sole source of
    truth for this flag as of the v4 repair; no migration may ever set
    it True — see models.py's Checklist comment). This is a genuinely
    known first-save moment on an instance tracked continuously since its
    own creation, safe to display/trust as such."""
    rows = db.query(models.Checklist).filter(
        models.Checklist.itrId.isnot(None),
        models.Checklist.itrId != '',
        models.Checklist.evidence_recorded_at.isnot(None),
        models.Checklist.evidence_recorded_at_reliable.is_(True),
    ).all()
    return len(rows), [r.recordsNo for r in rows[:SAMPLE_LIMIT]]


def find_instances_with_unreliable_evidence_timestamp(db: Session) -> Tuple[int, List[str]]:
    """Real instances with SOME evidence_recorded_at value, but NOT
    confirmed reliable — this covers several possible origins: an
    unverified v2-bug leftover, a "known sighting" timestamp reconstructed
    by v3/v4 from a corroborating audit_logs entry (real, but not provably
    the FIRST such moment), or a value v4 downgraded because v3 could not
    actually prove it was reliable. In every case the value is preserved
    (not fabricated, not cleared) but must never be displayed/interpreted
    as a confirmed first-save timestamp — protected the same as any other
    historical-unknown row."""
    rows = db.query(models.Checklist).filter(
        models.Checklist.itrId.isnot(None),
        models.Checklist.itrId != '',
        models.Checklist.evidence_recorded_at.isnot(None),
        models.Checklist.evidence_recorded_at_reliable.isnot(True),
    ).all()
    return len(rows), [r.recordsNo for r in rows[:SAMPLE_LIMIT]]


def find_instances_with_unknown_evidence_history(db: Session) -> Tuple[int, List[str]]:
    """Real instances (itrId set) marked evidence_historical_unknown —
    set only by the one-time migration backfill for a pre-existing row
    whose true evidence history couldn't be determined. Also protected
    from hard-delete/unlink, but with honestly-unknown provenance rather
    than a real timestamp."""
    rows = db.query(models.Checklist).filter(
        models.Checklist.itrId.isnot(None),
        models.Checklist.itrId != '',
        models.Checklist.evidence_historical_unknown.is_(True),
    ).all()
    return len(rows), [r.recordsNo for r in rows[:SAMPLE_LIMIT]]


def _describe(row, problems) -> str:
    kind = "instance" if row.itrId else "template"
    return f"{row.recordsNo} [{kind}, status={row.status}]: " + "; ".join(problems)


def find_pass_with_unusable_items(db: Session) -> Tuple[int, List[str]]:
    """Status 'Pass' but the item data is missing, unparsable, not an items
    list, or the list is empty — a Pass with nothing behind it (2026-09-19
    pass-integrity hardening). Read-only; nothing is repaired."""
    hits = []
    for r in db.query(models.Checklist).filter(models.Checklist.status == 'Pass').all():
        summary = summarize_items(r.detail_data)
        if not summary['ok'] or summary['total'] == 0:
            hits.append(_describe(r, pass_support_problems(r.passCount, r.failCount, r.detail_data)[:1]))
    return len(hits), hits


def find_pass_not_all_o(db: Session) -> Tuple[int, List[str]]:
    """Status 'Pass' with a usable, non-empty item list that still holds
    unfilled / Fail / N-A / unknown-code items (counts are reported by the
    separate mismatch check)."""
    hits = []
    for r in db.query(models.Checklist).filter(models.Checklist.status == 'Pass').all():
        summary = summarize_items(r.detail_data)
        if not summary['ok'] or summary['total'] == 0:
            continue
        reasons = [p for p in pass_support_problems(r.passCount, r.failCount, r.detail_data)
                   if not p.startswith(('passCount', 'failCount'))]
        if reasons:
            hits.append(_describe(r, reasons))
    return len(hits), hits


def find_count_mismatches(db: Session) -> Tuple[int, List[str]]:
    """Any row (any status) whose passCount/failCount disagree with the
    actual number of O / X items. Unparsable/absent item data counts as
    zero O and zero X."""
    hits = []
    for r in db.query(models.Checklist).all():
        problems = count_mismatch_problems(r.passCount, r.failCount, summarize_items(r.detail_data))
        if problems:
            hits.append(_describe(r, problems))
    return len(hits), hits


def find_na_items_without_reason(db: Session) -> Tuple[int, List[str]]:
    """Items marked '/' (N/A) with no `naReason`. Every one of these is
    historical (predates the reason field) — reported so it can be seen,
    never backfilled: a reason is the user's own justification and must not
    be invented."""
    import json as _json
    hits = []
    for r in db.query(models.Checklist).all():
        try:
            items = (_json.loads(r.detail_data) if isinstance(r.detail_data, str) else (r.detail_data or {})).get('items')
        except (TypeError, ValueError, AttributeError):
            continue
        if not isinstance(items, list):
            continue
        missing = [i for i in items if isinstance(i, dict) and i.get('result') == '/' and not str(i.get('naReason') or '').strip()]
        if missing:
            hits.append(_describe(r, [f"{len(missing)} N/A item(s) without a recorded reason"]))
    return len(hits), hits


def find_fail_without_x(db: Session) -> Tuple[int, List[str]]:
    """Status 'Fail' but NO item is marked X (2026-09-20 rule change: N/A alone is no longer a Fail).

    These are rows written under the old rule (O + N/A, or all N/A, saved as Fail). Read-only: nothing is
    rewritten, no approval event or snapshot is touched. Each hit says whether it is a bare TEMPLATE or an ITR
    INSTANCE — only instances can matter to an ITR; a closed one is reopened by a checklist:close:all holder and
    then saved again under the new rule. Also flagged: Fail rows whose items are unparsable/empty (no X either)."""
    hits = []
    for r in db.query(models.Checklist).filter(models.Checklist.status == 'Fail').all():
        s = summarize_items(r.detail_data)
        if not s['ok'] or s['total'] == 0:
            hits.append(_describe(r, ["Fail with missing / empty / unparsable items (no X)"]))
        elif not s['x']:
            hits.append(_describe(r, [f"Fail with no X item (O={s['o']}, N/A={s['na']}, unfilled={s['unfilled']}, unknown={s['unknown']})"]))
    return len(hits), hits


def find_instances_missing_contractor(db: Session) -> Tuple[int, List[str]]:
    """ITR-bound instances with NO contractor (vendor_id NULL/empty) although their parent ITR has one.

    Rows created by link_checklist / create_reinspection BEFORE 2026-09-20 (those paths did not copy the
    contractor): a contractor-scoped user cannot see them (record_in_scope excludes NULL). READ-ONLY —
    nothing is backfilled. Each hit says whether the parent ITR is frozen (Approved / Void: such rows and
    the approval-event snapshots must never be rewritten) or still open, and what the backfill value
    WOULD be (the parent's vendor_id) so an operator can decide separately. Instances whose parent ITR
    itself has no contractor are not reported (nothing to inherit)."""
    hits = []
    rows = (
        db.query(models.Checklist, models.ITR)
        .join(models.ITR, models.Checklist.itrId == models.ITR.id)
        .filter(or_(models.Checklist.contractor_id.is_(None), models.Checklist.contractor_id == ''))
        .filter(models.ITR.vendor_id.isnot(None), models.ITR.vendor_id != '')
        .order_by(models.Checklist.recordsNo)
        .all()
    )
    for chk, parent in rows:
        state = "FROZEN parent" if (parent.status or '') in ('Approved', 'Void') else "open parent"
        hits.append(f"{chk.recordsNo} [instance of {parent.documentNumber}, {state}={parent.status}, status={chk.status}]: "
                    f"no contractor; parent's would be {parent.vendor_id}")
    return len(hits), hits


def run_inventory(db: Session) -> None:
    checks = [
        ("Bare templates carrying results", find_bare_templates_with_results),
        ("Instances missing template_id (pre-§17)", find_instances_missing_template_id),
        ("itrNumber set but itrId falsy (desync)", find_itrnumber_without_itrid),
        ("Instances with source_template_version=NULL (historical, expected)", find_instances_missing_source_template_version),
        ("Instances with a RELIABLE evidence_recorded_at (confirmed real)", find_instances_with_reliable_evidence_timestamp),
        ("Instances with an UNRELIABLE evidence_recorded_at (v2-era leftover, unconfirmed)", find_instances_with_unreliable_evidence_timestamp),
        ("Instances marked evidence_historical_unknown (protected, no known timestamp)", find_instances_with_unknown_evidence_history),
        ("Pass with empty / missing / unparsable items", find_pass_with_unusable_items),
        ("Pass but items still unfilled / Fail / N-A / unknown", find_pass_not_all_o),
        ("passCount / failCount disagree with the O / X items", find_count_mismatches),
        ("N/A items with no recorded reason (historical)", find_na_items_without_reason),
        ("Fail with no X item (old rule: N/A alone was a Fail; templates vs instances)", find_fail_without_x),
        ("ITR instances with no contractor while the parent ITR has one (invisible to contractor-scoped users)", find_instances_missing_contractor),
    ]
    print("Checklist/ITR isolation — legacy data inventory (read-only)\n")
    for label, fn in checks:
        count, sample = fn(db)
        print(f"{label}: {count}")
        if fn is find_fail_without_x:
            print(f"  of which ITR instances: {sum('[instance' in h for h in sample)}, bare templates: {sum('[template' in h for h in sample)}")
        if sample:
            if fn in (find_pass_with_unusable_items, find_pass_not_all_o, find_count_mismatches, find_na_items_without_reason, find_fail_without_x, find_instances_missing_contractor):
                for line in sample:
                    print(f"  - {line}")
            else:
                print(f"  sample recordsNo: {', '.join(sample)}")
    print("\nNo rows were modified — this script only reads.")


if __name__ == "__main__":
    session = SessionLocal()
    try:
        run_inventory(session)
    finally:
        session.close()
