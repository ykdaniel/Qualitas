"""
Common validation functions to reduce code duplication across services.

This module provides reusable validation logic for:
- Reference/foreign key validation
- Cascade delete protection
- Common field validations
"""

from typing import List, Tuple
from sqlalchemy.orm import Session
import models
from core import error_messages


# ============================================================================
# Reference Validation
# ============================================================================

def validate_reference_exists(
    db: Session,
    model_class,
    field_name: str,
    field_value: str,
    entity_type: str,
    field_display_name: str = None
) -> any:
    """
    Validate that a referenced entity exists.

    Args:
        db: Database session
        model_class: SQLAlchemy model class to query
        field_name: Field name to filter on (e.g., 'referenceNo', 'documentNumber')
        field_value: Value to search for
        entity_type: Type of entity for error message (e.g., 'ITP', 'NOI')
        field_display_name: Display name for the field in error messages (defaults to field_name)

    Returns:
        The found entity

    Raises:
        ValueError: If entity not found

    Example:
        itp = validate_reference_exists(
            db, models.ITP, 'referenceNo', 'ITP-001', 'ITP', 'reference number'
        )
    """
    if not field_value:
        return None

    display_name = field_display_name or field_name
    entity = db.query(model_class).filter(
        getattr(model_class, field_name) == field_value
    ).first()

    if not entity:
        raise ValueError(error_messages.reference_not_found(
            entity_type, display_name, field_value
        ))

    return entity


def validate_itp_reference(db: Session, itp_no: str):
    """Validate ITP reference exists."""
    return validate_reference_exists(
        db, models.ITP, 'referenceNo', itp_no, 'ITP', 'reference number'
    )


def validate_noi_reference(db: Session, noi_number: str):
    """Validate NOI reference exists."""
    return validate_reference_exists(
        db, models.NOI, 'referenceNo', noi_number, 'NOI', 'reference number'
    )


def validate_ncr_reference(db: Session, ncr_number: str):
    """Validate NCR reference exists."""
    return validate_reference_exists(
        db, models.NCR, 'documentNumber', ncr_number, 'NCR', 'document number'
    )


def validate_itr_reference(db: Session, itr_number: str):
    """Validate ITR reference exists by document number."""
    return validate_reference_exists(
        db, models.ITR, 'documentNumber', itr_number, 'ITR', 'document number'
    )


def validate_itr_by_id(db: Session, itr_id: str):
    """Validate ITR reference exists by ID."""
    return validate_reference_exists(
        db, models.ITR, 'id', itr_id, 'ITR', 'ID'
    )


# ============================================================================
# Cascade Delete Protection
# ============================================================================

def check_references_before_delete(
    db: Session,
    entity_id: str,
    entity_display_name: str,
    reference_checks: List[Tuple[any, str, str, str]]
) -> None:
    """
    Check for references before allowing delete operation.

    Args:
        db: Database session
        entity_id: Identifier of entity being deleted (for error message)
        entity_display_name: Display name of entity type (e.g., 'ITP', 'Contractor')
        reference_checks: List of tuples (model_class, filter_field, filter_value, display_name)

    Raises:
        ValueError: If entity has references

    Example:
        check_references_before_delete(
            db, itp.referenceNo, 'ITP',
            [
                (models.NOI, 'itpNo', itp.referenceNo, 'NOI'),
                (models.Checklist, 'itpId', itp.id, 'Checklist')
            ]
        )
    """
    references = []

    for model_class, filter_field, filter_value, display_name in reference_checks:
        count = db.query(model_class).filter(
            getattr(model_class, filter_field) == filter_value
        ).count()

        if count > 0:
            references.append(f"{count} {display_name} record(s)")

    if references:
        raise ValueError(error_messages.cannot_delete_has_references(
            entity_display_name, entity_id, references
        ))


def check_contractor_references(db: Session, contractor_id: str, contractor_name: str) -> None:
    """
    Check if contractor is referenced by any module before deletion.

    Args:
        db: Database session
        contractor_id: Contractor ID
        contractor_name: Contractor name (for error message)

    Raises:
        ValueError: If contractor has references
    """
    check_references_before_delete(
        db, contractor_name, 'contractor',
        [
            (models.ITP, 'vendor_id', contractor_id, 'ITP'),
            (models.NCR, 'vendor_id', contractor_id, 'NCR'),
            (models.NOI, 'vendor_id', contractor_id, 'NOI'),
            (models.ITR, 'vendor_id', contractor_id, 'ITR'),
            (models.PQP, 'vendor_id', contractor_id, 'PQP'),
            (models.OBS, 'vendor_id', contractor_id, 'OBS'),
            (models.FAT, 'vendor_id', contractor_id, 'FAT'),
            (models.FollowUp, 'vendor_id', contractor_id, 'FollowUp'),
            (models.Audit, 'vendor_id', contractor_id, 'Audit'),
        ]
    )


