"""Coded save refusals over HTTP, batch 2b-1 (REFUSAL-DIALOG-2026-003).

- Router paths that used to let a service ValueError fall through to the global 500 handler now answer 400 through
  refusal_http (same body as any other uncoded 400).
- Duplicate names: a duplicate contractor or project name and a role renamed onto another role's name used to be 500s;
  every duplicate now answers DUPLICATE_NAME {docType, name[, field]} (audit templates stay 409). A meeting Rev clash is
  MEETING_REV_DUPLICATE {number, rev}.
- An upload refused by the record's state is 409 ATTACHMENT_LOCKED, like the delete.
- Module codes: NCR closure, NOI closure / contractor lock, ITR approval, Checklist results.
- The service-level 403s (ITP approve permission, NCR close permission) carry PERMISSION_DENIED.
Every English `detail` is unchanged; nothing is written by a refused save.

Throwaway SQLite file per test; no main import, seeding, scheduler or development database.
"""
import importlib
import json
import secrets
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from project_membership import TEST_PROJECT_ID, bind
from core import perms
from core.refusals import RefusalHTTPException, refusal_exception_handler
from core.security import get_password_hash
from database import Base, get_db

ROUTERS = ['auth', 'ncr', 'noi', 'itr', 'itp', 'pqp', 'obs', 'osd', 'meeting_minutes', 'km', 'fat', 'checklist', 'audit',
           'contractors', 'projects', 'iam', 'file_router']
WRITER_CODES = sorted({p['code'] for p in perms.ALL_PERMISSIONS} - {perms.NCR_CLOSE, perms.ITP_APPROVE})
NCR_NEW = {'description': 'd', 'rev': 'Rev1.0', 'submit': '2026-10-01', 'status': 'Open', 'raiseDate': '2026-10-01'}


def _app(S):
    app = FastAPI()
    for name in ROUTERS:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')
    app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    return app


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'refusal3.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        writer = models.Role(name='Writer')
        writer.permissions_rel = [models.Permission(code=c, description=c) for c in WRITER_CODES]
        admin = models.Role(name='Admin')
        admin.permissions_rel = [models.Permission(code=c, description=c) for c in (perms.NCR_CLOSE, perms.ITP_APPROVE)] + writer.permissions_rel
        db.add_all([writer, admin])
        db.flush()
        users = [models.User(username='writer', email='writer@example.com', is_active=True, role_id=writer.id,
                             hashed_password=get_password_hash(password), company_name='QA'),
                 models.User(username='admin', email='admin@example.com', is_active=True, role_id=admin.id,
                             hashed_password=get_password_hash(password), company_name='QA')]
        db.add_all(users)
        db.flush()
        bind(db, users[0])
        db.commit()
    clients = []

    def login(username='writer'):
        client = TestClient(_app(S), raise_server_exceptions=False)
        client.__enter__()
        clients.append(client)
        r = client.post('/api/auth/login', data={'username': username, 'password': password})
        assert r.status_code == 200, r.text
        return client

    yield SimpleNamespace(Session=S, login=login)
    for c in clients:
        c.__exit__(None, None, None)
    engine.dispose()


def _add(env, *rows):
    for row in rows:
        if not isinstance(row, (models.Project, models.Contractor)) and hasattr(row, 'project_id') and getattr(row, 'project_id', None) is None:
            row.project_id = TEST_PROJECT_ID
    with env.Session() as db:
        db.add_all(rows)
        db.commit()


def _refused(r, status, code):
    assert r.status_code == status, r.text
    body = r.json()
    assert body.get('code') == code, body
    assert isinstance(body['detail'], str) and body['detail']
    return body


# ---- router paths that used to be 500 on a service ValueError ------------------------------------------------------

