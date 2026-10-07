"""Five reviewed audit gaps: real login/routes, disposable DB, new-session assertions.

Only PQP/OBS/OSD/FAT creation and Contractor update are covered by this repair.
No main import, seeding, scheduler, uploads or development database access.
"""
import importlib
import json
import secrets
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import models
from database import Base, get_db
from core.security import get_password_hash

CASES = ['pqp', 'obs', 'osd', 'fat', 'contractor']
MODELS = dict(pqp=models.PQP, obs=models.OBS, osd=models.OSD, fat=models.FAT, contractor=models.Contractor)
TYPES = dict(pqp='PQP', obs='OBS', osd='OSD', fat='FAT', contractor='Contractor')
BODIES = {
    'pqp': dict(title='Reviewed plan', description='Plan', vendor='Audit vendor', status='Not Submit', version='Rev1.0', createdAt='2026-09-01', updatedAt='2026-09-01'),
    'obs': dict(description='Observation', rev='0', submit='', status='Open', vendor='Audit vendor', raiseDate='2026-09-01'),
    'osd': dict(status='Open', vendor='Audit vendor', itemDescription='Delivery'),
    'fat': dict(equipment='Equipment', supplier='Audit vendor', startDate='2026-09-01', endDate='2026-09-02'),
    'contractor': dict(contactPerson='New contact'),
}


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'audit.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        codes = ['pqp:create:all', 'obs:create:all', 'osd:create:all', 'fat:create:all', 'contractors:manage:all']
        role = models.Role(name='AuditWriter')
        role.permissions_rel = [models.Permission(code=c, description=c) for c in codes]
        db.add(role)
        db.flush()
        db.add(models.User(username='audit-writer', email='audit-writer@example.test', is_active=True,
                           role_id=role.id, hashed_password=get_password_hash(password)))
        db.add(models.Contractor(id='vendor', name='Audit vendor', abbreviation='AV', contactPerson='Old contact'))
        db.commit()
    app = FastAPI()
    for name in ['auth', 'pqp', 'obs', 'osd', 'fat', 'contractors']:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')
    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/auth/login', data={'username': 'audit-writer', 'password': password})
        assert response.status_code == 200, response.text
        yield SimpleNamespace(client=client, Session=S, app=app)
    engine.dispose()


def write(env, case):
    if case == 'contractor':
        return env.client.put('/api/contractors/vendor', json=BODIES[case])
    return env.client.post(f'/api/{case}/', json=BODIES[case])


def snapshot(env):
    with env.Session() as db:
        return {m.__tablename__: sorted([tuple(str(getattr(r, c.name)) for c in m.__table__.columns)
                                         for r in db.query(m).all()])
                for m in [*MODELS.values(), models.AuditLog, models.ReferenceSequence]}


@pytest.mark.parametrize('case', CASES)
def test_saved_data_has_matching_durable_audit(env, case):
    response = write(env, case)
    assert response.status_code == 200, response.text
    rid = response.json()['id']
    with env.Session() as db:
        assert db.get(MODELS[case], rid) is not None
        audit = db.query(models.AuditLog).filter_by(entity_type=TYPES[case], entity_id=rid).one()
        assert audit.action == ('UPDATE' if case == 'contractor' else 'CREATE')
        assert audit.username == 'audit-writer' and audit.user_id and audit.timestamp
        assert json.loads(audit.new_value)
        if case == 'contractor':
            assert json.loads(audit.old_value)['contactPerson'] == 'Old contact'
            assert json.loads(audit.new_value)['contactPerson'] == 'New contact'


@pytest.mark.parametrize('case', CASES)
@pytest.mark.parametrize('failure', ['audit_call', 'audit_object', 'audit_flush', 'commit'])
def test_failure_rolls_back_record_sequence_and_audit(env, monkeypatch, case, failure):
    before = snapshot(env)
    def fail(*args, **kwargs):
        raise RuntimeError('injected audit transaction failure')
    rollbacks = []
    def rolled_back(session):
        rollbacks.append(1)
    event.listen(env.Session.class_, 'after_rollback', rolled_back)
    with monkeypatch.context() as patch:
        if failure == 'audit_call':
            patch.setattr(importlib.import_module(f'services.{case}_service'), 'log_audit', fail)
        elif failure == 'audit_object':
            import core.utils as utils
            patch.setattr(utils, 'AuditLog', fail)  # strict logger must propagate construction failure
        elif failure == 'commit':
            patch.setattr(env.Session.class_, 'commit', fail)
        else:
            def fail_audit_flush(session, *args):
                if any(isinstance(r, models.AuditLog) for r in session.new):
                    fail()
            event.listen(env.Session.class_, 'before_flush', fail_audit_flush)
        try:
            response = write(env, case)
            assert response.status_code == 500, response.text
        finally:
            if failure == 'audit_flush':
                event.remove(env.Session.class_, 'before_flush', fail_audit_flush)
    event.remove(env.Session.class_, 'after_rollback', rolled_back)
    assert rollbacks  # service rolls back explicitly, not just session teardown
    assert snapshot(env) == before
    assert write(env, case).status_code == 200  # rollback releases locks and permits a clean retry


@pytest.mark.parametrize('case', CASES)
def test_success_commits_exactly_once(env, case):
    commits = []
    def committed(session):
        commits.append(1)
    event.listen(env.Session.class_, 'after_commit', committed)
    try:
        assert write(env, case).status_code == 200
    finally:
        event.remove(env.Session.class_, 'after_commit', committed)
    assert commits == [1]


@pytest.mark.parametrize('case', CASES)
def test_permission_refusal_changes_nothing(env, case):
    with env.Session() as db:
        db.query(models.Role).filter_by(name='AuditWriter').one().permissions_rel = []
        db.commit()
    before = snapshot(env)
    assert write(env, case).status_code == 403
    assert snapshot(env) == before


@pytest.mark.parametrize('case', CASES)
def test_repository_default_still_commits(env, case):
    repo_class = getattr(importlib.import_module(f'repositories.{case}_repository'), TYPES[case] + 'Repository')
    with env.Session() as db:
        repo = repo_class(db)
        if case == 'contractor':
            repo.update(db.get(models.Contractor, 'vendor'), {'contactPerson': 'Repository default'})
            rid = 'vendor'
        else:
            data = dict(BODIES[case])
            data.pop('vendor', None)
            data.pop('supplier', None)
            rid = 'repository-default'
            repo.create(MODELS[case](id=rid, vendor_id='vendor', **data))
        with env.Session() as fresh:
            row = fresh.get(MODELS[case], rid)
            assert row is not None
            if case == 'contractor':
                assert row.contactPerson == 'Repository default'
