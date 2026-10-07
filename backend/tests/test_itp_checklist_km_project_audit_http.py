"""ITP / Checklist(create) / KM / Project write paths: real login/routes, disposable DB, new-session assertions.

Same repair as `test_reviewed_audit_paths_http.py` and `test_remaining_audit_paths_http.py` (2026-09-22), applied
to the four modules that were flagged but not yet covered: ITP (create/update/delete/update-detail), Checklist
(create only — update/delete were already fixed in the §17 isolation-hardening round), KM (create/update/delete —
this module never called log_audit at all, so the "before" state here is zero audit rows, not a lost one), and
Project (create/update/delete — same "never audited at all" starting point).

2026-09-28: Project's write endpoints used to gate on a literal role-NAME check
(role.name in ("admin", "Admin", "ADMIN", "system_admin")), not a permission code — fixed to require
contractors:manage:all via the same RoleChecker every other permission-gated route uses (see
routers/projects.py). AuditWriter2 below is now granted that permission directly (it is the real,
already-existing permission code the fix checks — not a new one invented to make this suite pass),
and the separate "Admin"-named/zero-permission role this file used to route Project requests through
is gone; every case now goes through the single, permission-holding client.

No main import, seeding, scheduler, uploads or development database access.
"""
import importlib
import json
import secrets
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import models
from database import Base, get_db
from core.security import get_password_hash

CASES = ['itp', 'checklist', 'km', 'project']
MODELS = dict(itp=models.ITP, checklist=models.Checklist, km=models.KMArticle, project=models.Project)
TYPES = dict(itp='ITP', checklist='Checklist', km='KMArticle', project='Project')
PATHS = dict(itp='/api/itp/', checklist='/api/checklist/', km='/api/km/', project='/api/projects/')
BODIES = {
    'itp': dict(vendor='Audit vendor', description='Plan', rev='A', submit='Initial', status='Draft', submissionDate='2026-09-01'),
    'checklist': dict(activity='Weld', date='2026-09-01', status='Ongoing', packageName='P', contractor='Audit vendor',
                      detail_data=json.dumps({"items": [{"description": "d", "criteria": "c", "result": ""}]})),
    'km': dict(title='Reviewed article', content='Body'),
    'project': dict(name='Reviewed project'),
}


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'audit2.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        codes = ['itp:create:all', 'itp:update:all', 'itp:delete:all',
                 'checklist:create:all', 'checklist:view:all',
                 'km:create:all', 'km:update:all', 'km:delete:all', 'km:view:all',
                 'contractors:view:all', 'contractors:manage:all', 'itr:view:all']
        role = models.Role(name='AuditWriter2')
        role.permissions_rel = [models.Permission(code=c, description=c) for c in codes]
        db.add(role)
        db.flush()
        db.add(models.User(username='audit-writer2', email='audit-writer2@example.test', is_active=True,
                           role_id=role.id, hashed_password=get_password_hash(password)))
        db.add(models.Contractor(id='vendor', name='Audit vendor', abbreviation='AV'))
        db.commit()
    app = FastAPI()
    for name in ['auth', 'itp', 'checklist', 'km', 'projects']:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')
    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/auth/login', data={'username': 'audit-writer2', 'password': password})
        assert response.status_code == 200, response.text
        yield SimpleNamespace(client=client, Session=S, app=app)
    engine.dispose()


def write(env, case):
    return env.client.post(PATHS[case], json=BODIES[case])


def snapshot(env):
    with env.Session() as db:
        return {m.__tablename__: sorted([tuple(str(getattr(r, c.name)) for c in m.__table__.columns)
                                         for r in db.query(m).all()])
                for m in [*MODELS.values(), models.AuditLog, models.ReferenceSequence]}


@pytest.mark.parametrize('case', CASES)
def test_saved_data_has_matching_durable_audit(env, case):
    response = write(env, case)
    assert response.status_code == 200, response.text
    rid = response.json()['id']
    with env.Session() as db:
        assert db.get(MODELS[case], rid) is not None
        audit = db.query(models.AuditLog).filter_by(entity_type=TYPES[case], entity_id=rid).one()
        assert audit.action == 'CREATE'
        assert audit.username == 'audit-writer2'
        assert audit.user_id and audit.timestamp
        assert json.loads(audit.new_value)


