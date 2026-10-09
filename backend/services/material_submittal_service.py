"""Approved-material register (MATERIAL-SUBMITTAL M6, DECISIONS 材料：只作為核准材料登錄簿) on the M2 submittal tables.

The former workflow methods (create draft, edit draft, submit, record / correct result, new revision, list submittals) were
removed with their routes (2026-10-09); kept only in the M6 backup. What remains: detail, approved list, register, edit.

Spec: docs/planning/MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08.md §3–§4 (r2) and §9; DECISIONS.md "材料送審：…".

Every revision action follows spec §4.2, and every failure leaves NO write behind:
  1 permission (router) → 2 submittal visible (else 404) → 3 write lock + expire_all + re-read
  → 4 revision belongs to the submittal (else 404) → 5 parent/child project+vendor equal (else 409, error log)
  → 6 state / business rules (409 / 400) → 7 write + log_audit(strict) + commit, all in one transaction.
Status changes are conditional UPDATEs (rowcount must be 1); unique indexes are the last line of defence.

There is NO internal approval: the system only records external (owner / consultant) results. The person who logs
a result is stored separately from the external decision maker.
"""
import logging
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import schemas
from core.material_access import lock_material_submittal_for_write, project_visible
from core.scope import Scope, record_in_scope
from core.utils import begin_write_transaction, generate_reference_no, log_audit

logger = logging.getLogger(__name__)

APPROVED = ("Approved", "ApprovedWithComments")
_SNAP_FROM_MATERIAL = {"snap_category": "category", "snap_name": "name", "snap_brand": "brand", "snap_model": "model",
                       "snap_specification": "specification", "snap_manufacturer": "manufacturer", "snap_supplier": "supplier"}

class NotVisible(Exception):
    """404: the project / submittal / revision / material does not exist or is outside the caller's scope."""

class Conflict(Exception):
    """409: the request is valid but the record's current state does not allow it."""

class BadRequest(Exception):
    """400: a well-formed request that breaks a business rule (e.g. a material of another project)."""

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