PATHS = [
    ('services.pqp_service', 'PQPService', 'create_pqp', 'post', '/api/pqp/', {'title': 't', 'vendor': '', 'status': 'Draft'}),
    ('services.pqp_service', 'PQPService', 'delete_pqp', 'delete', '/api/pqp/p1', None),
    ('services.obs_service', 'OBSService', 'create_obs', 'post', '/api/obs/', {'subject': 's', 'description': 'd', 'rev': 'Rev1.0', 'submit': '2026-10-01', 'status': 'Open'}),
    ('services.obs_service', 'OBSService', 'delete_obs', 'delete', '/api/obs/b1', None),
    ('services.osd_service', 'OSDService', 'create_osd', 'post', '/api/osd/', {'itemDescription': 'i', 'status': 'Open'}),
    ('services.osd_service', 'OSDService', 'delete_osd', 'delete', '/api/osd/d1', None),
    ('services.meeting_minutes_service', 'MeetingMinutesService', 'create_meeting_minutes', 'post', '/api/meeting-minutes/', {'title': 't', 'status': 'Draft'}),
    ('services.km_service', 'KMService', 'create_article', 'post', '/api/km/', {'title': 't', 'content': 'c'}),
    ('services.km_service', 'KMService', 'delete_article', 'delete', '/api/km/k1', None),
    ('services.fat_service', 'FATService', 'delete_fat', 'delete', '/api/fat/f1', None),
    ('services.fat_service', 'FATService', 'update_fat_detail', 'put', '/api/fat/f1/details', []),
    ('services.itp_service', 'ITPService', 'create_itp', 'post', '/api/itp/', {'description': 'd', 'status': 'Draft'}),
    ('services.itp_service', 'ITPService', 'update_itp_detail', 'put', '/api/itp/i1/detail', {'a': [], 'b': [], 'c': []}),
    # R1 P3-6: km update (the service maps its own errors, but anything it lets through is a 400) and FAT create (used to catch Refusal only)
    ('services.km_service', 'KMService', 'update_article', 'put', '/api/km/k1', {'content': 'c'}),
    ('services.fat_service', 'FATService', 'create_fat', 'post', '/api/fat/', {'equipment': 'Pump', 'status': 'Planned', 'supplier': '', 'startDate': '2026-10-01', 'endDate': '2026-10-02'}),
]


@pytest.mark.parametrize('module,cls,method,verb,url,body', PATHS, ids=[p[2] for p in PATHS])
def test_a_service_value_error_is_a_plain_400_not_a_500(env, monkeypatch, module, cls, method, verb, url, body):
    service = getattr(importlib.import_module(module), cls)

    def refuse(*_a, **_k):
        raise ValueError('refused by the service')
    monkeypatch.setattr(service, method, refuse)
    c = env.login('admin')
    r = getattr(c, verb)(url, json=body) if body is not None else getattr(c, verb)(url)
    assert r.status_code == 400, r.text
    assert r.json() == {'detail': 'refused by the service'}


# ---- duplicate names ------------------------------------------------------------------------------------------------

def test_duplicate_contractor_name_is_a_coded_400_not_a_500(env):
    _add(env, models.Contractor(id='c1', name='Hailong', status='active'), models.Contractor(id='c2', name='Other', status='active'))
    c = env.login('admin')
    body = _refused(c.post('/api/contractors/', json={'name': 'Hailong'}), 400, 'DUPLICATE_NAME')
    assert body['detail'] == "A contractor named 'Hailong' already exists."
    assert body['params'] == {'docType': 'contractor', 'name': 'Hailong'}
    body = _refused(c.put('/api/contractors/c2', json={'name': 'Hailong'}), 400, 'DUPLICATE_NAME')
    assert body['params'] == {'docType': 'contractor', 'name': 'Hailong'}
    with env.Session() as db:
        assert db.get(models.Contractor, 'c2').name == 'Other' and db.query(models.Contractor).count() == 2


def test_duplicate_project_name_is_a_coded_400_not_a_500(env):
    _add(env, models.Project(id='pr1', name='Tower', code='TW'))
    body = _refused(env.login('admin').post('/api/projects/', json={'name': 'Tower', 'code': 'TW2'}), 400, 'DUPLICATE_NAME')
    assert body['detail'] == "A project named 'Tower' already exists."
    assert body['params'] == {'docType': 'project', 'name': 'Tower'}


def test_personnel_duplicate(env):
    _add(env, models.Contractor(id='c1', name='Hailong', status='active'),
         models.ContractorPersonnel(id='pp1', contractor_id='c1', name='Lee Wei', is_active=True))
    body = _refused(env.login('admin').post('/api/contractors/c1/personnel', json={'name': 'lee wei'}), 400, 'DUPLICATE_NAME')
    assert body['detail'] == "'lee wei' is already on this company's personnel list."
    assert body['params'] == {'docType': 'personnel', 'name': 'lee wei'}


