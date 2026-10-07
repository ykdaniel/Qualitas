"""Run after seed_km_review and seed_km_permission_ui_review; isolated only."""
import os
import models
from database import SessionLocal
if os.environ.get('QUALITAS_REQUIRE_ISOLATED_DB') != '1':
    raise RuntimeError('Use isolated_stack.py seed')
with SessionLocal() as db:
    role = db.query(models.Role).filter_by(name='KmEditor').one()
    role.permissions_rel = [p for p in role.permissions_rel if p.code != 'km:create:all']
    db.commit()
# Optional setup for testing stale frontend authorization; this role exists only in this fixture.
import sys
if '--allow-delete' in sys.argv:
    with SessionLocal() as db:
        role = db.query(models.Role).filter_by(name='KmEditor').one()
        permission = db.query(models.Permission).filter_by(code='km:delete:all').one()
        if permission not in role.permissions_rel:
            role.permissions_rel.append(permission)
        db.commit()
if '--deny-delete' in sys.argv:
    with SessionLocal() as db:
        role = db.query(models.Role).filter_by(name='KmEditor').one()
        role.permissions_rel = [p for p in role.permissions_rel if p.code != 'km:delete:all']
        db.commit()
