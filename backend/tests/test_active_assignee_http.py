"""Real login/routes, temporary SQLite, fresh-session snapshots; no main or SMTP."""
import importlib

import pytest
from sqlalchemy import select

import models
from database import Base
from test_reviewed_audit_paths_http import env  # noqa: F401


@pytest.fixture
def assignment_env(env):
    for module in ('ncr', 'followup'):
        env.app.include_router(importlib.import_module('routers.' + module).router, prefix='/api')
    with env.Session() as db:
        role = db.query(models.Role).filter_by(name='AuditWriter').one()
        for module in ('ncr', 'followup'):
            for action in ('view', 'create', 'update'):
                code = f'{module}:{action}:all'
                role.permissions_rel.append(models.Permission(code=code, description=code))
        db.add_all([
            models.User(id=101, username='active', email='active@example.com', is_active=True),
            models.User(id=102, username='inactive', email='inactive@example.com', is_active=False),
            models.User(id=103, username='other-inactive', email='other@example.com', is_active=False),
        ])
        db.commit()
    return env


def snapshot(env):
    with env.Session() as db:
        return {table.name: db.execute(select(table).order_by(*table.primary_key.columns)).fetchall()
                for table in Base.metadata.sorted_tables}


def body(module, assignee):
    if module == 'ncr':
        return dict(description='Assignment test', rev='0', submit='', status='Open', assignedTo=assignee)
    return dict(title='Assignment test', description='Test', status='Open',
                createdAt='2026-09-28', updatedAt='2026-09-28', assignedToUserId=assignee)


def field(module):
    return 'assignedTo' if module == 'ncr' else 'assignedToUserId'


def url(module, rid):
    return f'/api/{module}/{rid}' + ('/' if module == 'ncr' else '')


@pytest.mark.parametrize('module', ['ncr', 'followup'])
@pytest.mark.parametrize('assignee', [102, 99999])
def test_create_rejects_disabled_or_missing_before_any_write(assignment_env, module, assignee):
    e = assignment_env
    before = snapshot(e)
    r = e.client.post(f'/api/{module}/', json=body(module, assignee))
    assert r.status_code == 400, r.text
    assert 'Assignee is unavailable' in r.json()['detail']
    assert snapshot(e) == before


@pytest.mark.parametrize('module', ['ncr', 'followup'])
def test_history_can_be_kept_edited_reassigned_and_cleared(assignment_env, module):
    e = assignment_env
    r = e.client.post(f'/api/{module}/', json=body(module, 101))
    assert r.status_code == 200, r.text
    rid = r.json()['id']
    with e.Session() as db:
        db.get(models.User, 101).is_active = False
        db.commit()
    # An unrelated edit and an explicit unchanged historical ID must both work.
    for update in ({'description': 'edited'}, {field(module): 101, 'description': 'edited again'}):
        r = e.client.put(url(module, rid), json=update)
        assert r.status_code == 200, r.text
        assert r.json()[field(module)] == 101
    for target in (102, 99999):
        before = snapshot(e)
        r = e.client.put(url(module, rid), json={field(module): target, 'description': 'must not persist'})
        assert r.status_code == 400, r.text
        assert snapshot(e) == before
    with e.Session() as db:
        db.get(models.User, 103).is_active = True
        db.commit()
    r = e.client.put(url(module, rid), json={field(module): 103})
    assert r.status_code == 200, r.text
    assert r.json()[field(module)] == 103
    r = e.client.put(url(module, rid), json={field(module): None})
    assert r.status_code == 200, r.text
    assert r.json()[field(module)] is None
    with e.Session() as db:
        logs = db.query(models.AuditLog).filter_by(entity_id=rid, action='UPDATE').all()
        assert any('103' in (log.new_value or '') for log in logs)


def test_followup_bulk_uses_same_assignment_guard(assignment_env):
    e = assignment_env
    before = snapshot(e)
    r = e.client.post('/api/followup/bulk/', json=[body('followup', 102)])
    assert r.status_code == 400, r.text
    assert snapshot(e) == before


@pytest.mark.parametrize('module', ['ncr', 'followup'])
def test_scope_precedes_assignee_check(assignment_env, module):
    e = assignment_env
    r = e.client.post(f'/api/{module}/', json=body(module, 101))
    assert r.status_code == 200, r.text
    rid = r.json()['id']
    with e.Session() as db:
        db.add(models.Project(id='own', name='Own project'))
        db.flush()
        actor = db.query(models.User).filter_by(username='audit-writer').one()
        db.add(models.UserProject(user_id=actor.id, project_id='own'))
        db.commit()
    before = snapshot(e)
    r = e.client.put(url(module, rid), json={field(module): 102})
    assert r.status_code == 404, r.text
    assert snapshot(e) == before


@pytest.mark.parametrize('module', ['ncr', 'followup'])
def test_assignment_does_not_bypass_write_permission(assignment_env, module):
    e = assignment_env
    with e.Session() as db:
        role = db.query(models.Role).filter_by(name='AuditWriter').one()
        role.permissions_rel = [p for p in role.permissions_rel if p.code != f'{module}:create:all']
        db.commit()
    before = snapshot(e)
    r = e.client.post(f'/api/{module}/', json=body(module, 101))
    assert r.status_code == 403, r.text
    assert snapshot(e) == before
