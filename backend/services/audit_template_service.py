"""
Audit template library (AUDIT-TEMPLATES-2026-001).

A template is a named list of check items ({id, no, title, clause, task}); in the wizard it is an audit type, and the
questions the auditor picks are COPIED into the audit's custom_check_items, so nothing here ever reaches into an existing
audit: editing or deactivating a template changes only what later picks copy. Templates are never hard-deleted (audits keep the name in selected_templates);
is_active=False hides one from the wizard.

Initial templates: the four names the wizard used to hard-code. ISO 9001:2015 starts with the company's checklist
(audit_template_iso9001_2015.json); the other three start empty for the user to fill in on the template management tab. They are written once by
db_migrations step 24 (flag audit_templates_initial_v1) and are ordinary rows after that.
"""
import json
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import schemas


class AuditTemplateConflict(Exception):
    """Another template already has this name (compared trimmed, case-insensitively)."""


# ISO 9001:2015 starts with the company's own checklist (supplied by the user 2026-10-11, 116 questions over clauses 4–10):
# no = clause number, title = the clause heading, clause = the requirement text, task = the audit question with the expected evidence as a last line
# "應備證據：…". Built from the pasted Excel by docs/workflow/AUDIT-TEMPLATES-2026-001-evidence/iso9001-source/
# parse_iso9001.py; item ids are fixed (iso9001-<clause>-<n>) so the seeded row is the same on every database.
ISO_9001_ITEMS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_template_iso9001_2015.json")


def _iso_9001_items():
    with open(ISO_9001_ITEMS_FILE, encoding="utf-8") as f:
        return json.load(f)


INITIAL_AUDIT_TEMPLATES = [
    {"name": "ISO 9001:2015", "version": "2015", "items": _iso_9001_items()},
    {"name": "ISO 45001", "version": "", "items": []},
    {"name": "品質管理程序書", "version": "", "items": []},
    {"name": "供應商評鑑表", "version": "", "items": []},
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _items_json(items):
    """Dump items, giving every item without an id a fresh one. An id the request repeats on two items is replaced on
    the second, so templateItemId stays unique inside a template."""
    seen, out = set(), []
    for it in items:
        d = it.model_dump()
        if not d.get("id") or d["id"] in seen:
            d["id"] = uuid.uuid4().hex
        seen.add(d["id"])
        out.append({"id": d["id"], "no": d["no"], "title": d["title"], "clause": d["clause"], "task": d["task"]})
    return json.dumps(out, ensure_ascii=False)


class AuditTemplateService:
    def __init__(self, db: Session):
        self.db = db

    def list_templates(self, include_inactive: bool = False):
        q = self.db.query(models.AuditTemplate)
        if not include_inactive:
            q = q.filter(models.AuditTemplate.is_active.is_(True))
        return q.order_by(models.AuditTemplate.id).all()

    def _check_name_free(self, name, exclude_id=None):
        q = self.db.query(models.AuditTemplate).filter(func.lower(func.trim(models.AuditTemplate.name)) == name.strip().lower())
        if exclude_id is not None:
            q = q.filter(models.AuditTemplate.id != exclude_id)
        if q.first():
            raise AuditTemplateConflict(f"A template named '{name}' already exists.")

    def _log(self, action, tpl, old, new, user_id, username):
        self.db.add(models.AuditLog(
            timestamp=datetime.now().isoformat(), action=action, entity_type="AuditTemplate", entity_id=str(tpl.id),
            entity_name=tpl.name, old_value=json.dumps(old, ensure_ascii=False) if old else None,
            new_value=json.dumps(new, ensure_ascii=False) if new else None, user_id=user_id, username=username))

    def _commit(self, name):
        try:
            self.db.commit()
        except IntegrityError:  # a concurrent save took the name between the check and the commit (unique index)
            self.db.rollback()
            raise AuditTemplateConflict(f"A template named '{name}' already exists.")

    @staticmethod
    def _snapshot(tpl):
        try:  # lenient like the read schema: a hand-edited row must not turn an edit into a 500
            items = json.loads(tpl.items or "[]")
        except (TypeError, ValueError):
            items = tpl.items
        return {"name": tpl.name, "description": tpl.description, "version": tpl.version, "is_active": tpl.is_active,
                "items": items}

    def create_template(self, data: schemas.AuditTemplateCreate, user_id=None, username=None):
        self._check_name_free(data.name)
        now = _now()
        tpl = models.AuditTemplate(name=data.name, description=data.description or "", version=data.version or "",
                                   is_active=data.is_active, items=_items_json(data.items), created_at=now, updated_at=now)
        self.db.add(tpl)
        self.db.flush()
        self._log("CREATE", tpl, None, self._snapshot(tpl), user_id, username)
        self._commit(data.name)
        self.db.refresh(tpl)
        return tpl

    def update_template(self, template_id: int, data: schemas.AuditTemplateUpdate, user_id=None, username=None):
        tpl = self.db.get(models.AuditTemplate, template_id)
        if tpl is None:
            return None
        old = self._snapshot(tpl)
        fields = data.model_dump(exclude_unset=True)
        if fields.get("name") is not None:
            self._check_name_free(fields["name"], exclude_id=tpl.id)
            tpl.name = fields["name"]
        if "description" in fields:
            tpl.description = fields["description"] or ""
        if "version" in fields:
            tpl.version = fields["version"] or ""
        if fields.get("is_active") is not None:
            tpl.is_active = fields["is_active"]
        if data.items is not None:
            tpl.items = _items_json(data.items)
        new = self._snapshot(tpl)
        if new == old:
            return tpl
        tpl.updated_at = _now()
        self._log("UPDATE", tpl, old, new, user_id, username)
        self._commit(tpl.name)
        self.db.refresh(tpl)
        return tpl
