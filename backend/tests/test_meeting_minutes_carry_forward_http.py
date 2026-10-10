"""Meeting Minutes discussion register carry-forward and end time (MEETING-TABS-2026-001, 2026-10-11).

* "New Occurrence" brings forward only the unfinished items (user decision 2026-10-11) — a copy marked `carried`,
  with the categories / sub-categories above them, their Action by / Target date and every progress update; Closed
  items stay only in the meeting that closed them, and a heading with nothing open under it is not carried (user
  decision 2026-10-11); numbers are not changed. It used to start with an empty register.
* Rows saved before this task (two levels, no `kind`) are read the same way the front end reads them.
* `meetingEndTime` is a new nullable column: a database from before it gets the column at start-up and its existing
  meetings still read (null); the next occurrence starts without a time.
Same throwaway world as test_meeting_minutes_rev_http (real unique index, real logins, real HTTP).
"""
import json

from sqlalchemy import text

import db_migrations
import models
from services.meeting_minutes_service import carry_forward_discussion_log
from test_meeting_minutes_rev_http import meeting_env  # noqa: F401  (fixture re-export)


def _create(c, **kw):
    r = c.post("/api/meeting-minutes/", json={"status": "Draft", "title": "Weekly", "vendor": "Accept Co", **kw})
    assert r.status_code == 200, r.text
    return r.json()


def _occurrence(c, meeting_id):
    r = c.post(f"/api/meeting-minutes/{meeting_id}/new-occurrence")
    assert r.status_code == 200, r.text
    return r.json()


THREE_LEVEL = [
    {"no": "1", "kind": "category", "level": 0, "content": "Technical Issues"},
    {"no": "1.1", "kind": "subcategory", "level": 1, "content": "Civil OB"},
    {"no": "1.1.1", "kind": "item", "level": 2, "content": "Safety lifeline lacks certificates", "owner": "TECO", "raisedDate": "2026-07-14",
     "targetDate": "2026-08-01", "status": "Open",
     "updates": [{"date": "2026-07-21", "content": "Drawing HL-ONS-08119 supplemented"}]},
    {"no": "1.1.2", "kind": "item", "level": 2, "content": "Closed one", "owner": "HL", "status": "Closed", "updates": []},
    {"no": "2", "kind": "category", "level": 0, "content": "Safety"},
]


def test_the_next_occurrence_carries_only_unfinished_items_with_their_structure_and_updates(meeting_env):
    c = meeting_env.login("mtg_a")
    first = _create(c, discussionLog=THREE_LEVEL)
    nxt = _occurrence(c, first["id"])
    log = nxt["discussionLog"]
    assert [e["no"] for e in log] == ["1", "1.1", "1.1.1"]    # Closed item and the empty heading "2" stay behind
    assert all(e["carried"] is True for e in log)
    item = log[2]
    assert (item["kind"], item["owner"], item["targetDate"], item["status"]) == ("item", "TECO", "2026-08-01", "Open")
    assert item["raisedDate"] == "2026-07-14"                            # the date it was first raised is kept
    assert item["updates"] == [{"date": "2026-07-21", "content": "Drawing HL-ONS-08119 supplemented", "carried": True}]
    # a copy: the earlier meeting keeps its own record unchanged
    again = c.get(f"/api/meeting-minutes/{first['id']}").json()["discussionLog"]
    assert again == THREE_LEVEL


def test_rows_saved_before_this_task_are_read_as_categories_and_items(meeting_env):
    c = meeting_env.login("mtg_a")
    legacy = [
        {"no": "1", "level": 0, "content": "Old topic"},
        {"no": "1.1", "level": 1, "content": "open sub", "owner": "Mac", "status": "Open"},
        {"no": "1.2", "level": 1, "content": "closed sub", "owner": "Toby", "status": "Closed"},
        {"no": "2", "topic": "Flat", "discussion": "talk", "decision": "agreed"},
    ]
    first = _create(c, discussionLog=legacy)
    log = _occurrence(c, first["id"])["discussionLog"]
    assert [(e["no"], e["kind"], e["content"]) for e in log] == [("1", "category", "Old topic"), ("1.1", "item", "open sub")]
    assert log[1]["owner"] == "Mac" and log[1]["updates"] == []


def test_flat_rows_with_an_owner_or_status_are_items():
    """Rows saved 2026-08-29 … 08-31: flat (no level), but already with owner / status — action rows, not headings."""
    out = json.loads(carry_forward_discussion_log(json.dumps([
        {"no": "1", "content": "open flat", "owner": "HL", "status": "Open"},
        {"no": "2", "content": "closed flat", "owner": "TECO", "status": "Closed"},
        {"no": "3", "content": "heading only"},
    ])))
    assert [(e["no"], e["kind"], e["owner"]) for e in out] == [("1", "item", "HL")]


def test_nothing_to_carry_gives_an_empty_register():
    assert carry_forward_discussion_log(None) is None
    assert carry_forward_discussion_log("not json") is None
    assert carry_forward_discussion_log(json.dumps([{"no": "1.1", "kind": "item", "status": "Closed"}])) is None


def test_end_time_is_saved_and_the_next_occurrence_starts_without_it(meeting_env):
    c = meeting_env.login("mtg_a")
    first = _create(c, meetingTime="15:00", meetingEndTime="17:15")
    assert (first["meetingTime"], first["meetingEndTime"]) == ("15:00", "17:15")
    r = c.put(f"/api/meeting-minutes/{first['id']}", json={"status": "Draft", "meetingEndTime": "17:30"})
    assert r.status_code == 200 and r.json()["meetingEndTime"] == "17:30"
    nxt = _occurrence(c, first["id"])
    assert nxt["meetingTime"] is None and nxt["meetingEndTime"] is None


def test_a_database_from_before_the_column_gets_it_and_old_meetings_still_read(meeting_env):
    c = meeting_env.login("mtg_a")
    old = _create(c, meetingTime="09:00")
    engine = meeting_env.Session.kw["bind"]
    with engine.begin() as conn:                                   # the shape of a database from before this task
        conn.execute(text('ALTER TABLE meeting_minutes DROP COLUMN "meetingEndTime"'))
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(meeting_minutes)"))]
        assert "meetingEndTime" not in cols
    db_migrations._add_missing_columns()                          # start-up migration (db_migrations.engine is the test engine)
    with engine.connect() as conn:
        assert "meetingEndTime" in [r[1] for r in conn.execute(text("PRAGMA table_info(meeting_minutes)"))]
    r = c.get(f"/api/meeting-minutes/{old['id']}")
    assert r.status_code == 200 and r.json()["meetingTime"] == "09:00" and r.json()["meetingEndTime"] is None
    db = meeting_env.Session()
    try:
        assert db.get(models.MeetingMinutes, old["id"]).meetingEndTime is None
    finally:
        db.close()
