"""Optimistic lock over HTTP (OPTIMISTIC-LOCK-2026-001, batch B1; DECISIONS 存檔的樂觀鎖：row_version).

Every editable record answers its `row_version` (KM: `version_no`; material: `rowVersion`) and a save may send the version it
was read at:
- two clients read version N; the first save wins (N+1), the second is 409 VERSION_CONFLICT {docType, number} and writes
  nothing;
- a save without a version: while ROW_VERSION_REQUIRED is off (the default, and the suites' setting — conftest) it is
  still accepted and still increments, logged "row_version missing: <table> <id>"; once it is on (B5) it is a 400
  VERSION_REQUIRED {docType, number} and writes nothing — for every save and every secondary write;
- secondary writes (ITP plan, FAT details, PQP publish, ITR revoke / create-ncr, user scope, document transition) check a
  version when sent and always increment; an ITR batch status change and a KM Word import are exempt (increment, never
  checked, logged or refused); an attachment upload does not touch the record;
- the ITR's old detail_data._version marker is stripped on input and no longer checked (B5) — an Approved ITR's Publish
  that echoes it is still accepted;
- the check and the increment are one statement: two sessions claiming the same version cannot both pass;
- migration step 31: the column is added to an older table, the ITR's detail_data._version is copied once (a value that
  is not a non-negative integer counts as 0).

Throwaway SQLite file per test; no main import, seeding, scheduler or development database.
"""
import importlib
import json
import logging
import secrets
import threading
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import models
from project_membership import TEST_PROJECT_ID, bind
from core import perms
from core.concurrency import bump_row_version, claim_row_version
from core.config import settings
from core.refusals import Refusal, RefusalHTTPException, refusal_exception_handler, refusal_http
from core.security import get_password_hash
from database import Base, get_db

ROUTERS = ['auth', 'ncr', 'noi', 'itr', 'itp', 'pqp', 'obs', 'osd', 'meeting_minutes', 'km', 'fat', 'checklist', 'audit',
           'followup', 'contractors', 'projects', 'iam', 'material_submittals', 'file_router', 'documents']
CODES = sorted({p['code'] for p in perms.ALL_PERMISSIONS})


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
    engine = create_engine(f"sqlite:///{tmp_path / 'optimistic.db'}", connect_args={'check_same_thread': False, 'timeout': 30})
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
        user = models.User(username='writer', email='writer@example.com', is_active=True, role_id=writer.id,
                           hashed_password=get_password_hash(password), company_name='QA')
        db.add(user)
        db.flush()
        bind(db, user)
        db.add(models.Contractor(id='v1', name='Hailong Construction', abbreviation='HL', status='active'))
        db.commit()
    clients = []

    def login():
        client = TestClient(_app(S), raise_server_exceptions=False)
        client.__enter__()
        clients.append(client)
        r = client.post('/api/auth/login', data={'username': 'writer', 'password': password})
        assert r.status_code == 200, r.text
        return client

    yield SimpleNamespace(Session=S, login=login, engine=engine)
    for c in clients:
        c.__exit__(None, None, None)
    engine.dispose()


_JSONISH = {"attachments", "attendees", "discussionLog", "detail_data", "custom_check_items", "agenda", "selected_templates",
            "findings", "support_auditors", "defectPhotos", "improvementPhotos", "progressPhotos", "photos", "items", "tags",
            "photoOrder", "advancedItems"}


def _filled(row):
    """A fixture row as the application writes it: every plain text column it leaves empty is '' (the read schemas want
    strings), created/updated timestamps set; JSON, key and id columns stay as given."""
    from sqlalchemy import String, Text
    if isinstance(row, (models.User, models.Role, models.AuditTemplate, models.KMArticle)):
        return row
    for col in row.__table__.columns:
        attr = next((a.key for a in row.__mapper__.column_attrs if a.columns[0] is col), None)
        if attr is None or getattr(row, attr) is not None or col.primary_key or col.foreign_keys:
            continue
        if not isinstance(col.type, (String, Text)) or col.name in _JSONISH or col.name.endswith("_id") or col.name.endswith("Id"):
            continue
        setattr(row, attr, "2026-10-17T00:00:00" if col.name.lower().replace("_", "") in ("createdat", "updatedat") else "")
    return row


def _add(env, *rows):
    for row in rows:
        if not isinstance(row, (models.Project, models.Contractor)) and hasattr(row, 'project_id') and getattr(row, 'project_id', None) is None:
            row.project_id = TEST_PROJECT_ID
        _filled(row)
    with env.Session() as db:
        db.add_all(rows)
        db.commit()


def _stored(env, model, pk, column='row_version'):
    with env.Session() as db:
        row = db.get(model, pk)
        return getattr(row, column), row


def _id_of(env, model, **filters):
    with env.Session() as db:
        return db.query(model).filter_by(**filters).one().id


