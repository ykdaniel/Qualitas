"""Regression test for BACKLOG #21 gap 1 (2026-10-05): "pick a person" pickers
used to offer deactivated users forever — UserRepository.get_all() had no
is_active filtering at all. active_only now defaults to True end-to-end
(router -> service -> repository) so pickers are active-only by default, while
the IAM admin page passes active_only=False explicitly to keep seeing (and
being able to reactivate) deactivated accounts.
"""
import models
from repositories.user_repository import UserRepository
from services.user_service import UserService


def _make_user(db_session, **overrides):
    username = overrides.get("username", "alice")
    base = dict(username=username, full_name="Alice Wu", email=f"{username}@example.com", is_active=True)
    base.update(overrides)
    user = models.User(**base)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_get_all_default_includes_everyone(db_session):
    """Repository's own bare default stays unfiltered — callers opt in to
    filtering, not the other way around, so nothing else in the codebase that
    calls get_all() without the new kwarg silently loses rows."""
    _make_user(db_session, username="alice", is_active=True)
    _make_user(db_session, username="bob", is_active=False)
    repo = UserRepository(db_session)

    result = repo.get_all()

    usernames = {u.username for u in result}
    assert usernames == {"alice", "bob"}


def test_get_all_active_only_excludes_deactivated(db_session):
    _make_user(db_session, username="alice", is_active=True)
    _make_user(db_session, username="bob", is_active=False)
    repo = UserRepository(db_session)

    result = repo.get_all(active_only=True)

    usernames = {u.username for u in result}
    assert usernames == {"alice"}


def test_service_get_users_defaults_to_active_only(db_session):
    """UserService.get_users() default must match the router's intended
    default (active-only) so a picker that calls it with no args is safe."""
    _make_user(db_session, username="alice", is_active=True)
    _make_user(db_session, username="bob", is_active=False)
    service = UserService(UserRepository(db_session))

    result = service.get_users()

    usernames = {u.username for u in result}
    assert usernames == {"alice"}


def test_service_get_users_active_only_false_returns_everyone(db_session):
    """The IAM admin page's own path — must still see deactivated accounts."""
    _make_user(db_session, username="alice", is_active=True)
    _make_user(db_session, username="bob", is_active=False)
    service = UserService(UserRepository(db_session))

    result = service.get_users(active_only=False)

    usernames = {u.username for u in result}
    assert usernames == {"alice", "bob"}