def check_itp_references(db: Session, itp_id: str, itp_reference_no: str) -> None:
    """
    Check if ITP is referenced before deletion.

    Args:
        db: Database session
        itp_id: ITP ID
        itp_reference_no: ITP reference number (for error message)

    Raises:
        ValueError: If ITP has references
    """
    check_references_before_delete(
        db, itp_reference_no, 'ITP',
        [
            (models.NOI, 'itpNo', itp_reference_no, 'NOI'),
        ]
    )


def check_noi_references(db: Session, noi_reference_no: str) -> None:
    """
    Check if NOI is referenced before deletion.

    Args:
        db: Database session
        noi_reference_no: NOI reference number

    Raises:
        ValueError: If NOI has references
    """
    check_references_before_delete(
        db, noi_reference_no, 'NOI',
        [
            (models.NCR, 'noiNumber', noi_reference_no, 'NCR'),
            (models.ITR, 'noiNumber', noi_reference_no, 'ITR'),
        ]
    )


def check_ncr_references(db: Session, ncr_document_number: str) -> None:
    """
    Check if NCR is referenced before deletion.

    Args:
        db: Database session
        ncr_document_number: NCR document number

    Raises:
        ValueError: If NCR has references
    """
    check_references_before_delete(
        db, ncr_document_number, 'NCR',
        [
            (models.ITR, 'ncrNumber', ncr_document_number, 'ITR'),
        ]
    )


# ============================================================================
# FollowUp Source Reference Validation
# ============================================================================

def validate_followup_source_reference(
    db: Session,
    source_module: str,
    source_reference_no: str
) -> None:
    """
    Validate that a FollowUp's source reference exists in the appropriate module.

    FollowUp records can reference multiple different module types through
    sourceModule and sourceReferenceNo fields. This function validates that
    the referenced record actually exists based on the module type.

    Args:
        db: Database session
        source_module: Type of source module (e.g., "NCR", "NOI", "ITR", "OBS", "ITP")
        source_reference_no: Reference number/document number in the source module

    Raises:
        ValueError: If source module is invalid or reference not found

    Example:
        validate_followup_source_reference(db, "NCR", "QTS-ABC-NCR-000001")
        validate_followup_source_reference(db, "NOI", "QTS-ABC-NOI-000005")
    """
    if not source_module or not source_reference_no:
        # Both fields must be provided together or both empty
        if source_module or source_reference_no:
            raise ValueError(
                "Both sourceModule and sourceReferenceNo must be provided together"
            )
        return  # Both empty is allowed

    # Normalize source module to uppercase for comparison
    source_module = source_module.upper().strip()

    # Validate based on source module type
    if source_module == "NCR":
        validate_reference_exists(
            db, models.NCR, 'documentNumber', source_reference_no,
            'NCR', 'document number'
        )
    elif source_module == "NOI":
        validate_reference_exists(
            db, models.NOI, 'referenceNo', source_reference_no,
            'NOI', 'reference number'
        )
    elif source_module == "ITR":
        validate_reference_exists(
            db, models.ITR, 'documentNumber', source_reference_no,
            'ITR', 'document number'
        )
    elif source_module == "ITP":
        validate_reference_exists(
            db, models.ITP, 'referenceNo', source_reference_no,
            'ITP', 'reference number'
        )
    elif source_module == "OBS":
        validate_reference_exists(
            db, models.OBS, 'documentNumber', source_reference_no,
            'OBS', 'document number'
        )
    elif source_module == "PQP":
        validate_reference_exists(
            db, models.PQP, 'pqpNo', source_reference_no,
            'PQP', 'PQP number'
        )
    elif source_module == "FAT":
        # FAT uses equipment name as the identifier
        validate_reference_exists(
            db, models.FAT, 'equipment', source_reference_no,
            'FAT', 'equipment name'
        )
    elif source_module == "AUDIT":
        validate_reference_exists(
            db, models.Audit, 'auditNo', source_reference_no,
            'Audit', 'audit number'
        )
    else:
        # Invalid source module type
        valid_modules = ["NCR", "NOI", "ITR", "ITP", "OBS", "PQP", "FAT", "AUDIT"]
        raise ValueError(
            f"Invalid sourceModule '{source_module}'. "
            f"Must be one of: {', '.join(valid_modules)}"
        )