def _register_material(env, c):
    r = c.post('/api/material-submittals/register', json={
        'projectId': TEST_PROJECT_ID, 'vendorId': 'v1', 'name': 'Fire stop sealant', 'brand': 'A', 'model': 'FS-200',
        'category': 'Fire', 'resultCode': 'Approved', 'approvedDate': '2026-10-01', 'decisionMaker': 'Consultant A',
        'externalDocNo': 'EXT-001'})
    assert r.status_code == 200, r.text
    return r.json()['submittalId']


# (case id, model, table, seed rows, url(env, c), field, old, new, docType, number, version key in the API, start version)
def _seed_basic(env):
    _add(env,
         models.NCR(id='n1', documentNumber='NCR-1', status='Open', description='old', raiseDate='2026-10-01'),
         models.NOI(id='o1', referenceNo='NOI-1', status='Open', package='old', issueDate='2026-10-01',
                    inspectionDate='2026-10-02', inspectionTime='09:00', type='Inspection'),
         models.ITR(id='i1', documentNumber='ITR-1', status='In Progress', remark='old'),
         models.ITP(id='p1', referenceNo='ITP-1', status='Draft', description='old'),
         models.OBS(id='b1', documentNumber='OBS-1', status='Open', description='old'),
         models.OSD(id='d1', documentNumber='OSD-1', status='Open', itemDescription='old'),
         models.PQP(id='q1', pqpNo='PQP-1', status='Draft', description='old'),
         models.Audit(id='a1', auditNo='AUD-1', status='Planned', title='old', date='2026-10-01'),
         models.FollowUp(id='f1', issueNo='FU-1', status='Open', title='old'),
         models.FAT(id='t1', equipment='Pump', status='Planned', location='old', startDate='2026-10-01', endDate='2026-10-02'),
         models.MeetingMinutes(id='m1', documentNumber='MM-1', status='Draft', title='old'),
         models.Checklist(id='c1', recordsNo='CHK-1', status='Ongoing', activity='old'),
         models.ContractorPersonnel(id='pp1', contractor_id='v1', name='Lee Wei', position='old', is_active=True),
         models.Project(id='PX', name='Tower X', code='TWX', description='old'),
         models.User(username='target', email='target@example.com', is_active=True, full_name='old', company_name='QA',
                     hashed_password=get_password_hash(secrets.token_urlsafe(24))),
         models.Role(name='Inspector', description='old'),
         models.AuditTemplate(name='ISO 9001', version='2015', is_active=True, description='old',
                              items=json.dumps([{'id': 't1', 'no': '7.1', 'clause': 'Resources', 'task': 'Provided?'}])),
         models.KMArticle(id='k1', title='Welding', content='old', category='QA', version_no=1))


CASES = [
    ('ncr', models.NCR, 'ncr', lambda e: 'n1', lambda pk: f'/api/ncr/{pk}/', 'description', 'NCR', 'NCR-1'),
    ('noi', models.NOI, 'noi', lambda e: 'o1', lambda pk: f'/api/noi/{pk}/', 'package', 'NOI', 'NOI-1'),
    ('itr', models.ITR, 'itr', lambda e: 'i1', lambda pk: f'/api/itr/{pk}', 'remark', 'ITR', 'ITR-1'),
    ('itp', models.ITP, 'itp', lambda e: 'p1', lambda pk: f'/api/itp/{pk}/', 'description', 'ITP', 'ITP-1'),
    ('obs', models.OBS, 'obs', lambda e: 'b1', lambda pk: f'/api/obs/{pk}', 'description', 'OBS', 'OBS-1'),
    ('osd', models.OSD, 'osd', lambda e: 'd1', lambda pk: f'/api/osd/{pk}', 'itemDescription', 'OSD', 'OSD-1'),
    ('pqp', models.PQP, 'pqp', lambda e: 'q1', lambda pk: f'/api/pqp/{pk}', 'description', 'PQP', 'PQP-1'),
    ('audit', models.Audit, 'audits', lambda e: 'a1', lambda pk: f'/api/audit/{pk}', 'title', 'Audit', 'AUD-1'),
    ('followup', models.FollowUp, 'followup', lambda e: 'f1', lambda pk: f'/api/followup/{pk}', 'title', 'FollowUp', 'FU-1'),
    ('fat', models.FAT, 'fat', lambda e: 't1', lambda pk: f'/api/fat/{pk}', 'location', 'FAT', 'Pump'),
    ('meeting', models.MeetingMinutes, 'meeting_minutes', lambda e: 'm1', lambda pk: f'/api/meeting-minutes/{pk}', 'title',
     'MeetingMinutes', 'MM-1'),
    ('checklist', models.Checklist, 'checklist', lambda e: 'c1', lambda pk: f'/api/checklist/{pk}/', 'activity', 'Checklist', 'CHK-1'),
    ('contractor', models.Contractor, 'contractors', lambda e: 'v1', lambda pk: f'/api/contractors/{pk}', 'scope', 'contractor',
     'Hailong Construction'),
    ('personnel', models.ContractorPersonnel, 'contractor_personnel', lambda e: 'pp1', lambda pk: f'/api/contractors/personnel/{pk}',
     'position', 'personnel', 'Lee Wei'),
    ('project', models.Project, 'projects', lambda e: 'PX', lambda pk: f'/api/projects/{pk}', 'description', 'project', 'Tower X'),
    ('user', models.User, 'users', lambda e: _id_of(e, models.User, username='target'), lambda pk: f'/api/iam/users/{pk}/',
     'full_name', 'user', 'target'),
    ('role', models.Role, 'roles', lambda e: _id_of(e, models.Role, name='Inspector'), lambda pk: f'/api/iam/roles/{pk}/',
     'description', 'role', 'Inspector'),
    ('audit_template', models.AuditTemplate, 'audit_templates', lambda e: _id_of(e, models.AuditTemplate, name='ISO 9001'),
     lambda pk: f'/api/audit/templates/{pk}', 'description', 'AuditTemplate', 'ISO 9001'),
]


