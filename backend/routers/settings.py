
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from core.dependencies import RoleChecker
from core.security import get_current_user

# Document numbers are QTS-RKS-<project code>-<type>-###### (REF-PROJECT-SEQ-2026-001 B3, D2): [PROJECT] is replaced
# by the record's project code (STD for a shared template); the contractor is no longer part of the number, so
# [ABBREV] is refused. KM numbers itself (QTS-KM-) and is exempt from both checks.
PROJECT_PLACEHOLDER = "[PROJECT]"
RETIRED_PLACEHOLDER = "[ABBREV]"
NAMING_RULE_EXEMPT_TYPES = {"km"}

DEFAULT_NAMING_RULES = [
    {"doc_type": "itp", "prefix": "QTS-RKS-[PROJECT]-ITP-", "sequence_digits": 6},
    {"doc_type": "noi", "prefix": "QTS-RKS-[PROJECT]-NOI-", "sequence_digits": 6},
    {"doc_type": "itr", "prefix": "QTS-RKS-[PROJECT]-ITR-", "sequence_digits": 6},
    {"doc_type": "ncr", "prefix": "QTS-RKS-[PROJECT]-NCR-", "sequence_digits": 6},
    {"doc_type": "obs", "prefix": "QTS-RKS-[PROJECT]-OBS-", "sequence_digits": 6},
    {"doc_type": "pqp", "prefix": "QTS-RKS-[PROJECT]-PQP-", "sequence_digits": 6},
    {"doc_type": "followup", "prefix": "QTS-RKS-[PROJECT]-FUI-", "sequence_digits": 6},
    {"doc_type": "fat", "prefix": "QTS-RKS-[PROJECT]-FAT-", "sequence_digits": 6},
    {"doc_type": "audit", "prefix": "QTS-RKS-[PROJECT]-AUD-", "sequence_digits": 6},
    {"doc_type": "checklist", "prefix": "QTS-RKS-[PROJECT]-CHK-", "sequence_digits": 6},
    {"doc_type": "osd", "prefix": "QTS-RKS-[PROJECT]-OSD-", "sequence_digits": 6},
    {"doc_type": "meeting", "prefix": "QTS-RKS-[PROJECT]-MOM-", "sequence_digits": 6},
    {"doc_type": "msa", "prefix": "QTS-RKS-[PROJECT]-MSA-", "sequence_digits": 6},
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
        if doc_type_normalized not in NAMING_RULE_EXEMPT_TYPES:
            if RETIRED_PLACEHOLDER in prefix:
                raise HTTPException(status_code=400, detail=f"Prefix for '{doc_type_normalized}' cannot use [ABBREV]: document "
                                                            "numbers no longer carry the contractor.")
            if PROJECT_PLACEHOLDER not in prefix:
                raise HTTPException(status_code=400, detail=f"Prefix for '{doc_type_normalized}' must include the [PROJECT] placeholder.")
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
