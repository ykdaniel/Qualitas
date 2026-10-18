"""Company personnel lists (CONTRACTOR-PERSONNEL-2026-001, user 2026-10-11: "contractor 有人員 但不一定能進系統").

A company (contractor, owner or our own) keeps a list of its people — not system accounts. Managed with
contractors:manage:all (viewed with contractors:view:all); the meeting attendee picker reads the active ones through
/contractors/personnel/options (any signed-in user, name / position only). A contractor-scoped user only sees and changes
its own company's people. There is no delete — deactivate instead — and a company with people cannot be deleted.
Real login/routes on a disposable file DB; no main import, no development database access.
"""
import importlib
import secrets
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

import models
from core.security import get_password_hash
from database import Base, get_db

VIEW, MANAGE = 'contractors:view:all', 'contractors:manage:all'


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'personnel.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        db.add_all([
            models.Contractor(id='teco', name='TECO', abbreviation='TECO', status='Active'),
            models.Contractor(id='hl', name='Hailong', abbreviation='HL', status='active'),
            models.Contractor(id='empty', name='Empty Co', abbreviation='EC', status='active'),
        ])
        db.flush()

        def user(name, codes, vendor_id=None):
            role = models.Role(name=f'role-{name}')
            role.permissions_rel = [db.query(models.Permission).filter_by(code=c).first() or models.Permission(code=c, description=c)
                                    for c in codes]
            db.add(role)
            db.flush()
            db.add(models.User(username=name, email=f'{name}@example.com', is_active=True, role_id=role.id, vendor_id=vendor_id,
                               hashed_password=get_password_hash(password)))
            db.flush()
        user('manager', [VIEW, MANAGE])
        user('viewer', [VIEW])
        user('meeting-only', ['meeting:view:all'])
        user('teco-manager', [VIEW, MANAGE], vendor_id='teco')
        user('teco-meeting', ['meeting:view:all'], vendor_id='teco')
        db.commit()
    app = FastAPI()
    for name in ['auth', 'contractors']:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app, raise_server_exceptions=False) as client:
        def login(name):
            client.cookies.clear()
            r = client.post('/api/auth/login', data={'username': name, 'password': password})
            assert r.status_code == 200, r.text
        yield SimpleNamespace(client=client, login=login, Session=S, engine=engine)
    engine.dispose()