@pytest.mark.parametrize('case', CASES, ids=[c[0] for c in CASES])
def test_first_save_wins_the_second_is_a_409_and_a_missing_version_is_logged(env, caplog, case):
    _name, model, table, pk_of, url_of, field, doc_type, number = case
    _seed_basic(env)
    pk = pk_of(env)
    url = url_of(pk)
    a, b = env.login(), env.login()
    version, _ = _stored(env, model, pk)
    assert version == 0

    first = a.put(url, json={field: 'from A', 'row_version': 0})
    assert first.status_code == 200, first.text
    assert first.json()['row_version'] == 1
    assert first.json()[field] == 'from A'

    second = b.put(url, json={field: 'from B', 'row_version': 0})
    assert second.status_code == 409, second.text
    body = second.json()
    assert body['code'] == 'VERSION_CONFLICT'
    assert body['params'] == {'docType': doc_type, 'number': number}
    assert body['detail'] == (f"{doc_type} {number} was changed by someone else meanwhile (your version 0, stored version 1). "
                              "Reload it, then make your change again.")
    version, row = _stored(env, model, pk)
    assert (version, getattr(row, field)) == (1, 'from A')

    again = b.put(url, json={field: 'from B', 'row_version': 1})          # after reloading: accepted
    assert again.status_code == 200, again.text
    assert again.json()['row_version'] == 2

    caplog.clear()
    with caplog.at_level(logging.WARNING, logger='core.concurrency'):
        legacy = a.put(url, json={field: 'no version'})
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()['row_version'] == 3
    assert f"row_version missing: {table} {pk}" in caplog.messages
    version, row = _stored(env, model, pk)
    assert (version, getattr(row, field)) == (3, 'no version')


def test_km_uses_version_no_atomically(env, caplog):
    _seed_basic(env)
    a, b = env.login(), env.login()
    first = a.put('/api/km/k1', json={'content': 'from A', 'version_no': 1})
    assert first.status_code == 200, first.text
    assert first.json()['version_no'] == 2
    second = b.put('/api/km/k1', json={'content': 'from B', 'version_no': 1})
    assert second.status_code == 409
    assert second.json()['code'] == 'VERSION_CONFLICT'
    assert second.json()['params'] == {'docType': 'KM', 'number': 'Welding'}
    version, row = _stored(env, models.KMArticle, 'k1', 'version_no')
    assert (version, row.content) == (2, 'from A')
    with env.Session() as db:                                 # the history row carries the version it saved
        assert [h.version_no for h in db.query(models.KMArticleHistory).filter_by(article_id='k1')] == [2]
    with caplog.at_level(logging.WARNING, logger='core.concurrency'):
        legacy = a.put('/api/km/k1', json={'content': 'no version'})
    assert legacy.status_code == 200 and legacy.json()['version_no'] == 3
    assert "row_version missing: km_articles k1" in caplog.messages
    with env.Session() as db:                                 # the audit entry's old value is the version before the save
        logged = db.query(models.AuditLog).filter_by(entity_type='KMArticle', entity_id='k1').order_by(models.AuditLog.id).first()
        assert json.loads(logged.old_value)['version_no'] == 1


def test_km_legacy_null_version_counts_as_one(env):
    _add(env, models.KMArticle(id='k2', title='Legacy', content='old', category='QA'))
    with env.Session() as db:
        db.execute(text("UPDATE km_articles SET version_no = NULL WHERE id = 'k2'"))
        db.commit()
    r = env.login().put('/api/km/k2', json={'content': 'new', 'version_no': 1})
    assert r.status_code == 200, r.text
    assert r.json()['version_no'] == 2


