import logging

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
from core.security import get_current_user
from database import get_db

# Repositories
from repositories.user_repository import UserRepository
from repositories.itp_repository import ITPRepository
from repositories.km_repository import KMRepository
from repositories.noi_repository import NOIRepository
from repositories.ncr_repository import NCRRepository
from repositories.itr_repository import ITRRepository
from repositories.pqp_repository import PQPRepository
from repositories.obs_repository import OBSRepository
from repositories.followup_repository import FollowUpRepository
from repositories.checklist_repository import ChecklistRepository
from repositories.contractor_repository import ContractorRepository
from repositories.audit_repository import AuditRepository
from repositories.fat_repository import FATRepository
from repositories.kpi_repository import KPIRepository

# Services
from services.user_service import UserService
from services.itp_service import ITPService
from services.km_service import KMService
from services.noi_service import NOIService
from services.ncr_service import NCRService
from services.itr_service import ITRService
from services.pqp_service import PQPService
from services.obs_service import OBSService
from services.followup_service import FollowUpService
from services.checklist_service import ChecklistService
from services.contractor_service import ContractorService
from services.audit_service import AuditService
from services.fat_service import FATService
from services.kpi_service import KPIService
from services.related_service import RelatedService
from services.workflow_service import WorkflowService

logger = logging.getLogger(__name__)

def get_user_service(db: Session = Depends(get_db)) -> UserService:
    repo = UserRepository(db)
    return UserService(repo)

def get_itp_service(db: Session = Depends(get_db)) -> ITPService:
    repo = ITPRepository(db)
    return ITPService(repo)

def get_km_service(db: Session = Depends(get_db)) -> KMService:
    repo = KMRepository(db)
    return KMService(repo)

def get_noi_service(db: Session = Depends(get_db)) -> NOIService:
    repo = NOIRepository(db)
    return NOIService(repo)

def get_ncr_service(db: Session = Depends(get_db)) -> NCRService:
    repo = NCRRepository(db)
    return NCRService(repo)

def get_itr_service(db: Session = Depends(get_db)) -> ITRService:
    repo = ITRRepository(db)
    return ITRService(repo)

def get_pqp_service(db: Session = Depends(get_db)) -> PQPService:
    repo = PQPRepository(db)
    return PQPService(repo)

def get_obs_service(db: Session = Depends(get_db)) -> OBSService:
    repo = OBSRepository(db)
    return OBSService(repo)

def get_followup_service(db: Session = Depends(get_db)) -> FollowUpService:
    repo = FollowUpRepository(db)
    return FollowUpService(repo)

def get_checklist_service(db: Session = Depends(get_db)) -> ChecklistService:
    repo = ChecklistRepository(db)
    return ChecklistService(repo)

def get_contractor_service(db: Session = Depends(get_db)) -> ContractorService:
    repo = ContractorRepository(db)
    return ContractorService(repo)

def get_audit_service(db: Session = Depends(get_db)) -> AuditService:
    repo = AuditRepository(db)
    return AuditService(repo)

def get_fat_service(db: Session = Depends(get_db)) -> FATService:
    repo = FATRepository(db)
    return FATService(repo)

def get_kpi_service(db: Session = Depends(get_db)) -> KPIService:
    repo = KPIRepository(db)
    return KPIService(repo)

def get_related_service(db: Session = Depends(get_db)) -> RelatedService:
    # RelatedService doesn't need a repository — it reads across many
    # modules via SQLAlchemy relationships declared on the models, so
    # it takes the raw session.
    return RelatedService(db)

def get_workflow_service(db: Session = Depends(get_db)) -> WorkflowService:
    # WorkflowService also spans modules (NOI + ITR + NCR) and reads via
    # SQLAlchemy relationships, so it bypasses the repository layer and
    # takes the session directly.
    return WorkflowService(db)

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