class MaterialSubmittalService:
    def __init__(self, db: Session):
        self.db = db

    # ── reads ─────────────────────────────────────────────────────────────────────────────────────────────
    def _visible_submittal(self, submittal_id: str, scope: Scope) -> models.MaterialSubmittal:
        sub = self.db.get(models.MaterialSubmittal, submittal_id)
        if sub is None or not record_in_scope(sub, scope):
            raise NotVisible()
        return sub

    def _revisions(self, submittal_id: str):
        return (self.db.query(models.MaterialSubmittalRevision)
                .filter(models.MaterialSubmittalRevision.submittal_id == submittal_id)
                .order_by(models.MaterialSubmittalRevision.rev_no).all())

    def _latest_revision(self, sub: models.MaterialSubmittal):
        return (self.db.query(models.MaterialSubmittalRevision)
                .filter(models.MaterialSubmittalRevision.submittal_id == sub.id,
                        models.MaterialSubmittalRevision.rev_no == sub.latest_rev_no).first())

    def _entries(self, revision_id: str):
        return (self.db.query(models.MaterialSubmittalResultEntry)
                .filter(models.MaterialSubmittalResultEntry.revision_id == revision_id)
                .order_by(models.MaterialSubmittalResultEntry.seq).all())

    def _current_entry(self, revision_id: str):
        return (self.db.query(models.MaterialSubmittalResultEntry)
                .filter(models.MaterialSubmittalResultEntry.revision_id == revision_id,
                        models.MaterialSubmittalResultEntry.superseded_by_entry_id.is_(None)).first())

    def _card(self, sub: models.MaterialSubmittal, latest=None) -> dict:
        latest = latest or self._latest_revision(sub)
        vendor = self.db.get(models.Contractor, sub.vendor_id)
        overdue = bool(latest is not None and latest.status == "Submitted" and latest.expected_reply_date
                       and latest.expected_reply_date < date.today().isoformat())
        return dict(id=sub.id, project_id=sub.project_id, vendor_id=sub.vendor_id, vendor_name=vendor.name if vendor else None,
                    material_id=sub.material_id, document_number=sub.document_number, latest_rev_no=sub.latest_rev_no,
                    latest_status=sub.latest_status, current_approved_rev_no=sub.current_approved_rev_no,
                    current_approved_result=sub.current_approved_result,
                    material_name=latest.snap_name if latest else None, material_category=latest.snap_category if latest else None,
                    material_brand=latest.snap_brand if latest else None, material_model=latest.snap_model if latest else None,
                    submitted_date=latest.submitted_date if latest else None,
                    expected_reply_date=latest.expected_reply_date if latest else None, overdue=overdue,
                    created_at=sub.created_at, updated_at=sub.updated_at)

    def approved(self, project_id: str, scope: Scope, q=None, category=None, vendor_id=None, result=None, registered_from=None,
                 limit=200, offset=0) -> dict:
        """Approved materials of ONE project (M6): every submittal that has a current approved revision, described by THAT
        revision's snapshot and its current result entry (approval date = the external reply date). Not the latest revision,
        not the material master. A correction that takes the approval away removes the row (current_approved_* is derived)."""
        if not project_visible(self.db, project_id, scope):
            raise NotVisible()
        S, R, E = models.MaterialSubmittal, models.MaterialSubmittalRevision, models.MaterialSubmittalResultEntry
        query = (self.db.query(S, R, E)
                 .join(R, (R.submittal_id == S.id) & (R.rev_no == S.current_approved_rev_no))
                 .outerjoin(E, (E.revision_id == R.id) & E.superseded_by_entry_id.is_(None))
                 .filter(S.project_id == project_id, S.current_approved_rev_no.isnot(None)))
        if vendor_id:
            query = query.filter(S.vendor_id == vendor_id)
        if result:
            query = query.filter(S.current_approved_result == result)
        if registered_from:                               # dashboard "registered this month": records created on / after this day
            query = query.filter(S.created_at >= registered_from.isoformat())
        if category:
            query = query.filter(R.snap_category == category)
        if q:
            like = f"%{q.strip()}%"
            query = query.filter(or_(S.document_number.ilike(like), R.snap_name.ilike(like), R.snap_model.ilike(like),
                                     R.snap_brand.ilike(like), R.snap_specification.ilike(like),
                                     R.snap_manufacturer.ilike(like), R.snap_supplier.ilike(like)))
        total = query.count()
        rows = query.order_by(S.document_number).offset(offset).limit(limit).all()
        vendors = {}
        photos = self._photo_summary([rev.id for _, rev, _ in rows])
        items = [self._approved_item(sub, rev, entry, vendors, photos) for sub, rev, entry in rows]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    def _photo_summary(self, revision_ids) -> dict:
        """{revision id: (first photo's stored path, number of photos)} for the listed revisions — one query, for the shelf
        view's sample cards (M6, user's choice 2026-10-09). The first photo = earliest uploaded, as the view's main photo."""
        if not revision_ids:
            return {}
        A = models.Attachment
        out = {}
        for rid, path in (self.db.query(A.entity_id, A.file_path)
                          .filter(A.entity_type == "material_rev", A.category == "photo", A.is_deleted.is_(False),
                                  A.entity_id.in_(revision_ids))
                          .order_by(A.uploaded_at, A.id).all()):
            first, n = out.get(rid, (path, 0))
            out[rid] = (first, n + 1)
        return out

    def _approved_item(self, sub, rev, entry, vendors=None, photos=None) -> dict:
        vendors = {} if vendors is None else vendors
        cover, photo_count = (self._photo_summary([rev.id]) if photos is None else photos).get(rev.id, (None, 0))
        if sub.vendor_id not in vendors:
            vendor = self.db.get(models.Contractor, sub.vendor_id)
            vendors[sub.vendor_id] = vendor.name if vendor else None
        return dict(submittal_id=sub.id, revision_id=rev.id, project_id=sub.project_id, vendor_id=sub.vendor_id,
                    vendor_name=vendors[sub.vendor_id], document_number=sub.document_number, rev_no=rev.rev_no,
                    result=sub.current_approved_result, approved_date=entry.external_reply_date if entry else None,
                    decision_maker=(entry.external_decision_maker or None) if entry else None,
                    external_doc_no=entry.external_doc_no if entry else None,
                    name=rev.snap_name, category=rev.snap_category, brand=rev.snap_brand, model=rev.snap_model,
                    specification=rev.snap_specification, manufacturer=rev.snap_manufacturer,
                    supplier=rev.snap_supplier, spec_reference=rev.spec_reference,
                    cover_photo_path=cover, photo_count=photo_count)

    def approved_one(self, submittal_id: str, scope: Scope) -> dict:
        sub = self._visible_submittal(submittal_id, scope)
        if sub.current_approved_rev_no is None:
            raise NotVisible()
        rev = (self.db.query(models.MaterialSubmittalRevision)
               .filter_by(submittal_id=sub.id, rev_no=sub.current_approved_rev_no).one())
        return self._approved_item(sub, rev, self._current_entry(rev.id))

    def detail(self, submittal_id: str, scope: Scope) -> dict:
        sub = self._visible_submittal(submittal_id, scope)
        material = self.db.get(models.Material, sub.material_id)
        revisions = []
        for rev in self._revisions(sub.id):
            out = schemas.MaterialRevisionOut.model_validate(rev).model_dump()
            out["result_entries"] = [dict(schemas.MaterialResultEntryOut.model_validate(e).model_dump(),
                                          is_current=e.superseded_by_entry_id is None) for e in self._entries(rev.id)]
            out["differs_from_material"] = [snap for snap, field in _SNAP_FROM_MATERIAL.items()
                                            if material is not None and getattr(rev, snap) != getattr(material, field)]
            revisions.append(out)
        return dict(self._card(sub), material=material, revisions=revisions)

    # ── create ───────────────────────────────────────────────────────────────────────────────────────────

    # ── revision actions ──────────────────────────────────────────────────────────────────────────────────
    def _locked(self, submittal_id: str, revision_id, scope: Scope):
        """Steps 2–5 of spec §4.2. Returns (submittal, revision-or-None) re-read under the write lock."""
        self._visible_submittal(submittal_id, scope)
        lock_material_submittal_for_write(self.db, submittal_id)
        self.db.expire_all()
        sub = self._visible_submittal(submittal_id, scope)
        rev = None
        if revision_id is not None:
            rev = (self.db.query(models.MaterialSubmittalRevision)
                   .filter(models.MaterialSubmittalRevision.id == revision_id,
                           models.MaterialSubmittalRevision.submittal_id == sub.id).first())
            if rev is None:
                raise NotVisible()
            if rev.project_id != sub.project_id or rev.vendor_id != sub.vendor_id:
                logger.error("Material revision %s does not match its submittal %s (project/vendor)", rev.id, sub.id)
                raise Conflict("The revision does not match its submittal.")
        return sub, rev

    def _run(self, action, *args):
        try:
            result = action(*args)
            self.db.commit()
            return result
        except IntegrityError:
            self.db.rollback()
            raise Conflict("A concurrent change was made; reload and try again.")
        except Exception:
            self.db.rollback()
            raise

    def _recompute_current_approved(self, sub: models.MaterialSubmittal) -> None:
        """Spec §3.3: the highest rev_no whose CURRENT result is Approved / ApprovedWithComments. Derived, never restored."""
        self.db.flush()
        # Column query, not ORM objects: status changes are conditional bulk UPDATEs (synchronize_session=False), so an
        # identity-mapped revision may still hold its old status in memory. Read the committed-in-transaction values.
        R = models.MaterialSubmittalRevision
        best = (self.db.query(R.rev_no, R.status)
                .filter(R.submittal_id == sub.id, R.status.in_(APPROVED))
                .order_by(R.rev_no.desc()).first())
        sub.current_approved_rev_no = best.rev_no if best else None
        sub.current_approved_result = best.status if best else None

    # ── approved-material register (M6, DECISIONS 材料：只作為核准材料登錄簿) ─────────────────────────────────────
    _REGISTER_SNAP = {"name": "snap_name", "category": "snap_category", "brand": "snap_brand", "model": "snap_model",
                      "specification": "snap_specification", "manufacturer": "snap_manufacturer", "supplier": "snap_supplier"}

    def _by_request_id(self, body: schemas.MaterialRegisterCreate, scope: Scope):
        """The record an earlier request with the same client request id created in this project, or None (M6 R2)."""
        if not body.client_request_id:
            return None
        sub = (self.db.query(models.MaterialSubmittal)
               .filter(models.MaterialSubmittal.project_id == body.project_id,
                       models.MaterialSubmittal.client_request_id == body.client_request_id).first())
        if sub is None:
            return None
        if not record_in_scope(sub, scope):
            raise NotVisible()
        if sub.vendor_id != body.vendor_id:
            raise Conflict("This request id was already used for another contractor's record.")
        return sub

    def register(self, body: schemas.MaterialRegisterCreate, scope: Scope, user) -> dict:
        """One transaction: material + number + Rev 0 already in its approved state + the initial result entry.
        Nothing is left behind on failure (no Draft, no half record).

        M6 R2 — a repeated request is not a second material: when `client_request_id` was already used in this project the
        record that request created is returned as it is (no write, no audit). The form then sends any changed fields as an
        edit. Two simultaneous requests with the same id: the unique index lets one commit; the other returns its record."""
        if not project_visible(self.db, body.project_id, scope):
            raise NotVisible()
        vendor = self.db.get(models.Contractor, body.vendor_id)
        if vendor is None:
            raise NotVisible()
        earlier = self._by_request_id(body, scope)
        if earlier is not None:
            return self.approved_one(earlier.id, scope)
        try:
            begin_write_transaction(self.db)
            now = _now()
            fields = {k: getattr(body, k) for k in self._REGISTER_SNAP}
            material = models.Material(id=str(uuid.uuid4()), project_id=body.project_id, created_by=user.username,
                                       created_at=now, **fields)
            self.db.add(material)
            self.db.flush()
            number = generate_reference_no(self.db, vendor.name, "MSA")
            approved = body.approved_date.isoformat()
            sub = models.MaterialSubmittal(id=str(uuid.uuid4()), project_id=body.project_id, vendor_id=vendor.id,
                                           material_id=material.id, document_number=number, latest_rev_no=0,
                                           latest_status=body.result_code, current_approved_rev_no=0,
                                           current_approved_result=body.result_code,
                                           created_by=user.username, created_at=now, updated_at=now,
                                           client_request_id=body.client_request_id)
            self.db.add(sub)
            rev = models.MaterialSubmittalRevision(
                id=str(uuid.uuid4()), submittal_id=sub.id, project_id=sub.project_id, vendor_id=sub.vendor_id, rev_no=0,
                status=body.result_code, spec_reference=body.spec_reference, submitted_date=approved,
                submitted_by_user_id=str(user.id), submitted_by_name=user.username, submitted_at=now,
                created_by=user.username, created_at=now, **{snap: fields[f] for f, snap in self._REGISTER_SNAP.items()})
            self.db.add(rev)
            self.db.flush()
            entry = models.MaterialSubmittalResultEntry(
                revision_id=rev.id, submittal_id=sub.id, project_id=sub.project_id, vendor_id=sub.vendor_id, seq=1,
                entry_type="initial", result_code=body.result_code, external_decision_maker=body.decision_maker or "",
                external_reply_date=approved, external_doc_no=body.external_doc_no,
                logged_by_user_id=str(user.id), logged_by_name=user.username, logged_at=now)
            self.db.add(entry)
            self.db.flush()
            log_audit(self.db, "REGISTER", "MaterialSubmittal", sub.id, number,
                      new_value={"material_id": material.id, "vendor_id": vendor.id, "name": material.name,
                                 "result_code": body.result_code, "approved_date": approved,
                                 "decision_maker": body.decision_maker, "external_doc_no": body.external_doc_no},
                      user_id=user.id, username=user.username, strict=True)
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            earlier = self._by_request_id(body, scope)        # the same request committed first (double click / retry)
            if earlier is not None:
                return self.approved_one(earlier.id, scope)
            logger.error("Material register failed", exc_info=True)
            raise Conflict("A concurrent change was made; reload and try again.")
        except Exception:
            self.db.rollback()
            logger.error("Material register failed", exc_info=True)
            raise
        return self.approved_one(sub.id, scope)

    # ── duplicate check and dashboard figures (M6 R2) ───────────────────────────────────────────────────────────
    @staticmethod
    def _identity(name, brand, model) -> tuple:
        return tuple((v or "").strip().casefold() for v in (name, brand, model))

    def duplicates(self, project_id: str, scope: Scope, name: str, brand=None, model=None, exclude_id=None,
                   client_request_id=None) -> dict:
        """Every OTHER registered record of the project with the same name + brand + model (trimmed, case-insensitive),
        over ALL records — not one page of a text search. Only warns (the user may still register: DECISIONS 補充).
        Excludes the record being edited and the record an earlier attempt of the same form created (its request id)."""
        if not project_visible(self.db, project_id, scope):
            raise NotVisible()
        S, R = models.MaterialSubmittal, models.MaterialSubmittalRevision
        rows = (self.db.query(S.id, S.document_number, S.client_request_id, R.snap_name, R.snap_brand, R.snap_model)
                .join(R, (R.submittal_id == S.id) & (R.rev_no == S.current_approved_rev_no))
                .filter(S.project_id == project_id, S.current_approved_rev_no.isnot(None))
                .order_by(S.document_number).all())
        wanted = self._identity(name, brand, model)
        items = [dict(submittal_id=r.id, document_number=r.document_number) for r in rows
                 if self._identity(r.snap_name, r.snap_brand, r.snap_model) == wanted and r.id != exclude_id
                 and not (client_request_id and r.client_request_id == client_request_id)]
        return {"items": items}

    def stats(self, scope: Scope, project_id=None, vendor_id=None, registered_from=None) -> dict:
        """Dashboard tile: approved materials of one project, or — with no project — of EVERY project the caller can see
        (server-side, so it never depends on how many projects a client list happened to load)."""
        S = models.MaterialSubmittal
        query = self.db.query(S).filter(S.current_approved_rev_no.isnot(None))
        if project_id:
            if not project_visible(self.db, project_id, scope):
                raise NotVisible()
            query = query.filter(S.project_id == project_id)
        elif scope is not None and not scope.unrestricted and scope.project_ids is not None:
            query = query.filter(S.project_id.in_(scope.project_ids))
        if vendor_id:
            query = query.filter(S.vendor_id == vendor_id)
        total = query.count()
        since = query.filter(S.created_at >= registered_from.isoformat()).count() if registered_from else 0
        return {"total": total, "registered_since": since}

    def update_register(self, submittal_id: str, body: schemas.MaterialRegisterUpdate, scope: Scope, user) -> dict:
        """Material fields change in place (the material master follows) with an audit record of old / new values.
        Result fields (result, date, decision maker, document no.) never overwrite: a correction entry is appended."""
        changes = body.model_dump(exclude_unset=True)

        def act():
            sub, _ = self._locked(submittal_id, None, scope)
            if sub.current_approved_rev_no is None or sub.latest_rev_no != sub.current_approved_rev_no:
                raise Conflict("Only a registered (approved) material can be edited here.")
            rev = (self.db.query(models.MaterialSubmittalRevision)
                   .filter_by(submittal_id=sub.id, rev_no=sub.current_approved_rev_no).one())
            current = self._current_entry(rev.id)
            if current is None:
                raise Conflict("The approval record is missing; reload and try again.")
            old, new = {}, {}
            material = self.db.get(models.Material, sub.material_id)
            for f, snap in self._REGISTER_SNAP.items():
                if f in changes and getattr(rev, snap) != changes[f]:
                    old[f], new[f] = getattr(rev, snap), changes[f]
                    setattr(rev, snap, changes[f])
                    if material is not None:
                        setattr(material, f, changes[f])
            if "spec_reference" in changes and rev.spec_reference != changes["spec_reference"]:
                old["spec_reference"], new["spec_reference"] = rev.spec_reference, changes["spec_reference"]
                rev.spec_reference = changes["spec_reference"]
            if material is not None and any(f in new for f in self._REGISTER_SNAP):
                material.updated_by, material.updated_at = user.username, _now()
            result_now = {"result_code": current.result_code, "approved_date": current.external_reply_date,
                          "decision_maker": current.external_decision_maker or None, "external_doc_no": current.external_doc_no}
            wanted = dict(result_now)
            for k in result_now:
                if k in changes:
                    wanted[k] = changes[k].isoformat() if k == "approved_date" else changes[k]
            if wanted != result_now:
                max_seq = self.db.query(func.max(models.MaterialSubmittalResultEntry.seq)).filter(
                    models.MaterialSubmittalResultEntry.revision_id == rev.id).scalar() or 0
                entry = models.MaterialSubmittalResultEntry(
                    revision_id=rev.id, submittal_id=sub.id, project_id=sub.project_id, vendor_id=sub.vendor_id,
                    seq=max_seq + 1, entry_type="correction", result_code=wanted["result_code"],
                    external_decision_maker=wanted["decision_maker"] or "", external_reply_date=wanted["approved_date"],
                    external_doc_no=wanted["external_doc_no"], logged_by_user_id=str(user.id), logged_by_name=user.username,
                    logged_at=_now(), supersedes_entry_id=current.id, correction_reason="Register edit")
                self.db.add(entry)
                self.db.flush()
                n = (self.db.query(models.MaterialSubmittalResultEntry)
                     .filter(models.MaterialSubmittalResultEntry.id == current.id,
                             models.MaterialSubmittalResultEntry.superseded_by_entry_id.is_(None))
                     .update({"superseded_by_entry_id": entry.id}, synchronize_session=False))
                if n != 1:
                    raise Conflict("The record was changed meanwhile; reload and try again.")
                if wanted["result_code"] != current.result_code:
                    m = (self.db.query(models.MaterialSubmittalRevision)
                         .filter(models.MaterialSubmittalRevision.id == rev.id,
                                 models.MaterialSubmittalRevision.status == current.result_code)
                         .update({"status": wanted["result_code"]}, synchronize_session=False))
                    if m != 1:
                        raise Conflict("The record was changed meanwhile; reload and try again.")
                    sub.latest_status = wanted["result_code"]
                    self._recompute_current_approved(sub)
                for k in result_now:
                    if wanted[k] != result_now[k]:
                        old[k], new[k] = result_now[k], wanted[k]
            if not new:
                return
            sub.updated_at = _now()
            self.db.flush()
            log_audit(self.db, "UPDATE", "MaterialSubmittal", sub.id, sub.document_number, old_value=old, new_value=new,
                      user_id=user.id, username=user.username, strict=True)
        self._run(act)
        return self.approved_one(submittal_id, scope)

