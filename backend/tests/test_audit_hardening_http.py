"""Internal Audit backend hardening (AUDIT-HARDENING-A-2026-001): real login/routes, disposable file DB, new-session assertions.

Covers: create status, auditNo immutable on update, strict dates on create + update (and a READ that no longer 500s on a
stored bad row), Closed resave with list fields, number generation under the write lock + counter self-heal, database
conflicts as 409, one-transaction rollback. No main import, seeding, scheduler, uploads or development database access.
"""
import importlib
import json
import secrets
import threading
import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import models
import schemas
from core.security import get_password_hash
from database import Base, get_db
from repositories.audit_repository import AuditRepository
from services.audit_service import AuditService

VENDOR = 'Audit vendor'


def body(**over):
    """The shape the wizard sends (prepareAuditData): every field, '' for blanks, lists for the JSON fields."""
    data = dict(auditNo='', title='Site audit', date='2026-10-01', end_date='2026-10-02', project_name='', auditor='Lead',
                project_director='', support_auditors='', tech_lead='', location='Site', findings='', audit_criteria='',
                scope_description='', selected_templates=['ISO 9001:2015'], custom_check_items=[{'id': 1, 'no': '7.1', 'clause': 'c', 'task': 't'}],
                contractor=VENDOR, status='Draft')
    data.update(over)
    return data


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'audit-hardening.db'}", connect_args={'check_same_thread': False, 'timeout': 30})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        codes = ['audit:view:all', 'audit:create:all', 'audit:update:all', 'audit:delete:all']
        role = models.Role(name='AuditOwner')
        role.permissions_rel = [models.Permission(code=c, description=c) for c in codes]
        db.add(role)
        db.flush()
        db.add(models.User(username='auditor', email='auditor@example.test', is_active=True,
                           role_id=role.id, hashed_password=get_password_hash(password)))
        db.add(models.Contractor(id='vendor', name=VENDOR, abbreviation='AV'))
        db.commit()
    app = FastAPI()
    for name in ['auth', 'audit']:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/auth/login', data={'username': 'auditor', 'password': password})
        assert response.status_code == 200, response.text
        yield SimpleNamespace(client=client, Session=S, engine=engine)
    engine.dispose()


def snapshot(env):
    with env.Session() as db:
        return {m.__tablename__: sorted([tuple(str(getattr(r, c.name)) for c in m.__table__.columns) for r in db.query(m).all()])
                for m in [models.Audit, models.AuditLog, models.ReferenceSequence]}


def create(env, **over):
    return env.client.post('/api/audit/', json=body(**over))


def stored(env, audit_id):
    with env.Session() as db:
        row = db.get(models.Audit, audit_id)
        db.expunge(row)
        return row


def insert_raw(env, **cols):
    """A legacy row written directly (as old code paths could leave it), bypassing the API."""
    data = dict(id=str(uuid.uuid4()), auditNo=f'LEGACY-{uuid.uuid4().hex[:8]}', date='2026-10-01', status='Draft',
                contractor=VENDOR, vendor_id='vendor', selected_templates='[]', custom_check_items='[]')
    data.update(cols)
    with env.Session() as db:
        db.add(models.Audit(**data))
        db.commit()
    return data['id']


# ── #3 status on create ───────────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize('status', ['Closed', 'Void', 'Foo', 'closed', ''])
def test_create_refuses_dead_end_or_unknown_status(env, status):
    before = snapshot(env)
    response = create(env, status=status)
    assert response.status_code == 400, response.text
    assert snapshot(env) == before  # no record, no audit log, no sequence drawn


@pytest.mark.parametrize('status', ['Draft', 'Planned', 'In Progress', 'Completed'])
def test_create_accepts_every_status_with_a_way_forward(env, status):
    response = create(env, status=status)
    assert response.status_code == 200, response.text
    assert response.json()['status'] == status


# ── #4 auditNo immutable; the wizard's "Save Draft, then Submit" no longer blanks it ─────────────────────────────────
def test_second_save_with_blank_audit_no_keeps_the_number(env):
    created = create(env).json()
    number = created['auditNo']
    assert number.endswith('000001')
    # exactly what the wizard sends on its 2nd save of a new record (formData.auditDocNo was never filled in)
    response = env.client.put(f"/api/audit/{created['id']}", json=body(auditNo='', status='Planned'))
    assert response.status_code == 200, response.text
    assert response.json()['auditNo'] == number
    assert stored(env, created['id']).auditNo == number


