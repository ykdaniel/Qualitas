"""Test helper — put a test account into a project (REF-PROJECT-SEQ-2026-001 batch 1).

Since batch 1 every account except a system administrator works in ONE project at a time; an account bound to no
project is a "non project member" and sees nothing (business decision D6 — such accounts used to be unscoped and see
everything). Suites whose accounts stood for "internal staff who see everything" give them a project with this helper
and keep their records in it, so each assertion keeps its original meaning (the refusals a suite checks must still come
from the rule it checks, never from "no project").
"""
import models

TEST_PROJECT_ID = "P-TEST"


def ensure_project(db, project_id=TEST_PROJECT_ID, name=None, code=None):
    """The project row (created when missing). Returns its id."""
    if db.get(models.Project, project_id) is None:
        db.add(models.Project(id=project_id, name=name or project_id, code=code))
        db.flush()
    return project_id


def bind(db, user, *project_ids):
    """Bind a user (model or id) to the given projects (default: the shared test project), creating missing projects.
    One project: the account works in it straight away. Several: it chooses one after signing in."""
    user_id = user if isinstance(user, int) else user.id
    for pid in (project_ids or (TEST_PROJECT_ID,)):
        ensure_project(db, pid)
        if db.query(models.UserProject).filter_by(user_id=user_id, project_id=pid).first() is None:
            db.add(models.UserProject(user_id=user_id, project_id=pid))
    db.flush()
