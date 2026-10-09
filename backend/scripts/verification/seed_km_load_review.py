"""Toggle fixture view permission to exercise editor load refusal and retry."""
import os
import models
from database import SessionLocal
if os.environ.get('QUALITAS_REQUIRE_ISOLATED_DB') != '1':
    raise RuntimeError('Use isolated_stack.py seed')
with SessionLocal() as db:
    role = db.query(models.Role).filter_by(name='KmEditor').one()
    permission = db.query(models.Permission).filter_by(code='km:view:all').one()
    if os.environ.get('KM_REVIEW_ALLOW_VIEW') == '1':
        if permission not in role.permissions_rel:
            role.permissions_rel.append(permission)
    else:
        role.permissions_rel = [p for p in role.permissions_rel if p.code != 'km:view:all']
    db.commit()
