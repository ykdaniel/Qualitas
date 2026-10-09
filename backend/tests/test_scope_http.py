"""P0 — router-path enforcement for the NCR endpoints.

Unit tests prove the service/repo layer; this proves the *router* path composes
correctly: the `get_scope` dependency derives the right Scope from the user, the
endpoint functions pass it through, and out-of-scope single-record access raises
404. Calls the endpoint functions directly (no ASGI/httpx needed).
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from core.perms import NCR_VIEW
from core.scope import get_scope
import models
from routers import ncr as ncr_router
from repositories.ncr_repository import NCRRepository
from services.ncr_service import NCRService


@pytest.fixture
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()

    db.add_all([
        models.Project(id="P1", name="P1"),
        models.Project(id="P2", name="P2"),
        models.Contractor(id="V1", name="V1"),
    ])
    perm = models.Permission(code=NCR_VIEW, description="view")
    db.add(perm); db.flush()
    role = models.Role(name="Inspector"); role.permissions_rel = [perm]
    admin_role = models.Role(name="admin")
    db.add_all([role, admin_role]); db.flush()

    scoped = models.User(id=10, username="contractor", email="c@x.com", is_active=True, role_id=role.id)
    admin = models.User(id=11, username="boss", email="b@x.com", is_active=True, role_id=admin_role.id)
    db.add_all([scoped, admin]); db.flush()
    db.add(models.UserProject(user_id=scoped.id, project_id="P1"))
    db.add_all([
        models.NCR(id="n1", documentNumber="NCR-1", status="Open", project_id="P1", vendor_id="V1"),
        models.NCR(id="n2", documentNumber="NCR-2", status="Open", project_id="P2", vendor_id="V1"),
    ])
    db.commit()

    svc = NCRService(NCRRepository(db))
    yield db, svc, scoped, admin
    db.close()


def _list(svc, scope, user):
    return ncr_router.read_ncrs(
        skip=0, limit=500, search=None, status=None, start_date=None, end_date=None,
        ncr_service=svc, scope=scope, current_user=user,
    )


def test_scoped_user_list_is_filtered(env):
    db, svc, scoped, admin = env
    scope = get_scope(user=scoped, db=db)            # the real dependency
    assert {n.id for n in _list(svc, scope, scoped)} == {"n1"}


def test_scoped_user_cannot_get_other_project_record(env):
    db, svc, scoped, admin = env
    scope = get_scope(user=scoped, db=db)
    assert ncr_router.read_ncr(ncr_id="n1", ncr_service=svc, scope=scope, current_user=scoped).id == "n1"
    with pytest.raises(HTTPException) as exc:
        ncr_router.read_ncr(ncr_id="n2", ncr_service=svc, scope=scope, current_user=scoped)
    assert exc.value.status_code == 404


def test_admin_sees_everything(env):
    db, svc, scoped, admin = env
    scope = get_scope(user=admin, db=db)
    assert scope.unrestricted is True
    assert {n.id for n in _list(svc, scope, admin)} == {"n1", "n2"}
    assert ncr_router.read_ncr(ncr_id="n2", ncr_service=svc, scope=scope, current_user=admin).id == "n2"
