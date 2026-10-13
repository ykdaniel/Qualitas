"""Audit template library (AUDIT-TEMPLATES-2026-001): /api/audit/templates — read with audit:view, create / edit with
audit:template:manage, deactivate instead of delete; item ids assigned by the server; and the copy semantics — an audit
keeps the items it copied when the template is edited afterwards.

Real login/routes on a disposable file DB; no main import, no development database access.
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
from core.perms import AUDIT_TEMPLATE_MANAGE
from core.security import get_password_hash
from database import Base, get_db
from project_membership import bind

VIEW_CODES = ['audit:view:all', 'audit:create:all', 'audit:update:all']


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'audit-templates.db'}", connect_args={'check_same_thread': False, 'timeout': 30})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, 'SessionLocal', S)
    password = secrets.token_urlsafe(24)
    with S() as db:
        perms = {c: models.Permission(code=c, description=c) for c in VIEW_CODES + [AUDIT_TEMPLATE_MANAGE]}
        auditor = models.Role(name='Auditor', permissions_rel=[perms[c] for c in VIEW_CODES])
        manager = models.Role(name='TemplateManager', permissions_rel=list(perms.values()))
        db.add_all([auditor, manager])
        db.flush()
        for name, role in (('auditor', auditor), ('manager', manager)):
            u = models.User(username=name, email=f'{name}@example.test', is_active=True, role_id=role.id,
                            hashed_password=get_password_hash(password))
            db.add(u)
            db.flush()
            bind(db, u)   # REF-PROJECT-SEQ B1: both work in one project (unbound = sees nothing, creates nothing)
        db.add(models.Contractor(id='vendor', name='Audit vendor', abbreviation='AV'))
        db.commit()
    app = FastAPI()
    for name in ['auth', 'audit']:
        app.include_router(importlib.import_module('routers.' + name).router, prefix='/api')

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    clients = {}
    for name in ('auditor', 'manager'):
        c = TestClient(app, raise_server_exceptions=False)
        c.__enter__()
        response = c.post('/api/auth/login', data={'username': name, 'password': password})
        assert response.status_code == 200, response.text
        clients[name] = c
    yield SimpleNamespace(auditor=clients['auditor'], manager=clients['manager'], Session=S)
    for c in clients.values():
        c.__exit__(None, None, None)
    engine.dispose()


ITEMS = [{'no': '7.1', 'title': 'Resources', 'clause': 'The organization shall determine and provide the resources needed', 'task': 'Are resources provided?'},
         {'no': '', 'clause': '', 'task': 'Is the site tidy?'}]


def new_template(env, **over):
    return env.manager.post('/api/audit/templates', json={'name': 'Site QA', 'items': ITEMS, **over})


def test_manager_creates_a_template_and_every_item_gets_its_own_id(env):
    response = new_template(env, description='Monthly', version='A')
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body['name'], body['description'], body['version'], body['is_active']) == ('Site QA', 'Monthly', 'A', True)
    assert [(i['no'], i['clause'], i['task']) for i in body['items']] == [(i['no'], i['clause'], i['task']) for i in ITEMS]
    assert [i['title'] for i in body['items']] == ['Resources', '']     # title kept; '' when not given
    ids = [i['id'] for i in body['items']]
    assert all(ids) and len(set(ids)) == 2
    assert body['created_at'] and body['updated_at']
    with env.Session() as db:
        log = db.query(models.AuditLog).filter_by(entity_type='AuditTemplate', action='CREATE').one()
        assert log.entity_id == str(body['id']) and log.username == 'manager'


def test_without_the_manage_permission_templates_can_be_read_but_not_written(env):
    created = new_template(env).json()
    listed = env.auditor.get('/api/audit/templates')
    assert listed.status_code == 200 and [t['name'] for t in listed.json()] == ['Site QA']
    assert env.auditor.post('/api/audit/templates', json={'name': 'Mine', 'items': []}).status_code == 403
    assert env.auditor.put(f"/api/audit/templates/{created['id']}", json={'name': 'Renamed'}).status_code == 403
    assert env.manager.get('/api/audit/templates').json()[0]['name'] == 'Site QA'


def test_names_are_unique_ignoring_case_and_surrounding_spaces(env):
    first = new_template(env).json()
    assert new_template(env, name='  site qa ').status_code == 409
    other = new_template(env, name='Other').json()
    assert env.manager.put(f"/api/audit/templates/{other['id']}", json={'name': 'SITE QA'}).status_code == 409
    # renaming a template to its own name (another case) is not a clash
    assert env.manager.put(f"/api/audit/templates/{first['id']}", json={'name': 'Site QA'}).status_code == 200
    for bad in ('', '   ', 'x' * 101, 123, ['ISO']):
        assert new_template(env, name=bad).status_code == 422, bad


def test_items_need_a_question_and_ids_stay_stable_across_edits(env):
    assert new_template(env, items=[{'no': '1', 'task': '  '}]).status_code == 422
    created = new_template(env).json()
    kept = created['items'][0]
    # the client sends the stored ids back; a new item has none; a repeated id is replaced
    response = env.manager.put(f"/api/audit/templates/{created['id']}", json={'items': [
        {**kept, 'task': 'Are resources provided and recorded?'}, {'no': '8.1', 'task': 'New question'},
        {**kept, 'task': 'Copy with the same id'}]})
    assert response.status_code == 200, response.text
    items = response.json()['items']
    assert items[0]['id'] == kept['id'] and items[0]['task'] == 'Are resources provided and recorded?'
    assert items[1]['id'] not in {kept['id'], created['items'][1]['id']}
    assert len({i['id'] for i in items}) == 3


def test_deactivated_templates_leave_the_wizard_list_and_there_is_no_delete(env):
    created = new_template(env).json()
    new_template(env, name='Second')
    response = env.manager.put(f"/api/audit/templates/{created['id']}", json={'is_active': False})
    assert response.status_code == 200 and response.json()['is_active'] is False
    assert [t['name'] for t in env.auditor.get('/api/audit/templates').json()] == ['Second']
    everything = env.auditor.get('/api/audit/templates', params={'include_inactive': True}).json()
    assert [(t['name'], t['is_active']) for t in everything] == [('Site QA', False), ('Second', True)]
    assert env.manager.delete(f"/api/audit/templates/{created['id']}").status_code in (404, 405)
    assert env.manager.put('/api/audit/templates/9999', json={'name': 'Nope'}).status_code == 404


def test_an_unchanged_save_writes_no_log_and_keeps_updated_at(env):
    created = new_template(env).json()
    same = env.manager.put(f"/api/audit/templates/{created['id']}", json={'name': 'Site QA', 'items': created['items']})
    assert same.status_code == 200 and same.json()['updated_at'] == created['updated_at']
    with env.Session() as db:
        assert db.query(models.AuditLog).filter_by(entity_type='AuditTemplate', action='UPDATE').count() == 0


def test_templates_is_not_read_as_an_audit_id(env):
    assert env.auditor.get('/api/audit/templates').status_code == 200
    assert env.auditor.get('/api/audit/not-an-id').status_code == 404


def test_items_copied_into_an_audit_do_not_change_when_the_template_is_edited(env):
    tpl = new_template(env).json()
    copied = [{'id': 1000 + n, 'no': i['no'], 'clause': i['clause'], 'task': i['task'], 'templateId': tpl['id'],
               'templateItemId': i['id']} for n, i in enumerate(tpl['items'])]
    audit = env.manager.post('/api/audit/', json={
        'auditNo': '', 'title': 'Copy test', 'date': '2026-10-01', 'end_date': '2026-10-02', 'status': 'Draft',
        'contractor': 'Audit vendor', 'selected_templates': ['Site QA'], 'custom_check_items': copied})
    assert audit.status_code == 200, audit.text
    audit_id = audit.json()['id']
    assert audit.json()['custom_check_items'] == copied  # templateId / templateItemId are kept as sent

    edit = env.manager.put(f"/api/audit/templates/{tpl['id']}", json={
        'name': 'Site QA v2', 'items': [{**tpl['items'][0], 'task': 'Changed question'}]})
    assert edit.status_code == 200, edit.text
    env.manager.put(f"/api/audit/templates/{tpl['id']}", json={'is_active': False})

    after = env.auditor.get(f'/api/audit/{audit_id}').json()
    assert after['custom_check_items'] == copied
    assert after['selected_templates'] == ['Site QA']  # the name as it was when selected
    with env.Session() as db:
        assert json.loads(db.get(models.Audit, audit_id).custom_check_items) == copied


def test_a_hand_edited_items_value_does_not_break_an_edit(env):
    created = new_template(env).json()
    with env.Session() as db:
        db.get(models.AuditTemplate, created['id']).items = 'not json'
        db.commit()
    assert env.auditor.get('/api/audit/templates').json()[0]['items'] == []     # read: lenient
    response = env.manager.put(f"/api/audit/templates/{created['id']}", json={'items': ITEMS})
    assert response.status_code == 200, response.text
    assert [i['task'] for i in response.json()['items']] == [i['task'] for i in ITEMS]


def test_item_field_limits_and_types(env):
    ok = new_template(env, name='Limits', items=[{'no': '1', 'clause': 'c' * 2000, 'task': 'q'}])
    assert ok.status_code == 200, ok.text                                        # the clause column holds 2000 characters
    assert new_template(env, name='Too long', items=[{'no': '1', 'clause': 'c' * 2001, 'task': 'q'}]).status_code == 422
    assert new_template(env, name='Object', items=[{'no': {'x': 1}, 'task': 'q'}]).status_code == 422
    assert new_template(env, name='List', items=[{'task': ['q']}]).status_code == 422
    assert new_template(env, name='Number no', items=[{'no': 7, 'task': 'q'}]).json()['items'][0]['no'] == '7'


def test_a_hand_edited_items_list_with_non_objects_reads_only_the_objects(env):
    created = new_template(env).json()
    with env.Session() as db:
        db.get(models.AuditTemplate, created['id']).items = json.dumps([None, 'x', {'id': 'a', 'no': '1', 'task': 'kept'}])
        db.commit()
    assert [i['task'] for i in env.auditor.get('/api/audit/templates').json()[0]['items']] == ['kept']
