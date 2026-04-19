from core.perms import ALL_PERMISSIONS
from database import SessionLocal
from models import Permission, Role, RolePermission


def seed_rbac():
    db = SessionLocal()
    try:
        print("Seeding Permissions...")
        perm_map = {}
        for p_data in ALL_PERMISSIONS:
            code = p_data["code"]
            desc = p_data["description"]

            perm = db.query(Permission).filter(Permission.code == code).first()
            if not perm:
                perm = Permission(code=code, description=desc)
                db.add(perm)
                db.flush() # get ID
                print(f"Created Permission: {code}")
            perm_map[code] = perm

        db.commit()

        # Seed Roles
        print("\nSeeding Roles...")
        roles_definitions = {
            "ADMIN": ALL_PERMISSIONS, # All permissions
            "ENGINEER": [p for p in ALL_PERMISSIONS if all(k not in p["code"].lower() for k in ["approve", "delete", "manage"])],
            "QA_MANAGER": [p for p in ALL_PERMISSIONS if "manage" not in p["code"].lower()],
            "VIEWER": [p for p in ALL_PERMISSIONS if "view" in p["code"].lower()]
        }

        for role_name, perms_list in roles_definitions.items():
            role = db.query(Role).filter(Role.name == role_name).first()
            if not role:
                role = Role(name=role_name, description=f"Default {role_name} role")
                db.add(role)
                db.flush()
                print(f"Created Role: {role_name}")

            # Sync permissions
            # Clear existing logic if needed, but for seeding just ensure they exist
            # Check existing relationships
            existing_perm_ids = {rp.permission_id for rp in db.query(RolePermission).filter(RolePermission.role_id == role.id).all()}

            for p_dict in perms_list:
                p_code = p_dict["code"]
                p_obj = perm_map.get(p_code)
                if p_obj and p_obj.id not in existing_perm_ids:
                    db.add(RolePermission(role_id=role.id, permission_id=p_obj.id))
                    print(f"  + Added {p_code} to {role_name}")

        db.commit()
        print("\nRBAC Seeding Completed Successfully.")

    except Exception as e:
        print(f"Error seeding RBAC: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_rbac()
