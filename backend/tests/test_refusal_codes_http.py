"""Coded delete refusals over HTTP (REFUSAL-DIALOG-2026-001).

Every refused delete answers its usual status and the SAME English `detail` as before, plus a stable `code` and its
`params` (backend/core/refusals.py), which the frontend translates in the refusal dialog. Also covered:
- ITP delete while NOIs cite it, and project delete while records reference it, are 400 refusals now — both used to
  fall through to 500 (their routes did not map the service's ValueError);
- a missing permission (RoleChecker) is 403 with code PERMISSION_DENIED and the permission code;
- without the handler (an app that does not register it) the body is exactly the old `{"detail": ...}`;
- a ValueError that is not a Refusal still maps to a plain 400 with no code.
Nothing is deleted by a refused request.

Throwaway SQLite file per test; no main import, seeding, scheduler or development database.
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
from core import perms
from core.refusals import Refusal, RefusalHTTPException, refusal_exception_handler, refusal_http
from core.security import get_password_hash
from database import Base, get_db

ROUTERS = ['auth', 'ncr', 'noi', 'itr', 'itp', 'checklist', 'audit', 'meeting_minutes', 'followup', 'contractors', 'projects',
           'iam', 'file_router']
DELETE_CODES = [perms.OBS_UPDATE, perms.NCR_DELETE, perms.NOI_DELETE, perms.ITR_DELETE, perms.ITR_UPDATE, perms.ITP_DELETE, perms.CHECKLIST_DELETE, perms.AUDIT_DELETE,
                perms.MEETING_DELETE, perms.MEETING_VIEW, perms.MEETING_UPDATE, perms.FOLLOWUP_DELETE,
                perms.CONTRACTOR_MANAGE, perms.ROLE_MANAGE]


def _app(S, with_handler=True):
    app = FastAPI()
    for name in ROUTERS:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')
    if with_handler:
        app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    return app


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'refusal.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        deleter = models.Role(name='Deleter')
        deleter.permissions_rel = [models.Permission(code=c, description=c) for c in DELETE_CODES]
        db.add_all([deleter, models.Role(name='Nobody')])
        db.flush()
        db.add_all([
            models.User(username='deleter', email='deleter@example.test', is_active=True, role_id=deleter.id,
                        hashed_password=get_password_hash(password), company_name='QA'),
            models.User(username='nobody', email='nobody@example.test', is_active=True,
                        role_id=db.query(models.Role).filter_by(name='Nobody').one().id,
                        hashed_password=get_password_hash(password), company_name='QA'),
        ])
        db.commit()
    clients = []

    def login(username, with_handler=True):
        client = TestClient(_app(S, with_handler), raise_server_exceptions=False)
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
    with env.Session() as db:
        db.add_all(rows)
        db.commit()


def _exists(env, model, rid):
    with env.Session() as db:
        return db.get(model, rid) is not None


def _refused(r, status, code):
    assert r.status_code == status, r.text
    body = r.json()
    assert body['code'] == code, body
    assert isinstance(body['detail'], str) and body['detail']
    return body


# ---- NCR ------------------------------------------------------------------------------------------------------------

def test_ncr_not_void(env):
    _add(env, models.NCR(id='n1', documentNumber='NCR-1', status='Open'))
    body = _refused(env.login('deleter').delete('/api/ncr/n1/'), 400, 'DELETE_NOT_VOID')
    assert body['detail'] == "Cannot delete NCR 'NCR-1' with status 'Open'. Please Void the NCR first, then delete."
    assert body['params'] == {'docType': 'NCR', 'number': 'NCR-1', 'status': 'Open', 'allowed': ['Void']}
    assert _exists(env, models.NCR, 'n1')


def test_ncr_cited_by_itr(env):
    _add(env, models.NCR(id='n1', documentNumber='NCR-1', status='Void'),
         models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', ncrNumber='NCR-1'))
    body = _refused(env.login('deleter').delete('/api/ncr/n1/'), 400, 'DELETE_REFERENCED')
    assert body['detail'] == "Cannot delete NCR 'NCR-1': referenced by 1 ITR record(s)"
    assert body['params'] == {'docType': 'NCR', 'number': 'NCR-1', 'references': [{'type': 'ITR', 'count': 1}]}
    assert _exists(env, models.NCR, 'n1')


# ---- NOI (the delete itself, under its write lock; the page's delete-check mirrors it) -------------------------------

def test_noi_cited(env):
    _add(env, models.NOI(id='o1', referenceNo='NOI-1', status='Open'),
         models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', noiNumber='NOI-1'))
    body = _refused(env.login('deleter').delete('/api/noi/o1/'), 400, 'DELETE_REFERENCED')
    assert body['detail'] == "Cannot delete NOI 'NOI-1': referenced by 1 ITR record(s)"
    assert body['params'] == {'docType': 'NOI', 'number': 'NOI-1', 'references': [{'type': 'ITR', 'count': 1}]}
    assert _exists(env, models.NOI, 'o1')


# ---- ITP and Project: used to be 500 --------------------------------------------------------------------------------

def test_itp_cited_by_noi_is_a_400_not_a_500(env):
    _add(env, models.ITP(id='p1', referenceNo='ITP-1', status='Draft'),
         models.NOI(id='o1', referenceNo='NOI-1', itpNo='ITP-1', status='Open'))
    body = _refused(env.login('deleter').delete('/api/itp/p1/'), 400, 'DELETE_REFERENCED')
    assert body['detail'] == "Cannot delete ITP 'ITP-1': referenced by 1 NOI record(s)"
    assert body['params']['references'] == [{'type': 'NOI', 'count': 1}]
    assert _exists(env, models.ITP, 'p1')


def test_project_with_records_is_a_400_not_a_500(env):
    _add(env, models.Project(id='pr1', name='Tower'), models.NCR(id='n1', documentNumber='NCR-1', status='Open', project_id='pr1'))
    body = _refused(env.login('deleter').delete('/api/projects/pr1'), 400, 'DELETE_REFERENCED')
    assert body['detail'] == "Cannot delete project 'Tower': referenced by 1 NCR record(s)"
    assert body['params'] == {'docType': 'project', 'number': 'Tower', 'references': [{'type': 'NCR', 'count': 1}]}
    assert _exists(env, models.Project, 'pr1')


def test_unreferenced_itp_and_project_are_still_deleted(env):
    _add(env, models.ITP(id='p1', referenceNo='ITP-1', status='Draft'), models.Project(id='pr1', name='Tower'))
    c = env.login('deleter')
    assert c.delete('/api/itp/p1/').status_code == 200
    assert c.delete('/api/projects/pr1').status_code == 200
    assert not _exists(env, models.ITP, 'p1') and not _exists(env, models.Project, 'pr1')


# ---- ITR ------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize('status', ['Approved', 'Void'])
def test_itr_locked(env, status):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status=status))
    body = _refused(env.login('deleter').delete('/api/itr/i1'), 400, 'ITR_DELETE_LOCKED')
    assert body['params'] == {'number': 'ITR-1', 'status': status}
    assert body['detail'].startswith("Cannot delete ITR 'ITR-1': it is ")


def test_itr_approval_history(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', approvedBy='qa'))
    body = _refused(env.login('deleter').delete('/api/itr/i1'), 400, 'ITR_DELETE_APPROVAL_HISTORY')
    assert body['params'] == {'number': 'ITR-1', 'eventCount': 0, 'rowHistory': ['approvedBy']}


def test_itr_reinspection_cited(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'),
         models.NCR(id='n1', documentNumber='NCR-1', status='Open', reInspectionNumber='ITR-1'))
    body = _refused(env.login('deleter').delete('/api/itr/i1'), 400, 'ITR_DELETE_REINSPECTION_CITED')
    assert body['params'] == {'number': 'ITR-1', 'ncrs': ['NCR-1']}


def test_itr_source_cited(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'),
         models.OBS(id='b1', documentNumber='OBS-1', itrNumber='ITR-1'))
    body = _refused(env.login('deleter').delete('/api/itr/i1'), 400, 'ITR_DELETE_SOURCE_CITED')
    assert body['params'] == {'number': 'ITR-1', 'refs': ['OBS-1'], 'hiddenCount': 0}


def test_itr_has_reinspections(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'),
         models.ITR(id='i2', documentNumber='ITR-2', status='In Progress', originalItrId='i1'))
    body = _refused(env.login('deleter').delete('/api/itr/i1'), 400, 'ITR_DELETE_HAS_REINSPECTIONS')
    assert body['params'] == {'number': 'ITR-1', 'children': ['ITR-2']}


def test_itr_checklist_evidence_and_unlink_evidence(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'),
         models.Checklist(id='c1', recordsNo='CHK-1', itrId='i1', status='Pass', passCount=1, failCount=0))
    c = env.login('deleter')
    body = _refused(c.delete('/api/itr/i1'), 400, 'ITR_DELETE_CHECKLIST_EVIDENCE')
    assert body['params'] == {'number': 'ITR-1', 'checklists': ['CHK-1']}
    body = _refused(c.delete('/api/itr/i1/link-checklist/c1'), 400, 'ITR_UNLINK_EVIDENCE')
    assert body['params'] == {'checklist': 'CHK-1'}
    assert _exists(env, models.ITR, 'i1') and _exists(env, models.Checklist, 'c1')


def test_itr_unlink_while_locked(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='Approved'),
         models.Checklist(id='c1', recordsNo='CHK-1', itrId='i1', status='Ongoing'))
    body = _refused(env.login('deleter').delete('/api/itr/i1/link-checklist/c1'), 400, 'ITR_UNLINK_LOCKED')
    assert body['params'] == {'number': 'ITR-1', 'status': 'Approved'}


# ---- Checklist ------------------------------------------------------------------------------------------------------

def test_checklist_itr_owned(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'),
         models.Checklist(id='c1', recordsNo='CHK-1', itrId='i1', itrNumber='ITR-1', status='Ongoing'))
    body = _refused(env.login('deleter').delete('/api/checklist/c1/'), 400, 'CHECKLIST_DELETE_ITR_OWNED')
    assert body['params'] == {'number': 'CHK-1', 'itr': 'ITR-1'}


def test_checklist_with_evidence(env):
    _add(env, models.Checklist(id='c1', recordsNo='CHK-1', status='Pass', passCount=1, failCount=0))
    body = _refused(env.login('deleter').delete('/api/checklist/c1/'), 400, 'CHECKLIST_DELETE_HAS_EVIDENCE')
    assert body['params'] == {'number': 'CHK-1'}


# ---- Audit / Meeting Minutes / Follow-up: Void first ---------------------------------------------------------------

def test_audit_not_void(env):
    _add(env, models.Audit(id='a1', auditNo='AUD-1', date='2026-10-01', status='Planned'))
    body = _refused(env.login('deleter').delete('/api/audit/a1'), 400, 'DELETE_NOT_VOID')
    assert body['params'] == {'docType': 'Audit', 'number': 'AUD-1', 'status': 'Planned', 'allowed': ['Void']}


def test_meeting_minutes_not_void_or_draft(env):
    _add(env, models.MeetingMinutes(id='m1', documentNumber='MOM-1', status='Published'))
    body = _refused(env.login('deleter').delete('/api/meeting-minutes/m1'), 400, 'DELETE_NOT_VOID')
    assert body['params'] == {'docType': 'MeetingMinutes', 'number': 'MOM-1', 'status': 'Published', 'allowed': ['Void', 'Draft']}


def test_followup_not_void(env):
    _add(env, models.FollowUp(id='f1', issueNo='FU-1', status='Open'))
    body = _refused(env.login('deleter').delete('/api/followup/f1'), 400, 'DELETE_NOT_VOID')
    assert body['params'] == {'docType': 'FollowUp', 'number': 'FU-1', 'status': 'Open', 'allowed': ['Void']}


# ---- Contractors / roles ---------------------------------------------------------------------------------------------

def test_contractor_referenced(env):
    _add(env, models.Contractor(id='v1', name='ACME', abbreviation='AC'), models.ITP(id='p1', referenceNo='ITP-1', vendor_id='v1'))
    body = _refused(env.login('deleter').delete('/api/contractors/v1'), 400, 'DELETE_REFERENCED')
    assert body['params'] == {'docType': 'contractor', 'number': 'ACME', 'references': [{'type': 'ITP', 'count': 1}]}


def test_contractor_with_personnel(env):
    _add(env, models.Contractor(id='v1', name='ACME', abbreviation='AC'),
         models.ContractorPersonnel(id='pp1', contractor_id='v1', name='Lee'))
    body = _refused(env.login('deleter').delete('/api/contractors/v1'), 400, 'CONTRACTOR_DELETE_HAS_PERSONNEL')
    assert body['params'] == {'name': 'ACME', 'count': 1}
    assert body['detail'] == "Contractor 'ACME' has 1 people on its personnel list. Set it inactive instead of deleting it."


def test_role_still_assigned(env):
    with env.Session() as db:
        role_id = db.query(models.Role).filter_by(name='Nobody').one().id
    body = _refused(env.login('deleter').delete(f'/api/iam/roles/{role_id}/', params={'reason': 'cleanup'}), 400, 'DELETE_REFERENCED')
    assert body['params'] == {'docType': 'role', 'number': 'Nobody', 'references': [{'type': 'User', 'count': 1}]}


def test_admin_role_protected(env):
    with env.Session() as db:
        db.add(models.Role(name='Admin'))
        db.commit()
        admin_id = db.query(models.Role).filter_by(name='Admin').one().id
    body = _refused(env.login('deleter').delete(f'/api/iam/roles/{admin_id}/', params={'reason': 'cleanup'}), 403, 'ROLE_ADMIN_PROTECTED')
    assert body['detail'] == 'Only an Admin can create, rename, modify or delete the Admin role'


# ---- attachments ----------------------------------------------------------------------------------------------------

def test_attachment_of_a_published_meeting_is_locked(env):
    _add(env, models.MeetingMinutes(id='m1', documentNumber='MOM-1', status='Published'),
         models.Attachment(id='att1', entity_type='meeting', entity_id='m1', file_name='a.pdf', file_path='x/a.pdf',
                           uploaded_at='2026-10-01T00:00:00'))
    body = _refused(env.login('deleter').delete('/api/files/att1'), 409, 'ATTACHMENT_LOCKED')
    assert body['params'] == {'kind': 'record', 'docType': 'MEETING', 'status': 'Published'}
    assert body['detail'] == 'Cannot change attachments of a Published MEETING: the record is locked.'


@pytest.mark.parametrize('status', ['Closed', 'Void'])
def test_attachment_of_a_closed_or_void_obs_is_locked(env, status):
    # OBS-ATTACH-LOCK-2026-001: every category, Closed and Void alike
    _add(env, models.OBS(id='b1', documentNumber='OBS-1', status=status),
         models.Attachment(id='att2', entity_type='obs', entity_id='b1', file_name='a.pdf', file_path='x/a.pdf', category='attachment',
                           uploaded_at='2026-10-01T00:00:00'))
    body = _refused(env.login('deleter').delete('/api/files/att2'), 409, 'ATTACHMENT_LOCKED')
    assert body['params'] == {'kind': 'record', 'docType': 'OBS', 'status': status}
    assert body['detail'] == f'Cannot change attachments of a {status} OBS: the record is locked.'


# ---- permission, compatibility --------------------------------------------------------------------------------------

def test_missing_permission_is_coded(env):
    _add(env, models.NCR(id='n1', documentNumber='NCR-1', status='Void'))
    body = _refused(env.login('nobody').delete('/api/ncr/n1/'), 403, 'PERMISSION_DENIED')
    assert body['detail'] == f'Operation not permitted. Required: {perms.NCR_DELETE}'
    assert body['params'] == {'permissions': [perms.NCR_DELETE]}
    assert _exists(env, models.NCR, 'n1')


def test_without_the_handler_the_body_is_the_old_detail_only(env):
    _add(env, models.NCR(id='n1', documentNumber='NCR-1', status='Open'))
    r = env.login('deleter', with_handler=False).delete('/api/ncr/n1/')
    assert r.status_code == 400
    assert r.json() == {'detail': "Cannot delete NCR 'NCR-1' with status 'Open'. Please Void the NCR first, then delete."}


def test_refusal_http_maps_plain_value_errors_as_before():
    plain = refusal_http(ValueError('nope'))
    assert not isinstance(plain, RefusalHTTPException) and plain.status_code == 400 and plain.detail == 'nope'
    coded = refusal_http(Refusal('X_CODE', 'nope', a=1), 409)
    assert isinstance(coded, RefusalHTTPException)
    assert (coded.status_code, coded.detail, coded.code, coded.params) == (409, 'nope', 'X_CODE', {'a': 1})
    assert isinstance(Refusal('X', 'm'), ValueError)


def test_main_registers_the_refusal_handler():
    # read, not imported: importing main runs start-up (backup, migrations, seeding) — see tests/isolation.py
    from pathlib import Path
    src = (Path(__file__).resolve().parents[1] / 'main.py').read_text(encoding='utf-8')
    assert 'app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)' in src