@pytest.mark.parametrize('case', CASES)
@pytest.mark.parametrize('failure', ['audit_call', 'audit_object', 'audit_flush', 'commit'])
def test_failure_rolls_back_record_sequence_and_audit(env, monkeypatch, case, failure):
    before = snapshot(env)
    def fail(*args, **kwargs):
        raise RuntimeError('injected audit transaction failure')
    rollbacks = []
    def rolled_back(session):
        rollbacks.append(1)
    event.listen(env.Session.class_, 'after_rollback', rolled_back)
    module_name = {'itp': 'services.itp_service', 'checklist': 'services.checklist_service',
                   'km': 'services.km_service', 'project': 'services.project_service'}[case]
    with monkeypatch.context() as patch:
        if failure == 'audit_call':
            patch.setattr(importlib.import_module(module_name), 'log_audit', fail)
        elif failure == 'audit_object':
            import core.utils as utils
            patch.setattr(utils, 'AuditLog', fail)  # strict logger must propagate construction failure
        elif failure == 'commit':
            patch.setattr(env.Session.class_, 'commit', fail)
        else:
            def fail_audit_flush(session, *args):
                if any(isinstance(r, models.AuditLog) for r in session.new):
                    fail()
            event.listen(env.Session.class_, 'before_flush', fail_audit_flush)
        try:
            response = write(env, case)
            assert response.status_code == 500, response.text
        finally:
            if failure == 'audit_flush':
                event.remove(env.Session.class_, 'before_flush', fail_audit_flush)
    event.remove(env.Session.class_, 'after_rollback', rolled_back)
    assert rollbacks  # service rolls back explicitly, not just session teardown
    assert snapshot(env) == before
    assert write(env, case).status_code == 200  # rollback releases locks and permits a clean retry


@pytest.mark.parametrize('case', CASES)
def test_success_commits_exactly_once(env, case):
    commits = []
    def committed(session):
        commits.append(1)
    event.listen(env.Session.class_, 'after_commit', committed)
    try:
        assert write(env, case).status_code == 200
    finally:
        event.remove(env.Session.class_, 'after_commit', committed)
    assert commits == [1]


@pytest.mark.parametrize('case', CASES)  # project is now permission-gated the same as the others
def test_permission_refusal_changes_nothing(env, case):
    with env.Session() as db:
        db.query(models.Role).filter_by(name='AuditWriter2').one().permissions_rel = []
        db.commit()
    before = snapshot(env)
    assert write(env, case).status_code == 403
    assert snapshot(env) == before


def test_project_write_uses_contractors_manage_permission_not_role_name(env):
    """2026-09-28 fix: Project's write endpoints now require contractors:manage:all (RoleChecker),
    the same permission code routers/contractors.py already checks — not a literal role-name string.
    Renaming AuditWriter2's role must not change its write access either way."""
    with env.Session() as db:
        role = db.query(models.Role).filter_by(name='AuditWriter2').one()
        # Confirm the permission this role already holds (granted in the `env` fixture) is really
        # what's gating this, not the role's name — rename it away from anything admin-sounding.
        role.name = 'DefinitelyNotAdminOrAnythingLikeIt'
        db.commit()
    response = write(env, 'project')
    assert response.status_code == 200, response.text
    rid = response.json()['id']
    with env.Session() as db:
        assert db.get(models.Project, rid) is not None
        audit = db.query(models.AuditLog).filter_by(entity_type='Project', entity_id=rid).one()
        assert audit.action == 'CREATE' and audit.username == 'audit-writer2'


def test_project_write_rejected_for_an_admin_named_role_without_the_permission(env):
    """The reverse of the above: a role literally named "Admin" with NO contractors:manage:all (or
    any other permission) must be rejected — the name "Admin" grants nothing by itself."""
    with env.Session() as db:
        admin_role = models.Role(name='Admin')
        db.add(admin_role)
        db.flush()
        db.add(models.User(username='literally-named-admin', email='lna@example.test', is_active=True,
                           role_id=admin_role.id, hashed_password=get_password_hash('irrelevant-password-00')))
        db.commit()
    admin_client = TestClient(env.app, raise_server_exceptions=False)
    login_res = admin_client.post('/api/auth/login', data={'username': 'literally-named-admin', 'password': 'irrelevant-password-00'})
    assert login_res.status_code == 200, login_res.text
    before = snapshot(env)
    response = admin_client.post(PATHS['project'], json={'name': 'Should be rejected'})
    assert response.status_code == 403, response.text
    assert snapshot(env) == before


@pytest.mark.parametrize('case', CASES)
def test_repository_default_still_commits(env, case):
    repo_module = {'itp': 'repositories.itp_repository', 'checklist': 'repositories.checklist_repository',
                    'km': 'repositories.km_repository', 'project': 'repositories.project_repository'}[case]
    repo_class = {'itp': 'ITPRepository', 'checklist': 'ChecklistRepository', 'km': 'KMRepository', 'project': 'ProjectRepository'}[case]
    repo_cls = getattr(importlib.import_module(repo_module), repo_class)
    with env.Session() as db:
        repo = repo_cls(db)
        rid = 'repository-default-' + case
        if case == 'itp':
            repo.create(models.ITP(id=rid, vendor_id='vendor', description='d', rev='A', submit='s', status='Draft'))
        elif case == 'checklist':
            repo.create(models.Checklist(id=rid, activity='Weld', date='2026-09-01', status='Ongoing', contractor_id='vendor',
                                         detail_data=json.dumps({"items": []})))
        elif case == 'km':
            from schemas import KMArticleCreate
            created = repo.create(article=KMArticleCreate(id=rid, title='Repo default', content='x'), author_id=1)
            rid = created.id
        else:
            repo.create(models.Project(id=rid, name='Repo default project'))
        with env.Session() as fresh:
            assert fresh.get(MODELS[case], rid) is not None