def test_role_duplicate_on_create_and_on_rename(env):
    c = env.login('admin')
    body = _refused(c.post('/api/iam/roles/', json={'name': 'Writer', 'permission_ids': []}), 400, 'DUPLICATE_NAME')
    assert body['detail'] == 'Role already exists'
    assert body['params'] == {'docType': 'role', 'name': 'Writer'}
    r = c.post('/api/iam/roles/', json={'name': 'Inspector', 'permission_ids': []})
    assert r.status_code == 200, r.text
    body = _refused(c.put(f"/api/iam/roles/{r.json()['id']}/", json={'name': 'Writer'}), 400, 'DUPLICATE_NAME')    # used to be a 500
    assert body['detail'] == 'Role already exists'
    assert body['params'] == {'docType': 'role', 'name': 'Writer'}


def test_user_email_and_username_duplicates(env):
    c = env.login('admin')
    base = {'password': 'Str0ng!Passw0rd-x', 'company_name': 'QA', 'full_name': 'X'}
    body = _refused(c.post('/api/iam/users/', json={**base, 'username': 'newbie', 'email': 'writer@example.com'}), 400, 'DUPLICATE_NAME')
    assert body['detail'] == 'Email already registered'
    assert body['params'] == {'docType': 'user', 'field': 'email', 'name': 'writer@example.com'}
    body = _refused(c.post('/api/iam/users/', json={**base, 'username': 'writer', 'email': 'new@example.com'}), 400, 'DUPLICATE_NAME')
    assert body['detail'] == 'Username already registered'
    assert body['params'] == {'docType': 'user', 'field': 'username', 'name': 'writer'}


def test_audit_template_duplicate_stays_409(env):
    c = env.login('admin')
    item = {'no': '1', 'task': 'Is the site tidy?'}
    assert c.post('/api/audit/templates', json={'name': 'ISO 9001', 'items': [item]}).status_code == 200
    body = _refused(c.post('/api/audit/templates', json={'name': ' iso 9001 ', 'items': [item]}), 409, 'DUPLICATE_NAME')
    assert body['detail'] == "A template named 'iso 9001' already exists."
    assert body['params'] == {'docType': 'auditTemplate', 'name': 'iso 9001'}


def test_meeting_rev_duplicate(env, monkeypatch):
    import db_migrations
    monkeypatch.setattr(db_migrations, 'engine', env.Session.kw['bind'])
    db_migrations._loosen_meeting_minutes_documentNumber_unique()     # the production (documentNumber, rev) unique index
    _add(env, models.MeetingMinutes(id='m1', documentNumber='MOM-1', rev='1.0', status='Draft'),
         models.MeetingMinutes(id='m2', documentNumber='MOM-1', rev='2.0', status='Draft'))
    body = _refused(env.login().put('/api/meeting-minutes/m2', json={'rev': '1.0'}), 400, 'MEETING_REV_DUPLICATE')
    assert body['detail'] == "Rev '1.0' already exists for meeting minute 'MOM-1' — choose another rev."
    assert body['params'] == {'number': 'MOM-1', 'rev': '1.0'}


# ---- upload refused by the record's state ---------------------------------------------------------------------------

def test_upload_to_an_approved_itr_is_coded_409(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='Approved'))
    r = env.login().post('/api/files/upload', data={'entity_type': 'itr', 'entity_id': 'i1', 'category': 'attachment'},
                         files=[('files', ('a.txt', b'hello', 'text/plain'))])
    body = _refused(r, 409, 'ATTACHMENT_LOCKED')
    assert body['detail'] == 'Cannot change attachments of a Approved ITR: the record is locked.'
    assert body['params'] == {'kind': 'record', 'docType': 'ITR', 'status': 'Approved'}


# ---- module codes -----------------------------------------------------------------------------------------------------

