"""
Audit Service

Business logic layer for Audit module
"""

import json
import logging
import re
import uuid
from typing import List, Optional

import models
import schemas
from repositories.audit_repository import AuditRepository
from core import strict_dates
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import begin_write_transaction, generate_reference_no, WorkflowEngine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_JSON_FIELDS = ("selected_templates", "custom_check_items")

# A new Audit may start in any status that still has a way forward. Closed / Void are dead ends ("Closed": [] / "Void": [])
# and an unknown status has no transitions at all, so a record created in one of them could never be edited or deleted.
_CREATE_STATUSES = tuple(s for s, nxt in WorkflowEngine.TRANSITIONS["Audit"].items() if nxt)
# ...and those same dead ends are read-only (AUDIT-HARDENING-B: Void locked like Closed, user decision 2026-10-09).
_LOCKED_STATUSES = tuple(s for s, nxt in WorkflowEngine.TRANSITIONS["Audit"].items() if not nxt)


# Word export (AUDIT-EXPORT-DOCX-2026-001): bilingual labels for the status and for a checklist item's result. An item
# without a status counts as pending, as in the wizard.
_STATUS_TEXT = {
    'Draft': '草稿 Draft', 'Planned': '計畫中 Planned', 'In Progress': '進行中 In Progress',
    'Completed': '已完成 Completed', 'Closed': '已關閉 Closed', 'Void': '作廢 Void',
}
_RESULT_TEXT = {'pass': '符合 Pass', 'fail': '不符合 Fail', 'pending': '注意／待改善 Attention'}
# Checklist detail table: #, clause no., clause & question, result, remarks, updated — 17.4 cm = A4 minus the margins.
_ITEM_COLUMN_WIDTHS_CM = (0.9, 1.7, 6.2, 2.3, 4.3, 2.0)
# Characters an XML 1.0 document cannot contain (python-docx raises ValueError on them).
_XML_UNSAFE = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]')


class AuditConflict(Exception):
    """The write collided with existing data (unique number / id, foreign key); the router answers 409."""


def _comparable(key, value):
    """Value as the Closed-lock should compare it: the JSON list fields are stored as JSON text but arrive parsed, and the
    wizard sends a stored NULL back as [] (list fields) or '' (every other field)."""
    if key in _JSON_FIELDS:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                return value
        return value if value is not None else []
    return value if value is not None else ''