def test_material_register_edit(env, caplog):
    a, b = env.login(), env.login()
    sid = _register_material(env, a)
    listed = a.get(f'/api/material-submittals/approved?projectId={TEST_PROJECT_ID}').json()['items']
    assert listed[0]['rowVersion'] == 0
    first = a.put(f'/api/material-submittals/{sid}/register', json={'brand': 'B', 'rowVersion': 0})
    assert first.status_code == 200, first.text
    assert first.json()['rowVersion'] == 1
    second = b.put(f'/api/material-submittals/{sid}/register', json={'brand': 'C', 'rowVersion': 0})
    assert second.status_code == 409
    assert second.json()['code'] == 'VERSION_CONFLICT'
    number = second.json()['params']['number']
    assert second.json()['params'] == {'docType': 'Material', 'number': number} and number
    assert a.get(f'/api/material-submittals/{sid}').json()['rowVersion'] == 1
    with caplog.at_level(logging.WARNING, logger='core.concurrency'):
        legacy = a.put(f'/api/material-submittals/{sid}/register', json={'brand': 'D'})
    assert legacy.status_code == 200 and legacy.json()['rowVersion'] == 2
    assert f"row_version missing: material_submittals {sid}" in caplog.messages


def test_reads_carry_the_version(env):
    _seed_basic(env)
    c = env.login()
    assert c.get('/api/ncr/n1').json()['row_version'] == 0
    assert c.get('/api/itr/i1').json()['row_version'] == 0
    assert all('row_version' in row for row in c.get('/api/noi/').json())
    uid = _id_of(env, models.User, username='target')
    assert c.get(f'/api/iam/users/{uid}/scope').json()['row_version'] == 0


# ---- secondary writes ---------------------------------------------------------------------------------------------------

def test_itp_plan_and_fat_details_check_and_increment(env):
    _seed_basic(env)
    c = env.login()
    r = c.put('/api/itp/p1/detail', json={'a': [], 'b': [], 'c': [], 'row_version': 0})
    assert r.status_code == 200 and r.json()['row_version'] == 1
    stale = c.put('/api/itp/p1/detail', json={'a': [{'id': 'x'}], 'b': [], 'c': [], 'row_version': 0})
    assert stale.status_code == 409 and stale.json()['code'] == 'VERSION_CONFLICT'
    assert json.loads(_stored(env, models.ITP, 'p1')[1].detail_data)['a'] == []
    assert 'row_version' not in json.loads(_stored(env, models.ITP, 'p1')[1].detail_data)

    r = c.put('/api/fat/t1/details?row_version=0', json=[])
    assert r.status_code == 200 and r.json()['row_version'] == 1
    stale = c.put('/api/fat/t1/details?row_version=0', json=[])
    assert stale.status_code == 409 and stale.json()['code'] == 'VERSION_CONFLICT'
    assert c.put('/api/fat/t1/details', json=[]).json()['row_version'] == 2


def test_pqp_publish_checks_and_increments(env):
    _seed_basic(env)
    c = env.login()
    stale = c.post('/api/pqp/q1/publish', json={'change_summary': 'x', 'row_version': 5})
    assert stale.status_code == 409 and stale.json()['code'] == 'VERSION_CONFLICT'
    version, row = _stored(env, models.PQP, 'q1')
    assert (version, row.status) == (0, 'Draft')
    with env.Session() as db:
        assert db.query(models.PQPHistory).count() == 0          # the refused publish wrote no history row
    r = c.post('/api/pqp/q1/publish', json={'change_summary': 'x', 'row_version': 0})
    assert r.status_code == 200, r.text
    assert r.json()['row_version'] == 1 and r.json()['status'] == 'Approved'


def test_itr_revoke_and_create_ncr_check_and_increment(env):
    _add(env, models.ITR(id='i2', documentNumber='ITR-2', status='Approved', detail_data=json.dumps({'_version': 4}), row_version=4),
         models.ITR(id='i3', documentNumber='ITR-3', status='In Progress', inspectionResult='Fail'))
    c = env.login()
    stale = c.post('/api/itr/i2/revoke-approval', json={'new_status': 'In Progress', 'reason': 'r', 'row_version': 3})
    assert stale.status_code == 409 and stale.json()['code'] == 'VERSION_CONFLICT'
    assert _stored(env, models.ITR, 'i2')[1].status == 'Approved'
    r = c.post('/api/itr/i2/revoke-approval', json={'new_status': 'In Progress', 'reason': 'r', 'row_version': 4})
    assert r.status_code == 200, r.text
    assert r.json()['row_version'] == 5
    assert json.loads(_stored(env, models.ITR, 'i2')[1].detail_data)['_version'] == 4      # the old marker: no longer read or moved

    stale = c.post('/api/itr/i3/create-ncr?row_version=7')
    assert stale.status_code == 409 and stale.json()['code'] == 'VERSION_CONFLICT'
    with env.Session() as db:
        assert db.query(models.NCR).count() == 0
    r = c.post('/api/itr/i3/create-ncr?row_version=0')
    assert r.status_code == 200, r.text
    version, row = _stored(env, models.ITR, 'i3')
    assert version == 1 and row.ncrNumber


