"""Seed for the Login / Logout / Session-renewal / 2FA business review (2026-09-24; isolated
stack only). ISOLATED TEST ACCOUNT ONLY — never touches any real account's security settings.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_login_2fa_review.py
    node ../react-app/tests-browser/login-2fa-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>
"""
import sys, os, json
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core.security import get_password_hash

PW = "Accept-Test-1234"
d = database.SessionLocal()

d.add(models.User(username="login_2fa_reviewer", email="login2fa@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), full_name="Login 2FA Reviewer"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
