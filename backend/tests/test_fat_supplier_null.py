"""FAT with no supplier (FAT-SUPPLIER-NULL-2026-001), over HTTP.

A FAT's supplier is its contractor's name (models.FAT.supplier = vendor_ref.name). It used to be written as vendor_id
NULL without a word in three ways — supplier "" (or null on update), a name that is not a contractor, and the
contractor being deleted — and the response model's `supplier: str` then answered 500 for the whole list.

Read: every stored row is listable — no supplier, no equipment / dates, dates out of order or not YYYY-MM-DD.
Write: supplier "" / blank / null -> 400 FAT_SUPPLIER_REQUIRED, an unknown name -> 400 FAT_SUPPLIER_NOT_FOUND (coded
refusals, core/refusals.py); explicit null equipment / startDate / endDate on update -> 422. A refused write changes
nothing and leaves no audit row.
Search: `?search=` used to 500 (`FAT.supplier` is a property, not a column); it now searches the contractor's name.

Throwaway SQLite file per test; no main import, seeding, scheduler or development database.
"""
import importlib
import secrets
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.refusals import RefusalHTTPException, refusal_exception_handler
from core.security import get_password_hash
from database import Base, get_db
from project_membership import TEST_PROJECT_ID, bind

CODES = [perms.FAT_VIEW, perms.FAT_CREATE, perms.FAT_UPDATE, perms.CONTRACTOR_VIEW]
NEW = dict(project_id=TEST_PROJECT_ID, equipment='Probe equipment', startDate='2026-10-01', endDate='2026-10-02')


@pytest.fixture(params=[False, True], ids=['fk-off', 'fk-on'])
def env(request, tmp_path, monkeypatch):
    """fk-off is how the app's SQLite runs (no PRAGMA foreign_keys: a deleted contractor leaves a dangling vendor_id);
    fk-on is a database that enforces `ondelete="SET NULL"` (vendor_id becomes NULL). Both must list."""
    engine = create_engine(f"sqlite:///{tmp_path / 'fat.db'}", connect_args={'check_same_thread': False})
    if request.param:
        event.listen(engine, 'connect', lambda conn, _: conn.execute('PRAGMA foreign_keys=ON'))
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        role = models.Role(name='FatWriter')
        role.permissions_rel = [models.Permission(code=c, description=c) for c in CODES]
        db.add(role)
        db.flush()
        user = models.User(username='fat-writer', email='fat-writer@example.test', is_active=True, role_id=role.id,
                           hashed_password=get_password_hash(password), company_name='QA')
        db.add(user)
        db.flush()
        bind(db, user)
        db.add_all([models.Contractor(id='V1', name='FAT Supplier Co', abbreviation='FSC'),
                    models.Contractor(id='V2', name='FAT Gone Co', abbreviation='FGC')])
        db.flush()
        vendor_user = models.User(username='fat-vendor', email='fat-vendor@example.test', is_active=True,
                                  role_id=role.id, vendor_id='V2', hashed_password=get_password_hash(password),
                                  company_name='FAT Gone Co')
        db.add(vendor_user)
        db.flush()
        bind(db, vendor_user)
        db.add(models.FAT(id='OK', project_id=TEST_PROJECT_ID, equipment='Transformer', vendor_id='V1',
                          startDate='2026-10-01', endDate='2026-10-05', status='Scheduled'))
        db.commit()
    app = FastAPI()
    for name in ['auth', 'fat']:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')
    app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app, raise_server_exceptions=False) as client, \
            TestClient(app, raise_server_exceptions=False) as vendor_client:
        r = client.post('/api/auth/login', data={'username': 'fat-writer', 'password': password})
        assert r.status_code == 200, r.text
        r = vendor_client.post('/api/auth/login', data={'username': 'fat-vendor', 'password': password})
        assert r.status_code == 200, r.text
        yield SimpleNamespace(client=client, vendor_client=vendor_client, Session=S, fk=request.param)
    engine.dispose()


def _add_fat(env, fat_id, **kw):
    row = dict(id=fat_id, project_id=TEST_PROJECT_ID, equipment=f'Equipment {fat_id}', vendor_id='V1',
               startDate='2026-10-01', endDate='2026-10-05', status='Scheduled')
    row.update(kw)
    with env.Session() as db:
        db.add(models.FAT(**row))
        db.commit()


