# Audit Logging System

## Overview

The Qualitas system implements comprehensive audit logging to track all critical operations performed on entities. This provides traceability, compliance, and debugging capabilities.

## Architecture

### Components

1. **AuditLog Model** (`models.py`)
   - Database table: `audit_logs`
   - Stores all audit trail records
   - Fields: timestamp, action, entity_type, entity_id, entity_name, old_value, new_value, user_id, username, reason

2. **log_audit Function** (`core/utils.py`)
   - Main audit logging function
   - Used across all services
   - Handles JSON serialization automatically

3. **log_status_change Function** (`core/utils.py`)
   - Specialized function for status changes
   - Convenience wrapper around log_audit
   - Captures workflow state transitions

## Usage

### Basic Audit Logging

```python
from core.utils import log_audit

# CREATE operation
log_audit(
    db=db,
    action="CREATE",
    entity_type="ITP",
    entity_id=itp.id,
    entity_name=itp.referenceNo,
    new_value=itp_data.dict(),
    user_id=current_user.id,
    username=current_user.username
)

# UPDATE operation
log_audit(
    db=db,
    action="UPDATE",
    entity_type="NCR",
    entity_id=ncr.id,
    entity_name=ncr.documentNumber,
    old_value=old_values,
    new_value=updated_values,
    user_id=current_user.id,
    username=current_user.username
)

# DELETE operation
log_audit(
    db=db,
    action="DELETE",
    entity_type="NOI",
    entity_id=noi.id,
    entity_name=noi.referenceNo,
    old_value=old_values,
    user_id=current_user.id,
    username=current_user.username,
    reason="Obsolete record"
)
```

### Status Change Logging

```python
from core.utils import log_status_change

# Log workflow state transition
log_status_change(
    db=db,
    entity_type="ITP",
    entity_id=itp.id,
    entity_name=itp.referenceNo,
    old_status="Draft",
    new_status="Pending",
    user_id=current_user.id,
    username=current_user.username,
    reason="Submitted for review"
)
```

## Action Types

| Action | Description | When to Use |
|--------|-------------|-------------|
| `CREATE` | Record creation | When a new entity is created |
| `UPDATE` | Record modification | When any field is modified |
| `DELETE` | Record deletion | When an entity is deleted |
| `STATUS_CHANGE` | Workflow state change | When status field changes |

## Entity Types

Currently logged entity types:
- ITP (Inspection and Test Plan)
- NCR (Non-Conformance Report)
- NOI (Notice of Inspection)
- ITR (Inspection Test Record)
- PQP (Project Quality Plan)
- OBS (Observation)
- FAT (Factory Acceptance Test)
- FollowUp
- Audit
- Checklist
- Contractor
- User

## Best Practices

### 1. Always Log Critical Operations

```python
def create_noi(self, noi_data, user_id, username):
    # Business logic
    db_noi = self.repo.create(noi_data)

    # ALWAYS log after successful operation
    log_audit(
        db, "CREATE", "NOI", db_noi.id, db_noi.referenceNo,
        new_value=noi_data.dict(),
        user_id=user_id, username=username
    )

    return db_noi
```

### 2. Capture Full Context for Updates

```python
def update_itp(self, itp_id, itp_update, user_id, username):
    db_itp = self.repo.get_by_id(itp_id)

    # Capture BEFORE state
    old_val = {c.name: getattr(db_itp, c.name) for c in db_itp.__table__.columns}

    # Perform update
    updated = self.repo.update(db_itp, itp_update.dict())

    # Log with BEFORE and AFTER
    log_audit(
        db, "UPDATE", "ITP", itp_id, db_itp.referenceNo,
        old_value=old_val,
        new_value=itp_update.dict(),
        user_id=user_id, username=username
    )

    return updated
```

### 3. Use Reasons for Deletions

```python
def delete_contractor(self, contractor_id, user_id, username, reason):
    db_contractor = self.repo.get_by_id(contractor_id)
    old_val = {c.name: getattr(db_contractor, c.name) for c in db_contractor.__table__.columns}

    self.repo.delete(db_contractor)

    # ALWAYS provide reason for deletions
    log_audit(
        db, "DELETE", "Contractor", contractor_id, db_contractor.name,
        old_value=old_val,
        user_id=user_id, username=username,
        reason=reason or "Deleted by user"
    )
```

### 4. Log Status Changes Explicitly

```python
def update_ncr(self, ncr_id, ncr_update, user_id, username):
    db_ncr = self.repo.get_by_id(ncr_id)
    old_status = db_ncr.status

    # Perform update
    updated = self.repo.update(db_ncr, ncr_update.dict())

    # If status changed, log it separately
    if ncr_update.status and ncr_update.status != old_status:
        log_status_change(
            db, "NCR", ncr_id, db_ncr.documentNumber,
            old_status, ncr_update.status,
            user_id, username,
            reason="Status updated by user"
        )

    # Also log general update
    log_audit(db, "UPDATE", "NCR", ncr_id, db_ncr.documentNumber, ...)
```

## Implementation Checklist

When implementing audit logging in a new service:

- [ ] Import `log_audit` from `core.utils`
- [ ] Add `user_id` and `username` parameters to service methods
- [ ] Call `log_audit` after CREATE operations
- [ ] Capture old values before UPDATE operations
- [ ] Call `log_audit` after UPDATE operations
- [ ] Capture old values before DELETE operations
- [ ] Call `log_audit` after DELETE operations
- [ ] Use `log_status_change` for workflow transitions
- [ ] Include meaningful reasons for critical operations
- [ ] Handle logging within the same database transaction

## Querying Audit Logs

### Get all changes for an entity

```python
from models import AuditLog

logs = db.query(AuditLog).filter(
    AuditLog.entity_type == "ITP",
    AuditLog.entity_id == "itp-123"
).order_by(AuditLog.timestamp.desc()).all()
```

### Get all actions by a user

```python
user_logs = db.query(AuditLog).filter(
    AuditLog.user_id == 42
).order_by(AuditLog.timestamp.desc()).all()
```

### Get status changes

```python
status_changes = db.query(AuditLog).filter(
    AuditLog.action == "STATUS_CHANGE"
).order_by(AuditLog.timestamp.desc()).all()
```

### Get recent deletions

```python
deletions = db.query(AuditLog).filter(
    AuditLog.action == "DELETE"
).order_by(AuditLog.timestamp.desc()).limit(100).all()
```

## Error Handling

The audit logging system is designed to never interrupt business operations:

```python
try:
    audit_log = AuditLog(...)
    db.add(audit_log)
except Exception as e:
    # Log error but don't raise - business operation continues
    logger.error(f"Error logging audit: {e}", exc_info=True)
```

## Performance Considerations

1. **Batch Operations**: For bulk operations, consider logging a summary rather than individual entries
2. **Transaction Scope**: Audit logs are added to the same transaction as the business operation
3. **JSON Serialization**: Large objects in old_value/new_value may impact performance
4. **Indexing**: The audit_logs table has indexes on entity_type, entity_id, and timestamp for fast queries

## Compliance & Retention

- Audit logs provide evidence for compliance audits
- Consider implementing retention policies based on regulatory requirements
- Logs should be periodically archived for long-term storage
- Sensitive data in logs should be handled according to privacy policies

## Future Enhancements

Potential improvements to the audit logging system:

- [ ] Add IP address tracking
- [ ] Add request ID for distributed tracing
- [ ] Implement log rotation and archival
- [ ] Add audit log viewer UI
- [ ] Export audit logs to external SIEM systems
- [ ] Add diff visualization for before/after comparisons
- [ ] Implement audit log integrity verification
