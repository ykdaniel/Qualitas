"""P0 — scope enforcement on the `/{id}/related` endpoints.

These endpoints expose a record's relation graph. They must gate the *root*
record by scope first, or a scoped user could read another project's relations
by id. NCR/NOI already did this; ITP/ITR were missing it. Calls the endpoint
functions directly (no ASGI needed); the related_service is a stub since the
out-of-scope path must 404 before it is ever consulted.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from core.perms import ITP_VIEW, ITR_VIEW
from core.scope import get_scope
import models
from routers import itp as itp_router
from routers import itr as itr_router
from repositories.itp_repository import ITPRepository
from repositories.itr_repository import ITRRepository
from services.itp_service import ITPService
from services.itr_service import ITRService


class _RelatedStub:
    """Returns a sentinel; records whether it was called (it must NOT be reached
    on the out-of-scope path)."""
    def __init__(self):
        self.called = False

    def get_related(self, entity_type, entity_id, max_depth=2, scope=None):   # routers pass the caller's scope (2026-10-10)
        self.called = True
        return {"nodes": [], "edges": []}


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
    perms = [models.Permission(code=ITP_VIEW, description="v"),
             models.Permission(code=ITR_VIEW, description="v")]
    db.add_all(perms); db.flush()
    role = models.Role(name="Inspector"); role.permissions_rel = perms
    admin_role = models.Role(name="admin")
    db.add_all([role, admin_role]); db.flush()

    scoped = models.User(id=10, username="contractor", email="c@x.com", is_active=True, role_id=role.id)
    admin = models.User(id=11, username="boss", email="b@x.com", is_active=True, role_id=admin_role.id)
    db.add_all([scoped, admin]); db.flush()
    db.add(models.UserProject(user_id=scoped.id, project_id="P1"))
    db.add_all([
        models.ITP(id="itp1", referenceNo="ITP-1", status="Open", project_id="P1", vendor_id="V1"),
        models.ITP(id="itp2", referenceNo="ITP-2", status="Open", project_id="P2", vendor_id="V1"),
        models.ITR(id="itr1", documentNumber="ITR-1", status="Open", project_id="P1", vendor_id="V1"),
        models.ITR(id="itr2", documentNumber="ITR-2", status="Open", project_id="P2", vendor_id="V1"),
    ])
    db.commit()

    itp_svc = ITPService(ITPRepository(db))
    itr_svc = ITRService(ITRRepository(db))
    yield db, itp_svc, itr_svc, scoped, admin
    db.close()


def test_itp_related_blocks_out_of_scope(env):
    db, itp_svc, itr_svc, scoped, admin = env
    scope = get_scope(user=scoped, db=db)
    rel = _RelatedStub()
    # In-scope: allowed, related_service is consulted.
    itp_router.read_itp_related(itp_id="itp1", related_service=rel, itp_service=itp_svc,
                                scope=scope, current_user=scoped)
    assert rel.called is True
    # Out-of-scope: 404 before related_service is ever called.
    rel2 = _RelatedStub()
    with pytest.raises(HTTPException) as exc:
        itp_router.read_itp_related(itp_id="itp2", related_service=rel2, itp_service=itp_svc,
                                    scope=scope, current_user=scoped)
    assert exc.value.status_code == 404
    assert rel2.called is False


def test_itr_related_blocks_out_of_scope(env):
    db, itp_svc, itr_svc, scoped, admin = env
    scope = get_scope(user=scoped, db=db)
    rel = _RelatedStub()
    itr_router.read_itr_related(itr_id="itr1", related_service=rel, itr_service=itr_svc,
                                scope=scope, current_user=scoped)
    assert rel.called is True
    rel2 = _RelatedStub()
    with pytest.raises(HTTPException) as exc:
        itr_router.read_itr_related(itr_id="itr2", related_service=rel2, itr_service=itr_svc,
                                    scope=scope, current_user=scoped)
    assert exc.value.status_code == 404
    assert rel2.called is False


def test_admin_related_unrestricted(env):
    db, itp_svc, itr_svc, scoped, admin = env
    scope = get_scope(user=admin, db=db)
    assert scope.unrestricted is True
    rel = _RelatedStub()
    itp_router.read_itp_related(itp_id="itp2", related_service=rel, itp_service=itp_svc,
                                scope=scope, current_user=admin)
    itr_router.read_itr_related(itr_id="itr2", related_service=rel, itr_service=itr_svc,
                                scope=scope, current_user=admin)
    assert rel.called is True
