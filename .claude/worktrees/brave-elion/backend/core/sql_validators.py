"""
SQL Input Validation Module
Provides whitelists and validators to prevent SQL injection attacks
"""

# Whitelist of allowed table names
ALLOWED_TABLES = {
    'itp', 'ncr', 'noi', 'obs', 'itr', 'pqp', 'followup',
    'contractors', 'users', 'roles', 'audit', 'checklist',
    'kpi_weights', 'owner_performance', 'fat'
}

# Whitelist of allowed column names for dynamic queries
ALLOWED_COLUMNS = {
    'is_deleted', 'deleted_at', 'created_at', 'updated_at',
    'vendor', 'vendorId', 'contractor', 'contractorId',
    'id', 'status', 'referenceNo', 'dueDate', 'submissionDate',
    'name', 'email', 'role_id', 'username'
}


def validate_table_name(table: str) -> str:
    """
    Validate table name against whitelist to prevent SQL injection.

    Args:
        table: The table name to validate

    Returns:
        The validated table name (same as input if valid)

    Raises:
        ValueError: If table name is not in the whitelist

    Example:
        >>> validate_table_name("itp")
        "itp"
        >>> validate_table_name("malicious'; DROP TABLE users--")
        ValueError: Invalid table name
    """
    if not table:
        raise ValueError("Table name cannot be empty")

    # Remove any whitespace and convert to lowercase for comparison
    clean_table = table.strip().lower()

    if clean_table not in ALLOWED_TABLES:
        raise ValueError(
            f"Invalid table name: '{table}'. "
            f"Allowed tables: {', '.join(sorted(ALLOWED_TABLES))}"
        )

    return clean_table


def validate_column_name(column: str) -> str:
    """
    Validate column name against whitelist to prevent SQL injection.

    Args:
        column: The column name to validate

    Returns:
        The validated column name (same as input if valid)

    Raises:
        ValueError: If column name is not in the whitelist

    Example:
        >>> validate_column_name("is_deleted")
        "is_deleted"
        >>> validate_column_name("id; DROP TABLE--")
        ValueError: Invalid column name
    """
    if not column:
        raise ValueError("Column name cannot be empty")

    # Remove any whitespace
    clean_column = column.strip()

    if clean_column not in ALLOWED_COLUMNS:
        raise ValueError(
            f"Invalid column name: '{column}'. "
            f"Allowed columns: {', '.join(sorted(ALLOWED_COLUMNS))}"
        )

    return clean_column


def validate_identifier(identifier: str, allowed_chars: str = "a-zA-Z0-9_") -> str:
    """
    Validate that an identifier only contains safe characters.

    This is a more permissive validator for cases where a whitelist
    isn't practical, but you still want to prevent SQL injection.

    Args:
        identifier: The identifier to validate
        allowed_chars: Regex character class of allowed characters

    Returns:
        The validated identifier

    Raises:
        ValueError: If identifier contains unsafe characters
    """
    import re

    if not identifier:
        raise ValueError("Identifier cannot be empty")

    # Check for only allowed characters
    pattern = f"^[{allowed_chars}]+$"
    if not re.match(pattern, identifier):
        raise ValueError(
            f"Invalid identifier: '{identifier}'. "
            f"Only characters [{allowed_chars}] are allowed."
        )

    return identifier


def sanitize_like_pattern(pattern: str) -> str:
    """
    Sanitize a LIKE pattern by escaping special SQL characters.

    Args:
        pattern: The search pattern

    Returns:
        Escaped pattern safe for use in LIKE queries

    Example:
        >>> sanitize_like_pattern("test%data")
        "test\\%data"
    """
    # Escape special LIKE characters
    pattern = pattern.replace("\\", "\\\\")  # Backslash must be escaped first
    pattern = pattern.replace("%", "\\%")
    pattern = pattern.replace("_", "\\_")
    return pattern
