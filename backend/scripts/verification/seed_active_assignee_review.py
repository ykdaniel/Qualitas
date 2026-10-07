"""Isolated-only fixtures for historical inactive assignee selectors."""
import os
from core.startup_guard import guard_if_required
assert os.environ.get('QUALITAS_REQUIRE_ISOLATED_DB') == '1'
guard_if_required()
from database import SessionLocal
from core.security import get_password_hash
import models
with SessionLocal() as db:
    role = models.Role(name='AssigneeReviewer')
    codes = ['ncr:view:all','ncr:create:all','ncr:update:all','followup:view:all','followup:create:all','followup:update:all','iam:user:view','contractors:view:all']
    role.permissions_rel = db.query(models.Permission).filter(models.Permission.code.in_(codes)).all()
    assert len(role.permissions_rel) == len(codes)
    db.add(role)
    db.flush()
    reviewer = models.User(username='assignee_reviewer',email='reviewer@example.com',is_active=True,role_id=role.id,hashed_password=get_password_hash(os.environ['INITIAL_ADMIN_PASSWORD']))
    old = models.User(username='historical_inactive', email='old@example.com',is_active=False)
    other = models.User(username='other_inactive', email='other@example.com',is_active=False)
    db.add_all([reviewer,old,other]);db.flush()
    db.add(models.NCR(id='inactive-ncr',documentNumber='INACTIVE-NCR',description='Historical assignee',rev='0',submit='',status='Open',assignedTo=old.id))
    db.add(models.FollowUp(id='inactive-followup',issueNo='INACTIVE-FU',title='Historical assignee',description='Historical assignee',status='Open',assignedTo='historical_inactive',assignedToUserId=old.id,createdAt='2026-09-28',updatedAt='2026-09-28'))
    db.commit()
print('Assignee fixtures created')
