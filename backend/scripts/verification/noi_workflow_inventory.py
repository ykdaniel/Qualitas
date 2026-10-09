"""
NOI / Q-WorkFlow inventory (READ-ONLY)

Lists Q-WorkFlow rows that belong to RE-INSPECTION NOIs (a NOI whose ``ncrNumber`` is set, judged by the same rule the create
path and the start-up back-fill use: ``services.noi_service.noi_has_own_qworkflow``). Before 2026-09-20 the start-up back-fill
gave such NOIs a row at every restart although the create path deliberately does not, so a database that has been restarted
may hold "extra" rows. They are only REPORTED here: nothing is deleted, merged or renumbered (a row may already be referenced by
people or reports), and whether to retire them is a separate decision.

Makes NO writes. Never point it at a live database; run it against a copy.
"""
from typing import List, Tuple

from sqlalchemy.orm import Session

import models
from services.noi_service import noi_has_own_qworkflow


def find_reinspection_noi_rows(db: Session) -> Tuple[int, List[str]]:
    """(count, one description per row) of Q-WorkFlow rows whose NOI is a re-inspection NOI."""
    hits = []
    pairs = (
        db.query(models.QWorkflow, models.NOI)
        .join(models.NOI, models.QWorkflow.noi_id == models.NOI.id)
        .order_by(models.QWorkflow.referenceNo)
        .all()
    )
    for q, n in pairs:
        if not noi_has_own_qworkflow(n.ncrNumber):
            hits.append(f"{q.referenceNo} -> {n.referenceNo} (ncrNumber={n.ncrNumber!r}, created {q.createdAt})")
    return len(hits), hits


def run_inventory(db: Session) -> None:
    count, hits = find_reinspection_noi_rows(db)
    print("NOI / Q-WorkFlow inventory (read-only)\n")
    print(f"Q-WorkFlow rows belonging to re-inspection NOIs: {count}")
    for line in hits:
        print(f"  - {line}")
    print("\nNo rows were modified — this script only reads.")


if __name__ == "__main__":
    from database import SessionLocal
    session = SessionLocal()
    try:
        run_inventory(session)
    finally:
        session.close()
