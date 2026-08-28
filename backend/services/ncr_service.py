"""
NCR (Non-Conformance Report) Service

Business logic layer for NCR module
"""

import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import models
import schemas
from mail_service import send_ncr_rejection_notification
from repositories.ncr_repository import NCRRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)

# NCR severity → default SLA days from raiseDate to dueDate (BACKLOG #13 #1).
# TODO(#13): promote to a global configurable setting (KPIWeight-style) so the
# PQM can tune per project/contract — currently fixed defaults.
NCR_SLA_DAYS = {"Major": 7, "Minor": 14}


def _add_days(date_str: str, days: int) -> str:
    """Add `days` to a YYYY-MM-DD date string, returning YYYY-MM-DD."""
    base = datetime.strptime(date_str[:10], "%Y-%m-%d")
    return (base + timedelta(days=days)).strftime("%Y-%m-%d")


class NCRService:
    """Service layer for NCR business logic"""

    def __init__(self, repo: NCRRepository):
        self.repo = repo

    def get_ncrs(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.NCR]:
        """
        Get list of NCRs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of NCR objects
        """
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_ncr(self, ncr_id: str, scope=None) -> Optional[models.NCR]:
        """
        Get a single NCR by ID

        Args:
            ncr_id: NCR identifier

        Returns:
            NCR object if found, None otherwise
        """
        ncr = self.repo.get_by_id(ncr_id)
        return ncr if record_in_scope(ncr, scope) else None

    def create_ncr(self, ncr_create: schemas.NCRCreate,
                   user_id: int = None, username: str = None, scope=None) -> models.NCR:
        """
        Create a new NCR with business logic validation

        Business logic:
        - Maps vendor name to vendor_id
        - Generates Reference No (documentNumber) automatically if not provided
        - Serializes JSON fields (defectPhotos, improvementPhotos, attachments)
        - Logs audit trail

        Args:
            ncr_create: NCR creation schema
            user_id: ID of user creating the NCR
            username: Username of user creating the NCR

        Returns:
            Created NCR object

        Raises:
            Exception: If creation fails
        """
        try:
            # Serialize JSON fields
            data = _json_serialize(
                ncr_create.model_dump(),
                ['defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments']
            )

            # Handle vendor name -> vendor_id mapping
            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            # Auto-fill dueDate from the severity SLA when not explicitly set
            # (BACKLOG #13 #1). Major → 7 days, Minor → 14 days from raiseDate
            # (defaults to today if no raiseDate). Overridable: a provided dueDate
            # is left untouched.
            if data.get('severity') in NCR_SLA_DAYS and not data.get('dueDate'):
                base_date = data.get('raiseDate') or datetime.now().strftime("%Y-%m-%d")
                data['raiseDate'] = data.get('raiseDate') or base_date
                data['dueDate'] = _add_days(base_date, NCR_SLA_DAYS[data['severity']])

            # noiNumber is auto-derived from the linked ITR (NOI is traced
            # through the ITR), so a dangling reference — NOI deleted/renamed —
            # is a data issue the user can't fix from the NCR form. Drop it
            # instead of failing the whole save.
            if data.get('noiNumber'):
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == data['noiNumber']
                ).first()
                if not noi:
                    logger.warning(
                        "NCR create: dropping dangling noiNumber %r (no matching NOI)",
                        data['noiNumber'],
                    )
                    data['noiNumber'] = ''

            # recurrenceRef is a traceability claim ("this is a repeat of that
            # prior NCR") — verify it actually resolves to an existing NCR,
            # same as noiNumber above, so an unverifiable value can't silently
            # satisfy the "recurrence needs a ref" closure requirement later.
            if data.get('recurrenceRef'):
                prior_ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == data['recurrenceRef']
                ).first()
                if not prior_ncr:
                    logger.warning(
                        "NCR create: dropping unverifiable recurrenceRef %r (no matching NCR)",
                        data['recurrenceRef'],
                    )
                    data['recurrenceRef'] = ''

            # Generate Reference No automatically if not provided
            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'NCR'
                )

            # Create NCR object
            db_ncr = models.NCR(**data)
            if not db_ncr.id:
                db_ncr.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_ncr)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "NCR", created.id, created.documentNumber,
                new_value=ncr_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating NCR: {e}", exc_info=True)
            raise e

    def update_ncr(self, ncr_id: str, ncr_update: schemas.NCRUpdate,
                   user_id: int = None, username: str = None, scope=None,
                   background_tasks=None) -> Optional[models.NCR]:
        """
        Update an existing NCR with validation

        Business logic:
        - Validates status transitions using WorkflowEngine
        - Maps vendor name to vendor_id
        - Serializes JSON fields
        - Logs audit trail

        Args:
            ncr_id: NCR identifier
            ncr_update: NCR update schema
            user_id: ID of user updating the NCR
            username: Username of user updating the NCR

        Returns:
            Updated NCR object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid
            Exception: If update fails
        """
        try:
            db_ncr = self.repo.get_by_id(ncr_id)
            if not db_ncr or not record_in_scope(db_ncr, scope):
                return None

            # Workflow validation: Check status transition
            if ncr_update.status and not WorkflowEngine.validate_transition(
                "NCR", db_ncr.status, ncr_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_ncr.status} to {ncr_update.status}"
                )

            # Capture old values for audit
            old_val = {c.name: getattr(db_ncr, c.name) for c in db_ncr.__table__.columns}

            # Prepare update data
            d = ncr_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments'])

            # Recompute dueDate from the severity SLA when severity changes and
            # the caller didn't explicitly provide a new dueDate — mirrors the
            # auto-fill in create_ncr. Without this, escalating severity (e.g.
            # Minor -> Major) via a later update leaves the stale, looser SLA
            # deadline in place instead of tightening it.
            if (
                d.get('severity') in NCR_SLA_DAYS
                and d.get('severity') != db_ncr.severity
                and 'dueDate' not in d
            ):
                base_date = d.get('raiseDate', db_ncr.raiseDate) or datetime.now().strftime("%Y-%m-%d")
                d['dueDate'] = _add_days(base_date, NCR_SLA_DAYS[d['severity']])

            # recurrenceRef is a traceability claim ("this is a repeat of that
            # prior NCR") — unlike noiNumber/itrNumber it previously had no
            # existence check at all, so a typo or made-up value silently
            # satisfied the "recurrence needs a ref" closure requirement below.
            # Must run BEFORE the closure-required-fields check so a dropped
            # dangling ref is correctly treated as missing, not as already
            # having satisfied the requirement.
            if 'recurrenceRef' in d and d['recurrenceRef']:
                prior_ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == d['recurrenceRef']
                ).first()
                if not prior_ncr:
                    logger.warning(
                        "NCR update: dropping unverifiable recurrenceRef %r (no matching NCR)",
                        d['recurrenceRef'],
                    )
                    d['recurrenceRef'] = ''

            # --- Guard: prevent modification of quality fields on an already-Closed NCR ---
            # This check must run BEFORE the "transitioning to Closed" validation so
            # that an update that is NOT changing status but tries to alter these
            # fields on a Closed record is correctly rejected.
            _LOCKED_QUALITY_FIELDS = {
                'repairMethodStatement', 'repairMethodStatementStatus',
                'rootCauseAnalysis', 'rootCauseAnalysisStatus',
                'correctiveActions', 'correctiveActionsStatus',
                'reInspectionNumber', 'improvementPhotos', 'ownerApproval',
            }
            is_already_closed = db_ncr.status == 'Closed'
            is_transitioning_to_closed = d.get('status') == 'Closed' and not is_already_closed

            if is_already_closed and not is_transitioning_to_closed:
                # Compare against the current DB value, not mere key presence —
                # the frontend resends the full record on every save, so a
                # field being "in the payload" doesn't mean it actually changed.
                changed_locked = {
                    f for f in (_LOCKED_QUALITY_FIELDS & set(d.keys()))
                    if d[f] != getattr(db_ncr, f, None)
                }
                # Owner rejection of an already-Closed NCR is a designed reopen
                # path, not a lockable edit: deriveNCRStatus (ncrFormSchema.ts)
                # explicitly reverts status to 'In Progress' when ownerApproval
                # flips to 'Rejected', even for a previously-verified/closed
                # record ("even an already-verified NCR must go back to the
                # contractor if the owner then rejects it"). Without this
                # exception that save is unconditionally rejected here, so the
                # documented reopen flow was silently dead on arrival.
                if 'ownerApproval' in changed_locked and d.get('ownerApproval') == 'Rejected':
                    changed_locked.discard('ownerApproval')
                if changed_locked:
                    raise ValueError("Cannot modify quality fields on a Closed NCR")

            # Handle vendor name -> vendor_id mapping
            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(d, scope)

            # --- Validate required fields when transitioning to Closed ---
            # Kept in lockstep with the frontend's zod superRefine gate
            # (ncrFormSchema.ts) — the two used to disagree (this gate required
            # repairMethodStatement unconditionally while the frontend only
            # required it for "Repair", and didn't check drawingNo/specNo/
            # qtyAffected/extent at all here or improvementPhotos there), so a
            # save that passed frontend validation could still 400 here for a
            # field the user was never told was required, or the reverse.
            if is_transitioning_to_closed:
                # Merge incoming data with existing record to check final state
                final_disposition = d.get('productDisposition', db_ncr.productDisposition)
                final_reinspection = d.get('reInspectionNumber', db_ncr.reInspectionNumber)
                final_drawing_no = d.get('drawingNo', db_ncr.drawingNo)
                final_spec_no = d.get('specNo', db_ncr.specNo)
                final_qty_affected = d.get('qtyAffected', db_ncr.qtyAffected)
                final_extent = d.get('extent', db_ncr.extent)
                final_photos_raw = d.get('improvementPhotos', db_ncr.improvementPhotos)

                # improvementPhotos may be a JSON string or a Python list
                if isinstance(final_photos_raw, str):
                    try:
                        final_photos = json.loads(final_photos_raw)
                    except (json.JSONDecodeError, TypeError):
                        final_photos = []
                elif isinstance(final_photos_raw, list):
                    final_photos = final_photos_raw
                else:
                    final_photos = []

                missing = []
                if not final_disposition:
                    missing.append('productDisposition (產品處置)')
                # repairMethodStatement is only required for "Repair" — matches
                # the frontend's repairStar / repairNeedsMethod coupling. A
                # TBC/NA status counts as "addressed" here too, same as the
                # frontend gate (BACKLOG item 6) — it's an explicit answer,
                # not a blank field.
                if final_disposition == 'Repair':
                    final_repair = d.get('repairMethodStatement', db_ncr.repairMethodStatement)
                    final_repair_status = d.get('repairMethodStatementStatus', db_ncr.repairMethodStatementStatus)
                    if (not final_repair or not str(final_repair).strip()) and not final_repair_status:
                        missing.append('repairMethodStatement (改善方案)')
                if not final_reinspection or not str(final_reinspection).strip():
                    missing.append('reInspectionNumber (複檢編號)')
                if not final_drawing_no or not str(final_drawing_no).strip():
                    missing.append('drawingNo (圖號)')
                if not final_spec_no or not str(final_spec_no).strip():
                    missing.append('specNo (規範號)')
                if not final_qty_affected or not str(final_qty_affected).strip():
                    missing.append('qtyAffected (受影響數量)')
                if not final_extent or not str(final_extent).strip():
                    missing.append('extent (範圍)')
                if not final_photos:
                    missing.append('improvementPhotos (改善照片)')
                # recurrence='Yes' claims this NCR is a repeat of a prior one —
                # require the trace link so that claim is actually verifiable
                # (matches the frontend's recurrenceNeedsRef check).
                final_recurrence = d.get('recurrence', db_ncr.recurrence)
                final_recurrence_ref = d.get('recurrenceRef', db_ncr.recurrenceRef)
                if final_recurrence == 'Yes' and (not final_recurrence_ref or not str(final_recurrence_ref).strip()):
                    missing.append('recurrenceRef (關聯前次 NCR)')

                if missing:
                    raise ValueError(
                        f"Cannot close NCR: the following required fields are missing: "
                        f"{', '.join(missing)}"
                    )

                # Corrective-action effectiveness gate (BACKLOG #13 #3): an NCR
                # cannot be Closed until its effectiveness has been verified = Yes.
                final_effectiveness = d.get('effectivenessVerified', db_ncr.effectivenessVerified)
                if final_effectiveness != 'Yes':
                    raise ValueError(
                        "Cannot close NCR: corrective-action effectiveness must be "
                        "verified (effectivenessVerified = 'Yes') before closing."
                    )

                # Owner / Engineering-Design authority sign-off gate (BACKLOG #14
                # item e): "Use As Is" / "Repair" are technical changes to the
                # accepted product and need explicit approval before closing —
                # the print report's disposition note references this (見 6.3).
                # (final_disposition already computed above.)
                if final_disposition in ('Use As Is', 'Repair'):
                    final_owner_approval = d.get('ownerApproval', db_ncr.ownerApproval)
                    if final_owner_approval != 'Approved':
                        raise ValueError(
                            "Cannot close NCR: disposition 'Use As Is' or 'Repair' "
                            "requires owner/engineering authority approval "
                            "(ownerApproval = 'Approved') before closing."
                        )

            # Auto-set closeoutDate + stamp closedBy when transitioning to Closed
            if d.get('status') == 'Closed' and not d.get('closeoutDate') and not db_ncr.closeoutDate:
                d['closeoutDate'] = datetime.now().strftime('%Y-%m-%d')
            if is_transitioning_to_closed and not d.get('closedBy') and not db_ncr.closedBy:
                d['closedBy'] = user_id

            # Stamp who/when verified effectiveness when it's being recorded
            # (BACKLOG #13 #2/#3) — unless explicitly supplied.
            if d.get('effectivenessVerified') in ('Yes', 'No'):
                if not d.get('effectivenessVerifiedBy'):
                    d['effectivenessVerifiedBy'] = user_id
                if not d.get('effectivenessVerifiedDate'):
                    d['effectivenessVerifiedDate'] = datetime.now().strftime('%Y-%m-%d')

            # Stamp the date when owner/engineering approval is recorded. Not
            # `ownerApprovalBy` — that's the external owner/engineer's own name,
            # not necessarily the logged-in user entering it on their behalf.
            if d.get('ownerApproval') in ('Approved', 'Rejected'):
                if not d.get('ownerApprovalDate'):
                    d['ownerApprovalDate'] = datetime.now().strftime('%Y-%m-%d')

            # noiNumber is auto-derived from the linked ITR, so a dangling
            # reference must not block the update — drop it (see create above).
            if 'noiNumber' in d and d['noiNumber']:
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == d['noiNumber']
                ).first()
                if not noi:
                    logger.warning(
                        "NCR update: dropping dangling noiNumber %r (no matching NOI)",
                        d['noiNumber'],
                    )
                    d['noiNumber'] = ''

            # Owner/engineering rejection needs to reach the contractor right
            # away, not wait for the next scheduler.py batch run — capture the
            # transition before repo.update() overwrites db_ncr in place.
            newly_rejected = d.get('ownerApproval') == 'Rejected' and old_val.get('ownerApproval') != 'Rejected'

            # Update the record
            updated = self.repo.update(db_ncr, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "NCR", ncr_id, updated.documentNumber,
                old_value=old_val, new_value=ncr_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            if newly_rejected:
                vendor_email = updated.vendor_ref.email if updated.vendor_ref else ''
                # Don't block the HTTP response on a live SMTP round-trip — a
                # slow/unreachable mail server would otherwise turn a routine
                # save into a multi-second-to-minute hang for the caller.
                if background_tasks is not None:
                    background_tasks.add_task(
                        send_ncr_rejection_notification,
                        vendor_email, updated.documentNumber, updated.ownerApprovalNotes or ''
                    )
                else:
                    send_ncr_rejection_notification(
                        vendor_email, updated.documentNumber, updated.ownerApprovalNotes or ''
                    )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating NCR {ncr_id}: {e}", exc_info=True)
            raise e

    def delete_ncr(self, ncr_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """
        Delete a NCR with audit logging

        Args:
            ncr_id: NCR identifier
            user_id: ID of user deleting the NCR
            username: Username of user deleting the NCR

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_ncr = self.repo.get_by_id(ncr_id)
            if not db_ncr or not record_in_scope(db_ncr, scope):
                return False

            # Only Void NCRs can be deleted — deleting Open/In Progress/Resolved/Closed
            # NCRs would game the Q-WorkFlow completion percentage to 100%.
            if db_ncr.status != 'Void':
                raise ValueError(
                    f"Cannot delete NCR '{db_ncr.documentNumber}' with status '{db_ncr.status}'. "
                    f"Please Void the NCR first, then delete."
                )

            # Check for ITR references before deletion
            itr_count = self.repo.db.query(models.ITR).filter(
                models.ITR.ncrNumber == db_ncr.documentNumber
            ).count()
            if itr_count > 0:
                raise ValueError(f"Cannot delete NCR '{db_ncr.documentNumber}': referenced by {itr_count} ITR record(s)")

            # Capture old values for audit
            old_val = {c.name: getattr(db_ncr, c.name) for c in db_ncr.__table__.columns}

            # Delete the record
            self.repo.delete(db_ncr)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "NCR", ncr_id, db_ncr.documentNumber,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting NCR {ncr_id}: {e}", exc_info=True)
            raise e

    def export_docx(self, ncr_id: str, scope=None):
        """
        Generate a formal .docx report for one NCR — same 7-section content
        as NCRPrintTemplate.tsx (BACKLOG #15 / #18 pilot), built directly
        with python-docx via core/docx_builder.py rather than converting the
        HTML print template (htmldocx doesn't handle the CSS-grid sections
        the print template uses — see BACKLOG.md for the write-up).

        Returns a StreamingResponse; raises ValueError (→ 404 in the router)
        if the NCR doesn't exist or isn't in the caller's scope.
        """
        import os as _os
        from core import docx_builder as db

        ncr = self.repo.get_by_id(ncr_id)
        if not ncr or not record_in_scope(ncr, scope):
            raise ValueError("NCR not found")

        upload_root = _os.path.join(
            _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), "uploads"
        )

        def _parse_json_list(raw):
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, list) else []
            except (TypeError, ValueError):
                return []

        def _photo_paths(legacy_field: str, category: str) -> list:
            legacy = [u for u in _parse_json_list(legacy_field) if isinstance(u, str)]
            attachments = self.repo.db.query(models.Attachment).filter(
                models.Attachment.entity_type == "ncr",
                models.Attachment.entity_id == ncr_id,
                models.Attachment.category == category,
                models.Attachment.is_deleted == False,  # noqa: E712
            ).all()
            urls = legacy + [a.file_path for a in attachments]
            paths = []
            for u in urls:
                p = db.resolve_local_upload_path(u, upload_root)
                if p:
                    paths.append(p)
            return paths

        defect_photos = _photo_paths(ncr.defectPhotos, "defectPhoto")
        progress_photos = _photo_paths(ncr.progressPhotos, "progressPhoto")
        improvement_photos = _photo_paths(ncr.improvementPhotos, "improvementPhoto")

        sev_text = "MAJOR 重大" if ncr.severity == "Major" else "MINOR 輕微" if ncr.severity == "Minor" else db.DASH

        doc = db.new_document()
        db.add_masthead(
            doc, "不符合報告", "NON-CONFORMANCE REPORT",
            doc_no=ncr.documentNumber, rev=ncr.rev, status=ncr.status,
        )

        # 1. Non-conformance details
        db.add_section_heading(doc, "1", "不符合細節", "Non-Conformance Details")
        db.add_field_grid(doc, [
            [("Aconex／文管編號", "Doc-Control No.", ncr.aconex), ("NCR 編號", "NCR No.", ncr.documentNumber)],
            [("主旨", "Subject", ncr.subject)],
            [("承包商", "Contractor", ncr.vendor), ("專業類別", "Discipline", ncr.discipline)],
            [("類型", "Type", ncr.type), ("發現位置", "Found Location", ncr.foundLocation)],
            [("開立日期", "Raise Date", ncr.raiseDate), ("回覆期限", "Response Due", ncr.dueDate)],
            [("發現人", "Found By", ncr.foundBy), ("提出人", "Raised By", ncr.raisedBy)],
            [("嚴重度", "Severity", sev_text)],
        ])

        has_traceability = any([ncr.drawingNo, ncr.specNo, ncr.lineNo, ncr.weldJointNo, ncr.heatBatchNo, ncr.itrNumber, ncr.noiNumber])
        if has_traceability:
            db.add_subsection_heading(doc, "1.1 追溯資訊", "Traceability")
            db.add_field_grid(doc, [
                [("圖號", "Drawing No.", ncr.drawingNo), ("規範號", "Spec No.", ncr.specNo)],
                [("管線編號", "Line No.", ncr.lineNo), ("焊道編號", "Weld / Joint No.", ncr.weldJointNo)],
                [("材料批號", "Heat / Batch No.", ncr.heatBatchNo),
                 ("ITR／NOI 編號", "ITR / NOI No.", " / ".join(filter(None, [ncr.itrNumber, ncr.noiNumber])))],
            ])

        has_impact = any([ncr.qtyAffected, ncr.extent])
        if has_impact:
            db.add_subsection_heading(doc, "1.2 影響範圍", "Impact & Extent")
            qty = f"{ncr.qtyAffected}{' ' + ncr.qtyAffectedUnit if ncr.qtyAffectedUnit else ''}" if ncr.qtyAffected else None
            db.add_field_grid(doc, [[("受影響數量", "Qty Affected", qty), ("範圍", "Isolated / Systemic", ncr.extent)]])

        db.add_subsection_heading(doc, "1.3 不符合描述", "Description of Non-Conformance")
        db.add_field_box(doc, ncr.requirement, guide="說明圖面／規範／程序書要求為何")
        db.add_field_box(doc, ncr.deviation, guide="說明實況與要求之差異")

        # 2. Disposition
        db.add_section_heading(doc, "2", "處置", "Disposition")
        db.add_subsection_heading(doc, "2.1 產品處置", "Product Disposition")
        disp = ncr.productDisposition
        db.add_checkbox_row(doc, [
            ("科用 Use As Is", disp == "Use As Is"), ("返工 Rework", disp == "Rework"),
            ("維修 Repair", disp == "Repair"), ("報廢 Reject / Scrap", disp == "Reject"),
        ])
        db.add_field_grid(doc, [
            [("讓步／偏差核准編號", "Concession / Deviation No.", ncr.concessionNo)],
            [("業主／工程權責核准", "Owner / Engineering Approval",
              (ncr.ownerApproval or "") + (f"｜{ncr.ownerApprovalNotes}" if ncr.ownerApprovalNotes else ""))],
        ])
        db.add_subsection_heading(doc, "2.2 維修方法說明", "Repair Method Statement")
        db.add_field_box(doc, ncr.repairMethodStatement, guide="若處置為維修，說明維修方法與驗收標準", tall=True)

        # 3. Root cause & corrective action
        db.add_section_heading(doc, "3", "根本原因與矯正措施", "Root Cause & Corrective Action")
        db.add_subsection_heading(doc, "3.1 立即處置", "Immediate Correction")
        db.add_field_box(doc, ncr.immediateCorrectionAction, guide="為控制當前不符合所採取之立即措施")

        db.add_subsection_heading(doc, "3.2 根因分析", "Root Cause Analysis")
        db.add_field_box(doc, ncr.directCause, guide="直接導致不符合之原因")
        db.add_field_box(doc, ncr.rootCauseAnalysis, guide="制度／流程層面之根本原因")
        db.add_checkbox_row(doc, [("否 No", ncr.recurrence == "No"), ("是 Yes", ncr.recurrence == "Yes")])
        if ncr.recurrence == "Yes":
            db.add_field_grid(doc, [[("關聯前次 NCR", "Recurrence Ref", ncr.recurrenceRef)]])

        db.add_subsection_heading(doc, "3.3 矯正措施", "Corrective Actions")
        db.add_field_box(doc, ncr.correctiveActions, guide="消除根因之矯正措施")
        db.add_field_grid(doc, [[("負責人", "Owner", ncr.correctiveActionOwner), ("目標完成日", "Target Date", ncr.correctiveActionTargetDate)]])

        db.add_subsection_heading(doc, "3.4 預防措施", "Preventive Action")
        db.add_field_box(doc, ncr.preventiveAction, guide="防止類似不符合再發之措施")
        db.add_field_grid(doc, [[("負責人", "Owner", ncr.preventiveActionOwner), ("目標完成日", "Target Date", ncr.preventiveActionTargetDate)]])

        # 4. Attachments
        db.add_section_heading(doc, "4", "附件與證據", "Attachments & Evidence")
        general_attachments = self.repo.db.query(models.Attachment).filter(
            models.Attachment.entity_type == "ncr",
            models.Attachment.entity_id == ncr_id,
            models.Attachment.category == "attachment",
            models.Attachment.is_deleted == False,  # noqa: E712
        ).all()
        legacy_attachment_urls = [u for u in _parse_json_list(ncr.attachments) if isinstance(u, str)]
        att_names = [a.file_name for a in general_attachments] + [u.split("/")[-1] for u in legacy_attachment_urls]
        if not att_names:
            db.add_field_grid(doc, [[("附件", "Attachments", None)]])
        else:
            db.add_field_grid(doc, [[(str(i + 1), "", name)] for i, name in enumerate(att_names)])

        # 5. Verification & closure
        db.add_section_heading(doc, "5", "驗證與結案", "Verification & Closure")
        db.add_checkbox_row(doc, [("是 Yes", ncr.effectivenessVerified == "Yes"), ("否 No", ncr.effectivenessVerified == "No")])
        db.add_field_grid(doc, [
            [("結案日期", "Closeout Date", ncr.closeoutDate)],
            [("複驗編號", "Re-Inspection No.", ncr.reInspectionNumber), ("有效性備註", "Notes", ncr.effectivenessNotes)],
        ])

        # 6. Closure sign-off
        db.add_section_heading(doc, "6", "結案簽核", "Closure Sign-off")
        db.add_sign_off_grid(doc, [
            {"num": "6.1", "zh": "承包商", "en": "Contractor", "name": ncr.vendor},
            {"num": "6.2", "zh": "開立人", "en": "Issuer", "name": ncr.raisedBy or ncr.foundBy, "date": ncr.raiseDate},
            {"num": "6.3", "zh": "業主／工程權責", "en": "Owner / Engineering Authority",
             "name": ncr.ownerApprovalBy, "date": ncr.ownerApprovalDate, "req": ncr.ownerApproval},
        ])

        # 7. Photographic record
        if defect_photos or progress_photos or improvement_photos:
            doc.add_page_break()
            db.add_section_heading(doc, "7", "照片紀錄（前／中／後）", "Photographic Record (Before / During / After)")
            db.add_photo_section(doc, "缺失（前）Defect (Before)", defect_photos)
            db.add_photo_section(doc, "矯正中（中）In Progress (During)", progress_photos)
            db.add_photo_section(doc, "改善（後）Improvement (After)", improvement_photos)

        return db.finalize_response(doc, ncr.documentNumber or "NCR")
