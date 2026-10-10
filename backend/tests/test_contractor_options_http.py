"""GET /api/contractors/options and GET /api/noi/contractor-contact/{id} (CONTRACTOR-OPTIONS-2026-001).

Real login/routes on a disposable file DB; no main import, no development database access.
"""
import importlib
import secrets
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core.security import get_password_hash
from database import Base, get_db


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'options.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        db.add_all([
            models.Contractor(id='zeta', name='Zeta Works', abbreviation='ZW', scope='Steel', status='Inactive',
                              contactPerson='Zed', phone='0900-000-001', email='zed@zeta.example.com', address='Secret Rd 1'),
            models.Contractor(id='alpha', name='Alpha Build', abbreviation='AB', scope='Civil', status='Active',
                              contactPerson='Amy', phone='0900-000-002', email='amy@alpha.example.com'),
            models.Contractor(id='beta', name='Beta MEP', abbreviation='BM', scope='MEP', status='active'),
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
        user('ncr-only', ['ncr:view:all'])
        user('noi-creator', ['noi:view:all', 'noi:create:all'])
        user('noi-editor', ['noi:view:all', 'noi:update:all'])
        user('noi-viewer', ['noi:view:all'])
        user('alpha-user', ['noi:view:all', 'noi:create:all'], vendor_id='alpha')
        user('no-perms', [])
        user('to-deactivate', ['noi:view:all', 'noi:create:all'])
        db.add(models.User(username='no-role', email='no-role@example.com', is_active=True, role_id=None,
                           hashed_password=get_password_hash(password)))
        db.commit()
    app = FastAPI()
    for name in ['auth', 'contractors', 'noi']:
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
        yield SimpleNamespace(client=client, login=login, Session=S)
    engine.dispose()


def test_any_signed_in_user_gets_picker_fields_only(env):
    env.login('ncr-only')
    r = env.client.get('/api/contractors/options')
    assert r.status_code == 200, r.text
    rows = r.json()
    assert [c['name'] for c in rows] == ['Alpha Build', 'Beta MEP', 'Zeta Works']  # all, ordered by name, inactive included
    assert all(set(c) == {'id', 'name', 'abbreviation', 'scope', 'status'} for c in rows)  # no contact details / address
    assert {c['id']: c['status'] for c in rows} == {'alpha': 'Active', 'beta': 'active', 'zeta': 'Inactive'}  # as stored
    assert env.client.get('/api/contractors/').status_code == 403  # the full list still needs contractors:view:all
    assert env.client.get('/api/contractors/alpha').status_code == 403


def test_a_user_with_no_permissions_still_gets_options(env):
    env.login('no-perms')
    assert env.client.get('/api/contractors/options').status_code == 200


def test_options_need_a_login(env):
    env.client.cookies.clear()
    assert env.client.get('/api/contractors/options').status_code == 401


def test_contractor_scoped_user_sees_only_its_own_contractor(env):
    env.login('alpha-user')
    assert [c['id'] for c in env.client.get('/api/contractors/options').json()] == ['alpha']


@pytest.mark.parametrize('name', ['noi-creator', 'noi-editor'])
def test_noi_writers_get_one_contractors_contact(env, name):
    env.login(name)
    r = env.client.get('/api/noi/contractor-contact/alpha')
    assert r.status_code == 200, r.text
    assert r.json() == {'id': 'alpha', 'contactPerson': 'Amy', 'phone': '0900-000-002', 'email': 'amy@alpha.example.com'}


def test_noi_viewer_and_others_cannot_read_contacts(env):
    for name in ('noi-viewer', 'ncr-only'):
        env.login(name)
        assert env.client.get('/api/noi/contractor-contact/alpha').status_code == 403


def test_unknown_or_out_of_scope_contractor_is_404(env):
    env.login('noi-creator')
    assert env.client.get('/api/noi/contractor-contact/nope').status_code == 404
    env.login('alpha-user')
    assert env.client.get('/api/noi/contractor-contact/zeta').status_code == 404
    assert env.client.get('/api/noi/contractor-contact/alpha').status_code == 200


def test_a_deactivated_user_is_refused_on_both_endpoints(env):
    env.login('to-deactivate')                       # token issued while still active
    with env.Session() as db:
        db.query(models.User).filter_by(username='to-deactivate').update({'is_active': False})
        db.commit()
    assert env.client.get('/api/contractors/options').status_code == 401
    assert env.client.get('/api/noi/contractor-contact/alpha').status_code == 401


def test_a_user_without_a_role_gets_options_but_not_contacts(env):
    env.login('no-role')
    assert env.client.get('/api/contractors/options').status_code == 200
    assert env.client.get('/api/noi/contractor-contact/alpha').status_code == 403
