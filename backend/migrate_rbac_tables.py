from database import engine, Base
from models import Permission, RolePermission, Role
from sqlalchemy import inspect, text

def migrate_rbac():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    if "permissions" not in existing_tables:
        print("Creating table: permissions")
        Permission.__table__.create(engine)
    else:
        print("Table 'permissions' already exists.")

    if "role_permissions" not in existing_tables:
        print("Creating table: role_permissions")
        RolePermission.__table__.create(engine)
    else:
        print("Table 'role_permissions' already exists.")
    
    # Check if Role table needs update (we are deprecating 'permissions' column, not dropping it yet to be safe, 
    # but we added a relationship which is handled by ORM, not DB schema change usually unless ForeignKeys are strictly enforced at DB level?
    # The relationship is managed via the secondary table 'role_permissions', which we just created.
    # So Role table itself might not need schema change unless we actullay drop the column.
    # For 'Enterprise' safety, we keeps the old column for now but just don't use it.
    
    print("RBAC Migration completed.")

if __name__ == "__main__":
    migrate_rbac()
