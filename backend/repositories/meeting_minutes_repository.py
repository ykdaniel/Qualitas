"""
Meeting Minutes Repository

Data access layer for the Meeting Minutes module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.scope import apply_scope
from core.utils import sanitize_pagination, sanitize_search_term


class MeetingMinutesRepository:
    """Repository for Meeting Minutes data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, meeting_id: str) -> Optional[models.MeetingMinutes]:
        """Get Meeting Minutes by ID with preloaded relationships"""
        return (self.db.query(models.MeetingMinutes)
                .options(joinedload(models.MeetingMinutes.vendor_ref))
                .filter(models.MeetingMinutes.id == meeting_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, project_id: str = None, scope=None, **filters) -> List[models.MeetingMinutes]:
        """Get all Meeting Minutes records with optional filters"""
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.MeetingMinutes).options(joinedload(models.MeetingMinutes.vendor_ref))
        if project_id:
            query = query.filter(models.MeetingMinutes.project_id == project_id)

        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.MeetingMinutes.documentNumber.ilike(f"%{search_term}%")) |
                    (models.MeetingMinutes.title.ilike(f"%{search_term}%"))
                )
        if filters.get('status'):
            query = query.filter(models.MeetingMinutes.status == filters['status'])
        if filters.get('start_date'):
            query = query.filter(models.MeetingMinutes.meetingDate >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.MeetingMinutes.meetingDate <= filters['end_date'])

        # P0 data isolation: restrict to the caller's project/contractor scope.
        query = apply_scope(query, models.MeetingMinutes, scope)

        return query.offset(skip).limit(limit).all()

    def create(self, meeting: models.MeetingMinutes) -> models.MeetingMinutes:
        """Create a new Meeting Minutes record"""
        self.db.add(meeting)
        self.db.commit()
        self.db.refresh(meeting)
        return meeting

    def update(self, meeting: models.MeetingMinutes, update_data: dict) -> models.MeetingMinutes:
        """Update an existing Meeting Minutes record"""
        for key, value in update_data.items():
            setattr(meeting, key, value)
        self.db.commit()
        self.db.refresh(meeting)
        return meeting

    def delete(self, meeting: models.MeetingMinutes):
        """Delete a Meeting Minutes record"""
        self.db.delete(meeting)
        self.db.commit()
