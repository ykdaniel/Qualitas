
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from core.dependencies import RoleChecker
from core.security import get_current_user

DEFAULT_NAMING_RULES = [
    {"doc_type": "itp", "prefix": "QTS-RKS-[ABBREV]-ITP-", "sequence_digits": 6},
    {"doc_type": "noi", "prefix": "QTS-RKS-[ABBREV]-NOI-", "sequence_digits": 6},
    {"doc_type": "itr", "prefix": "QTS-RKS-[ABBREV]-ITR-", "sequence_digits": 6},
    {"doc_type": "ncr", "prefix": "QTS-RKS-[ABBREV]-NCR-", "sequence_digits": 6},
    {"doc_type": "obs", "prefix": "QTS-RKS-[ABBREV]-OBS-", "sequence_digits": 6},
    {"doc_type": "pqp", "prefix": "QTS-RKS-[ABBREV]-PQP-", "sequence_digits": 6},
    {"doc_type": "followup", "prefix": "QTS-RKS-[ABBREV]-FUI-", "sequence_digits": 6},
    {"doc_type": "fat", "prefix": "QTS-RKS-[ABBREV]-FAT-", "sequence_digits": 6},
    {"doc_type": "audit", "prefix": "QTS-RKS-[ABBREV]-AUD-", "sequence_digits": 6},
    {"doc_type": "checklist", "prefix": "QTS-RKS-[ABBREV]-CHK-", "sequence_digits": 6},
    {"doc_type": "osd", "prefix": "QTS-RKS-[ABBREV]-OSD-", "sequence_digits": 6},
    {"doc_type": "meeting", "prefix": "QTS-RKS-[ABBREV]-MOM-", "sequence_digits": 6},
]

router = APIRouter(prefix="/settings", tags=["Settings"])

@router.get("/naming-rules", response_model=list[schemas.NamingRule])
def get_naming_rules(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    # Seed any DEFAULT_NAMING_RULES entry that's missing, not just on a fully
    # empty table — otherwise a doc type added to the defaults later (e.g.
    # OSD) never appears for a deployment whose table was already populated.
    existing_types = {r.doc_type for r in db.query(models.DocumentNamingRule).all()}
    missing = [r for r in DEFAULT_NAMING_RULES if r["doc_type"] not in existing_types]
    if missing:
        for r in missing:
            db.add(models.DocumentNamingRule(**r))
        db.commit()
    return db.query(models.DocumentNamingRule).all()

@router.put("/naming-rules", response_model=list[schemas.NamingRule])
def update_naming_rules(
    rules: list[schemas.NamingRuleBase],
    db: Session = Depends(get_db),
    _user=Depends(RoleChecker("settings:manage:all"))
):
    # Sanity-check every prefix before writing anything — this feeds
    # generate_reference_no for every module, so a bad prefix here has a wide
    # blast radius. The frontend does the same checks, but that's UX only;
    # this is the actual boundary since it's reachable by any settings:manage:all
    # caller directly via the API.
    seen_prefixes: dict[str, str] = {}
    for rule in rules:
        doc_type_normalized = (rule.doc_type or "").strip().lower()
        if not doc_type_normalized:
            continue
        prefix = (rule.prefix or "").strip()
        if not prefix:
            raise HTTPException(status_code=400, detail=f"Prefix for '{doc_type_normalized}' cannot be empty.")
        if "[ABBREV]" not in prefix:
            raise HTTPException(status_code=400, detail=f"Prefix for '{doc_type_normalized}' must include the [ABBREV] placeholder.")
        if prefix in seen_prefixes:
            raise HTTPException(
                status_code=400,
                detail=f"'{seen_prefixes[prefix]}' and '{doc_type_normalized}' have the same prefix — document numbers would collide.",
            )
        seen_prefixes[prefix] = doc_type_normalized

    try:
        for rule in rules:
            doc_type_normalized = (rule.doc_type or "").strip().lower()
            if not doc_type_normalized: continue
            seq_digits = rule.sequence_digits if rule.sequence_digits and 1 <= rule.sequence_digits <= 6 else 6

            db_rule = db.query(models.DocumentNamingRule).filter(models.DocumentNamingRule.doc_type == doc_type_normalized).first()
            if db_rule:
                db_rule.prefix = rule.prefix or ""
                db_rule.sequence_digits = seq_digits
            else:
                db.add(models.DocumentNamingRule(doc_type=doc_type_normalized, prefix=rule.prefix or "", sequence_digits=seq_digits))
        db.commit()
        return db.query(models.DocumentNamingRule).all()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