def _fat_rows(env):
    with env.Session() as db:
        return {f.id: (f.vendor_id, f.equipment, f.startDate, f.endDate) for f in db.query(models.FAT)}


def _audit_count(env):
    with env.Session() as db:
        return db.query(models.AuditLog).filter(models.AuditLog.entity_type == 'FAT').count()


def _listed(env, query=''):
    r = env.client.get('/api/fat/' + query)
    assert r.status_code == 200, r.text
    return {f['id']: f for f in r.json()}


# ── read: every stored row is listable ─────────────────────────────────────────────────────────────────────────────

def test_list_shows_a_fat_with_no_supplier(env):
    """cases 1 and 2 as they were stored before this fix: vendor_id NULL."""
    _add_fat(env, 'NOSUP', vendor_id=None)
    listed = _listed(env)
    assert listed['NOSUP']['supplier'] is None
    assert listed['OK']['supplier'] == 'FAT Supplier Co'
    r = env.client.get('/api/fat/NOSUP')
    assert r.status_code == 200 and r.json()['supplier'] is None


def test_list_shows_a_fat_whose_contractor_was_deleted(env):
    """case 3: the contractor row is gone (the API refuses this delete; it happens outside the app)."""
    _add_fat(env, 'GONE', vendor_id='V2')
    with env.Session() as db:
        db.execute(text("DELETE FROM contractors WHERE id = 'V2'"))
        db.commit()
    assert _fat_rows(env)['GONE'][0] == (None if env.fk else 'V2')     # SET NULL fired / dangling id
    listed = _listed(env)
    assert listed['GONE']['supplier'] is None
    assert listed['GONE']['equipment'] == 'Equipment GONE'
    assert env.client.get('/api/fat/GONE').json()['supplier'] is None


def test_list_shows_legacy_rows_with_missing_or_odd_fields(env):
    _add_fat(env, 'NODATE', equipment=None, startDate=None, endDate=None)
    _add_fat(env, 'ORDER', startDate='2026-10-09', endDate='2026-10-02', moveInDate='2026-10-01')
    _add_fat(env, 'FORMAT', startDate='2026/10/01')
    _add_fat(env, 'DATETIME', startDate='2026-10-01T08:30:00')
    listed = _listed(env)
    assert (listed['NODATE']['equipment'], listed['NODATE']['startDate'], listed['NODATE']['endDate']) == (None, None, None)
    assert (listed['ORDER']['startDate'], listed['ORDER']['endDate']) == ('2026-10-09', '2026-10-02')
    assert listed['FORMAT']['startDate'] == '2026/10/01'
    assert listed['DATETIME']['startDate'] == '2026-10-01'      # still normalised when it can be


# ── search ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_search_finds_by_supplier_name_and_equipment(env):
    _add_fat(env, 'NOSUP', vendor_id=None, equipment='Pump')
    assert set(_listed(env, '?search=supplier co')) == {'OK'}
    assert set(_listed(env, '?search=pump')) == {'NOSUP'}
    assert set(_listed(env, '?search=nothing-matches')) == set()


# ── write: no more silent NULL ─────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('supplier', ['', '   ', None], ids=['empty', 'blank', 'missing'])
def test_create_without_a_supplier_is_refused(env, supplier):
    before, audits = _fat_rows(env), _audit_count(env)
    body = dict(NEW) if supplier is None else {**NEW, 'supplier': supplier}
    r = env.client.post('/api/fat/', json=body)
    if supplier is None:
        assert r.status_code == 422         # `supplier` is a required field of FATCreate (unchanged)
    else:
        assert r.status_code == 400, r.text
        assert r.json()['code'] == 'FAT_SUPPLIER_REQUIRED'
        assert r.json()['detail'] == 'Supplier is required. Choose a contractor from the list.'
    assert _fat_rows(env) == before and _audit_count(env) == audits


