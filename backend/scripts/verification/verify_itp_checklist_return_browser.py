"""Real-browser check for ITP-CHECKLIST-RETURN-2026-001 against the isolated stack (port 3291).

Usage: python verify_itp_checklist_return_browser.py <seed-json> <screenshot-dir>
Each scenario prints PASS/FAIL with the observed URL; exit code 1 if any scenario fails.
"""
import json, sys, re
from pathlib import Path
from playwright.sync_api import sync_playwright

seed = json.loads(sys.argv[1])
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:3291"
REF_A, REF_B, CHK = "QTS-RKS-RRC-ITP-000001", "QTS-RKS-RRC-ITP-000002", seed["chk"]
results = []


def check(name, ok, detail):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + " | " + detail, flush=True)


def modal_ref(page):
    """Reference no. shown in the open Edit ITP window, or None when no window is open."""
    if page.get_by_text("Edit ITP").count() == 0:
        return None
    # General tab: the read-only Reference no. input. Inspection Plan tab: the plan header, which is
    # inside the window's body (scoped so the list rows behind the window do not count).
    body = page.locator('[class*="modalBody"]')
    for ref in (REF_A, REF_B):
        if page.locator(f"input[value='{ref}']").count() > 0 or body.get_by_text(ref, exact=True).count() > 0:
            return ref
    return "open-unknown"


def active_tab(page):
    """'plan' when the Inspection Plan table is showing, 'general' when ITP Information is."""
    if page.get_by_text("BEFORE CONSTRUCTION", exact=False).count() > 0:
        return "plan"
    if page.get_by_text("ITP Information", exact=True).count() > 0:
        return "general"
    return None


def open_itp_a_plan(page):
    page.goto(f"{BASE}/itp")
    page.get_by_text(REF_A, exact=True).first.click()
    page.get_by_text("Edit ITP").wait_for()
    page.get_by_role("button", name=re.compile(r"^Inspection Plan")).click()
    page.wait_for_timeout(400)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_default_timeout(15000)
    page.add_init_script("localStorage.setItem('language','en')")
    page.goto(f"{BASE}/login")
    page.fill("#email", "return_review")
    page.fill("#password", "Accept-Test-1234")
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/login" not in u)

    # 1. Records link -> Checklist -> Cancel/Back -> same ITP window; closing it stays on the list.
    open_itp_a_plan(page)
    page.get_by_role("button", name=CHK).first.click()
    page.wait_for_url(re.compile(r"/checklist"))
    page.wait_for_timeout(800)
    url_chk = page.url
    check("1a link carries source ITP", f"returnItp={seed['itp_a']}" in url_chk, url_chk)
    page.screenshot(path=str(out / "1-checklist-from-itp.png"))
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_url(re.compile(r"/itp"))
    page.get_by_text("Edit ITP").wait_for()
    page.wait_for_timeout(600)
    check("1b back reopens ITP-A window", modal_ref(page) == REF_A, f"url={page.url} modal={modal_ref(page)}")
    check("1c reopen param removed from URL", "reopenItp" not in page.url, page.url)
    check("1e reopened on Inspection Plan tab", active_tab(page) == "plan", f"tab={active_tab(page)}")
    page.screenshot(path=str(out / "2-back-reopened-itp-a.png"))
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(800)
    check("1d closing reopened window stays on ITP list",
          page.url.rstrip("/").endswith("/itp") and modal_ref(page) is None, f"url={page.url} modal={modal_ref(page)}")
    page.screenshot(path=str(out / "3-closed-stays-on-list.png"))

    # 2. Regression: an ?openId= deep link still closes back to where the user came from.
    page.goto(f"{BASE}/checklist")
    page.wait_for_timeout(500)
    page.goto(f"{BASE}/itp?openId={REF_B}")
    page.get_by_text("Edit ITP").wait_for()
    page.wait_for_timeout(500)
    opened_b = modal_ref(page)
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(1000)
    check("2 openId deep link unchanged (opens B, close goes back)",
          opened_b == REF_B and "/checklist" in page.url, f"opened={opened_b} after-close url={page.url}")

    # 3. Old link shape (from=itp without returnItp) keeps history-back behaviour.
    page.goto(f"{BASE}/itp")
    page.wait_for_timeout(500)
    page.goto(f"{BASE}/checklist?openId={CHK}&from=itp")
    page.wait_for_timeout(1000)
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(1000)
    check("3 legacy from=itp link still goes history-back",
          page.url.rstrip("/").endswith("/itp") and modal_ref(page) is None, f"url={page.url} modal={modal_ref(page)}")

    # 4. Generate Checklist -> new template -> Cancel/Back -> ITP-A window again.
    open_itp_a_plan(page)
    page.get_by_role("button", name="Generate Checklist").click()
    page.wait_for_url(re.compile(r"/checklist"))
    page.wait_for_timeout(1000)
    check("4a generate link carries source ITP", f"returnItp={seed['itp_a']}" in page.url, page.url)
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_url(re.compile(r"/itp"))
    page.get_by_text("Edit ITP").wait_for()
    page.wait_for_timeout(600)
    check("4b back after Generate reopens ITP-A", modal_ref(page) == REF_A, f"url={page.url} modal={modal_ref(page)}")
    check("4c reopened on Inspection Plan tab", active_tab(page) == "plan", f"tab={active_tab(page)}")
    page.screenshot(path=str(out / "4-generate-back.png"))
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(600)

    # 6. Regression: right after a reopen, a normal row click and Add New still start on General.
    page.get_by_text(REF_B, exact=True).first.click()
    page.get_by_text("Edit ITP").wait_for()
    page.wait_for_timeout(500)
    check("6a row click opens General tab", active_tab(page) == "general" and modal_ref(page) == REF_B,
          f"tab={active_tab(page)} modal={modal_ref(page)}")
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(600)
    page.get_by_text("+ Add ITP").click()
    page.wait_for_timeout(800)
    check("6b Add New opens General tab", active_tab(page) == "general", f"tab={active_tab(page)}")
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(600)

    # 5. Unknown id: no window, a notice instead of silently showing the list.
    page.goto(f"{BASE}/itp?reopenItp=does-not-exist")
    page.wait_for_timeout(1500)
    toast = page.get_by_text("The ITP you came from is not in the current list", exact=False).count() > 0
    check("5 unknown reopen id -> notice, no window", toast and modal_ref(page) is None, f"toast={toast} url={page.url}")
    page.screenshot(path=str(out / "5-unknown-id.png"))
    browser.close()

sys.exit(0 if all(results) else 1)
