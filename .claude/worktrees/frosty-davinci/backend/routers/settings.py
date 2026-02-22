from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas
from middleware.auth import get_current_user, PermissionChecker, Permission

router = APIRouter(prefix="/settings", tags=["Settings"])

@router.get("/naming-rules", response_model=List[schemas.NamingRule])
def get_naming_rules(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    rules = db.query(models.DocumentNamingRule).all()
    if not rules:
        # If empty, seed again (double check)
        # Note: Importing from db_seeder inside function to avoid circular imports layout if any, 
        # though ideally db_seeder should be independent.
        from db_seeder import DEFAULT_NAMING_RULES
        for r in DEFAULT_NAMING_RULES:
             if not db.query(models.DocumentNamingRule).filter(models.DocumentNamingRule.doc_type == r["doc_type"]).first():
                 db.add(models.DocumentNamingRule(**r))
        db.commit()
        rules = db.query(models.DocumentNamingRule).all()
    return rules

@router.put("/naming-rules", response_model=List[schemas.NamingRule])
def update_naming_rules(
    rules: List[schemas.NamingRuleBase], 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE, Permission.MANAGE_SETTINGS]))
):
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
