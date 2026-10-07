"""Real routes, isolated DB and fresh-session checks for remaining audit writes."""
import importlib
import json
import pytest
from sqlalchemy import event
import models
from tests.test_reviewed_audit_paths_http import env, BODIES, MODELS, TYPES, snapshot

CASES = [(m, op) for m in ('pqp', 'obs', 'osd', 'fat') for op in ('update', 'delete')]
CASES += [('pqp', 'publish'), ('fat', 'details'), ('contractor', 'create'), ('contractor', 'delete')]

@pytest.fixture
def prepared(env):
    with env.Session() as db:
        role = db.query(models.Role).filter_by(name='AuditWriter').one()
        for m in ('pqp', 'obs', 'osd', 'fat'):
            for op in ('update', 'delete', 'approve'):
                code = f'{m}:{op}:all'
                role.permissions_rel.append(models.Permission(code=code, description=code))
            data = dict(BODIES[m])
            data.pop('vendor', None)
            data.pop('supplier', None)
            db.add(MODELS[m](id=m, vendor_id='vendor', **data))
        db.add(models.Contractor(id='unused', name='Unused', abbreviation='UN'))
        db.add(models.PQPHistory(id='old-history', pqp_id='pqp', version='Rev0.0', version_no=1,
                                 title='Older', status='Not Submit', created_at='2026-08-01'))
        db.commit()
    return env


def request(env, module, operation):
    path = f'/api/{"contractors" if module == "contractor" else module}/'
    rid = 'unused' if module == 'contractor' else module
    if operation == 'create':
        return env.client.post(path, json={'name': 'New contractor', 'abbreviation': 'NC'})
    if operation == 'delete':
        return env.client.delete(path + rid)
    if operation == 'publish':
        return env.client.post(path + rid + '/publish', json={'change_summary': 'Publish review'})
    if operation == 'details':
        return env.client.put(path + rid + '/details', json=[{'id': 'detail-1', 'item': 'Check'}])
    field = {'pqp': 'title', 'obs': 'description', 'osd': 'itemDescription', 'fat': 'equipment'}[module]
    return env.client.put(path + rid, json={field: 'Changed'})


def full_snapshot(env):
    result = snapshot(env)
    with env.Session() as db:
        result['history'] = sorted(tuple(str(getattr(r, c.name)) for c in models.PQPHistory.__table__.columns)
                                   for r in db.query(models.PQPHistory).all())
    return result


@pytest.mark.parametrize('module,operation', CASES)
def test_durable_audit_and_one_commit(prepared, module, operation):
    commits = []
    def committed(session):
        commits.append(1)
    event.listen(prepared.Session.class_, 'after_commit', committed)
    try:
        response = request(prepared, module, operation)
    finally:
        event.remove(prepared.Session.class_, 'after_commit', committed)
    assert response.status_code == 200, response.text
    assert commits == [1]
    with prepared.Session() as db:
        audit = db.query(models.AuditLog).filter_by(entity_type=TYPES[module]).one()
        assert audit.action == {'details': 'UPDATE_DETAIL'}.get(operation, operation.upper())
        assert audit.username == 'audit-writer' and audit.user_id and audit.timestamp
        if operation == 'delete':
            assert db.get(MODELS[module], audit.entity_id) is None
            assert json.loads(audit.old_value)
            if module == 'pqp':
                assert db.query(models.PQPHistory).count() == 0
        else:
            assert db.get(MODELS[module], audit.entity_id) is not None
            assert json.loads(audit.new_value)
        if operation == 'publish':
            assert json.loads(audit.old_value)['status'] == 'Not Submit'
            assert json.loads(audit.new_value)['status'] == 'Approved'
            assert db.query(models.PQPHistory).count() == 2


@pytest.mark.parametrize('module,operation', CASES)
@pytest.mark.parametrize('failure', ['audit_call', 'audit_object', 'audit_flush', 'commit'])
def test_failure_restores_record_history_and_audit(prepared, monkeypatch, module, operation, failure):
    before = full_snapshot(prepared)
    def fail(*args, **kwargs):
        raise RuntimeError('injected failure')
    rollbacks = []
    def rolled_back(session):
        rollbacks.append(1)
    def flush_failed(session, *args):
        if any(isinstance(r, models.AuditLog) for r in session.new):
            fail()
    event.listen(prepared.Session.class_, 'after_rollback', rolled_back)
    try:
        with monkeypatch.context() as patch:
            if failure == 'audit_call':
                patch.setattr(importlib.import_module(f'services.{module}_service'), 'log_audit', fail)
            elif failure == 'audit_object':
                import core.utils as utils
                patch.setattr(utils, 'AuditLog', fail)
            elif failure == 'commit':
                patch.setattr(prepared.Session.class_, 'commit', fail)
            else:
                event.listen(prepared.Session.class_, 'before_flush', flush_failed)
            try:
                assert request(prepared, module, operation).status_code == 500
            finally:
                if failure == 'audit_flush':
                    event.remove(prepared.Session.class_, 'before_flush', flush_failed)
    finally:
        event.remove(prepared.Session.class_, 'after_rollback', rolled_back)
    assert rollbacks
    assert full_snapshot(prepared) == before
    assert request(prepared, module, operation).status_code == 200


@pytest.mark.parametrize('module,operation', CASES)
def test_permission_refusal_is_unchanged(prepared, module, operation):
    with prepared.Session() as db:
        db.query(models.Role).filter_by(name='AuditWriter').one().permissions_rel = []
        db.commit()
    before = full_snapshot(prepared)
    assert request(prepared, module, operation).status_code == 403
    assert full_snapshot(prepared) == before


@pytest.mark.parametrize('module,operation', [(m, op) for m in ('pqp', 'obs', 'osd', 'fat')
                                            for op in ('update', 'delete')] + [('contractor', 'create'), ('contractor', 'delete')])
def test_repository_default_commit_contract(prepared, module, operation):
    repo_class = getattr(importlib.import_module(f'repositories.{module}_repository'), TYPES[module] + 'Repository')
    rid = 'unused' if module == 'contractor' else module
    with prepared.Session() as db:
        repo = repo_class(db)
        if operation == 'create':
            rid = 'repo-new'
            repo.create(models.Contractor(id=rid, name='Repository new', abbreviation='RN'))
        elif operation == 'delete':
            repo.delete(db.get(MODELS[module], rid))
        else:
            field = {'pqp': 'title', 'obs': 'description', 'osd': 'itemDescription', 'fat': 'equipment'}[module]
            repo.update(db.get(MODELS[module], rid), {field: 'Repository changed'})
        with prepared.Session() as fresh:
            row = fresh.get(MODELS[module], rid)
            if operation == 'delete':
                assert row is None
            else:
                assert row is not None
                if operation == 'update':
                    assert getattr(row, field) == 'Repository changed'