def test_update_cannot_rename_the_number(env):
    created = create(env).json()
    response = env.client.put(f"/api/audit/{created['id']}", json={'auditNo': 'HAND-TYPED-1'})
    assert response.status_code == 200, response.text
    assert stored(env, created['id']).auditNo == created['auditNo']
    with env.Session() as db:
        log = db.query(models.AuditLog).filter_by(entity_id=created['id'], action='UPDATE').one()
        assert 'auditNo' not in json.loads(log.new_value or '{}')


# ── #5 dates: strict on create and update, READ never fails on a stored row ──────────────────────────────────────────
@pytest.mark.parametrize('over, field', [
    (dict(date='2026-10-05', end_date='2026-10-01'), 'end_date'),
    (dict(date='garbage'), 'date'),
    (dict(date='2026-02-30'), 'date'),
    (dict(date='2026-10-01T09:00:00'), 'date'),
    (dict(date=None), 'date'),
])
def test_create_refuses_bad_dates_with_422(env, over, field):
    before = snapshot(env)
    response = create(env, **over)
    assert response.status_code == 422, response.text
    assert field in json.dumps(response.json()['detail'])
    assert snapshot(env) == before


def test_create_without_date_key_is_422_not_500(env):
    data = body()
    data.pop('date')
    response = env.client.post('/api/audit/', json=data)
    assert response.status_code == 422, response.text


def test_create_draft_without_a_start_date_still_works(env):
    response = create(env, date='', end_date='')
    assert response.status_code == 200, response.text


@pytest.mark.parametrize('over', [
    dict(end_date='2026-09-01'),          # before the stored start date
    dict(date='2026-13-01'),
    dict(end_date='not a date'),
    dict(date=None),                      # NOT NULL column: used to be a 500
])
def test_update_refuses_bad_dates_with_422(env, over):
    created = create(env).json()
    before = snapshot(env)
    response = env.client.put(f"/api/audit/{created['id']}", json=over)
    assert response.status_code == 422, response.text
    assert snapshot(env) == before


def test_update_resending_an_untouched_legacy_date_is_not_blocked(env):
    audit_id = insert_raw(env, date='2026/10/01', end_date='2026-09-01')  # bad format AND inverted, written by old code
    response = env.client.put(f'/api/audit/{audit_id}', json={'date': '2026/10/01', 'end_date': '2026-09-01', 'title': 'Renamed'})
    assert response.status_code == 200, response.text
    assert stored(env, audit_id).title == 'Renamed'


def test_list_and_get_return_a_stored_bad_row_instead_of_500(env):
    audit_id = insert_raw(env, date='2026-10-05', end_date='2026-10-01')
    insert_raw(env, date='garbage')
    listed = env.client.get('/api/audit/')
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 2
    got = env.client.get(f'/api/audit/{audit_id}')
    assert got.status_code == 200, got.text
    assert (got.json()['date'], got.json()['end_date']) == ('2026-10-05', '2026-10-01')  # returned untouched


# ── #12 Closed lock compares like with like ──────────────────────────────────────────────────────────────────────────
def test_closed_full_resave_is_a_no_op_but_a_real_change_is_refused(env):
    audit_id = insert_raw(env, status='Closed', auditNo='CLOSED-1', title='Done', selected_templates='["ISO 9001:2015"]',
                          custom_check_items=None)
    row = env.client.get(f'/api/audit/{audit_id}').json()
    resave = {k: row[k] for k in schemas.AuditUpdate.model_fields if k in row}
    resave['custom_check_items'] = row['custom_check_items'] or []  # the wizard's `|| []`
    resave['auditNo'] = ''
    assert env.client.put(f'/api/audit/{audit_id}', json=resave).status_code == 200
    changed = env.client.put(f'/api/audit/{audit_id}', json={**resave, 'selected_templates': ['ISO 14001']})
    assert changed.status_code == 400, changed.text
    assert stored(env, audit_id).selected_templates == '["ISO 9001:2015"]'


