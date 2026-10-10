"""Internal Audit: Void is read-only like Closed (AUDIT-HARDENING-B-2026-001, user decision 2026-10-09).

Real login/routes on a disposable file DB (fixture shared with test_audit_hardening_http); no main import, no development
database access.
"""
from test_audit_hardening_http import body, create, env, insert_raw, snapshot, stored  # noqa: F401  (env is a fixture)


def test_any_open_audit_can_be_voided_then_nothing_changes_it(env):
    created = create(env, status='Planned').json()
    voided = env.client.put(f"/api/audit/{created['id']}", json=body(status='Void'))
    assert voided.status_code == 200, voided.text
    before = snapshot(env)
    for change in ({'title': 'edited after void'}, {'status': 'Draft'}, {'findings': 'late finding'}):
        response = env.client.put(f"/api/audit/{created['id']}", json=change)
        assert response.status_code == 400, response.text
    assert snapshot(env) == before


def test_void_wizard_resave_is_a_no_op(env):
    created = create(env).json()
    assert env.client.put(f"/api/audit/{created['id']}", json=body(status='Void')).status_code == 200
    before = snapshot(env)
    response = env.client.put(f"/api/audit/{created['id']}", json=body(status='Void'))
    assert response.status_code == 200, response.text
    assert snapshot(env) == before  # nothing rewritten, no audit-log row


def test_void_audit_can_still_be_deleted(env):
    audit_id = insert_raw(env, status='Void', auditNo='VOID-1')
    response = env.client.delete(f'/api/audit/{audit_id}')
    assert response.status_code == 200, response.text
    with env.Session() as db:
        import models
        assert db.get(models.Audit, audit_id) is None


def test_open_audit_still_editable(env):
    created = create(env).json()
    response = env.client.put(f"/api/audit/{created['id']}", json={'title': 'still a draft'})
    assert response.status_code == 200, response.text
    assert stored(env, created['id']).title == 'still a draft'


def test_project_id_from_the_wizard_is_saved_on_create_and_update(env):
    import models
    with env.Session() as db:
        db.add_all([models.Project(id='p1', name='Project One', code='P1'), models.Project(id='p2', name='Project Two', code='P2')])
        db.commit()
    created = create(env, project_id='p1', project_name='Project One').json()
    assert created['project_id'] == 'p1'
    assert [a['id'] for a in env.client.get('/api/audit/', params={'project_id': 'p1'}).json()] == [created['id']]
    moved = env.client.put(f"/api/audit/{created['id']}", json=body(project_id='p2', project_name='Project Two'))
    assert moved.status_code == 200, moved.text
    assert stored(env, created['id']).project_id == 'p2'
    assert env.client.get('/api/audit/', params={'project_id': 'p1'}).json() == []
