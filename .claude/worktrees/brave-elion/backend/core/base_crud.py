"""
Generic CRUD Base Class
Provides reusable CRUD operations for all models to reduce code duplication
"""
from typing import TypeVar, Generic, Type, List, Optional, Any, Dict, Callable
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
import uuid
import json
from datetime import datetime

# Will be imported from crud module to avoid circular imports
_json_serialize = None
log_audit = None
WorkflowEngine = None
generate_reference_no = None

ModelType = TypeVar("ModelType")
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)


class BaseCRUD(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    """
    Generic CRUD operations base class.

    Usage:
        itp_crud = BaseCRUD(
            model=ITP,
            entity_name="ITP",
            reference_field="referenceNo",
            list_fields=["attachments"],
            search_fields=["referenceNo", "projectTitle", "activity"]
        )
    """

    def __init__(
        self,
        model: Type[ModelType],
        entity_name: str,
        reference_field: str = "id",
        list_fields: List[str] = None,
        search_fields: List[str] = None,
        date_filter_field: str = "created_at",
        has_workflow: bool = True,
        auto_generate_reference: bool = True,
        reference_doc_type: str = None
    ):
        """
        Initialize CRUD operations for a model.

        Args:
            model: SQLAlchemy model class
            entity_name: Name of entity (e.g., "ITP", "NCR")
            reference_field: Field name for reference/document number
            list_fields: Fields that store JSON arrays
            search_fields: Fields to search in get_all()
            date_filter_field: Field to use for date range filters
            has_workflow: Whether entity has status workflow validation
            auto_generate_reference: Whether to auto-generate reference numbers
            reference_doc_type: Document type for reference number generation
        """
        self.model = model
        self.entity_name = entity_name
        self.reference_field = reference_field
        self.list_fields = list_fields or []
        self.search_fields = search_fields or []
        self.date_filter_field = date_filter_field
        self.has_workflow = has_workflow
        self.auto_generate_reference = auto_generate_reference
        self.reference_doc_type = reference_doc_type or entity_name

    def get(self, db: Session, id: str) -> Optional[ModelType]:
        """Get single record by ID."""
        return db.query(self.model).filter(self.model.id == id).first()

    def get_all(
        self,
        db: Session,
        skip: int = 0,
        limit: int = 500,
        search: str = None,
        status: str = None,
        start_date: str = None,
        end_date: str = None,
        **extra_filters
    ) -> List[ModelType]:
        """
        Get all records with optional filters.

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum records to return
            search: Search term (searches across search_fields)
            status: Filter by status
            start_date: Filter by start date
            end_date: Filter by end date
            **extra_filters: Additional field=value filters
        """
        query = db.query(self.model)

        # Search across configured fields
        if search and self.search_fields:
            search_conditions = [
                getattr(self.model, field).ilike(f"%{search}%")
                for field in self.search_fields
                if hasattr(self.model, field)
            ]
            if search_conditions:
                query = query.filter(or_(*search_conditions))

        # Status filter
        if status and hasattr(self.model, 'status'):
            query = query.filter(self.model.status == status)

        # Date range filters
        if start_date and hasattr(self.model, self.date_filter_field):
            query = query.filter(
                getattr(self.model, self.date_filter_field) >= start_date
            )
        if end_date and hasattr(self.model, self.date_filter_field):
            query = query.filter(
                getattr(self.model, self.date_filter_field) <= end_date
            )

        # Additional filters
        for key, value in extra_filters.items():
            if value is not None and hasattr(self.model, key):
                query = query.filter(getattr(self.model, key) == value)

        return query.offset(skip).limit(limit).all()

    def create(
        self,
        db: Session,
        obj_in: CreateSchemaType,
        user_id: int = None,
        username: str = None
    ) -> ModelType:
        """
        Create new record.

        Args:
            db: Database session
            obj_in: Pydantic create schema
            user_id: ID of user creating the record
            username: Username of user creating the record
        """
        # Serialize list fields to JSON
        global _json_serialize
        data = _json_serialize(obj_in.dict(), self.list_fields)

        # Auto-generate reference number if enabled
        if self.auto_generate_reference and self.reference_field in data:
            if not data.get(self.reference_field):
                global generate_reference_no
                vendor = data.get('vendor', '')
                data[self.reference_field] = generate_reference_no(
                    db, vendor, self.reference_doc_type
                )

        # Create model instance
        db_obj = self.model(**data)

        # Generate UUID if no ID
        if not db_obj.id:
            db_obj.id = str(uuid.uuid4())

        db.add(db_obj)

        # Audit log
        global log_audit
        reference_value = getattr(db_obj, self.reference_field, db_obj.id)
        log_audit(
            db, "CREATE", self.entity_name, db_obj.id, reference_value,
            new_value=obj_in.dict(), user_id=user_id, username=username
        )

        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self,
        db: Session,
        id: str,
        obj_in: UpdateSchemaType,
        user_id: int = None,
        username: str = None
    ) -> Optional[ModelType]:
        """
        Update existing record.

        Args:
            db: Database session
            id: Record ID
            obj_in: Pydantic update schema
            user_id: ID of user updating the record
            username: Username of user updating the record
        """
        db_obj = self.get(db, id)
        if not db_obj:
            return None

        # Validate workflow transitions
        if self.has_workflow and hasattr(obj_in, 'status') and obj_in.status:
            global WorkflowEngine
            current_status = getattr(db_obj, 'status', None)
            if current_status and not WorkflowEngine.validate_transition(
                self.entity_name, current_status, obj_in.status
            ):
                raise ValueError(
                    f"Invalid status transition from {current_status} to {obj_in.status}"
                )

        # Get old values for audit
        old_value = {c.name: getattr(db_obj, c.name) for c in db_obj.__table__.columns}

        # Serialize and update
        global _json_serialize
        update_data = obj_in.dict(exclude_unset=True)
        update_data = _json_serialize(update_data, self.list_fields)

        for key, value in update_data.items():
            setattr(db_obj, key, value)

        # Audit log
        global log_audit
        reference_value = getattr(db_obj, self.reference_field, id)
        log_audit(
            db, "UPDATE", self.entity_name, id, reference_value,
            old_value=old_value, new_value=obj_in.dict(exclude_unset=True),
            user_id=user_id, username=username
        )

        db.commit()
        db.refresh(db_obj)
        return db_obj

    def delete(
        self,
        db: Session,
        id: str,
        user_id: int = None,
        username: str = None,
        soft_delete: bool = False
    ) -> Optional[ModelType]:
        """
        Delete record (soft or hard delete).

        Args:
            db: Database session
            id: Record ID
            user_id: ID of user deleting the record
            username: Username of user deleting the record
            soft_delete: If True, set is_deleted flag instead of removing
        """
        db_obj = self.get(db, id)
        if not db_obj:
            return None

        # Get old values for audit
        old_value = {c.name: getattr(db_obj, c.name) for c in db_obj.__table__.columns}

        # Audit log
        global log_audit
        reference_value = getattr(db_obj, self.reference_field, id)
        log_audit(
            db, "DELETE", self.entity_name, id, reference_value,
            old_value=old_value, user_id=user_id, username=username
        )

        if soft_delete and hasattr(db_obj, 'is_deleted'):
            # Soft delete
            db_obj.is_deleted = 1
            db_obj.deleted_at = datetime.utcnow().isoformat()
        else:
            # Hard delete
            db.delete(db_obj)

        db.commit()
        return db_obj

    def update_detail(
        self,
        db: Session,
        id: str,
        detail_body: dict,
        detail_field: str = "detail_data",
        user_id: int = None,
        username: str = None
    ) -> Optional[ModelType]:
        """
        Update detail_data JSON field.

        Args:
            db: Database session
            id: Record ID
            detail_body: New detail data
            detail_field: Name of the detail field (default: "detail_data")
            user_id: ID of user updating
            username: Username of user updating
        """
        db_obj = self.get(db, id)
        if not db_obj:
            return None

        # Get old value
        old_value = getattr(db_obj, detail_field, None)

        # Update detail field
        setattr(
            db_obj,
            detail_field,
            json.dumps(detail_body) if detail_body else None
        )

        # Audit log
        global log_audit
        reference_value = getattr(db_obj, self.reference_field, id)
        log_audit(
            db, "UPDATE_DETAIL", self.entity_name, id, reference_value,
            old_value=old_value, new_value=detail_body,
            user_id=user_id, username=username
        )

        db.commit()
        db.refresh(db_obj)
        return db_obj


def init_crud_globals(json_serialize_func, audit_func, workflow_engine, ref_gen_func):
    """
    Initialize global function references to avoid circular imports.
    Call this from crud.py after importing necessary functions.
    """
    global _json_serialize, log_audit, WorkflowEngine, generate_reference_no
    _json_serialize = json_serialize_func
    log_audit = audit_func
    WorkflowEngine = workflow_engine
    generate_reference_no = ref_gen_func