def add(env, company, **body):
    r = env.client.post(f'/api/contractors/{company}/personnel', json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_manage_a_company_list_and_deactivate_instead_of_delete(env):
    env.login('manager')
    toby = add(env, 'teco', name='  曾耀華(Toby Tseng) ', position='QAQC Manager', email='toby@teco.example.com', phone='02-1234')
    assert (toby['name'], toby['position'], toby['is_active'], toby['contractor_id']) == ('曾耀華(Toby Tseng)', 'QAQC Manager', True, 'teco')
    mac = add(env, 'teco', name='陳韋向(Mac Chen)', position='Project Manager')
    r = env.client.put(f"/api/contractors/personnel/{mac['id']}", json={'position': 'Project Manager & Contract Manager'})
    assert r.status_code == 200 and r.json()['position'] == 'Project Manager & Contract Manager'
    assert env.client.put(f"/api/contractors/personnel/{toby['id']}", json={'is_active': False}).json()['is_active'] is False
    active = env.client.get('/api/contractors/teco/personnel').json()
    assert [p['name'] for p in active] == ['陳韋向(Mac Chen)']
    everyone = env.client.get('/api/contractors/teco/personnel?include_inactive=true').json()
    assert [(p['name'], p['is_active']) for p in everyone] == [('陳韋向(Mac Chen)', True), ('曾耀華(Toby Tseng)', False)]
    assert env.client.put(f"/api/contractors/personnel/{toby['id']}", json={'is_active': True}).json()['is_active'] is True
    # no delete: deactivate instead
    assert env.client.delete(f"/api/contractors/personnel/{toby['id']}").status_code == 405
    with env.Session() as db:
        logs = db.query(models.AuditLog).filter_by(entity_type='ContractorPersonnel').all()
        assert len(logs) == 5


def test_names_are_required_and_unique_per_company(env):
    env.login('manager')
    add(env, 'teco', name='Toby Tseng')
    assert env.client.post('/api/contractors/teco/personnel', json={'name': 'toby tseng '}).status_code == 400
    assert env.client.post('/api/contractors/teco/personnel', json={'name': '   '}).status_code == 422
    assert env.client.post('/api/contractors/hl/personnel', json={'name': 'Toby Tseng'}).status_code == 200   # another company
    other = add(env, 'teco', name='Mac Chen')
    assert env.client.put(f"/api/contractors/personnel/{other['id']}", json={'name': 'TOBY TSENG'}).status_code == 400
    assert env.client.post('/api/contractors/nope/personnel', json={'name': 'X'}).status_code == 404
    assert env.client.put('/api/contractors/personnel/nope', json={'name': 'X'}).status_code == 404
    assert env.client.post('/api/contractors/teco/personnel', json={'name': 'x' * 121}).status_code == 422      # length limits
    assert env.client.post('/api/contractors/teco/personnel', json={'name': 'Long', 'phone': '1' * 61}).status_code == 422


def test_the_database_also_keeps_one_name_per_company(env):
    """Two requests at the same moment can both pass the service's check; the unique index on (company, lower(name))
    stops the second, and the API answers 400, not 500."""
    import sqlalchemy.exc
    with env.Session() as db:
        db.add(models.ContractorPersonnel(id='p1', contractor_id='teco', name='Toby Tseng', is_active=True))
        db.commit()
        db.add(models.ContractorPersonnel(id='p2', contractor_id='teco', name='TOBY TSENG', is_active=False))
        with pytest.raises(sqlalchemy.exc.IntegrityError):
            db.commit()


def test_permissions(env):
    env.login('manager')
    person = add(env, 'teco', name='Toby Tseng', position='QAQC Manager', email='toby@teco.example.com')
    env.login('viewer')
    assert env.client.get('/api/contractors/teco/personnel').status_code == 200
    assert env.client.post('/api/contractors/teco/personnel', json={'name': 'X'}).status_code == 403
    assert env.client.put(f"/api/contractors/personnel/{person['id']}", json={'is_active': False}).status_code == 403
    env.login('meeting-only')
    assert env.client.get('/api/contractors/teco/personnel').status_code == 403
    options = env.client.get('/api/contractors/personnel/options?contractor_id=teco')
    assert options.status_code == 200
    assert options.json() == [{'id': person['id'], 'contractor_id': 'teco', 'name': 'Toby Tseng', 'position': 'QAQC Manager'}]  # no email / phone


def test_options_are_active_people_only(env):
    env.login('manager')
    a = add(env, 'teco', name='Active One')
    b = add(env, 'teco', name='Left Already')
    add(env, 'hl', name='HL Person')
    env.client.put(f"/api/contractors/personnel/{b['id']}", json={'is_active': False})
    env.login('meeting-only')
    assert [p['id'] for p in env.client.get('/api/contractors/personnel/options?contractor_id=teco').json()] == [a['id']]
    assert {p['name'] for p in env.client.get('/api/contractors/personnel/options').json()} == {'Active One', 'HL Person'}


def test_a_contractor_scoped_user_only_sees_and_changes_its_own_company(env):
    env.login('manager')
    teco = add(env, 'teco', name='Toby Tseng')
    hl = add(env, 'hl', name='Daniel Huang')
    env.login('teco-meeting')
    assert [p['name'] for p in env.client.get('/api/contractors/personnel/options').json()] == ['Toby Tseng']
    assert env.client.get('/api/contractors/personnel/options?contractor_id=hl').json() == []
    env.login('teco-manager')
    assert env.client.get('/api/contractors/hl/personnel').status_code == 404
    assert env.client.post('/api/contractors/hl/personnel', json={'name': 'X'}).status_code == 404
    assert env.client.put(f"/api/contractors/personnel/{hl['id']}", json={'is_active': False}).status_code == 404
    assert env.client.post('/api/contractors/teco/personnel', json={'name': 'New TECO'}).status_code == 200
    assert env.client.put(f"/api/contractors/personnel/{teco['id']}", json={'position': 'QAQC'}).status_code == 200


def test_a_company_with_people_is_not_deleted(env):
    env.login('manager')
    add(env, 'teco', name='Toby Tseng')
    r = env.client.delete('/api/contractors/teco')
    assert r.status_code == 400 and 'Set it inactive' in r.json()['detail']
    with env.Session() as db:
        assert db.get(models.Contractor, 'teco') is not None
    assert env.client.delete('/api/contractors/empty').status_code == 200          # no people: deleted as before


def test_start_up_adds_the_table_to_an_existing_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if t.name != 'contractor_personnel'])
    assert 'contractor_personnel' not in inspect(engine).get_table_names()
    models.create_all_except_migration_owned(bind=engine)          # what start-up (main.py) runs
    names = {c['name'] for c in inspect(engine).get_columns('contractor_personnel')}
    assert names == {'id', 'contractor_id', 'name', 'position', 'email', 'phone', 'is_active', 'created_at', 'updated_at',
                     'row_version'}                             # optimistic lock (OPTIMISTIC-LOCK-2026-001)
    with engine.connect() as conn:
        indexes = {r[0] for r in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='contractor_personnel'")}
    assert {'ix_contractor_personnel_contractor_active', 'uq_contractor_personnel_name'} <= indexes
    engine.dispose()
