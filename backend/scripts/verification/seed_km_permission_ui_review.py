"""Add an article for UI permission review after seed_km_review.py, isolated only."""
import os
import models
from database import SessionLocal

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")

with SessionLocal() as db:
    db.add(models.KMArticle(
        id="km-permission-root", articleNo="KM-PERMISSION-001",
        title="Permission Review Article", content="<p>Read-only content remains accessible.</p>",
        category="General", status="Published", tags="review",
        created_at="2026-09-30", updated_at="2026-09-30",
    ))
    db.commit()
