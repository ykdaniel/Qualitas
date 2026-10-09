"""
NOI (Notice of Inspection) Service

Business logic layer for NOI module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.noi_repository import NOIRepository
from core import strict_dates
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    _reference_seq_lock,
    _resolve_vendor_id,
    begin_write_transaction,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)
from core import error_messages
from core import validators

logger = logging.getLogger(__name__)


def noi_has_own_qworkflow(ncr_number) -> bool:
    """THE rule for "does this NOI get a Q-WorkFlow row of its own?" (2026-09-20) — used by the create path AND by the
    start-up back-fill (db_migrations._backfill_qworkflows), so the two can never disagree.

    A NOI carrying an ``ncrNumber`` is a RE-INSPECTION NOI: it shares the original NOI's tracker (the re-inspection
    progress is found through NCR.reInspectionNumber / ITR.originalItrId), and a second row would double-count the
    thread. Recognition is exactly Python truthiness of the stored value — NULL and '' are "no ncrNumber"; anything else
    (including whitespace) is one. No trimming and no other normalisation is applied, here or anywhere that calls this."""
    return not ncr_number


class NOIService:
    """Service layer for NOI business logic"""

    def __init__(self, repo: NOIRepository):
        self.repo = repo

    def get_nois(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.NOI]:
        """
        Get list of NOIs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of NOI objects
        """
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_noi(self, noi_id: str, scope=None) -> Optional[models.NOI]:
        """
        Get a single NOI by ID

        Args:
            noi_id: NOI identifier

        Returns:
            NOI object if found, None otherwise
        """
        obj = self.repo.get_by_id(noi_id)
        return obj if record_in_scope(obj, scope) else None

    def create_noi(self, noi_create: schemas.NOICreate,
                   user_id: int = None, username: str = None, scope=None) -> models.NOI:
        """
        Create a new NOI with business logic validation

        Business logic:
        - Maps contractor name to vendor_id
        - Generates Reference No automatically if not provided
        - Sets default status to "Draft" if not provided
        - Serializes JSON fields (attachments)
        - Logs audit trail

        ONE transaction (2026-09-20): the NOI row, its reference-number allocation, the paired Q-WorkFlow
        row (unless it is a re-inspection NOI) and the strict CREATE audit entry are written under one
        write lock and committed ONCE, at the end. Any failure — including the Q-WorkFlow insert and the
        audit entry, which are no longer allowed to fail silently — rolls all of it back, sequence
        included. (Before, the NOI was committed first and the Q-WorkFlow row and audit entry were only
        flushed/added and never committed, so they were lost and the tracker stayed empty until the
        start-up back-fill.)

        Args:
            noi_create: NOI creation schema
            user_id: ID of user creating the NOI
            username: Username of user creating the NOI

        Returns:
            Created NOI object

        Raises:
            Exception: If creation fails
        """
        try:
            data = _json_serialize(noi_create.model_dump(), ['attachments'])

            # Handle contractor name -> vendor_id mapping (NOI uses 'contractor' field)
            vendor_name = data.pop('contractor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            # Validate foreign keys BEFORE allocating a reference number,
            # so failed creates don't leave gaps in the NOI sequence.
            if data.get('itpNo'):
                validators.validate_itp_reference(self.repo.db, data['itpNo'])

            # final content validated before the write lock / any reference number (2026-09-20)
            strict_dates.validate_date_write(data, strict_dates.NOI_DATE_FIELDS, required=strict_dates.NOI_REQUIRED_DATE_FIELDS)

            # From here on everything is written in ONE transaction: take the write lock before the
            # sequence is read (see begin_write_transaction).
            begin_write_transaction(self.repo.db)

            # Generate Reference No automatically if not provided
            if not data.get('referenceNo'):
                data['referenceNo'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'NOI'
                )

            # Set default status
            if not data.get('status'):
                data['status'] = "Draft"

            # Create NOI object
            db_noi = models.NOI(**data)
            if not db_noi.id:
                db_noi.id = str(uuid.uuid4())

            # Insert the NOI (flush only — the commit is the single one at the end)
            created = self.repo.create(db_noi, commit=False)

            # Auto-create the paired Q-WorkFlow row. A Q-WorkFlow is
            # 1:1 with an NOI and drives the cross-module tracker on
            # the Dashboard / /workflow page. Done inline (not via a
            # service) because the row is trivial and the 1:1 binding
            # must stay in the same transaction as the NOI insert.
            #
            # Re-inspection NOIs (ones raised against an existing NCR,
            # flagged by ``ncrNumber``) share their parent NOI's
            # Q-WorkFlow — creating a second row for them would
            # double-count the quality thread on the tracker. The
            # re-insp ITR they carry is picked up by the original
            # Q-WorkFlow via ``NCR.reInspectionNumber`` / the typed
            # ``ITR.originalItrId`` relationship.
            if noi_has_own_qworkflow(data.get('ncrNumber')):
                self._create_qworkflow_for_noi(created)

            # Audit entry: strict — an unrecordable create is not saved at all
            log_audit(
                self.repo.db, "CREATE", "NOI", created.id, created.referenceNo,
                new_value=noi_create.model_dump(), user_id=user_id, username=username,
                strict=True,
            )

            # NOI + reference sequence + Q-WorkFlow + audit: ONE commit
            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(created)
            return created
        except strict_dates.DateValidationError:
            self.repo.db.rollback()            # expected refusal (422): nothing was written
            raise
        except Exception as e:
            self.repo.db.rollback()            # releases the write lock; nothing of this create survives
            logger.error(f"Error creating NOI: {e}", exc_info=True)
            raise e

    def update_noi(self, noi_id: str, noi_update: schemas.NOIUpdate,
                   user_id: int = None, username: str = None, scope=None) -> Optional[models.NOI]:
        """
        Update an existing NOI with validation

        Business logic:
        - Validates status transitions using WorkflowEngine
        - Maps contractor name to vendor_id
        - Serializes JSON fields
        - Logs audit trail

        Args:
            noi_id: NOI identifier
            noi_update: NOI update schema
            user_id: ID of user updating the NOI
            username: Username of user updating the NOI

        Returns:
            Updated NOI object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid
            Exception: If update fails
        """
        try:
            db_noi = self.repo.get_by_id(noi_id)
            if not db_noi or not record_in_scope(db_noi, scope):
                return None

            # Workflow validation: Check status transition
            if noi_update.status and not WorkflowEngine.validate_transition(
                "NOI", db_noi.status, noi_update.status
            ):
                raise ValueError(error_messages.invalid_status_transition("NOI", db_noi.status, noi_update.status))

            # Capture old values for audit
            old_val = {c.name: getattr(db_noi, c.name) for c in db_noi.__table__.columns}

            # Prepare update data
            d = noi_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['attachments'])

            # Date rules on the merged final content, BEFORE anything is numbered or written (2026-09-20). NOI used to have NO
            # date validation on update: a bad value (or NULL in a required date) was saved, then the response failed with 500.
            # A value re-sent unchanged (historical data) is not a new write; NOI has no order rules (unchanged).
            strict_dates.validate_date_write(
                {f: d[f] if f in d else getattr(db_noi, f, None) for f in strict_dates.NOI_DATE_FIELDS},
                strict_dates.NOI_DATE_FIELDS,
                stored={f: getattr(db_noi, f, None) for f in strict_dates.NOI_DATE_FIELDS},
                provided=set(d) & set(strict_dates.NOI_DATE_FIELDS),
                required=strict_dates.NOI_REQUIRED_DATE_FIELDS,
            )

            # Handle contractor name -> vendor_id mapping
            if 'contractor' in d:
                vendor_name = d.pop('contractor')
                new_vendor_id = _resolve_vendor_id(self.repo.db, vendor_name)
                
                # Determine if reference number needs regeneration
                regenerate = False
                if new_vendor_id and new_vendor_id != db_noi.vendor_id:
                    regenerate = True
                elif new_vendor_id and db_noi.referenceNo:
                    # Check if vendor abbreviation changed (e.g., vendor was renamed but ID remains the same)
                    from core.utils import get_contractor_abbreviation
                    from models import DocumentNamingRule
                    from core.config import settings
                    
                    vendor_abbrev = get_contractor_abbreviation(self.repo.db, vendor_name)
                    rule = self.repo.db.query(DocumentNamingRule).filter(
                        DocumentNamingRule.doc_type == 'noi'
                    ).first()
                    
                    if rule and rule.prefix:
                        expected_prefix = rule.prefix.replace('[ABBREV]', vendor_abbrev)
                    else:
                        project_code = getattr(settings, 'PROJECT_CODE', 'QTS')
                        expected_prefix = f"{project_code}-{vendor_abbrev}-NOI-"
                        
                    if not db_noi.referenceNo.startswith(expected_prefix):
                        regenerate = True

                if regenerate:
                    from core.utils import generate_reference_no
                    d['referenceNo'] = generate_reference_no(self.repo.db, vendor_name, 'NOI')
                
                d['vendor_id'] = new_vendor_id

            enforce_update_scope(d, scope)

            # Validate itpNo exists if being updated
            if 'itpNo' in d and d['itpNo']:
                itp = self.repo.db.query(models.ITP).filter(
                    models.ITP.referenceNo == d['itpNo']
                ).first()
                if not itp:
                    raise ValueError(error_messages.reference_not_found("ITP", "reference number", d['itpNo']))

            # 勾稽鎖定：關閉 NOI 前確認其下所有 ITR 已完結（Approved 或 Void）
            new_status = d.get('status') or (noi_update.status if noi_update.status else None)
            if new_status == 'Closed' and db_noi.referenceNo:
                open_itr_count = self.repo.db.query(models.ITR).filter(
                    models.ITR.noiNumber == db_noi.referenceNo,
                    models.ITR.status.notin_(['Approved', 'Void'])
                ).count()
                if open_itr_count > 0:
                    raise ValueError(
                        f"Cannot close NOI '{db_noi.referenceNo}': "
                        f"{open_itr_count} ITR(s) still in progress. "
                        f"Please ensure all linked ITRs are Approved or Void first."
                    )

                # 勾稽鎖定：關閉 NOI 前確認其下所有 NCR 已完結（Closed 或 Void）
                open_ncrs = self.repo.db.query(models.NCR).filter(
                    models.NCR.noiNumber == db_noi.referenceNo,
                    models.NCR.status.notin_(['Closed', 'Void'])
                ).all()
                if open_ncrs:
                    open_refs = [ncr.documentNumber or ncr.id for ncr in open_ncrs]
                    raise ValueError(
                        f"Cannot close NOI '{db_noi.referenceNo}': "
                        f"{len(open_ncrs)} NCR(s) still open: {', '.join(open_refs)}. "
                        f"Please ensure all linked NCRs are Closed or Void first."
                    )

            # Guard: a Closed NOI is a true dead end — WorkflowEngine's NOI
            # transitions (core/utils.py) define "Closed": [], no reopen path
            # exists at all (unlike Checklist/OBS, which can go back to
            # Ongoing/Open). So unlike NCR's _LOCKED_QUALITY_FIELDS (which
            # only locks specific fields and carves out a reopen exception),
            # a Closed NOI can safely be locked unconditionally — there's no
            # legitimate "reopen and edit" flow to accidentally break.
            # Compare against the DB's current values, not mere key-presence,
            # since the frontend resends the whole record on every save.
            if db_noi.status == 'Closed':
                changed_fields = {f for f in d if d[f] != old_val.get(f)}
                if changed_fields:
                    raise ValueError(
                        f"Cannot modify a closed NOI '{db_noi.referenceNo}' — "
                        f"no fields can be changed once an NOI is closed."
                    )

            # Update the record
            updated = self.repo.update(db_noi, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "NOI", noi_id, updated.referenceNo,
                old_value=old_val, new_value=noi_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating NOI {noi_id}: {e}", exc_info=True)
            raise e

    def _create_qworkflow_for_noi(self, noi: models.NOI) -> None:
        """Attach a fresh Q-WorkFlow row to a newly-created NOI.

        Numbering is a simple MAX+1 on the ``qworkflow.referenceNo``
        column: Q-WorkFlow numbers are a single global sequence, not
        per-vendor or per-project, so we don't need the shared
        reference_sequences table. Any parse failure on an existing
        row is ignored (treated as 0) so a hand-edited DB can't break
        startup. Only the flush happens here: the row is committed by the
        caller together with the NOI and its audit entry. A failure is
        NOT swallowed any more (2026-09-20) — the whole NOI create rolls
        back, because a NOI without its tracker row would be silently
        missing from the workflow page.
        """
        from datetime import datetime, timezone

        with _reference_seq_lock:
            existing = (
                self.repo.db.query(models.QWorkflow.referenceNo)
                .with_for_update()
                .all()
            )
            max_seq = 0
            for (ref,) in existing:
                if not ref or not ref.startswith("Q-WorkFlow-"):
                    continue
                try:
                    max_seq = max(max_seq, int(ref.split("-")[-1]))
                except ValueError:
                    continue

            next_ref = f"Q-WorkFlow-{max_seq + 1:06d}"
            qwf = models.QWorkflow(
                id=str(uuid.uuid4()),
                referenceNo=next_ref,
                noi_id=noi.id,
                createdAt=datetime.now(timezone.utc).isoformat(),
            )
            self.repo.db.add(qwf)
            self.repo.db.flush()

    def delete_noi(self, noi_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """
        Delete a NOI with audit logging

        Args:
            noi_id: NOI identifier
            user_id: ID of user deleting the NOI
            username: Username of user deleting the NOI

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_noi = self.repo.get_by_id(noi_id)
            if not db_noi or not record_in_scope(db_noi, scope):
                return False

            # Check for references before deletion
            validators.check_noi_references(self.repo.db, db_noi.referenceNo)

            # Capture old values for audit
            old_val = {c.name: getattr(db_noi, c.name) for c in db_noi.__table__.columns}

            # Clean up the auto-created 1:1 Q-WorkFlow tracker row. SQLite's
            # ondelete="CASCADE" on QWorkflow.noi_id never actually fires
            # (PRAGMA foreign_keys is off), so without this it would be
            # left permanently orphaned, pointing at a deleted NOI.
            self.repo.db.query(models.QWorkflow).filter(
                models.QWorkflow.noi_id == db_noi.id
            ).delete()

            # Delete the record
            self.repo.delete(db_noi)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "NOI", noi_id, db_noi.referenceNo,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting NOI {noi_id}: {e}", exc_info=True)
            raise e

    def export_docx(self, noi_id: str, scope=None):
        """
        Generate a formal .docx export of a Notice of Inspection
        (NOI-EXPORT-DOCX-2026-001), mirroring ITRService.export_docx's
        approach (itself mirroring NCRService.export_docx): built directly
        with python-docx via core/docx_builder.py.

        Unlike ITR, NOI's `itpNo` is a real persisted FK (not a dead field),
        so no NOI->ITP derivation is needed here — it's read straight off
        the record. NOI also has no linked-Checklist display of its own in
        the frontend (that relationship is architecturally "the NOI
        triggers checklists that end up on the resulting ITR"), so no
        Checklist table is included, unlike ITR's export. NOI's single
        attachment category accepts images/PDF/Word/Excel (not image-only,
        confirmed by reading FileAttachment's default `accept`), so
        attachments are listed by filename (`add_file_list`), not embedded
        as photos (`add_photo_section`).

        Returns a StreamingResponse; raises ValueError (-> 404 in the
        router) if the NOI doesn't exist or isn't in the caller's scope.
        """
        import json
        from core import docx_builder as db
        from core.uploads import upload_root as _upload_root

        noi = self.get_noi(noi_id, scope=scope)
        if not noi:
            raise ValueError("NOI not found")

        upload_root = _upload_root()

        def _parse_json_list(raw):
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, list) else []
            except (TypeError, ValueError):
                return []

        def _attachment_paths(legacy_value, category: str) -> list:
            legacy = [u for u in _parse_json_list(legacy_value) if isinstance(u, str)]
            attachments = self.repo.db.query(models.Attachment).filter(
                models.Attachment.entity_type == "noi",
                models.Attachment.entity_id == noi_id,
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

        general_attachments = _attachment_paths(noi.attachments, "attachment")

        doc = db.new_document()
        db.add_masthead(
            doc, "檢驗通知單", "NOTICE OF INSPECTION",
            doc_no=noi.referenceNo, status=noi.status,
        )

        db.add_field_grid(doc, [
            [("編號", "Reference No.", noi.referenceNo), ("承包商", "Contractor", noi.contractor)],
            [("NCR 編號", "NCR Reference", noi.ncrNumber), ("主旨", "Package", noi.package)],
            [("關聯 ITP", "Related ITP", noi.itpNo), ("檢驗點", "Checkpoint", noi.checkpoint)],
            [("發文日期", "Issue Date", noi.issueDate), ("檢驗日期", "Inspection Date", noi.inspectionDate)],
            [("到期日", "Due Date", noi.dueDate), ("檢驗時間", "Inspection Time", noi.inspectionTime)],
            [("事件編號", "Event No.", noi.eventNumber), ("結案日期", "Close-out Date", noi.closeoutDate)],
            [("聯絡人", "Contacts", noi.contacts), ("電話", "Phone", noi.phone)],
            [("Email", "Email", noi.email), ("狀態", "Status", noi.status)],
        ])

        if noi.remark:
            db.add_subsection_heading(doc, "備註", "Remark")
            db.add_field_box(doc, value=noi.remark)

        if general_attachments:
            db.add_file_list(doc, "附件 Attachments", general_attachments)

        db.add_sign_off_grid(doc, [
            {"num": "1", "zh": "製表", "en": "Prepared By"},
            {"num": "2", "zh": "複核", "en": "Reviewed By"},
            {"num": "3", "zh": "核准", "en": "Approved By"},
        ])

        return db.finalize_response(doc, noi.referenceNo or "NOI")
