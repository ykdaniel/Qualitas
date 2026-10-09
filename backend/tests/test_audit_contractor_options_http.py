"""GET /api/audit/contractors (AUDIT-CONTRACTORS-2026-001): contractor names for the Audit page with audit:view only.

Real login/routes on a disposable file DB (fixture shared with test_audit_hardening_http); no main import, no development
database access.
"""
import models
from core.security import get_password_hash
from test_audit_hardening_http import create, env  # noqa: F401  (env is a fixture)

PW = 'Options-Test-1234'  # isolated, test-only


def add_user(env, username, codes, vendor_id=None):
    with env.Session() as db:
        role = models.Role(name=f'role-{username}')
        role.permissions_rel = [db.query(models.Permission).filter_by(code=c).first() or models.Permission(code=c, description=c)
                                for c in codes]
        db.add(role)
        db.flush()
        db.add(models.User(username=username, email=f'{username}@example.com', is_active=True, role_id=role.id,
                           vendor_id=vendor_id, hashed_password=get_password_hash(PW)))
        db.commit()


def login(env, username):
    response = env.client.post('/api/auth/login', data={'username': username, 'password': PW})
    assert response.status_code == 200, response.text


def add_contractors(env):
    with env.Session() as db:
        db.add_all([models.Contractor(id='zeta', name='Zeta Works', abbreviation='ZW', status='inactive',
                                      contactPerson='Secret Person', phone='0900-000-000'),
                    models.Contractor(id='alpha', name='Alpha Build', abbreviation='AB', status='active')])
        db.commit()


def test_audit_only_role_gets_names_without_contractors_permission(env):
    add_contractors(env)
    assert env.client.get('/api/contractors/').status_code in (403, 404)  # the fixture role has no contractors:view:all
    response = env.client.get('/api/audit/contractors')
    assert response.status_code == 200, response.text
    rows = response.json()
    assert [r['name'] for r in rows] == ['Alpha Build', 'Audit vendor', 'Zeta Works']  # every contractor, by name
    assert {r['id']: r['status'] for r in rows}['zeta'] == 'inactive'  # the page filters active ones itself
    assert all(set(r) == {'id', 'name', 'status'} for r in rows)  # no contact details


def test_needs_audit_view(env):
    add_user(env, 'no-audit', ['ncr:view:all'])
    login(env, 'no-audit')
    assert env.client.get('/api/audit/contractors').status_code == 403


def test_contractor_scoped_user_sees_only_its_own_contractor(env):
    add_contractors(env)
    add_user(env, 'alpha-user', ['audit:view:all'], vendor_id='alpha')
    login(env, 'alpha-user')
    response = env.client.get('/api/audit/contractors')
    assert response.status_code == 200, response.text
    assert [r['id'] for r in response.json()] == ['alpha']


def test_get_by_id_route_still_works(env):
    created = create(env).json()
    response = env.client.get(f"/api/audit/{created['id']}")
    assert response.status_code == 200, response.text
    assert response.json()['auditNo'] == created['auditNo']
    assert env.client.get('/api/audit/does-not-exist').status_code == 404