def test_create_with_an_unknown_supplier_is_refused(env):
    before, audits = _fat_rows(env), _audit_count(env)
    r = env.client.post('/api/fat/', json={**NEW, 'supplier': 'No Such Co'})
    assert r.status_code == 400, r.text
    assert r.json()['code'] == 'FAT_SUPPLIER_NOT_FOUND'
    assert r.json()['params'] == {'name': 'No Such Co'}
    assert "'No Such Co' is not a contractor" in r.json()['detail']
    assert _fat_rows(env) == before and _audit_count(env) == audits


def test_create_with_a_deleted_contractor_is_refused(env):
    """case 3 on write: a page opened before the contractor was deleted still offers its name."""
    with env.Session() as db:
        db.execute(text("DELETE FROM contractors WHERE id = 'V2'"))
        db.commit()
    r = env.client.post('/api/fat/', json={**NEW, 'supplier': 'FAT Gone Co'})
    assert r.status_code == 400 and r.json()['code'] == 'FAT_SUPPLIER_NOT_FOUND'


def test_create_with_a_contractor_still_works(env):
    r = env.client.post('/api/fat/', json={**NEW, 'supplier': 'FAT Gone Co'})
    assert r.status_code == 200, r.text
    assert r.json()['supplier'] == 'FAT Gone Co'
    assert _fat_rows(env)[r.json()['id']][0] == 'V2'


@pytest.mark.parametrize('supplier,code', [('', 'FAT_SUPPLIER_REQUIRED'), (None, 'FAT_SUPPLIER_REQUIRED'),
                                           ('No Such Co', 'FAT_SUPPLIER_NOT_FOUND')],
                         ids=['empty', 'null', 'unknown'])
def test_update_to_no_supplier_is_refused(env, supplier, code):
    before, audits = _fat_rows(env), _audit_count(env)
    r = env.client.put('/api/fat/OK', json={'supplier': supplier, 'equipment': 'Changed'})
    assert r.status_code == 400, r.text
    assert r.json()['code'] == code
    assert _fat_rows(env) == before and _audit_count(env) == audits       # equipment not changed either


@pytest.mark.parametrize('field', ['equipment', 'startDate', 'endDate'])
def test_update_to_null_equipment_or_dates_is_refused(env, field):
    before = _fat_rows(env)
    r = env.client.put('/api/fat/OK', json={field: None})
    assert r.status_code == 422, r.text
    assert f'{field} cannot be null' in r.text
    assert _fat_rows(env) == before


def test_update_of_a_fat_whose_contractor_was_deleted(env):
    """The orphan stays editable: leaving supplier out keeps it as it is; choosing a contractor repairs it; sending the
    empty choice back is refused instead of being stored again."""
    _add_fat(env, 'GONE', vendor_id='V2')
    with env.Session() as db:
        db.execute(text("DELETE FROM contractors WHERE id = 'V2'"))
        db.commit()
    r = env.client.put('/api/fat/GONE', json={'status': 'In Progress'})
    assert r.status_code == 200, r.text
    assert r.json()['supplier'] is None and r.json()['status'] == 'In Progress'
    r = env.client.put('/api/fat/GONE', json={'supplier': '', 'status': 'Completed'})
    assert r.status_code == 400 and r.json()['code'] == 'FAT_SUPPLIER_REQUIRED'
    r = env.client.put('/api/fat/GONE', json={'supplier': 'FAT Supplier Co'})
    assert r.status_code == 200 and r.json()['supplier'] == 'FAT Supplier Co'
    assert _fat_rows(env)['GONE'][0] == 'V1'
    assert _listed(env)['GONE']['status'] == 'In Progress'


@pytest.mark.parametrize('supplier', ['', 'No Such Co', 'FAT Supplier Co'], ids=['empty', 'unknown', 'another'])
def test_a_contractor_account_still_creates_for_its_own_contractor(env, supplier):
    """Unchanged: whatever a contractor account submits, its FAT is its own contractor's (enforce_create_scope)."""
    r = env.vendor_client.post('/api/fat/', json={**NEW, 'supplier': supplier})
    assert r.status_code == 200, r.text
    assert r.json()['supplier'] == 'FAT Gone Co'
    assert _fat_rows(env)[r.json()['id']][0] == 'V2'