def test_closed_wizard_shaped_resave_over_null_columns_writes_nothing(env):
    # stored NULLs come back from the wizard as '' / [] (prepareAuditData's `|| ''`); that is not a change
    audit_id = insert_raw(env, status='Closed', auditNo='CLOSED-2', title=None, end_date=None, auditor=None, location=None,
                          selected_templates=None, custom_check_items=None)
    before = snapshot(env)
    blank = {k: '' for k in body() if k not in ('selected_templates', 'custom_check_items')}
    resave = {**blank, 'date': '2026-10-01', 'contractor': VENDOR, 'status': 'Closed', 'selected_templates': [], 'custom_check_items': []}
    response = env.client.put(f'/api/audit/{audit_id}', json=resave)
    assert response.status_code == 200, response.text
    assert snapshot(env) == before  # no column rewritten, no audit-log row
    assert env.client.put(f'/api/audit/{audit_id}', json={**resave, 'title': 'sneaky'}).status_code == 400


# ── #6 numbering: write lock first, counter self-heals ───────────────────────────────────────────────────────────────
def test_counter_behind_the_table_does_not_collide(env):
    first = create(env).json()['auditNo']
    with env.Session() as db:
        db.query(models.ReferenceSequence).update({'last_seq': 0})  # drift, as an import / restore can leave it
        db.commit()
    response = create(env)
    assert response.status_code == 200, response.text
    assert response.json()['auditNo'] == first[:-6] + '000002'


def test_write_lock_is_taken_before_the_sequence_is_read(env, monkeypatch):
    import services.audit_service as svc
    calls = []
    real_lock, real_gen = svc.begin_write_transaction, svc.generate_reference_no
    monkeypatch.setattr(svc, 'begin_write_transaction', lambda db: (calls.append('lock'), real_lock(db))[1])
    monkeypatch.setattr(svc, 'generate_reference_no', lambda *a, **k: (calls.append('number'), real_gen(*a, **k))[1])
    assert create(env).status_code == 200
    assert calls == ['lock', 'number']


def test_concurrent_creates_get_distinct_numbers(env):
    n = 6
    gate = threading.Barrier(n)
    results, errors = [], []

    def worker():
        with env.Session() as db:
            service = AuditService(AuditRepository(db))
            gate.wait()
            try:
                results.append(service.create_audit(schemas.AuditCreate(**body()), user_id=1, username='auditor').auditNo)
            except Exception as e:  # noqa: BLE001 — collected and asserted below
                errors.append(repr(e))
    threads = [threading.Thread(target=worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    assert len(set(results)) == n


# ── #7 database conflicts are 409, client id ignored ─────────────────────────────────────────────────────────────────
def test_client_supplied_id_is_ignored(env):
    existing = create(env).json()['id']
    response = env.client.post('/api/audit/', json={**body(), 'id': existing})
    assert response.status_code == 200, response.text
    assert response.json()['id'] != existing


def test_number_collision_is_409_and_writes_nothing(env, monkeypatch):
    taken = create(env).json()['auditNo']
    import services.audit_service as svc
    monkeypatch.setattr(svc, 'generate_reference_no', lambda *a, **k: taken)
    before = snapshot(env)
    response = create(env)
    assert response.status_code == 409, response.text
    assert snapshot(env) == before


# ── one transaction: a failing audit-log write leaves nothing behind ─────────────────────────────────────────────────
@pytest.mark.parametrize('op', ['create', 'update'])
def test_audit_log_failure_rolls_everything_back(env, monkeypatch, op):
    audit_id = create(env).json()['id'] if op == 'update' else None
    before = snapshot(env)
    rollbacks = []
    event.listen(env.Session.class_, 'after_rollback', lambda s: rollbacks.append(1))

    def fail_audit_flush(session, *args):
        if any(isinstance(r, models.AuditLog) for r in session.new):
            raise RuntimeError('injected audit-log failure')
    event.listen(env.Session.class_, 'before_flush', fail_audit_flush)
    try:
        if op == 'create':
            response = create(env)
        else:
            response = env.client.put(f'/api/audit/{audit_id}', json={'title': 'changed'})
        assert response.status_code == 500
    finally:
        event.remove(env.Session.class_, 'before_flush', fail_audit_flush)
    assert rollbacks
    assert snapshot(env) == before
