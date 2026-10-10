"""Audit + contractors: a contractor-scoped create numbers on its own contractor (AUDIT-POLISH #13), and the Audit-only
contractor list GET /api/audit/contractors is gone (AUDIT-ENDPOINT-CLEANUP-2026-001 — every module, Audit included, now uses
GET /api/contractors/options; see test_contractor_options_http.py).

Real login/routes on a disposable file DB (fixture shared with test_audit_hardening_http); no main import, no development
database access.
"""
import models
from core.security import get_password_hash
from test_audit_hardening_http import create, env  # noqa: F401  (env is a fixture)

PW = 'Scope-Test-1234'  # isolated, test-only


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


def test_contractor_scoped_create_uses_its_own_contractor_for_name_and_number(env):
    with env.Session() as db:
        db.add(models.Contractor(id='alpha', name='Alpha Build', abbreviation='AB', status='active'))
        db.commit()
    add_user(env, 'alpha-writer', ['audit:view:all', 'audit:create:all'], vendor_id='alpha')
    login(env, 'alpha-writer')
    response = create(env, contractor='Audit vendor')  # another contractor's name in the request
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['vendor_id'], body['contractor']) == ('alpha', 'Alpha Build')
    assert body['auditNo'].split('-')[1] == 'AB'  # Alpha Build's abbreviation, not the vendor named in the request
    with env.Session() as db:
        assert db.query(models.ReferenceSequence).filter_by(vendor='AV').count() == 0  # no number drawn from the other sequence


def test_the_audit_only_contractor_list_is_gone(env):
    # /audit/contractors now falls through to /audit/{audit_id}: an audit with id "contractors" that does not exist
    response = env.client.get('/api/audit/contractors')
    assert response.status_code == 404, response.text
    assert response.json() == {'detail': 'Audit not found'}
    created = create(env).json()
    assert env.client.get(f"/api/audit/{created['id']}").status_code == 200  # the by-id route is unaffected
