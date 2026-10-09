"""
ITR (Inspection and Test Record) Repository

Data access layer for ITR module
"""

from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy import asc, desc, func
from sqlalchemy.orm import Session, joinedload

import models
from core.scope import apply_scope
from core.utils import sanitize_pagination, sanitize_search_term


class ITRRepository:
    """Repository for ITR data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get ITR by ID with preloaded relationships

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object if found, None otherwise
        """
        return (self.db.query(models.ITR)
                .options(
                    joinedload(models.ITR.vendor_ref),
                    joinedload(models.ITR.noi_ref)
                )
                .filter(models.ITR.id == itr_id)
                .first())

    def get_with_checklists(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get ITR by ID with Checklist relationships preloaded

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object with checklists if found, None otherwise
        """
        return (self.db.query(models.ITR)
                .options(
                    joinedload(models.ITR.vendor_ref),
                    joinedload(models.ITR.noi_ref),
                    joinedload(models.ITR.checklists)
                )
                .filter(models.ITR.id == itr_id)
                .first())

    # NOTE: Return type changed from List[models.ITR] to Tuple[List[models.ITR], int].
    # Callers must be updated to unpack (items, total_count).
    def get_all(
        self,
        skip: int = 0,
        limit: int = 500,
        vendor_id: Optional[str] = None,
        noi_number: Optional[str] = None,
        sort_by: str = "raiseDate",
        sort_order: str = "desc",
        project_id: Optional[str] = None,
        scope=None,
        **filters,
    ) -> Tuple[List[models.ITR], int]:
        """
        Get all ITRs with optional filters

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            vendor_id: Optional vendor ID filter
            noi_number: Optional NOI reference number filter
            sort_by: Column to sort by (raiseDate, documentNumber, status, dueDate, closeoutDate)
            sort_order: Sort direction ("asc" or "desc")
            project_id: Optional project ID filter
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            Tuple of (list of ITR objects, total count before pagination)
        """
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.ITR).options(
            joinedload(models.ITR.vendor_ref)
        )
        if project_id:
            query = query.filter(models.ITR.project_id == project_id)

        # Search filter (documentNumber, subject)
        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.ITR.documentNumber.ilike(f"%{search_term}%")) |
                    (models.ITR.subject.ilike(f"%{search_term}%"))
                )

        # Status filter
        if filters.get('status'):
            query = query.filter(models.ITR.status == filters['status'])

        # Vendor filter
        if vendor_id:
            query = query.filter(models.ITR.vendor_id == vendor_id)

        # NOI number filter
        if noi_number:
            query = query.filter(models.ITR.noiNumber == noi_number)

        # Date range filters
        if filters.get('start_date'):
            query = query.filter(models.ITR.raiseDate >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.ITR.raiseDate <= filters['end_date'])

        # P0 data isolation: restrict to the caller's project/contractor scope.
        # Applied BEFORE the count so total_count reflects the scoped result set.
        query = apply_scope(query, models.ITR, scope)

        # Total count before pagination
        total_count = query.count()

        # Sorting
        sortable_columns = {
            "raiseDate": models.ITR.raiseDate,
            "documentNumber": models.ITR.documentNumber,
            "status": models.ITR.status,
            "dueDate": models.ITR.dueDate,
            "closeoutDate": models.ITR.closeoutDate,
        }
        sort_column = sortable_columns.get(sort_by, models.ITR.raiseDate)
        order_func = desc if sort_order.lower() == "desc" else asc
        query = query.order_by(order_func(sort_column))

        return query.offset(skip).limit(limit).all(), total_count

    def get_stats(self, project_id: Optional[str] = None, scope=None,
                  vendor_id: Optional[str] = None) -> Dict[str, int]:
        """Return ITR statistics by status + overdue count.

        The caller's data-isolation ``scope`` is applied ONCE, to the base query every figure below
        (total, each status, overdue) is derived from — the same ``apply_scope`` the ITR list uses
        (2026-09-20: it used to be missing, so every account got the whole-system totals).
        ``project_id`` / ``vendor_id`` are optional and can only NARROW further (they are AND-ed on
        top of the scope); they can never widen it. ``scope=None`` keeps the old unscoped behaviour
        for internal callers; the HTTP route always passes the caller's scope.
        """
        today = datetime.now().strftime("%Y-%m-%d")

        base_query = apply_scope(self.db.query(func.count(models.ITR.id)), models.ITR, scope)
        if project_id:
            base_query = base_query.filter(models.ITR.project_id == project_id)
        if vendor_id:
            base_query = base_query.filter(models.ITR.vendor_id == vendor_id)

        total = base_query.scalar()
        in_progress = (
            base_query.filter(models.ITR.status == "In Progress")
            .scalar()
        )
        approved = (
            base_query.filter(models.ITR.status == "Approved")
            .scalar()
        )
        rejected = (
            base_query.filter(models.ITR.status == "Reject")
            .scalar()
        )
        void = (
            base_query.filter(models.ITR.status == "Void")
            .scalar()
        )
        overdue = (
            base_query.filter(
                models.ITR.status.notin_(["Approved", "Void"]),
                models.ITR.dueDate.isnot(None),
                models.ITR.dueDate < today,
            )
            .scalar()
        )

        return {
            "total": total or 0,
            "in_progress": in_progress or 0,
            "approved": approved or 0,
            "rejected": rejected or 0,
            "void": void or 0,
            "overdue": overdue or 0,
        }

    def create(self, itr: models.ITR, commit: bool = True) -> models.ITR:
        """
        Create a new ITR record

        Args:
            itr: ITR object to create
            commit: default True keeps the historical commit-immediately behaviour for
                every other caller. False = flush only (row inserted, state refreshed) and
                leave the transaction open, for a caller that must commit the row TOGETHER
                WITH its audit entry.

        Returns:
            Created ITR object with refreshed state
        """
        self.db.add(itr)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(itr)
        return itr

    def update(self, itr: models.ITR, update_data: dict, commit: bool = True) -> models.ITR:
        """
        Update an existing ITR record

        Args:
            itr: ITR object to update
            update_data: Dictionary of fields to update
            commit: default True keeps the historical commit-immediately
                behaviour for every other caller. False = flush only (values
                assigned, constraints checked, state refreshed) and leave the
                transaction open, for a caller that must commit the ITR change
                TOGETHER WITH its audit entry / approval event.

        Returns:
            Updated ITR object with refreshed state
        """
        for key, value in update_data.items():
            setattr(itr, key, value)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(itr)
        return itr

    def delete(self, itr: models.ITR, commit: bool = True):
        """
        Delete an ITR record

        Args:
            itr: ITR object to delete
            commit: default True = commit immediately (historical behaviour, other
                callers unaffected); False = flush only, the caller commits with its audit entry.
        """
        self.db.delete(itr)
        if commit:
            self.db.commit()
        else:
            self.db.flush()

    # §17: the old link_checklist() here mutated a (shared, cross-project)
    # template's itrId in place, which polluted the template. Linking now
    # creates an ITR-owned *instance copy* instead — see
    # ITRService.link_checklist / unlink_checklist.