def test_ncr_close_missing_fields(env):
    _add(env, models.NCR(id='n1', documentNumber='NCR-1', status='Open', raiseDate='2026-10-01'))
    body = _refused(env.login('admin').put('/api/ncr/n1/', json={'status': 'Closed'}), 400, 'NCR_CLOSE_MISSING_FIELDS')
    assert body['detail'].startswith('Cannot close NCR: the following required fields are missing: productDisposition (產品處置)')
    p = body['params']
    assert p['fields'][0] == 'productDisposition' and p['labelsZh'][0] == '產品處置' and p['labelsEn'][0] == 'Product disposition'
    assert 'improvementPhotos' in p['fields'] and p['reason'] == 'noPhoto' and p['photoProblems'] == []
    with env.Session() as db:
        assert db.get(models.NCR, 'n1').status == 'Open'


def test_ncr_close_without_the_close_permission_is_permission_denied(env):
    _add(env, models.NCR(id='n1', documentNumber='NCR-1', status='Open', raiseDate='2026-10-01'))
    body = _refused(env.login('writer').put('/api/ncr/n1/', json={'status': 'Closed'}), 403, 'PERMISSION_DENIED')
    assert body['detail'] == f'Operation not permitted. Required: {perms.NCR_CLOSE}'
    assert body['params'] == {'permissions': [perms.NCR_CLOSE]}


def test_itp_approve_without_permission_is_permission_denied(env):
    _add(env, models.ITP(id='i1', referenceNo='ITP-1', status='Draft'))
    body = _refused(env.login('writer').put('/api/itp/i1/', json={'status': 'Approved'}), 403, 'PERMISSION_DENIED')
    assert body['detail'] == f'Operation not permitted. Required: {perms.ITP_APPROVE}'
    assert body['params'] == {'permissions': [perms.ITP_APPROVE]}