class AuditService:
    """Service layer for Audit business logic"""

    def __init__(self, repo: AuditRepository):
        self.repo = repo

    def get_audits(self, skip: int = 0, limit: int = 100, project_id: str = None, scope=None) -> List[models.Audit]:
        """
        Get list of Audits

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            project_id: Optional project filter — narrows WITHIN `scope`, never replaces it
                (repo.get_all AND-combines both; see BACKLOG #28)

        Returns:
            List of Audit objects
        """
        return self.repo.get_all(skip, limit, project_id=project_id, scope=scope)

    def get_audit(self, audit_id: str, scope=None) -> Optional[models.Audit]:
        """
        Get a single Audit by ID

        Args:
            audit_id: Audit identifier

        Returns:
            Audit object if found, None otherwise
        """
        obj = self.repo.get_by_id(audit_id)
        return obj if record_in_scope(obj, scope) else None

    def create_audit(
        self,
        audit: schemas.AuditCreate,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        scope=None
    ) -> models.Audit:
        """
        Create a new Audit

        Args:
            audit: Audit creation schema
            user_id: User ID performing the action
            username: Username performing the action

        Returns:
            Created Audit object
        """
        if audit.status not in _CREATE_STATUSES:
            raise ValueError(
                f"A new Audit cannot be created with status '{audit.status}'. "
                f"Allowed: {', '.join(_CREATE_STATUSES)}."
            )

        # Start from the full schema dump so that future fields flow through
        # automatically instead of silently being dropped by a hand-maintained
        # field list. Then stamp the server-controlled fields on top.
        audit_data = audit.model_dump()

        # Final content validated before the write lock / any reference number.
        strict_dates.validate_date_write(
            audit_data, strict_dates.AUDIT_DATE_FIELDS,
            required=strict_dates.AUDIT_REQUIRED_DATE_FIELDS, relations=strict_dates.AUDIT_ORDER_RELATIONS,
        )

        audit_data["id"] = str(uuid.uuid4())  # never the client's: a reused id used to fail the insert with a 500
        audit_data["vendor_id"] = self._resolve_vendor_id(audit.contractor)
        for json_field in _JSON_FIELDS:
            value = audit_data.get(json_field)
            if isinstance(value, list):
                audit_data[json_field] = json.dumps(value)

        # P0 data isolation: confine the new record to the caller's scope
        # (forces vendor_id for contractor users; validates project_id).
        enforce_create_scope(audit_data, scope)

        # A contractor-scoped caller's audit is forced onto ITS contractor (vendor_id above); make the contractor
        # name — and so the number prefix generated from it — match, instead of whatever name the client sent.
        if scope is not None and scope.vendor_id is not None:
            own = self.repo.db.query(models.Contractor).filter(models.Contractor.id == scope.vendor_id).first()
            if own is not None:
                audit_data["contractor"] = own.name

        db = self.repo.db
        try:
            # From here on everything is written in ONE transaction: take the write lock before the
            # sequence is read (see begin_write_transaction), so two creates can't draw the same number.
            begin_write_transaction(db)

            # Always auto-generate auditNo server-side (ignore any value from frontend)
            audit_data["auditNo"] = generate_reference_no(db, audit_data.get("contractor") or '', 'audit')

            db_audit = self.repo.create(audit_data)

            self._log_audit(
                action="CREATE",
                entity_type="Audit",
                entity_id=db_audit.id,
                entity_no=db_audit.auditNo,
                new_value=audit_data,
                user_id=user_id,
                username=username
            )

            # Audit + reference sequence + audit log: ONE commit
            db.commit()
        except IntegrityError as e:
            db.rollback()
            logger.warning(f"Audit create rejected by the database: {e.orig}")
            raise AuditConflict("The audit could not be saved because it conflicts with existing data.") from e
        except Exception:
            db.rollback()  # releases the write lock; nothing of this create survives
            raise
        db.refresh(db_audit)
        return db_audit

    def update_audit(
        self,
        audit_id: str,
        audit: schemas.AuditUpdate,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        scope=None
    ) -> Optional[models.Audit]:
        """
        Update an existing Audit

        Args:
            audit_id: Audit identifier
            audit: Audit update schema
            user_id: User ID performing the action
            username: Username performing the action

        Returns:
            Updated Audit object if found, None otherwise
        """
        db_audit = self.repo.get_by_id(audit_id)
        if not db_audit or not record_in_scope(db_audit, scope):
            return None

        update_data = audit.model_dump(exclude_unset=True)
        # auditNo is assigned once at create and never changes: FollowUps link to an audit by it, and a blank or
        # duplicate value used to be written straight through (the wizard resent '' on its second save).
        update_data.pop("auditNo", None)

        # Validate status transition if status is being changed
        if 'status' in update_data and update_data['status'] != db_audit.status:
            if not WorkflowEngine.validate_transition("Audit", db_audit.status, update_data['status']):
                raise ValueError(
                    f"Invalid status transition from '{db_audit.status}' to '{update_data['status']}'"
                )

        # Store old values for audit log
        old_value = {c.name: getattr(db_audit, c.name) for c in db_audit.__table__.columns}

        # Guard: Closed and Void Audits are true dead ends — WorkflowEngine's
        # Audit transitions (core/utils.py) define "Closed": [] and "Void": [],
        # no reopen path exists at all (same shape as NOI). Safe to lock
        # unconditionally (no permission escape hatch) since there's no
        # legitimate "reopen and edit" flow to accidentally break; a Void
        # audit can still be deleted (delete_audit). Compare against the
        # DB's current values, not mere key-presence, since the frontend
        # resends the whole record on every save.
        if db_audit.status in _LOCKED_STATUSES:
            changed_fields = {
                k for k, v in update_data.items()
                if _comparable(k, v) != _comparable(k, old_value.get(k))
            }
            if changed_fields:
                raise ValueError(
                    f"Cannot modify Audit '{db_audit.auditNo}' with status '{db_audit.status}' — "
                    f"no fields can be changed once an audit is closed or void."
                )
            return db_audit  # an unchanged resave: nothing to write, no audit-log row

        # Date rules on the merged final content, before anything is written. Only fields whose value changes are
        # checked, so re-sending a historical value unchanged never blocks an unrelated edit.
        date_fields = strict_dates.AUDIT_DATE_FIELDS
        strict_dates.validate_date_write(
            {f: update_data[f] if f in update_data else getattr(db_audit, f, None) for f in date_fields},
            date_fields,
            stored={f: getattr(db_audit, f, None) for f in date_fields},
            provided=set(update_data) & set(date_fields),
            required=strict_dates.AUDIT_REQUIRED_DATE_FIELDS,
            relations=strict_dates.AUDIT_ORDER_RELATIONS,
        )

        processed_data = {}

        for key, value in update_data.items():
            if key in _JSON_FIELDS:
                processed_data[key] = json.dumps(value) if isinstance(value, list) else value
            else:
                processed_data[key] = value

        db = self.repo.db
        try:
            # Re-resolve vendor_id if contractor changed
            if "contractor" in update_data:
                processed_data["vendor_id"] = self._resolve_vendor_id(update_data["contractor"])

                # Only assign an auditNo if the record has none (a row blanked by the old resave bug):
                # initial assignment when a contractor is set, never a renumbering on contractor changes.
                new_contractor = update_data["contractor"]
                if new_contractor and not db_audit.auditNo:
                    begin_write_transaction(db)
                    processed_data["auditNo"] = generate_reference_no(db, new_contractor, 'audit')
                    logger.info(f"Assigned new auditNo {processed_data['auditNo']} (first contractor assignment)")

            enforce_update_scope(processed_data, scope)

            # Update the audit
            updated_audit = self.repo.update(audit_id, processed_data)

            # Log the update
            self._log_audit(
                action="UPDATE",
                entity_type="Audit",
                entity_id=audit_id,
                entity_no=updated_audit.auditNo,
                old_value=old_value,
                new_value=update_data,
                user_id=user_id,
                username=username
            )

            db.commit()
        except IntegrityError as e:
            db.rollback()
            logger.warning(f"Audit update rejected by the database: {e.orig}")
            raise AuditConflict("The audit could not be saved because it conflicts with existing data.") from e
        except Exception:
            db.rollback()
            raise
        db.refresh(updated_audit)
        return updated_audit

    def delete_audit(
        self,
        audit_id: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        scope=None
    ) -> bool:
        """
        Delete an Audit

        Args:
            audit_id: Audit identifier
            user_id: User ID performing the action
            username: Username performing the action

        Returns:
            True if deleted, False if not found
        """
        db_audit = self.repo.get_by_id(audit_id)
        if not db_audit or not record_in_scope(db_audit, scope):
            return False

        # Only Void Audits can be deleted — same precedent as NCR
        # (ncr_service.py::delete_ncr). A Closed Audit is explicitly a "true
        # dead end" in update_audit above (no reopen path); deleting it
        # outright would let that unconditional edit-lock be bypassed
        # entirely by just removing the record instead of changing it.
        if db_audit.status != 'Void':
            raise ValueError(
                f"Cannot delete Audit '{db_audit.auditNo}' with status '{db_audit.status}'. "
                f"Please Void the Audit first, then delete."
            )

        # Log the deletion
        self._log_audit(
            action="DELETE",
            entity_type="Audit",
            entity_id=audit_id,
            entity_no=db_audit.auditNo,
            old_value={"id": audit_id, "auditNo": db_audit.auditNo},
            user_id=user_id,
            username=username
        )

        # Delete the audit
        success = self.repo.delete(audit_id)
        self.repo.db.commit()
        return success

    def export_docx(self, audit_id: str, scope=None):
        """
        Formal .docx report for one Audit (AUDIT-EXPORT-DOCX-2026-001): the whole audit in one file — plan (information,
        team, scope & criteria), checklist results, findings, sign-off — in the NCR report layout, built with the shared
        core/docx_builder.py primitives.

        Returns a StreamingResponse, or None when the audit does not exist or is outside the caller's scope (→ 404).
        """
        from docx.shared import Cm
        from core import docx_builder as db

        audit = self.get_audit(audit_id, scope=scope)
        if audit is None:
            return None

        def txt(value):
            # Stored free text may hold characters an XML document cannot carry (control characters, lone surrogates from
            # JSON "\\ud800" escapes); python-docx refuses those with a ValueError, so drop them instead of failing the export.
            if value is None:
                return None
            text = _XML_UNSAFE.sub('', str(value))
            return text if text.strip() else None

        def json_list(raw):
            if isinstance(raw, list):
                return raw
            try:
                parsed = json.loads(raw) if raw else []
            except (TypeError, ValueError):
                return []
            return parsed if isinstance(parsed, list) else []

        def status_key(item):
            # custom_check_items is free JSON (schemas: Any): a status that is a list / object is not hashable and must
            # not break the lookup — anything that is not a string counts as pending, as in the wizard.
            status = item.get('status')
            return status if isinstance(status, str) else None

        project = None
        if audit.project_id:
            project = self.repo.db.query(models.Project).filter(models.Project.id == audit.project_id).first()
        if project is not None:
            project_label = f"[{project.code}] {project.name}" if project.code else project.name
        else:
            project_label = audit.project_name
        contractor = audit.contractor or (audit.vendor_ref.name if audit.vendor_ref else None)
        templates = [t for t in json_list(audit.selected_templates) if isinstance(t, str) and t.strip()]
        items = [i for i in json_list(audit.custom_check_items) if isinstance(i, dict)]

        # Same counting as the wizard's statistics cards: anything that is not pass / fail (incl. no status) is pending.
        total = len(items)
        passed = sum(1 for i in items if i.get('status') == 'pass')
        failed = sum(1 for i in items if i.get('status') == 'fail')
        pending = total - passed - failed
        progress = 0 if total == 0 else round((total - pending) / total * 100)

        doc = db.new_document()
        db.add_masthead(doc, "內部稽核報告", "INTERNAL AUDIT REPORT", doc_no=txt(audit.auditNo), status=txt(audit.status))

        # 1. Audit information
        db.add_section_heading(doc, "1", "稽核資訊", "Audit Information")
        db.add_field_grid(doc, [
            [("稽核編號", "Audit No.", txt(audit.auditNo)),
             ("狀態", "Status", _STATUS_TEXT.get(audit.status) or txt(audit.status))],
            [("稽核標題", "Audit Title", txt(audit.title))],
            [("專案", "Project", txt(project_label)), ("受稽核廠商", "Auditee / Contractor", txt(contractor))],
            [("開始日期", "Start Date", txt(audit.date)), ("結束日期", "End Date", txt(audit.end_date))],
            [("稽核地點", "Location", txt(audit.location))],
        ])

        # 2. Audit team
        db.add_section_heading(doc, "2", "稽核團隊", "Audit Team")
        db.add_field_grid(doc, [
            [("專案經理", "Project Director", txt(audit.project_director)),
             ("工作包／技術負責人", "Package / Tech. Lead", txt(audit.tech_lead))],
            [("主任稽核員", "Lead Auditor", txt(audit.auditor)),
             ("協同稽核員", "Support Auditor(s)", txt(audit.support_auditors))],
        ])

        # 3. Scope & criteria
        db.add_section_heading(doc, "3", "稽核範圍與準則", "Scope & Criteria")
        db.add_field_grid(doc, [
            [("稽核準則", "Audit Criteria", txt(audit.audit_criteria))],
            [("選用模板", "Templates", txt("、".join(templates)))],
        ])
        db.add_subsection_heading(doc, "3.1 範圍描述", "Audit Scope")
        db.add_field_box(doc, txt(audit.scope_description), guide="說明本次稽核涵蓋之部門、流程、作業與地點")

        # 4. Checklist results
        db.add_section_heading(doc, "4", "查檢結果", "Checklist Results")
        db.add_field_grid(doc, [
            [("查檢項目數", "Total Items", str(total)), ("完成率", "Progress", f"{progress}%")],
            [("符合", "Pass", str(passed)), ("不符合", "Fail", str(failed))],
            [("注意／待改善", "Attention / Pending", str(pending))],
        ])
        db.add_subsection_heading(doc, "4.1 查檢明細", "Audit Items")
        if items:
            rows = []
            for n, item in enumerate(items, start=1):
                content = "\n".join(filter(None, [txt(item.get('clause')), txt(item.get('task'))]))
                rows.append([
                    str(n),
                    txt(item.get('no')) or db.DASH,
                    content or db.DASH,
                    _RESULT_TEXT.get(status_key(item), _RESULT_TEXT['pending']),
                    txt(item.get('note')) or db.DASH,
                    txt(item.get('updatedAt')) or db.DASH,
                ])
            table = db.add_data_table(doc, ["#", "條文編號\nClause No.", "條文與查檢重點\nClause & Audit Question",
                                            "結果\nResult", "備註\nRemarks", "更新日期\nUpdated"], rows)
            # Word gives every column the same width by default: a narrow "#", most of the room for the question.
            table.autofit = False
            for row in table.rows:
                for cell, width in zip(row.cells, _ITEM_COLUMN_WIDTHS_CM):
                    cell.width = Cm(width)
        else:
            db.add_paragraph(doc, "（尚無查檢項目 No audit items）", size=9, italic=True)

        # 5. Findings & summary
        db.add_section_heading(doc, "5", "稽核發現與總結", "Findings & Summary")
        db.add_field_box(doc, txt(audit.findings), guide="記錄稽核發現、不符合事項與總結", tall=True)

        # 6. Sign-off
        db.add_section_heading(doc, "6", "簽核", "Sign-off")
        db.add_sign_off_grid(doc, [
            {"num": "6.1", "zh": "主任稽核員", "en": "Lead Auditor", "name": txt(audit.auditor)},
            {"num": "6.2", "zh": "受稽核方代表", "en": "Auditee Representative"},
            {"num": "6.3", "zh": "專案經理", "en": "Project Director", "name": txt(audit.project_director)},
        ])

        return db.finalize_response(doc, txt(audit.auditNo) or "Audit")

    def _resolve_vendor_id(self, vendor_name: Optional[str]) -> Optional[str]:
        """
        Resolve vendor name to vendor ID

        Args:
            vendor_name: Contractor/vendor name

        Returns:
            Vendor ID if found, None otherwise
        """
        if not vendor_name:
            return None

        contractor = (
            self.repo.db.query(models.Contractor)
            .filter(models.Contractor.name == vendor_name)
            .first()
        )
        return contractor.id if contractor else None

    def _log_audit(
        self,
        action: str,
        entity_type: str,
        entity_id: str,
        entity_no: str,
        old_value=None,
        new_value=None,
        user_id: Optional[int] = None,
        username: Optional[str] = None
    ):
        """
        Log audit trail

        Args:
            action: Action type (CREATE, UPDATE, DELETE)
            entity_type: Type of entity (e.g., "Audit")
            entity_id: Entity identifier
            entity_no: Entity number (e.g., audit number)
            old_value: Old value (for UPDATE/DELETE)
            new_value: New value (for CREATE/UPDATE)
            user_id: User ID performing the action
            username: Username performing the action
        """
        from datetime import datetime

        audit_log = models.AuditLog(
            timestamp=datetime.now().isoformat(),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_no,
            old_value=json.dumps(old_value) if old_value else None,
            new_value=json.dumps(new_value) if new_value else None,
            user_id=user_id,
            username=username
        )
        self.repo.db.add(audit_log)
        self.repo.db.flush()
