"""Validate new IAM assignments without invalidating historical ownership."""
import models


def validate_new_assignee(db, data: dict, field: str, previous_id=None) -> None:
    if field not in data:
        return
    requested_id = data[field]
    # Clearing is not a new assignment. Unchanged historical IDs are retained,
    # including accounts disabled after the original assignment.
    if requested_id is None or requested_id == previous_id:
        return
    user = db.query(models.User).filter(models.User.id == requested_id).first()
    if user is None or not user.is_active:
        raise ValueError("指派對象不存在或已停用，請選擇啟用中的使用者 / Assignee is unavailable; select an active user.")