def test_itr_old_detail_version_is_stripped_and_no_longer_checked(env, caplog):
    """B5: row_version replaced the ITR's old detail_data._version marker. The page still echoes the stored detail_data, so
    the marker is stripped on input (never compared, never moved, never stored from the request); a stored one stays as
    it is."""
    _add(env, models.ITR(id='i4', documentNumber='ITR-4', status='In Progress', remark='old', row_version=2,
                         detail_data=json.dumps({'_version': 2, 'note': 'kept'})))
    c = env.login()
    with caplog.at_level(logging.WARNING, logger='core.concurrency'):
        r = c.put('/api/itr/i4', json={'remark': 'new', 'detail_data': json.dumps({'_version': 99, 'extra': 'x'})})
    assert r.status_code == 200, r.text                      # a stale or made-up marker is no conflict any more
    assert r.json()['row_version'] == 3
    assert json.loads(r.json()['detail_data']) == {'_version': 2, 'note': 'kept', 'extra': 'x'}
    assert "row_version missing: itr i4" in caplog.messages
    stale = c.put('/api/itr/i4', json={'remark': 'stale', 'row_version': 2, 'detail_data': json.dumps({'_version': 3})})
    assert stale.status_code == 409 and stale.json()['code'] == 'VERSION_CONFLICT'
    plain = c.put('/api/itr/i4', json={'remark': 'mine', 'row_version': 3})
    assert plain.status_code == 200, plain.text               # no detail_data sent: the stored one is left as it is
    assert json.loads(_stored(env, models.ITR, 'i4')[1].detail_data) == {'_version': 2, 'note': 'kept', 'extra': 'x'}
    assert _stored(env, models.ITR, 'i4')[1].remark == 'mine'


@pytest.mark.parametrize('required', [False, True], ids=['flag-off', 'flag-on'])
def test_an_approved_itr_publish_that_echoes_the_old_marker_is_accepted(env, monkeypatch, required):
    """The trap B5 must not fall into: the Approved-ITR lock accepts detail_data only when nothing is left after the
    `_version` strip. A page republishing an Approved ITR resends detail_data carrying `_version`; that must still pass."""
    monkeypatch.setattr(settings, 'ROW_VERSION_REQUIRED', required)
    _add(env, models.ITR(id='i6', documentNumber='ITR-6', status='Approved', type='Inspection', row_version=4,
                         detail_data=json.dumps({'_version': 4})))
    c = env.login()
    r = c.put('/api/itr/i6', json={'type': 'Inspection', 'status': 'Approved', 'row_version': 4,
                                   'detail_data': json.dumps({'_version': 4})})
    assert r.status_code == 200, r.text
    assert r.json()['row_version'] == 5
    smuggled = c.put('/api/itr/i6', json={'status': 'Approved', 'row_version': 5,
                                          'detail_data': json.dumps({'_version': 5, 'note': 'changed'})})
    assert smuggled.status_code == 400, smuggled.text         # anything besides the marker is still refused
    assert 'Cannot modify detail_data content on an Approved ITR' in smuggled.json()['detail']
    assert _stored(env, models.ITR, 'i6')[0] == 5


def test_a_reinspection_starts_with_an_empty_detail_data(env):
    _add(env, models.ITR(id='i7', documentNumber='ITR-7', status='Reject', inspectionResult='Fail', vendor_id='v1'))
    r = env.login().post('/api/itr/i7/re-inspect')
    assert r.status_code == 200, r.text
    assert json.loads(_stored(env, models.ITR, r.json()['id'])[1].detail_data) == {}      # no old `_version` marker any more


def test_itr_batch_increments_without_the_missing_version_log(env, caplog):
    _add(env, models.ITR(id='i5', documentNumber='ITR-5', status='In Progress'))
    with caplog.at_level(logging.WARNING, logger='core.concurrency'):
        r = env.login().post('/api/itr/batch-update', json={'ids': ['i5'], 'status': 'Reject'})
    assert r.status_code == 200 and r.json()['updated'] == ['i5'], r.text
    assert _stored(env, models.ITR, 'i5')[0] == 1
    assert not [m for m in caplog.messages if m.startswith('row_version missing')]


def test_user_scope_uses_the_account_version(env):
    _seed_basic(env)
    uid = _id_of(env, models.User, username='target')
    c = env.login()
    r = c.put(f'/api/iam/users/{uid}/scope', json={'project_ids': [TEST_PROJECT_ID], 'vendor_id': None, 'row_version': 0})
    assert r.status_code == 200, r.text
    assert r.json() == {'project_ids': [TEST_PROJECT_ID], 'vendor_id': None, 'row_version': 1}
    stale = c.put(f'/api/iam/users/{uid}/scope', json={'project_ids': ['PX'], 'vendor_id': None, 'row_version': 0})
    assert stale.status_code == 409 and stale.json()['code'] == 'VERSION_CONFLICT'
    assert c.get(f'/api/iam/users/{uid}/scope').json()['project_ids'] == [TEST_PROJECT_ID]


