"""Coded save refusals over HTTP (REFUSAL-DIALOG-2026-002, batch 2a: the six shared codes).

Every refused save answers its usual status and the SAME English `detail` as before, plus a stable `code` and its
`params` (backend/core/refusals.py), which the frontend translates in the refusal dialog:
- SCOPE_FORBIDDEN (403, core/scope.py ScopeForbidden, `reason`): still a 403, never caught as a 400 by `except ValueError`;
- INVALID_TRANSITION (docType, fromStatus, toStatus): the three existing English wordings are kept as they were;
- RECORD_LOCKED (docType, number, status, kind);
- REFERENCE_NOT_FOUND (docType, field, value): an out-of-scope link still answers exactly like a missing one;
- ASSIGNEE_UNAVAILABLE (field);
- VERSION_CONFLICT (docType, number): ITR stays 400, KM stays 409.
A ValueError that is not coded still maps to the plain `{"detail": ...}` of the same status, and without the handler
the body is exactly the old one. Nothing is written by a refused save.

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
from core.refusals import Coded, Refusal, RefusalHTTPException, refusal_exception_handler, refusal_http
from core.scope import ScopeForbidden
from core.security import get_password_hash
from database import Base, get_db

ROUTERS = ['auth', 'ncr', 'noi', 'itr', 'osd', 'audit', 'followup', 'obs', 'km']
CODES = [perms.NCR_VIEW, perms.NCR_CREATE, perms.NCR_UPDATE, perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE,
         perms.ITR_VIEW, perms.ITR_CREATE, perms.ITR_UPDATE, perms.OSD_VIEW, perms.OSD_UPDATE, perms.AUDIT_VIEW, perms.AUDIT_UPDATE,
         perms.FOLLOWUP_VIEW, perms.FOLLOWUP_UPDATE, perms.OBS_VIEW, perms.OBS_UPDATE, perms.KM_VIEW, perms.KM_UPDATE]


NCR_NEW = {'description': 'd', 'rev': 'Rev1.0', 'submit': '2026-10-01', 'status': 'Open', 'raiseDate': '2026-10-01'}
ITR_NEW = {'description': 'd', 'rev': 'Rev1.0', 'submit': '2026-10-01', 'status': 'In Progress'}
NOI_NEW = {'package': 'p', 'issueDate': '2026-10-01', 'inspectionTime': '09:00', 'inspectionDate': '2026-10-02', 'type': 'Inspection',
           'status': 'Open'}


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
    engine = create_engine(f"sqlite:///{tmp_path / 'refusal2.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        writer = models.Role(name='Writer')
        writer.permissions_rel = [models.Permission(code=c, description=c) for c in CODES]
        db.add(writer)
        db.flush()
        users = [models.User(username=name, email=f'{name}@example.test', is_active=True, role_id=writer.id,
                             hashed_password=get_password_hash(password), company_name='QA')
                 for name in ('writer', 'drifter')]
        users.append(models.User(username='gone', email='gone@example.test', is_active=False, role_id=writer.id,
                                 hashed_password=get_password_hash(password), company_name='QA'))
        db.add_all(users)
        db.flush()
        bind(db, users[0])          # 'writer' works in the shared test project; 'drifter' is in no project at all
        db.commit()
        gone_id = users[2].id
    clients = []

    def login(username='writer', with_handler=True):
        client = TestClient(_app(S, with_handler), raise_server_exceptions=False)
        client.__enter__()
        clients.append(client)
        r = client.post('/api/auth/login', data={'username': username, 'password': password})
        assert r.status_code == 200, r.text
        return client

    yield SimpleNamespace(Session=S, login=login, gone_id=gone_id)
    for c in clients:
        c.__exit__(None, None, None)
    engine.dispose()


def _add(env, *rows):
    for row in rows:
        if not isinstance(row, models.Project) and hasattr(row, 'project_id') and getattr(row, 'project_id', None) is None:
            row.project_id = TEST_PROJECT_ID
    with env.Session() as db:
        db.add_all(rows)
        db.commit()


def _get(env, model, rid):
    with env.Session() as db:
        return db.get(model, rid)


def _refused(r, status, code):
    assert r.status_code == status, r.text
    body = r.json()
    assert body.get('code') == code, body
    assert isinstance(body['detail'], str) and body['detail']
    return body


# ---- the mapping itself -------------------------------------------------------------------------------------------

def test_scope_forbidden_is_coded_but_not_a_value_error():
    e = ScopeForbidden("cannot reassign record to another contractor", "reassignContractor")
    assert isinstance(e, Coded) and not isinstance(e, ValueError)      # a router's `except ValueError -> 400` never catches it
    assert str(e) == "cannot reassign record to another contractor"
    h = refusal_http(e, 403)
    assert (h.status_code, h.detail, h.code, h.params) == (403, str(e), 'SCOPE_FORBIDDEN', {'reason': 'reassignContractor'})
    plain = refusal_http(ValueError("x"), 400)
    assert not isinstance(plain, RefusalHTTPException) and (plain.status_code, plain.detail) == (400, "x")
    assert isinstance(Refusal('X_CODE', 'm'), ValueError)


# ---- SCOPE_FORBIDDEN ------------------------------------------------------------------------------------------------

def test_create_without_a_working_project_is_scope_forbidden(env):
    body = _refused(env.login('drifter').post('/api/ncr/', json=NCR_NEW), 403, 'SCOPE_FORBIDDEN')
    assert body['detail'] == "You are not working in any project (not a project member, or no project chosen at sign-in)"
    assert body['params'] == {'reason': 'noWorkingProject'}
    with env.Session() as db:
        assert db.query(models.NCR).count() == 0


def test_moving_a_record_out_of_scope_is_scope_forbidden(env):
    _add(env, models.Project(id='P-OTHER', name='Other', code='OT'), models.OSD(id='d1', documentNumber='OSD-1', status='Open'))
    body = _refused(env.login().put('/api/osd/d1', json={'project_id': 'P-OTHER'}), 403, 'SCOPE_FORBIDDEN')
    assert body['detail'] == "cannot move record to a project outside your scope"
    assert body['params'] == {'reason': 'moveProjectOutsideScope'}
    assert _get(env, models.OSD, 'd1').project_id == TEST_PROJECT_ID


# ---- INVALID_TRANSITION (three English wordings, unchanged) -------------------------------------------------------

def test_invalid_transition_plain_wording(env):
    _add(env, models.OSD(id='d1', documentNumber='OSD-1', status='Void'))
    body = _refused(env.login().put('/api/osd/d1', json={'status': 'Open'}), 400, 'INVALID_TRANSITION')
    assert body['detail'] == "Invalid status transition from Void to Open"
    assert body['params'] == {'docType': 'OSD', 'fromStatus': 'Void', 'toStatus': 'Open'}
    assert _get(env, models.OSD, 'd1').status == 'Void'


def test_invalid_transition_entity_wording(env):
    _add(env, models.NOI(id='o1', referenceNo='NOI-1', status='Void'))
    body = _refused(env.login().put('/api/noi/o1/', json={'status': 'Open'}), 400, 'INVALID_TRANSITION')
    assert body['detail'] == "Invalid status transition for NOI from 'Void' to 'Open'"
    assert body['params'] == {'docType': 'NOI', 'fromStatus': 'Void', 'toStatus': 'Open'}
    assert _get(env, models.NOI, 'o1').status == 'Void'


def test_invalid_transition_quoted_wording(env):
    _add(env, models.Audit(id='a1', auditNo='AUD-1', status='Draft', date='2026-10-01'))
    body = _refused(env.login().put('/api/audit/a1', json={'status': 'Completed'}), 400, 'INVALID_TRANSITION')
    assert body['detail'] == "Invalid status transition from 'Draft' to 'Completed'"
    assert body['params'] == {'docType': 'Audit', 'fromStatus': 'Draft', 'toStatus': 'Completed'}
    assert _get(env, models.Audit, 'a1').status == 'Draft'


# ---- RECORD_LOCKED ------------------------------------------------------------------------------------------------

def test_closed_followup_is_locked(env):
    _add(env, models.FollowUp(id='f1', issueNo='FUI-1', status='Closed', description='old'))
    body = _refused(env.login().put('/api/followup/f1', json={'description': 'new'}), 400, 'RECORD_LOCKED')
    assert body['detail'] == "Cannot modify a closed FollowUp 'FUI-1' — no fields can be changed once it is closed."
    assert body['params'] == {'docType': 'FollowUp', 'number': 'FUI-1', 'status': 'Closed', 'kind': 'record'}
    assert _get(env, models.FollowUp, 'f1').description == 'old'


def test_closed_noi_is_locked(env):
    _add(env, models.NOI(id='o1', referenceNo='NOI-1', status='Closed', package='old'))
    body = _refused(env.login().put('/api/noi/o1/', json={'package': 'new'}), 400, 'RECORD_LOCKED')
    assert body['detail'] == "Cannot modify a closed NOI 'NOI-1' — no fields can be changed once an NOI is closed."
    assert body['params'] == {'docType': 'NOI', 'number': 'NOI-1', 'status': 'Closed', 'kind': 'record'}
    assert _get(env, models.NOI, 'o1').package == 'old'


def test_void_itr_is_locked(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='Void', remark='old'))
    body = _refused(env.login().put('/api/itr/i1', json={'remark': 'new'}), 400, 'RECORD_LOCKED')
    assert body['detail'] == "Cannot modify ITR 'ITR-1': it is Void (a locked record)."
    assert body['params'] == {'docType': 'ITR', 'number': 'ITR-1', 'status': 'Void', 'kind': 'record'}
    assert _get(env, models.ITR, 'i1').remark == 'old'


def test_closed_obs_evidence_is_locked(env):
    _add(env, models.OBS(id='b1', documentNumber='OBS-1', status='Closed', productDisposition='old'))
    body = _refused(env.login().put('/api/obs/b1', json={'productDisposition': 'new'}), 400, 'RECORD_LOCKED')
    assert body['detail'] == "Cannot modify improvement/photo evidence on a Closed observation"
    assert body['params'] == {'docType': 'OBS', 'number': 'OBS-1', 'status': 'Closed', 'kind': 'evidence'}
    assert _get(env, models.OBS, 'b1').productDisposition == 'old'


# ---- REFERENCE_NOT_FOUND ------------------------------------------------------------------------------------------

def test_missing_noi_on_itr_create(env):
    body = _refused(env.login().post('/api/itr/', json={**ITR_NEW, 'noiNumber': 'NOI-404'}), 400, 'REFERENCE_NOT_FOUND')
    assert body['detail'] == "NOI with reference number 'NOI-404' not found"
    assert body['params'] == {'docType': 'NOI', 'field': 'reference number', 'value': 'NOI-404'}
    with env.Session() as db:
        assert db.query(models.ITR).count() == 0


def test_out_of_scope_noi_answers_exactly_like_a_missing_one(env):
    _add(env, models.Project(id='P-OTHER', name='Other', code='OT'),
         models.NOI(id='o9', referenceNo='NOI-9', status='Open', project_id='P-OTHER'))
    c = env.login()
    hidden = _refused(c.post('/api/itr/', json={**ITR_NEW, 'noiNumber': 'NOI-9'}), 400, 'REFERENCE_NOT_FOUND')
    missing = _refused(c.post('/api/itr/', json={**ITR_NEW, 'noiNumber': 'NOI-404'}), 400, 'REFERENCE_NOT_FOUND')
    assert hidden['detail'] == "NOI with reference number 'NOI-9' not found"
    assert hidden['params'] == {'docType': 'NOI', 'field': 'reference number', 'value': 'NOI-9'}
    assert set(hidden) == set(missing) and hidden['params'].keys() == missing['params'].keys()


def test_missing_itp_through_the_shared_validator(env):
    body = _refused(env.login().post('/api/noi/', json={**NOI_NEW, 'itpNo': 'ITP-404'}), 400, 'REFERENCE_NOT_FOUND')
    assert body['detail'] == "ITP with reference number 'ITP-404' not found"
    assert body['params'] == {'docType': 'ITP', 'field': 'reference number', 'value': 'ITP-404'}


# ---- ASSIGNEE_UNAVAILABLE -----------------------------------------------------------------------------------------

def test_inactive_assignee(env):
    body = _refused(env.login().post('/api/ncr/', json={**NCR_NEW, 'assignedTo': env.gone_id}),
                    400, 'ASSIGNEE_UNAVAILABLE')
    assert body['detail'] == "指派對象不存在或已停用，請選擇啟用中的使用者 / Assignee is unavailable; select an active user."
    assert body['params'] == {'field': 'assignedTo'}
    with env.Session() as db:
        assert db.query(models.NCR).count() == 0


# ---- VERSION_CONFLICT ---------------------------------------------------------------------------------------------

# OPTIMISTIC-LOCK-2026-001 (user's decision 2026-10-18): VERSION_CONFLICT is always 409 now (it was a 400 for the ITR) and
# both carry the same English sentence. The ITR is checked on row_version (its old detail_data._version is no longer
# checked since B5); KM's version_no is one conditional UPDATE.
def test_stale_itr_version_is_a_409(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', remark='old', row_version=3,
                         detail_data=json.dumps({'_version': 3})))
    body = _refused(env.login().put('/api/itr/i1', json={'remark': 'new', 'row_version': 2,
                                                          'detail_data': json.dumps({'_version': 3})}), 409, 'VERSION_CONFLICT')
    assert body['detail'] == ("ITR ITR-1 was changed by someone else meanwhile (your version 2, stored version 3). "
                              "Reload it, then make your change again.")
    assert body['params'] == {'docType': 'ITR', 'number': 'ITR-1'}
    assert _get(env, models.ITR, 'i1').remark == 'old'
    assert _get(env, models.ITR, 'i1').row_version == 3


def test_stale_km_version_stays_a_409(env):
    _add(env, models.KMArticle(id='k1', title='Welding', content='old', version_no=4))
    body = _refused(env.login().put('/api/km/k1', json={'content': 'new', 'version_no': 3}), 409, 'VERSION_CONFLICT')
    assert body['detail'] == ("KM Welding was changed by someone else meanwhile (your version 3, stored version 4). "
                              "Reload it, then make your change again.")
    assert body['params'] == {'docType': 'KM', 'number': 'Welding'}
    assert _get(env, models.KMArticle, 'k1').content == 'old'
    assert _get(env, models.KMArticle, 'k1').version_no == 4


# ---- uncoded and handler-less answers are unchanged ---------------------------------------------------------------

def test_uncoded_refusal_is_the_plain_old_body(env):
    _add(env, models.ITR(id='i1', documentNumber='ITR-1', status='In Progress'))
    r = env.login().put('/api/itr/i1', json={'status': ''})
    assert r.status_code == 400, r.text
    assert r.json() == {'detail': 'ITR status cannot be empty.'}


def test_without_the_handler_the_body_is_exactly_the_old_one(env):
    _add(env, models.OSD(id='d1', documentNumber='OSD-1', status='Void'))
    r = env.login(with_handler=False).put('/api/osd/d1', json={'status': 'Open'})
    assert r.status_code == 400
    assert r.json() == {'detail': 'Invalid status transition from Void to Open'}
    r = env.login('drifter', with_handler=False).post('/api/ncr/', json=NCR_NEW)
    assert r.status_code == 403
    assert r.json() == {'detail': "You are not working in any project (not a project member, or no project chosen at sign-in)"}