def test_noi_close_with_open_itrs_and_ncrs(env):
    _add(env, models.NOI(id='o1', referenceNo='NOI-1', status='Resolved'),
         models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', noiNumber='NOI-1'))
    body = _refused(env.login('admin').put('/api/noi/o1/', json={'status': 'Closed'}), 400, 'NOI_CLOSE_OPEN_ITRS')
    assert body['detail'] == ("Cannot close NOI 'NOI-1': 1 ITR(s) still in progress. "
                              "Please ensure all linked ITRs are Approved or Void first.")
    assert body['params'] == {'number': 'NOI-1', 'count': 1}
    with env.Session() as db:
        db.get(models.ITR, 'i1').status = 'Approved'
        db.add(models.NCR(id='n1', documentNumber='NCR-1', status='Open', noiNumber='NOI-1', project_id=TEST_PROJECT_ID))
        db.commit()
    body = _refused(env.login('admin').put('/api/noi/o1/', json={'status': 'Closed'}), 400, 'NOI_CLOSE_OPEN_NCRS')
    assert body['params'] == {'number': 'NOI-1', 'count': 1, 'ncrs': ['NCR-1']}
    assert body['detail'].startswith("Cannot close NOI 'NOI-1': 1 NCR(s) still open: NCR-1.")


def test_itr_approve_without_a_checklist(env):
    _add(env, models.NOI(id='o1', referenceNo='NOI-1', status='Open'),
         models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', noiNumber='NOI-1'))
    body = _refused(env.login('admin').put('/api/itr/i1', json={'status': 'Approved'}), 400, 'ITR_APPROVE_NO_CHECKLIST')
    assert body['detail'] == 'Cannot approve ITR without any linked checklists'
    assert body['params'] == {}
    with env.Session() as db:
        assert db.get(models.ITR, 'i1').status == 'In Progress'


def test_itr_approve_with_a_checklist_not_passed(env):
    _add(env, models.NOI(id='o1', referenceNo='NOI-1', status='Open'),
         models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', noiNumber='NOI-1'),
         models.Checklist(id='k1', recordsNo='CHK-1', itrId='i1', itrNumber='ITR-1', status='Ongoing'))
    body = _refused(env.login('admin').put('/api/itr/i1', json={'status': 'Approved'}), 400, 'ITR_APPROVE_CHECKLIST_NOT_PASSED')
    assert body['detail'] == 'Cannot approve ITR — checklist(s) not passed: CHK-1 (Ongoing)'
    assert body['params'] == {'checklists': ['CHK-1 (Ongoing)']}


def test_checklist_results_locked_on_a_pass_checklist(env):
    items = json.dumps({'items': [{'description': 'Weld', 'result': 'pass'}]})
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'),
         models.Checklist(id='k1', recordsNo='CHK-1', itrId='i1', itrNumber='ITR-1', status='Pass', passCount=1, failCount=0, detail_data=items))
    new_items = json.dumps({'items': [{'description': 'Weld', 'result': 'fail'}]})
    body = _refused(env.login('admin').put('/api/checklist/k1', json={'detail_data': new_items}), 400, 'CHECKLIST_RESULTS_LOCKED')
    assert body['detail'] == ("Cannot modify inspection results on a Pass/Fail Checklist — use Reopen (a status-only change back to "
                              "Ongoing) first, then save the results.")
    assert body['params'] == {'number': 'CHK-1', 'status': 'Pass'}


def test_checklist_results_inconsistent(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'),
         models.Checklist(id='k1', recordsNo='CHK-1', itrId='i1', itrNumber='ITR-1', status='Ongoing', passCount=0, failCount=0,
                          detail_data=json.dumps({'items': [{'description': 'Weld', 'result': ''}]})))
    body = _refused(env.login('admin').put('/api/checklist/k1', json={'status': 'Pass'}), 400, 'CHECKLIST_RESULTS_INCONSISTENT')
    assert body['detail'].startswith("Cannot save Checklist 'CHK-1' as Pass: ")
    assert body['detail'].endswith('. Status and counts must follow the actual item results.')
    assert body['params']['number'] == 'CHK-1' and body['params']['status'] == 'Pass' and body['params']['problems']


def test_noi_contractor_locked(env):
    _add(env, models.Contractor(id='v1', name='Accept Co', status='active'), models.Contractor(id='v2', name='Beta Co', status='active'),
         models.NOI(id='o1', referenceNo='NOI-1', status='Open', vendor_id='v1'),
         models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', noiNumber='NOI-1'))
    body = _refused(env.login('admin').put('/api/noi/o1/', json={'contractor': 'Beta Co'}), 400, 'NOI_CONTRACTOR_LOCKED')
    assert body['detail'] == "Cannot change the contractor of NOI 'NOI-1': 1 ITR(s) already filed under it."
    assert body['params'] == {'number': 'NOI-1', 'references': [{'type': 'ITR', 'count': 1}]}
    with env.Session() as db:
        assert db.get(models.NOI, 'o1').vendor_id == 'v1'


def test_ncr_close_not_verified_and_needs_owner_approval():
    """The two later closure gates, on the service function itself (the photo gate in front of them needs stored attachments)."""
    from core.refusals import Refusal
    from services.ncr_service import assert_closure_conditions
    final = {'productDisposition': 'Repair', 'repairMethodStatement': 'grind', 'reInspectionNumber': 'ITR-2', 'drawingNo': 'D1',
             'specNo': 'S1', 'qtyAffected': '1', 'extent': 'local'}
    with pytest.raises(Refusal) as e:
        assert_closure_conditions(final, (1, []))
    assert (e.value.code, e.value.params) == ('NCR_CLOSE_NOT_VERIFIED', {})
    assert str(e.value) == "Cannot close NCR: corrective-action effectiveness must be verified (effectivenessVerified = 'Yes') before closing."
    with pytest.raises(Refusal) as e:
        assert_closure_conditions({**final, 'effectivenessVerified': 'Yes'}, (1, []))
    assert (e.value.code, e.value.params) == ('NCR_CLOSE_NEEDS_OWNER_APPROVAL', {'disposition': 'Repair'})
    assert str(e.value) == ("Cannot close NCR: disposition 'Use As Is' or 'Repair' requires owner/engineering authority approval "
                            "(ownerApproval = 'Approved') before closing.")
    assert_closure_conditions({**final, 'effectivenessVerified': 'Yes', 'ownerApproval': 'Approved'}, (1, []))     # all gates met: no refusal


def test_a_not_null_project_name_is_not_called_a_duplicate():
    """R1 P3-1: only the UNIQUE clash on projects.name is DUPLICATE_NAME; a NOT NULL failure is left as it was."""
    from sqlalchemy.exc import IntegrityError
    from services.project_service import _code_clash
    err = IntegrityError("UPDATE", {}, Exception("NOT NULL constraint failed: projects.name"))
    assert _code_clash(err, "AB", None) is err
