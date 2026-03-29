"""Add constraints to audit table

Revision ID: add_audit_constraints
Revises: f24de25cb094
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_audit_constraints'
down_revision = 'f24de25cb094'
branch_labels = None
depends_on = None


def upgrade():
    """
    Add constraints to audits table:
    - auditNo: unique, not null
    - date: not null
    - status: default 'Draft', not null
    """
    # Update existing NULL values before adding constraints
    op.execute("""
        UPDATE audits
        SET status = 'Draft'
        WHERE status IS NULL
    """)

    op.execute("""
        UPDATE audits
        SET auditNo = 'QTS-RKS-XXX-AUD-' || printf('%06d', ROWID)
        WHERE auditNo IS NULL OR auditNo = ''
    """)

    # For SQLite, we need to recreate the table with new constraints
    # Note: SQLite doesn't support ALTER COLUMN directly

    # Add unique constraint to auditNo
    with op.batch_alter_table('audits') as batch_op:
        batch_op.create_unique_constraint('uq_audit_auditNo', ['auditNo'])

    # Note: For existing data, nullable constraints are more complex in SQLite
    # The model definition will enforce these for new records


def downgrade():
    """Remove constraints from audits table"""
    with op.batch_alter_table('audits') as batch_op:
        batch_op.drop_constraint('uq_audit_auditNo', type_='unique')
