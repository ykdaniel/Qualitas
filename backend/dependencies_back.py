import logging

from fastapi import Depends, HTTPException, status

import models
from core.security import get_current_user
from sqlalchemy.orm import Session
from database import get_db
from repositories.user_repository import UserRepository
from services.user_service import UserService
from repositories.itp_repository import ITPRepository
from services.itp_service import ITPService
from repositories.km_repository import KMRepository
from services.km_service import KMService

def get_user_service(db: Session = Depends(get_db)) -> UserService:
    repo = UserRepository(db)
    return UserService(repo)

def get_itp_service(db: Session = Depends(get_db)) -> ITPService:
    repo = ITPRepository(db)
    return ITPService(repo)

def get_km_service(db: Session = Depends(get_db)) -> KMService:
    repo = KMRepository(db)
    return KMService(repo)

# Note: The following services will be added as modules are refactored in Phases 1-3
# Uncomment each function as the corresponding repository and service are created

def get_noi_service(db: Session = Depends(get_db)):
    from repositories.noi_repository import NOIRepository
    from services.noi_service import NOIService
    repo = NOIRepository(db)
    return NOIService(repo)

def get_ncr_service(db: Session = Depends(get_db)):
    from repositories.ncr_repository import NCRRepository
    from services.ncr_service import NCRService
    repo = NCRRepository(db)
    return NCRService(repo)

def get_itr_service(db: Session = Depends(get_db)):
    from repositories.itr_repository import ITRRepository
    from services.itr_service import ITRService
    repo = ITRRepository(db)
    return ITRService(repo)

def get_pqp_service(db: Session = Depends(get_db)):
    from repositories.pqp_repository import PQPRepository
    from services.pqp_service import PQPService
    repo = PQPRepository(db)
    return PQPService(repo)

def get_obs_service(db: Session = Depends(get_db)):
    from repositories.obs_repository import OBSRepository
    from services.obs_service import OBSService
    repo = OBSRepository(db)
    return OBSService(repo)

def get_followup_service(db: Session = Depends(get_db)):
    from repositories.followup_repository import FollowUpRepository
    from services.followup_service import FollowUpService
    repo = FollowUpRepository(db)
    return FollowUpService(repo)

def get_checklist_service(db: Session = Depends(get_db)):
    from repositories.checklist_repository import ChecklistRepository
    from services.checklist_service import ChecklistService
    repo = ChecklistRepository(db)
    return ChecklistService(repo)

def get_contractor_service(db: Session = Depends(get_db)):
    from repositories.contractor_repository import ContractorRepository
    from services.contractor_service import ContractorService
    repo = ContractorRepository(db)
    return ContractorService(repo)

def get_audit_service(db: Session = Depends(get_db)):
    from repositories.audit_repository import AuditRepository
    from services.audit_service import AuditService
    repo = AuditRepository(db)
    return AuditService(repo)

logger = logging.getLogger(__name__)

class RoleChecker:
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    def __call__(self, user: models.User = Depends(get_current_user)):
        # 1. Check if user is active
        if not user.is_active:
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User is inactive"
            )

        # 2. Check if user has a role
        if not user.role:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User has no assigned role"
            )

        # 3. Check if role has the required permission
        # Using the permissions_rel relationship (List[Permission])
        user_permissions = [p.code for p in user.role.permissions_rel]

        if self.required_permission not in user_permissions:
            logger.debug(f"Permission denied. User: {user.username}, Role: {user.role.name}, Required: {self.required_permission}, Has: {user_permissions}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required: {self.required_permission}"
            )

        return user
