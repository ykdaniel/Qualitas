"""
Standardized error messages for the application.

This module provides consistent error message templates and helper functions
to ensure uniform error reporting across all services.
"""

# ============================================================================
# Reference/Foreign Key Validation Errors
# ============================================================================

def reference_not_found(entity_type: str, field_name: str, field_value: str) -> str:
    """
    Generate error message for missing foreign key reference.

    Args:
        entity_type: Type of entity (e.g., "ITP", "NOI", "NCR")
        field_name: Name of the reference field (e.g., "reference number", "document number")
        field_value: Value that was not found

    Returns:
        Formatted error message

    Example:
        reference_not_found("ITP", "reference number", "ITP-001")
        # Returns: "ITP with reference number 'ITP-001' not found"
    """
    return f"{entity_type} with {field_name} '{field_value}' not found"


# ============================================================================
# Cascade Delete Protection Errors
# ============================================================================

def cannot_delete_has_references(entity_type: str, entity_id: str, references: list[str]) -> str:
    """
    Generate error message for cascade delete protection.

    Args:
        entity_type: Type of entity being deleted (e.g., "ITP", "Contractor")
        entity_id: Identifier of the entity (e.g., reference number, name)
        references: List of reference descriptions (e.g., ["3 NOI record(s)", "5 ITR record(s)"])

    Returns:
        Formatted error message

    Example:
        cannot_delete_has_references("ITP", "ITP-001", ["3 NOI record(s)"])
        # Returns: "Cannot delete ITP 'ITP-001': referenced by 3 NOI record(s)"
    """
    refs = ", ".join(references)
    return f"Cannot delete {entity_type} '{entity_id}': referenced by {refs}"


# ============================================================================
# Workflow/State Transition Errors
# ============================================================================

def invalid_status_transition(entity_type: str, from_status: str, to_status: str) -> str:
    """
    Generate error message for invalid workflow state transition.

    Args:
        entity_type: Type of entity (e.g., "ITP", "NCR")
        from_status: Current status
        to_status: Attempted new status

    Returns:
        Formatted error message

    Example:
        invalid_status_transition("ITP", "Approved", "Draft")
        # Returns: "Invalid status transition for ITP from 'Approved' to 'Draft'"
    """
    return f"Invalid status transition for {entity_type} from '{from_status}' to '{to_status}'"


# ============================================================================
# Validation Errors
# ============================================================================

def field_required(field_name: str) -> str:
    """Generate error for missing required field."""
    return f"Field '{field_name}' is required"


def field_invalid_format(field_name: str, expected_format: str) -> str:
    """Generate error for invalid field format."""
    return f"Field '{field_name}' has invalid format. Expected: {expected_format}"


def field_out_of_range(field_name: str, min_val=None, max_val=None) -> str:
    """Generate error for field value out of range."""
    if min_val is not None and max_val is not None:
        return f"Field '{field_name}' must be between {min_val} and {max_val}"
    elif min_val is not None:
        return f"Field '{field_name}' must be at least {min_val}"
    elif max_val is not None:
        return f"Field '{field_name}' must be at most {max_val}"
    return f"Field '{field_name}' is out of valid range"


# ============================================================================
# Resource Not Found Errors
# ============================================================================

def entity_not_found(entity_type: str, entity_id: str) -> str:
    """
    Generate error message for entity not found.

    Args:
        entity_type: Type of entity (e.g., "ITP", "User", "Contractor")
        entity_id: Identifier of the entity

    Returns:
        Formatted error message

    Example:
        entity_not_found("ITP", "itp-123")
        # Returns: "ITP with ID 'itp-123' not found"
    """
    return f"{entity_type} with ID '{entity_id}' not found"


# ============================================================================
# Duplicate/Uniqueness Errors
# ============================================================================

def duplicate_value(field_name: str, field_value: str) -> str:
    """
    Generate error message for duplicate value violation.

    Args:
        field_name: Name of the field with duplicate value
        field_value: The duplicate value

    Returns:
        Formatted error message

    Example:
        duplicate_value("email", "user@example.com")
        # Returns: "A record with email 'user@example.com' already exists"
    """
    return f"A record with {field_name} '{field_value}' already exists"


# ============================================================================
# Permission/Authorization Errors
# ============================================================================

def insufficient_permissions(action: str, resource: str) -> str:
    """Generate error for insufficient permissions."""
    return f"Insufficient permissions to {action} {resource}"


def cannot_modify_protected_resource(resource: str, reason: str) -> str:
    """Generate error for protected resource modification attempt."""
    return f"Cannot modify {resource}: {reason}"


# ============================================================================
# Date/Time Validation Errors
# ============================================================================

def date_range_invalid(start_field: str, end_field: str) -> str:
    """Generate error for invalid date range."""
    return f"{start_field} must be before or equal to {end_field}"


# ============================================================================
# File Upload Errors
# ============================================================================

def file_type_not_allowed(file_ext: str, allowed_types: list[str]) -> str:
    """Generate error for disallowed file type."""
    allowed = ", ".join(allowed_types)
    return f"File type '{file_ext}' is not allowed. Allowed types: {allowed}"


def file_size_exceeded(max_size_mb: int) -> str:
    """Generate error for file size limit exceeded."""
    return f"File size exceeds {max_size_mb}MB limit"
