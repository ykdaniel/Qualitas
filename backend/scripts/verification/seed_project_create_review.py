"""Isolated-only FAT/ITP project selection fixtures. Password supplied via environment."""
import os
from core.startup_guard import guard_if_required

assert os.environ.get('QUALITAS_REQUIRE_ISOLATED_DB') == '1'
guard_if_required()
from database import SessionLocal
import models
from core.security import get_password_hash

with SessionLocal() as db:
    codes = ['fat:view:all', 'fat:create:all', 'itp:view:all', 'itp:create:all', 'contractors:view:all']
    role = models.Role(name='ProjectCreateReview')
    role.permissions_rel = db.query(models.Permission).filter(models.Permission.code.in_(codes)).all()
    assert len(role.permissions_rel) == len(codes)
    db.add(role)
    db.add_all([models.Project(id=f'PCR-P{i}', name=f'Review Project {i}') for i in range(1, 4)])
    db.add(models.Contractor(id='PCR-V', name='Project Review Vendor', abbreviation='PCR'))
    db.flush()
    for name, projects in [('multi', [1, 2]), ('single', [1]), ('unrestricted', [])]:
        user = models.User(username=f'pcr_{name}', email=f'{name}@example.com', is_active=True,
                           role_id=role.id, hashed_password=get_password_hash(os.environ['INITIAL_ADMIN_PASSWORD']))
        db.add(user)
        db.flush()
        db.add_all([models.UserProject(user_id=user.id, project_id=f'PCR-P{i}') for i in projects])
    db.commit()
print('Project selection fixtures created')
