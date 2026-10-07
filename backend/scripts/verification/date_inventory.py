"""
NCR / OBS / NOI stored-date inventory (READ-ONLY)

Lists rows whose stored dates a NEW write would not be allowed to produce (invalid format, non-existent calendar day, time stamp,
trailing characters, whitespace, NULL in a required NOI date, NCR order violations), using EXACTLY the function the API uses to fill
the read-only `date_issues` field (`core.strict_dates.compute_date_issues`). Nothing is changed: no value is rewritten, nulled or
dropped, and nothing is written back — repairing a value is a decision for a person, through the normal edit path.

Never point it at a live database; run it against a copy.
"""
from collections import Counter
from typing import Dict, List, Tuple

from sqlalchemy.orm import Session

import models
from core import strict_dates

_SPECS = (
    ("NCR", models.NCR, "documentNumber", strict_dates.NCR_DATE_FIELDS, (), strict_dates.NCR_ORDER_RELATIONS),
    ("OBS", models.OBS, "documentNumber", strict_dates.OBS_DATE_FIELDS, (), ()),
    ("NOI", models.NOI, "referenceNo", strict_dates.NOI_DATE_FIELDS, strict_dates.NOI_REQUIRED_DATE_FIELDS, ()),
)


def find_date_issues(db: Session) -> Dict[str, List[Tuple[str, List[dict]]]]:
    """{module: [(reference, issues), ...]} for every row that has at least one issue."""
    out: Dict[str, List[Tuple[str, List[dict]]]] = {}
    for name, model, ref_field, fields, required, relations in _SPECS:
        rows = []
        for row in db.query(model).order_by(getattr(model, ref_field)).all():
            issues = strict_dates.compute_date_issues(row, fields, required=required, relations=relations)
            if issues:
                rows.append((getattr(row, ref_field), issues))
        out[name] = rows
    return out


def run_inventory(db: Session) -> None:
    result = find_date_issues(db)
    print("NCR / OBS / NOI stored-date inventory (read-only)\n")
    for name, rows in result.items():
        codes = Counter(i["code"] for _, issues in rows for i in issues)
        print(f"{name}: {len(rows)} row(s) with date issues  {dict(codes) if codes else ''}")
        for ref, issues in rows:
            print(f"  - {ref}: " + "; ".join(f"{i['field']}={i['value']!r} [{i['code']}]" for i in issues))
    print("\nNo rows were modified — this script only reads.")


if __name__ == "__main__":
    from database import SessionLocal
    session = SessionLocal()
    try:
        run_inventory(session)
    finally:
        session.close()
