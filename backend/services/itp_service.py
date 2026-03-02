import uuid
import logging
from typing import List, Optional
from fastapi import HTTPException
import models
import schemas
from repositories.itp_repository import ITPRepository
from core.utils import _json_serialize, _resolve_vendor_id, generate_reference_no, log_audit, WorkflowEngine
from core import error_messages

logger = logging.getLogger(__name__)

class ITPService:
    def __init__(self, repo: ITPRepository):
        self.repo = repo

    def get_itps(self, skip: int = 0, limit: int = 100, search: str = None, status: str = None, start_date: str = None, end_date: str = None) -> List[models.ITP]:
        return self.repo.get_all(skip=skip, limit=limit, search=search, status=status, start_date=start_date, end_date=end_date)

    def get_itp(self, itp_id: str) -> Optional[models.ITP]:
        return self.repo.get_by_id(itp_id)

    def create_itp(self, itp_create: schemas.ITPCreate, user_id: int = None, username: str = None) -> models.ITP:
        try:
            data = _json_serialize(itp_create.dict(), ['attachments', 'detail_data'])

            # Handle Vendor Name -> ID mapping
            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Generate Reference No
            if not data.get('referenceNo'):
                data['referenceNo'] = generate_reference_no(self.repo.db, vendor_name or '', 'ITP')

            db_itp = models.ITP(**data)
            if not db_itp.id:
                db_itp.id = str(uuid.uuid4())
            
            created_itp = self.repo.create(db_itp)

            log_audit(
                self.repo.db, "CREATE", "ITP", created_itp.id, created_itp.referenceNo,
                new_value=itp_create.dict(), user_id=user_id, username=username
            )

            return created_itp
        except Exception as e:
            logger.error(f"Error creating ITP: {e}", exc_info=True)
            raise e

    def update_itp(self, itp_id: str, itp_update: schemas.ITPUpdate, user_id: int = None, username: str = None) -> Optional[models.ITP]:
        try:
            db_itp = self.repo.get_by_id(itp_id)
            if not db_itp:
                return None

            # State transition check
            if itp_update.status and not WorkflowEngine.validate_transition("ITP", db_itp.status, itp_update.status):
                raise ValueError(error_messages.invalid_status_transition("ITP", db_itp.status, itp_update.status))

            old_val = {c.name: getattr(db_itp, c.name) for c in db_itp.__table__.columns}
            d = itp_update.dict(exclude_unset=True)
            d = _json_serialize(d, ['attachments', 'detail_data'])

            # Handle Vendor Name -> ID mapping
            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            updated_itp = self.repo.update(db_itp, d)

            log_audit(
                self.repo.db, "UPDATE", "ITP", itp_id, updated_itp.referenceNo,
                old_value=old_val, new_value=itp_update.dict(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated_itp
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating ITP {itp_id}: {e}", exc_info=True)
            raise e

    def delete_itp(self, itp_id: str, user_id: int = None, username: str = None) -> bool:
        try:
            db_itp = self.repo.get_by_id(itp_id)
            if not db_itp:
                return False

            # Check for NOI references before deletion
            noi_count = self.repo.db.query(models.NOI).filter(
                models.NOI.itpNo == db_itp.referenceNo
            ).count()
            if noi_count > 0:
                raise ValueError(error_messages.cannot_delete_has_references(
                    "ITP", db_itp.referenceNo, [f"{noi_count} NOI record(s)"]
                ))

            old_val = {c.name: getattr(db_itp, c.name) for c in db_itp.__table__.columns}

            self.repo.delete(db_itp)
            
            log_audit(
                self.repo.db, "DELETE", "ITP", itp_id, db_itp.referenceNo,
                old_value=old_val, user_id=user_id, username=username
            )
            return True
        except Exception as e:
            logger.error(f"Error deleting ITP {itp_id}: {e}", exc_info=True)
            raise e

    def update_itp_detail(self, itp_id: str, detail_body: dict, user_id: int = None, username: str = None) -> Optional[models.ITP]:
        try:
            db_itp = self.repo.get_by_id(itp_id)
            if not db_itp:
                return None
            
            import json
            old_val = db_itp.detail_data
            
            update_data = {
                "detail_data": json.dumps(detail_body) if detail_body else None
            }
            
            updated_itp = self.repo.update(db_itp, update_data)

            log_audit(
                self.repo.db, "UPDATE_DETAIL", "ITP", itp_id, updated_itp.referenceNo,
                old_value=old_val, new_value=detail_body,
                user_id=user_id, username=username
            )

            return updated_itp
        except Exception as e:
            logger.error(f"Error updating ITP detail {itp_id}: {e}", exc_info=True)
            raise e
