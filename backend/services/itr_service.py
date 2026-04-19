"""
ITR (Inspection and Test Record) Service

Business logic layer for ITR module
"""

import json
import uuid
import logging
from datetime import datetime
from typing import List, Optional

import models
import schemas
from repositories.itr_repository import ITRRepository
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)


class ITRService:
    """Service layer for ITR business logic"""

    def __init__(self, repo: ITRRepository):
        self.repo = repo

    def get_itrs(self, skip: int = 0, limit: int = 500, **filters) -> List[models.ITR]:
        """
        Get list of ITRs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of ITR objects
        """
        items, _total = self.repo.get_all(skip, limit, **filters)
        return items

    def get_itr(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get a single ITR by ID

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object if found, None otherwise
        """
        return self.repo.get_by_id(itr_id)

    def get_itr_with_checklists(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get ITR with associated Checklists

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object with checklists if found, None otherwise
        """
        return self.repo.get_with_checklists(itr_id)

    def create_itr(self, itr_create: schemas.ITRCreate,
                   user_id: int = None, username: str = None) -> models.ITR:
        """
        Create a new ITR with business logic validation

        Business logic:
        - Maps vendor name to vendor_id
        - Generates Reference No (documentNumber) automatically if not provided
        - Serializes JSON fields (defectPhotos, improvementPhotos, attachments)
        - Logs audit trail

        Args:
            itr_create: ITR creation schema
            user_id: ID of user creating the ITR
            username: Username of user creating the ITR

        Returns:
            Created ITR object

        Raises:
            Exception: If creation fails
        """
        try:
            # Serialize JSON fields
            data = _json_serialize(
                itr_create.model_dump(),
                ['defectPhotos', 'improvementPhotos', 'attachments']
            )

            # Handle vendor name -> vendor_id mapping
            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Validate foreign keys BEFORE allocating a reference number,
            # so failed creates don't leave gaps in the ITR sequence.
            if data.get('noiNumber'):
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == data['noiNumber']
                ).first()
                if not noi:
                    raise ValueError(f"NOI with reference number '{data['noiNumber']}' not found")

            if data.get('ncrNumber'):
                ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == data['ncrNumber']
                ).first()
                if not ncr:
                    raise ValueError(f"NCR with document number '{data['ncrNumber']}' not found")

            # Generate Reference No automatically if not provided
            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'ITR'
                )

            # Create ITR object
            db_itr = models.ITR(**data)
            if not db_itr.id:
                db_itr.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_itr)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "ITR", created.id, created.documentNumber,
                new_value=itr_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating ITR: {e}", exc_info=True)
            raise e

    def _get_detail_data_dict(self, db_itr: models.ITR) -> dict:
        """Parse detail_data JSON from an ITR into a dict (empty dict if None/invalid)."""
        if not db_itr.detail_data:
            return {}
        if isinstance(db_itr.detail_data, dict):
            return db_itr.detail_data
        try:
            parsed = json.loads(db_itr.detail_data)
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def _validate_approval(self, itr_id: str) -> None:
        """
        Validate that an ITR can transition to 'Approved'.

        Rules:
        - Must have at least one linked checklist
        - No linked checklist may have status == 'Fail'

        Raises:
            ValueError: If approval requirements are not met
        """
        checklists = (
            self.repo.db.query(models.Checklist)
            .filter(models.Checklist.itrId == itr_id)
            .all()
        )

        if not checklists:
            raise ValueError("Cannot approve ITR without any linked checklists")

        failed = [cl.recordsNo for cl in checklists if cl.status == "Fail"]
        if failed:
            raise ValueError(
                f"Cannot approve ITR with failed checklists: {', '.join(failed)}"
            )

    def update_itr(self, itr_id: str, itr_update: schemas.ITRUpdate,
                   user_id: int = None, username: str = None) -> Optional[models.ITR]:
        """
        Update an existing ITR with validation

        Business logic:
        - Validates status transitions using WorkflowEngine
        - Validates approval prerequisites (checklists)
        - Auto-sets closeoutDate on approval
        - Optimistic locking via _version in detail_data
        - Maps vendor name to vendor_id
        - Serializes JSON fields
        - Logs audit trail

        Args:
            itr_id: ITR identifier
            itr_update: ITR update schema
            user_id: ID of user updating the ITR
            username: Username of user updating the ITR

        Returns:
            Updated ITR object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid, approval validation
                        fails, or optimistic lock conflict detected
            Exception: If update fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                return None

            # --- Optimistic locking via _version in detail_data ---
            d = itr_update.model_dump(exclude_unset=True)
            existing_detail = self._get_detail_data_dict(db_itr)
            db_version = existing_detail.get("_version", 0)

            # The client may send _version inside detail_data (JSON string or dict)
            incoming_detail = d.get("detail_data")
            incoming_version = None
            if incoming_detail is not None:
                if isinstance(incoming_detail, str):
                    try:
                        incoming_detail = json.loads(incoming_detail)
                    except (json.JSONDecodeError, TypeError):
                        incoming_detail = None
                if isinstance(incoming_detail, dict):
                    incoming_version = incoming_detail.pop("_version", None)

            if incoming_version is not None and incoming_version != db_version:
                raise ValueError(
                    f"Optimistic lock conflict: expected version {incoming_version}, "
                    f"but current version is {db_version}. "
                    f"Another user may have modified this record."
                )

            # Workflow validation: Check status transition
            if itr_update.status and not WorkflowEngine.validate_transition(
                "ITR", db_itr.status, itr_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_itr.status} to {itr_update.status}"
                )

            # --- Approval validation: require passing checklists ---
            if d.get('status') == 'Approved' and db_itr.status != 'Approved':
                self._validate_approval(itr_id)

            # 勾稽鎖定：Approved 狀態的 ITR 只允許 Publish（變更 type/status）或轉為 Reject/Void
            # 任何其他欄位更新均被阻擋，以防止已批准記錄被竄改
            if db_itr.status == 'Approved':
                allowed_keys = {'type', 'status', 'detail_data'}
                update_keys = set(d.keys())
                blocked = update_keys - allowed_keys
                if blocked:
                    raise ValueError(
                        f"Cannot modify a locked (Approved) ITR. "
                        f"Blocked fields: {', '.join(sorted(blocked))}. "
                        f"Use Publish to create a new revision."
                    )

            # Capture old values for audit
            old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}

            # Prepare update data
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])

            # Handle vendor name -> vendor_id mapping
            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Validate noiNumber exists if being updated
            if 'noiNumber' in d and d['noiNumber']:
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == d['noiNumber']
                ).first()
                if not noi:
                    raise ValueError(f"NOI with reference number '{d['noiNumber']}' not found")

            # Validate ncrNumber exists if being updated
            if 'ncrNumber' in d and d['ncrNumber']:
                ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == d['ncrNumber']
                ).first()
                if not ncr:
                    raise ValueError(f"NCR with document number '{d['ncrNumber']}' not found")

            # --- Auto-set closeoutDate on approval ---
            if d.get('status') == 'Approved' and not d.get('closeoutDate') and not db_itr.closeoutDate:
                d['closeoutDate'] = datetime.now().strftime('%Y-%m-%d')

            # --- Increment _version in detail_data ---
            # Merge incoming detail_data with the version bump
            new_version = db_version + 1
            if isinstance(incoming_detail, dict):
                merged_detail = {**existing_detail, **incoming_detail, "_version": new_version}
            else:
                merged_detail = {**existing_detail, "_version": new_version}
            d['detail_data'] = json.dumps(merged_detail, ensure_ascii=False)

            # Update the record
            updated = self.repo.update(db_itr, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "ITR", itr_id, updated.documentNumber,
                old_value=old_val, new_value=itr_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating ITR {itr_id}: {e}", exc_info=True)
            raise e

    def delete_itr(self, itr_id: str, user_id: int = None, username: str = None) -> bool:
        """
        Delete an ITR with audit logging

        Args:
            itr_id: ITR identifier
            user_id: ID of user deleting the ITR
            username: Username of user deleting the ITR

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                return False

            # 勾稽鎖定：刪除 ITR 前確認沒有 NCR 透過 reInspectionNumber 參照此 ITR
            if db_itr.documentNumber:
                referencing_ncrs = self.repo.db.query(models.NCR).filter(
                    models.NCR.reInspectionNumber == db_itr.documentNumber
                ).all()
                if referencing_ncrs:
                    ncr_refs = [ncr.documentNumber or ncr.id for ncr in referencing_ncrs]
                    raise ValueError(
                        f"Cannot delete ITR '{db_itr.documentNumber}': "
                        f"referenced by NCR(s): {', '.join(ncr_refs)}. "
                        f"Please remove the re-inspection reference from those NCRs first."
                    )

            # Capture old values for audit
            old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}

            # Delete the record
            self.repo.delete(db_itr)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "ITR", itr_id, db_itr.documentNumber,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting ITR {itr_id}: {e}", exc_info=True)
            raise e

    def link_checklist(self, itr_id: str, checklist_id: str,
                       user_id: int = None, username: str = None) -> Optional[models.ITR]:
        """
        Link a Checklist to an ITR

        Args:
            itr_id: ITR identifier
            checklist_id: Checklist identifier to link
            user_id: ID of user performing the action
            username: Username of user performing the action

        Returns:
            Updated ITR object if found, None otherwise

        Raises:
            Exception: If linking fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                return None

            # Link the checklist
            updated = self.repo.link_checklist(db_itr, checklist_id)

            # Log audit trail
            log_audit(
                self.repo.db, "LINK_CHECKLIST", "ITR", itr_id, db_itr.documentNumber,
                new_value={"checklist_id": checklist_id},
                user_id=user_id, username=username
            )

            return updated
        except Exception as e:
            logger.error(f"Error linking checklist to ITR {itr_id}: {e}", exc_info=True)
            raise e

    def create_ncr_from_itr(self, itr_id: str,
                            user_id: int = None, username: str = None) -> models.NCR:
        """
        Create an NCR from a failed or rejected ITR.

        Pre-populates the NCR with data from the source ITR so the user
        does not have to re-enter vendor, NOI reference, etc.

        Args:
            itr_id: ITR identifier
            user_id: ID of user performing the action
            username: Username of user performing the action

        Returns:
            The newly created NCR object

        Raises:
            ValueError: If the ITR is not found, or is not in a failed/rejected state
            Exception: If creation fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                raise ValueError(f"ITR '{itr_id}' not found")

            # Only allow NCR creation from a failed or rejected ITR
            if db_itr.inspectionResult != "Fail" and db_itr.status != "Reject":
                raise ValueError(
                    f"Cannot create NCR from ITR '{db_itr.documentNumber}': "
                    f"inspectionResult must be 'Fail' or status must be 'Reject' "
                    f"(current inspectionResult='{db_itr.inspectionResult}', status='{db_itr.status}')"
                )

            # Resolve vendor name for the NCR
            vendor_name = db_itr.vendor  # uses the @property

            ncr_data = {
                "vendor_id": db_itr.vendor_id,
                "noiNumber": db_itr.noiNumber,
                "itrNumber": db_itr.documentNumber,
                "description": f"NCR raised from failed ITR {db_itr.documentNumber}",
                "status": "Open",
                "raiseDate": datetime.now().strftime('%Y-%m-%d'),
                "rev": "0",
                "submit": "",
            }

            # Generate NCR documentNumber
            ncr_data['documentNumber'] = generate_reference_no(
                self.repo.db, vendor_name or '', 'NCR'
            )

            db_ncr = models.NCR(**ncr_data)
            db_ncr.id = str(uuid.uuid4())

            self.repo.db.add(db_ncr)
            self.repo.db.flush()

            # Link the NCR back to the ITR
            db_itr.ncrNumber = db_ncr.documentNumber
            self.repo.db.flush()

            self.repo.db.commit()
            self.repo.db.refresh(db_ncr)

            # Log audit trail for NCR creation
            log_audit(
                self.repo.db, "CREATE", "NCR", db_ncr.id, db_ncr.documentNumber,
                new_value={
                    "source": "ITR",
                    "sourceItrId": itr_id,
                    "sourceItrNumber": db_itr.documentNumber,
                },
                user_id=user_id, username=username
            )

            # Log audit trail on the ITR side
            log_audit(
                self.repo.db, "CREATE_NCR_FROM_ITR", "ITR", itr_id, db_itr.documentNumber,
                new_value={"ncrId": db_ncr.id, "ncrNumber": db_ncr.documentNumber},
                user_id=user_id, username=username
            )

            return db_ncr
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error creating NCR from ITR {itr_id}: {e}", exc_info=True)
            raise e

    def create_reinspection(self, itr_id: str,
                            user_id: int = None, username: str = None) -> models.ITR:
        """
        Create a re-inspection ITR from a failed or rejected ITR.

        Copies key fields from the original ITR and marks the new one
        as a re-inspection with an incremented counter.

        Args:
            itr_id: ITR identifier of the original (failed/rejected) ITR
            user_id: ID of user performing the action
            username: Username of user performing the action

        Returns:
            The newly created re-inspection ITR object

        Raises:
            ValueError: If the original ITR is not found, or is not
                        in a failed/rejected state
            Exception: If creation fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                raise ValueError(f"ITR '{itr_id}' not found")

            # Only allow re-inspection from a failed or rejected ITR
            if db_itr.inspectionResult != "Fail" and db_itr.status != "Reject":
                raise ValueError(
                    f"Cannot create re-inspection from ITR '{db_itr.documentNumber}': "
                    f"inspectionResult must be 'Fail' or status must be 'Reject' "
                    f"(current inspectionResult='{db_itr.inspectionResult}', status='{db_itr.status}')"
                )

            vendor_name = db_itr.vendor  # uses the @property

            new_doc_number = generate_reference_no(
                self.repo.db, vendor_name or '', 'ITR'
            )

            new_itr_data = {
                "vendor_id": db_itr.vendor_id,
                "noiNumber": db_itr.noiNumber,
                "subject": db_itr.subject,
                "description": db_itr.description or '',
                "rev": "0",
                "submit": "",
                "status": "In Progress",
                "documentNumber": new_doc_number,
                "raiseDate": datetime.now().strftime('%Y-%m-%d'),
                "isReInspection": True,
                "originalItrId": itr_id,
                "reInspectionCount": (db_itr.reInspectionCount or 0) + 1,
                "eventNumber": db_itr.eventNumber,
                "checkpoint": db_itr.checkpoint,
                "discipline": db_itr.discipline,
                "type": db_itr.type,
                "foundLocation": db_itr.foundLocation,
                # Initialize detail_data with _version for optimistic locking
                "detail_data": json.dumps({"_version": 0}, ensure_ascii=False),
            }

            db_new_itr = models.ITR(**new_itr_data)
            db_new_itr.id = str(uuid.uuid4())

            self.repo.db.add(db_new_itr)
            self.repo.db.commit()
            self.repo.db.refresh(db_new_itr)

            # Log audit trail for the new re-inspection ITR
            log_audit(
                self.repo.db, "CREATE", "ITR", db_new_itr.id, db_new_itr.documentNumber,
                new_value={
                    "source": "RE_INSPECTION",
                    "originalItrId": itr_id,
                    "originalItrNumber": db_itr.documentNumber,
                    "reInspectionCount": db_new_itr.reInspectionCount,
                },
                user_id=user_id, username=username
            )

            # Log audit trail on the original ITR
            log_audit(
                self.repo.db, "CREATE_REINSPECTION", "ITR", itr_id, db_itr.documentNumber,
                new_value={
                    "newItrId": db_new_itr.id,
                    "newItrNumber": db_new_itr.documentNumber,
                },
                user_id=user_id, username=username
            )

            return db_new_itr
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error creating re-inspection from ITR {itr_id}: {e}", exc_info=True)
            raise e
