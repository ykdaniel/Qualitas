"""Focused review probes. Tests use temporary SQLite and upload roots, never main/startup."""
from test_material_submittals_http import env, ok, register, upload
import models

def test_non_image_disguised_as_photo(env):
    item = ok(register(env))
    for filename, content, mime in [
        ('fake.png', b'this is plain text, not an image', 'image/png'),
        ('audio.webp', b'RIFF'+(36).to_bytes(4,'little')+b'WAVEfmt '+bytes(28), 'image/webp'),
    ]:
        response = upload(env, 'admin', item['revisionId'], 'photo', (filename, content, mime))
        print('NON_IMAGE', filename, 'HTTP', response.status_code)
        assert response.status_code == 200  # reproduces the defect; expected product behavior is 400

def test_projects_default_page_is_not_all_visible_projects(env):
    with env.Session() as db:
        db.add_all([models.Project(id=f'EXTRA-{n:03}', name=f'Extra {n}') for n in range(201)])
        db.commit()
    default = ok(env.c['admin'].get('/api/projects/'))
    second = ok(env.c['admin'].get('/api/projects/', params={'skip':200,'limit':200}))
    print('PROJECTS default=',len(default),'remaining=',len(second),'visible=',len(default)+len(second))
    assert len(default) == 200 and len(second) == 3
