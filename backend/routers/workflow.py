"""Q-WorkFlow endpoints (Phase 1 PR1b v3).

Exposes computed Q-WorkFlow progress data to the Dashboard card and
the standalone ``/workflow`` page. A Q-WorkFlow is a first-class
entity auto-created 1:1 with every NOI; the service computes
per-checkpoint state and a rolled-up completion percentage on the
fly. All three routes require ``NOI_VIEW`` because a Q-WorkFlow is
anchored to an NOI — if you can't see NOIs you can't meaningfully
see Q-WorkFlows.
"""

from fastapi import APIRouter, Depends

import schemas
from core.dependencies import RoleChecker, get_workflow_service
from core.perms import NOI_VIEW
from services.workflow_service import WorkflowService

router = APIRouter(
    prefix="/workflow",
    tags=["Workflow"],
    responses={404: {"description": "Not found"}},
)


@router.get("/stats", response_model=schemas.WorkflowStats)
def get_workflow_stats(
    workflow_service: WorkflowService = Depends(get_workflow_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW)),
):
    """Completion-bucket snapshot across every Q-WorkFlow. Powers the
    Dashboard card's four-bucket distribution (0-25 / 26-50 / 51-75 /
    76-100%)."""
    return workflow_service.get_stats()


@router.get("/needs-attention", response_model=list[schemas.WorkflowSummary])
def get_needs_attention(
    limit: int = 3,
    workflow_service: WorkflowService = Depends(get_workflow_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW)),
):
    """Lowest-completion non-complete Q-WorkFlows. Powers the Dashboard
    card's "Needs attention" list. Default limit is 3 to match the
    card's three-row layout."""
    return workflow_service.get_needs_attention(limit=limit)


@router.get("/", response_model=list[schemas.WorkflowSummary])
def list_workflows(
    skip: int = 0,
    limit: int = 50,
    min_completion: int | None = None,
    max_completion: int | None = None,
    vendor_id: str | None = None,
    workflow_service: WorkflowService = Depends(get_workflow_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW)),
):
    """Paginated Q-WorkFlow list for the ``/workflow`` page.
    ``min_completion`` / ``max_completion`` are inclusive percentage
    bounds (0-100) that filter on the derived completion_percent —
    unknown combinations simply yield zero rows rather than erroring."""
    return workflow_service.list_workflows(
        skip=skip,
        limit=limit,
        min_completion=min_completion,
        max_completion=max_completion,
        vendor_id=vendor_id,
    )