def test_an_attachment_upload_does_not_touch_the_record(env):
    _seed_basic(env)
    r = env.login().post('/api/files/upload', data={'entity_type': 'ncr', 'entity_id': 'n1', 'category': 'attachment'},
                         files={'files': ('a.pdf', b'%PDF-1.4\n% optimistic lock\n', 'application/pdf')})
    assert r.status_code == 200, r.text
    assert _stored(env, models.NCR, 'n1')[0] == 0


def test_an_unchanged_save_of_a_locked_audit_writes_nothing_and_keeps_its_version(env):
    _add(env, models.Audit(id='a2', auditNo='AUD-2', status='Closed', title='done', date='2026-10-01'))
    r = env.login().put('/api/audit/a2', json={'title': 'done', 'row_version': 0})
    assert r.status_code == 200, r.text
    assert r.json()['row_version'] == 0
    assert _stored(env, models.Audit, 'a2')[0] == 0


# ---- the claim itself -----------------------------------------------------------------------------------------------------

def test_two_sessions_claiming_the_same_version_cannot_both_pass(env):
    """A claims version 0 and holds its transaction; B claims version 0 meanwhile (it waits for the database write lock, or
    runs after A's commit). Either way exactly one passes: B gets VERSION_CONFLICT, the stored version is 1."""
    _add(env, models.NCR(id='n9', documentNumber='NCR-9', status='Open'))
    sa, sb = env.Session(), env.Session()
    try:
        ncr_a = sa.get(models.NCR, 'n9')
        ncr_b = sb.get(models.NCR, 'n9')                      # both read version 0
        assert claim_row_version(sa, ncr_a, 0, doc_type='NCR', number='NCR-9') == 1
        outcome = {}

        def second():
            try:
                outcome['version'] = claim_row_version(sb, ncr_b, 0, doc_type='NCR', number='NCR-9')
                sb.commit()
            except Refusal as e:
                outcome['refused'] = e.code
                sb.rollback()

        t = threading.Thread(target=second)
        t.start()
        t.join(0.5)                                           # B is waiting for A's write lock (or already done)
        sa.commit()
        t.join(30)
        assert not t.is_alive()
        assert outcome == {'refused': 'VERSION_CONFLICT'}
    finally:
        sa.close()
        sb.close()
    assert _stored(env, models.NCR, 'n9')[0] == 1


def test_bump_never_checks_and_never_logs(env, caplog):
    _add(env, models.NCR(id='n8', documentNumber='NCR-8', status='Open', row_version=6))
    with env.Session() as db, caplog.at_level(logging.WARNING, logger='core.concurrency'):
        ncr = db.get(models.NCR, 'n8')
        assert bump_row_version(db, ncr) == 7
        assert ncr.row_version == 7 and ncr not in db.dirty     # set as loaded, not as a pending change
        db.commit()
    assert not caplog.messages
    assert _stored(env, models.NCR, 'n8')[0] == 7


@pytest.mark.parametrize('service_name', ['followup', 'meeting'])
def test_a_refusal_after_the_claim_rolls_back_in_the_service(env, service_name):
    """R1 P3-1: the claim takes the write lock; a refusal after it (here an illegal status change) must release it in the
    service, not only at request teardown."""
    from services.followup_service import FollowUpService
    from services.meeting_minutes_service import MeetingMinutesService
    from repositories.followup_repository import FollowUpRepository
    from repositories.meeting_minutes_repository import MeetingMinutesRepository
    _add(env, models.FollowUp(id='f9', issueNo='FU-9', status='Closed', title='t'),
         models.MeetingMinutes(id='m9', documentNumber='MM-9', status='Void', title='t'))
    with env.Session() as db:
        if service_name == 'followup':
            call = lambda: FollowUpService(FollowUpRepository(db)).update_followup(
                'f9', __import__('schemas').FollowUpUpdate(status='Bogus', row_version=0))
        else:
            call = lambda: MeetingMinutesService(MeetingMinutesRepository(db)).update_meeting_minutes(
                'm9', __import__('schemas').MeetingMinutesUpdate(status='Draft', row_version=0))
        with pytest.raises(ValueError):
            call()
        assert not db.in_transaction()
    assert _stored(env, models.FollowUp, 'f9')[0] == 0 and _stored(env, models.MeetingMinutes, 'm9')[0] == 0


def test_version_conflict_is_always_a_409():
    e = Refusal('VERSION_CONFLICT', 'changed', docType='NCR', number='N')
    assert refusal_http(e, 400).status_code == 409
    assert refusal_http(Refusal('RECORD_LOCKED', 'locked'), 400).status_code == 400


# ---- migration step 31 ------------------------------------------------------------------------------------------------------

