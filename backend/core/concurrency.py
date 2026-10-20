"""
Optimistic locking (OPTIMISTIC-LOCK-2026-001, DECISIONS 存檔的樂觀鎖：row_version).

Every editable record carries an integer `row_version` (KM articles: `version_no`). A save sends the version it was
read at; the write is accepted only while the stored version is still that one, and every accepted write adds 1:

    UPDATE <table> SET row_version = row_version + 1 WHERE id = :id AND row_version = :expected

No row changed = someone else saved first -> Refusal VERSION_CONFLICT (409 via core.refusals.refusal_http). The check
and the increment are ONE statement, so two concurrent saves of the same version can never both pass (on SQLite the
statement also takes the database write lock; the loser waits, then matches no row).

* Call it FIRST in the write transaction, after the record is loaded and scope-checked and BEFORE anything is changed
  on the ORM object. A later refusal rolls the increment back with everything else.
* A request without a version (an older page, a script): while the setting ROW_VERSION_REQUIRED is off (the default)
  it is still accepted and still increments, and is logged as "row_version missing: <table> <id>" so the remaining
  callers can be counted; once it is on, it is refused with Refusal VERSION_REQUIRED (400 via core.refusals.refusal_http)
  before anything is written (B5, DECISIONS 存檔的樂觀鎖 #3).
* Writes that carry no version by design (the ITR batch status change, the KM Word import, system writes) pass
  `exempt=True` or use `bump_row_version`: they increment, are never checked, logged or refused.
"""
import logging
from typing import Any, Optional

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from core.config import settings
from core.refusals import Refusal

logger = logging.getLogger(__name__)

MISSING_VERSION_LOG = "row_version missing: %s %s"


def _target(obj, column: str):
    mapper = obj.__mapper__
    table = mapper.local_table                     # the mapped table itself (not the instance attribute, which can be shadowed)
    pk_col = mapper.primary_key[0]
    pk_value = getattr(obj, mapper.get_property_by_column(pk_col).key)
    version_col = table.c[column]
    version_attr = mapper.get_property_by_column(version_col).key
    return table, pk_col, pk_value, version_col, version_attr


def claim_row_version(db: Session, obj: Any, expected: Optional[int], *, doc_type: str, number: Any,
                      column: str = "row_version", null_as: int = 0, refresh: bool = False,
                      exempt: bool = False) -> int:
    """Check `expected` against the stored version and add 1 in one conditional UPDATE; return the new version.

    `expected` None = the caller sent no version: refused with VERSION_REQUIRED when ROW_VERSION_REQUIRED is on,
    otherwise accepted, incremented and logged. `exempt=True` (a write without a version by design) is never refused
    or logged.
    A NULL stored version counts as `null_as` (KM's legacy rows count as 1). The object's version attribute is set to
    the new value without marking it dirty; `refresh=True` also re-reads the whole row (for a caller whose object was
    loaded before the write lock was taken)."""
    table, pk_col, pk_value, version_col, version_attr = _target(obj, column)
    current = func.coalesce(version_col, null_as)
    stmt = update(table).where(pk_col == pk_value)
    if expected is not None:
        stmt = stmt.where(current == expected)
    elif not exempt:
        if settings.ROW_VERSION_REQUIRED:
            raise Refusal(
                "VERSION_REQUIRED",
                f"{doc_type} {number} was not saved: this page sent no record version. Refresh the page, then save again.",
                docType=doc_type, number=number,
            )
        logger.warning(MISSING_VERSION_LOG, table.name, pk_value)
    result = db.execute(stmt.values({version_col: current + 1}))
    if result.rowcount == 0:
        stored = db.execute(select(current).where(pk_col == pk_value)).scalar()
        raise Refusal(
            "VERSION_CONFLICT",
            f"{doc_type} {number} was changed by someone else meanwhile (your version {expected}, "
            f"stored version {stored}). Reload it, then make your change again.",
            docType=doc_type, number=number,
        )
    new_version = db.execute(select(version_col).where(pk_col == pk_value)).scalar()
    if refresh:
        db.refresh(obj)
    else:
        set_committed_value(obj, version_attr, new_version)
    return new_version


def bump_row_version(db: Session, obj: Any, *, column: str = "row_version", null_as: int = 0) -> int:
    """Add 1 to the stored version without checking it (system and batch writes that carry no version by design)."""
    return claim_row_version(db, obj, None, doc_type="", number="", column=column, null_as=null_as, exempt=True)