def test_migration_adds_the_column_and_copies_the_itr_version_once(tmp_path, monkeypatch):
    import db_migrations
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE ncr (id VARCHAR PRIMARY KEY, documentNumber VARCHAR)"))
        conn.execute(text("INSERT INTO ncr (id, documentNumber) VALUES ('n1', 'NCR-1')"))
        conn.execute(text("CREATE TABLE itr (id VARCHAR PRIMARY KEY, detail_data TEXT)"))
        rows = {'good': {'_version': 5}, 'zero': {'_version': 0}, 'text': {'_version': '7'}, 'float': {'_version': 2.5},
                'bool': {'_version': True}, 'negative': {'_version': -3}, 'none': {'x': 1}}
        for itr_id, detail in rows.items():
            conn.execute(text("INSERT INTO itr (id, detail_data) VALUES (:i, :d)"), {'i': itr_id, 'd': json.dumps(detail)})
        conn.execute(text("INSERT INTO itr (id, detail_data) VALUES ('broken', '{not json'), ('null', NULL)"))
    monkeypatch.setattr(db_migrations, 'engine', engine)
    db_migrations._create_migration_flags_table()
    db_migrations._add_row_version_columns()                  # tables that do not exist here are skipped (logged)
    db_migrations._copy_itr_detail_version()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT row_version FROM ncr")).scalar() == 0
        got = dict(conn.execute(text("SELECT id, row_version FROM itr")).fetchall())
    assert got == {'good': 5, 'zero': 0, 'text': 0, 'float': 0, 'bool': 0, 'negative': 0, 'none': 0, 'broken': 0, 'null': 0}

    with engine.begin() as conn:                              # runs once: a later _version is not copied again
        conn.execute(text("UPDATE itr SET row_version = 0, detail_data = :d WHERE id = 'good'"), {'d': json.dumps({'_version': 9})})
    db_migrations._add_row_version_columns()
    db_migrations._copy_itr_detail_version()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT row_version FROM itr WHERE id = 'good'")).scalar() == 0
    engine.dispose()


def test_migration_stops_start_up_when_the_column_cannot_be_added(tmp_path, monkeypatch):
    """R1 P3-4: a table left without row_version would make every ORM read of it a 500 — start-up stops instead."""
    import db_migrations
    engine = create_engine(f"sqlite:///{tmp_path / 'stuck.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE ncr (id VARCHAR PRIMARY KEY)"))
    monkeypatch.setattr(db_migrations, 'engine', engine)
    monkeypatch.setattr(db_migrations, '_add_column_if_missing', lambda *a, **k: None)     # the ALTER "failed" (logged only)
    with pytest.raises(db_migrations.MigrationError, match='ncr'):
        db_migrations._add_row_version_columns()
    engine.dispose()


# ---- B5: ROW_VERSION_REQUIRED on --------------------------------------------------------------------------------------------

@pytest.fixture
def required(monkeypatch):
    """The flag as production will have it once switched on (backend/.env ROW_VERSION_REQUIRED=true)."""
    monkeypatch.setattr(settings, 'ROW_VERSION_REQUIRED', True)


def _assert_version_required(r, doc_type, number):
    assert r.status_code == 400, r.text
    body = r.json()
    assert body['code'] == 'VERSION_REQUIRED'
    assert body['params'] == {'docType': doc_type, 'number': number}
    assert body['detail'] == (f"{doc_type} {number} was not saved: this page sent no record version. "
                              "Refresh the page, then save again.")


@pytest.mark.parametrize('case', CASES, ids=[c[0] for c in CASES])
def test_flag_on_a_save_without_a_version_is_refused_and_writes_nothing(env, required, caplog, case):
    _name, model, table, pk_of, url_of, field, doc_type, number = case
    _seed_basic(env)
    pk = pk_of(env)
    c = env.login()
    _, before = _stored(env, model, pk)
    old = getattr(before, field)
    with caplog.at_level(logging.WARNING, logger='core.concurrency'):
        r = c.put(url_of(pk), json={field: 'no version'})
    _assert_version_required(r, doc_type, number)
    version, row = _stored(env, model, pk)
    assert (version, getattr(row, field)) == (0, old)
    ok = c.put(url_of(pk), json={field: 'with version', 'row_version': 0})
    assert ok.status_code == 200, ok.text
    assert ok.json()['row_version'] == 1


def test_flag_on_km_and_material_without_a_version_are_refused(env, required):
    _seed_basic(env)
    c = env.login()
    _assert_version_required(c.put('/api/km/k1', json={'content': 'no version'}), 'KM', 'Welding')     # 400, not KM's usual 409
    version, row = _stored(env, models.KMArticle, 'k1', 'version_no')
    assert (version, row.content) == (1, 'old')
    sid = _register_material(env, c)
    r = c.put(f'/api/material-submittals/{sid}/register', json={'brand': 'D'})
    assert r.status_code == 400 and r.json()['code'] == 'VERSION_REQUIRED', r.text
    assert c.get(f'/api/material-submittals/{sid}').json()['rowVersion'] == 0


def test_flag_on_secondary_writes_without_a_version_are_refused(env, required):
    _seed_basic(env)
    _add(env, models.ITR(id='i2', documentNumber='ITR-2', status='Approved', row_version=4),
         models.ITR(id='i3', documentNumber='ITR-3', status='In Progress', inspectionResult='Fail'))
    with env.Session() as db:
        db.add(models.Document(id='doc1', doc_no='QTS-KM-000001', scope='company', doc_type='procedure', title_zh='焊接程序書',
                               status='archived'))
        db.commit()
    uid = _id_of(env, models.User, username='target')
    c = env.login()

    _assert_version_required(c.put('/api/itp/p1/detail', json={'a': [], 'b': [], 'c': []}), 'ITP', 'ITP-1')
    _assert_version_required(c.put('/api/fat/t1/details', json=[]), 'FAT', 'Pump')
    _assert_version_required(c.post('/api/pqp/q1/publish', json={'change_summary': 'x'}), 'PQP', 'PQP-1')
    _assert_version_required(c.post('/api/itr/i2/revoke-approval', json={'new_status': 'In Progress', 'reason': 'r'}),
                             'ITR', 'ITR-2')
    _assert_version_required(c.post('/api/itr/i3/create-ncr'), 'ITR', 'ITR-3')
    _assert_version_required(c.put(f'/api/iam/users/{uid}/scope', json={'project_ids': ['PX'], 'vendor_id': None}),
                             'user', 'target')
    r = c.post('/api/documents/doc1/transition', json={'to': 'draft'})
    assert r.status_code == 400 and r.json()['code'] == 'VERSION_REQUIRED', r.text      # 400, not the register's usual 409
    r = c.patch('/api/documents/doc1', json={'tags': 'weld'})
    assert r.status_code == 400 and r.json()['code'] == 'VERSION_REQUIRED', r.text

    assert _stored(env, models.ITP, 'p1')[0] == 0
    assert _stored(env, models.FAT, 't1')[0] == 0
    assert _stored(env, models.PQP, 'q1')[1].status == 'Draft'
    assert (_stored(env, models.ITR, 'i2')[0], _stored(env, models.ITR, 'i2')[1].status) == (4, 'Approved')
    assert _stored(env, models.ITR, 'i3')[0] == 0
    with env.Session() as db:
        assert db.query(models.NCR).filter(models.NCR.id != 'n1').count() == 0       # no NCR raised
        assert db.get(models.User, uid).row_version == 0
        doc = db.get(models.Document, 'doc1')
        assert (doc.status, doc.tags, doc.row_version) == ('archived', None, 0)

    assert c.post('/api/itr/i2/revoke-approval', json={'new_status': 'In Progress', 'reason': 'r', 'row_version': 4}).status_code == 200
    assert c.post('/api/documents/doc1/transition', json={'to': 'draft', 'row_version': 0}).status_code == 200


def test_flag_on_the_exempt_writes_still_pass(env, required, monkeypatch, caplog):
    """The ITR batch status change (BACKLOG #64) and the KM Word import carry no version by design."""
    _add(env, models.ITR(id='i5', documentNumber='ITR-5', status='In Progress'))
    _seed_basic(env)
    c = env.login()
    with caplog.at_level(logging.WARNING, logger='core.concurrency'):
        r = c.post('/api/itr/batch-update', json={'ids': ['i5'], 'status': 'Reject'})
        assert r.status_code == 200 and r.json()['updated'] == ['i5'], r.text
        assert _stored(env, models.ITR, 'i5')[0] == 1

        import services.km_service as km_service

        def fake_pandoc(args, **kwargs):                       # no pandoc needed: the converted HTML is written directly
            with open(args[args.index('-o') + 1], 'w', encoding='utf-8') as f:
                f.write('<html><body><h2>Scope</h2><p>imported</p></body></html>')
            return SimpleNamespace(returncode=0, stderr='')
        monkeypatch.setattr(km_service.subprocess, 'run', fake_pandoc)
        r = c.post('/api/km/k1/import-docx', files={'file': ('k.docx', b'PK fake docx', 'application/octet-stream')})
        assert r.status_code == 200, r.text
    version, row = _stored(env, models.KMArticle, 'k1', 'version_no')
    assert version == 2 and 'imported' in row.content
    assert not [m for m in caplog.messages if m.startswith('row_version missing')]


def test_flag_on_bump_and_exempt_claims_are_never_refused(env, required):
    _add(env, models.NCR(id='n7', documentNumber='NCR-7', status='Open', row_version=2))
    with env.Session() as db:
        ncr = db.get(models.NCR, 'n7')
        assert bump_row_version(db, ncr) == 3
        assert claim_row_version(db, ncr, None, doc_type='NCR', number='NCR-7', exempt=True) == 4
        with pytest.raises(Refusal) as refused:
            claim_row_version(db, ncr, None, doc_type='NCR', number='NCR-7')
        assert refused.value.code == 'VERSION_REQUIRED'
        db.commit()
    assert _stored(env, models.NCR, 'n7')[0] == 4


def test_refusal_http_fixes_version_required_at_400():
    assert refusal_http(Refusal('VERSION_REQUIRED', 'x', docType='KM', number='K'), 409).status_code == 400
    assert refusal_http(Refusal('VERSION_CONFLICT', 'x', docType='KM', number='K'), 400).status_code == 409
